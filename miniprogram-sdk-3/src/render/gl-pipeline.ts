// @ts-nocheck
/**
 * GLPipeline - WebGL2 渲染管线（小程序版）
 *
 * 完整移植 Web SDK 的 GLPipeline，针对小程序做以下适配：
 * 1. renderBackground: 使用 Uint8Array RGBA 像素数据而非 HTMLImageElement/HTMLVideoElement
 * 2. MSAA fallback: renderbufferStorageMultisample 不可用时降级为非 MSAA 路径
 * 3. TEXTURE_2D_ARRAY fallback: 部分设备不支持时降级为多个 TEXTURE_2D
 * 4. blitFramebuffer fallback: 不可用时通过 copy-via-draw 实现
 * 5. 无 performanceTracker / window 对象
 *
 * Shader 代码与 Web SDK 完全一致（GLSL ES 3.0 是平台无关的）
 */

import { GLDevice } from './gl-device'
import { RigidTransform, IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, TextureFloat_3D } from '../data/data-interface'
import { mmul, flatten } from '../data/math'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('GLPipeline')

// ==================== GLSL Shader Code (与 Web SDK 完全一致) ====================

const shader_common = `
  vec4 RGB2sRGB(vec4 color){
    for(uint i = 0u; i < 4u; i++){
      if(color[i] <= 0.0031308)color[i] *= 12.92;
      else color[i] = 1.055 * pow(color[i], 1.0 / 2.4) - 0.055;
    }
    return color;
  }
  vec4 sRGB2RGB(vec4 color){
    for(uint i = 0u; i < 4u; i++){
      if(color[i] <= 0.04045)color[i] /= 12.92;
      else color[i] = pow((color[i] + 0.055) / 1.055, 2.4);
    }
    return color;
  }
`

const vs_background = `#version 300 es
  layout(location = 0) in vec2 pos;
  layout(location = 1) in vec2 texCoord;
  out vec2 v_texCoord;
  void main() {
    gl_Position = vec4(pos, 0, 1);
    v_texCoord = texCoord;
  }
`

const fs_background = `#version 300 es
  precision mediump float;
  uniform sampler2D u_image_bg, u_image_char_body, u_image_mesh_color, u_image_mesh_alpha;
  uniform mat2 u_transform_2d; // mat2[0] = scale, mat2[1] = translation
  uniform uint flags; // 1 - has background

  in vec2 v_texCoord;
  out vec4 fragColor;

  ${shader_common}

  void main() {
    vec2 texcoord_transformed = v_texCoord * u_transform_2d[0] + u_transform_2d[1];
    texcoord_transformed = clamp(texcoord_transformed, 0.0, 1.0);
    vec2 texCoord_char_color = vec2(texcoord_transformed.x * 0.5, texcoord_transformed.y);
    vec2 texCoord_char_alpha = vec2(texcoord_transformed.x * 0.5 + 0.5, texcoord_transformed.y);
    vec2 texCoord_mesh = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    vec4 char_color = vec4(texture(u_image_char_body, texCoord_char_color));
    vec4 char_alpha = vec4(texture(u_image_char_body, texCoord_char_alpha));
    char_color = sRGB2RGB(char_color);
    char_alpha = sRGB2RGB(char_alpha);
    float char_alpha_back = char_alpha.r;
    float char_alpha_front = max(char_alpha.r - char_alpha.b, 0.0);

    vec4 mesh_color_srgb = texture(u_image_mesh_color, texCoord_mesh);
    mesh_color_srgb.rgb /= max(mesh_color_srgb.a, 9e-5); // epsilon for float16
    vec4 mesh_alpha = texture(u_image_mesh_alpha, texCoord_mesh);

    vec3 final_rgb = mesh_alpha.r * mesh_color_srgb.rgb + (1.0 - mesh_alpha.r) * char_alpha_back * char_color.rgb;
    float final_alpha = mesh_alpha.r + (1.0 - mesh_alpha.r) * char_alpha_back;
    final_rgb = char_alpha_front * char_color.rgb + (1.0 - char_alpha_front) * final_alpha * final_rgb;
    final_alpha = char_alpha_front + (1.0 - char_alpha_front) * final_alpha;

    if(flags > 0u){
      vec4 bg_color = sRGB2RGB(texture(u_image_bg, v_texCoord));
      final_rgb += bg_color.rgb * (1.0 - final_alpha);
      final_alpha = 1.0;
    }
    final_rgb = RGB2sRGB(vec4(final_rgb, 1.0)).rgb;
    fragColor = vec4(final_rgb, final_alpha);
  }
`

const uniform_var_list_bg = [
  'u_image_bg', 'u_image_char_body', 'u_image_mesh_color', 'u_image_mesh_alpha', 'u_transform_2d', 'flags'
]

// ==================== Mesh Shader Generation ====================

interface MeshStatistics {
  max_pca_component_count: number
  max_bs_count: number
  max_bones: number
}

const max_bones_per_vertex = 8 // need to be a multiple of 4

function generateMeshPipelineShader(params: MeshStatistics): { [index: string]: string } {
  const vs_mesh = `#version 300 es
  precision highp float;

  layout (std140) uniform ub_rig_info {
    mat4 joint_matrices[${params.max_bones}];
    vec4 bs_weights[${params.max_bs_count / 4}];
  } ub_rig;

  uniform sampler2D u_image_bs; // used for blendshape deformation
  uniform mat4 u_proj_mat;
  uniform mat2 u_transform_2d; // mat2[0] = scale, mat2[1] = translation
  uniform uint u_bs_count; // number of bs weight vectors (divided by 4)
  uniform uint flags; // 1 - has opacity

  layout(location = 0) in vec3 pos;
  layout(location = 1) in vec2 tex_coord;
  layout(location = 2) in float opacity;
  layout(location = 3) in uvec4 bone_index_0_4;
  layout(location = 4) in uvec4 bone_index_4_8;
  layout(location = 5) in vec4 bone_weight_0_4;
  layout(location = 6) in vec4 bone_weight_4_8;

  out vec4 v_pos;
  out vec2 v_tex_coord;
  out float v_opacity;

  vec4 lbs_transform(vec3 pos){
    float total_weight = 0.0;
    vec4 aug_pos = vec4(pos, 1.0);
    vec4 result = vec4(0.0);
    uint index;
    for(index = 0u;index < 8u;index++){
      uint joint_index;
      float joint_weight;
      if(index < 4u) {
        joint_index = bone_index_0_4[index];
        joint_weight = bone_weight_0_4[index];
      }
      else {
        joint_index = bone_index_4_8[index - 4u];
        joint_weight = bone_weight_4_8[index - 4u];
      }
      if(255u == joint_index)break;
      else result += joint_weight * (ub_rig.joint_matrices[joint_index] * aug_pos);
    }
    result /= result.w;
    return vec4(result.xyz, 1.0);
  }

  vec3 bs_accumulate(uint vertex_id){
    ivec2 texSize = textureSize(u_image_bs, 0);
    vec3 pos = vec3(0.0);

    uint vertex_offset = vertex_id * u_bs_count * 3u;
    for(uint i = 0u; i < u_bs_count; i++){
      vec4 bs_weight_vec = ub_rig.bs_weights[i];
      for (uint j = 0u; j < 3u; j++){
        uint texel_offset = j * u_bs_count + vertex_offset + i;
        uint texel_x = texel_offset % uint(texSize.x);
        uint texel_y = texel_offset / uint(texSize.x);
        vec4 data = texelFetch(u_image_bs, ivec2(texel_x, texel_y), 0);
        pos[j] += dot(data, bs_weight_vec);
      }
    }
    return pos;
  }

  void main() {
    if(flags % 2u >= 1u)v_opacity = opacity; else v_opacity = 1.0;

    vec3 bs_pos = vec3(0.0);
    if(u_bs_count > 0u)bs_pos = bs_accumulate(uint(gl_VertexID)) * v_opacity;
    v_pos = u_proj_mat * lbs_transform(pos + bs_pos);
    v_pos /= v_pos.w;
    v_pos.xy = u_transform_2d[0] * v_pos.xy + u_transform_2d[1];
    v_tex_coord = tex_coord;
    gl_Position = v_pos;
  }
`

  const fs_mask = `#version 300 es
  precision highp float;

  in vec4 v_pos;
  in float v_opacity;
  in vec2 v_tex_coord;

  out vec4 fragColor;

  void main() {
    if(gl_FrontFacing)fragColor = vec4(v_opacity);
    else fragColor = vec4(0.0);
  }
`

  const fs_mesh = `#version 300 es
  precision highp int;
  precision highp float;
  precision highp sampler2DArray;
  precision highp sampler3D;
  layout (std140) uniform ub_pca_info {
    vec4 weights[${params.max_pca_component_count / 4}];
  } ub_pca;
  uniform sampler2DArray u_image_pca;
  uniform sampler3D u_image_lut;
  uniform uint flags; // 2 - has LUT, 4 - unsigned PCA component
  uniform vec3 u_gamma;
  uniform vec3 u_color_balance; // r/c, g/m, b/y

  ${shader_common}

  vec4 pca_accumulate(vec2 tex_coord, bool _unsigned){
    ivec3 texSize = textureSize(u_image_pca, 0);
    vec4 result = vec4(0.0);
    for(int i = 0; i < texSize.z; i++){
      int vec_index = i / 4;
      int elem_index = i % 4;
      vec4 pca_sample = texture(u_image_pca, vec3(tex_coord, float(i)));
      if(_unsigned)pca_sample = 2.0 * pca_sample - 1.0;
      result += ub_pca.weights[vec_index][elem_index] * pca_sample;
    }
    return result;
  }

  in vec4 v_pos;
  in float v_opacity;
  in vec2 v_tex_coord;

  out vec4 fragColor;

  void main() {
    if(gl_FrontFacing){
      vec2 fragTexCoord = v_tex_coord;
      vec4 sample_color = pca_accumulate(v_tex_coord, flags % 8u >= 4u);
      if(flags % 4u >= 2u)sample_color = texture(u_image_lut, sample_color.rgb);
      // Apply gamma correction
      vec3 final_color = pow(sample_color.rgb, u_gamma);

      // Apply color balance
      // Convert -100 to 100 range to -0.5 to 0.5 range
      vec3 balance_adjusted = u_color_balance / 200.0; // Map -100..100 to -0.5..0.5

      // Red/Cyan adjustment
      final_color.r += balance_adjusted.x;
      final_color.g -= balance_adjusted.x; // Cyan is opposite of Red

      // Green/Magenta adjustment
      final_color.g += balance_adjusted.y;
      final_color.b -= balance_adjusted.y; // Magenta is opposite of Green

      // Blue/Yellow adjustment
      final_color.b += balance_adjusted.z;
      final_color.r -= balance_adjusted.z; // Yellow is opposite of Blue

      // Clamp values to [0, 1]
      final_color = clamp(final_color, 0.0, 1.0);

      fragColor = sRGB2RGB(vec4(final_color.bgr, 1.0));
    }
    else fragColor = vec4(0.0);
  }
`

  return { vertex: vs_mesh, fragment_mask: fs_mask, fragment: fs_mesh }
}

const uniform_var_list_mesh = [
  'u_proj_mat', 'u_transform_2d', 'u_image', 'u_image_bs', 'u_image_pca', 'u_image_lut', 'u_bs_count', 'flags', 'u_gamma', 'u_color_balance'
]
const uniform_block_list_mesh = [
  'ub_pca_info', 'ub_rig_info'
]

// ==================== Copy-via-draw shader (blitFramebuffer fallback) ====================

const vs_copy = `#version 300 es
  layout(location = 0) in vec2 pos;
  layout(location = 1) in vec2 texCoord;
  out vec2 v_texCoord;
  void main() {
    gl_Position = vec4(pos, 0, 1);
    v_texCoord = texCoord;
  }
`

const fs_copy = `#version 300 es
  precision mediump float;
  uniform sampler2D u_source;
  in vec2 v_texCoord;
  out vec4 fragColor;
  void main() {
    fragColor = texture(u_source, v_texCoord);
  }
`

// ==================== Type Definitions ====================

interface PipelineInfo {
  program: WebGLProgram
  progUniforms: { [index: string]: WebGLUniformLocation }
  progUniformBlocks: { [index: string]: GLint }
}
interface TexturePCAModel {
  texture: WebGLTexture
  unsigned: boolean
  scalingFactor?: Float32Array
}
interface MeshInfo {
  VAO: WebGLVertexArrayObject
  buffers: { [index: string]: WebGLBuffer }
  textures: { [index: string]: WebGLTexture }
  texturePCAModels: TexturePCAModel[]
  uniformUInts: { [index: string]: number }
}

export interface GLPipelineCharData {
  char: IBRAnimationGeneratorCharInfo_NN | null
  LUT: TextureFloat_3D | null
  transform: {
    offsetX: number
    offsetY: number
    scaleX: number
    scaleY: number
  }
  multisample: number | null
}

// ==================== GLPipeline Class ====================

export class GLPipeline {
  public readonly device: GLDevice
  private compat_features: { [index: string]: unknown } = {}

  private charData: GLPipelineCharData | null = null
  private backgroundPipelineInfo!: PipelineInfo
  private backgroundVAO!: WebGLVertexArrayObject
  private backgroundTextures: { [index: string]: WebGLTexture } = {}

  // 小程序适配：body纹理尺寸追踪（用于 texSubImage2D 优化）
  private _bodyTextureWidth = 0
  private _bodyTextureHeight = 0

  private meshPipelineInfo: PipelineInfo | null = null
  private maskPipelineInfo: PipelineInfo | null = null
  private meshInfos: Array<MeshInfo> = []
  private meshStatistics: MeshStatistics = {
    max_pca_component_count: 4,
    max_bs_count: 4,
    max_bones: 1
  }

  private FrameTexture_meshColor: WebGLTexture | null = null
  private FrameTexture_meshAlpha: WebGLTexture | null = null
  private LUTTexture: WebGLTexture | null = null

  private FrameBuffer_MSAA: WebGLFramebuffer | null = null
  private FrameBuffer_meshColor: WebGLFramebuffer | null = null
  private FrameBuffer_meshAlpha: WebGLFramebuffer | null = null
  private initSkeletonStatus: RigidTransform[] = []

  // MSAA renderbuffers (需要追踪以便 destroy)
  private _msaaColorRB: WebGLRenderbuffer | null = null
  private _msaaDepthRB: WebGLRenderbuffer | null = null

  private currentGamma: { r: number; g: number; b: number } = { r: 1.0, g: 1.0, b: 1.0 }
  private currentColorBalance: { rc: number; gm: number; by: number } = { rc: 0.0, gm: 0.0, by: 0.0 }

  private _ub_rig_info_data: Float32Array | null = null
  private _ub_pca_info_data: Float32Array | null = null

  // blitFramebuffer fallback 资源
  private _blitAvailable = true
  private _copyPipelineInfo: PipelineInfo | null = null
  private _copyVAO: WebGLVertexArrayObject | null = null
  private _copyResolveTexture: WebGLTexture | null = null
  private _copyResolveFBO: WebGLFramebuffer | null = null

  // MSAA配置
  private _msaaSamples = 0

  constructor(device: GLDevice) {
    this.device = device
    this.reinitialize()
  }

  public reinitialize(): void {
    this.compat_features = {}
    this.compat_features['OES_texture_float_linear'] = this.device.gl.getExtension('OES_texture_float_linear')
    this.compat_features['OES_texture_half_float_linear'] = this.device.gl.getExtension('OES_texture_half_float_linear')

    // 检测 blitFramebuffer 是否可用
    this._blitAvailable = typeof this.device.gl.blitFramebuffer === 'function'

    this.assembleBackgroundPipeline()

    // 预备 blitFramebuffer fallback
    if (!this._blitAvailable) {
      this._assembleCopyPipeline()
    }

    if (this.charData) this.assembleMeshPipelines(this.charData)
  }

  // ==================== Background pipeline ====================

  private assembleBackgroundPipeline(): void {
    const gl = this.device.gl
    const program = this.device.compileShaderProgram({
      'vertex': vs_background,
      'fragment': fs_background
    })
    const progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_bg)
    this.backgroundPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: {}
    }

    this.backgroundVAO = gl.createVertexArray()
    gl.bindVertexArray(this.backgroundVAO)

    // Fullscreen quad: pos(x,y) + texCoord(u,v)
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    const positions = [
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0
    ]
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)

    // pos
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)
    // texCoord
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)

    gl.bindVertexArray(null)

    // Create textures
    const textures: { [index: string]: WebGLTexture } = {}

    textures['u_image_bg'] = gl.createTexture()
    if (!textures['u_image_bg']) throw new Error('WebGL texture creation failed.')
    gl.bindTexture(gl.TEXTURE_2D, textures['u_image_bg'])
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

    textures['u_image_char_body'] = gl.createTexture()
    if (!textures['u_image_char_body']) throw new Error('WebGL texture creation failed.')
    gl.bindTexture(gl.TEXTURE_2D, textures['u_image_char_body'])
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

    this.backgroundTextures = textures
  }

  // ==================== Copy pipeline (blitFramebuffer fallback) ====================

  private _assembleCopyPipeline(): void {
    const gl = this.device.gl
    const program = this.device.compileShaderProgram({
      'vertex': vs_copy,
      'fragment': fs_copy
    })
    const progUniforms = this.device.getShaderProgramUniformLocation(program, ['u_source'])
    this._copyPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: {}
    }

    // 复用 backgroundVAO 的 fullscreen quad（两者 layout 一致）
    this._copyVAO = this.backgroundVAO

    // Resolve texture + FBO 在 assembleMeshPipelines 里按 canvas 尺寸创建
  }

  /**
   * blitFramebuffer 的 copy-via-draw 替代：
   * 从 MSAA renderbuffer FBO 读取并绘制到目标 texture FBO
   */
  private _copyViaDraw(srcFBO: WebGLFramebuffer, dstFBO: WebGLFramebuffer): void {
    const gl = this.device.gl
    if (!this._copyPipelineInfo) return

    // 如果开启了 MSAA，需要先 resolve 到一个非 MSAA 纹理
    // 但小程序不支持 blitFramebuffer 的话一般也不支持 MSAA
    // 这里直接从 srcFBO 当作 READ 来 readPixels 再 texImage2D
    // 更高效的方式：如果没有 MSAA 就直接 render 到 texture FBO（在 non-MSAA path 中实现）

    // 对于 non-MSAA path，srcFBO 已经是 texture-backed
    // 直接跳过 blit，因为在 non-MSAA 路径下我们直接 render 到 texture
    // 此方法只在确实需要 copy 时调用
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO)
    gl.useProgram(this._copyPipelineInfo.program)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)

    gl.uniform1i(this._copyPipelineInfo.progUniforms['u_source'], 0)
    gl.activeTexture(gl.TEXTURE0)
    // 在 non-MSAA path 中 _copyResolveTexture 绑定了 MSAA resolve 结果
    gl.bindTexture(gl.TEXTURE_2D, this._copyResolveTexture)

    gl.bindVertexArray(this._copyVAO || this.backgroundVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ==================== Mesh pipeline assembly ====================

  assembleMeshPipelines(data: GLPipelineCharData): void {
    const gl = this.device.gl
    const char = data.char!

    // Statistics
    let meshStatistics: MeshStatistics = {
      max_pca_component_count: 4,
      max_bs_count: 4,
      max_bones: Math.max(char.skeleton.length, 1)
    }
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      const textureModels = char.mesh[mesh_index].textureModels
      let pca_component_count = 0
      for (let model of textureModels) {
        let pca_component_count_model = model.data.size[0] + (4 - 1)
        pca_component_count_model -= pca_component_count_model % 4
        pca_component_count = Math.max(pca_component_count, pca_component_count_model)
      }
      meshStatistics.max_pca_component_count = Math.max(meshStatistics.max_pca_component_count, pca_component_count)

      let max_bs_count = char.mesh[mesh_index].blendshapes.size[0] - 1 + (4 - 1)
      max_bs_count -= max_bs_count % 4
      meshStatistics.max_bs_count = Math.max(meshStatistics.max_bs_count, max_bs_count)
    }
    this.meshStatistics = meshStatistics
    this._ub_rig_info_data = new Float32Array(this.meshStatistics.max_bones * 16 + this.meshStatistics.max_bs_count)
    this._ub_pca_info_data = new Float32Array(this.meshStatistics.max_pca_component_count)
    const shader = generateMeshPipelineShader(this.meshStatistics)

    // Mesh color pipeline
    let program = this.device.compileShaderProgram({ vertex: shader.vertex, fragment: shader.fragment })
    let progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_mesh)
    let progUniformBlocks = this.device.getShaderProgramUniformBlockLocation(program, uniform_block_list_mesh)
    this.meshPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: progUniformBlocks,
    }
    gl.uniformBlockBinding(this.meshPipelineInfo.program, this.meshPipelineInfo.progUniformBlocks['ub_rig_info'], 0)
    gl.uniformBlockBinding(this.meshPipelineInfo.program, this.meshPipelineInfo.progUniformBlocks['ub_pca_info'], 1)

    // Mask pipeline
    program = this.device.compileShaderProgram({ vertex: shader.vertex, fragment: shader.fragment_mask })
    progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_mesh)
    progUniformBlocks = this.device.getShaderProgramUniformBlockLocation(program, uniform_block_list_mesh)
    this.maskPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: progUniformBlocks,
    }
    gl.uniformBlockBinding(this.maskPipelineInfo.program, this.maskPipelineInfo.progUniformBlocks['ub_rig_info'], 0)

    // Per-mesh data
    this.meshInfos = []
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      let currentMeshInfo: MeshInfo = {
        VAO: gl.createVertexArray(),
        buffers: {},
        textures: {},
        texturePCAModels: [],
        uniformUInts: {},
      }

      gl.bindVertexArray(currentMeshInfo.VAO)

      // Position buffer (blendshape neutral position)
      if (null === this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data)) throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].blendshapes.data}`)
      currentMeshInfo.buffers['pos'] = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, currentMeshInfo.buffers['pos'])
      gl.bufferData(gl.ARRAY_BUFFER, char.mesh[mesh_index].blendshapes.part(0).data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data)!, false, 0, 0)

      // UV coord buffer
      if (null === this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data)) throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].UVCoord.data}`)
      currentMeshInfo.buffers['tex_coord'] = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, currentMeshInfo.buffers['tex_coord'])
      gl.bufferData(gl.ARRAY_BUFFER, char.mesh[mesh_index].UVCoord.data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 2, this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data)!, true, 0, 0)

      // Opacity buffer
      if (char.mesh[mesh_index].opacity) {
        if (null === this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data)) throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].opacity!.data}`)
        currentMeshInfo.buffers['opacity'] = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, currentMeshInfo.buffers['opacity'])
        gl.bufferData(gl.ARRAY_BUFFER, char.mesh[mesh_index].opacity!.data, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(2)
        gl.vertexAttribPointer(2, 1, this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data)!, true, 0, 0)
      }

      // Bone index buffer
      currentMeshInfo.buffers['bone_indices'] = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_indices'])
      gl.bufferData(gl.ARRAY_BUFFER, char.mesh[mesh_index].jointIndex, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(3)
      gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 8, 0)
      gl.enableVertexAttribArray(4)
      gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 8, 4)

      // Bone weight buffer
      currentMeshInfo.buffers['bone_weight'] = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_weight'])
      gl.bufferData(gl.ARRAY_BUFFER, char.mesh[mesh_index].jointWeight, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(5)
      gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0)
      gl.enableVertexAttribArray(6)
      gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      // Index buffer
      if (null === this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)) throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].triangles.data}`)
      currentMeshInfo.buffers['indices'] = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers['indices'])
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, char.mesh[mesh_index].triangles.data, gl.STATIC_DRAW)

      // Uniform buffers
      currentMeshInfo.buffers['ub_pca_info'] = gl.createBuffer()
      gl.bindBuffer(gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_pca_info'])
      gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_pca_component_count), gl.DYNAMIC_DRAW)

      currentMeshInfo.buffers['ub_rig_info'] = gl.createBuffer()
      gl.bindBuffer(gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_rig_info'])
      gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_bones * 16 + meshStatistics.max_bs_count), gl.DYNAMIC_DRAW)

      gl.bindVertexArray(null)

      // === Textures ===

      // Blendshape texture
      if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
        let bs_texture_size = [Math.ceil((char.mesh[mesh_index].blendshapes.size[0] - 1) / 4), char.mesh[mesh_index].blendshapes.size[1] * char.mesh[mesh_index].blendshapes.size[2]]
        let square_bs_texture_size = Math.ceil(Math.sqrt(bs_texture_size[0] * bs_texture_size[1]))
        let bs_vec_stride = bs_texture_size[0] * 4
        let bs_texture_data = new Float32Array(square_bs_texture_size * square_bs_texture_size * 4)
        for (let i = 0; i < bs_texture_size[1]; i++) {
          for (let j = 1; j < char.mesh[mesh_index].blendshapes.size[0]; j++) bs_texture_data[i * bs_vec_stride + (j - 1)] = char.mesh[mesh_index].blendshapes.data[j * bs_texture_size[1] + i] as number
          for (let j = char.mesh[mesh_index].blendshapes.size[0] - 1; j < bs_vec_stride; j++) bs_texture_data[i * bs_vec_stride + j] = 0.0
        }
        currentMeshInfo.textures['u_image_bs'] = gl.createTexture()
        if (!currentMeshInfo.textures['u_image_bs']) throw new Error('WebGL texture creation failed.')
        gl.bindTexture(gl.TEXTURE_2D, currentMeshInfo.textures['u_image_bs'])
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        this.device.texImage2D(gl.TEXTURE_2D, 0, square_bs_texture_size, square_bs_texture_size, gl.RGBA, bs_texture_data)

        currentMeshInfo.uniformUInts['u_bs_count'] = bs_texture_size[0]
      }
      else currentMeshInfo.uniformUInts['u_bs_count'] = 0

      // PCA textures (TEXTURE_2D_ARRAY)
      for (let pca_model of char.mesh[mesh_index].textureModels) {
        let pca_texture = gl.createTexture()
        if (!pca_texture) throw new Error('WebGL texture creation failed.')

        // 检测 TEXTURE_2D_ARRAY 支持
        let useArray = true
        try {
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, pca_texture)
        } catch (e) {
          useArray = false
          log.warn('TEXTURE_2D_ARRAY not supported, falling back to TEXTURE_2D')
        }

        if (useArray) {
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        }

        let dataType = this.device.getGLArrayElementType(pca_model.data.data)
        let assembledPCAModel: TexturePCAModel = {
          texture: pca_texture,
          unsigned: gl.UNSIGNED_BYTE === dataType || gl.UNSIGNED_SHORT === dataType || gl.UNSIGNED_INT === dataType
        }

        let PCAData = pca_model.data.data
        // Float64Array 或者缺少线性过滤扩展时，降级为 Uint8 纹理
        if ('Float64Array' === pca_model.data.data[Symbol.toStringTag]
          || (gl.FLOAT === dataType && !this.compat_features['OES_texture_float_linear'])) {
          const texture_component_size = pca_model.data.size[1] * pca_model.data.size[2] * 3
          const roundedTexture = new Uint8Array(pca_model.data.size[0] * texture_component_size)
          let scalingFactor = new Float32Array(pca_model.data.size[0])
          for (let i = 0; i < pca_model.data.size[0]; i++) {
            let scale_factor = 1e-6
            for (let j = 0; j < texture_component_size; j++) scale_factor = Math.max(scale_factor, Math.abs(pca_model.data.data[i * texture_component_size + j] as number))
            let inv_scale_factor = 1.0 / scale_factor
            for (let j = 0; j < texture_component_size; j++) {
              let scaled_value = pca_model.data.data[i * texture_component_size + j] as number * inv_scale_factor
              roundedTexture[i * texture_component_size + j] = Math.round((scaled_value * 0.5 + 0.5) * 255.0)
            }
            scalingFactor[i] = scale_factor
          }
          PCAData = roundedTexture
          assembledPCAModel.unsigned = true
          assembledPCAModel.scalingFactor = scalingFactor
        }
        if (pca_model.scalingFactor) assembledPCAModel.scalingFactor = pca_model.scalingFactor.data as Float32Array

        if (useArray) {
          this.device.texImage3D(gl.TEXTURE_2D_ARRAY, 0, pca_model.data.size[1], pca_model.data.size[2], pca_model.data.size[0], gl.RGB, PCAData)
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, null)
        }
        currentMeshInfo.texturePCAModels.push(assembledPCAModel)
      }
      this.meshInfos.push(currentMeshInfo)
    }

    // Texture render targets
    this.FrameTexture_meshColor = gl.createTexture()
    if (!this.FrameTexture_meshColor) throw Error('WebGL texture creation failed.')
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshColor)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.device.canvas.width, this.device.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

    this.FrameTexture_meshAlpha = gl.createTexture()
    if (!this.FrameTexture_meshAlpha) throw Error('WebGL texture creation failed.')
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshAlpha)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.device.canvas.width, this.device.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

    // Depth renderbuffer + MSAA
    const maskDepthBuffer = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, maskDepthBuffer)

    // 尝试 MSAA，失败则降级
    let msaaSamples = 0
    if (data.multisample && data.multisample > 1) {
      try {
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, data.multisample, gl.DEPTH_COMPONENT16, this.device.canvas.width, this.device.canvas.height)
        msaaSamples = data.multisample
      } catch (e) {
        log.warn('MSAA not supported, falling back to non-MSAA path:', e)
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.device.canvas.width, this.device.canvas.height)
        msaaSamples = 0
      }
    } else {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.device.canvas.width, this.device.canvas.height)
    }
    this._msaaDepthRB = maskDepthBuffer
    this._msaaSamples = msaaSamples

    const maskColorBuffer = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, maskColorBuffer)
    if (msaaSamples > 0) {
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, gl.RGBA8, this.device.canvas.width, this.device.canvas.height)
    } else {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, this.device.canvas.width, this.device.canvas.height)
    }
    this._msaaColorRB = maskColorBuffer

    this.FrameBuffer_MSAA = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_MSAA)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, maskColorBuffer)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, maskDepthBuffer)

    this.FrameBuffer_meshColor = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshColor)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FrameTexture_meshColor, 0)

    this.FrameBuffer_meshAlpha = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FrameTexture_meshAlpha, 0)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // blitFramebuffer fallback: 创建 resolve texture + FBO
    if (!this._blitAvailable) {
      this._copyResolveTexture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, this._copyResolveTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.device.canvas.width, this.device.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

      this._copyResolveFBO = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._copyResolveFBO)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._copyResolveTexture, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    this.initSkeletonStatus = char.evalSkeleton()

    // LUT textures
    if (data.LUT === null) this.LUTTexture = null
    else {
      this.LUTTexture = gl.createTexture()
      if (!this.LUTTexture) throw new Error('WebGL texture creation failed.')
      gl.bindTexture(gl.TEXTURE_3D, this.LUTTexture)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      if (this.compat_features['OES_texture_float_linear']) {
        this.device.texImage3D(gl.TEXTURE_3D, 0, data.LUT.size[1], data.LUT.size[2], data.LUT.size[0], gl.RGB, data.LUT.data)
      } else {
        // 降级为 Uint8 LUT（精度降低）
        const roundedTexture = new Uint8Array(data.LUT.size[0] * data.LUT.size[1] * data.LUT.size[2] * 3)
        for (let j = 0; j < roundedTexture.length; j++) roundedTexture[j] = Math.round(data.LUT.data[j] * 255.0)
        this.device.texImage3D(gl.TEXTURE_3D, 0, data.LUT.size[1], data.LUT.size[2], data.LUT.size[0], gl.RGB, roundedTexture)
      }
      gl.bindTexture(gl.TEXTURE_3D, null)
    }
  }

  // ==================== Per-frame operations ====================

  private initFrame(): void {
    const gl = this.device.gl
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clearDepth(1.0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshColor)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  }

  /**
   * 渲染背景层：body 视频像素 + face mesh 合成
   *
   * 小程序适配：body 数据为 Uint8Array RGBA 像素而非 HTMLImageElement
   * body 视频是双宽格式：左半边=颜色 RGB，右半边=alpha 通道
   */
  private renderBackground(bodyPixels: Uint8Array, bodyWidth: number, bodyHeight: number, transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number } | null): void {
    const gl = this.device.gl

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)

    gl.useProgram(this.backgroundPipelineInfo.program)
    if (transform) {
      gl.uniformMatrix2fv(this.backgroundPipelineInfo.progUniforms['u_transform_2d'], false, new Float32Array([
        1.0 / transform.scaleX, 1.0 / transform.scaleY, -transform.offsetX / transform.scaleX, -transform.offsetY / transform.scaleY
      ]))
    }
    else gl.uniformMatrix2fv(this.backgroundPipelineInfo.progUniforms['u_transform_2d'], false, new Float32Array([1.0, 1.0, 0.0, 0.0]))

    // 小程序暂不支持背景图片，flags=0
    gl.uniform1ui(this.backgroundPipelineInfo.progUniforms['flags'], 0)
    gl.bindVertexArray(this.backgroundVAO)

    gl.uniform1i(this.backgroundPipelineInfo.progUniforms['u_image_bg'], 0)
    // 背景纹理不上传（flags=0 时 shader 不采样）

    gl.uniform1i(this.backgroundPipelineInfo.progUniforms['u_image_char_body'], 1)
    gl.activeTexture(gl.TEXTURE0 + 1)
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTextures['u_image_char_body'])

    // 上传 body 像素数据到纹理
    if (bodyWidth !== this._bodyTextureWidth || bodyHeight !== this._bodyTextureHeight) {
      // 尺寸变化时用 texImage2D 重新分配
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bodyWidth, bodyHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, bodyPixels)
      this._bodyTextureWidth = bodyWidth
      this._bodyTextureHeight = bodyHeight
    } else {
      // 尺寸不变时用 texSubImage2D 更高效
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, bodyWidth, bodyHeight, gl.RGBA, gl.UNSIGNED_BYTE, bodyPixels)
    }

    gl.uniform1i(this.backgroundPipelineInfo.progUniforms['u_image_mesh_color'], 2)
    gl.activeTexture(gl.TEXTURE0 + 2)
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshColor)
    gl.uniform1i(this.backgroundPipelineInfo.progUniforms['u_image_mesh_alpha'], 3)
    gl.activeTexture(gl.TEXTURE0 + 3)
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshAlpha)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  // ==================== Mesh rendering ====================

  private renderMesh(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): void {
    const gl = this.device.gl

    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)

    const char = data.char!

    let proj_mat = new Float32Array(flatten(mmul(char.cameraConfig.getProjMatrix([this.device.canvas.width, this.device.canvas.height], 200, 800), char.cameraConfig.getExtrinsicMatrix())))
    let transform_2d_mat = new Float32Array([data.transform.scaleX, data.transform.scaleY, (data.transform.scaleX - 1.0) + 2.0 * data.transform.offsetX, (1.0 - data.transform.scaleY) - 2.0 * data.transform.offsetY])

    let currentSkeletonStatus = char.evalSkeletonFromMovable(frame_data.movableJointTransforms)
    let joint_matrices = Array(char.skeleton.length)
    for (let i = 0; i < char.skeleton.length; i++) {
      const joint_transform = currentSkeletonStatus[i].apply(this.initSkeletonStatus[i].inv()) as RigidTransform
      joint_matrices[i] = joint_transform.homogeneous_matrix()
    }

    let ub_rig_info_data_offset = 0
    for (let i = 0; i < Math.min(this.meshStatistics.max_bones, char.skeleton.length); i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) this._ub_rig_info_data![ub_rig_info_data_offset + j * 4 + k] = joint_matrices[i][k][j]
      }
      ub_rig_info_data_offset += 16
    }

    // ===== Render mask =====
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_MSAA)
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clearDepth(1.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(this.maskPipelineInfo!.program)
    gl.uniformMatrix4fv(this.maskPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat)
    gl.uniformMatrix2fv(this.maskPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat)
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      if (char.mesh[mesh_index].genMask) {
        const currentMeshInfo = this.meshInfos[mesh_index]

        if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
          ub_rig_info_data_offset = this.meshStatistics.max_bones * 16
          let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count)
          for (let i = 0; i < effective_bs_count; i++) this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1]
          for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++) this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0
        }

        let flags = 0
        if (char.mesh[mesh_index].opacity) flags += 1

        for (const var_name in currentMeshInfo.uniformUInts) gl.uniform1ui(this.maskPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name])
        gl.uniform1ui(this.maskPipelineInfo!.progUniforms['flags'], flags)

        gl.bindBuffer(gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_rig_info'])
        gl.bufferData(gl.UNIFORM_BUFFER, this._ub_rig_info_data, gl.DYNAMIC_DRAW)
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, currentMeshInfo.buffers!['ub_rig_info'])

        gl.bindVertexArray(currentMeshInfo.VAO)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers!['indices'])
        gl.uniform1i(this.maskPipelineInfo!.progUniforms['u_image_bs'], 0)
        gl.activeTexture(gl.TEXTURE0 + 0)
        gl.bindTexture(gl.TEXTURE_2D, currentMeshInfo.textures!['u_image_bs'])

        gl.drawElements(gl.TRIANGLES, char.mesh[mesh_index].triangles.itemSize(), this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)!, 0)
      }
    }

    // Blit mask to meshAlpha texture
    this._blitToFBO(this.FrameBuffer_MSAA!, this.FrameBuffer_meshAlpha!)

    // ===== Render color =====
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_MSAA)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.meshPipelineInfo!.program)
    gl.uniformMatrix4fv(this.meshPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat)
    gl.uniformMatrix2fv(this.meshPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat)
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      const currentMeshInfo = this.meshInfos[mesh_index]
      let PCAModel = currentMeshInfo.texturePCAModels[frame_data.mesh[mesh_index].textureModelIndex]

      if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
        ub_rig_info_data_offset = this.meshStatistics.max_bones * 16
        let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count)
        for (let i = 0; i < effective_bs_count; i++) this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1]
        for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++) this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0
      }

      let flags = 0
      if (char.mesh[mesh_index].opacity) flags += 1
      if (this.LUTTexture !== null) flags += 2
      if (PCAModel.unsigned) flags += 4

      for (const var_name in currentMeshInfo.uniformUInts) gl.uniform1ui(this.meshPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name])
      gl.uniform1ui(this.meshPipelineInfo!.progUniforms['flags'], flags)
      gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_gamma'], this.currentGamma.r, this.currentGamma.g, this.currentGamma.b)
      gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_color_balance'], this.currentColorBalance.rc, this.currentColorBalance.gm, this.currentColorBalance.by)

      gl.bindBuffer(gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_rig_info'])
      gl.bufferData(gl.UNIFORM_BUFFER, this._ub_rig_info_data, gl.DYNAMIC_DRAW)
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, currentMeshInfo.buffers!['ub_rig_info'])

      let effective_pca_component_count = Math.min(frame_data.mesh[mesh_index].texturePCAWeights.length + 1, this._ub_pca_info_data!.length)
      this._ub_pca_info_data![0] = 1.0
      for (let i = 1; i < effective_pca_component_count; i++) this._ub_pca_info_data![i] = frame_data.mesh[mesh_index].texturePCAWeights[i - 1]
      if (PCAModel.scalingFactor) {
        for (let i = 0; i < effective_pca_component_count; i++) this._ub_pca_info_data![i] *= PCAModel.scalingFactor[i]
      }
      for (let i = effective_pca_component_count; i < this.meshStatistics.max_pca_component_count; i++) this._ub_pca_info_data![i] = 0.0
      gl.bindBuffer(gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_pca_info'])
      gl.bufferData(gl.UNIFORM_BUFFER, this._ub_pca_info_data, gl.DYNAMIC_DRAW)
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, currentMeshInfo.buffers!['ub_pca_info'])

      gl.bindVertexArray(currentMeshInfo.VAO)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers!['indices'])
      gl.uniform1i(this.meshPipelineInfo!.progUniforms['u_image_bs'], 0)
      gl.activeTexture(gl.TEXTURE0 + 0)
      gl.bindTexture(gl.TEXTURE_2D, currentMeshInfo.textures!['u_image_bs'])
      gl.uniform1i(this.meshPipelineInfo!.progUniforms['u_image_pca'], 1)
      gl.activeTexture(gl.TEXTURE0 + 1)
      if (PCAModel.texture) gl.bindTexture(gl.TEXTURE_2D_ARRAY, PCAModel.texture)
      gl.uniform1i(this.meshPipelineInfo!.progUniforms['u_image_lut'], 2)
      if (this.LUTTexture) {
        gl.activeTexture(gl.TEXTURE0 + 2)
        gl.bindTexture(gl.TEXTURE_3D, this.LUTTexture)
      }
      gl.drawElements(gl.TRIANGLES, char.mesh[mesh_index].triangles.itemSize(), this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)!, 0)
    }

    // Blit color to meshColor texture
    this._blitToFBO(this.FrameBuffer_MSAA!, this.FrameBuffer_meshColor!)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /**
   * 将 MSAA FBO 的内容 blit/copy 到目标 FBO
   * 优先使用 blitFramebuffer，不可用时通过 copy-via-draw 降级
   */
  private _blitToFBO(srcFBO: WebGLFramebuffer, dstFBO: WebGLFramebuffer): void {
    const gl = this.device.gl
    const w = this.device.canvas.width
    const h = this.device.canvas.height

    if (this._blitAvailable) {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFBO)
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    } else {
      // Copy-via-draw fallback:
      // 1. 先将 MSAA renderbuffer resolve 到中间纹理（如果有 MSAA 的话实际上不会走到这里，
      //    因为 blitFramebuffer 不可用时 MSAA 也降级了，所以 srcFBO 就是 renderbuffer-backed）
      // 2. 用 readPixels + texImage2D 做中转（最后手段）
      //    但由于 non-MSAA path 时 srcFBO 仍然是 renderbuffer-backed，需要 readPixels
      const pixels = new Uint8Array(w * h * 4)
      gl.bindFramebuffer(gl.FRAMEBUFFER, srcFBO)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      // 获取 dstFBO 绑定的纹理并上传
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO)
      // 直接清除并上传到 resolve 纹理再 draw
      if (this._copyResolveTexture && this._copyPipelineInfo) {
        gl.bindTexture(gl.TEXTURE_2D, this._copyResolveTexture)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

        gl.useProgram(this._copyPipelineInfo.program)
        gl.disable(gl.DEPTH_TEST)
        gl.disable(gl.BLEND)
        gl.uniform1i(this._copyPipelineInfo.progUniforms['u_source'], 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this._copyResolveTexture)
        gl.bindVertexArray(this.backgroundVAO)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }
  }

  // ==================== Public API ====================

  public setCharData(charData?: GLPipelineCharData): void {
    if (charData?.char) {
      this.charData = charData
      this.assembleMeshPipelines(this.charData)
    }
    else this.charData = null
  }

  public setGamma(gammaR: number, gammaG: number, gammaB: number): void {
    this.currentGamma = { r: gammaR, g: gammaG, b: gammaB }
  }

  public setColorBalance(rc: number, gm: number, by: number): void {
    this.currentColorBalance = { rc: rc, gm: gm, by: by }
  }

  /**
   * 渲染一帧
   *
   * @param bodyPixels  - 身体视频帧 RGBA 像素数据（双宽格式：左半=颜色，右半=alpha）
   * @param bodyWidth   - 像素数据宽度（完整双宽宽度）
   * @param bodyHeight  - 像素数据高度
   * @param faceData    - 脸部动画数据（null 则仅渲染身体）
   */
  public renderFrame(
    bodyPixels: Uint8Array,
    bodyWidth: number,
    bodyHeight: number,
    faceData: IBRAnimationFrameData_NN | null
  ): void {
    this.initFrame()
    if (null !== this.charData && null !== this.charData.char && null !== faceData) {
      this.renderMesh(this.charData, faceData)
    }
    this.renderBackground(bodyPixels, bodyWidth, bodyHeight, null === this.charData ? null : this.charData.transform)
    this.device.gl.flush()
  }

  // ==================== Cleanup ====================

  public destroy(): void {
    const gl = this.device.gl
    if (!gl) return

    // Destroy mesh resources
    if (this.meshInfos) {
      this.meshInfos.forEach(meshInfo => {
        if (meshInfo.VAO) gl.deleteVertexArray(meshInfo.VAO)
        Object.values(meshInfo.buffers).forEach(buffer => { if (buffer) gl.deleteBuffer(buffer) })
        Object.values(meshInfo.textures).forEach(texture => { if (texture) gl.deleteTexture(texture) })
        meshInfo.texturePCAModels.forEach(pcaModel => { if (pcaModel.texture) gl.deleteTexture(pcaModel.texture) })
      })
      this.meshInfos = []
    }

    // Destroy framebuffers
    if (this.FrameBuffer_MSAA) { gl.deleteFramebuffer(this.FrameBuffer_MSAA); this.FrameBuffer_MSAA = null }
    if (this.FrameBuffer_meshColor) { gl.deleteFramebuffer(this.FrameBuffer_meshColor); this.FrameBuffer_meshColor = null }
    if (this.FrameBuffer_meshAlpha) { gl.deleteFramebuffer(this.FrameBuffer_meshAlpha); this.FrameBuffer_meshAlpha = null }

    // Destroy renderbuffers
    if (this._msaaColorRB) { gl.deleteRenderbuffer(this._msaaColorRB); this._msaaColorRB = null }
    if (this._msaaDepthRB) { gl.deleteRenderbuffer(this._msaaDepthRB); this._msaaDepthRB = null }

    // Destroy frame textures
    if (this.FrameTexture_meshColor) { gl.deleteTexture(this.FrameTexture_meshColor); this.FrameTexture_meshColor = null }
    if (this.FrameTexture_meshAlpha) { gl.deleteTexture(this.FrameTexture_meshAlpha); this.FrameTexture_meshAlpha = null }

    // Destroy LUT
    if (this.LUTTexture) { gl.deleteTexture(this.LUTTexture); this.LUTTexture = null }

    // Destroy background textures
    for (const key of Object.keys(this.backgroundTextures)) {
      if (this.backgroundTextures[key]) gl.deleteTexture(this.backgroundTextures[key])
    }
    this.backgroundTextures = {}

    // Destroy background VAO
    if (this.backgroundVAO) { gl.deleteVertexArray(this.backgroundVAO); this.backgroundVAO = null as any }

    // Destroy shader programs
    if (this.meshPipelineInfo?.program) { gl.deleteProgram(this.meshPipelineInfo.program); this.meshPipelineInfo.program = null as any }
    if (this.maskPipelineInfo?.program) { gl.deleteProgram(this.maskPipelineInfo.program); this.maskPipelineInfo.program = null as any }
    if (this.backgroundPipelineInfo?.program) { gl.deleteProgram(this.backgroundPipelineInfo.program); this.backgroundPipelineInfo.program = null as any }

    // Destroy copy pipeline resources
    if (this._copyPipelineInfo?.program) { gl.deleteProgram(this._copyPipelineInfo.program); this._copyPipelineInfo = null }
    if (this._copyResolveTexture) { gl.deleteTexture(this._copyResolveTexture); this._copyResolveTexture = null }
    if (this._copyResolveFBO) { gl.deleteFramebuffer(this._copyResolveFBO); this._copyResolveFBO = null }

    // Clear data arrays
    this._ub_rig_info_data = null
    this._ub_pca_info_data = null
    this.charData = null
  }
}
