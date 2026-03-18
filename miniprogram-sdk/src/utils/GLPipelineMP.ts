// @ts-nocheck
import { GLDeviceMP } from './GLDeviceMP'
import { RigidTransform, IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, TextureFloat_3D } from './DataInterfaceMP'
import { mmul, flatten } from './Math'

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
    // 小程序视频解码出来的数据通常是倒过来的，或者 UV 需要翻转，视情况调整
    // 这里保持原样，如果有问题再改
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
  "u_image_bg", "u_image_char_body", "u_image_mesh_color", "u_image_mesh_alpha", "u_transform_2d", "flags"
];

interface MeshStatistics {
  max_pca_component_count: number,
  max_bs_count: number,
  max_bones: number
}

const max_bones_per_vertex = 8; // need to be a multiple of 4

function generateMeshPipelineShader(params: MeshStatistics): { [index: string]: string } {
  const vs_mesh = `#version 300 es
  precision highp float;

  uniform vec4 u_bs_weights[${params.max_bs_count / 4}];
  uniform mat4 u_joint_matrices[${params.max_bones}];
  
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
    const uint kMaxBones = ${params.max_bones}u;
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
      if(joint_index >= kMaxBones)continue;
      total_weight += joint_weight;
      result += joint_weight * (u_joint_matrices[joint_index] * aug_pos);
    }
    if(total_weight < 1e-6)return aug_pos;
    if(abs(result.w) < 1e-6)return aug_pos;
    result /= result.w;
    return vec4(result.xyz, 1.0);
  }

  vec3 bs_accumulate(uint vertex_id){
    ivec2 texSize = textureSize(u_image_bs, 0);
    vec3 pos = vec3(0.0);

    uint vertex_offset = vertex_id * u_bs_count * 3u;
    for(uint i = 0u; i < u_bs_count; i++){
      vec4 bs_weight_vec = u_bs_weights[i];
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
    vec4 lbs_pos = lbs_transform(pos + bs_pos);
    bool invalid = any(bvec4(isnan(lbs_pos.x), isnan(lbs_pos.y), isnan(lbs_pos.z), isnan(lbs_pos.w))) ||
                   any(bvec4(isinf(lbs_pos.x), isinf(lbs_pos.y), isinf(lbs_pos.z), isinf(lbs_pos.w)));
    if(invalid)lbs_pos = vec4(pos + bs_pos, 1.0);
    v_pos = u_proj_mat * lbs_pos;

    v_pos /= max(v_pos.w, 1e-6);
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
      vec3 balance_adjusted = u_color_balance / 200.0;
      final_color.r += balance_adjusted.x;
      final_color.g -= balance_adjusted.x;
      final_color.g += balance_adjusted.y;
      final_color.b -= balance_adjusted.y;
      final_color.b += balance_adjusted.z;
      final_color.r -= balance_adjusted.z;
      final_color = clamp(final_color, 0.0, 1.0);

      fragColor = sRGB2RGB(vec4(final_color.bgr, 1.0));
    }
    else fragColor = vec4(0.0);
  }
`

  return { vertex: vs_mesh, fragment_mask: fs_mask, fragment: fs_mesh };
}

const uniform_var_list_mesh = [
  "u_proj_mat", "u_transform_2d", "u_image", "u_image_bs", "u_image_pca", "u_image_lut", "u_bs_count", "flags", "u_gamma", "u_color_balance",
  "u_joint_matrices", "u_bs_weights"
];
const uniform_block_list_mesh = [
  "ub_pca_info"
];

interface PipelineInfo {
  program: WebGLProgram,
  progUniforms: { [index: string]: WebGLUniformLocation },
  progUniformBlocks: { [index: string]: GLint }
}
interface TexturePCAModel {
  texture: WebGLTexture,
  unsigned: boolean,
  scalingFactor?: Float32Array;
}
interface MeshInfo {
  VAO: WebGLVertexArrayObject,
  buffers: { [index: string]: WebGLBuffer },
  textures: { [index: string]: WebGLTexture },
  texturePCAModels: TexturePCAModel[],
  uniformUInts: { [index: string]: number }
}

export interface GLPipelineCharData {
  char: IBRAnimationGeneratorCharInfo_NN | null,
  LUT: TextureFloat_3D | null,
  transform: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  }
  multisample: number | null;
}

export class GLPipelineMP {
  public readonly device: GLDeviceMP;
  private compat_features: { [index: string]: unknown } = {};
  private faceOffsetXPx: number = 0;
  private faceOffsetYPx: number = 0;
  private headMotionScale: number = 1.0;
  private exprMotionScale: number = 1.0;
  private eyeExtraScale: number = 0.5;
  private charData: GLPipelineCharData | null = null;
  private backgroundPipelineInfo!: PipelineInfo
  private backgroundVAO!: WebGLVertexArrayObject;
  private backgroundBuffers: { pos: WebGLBuffer | null } = { pos: null };
  private backgroundTextures: { [index: string]: WebGLTexture } = {};
  
  // 移除 backgroundTextureSrc，因为我们无法简单比较 ArrayBuffer 是否变化
  // private backgroundTextureSrc: unknown = null;

  private meshPipelineInfo: PipelineInfo | null = null;
  private maskPipelineInfo: PipelineInfo | null = null;
  private meshInfos: Array<MeshInfo> = [];
  private meshStatistics: MeshStatistics = {
    max_pca_component_count: 4,
    max_bs_count: 4,
    max_bones: 8 // 增大骨骼数量，防止越界
  };

  private FrameTexture_meshColor: WebGLTexture | null = null;
  private FrameTexture_meshAlpha: WebGLTexture | null = null;
  private LUTTexture: WebGLTexture | null = null;

  private FrameBuffer_MSAA: WebGLFramebuffer | null = null;
  private FrameBuffer_meshColor: WebGLFramebuffer | null = null;
  private FrameBuffer_meshAlpha: WebGLFramebuffer | null = null;
  private maskDepthBuffer: WebGLRenderbuffer | null = null;
  private maskColorBuffer: WebGLRenderbuffer | null = null;
  private initSkeletonStatus: RigidTransform[] = [];

  private currentGamma: {r: number, g: number, b: number } = { r: 1.0, g: 1.0, b: 1.0 };
  private currentColorBalance: { rc: number, gm: number, by: number } = { rc: 0.0, gm: 0.0, by: 0.0 };

  private _ub_rig_info_data: Float32Array | null = null;
  private _ub_pca_info_data: Float32Array | null = null;
  
  private first_webgl_render = false;

  // Mesh FBO dimensions: must match the projection matrix resolution (= body video content size).
  // Web SDK achieves this by setting canvas to 1080x1920; we use a dedicated FBO instead.
  private meshFBOWidth: number = 0;
  private meshFBOHeight: number = 0;
  private meshFBOInitialized: boolean = false;

  private assembleBackgroundPipeline() {
    const program = this.device.compileShaderProgram({
      "vertex": vs_background,
      "fragment": fs_background
    });
    const progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_bg);
    this.backgroundPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: {}
    };

    this.backgroundVAO = this.device.gl.createVertexArray();
    this.device.gl.bindVertexArray(this.backgroundVAO);

    // Setup buffers and attributes
    const positionBuffer = this.device.gl.createBuffer();
    this.backgroundBuffers.pos = positionBuffer;
    this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      -1, 1, 0, 0,
      1, -1, 1, 1,
      1, 1, 1, 0
    ];
    this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, new Float32Array(positions), this.device.gl.STATIC_DRAW);

    // pos
    this.device.gl.enableVertexAttribArray(0);
    this.device.gl.vertexAttribPointer(0, 2, this.device.gl.FLOAT, false, 16, 0);

    // texCoord
    this.device.gl.enableVertexAttribArray(1);
    this.device.gl.vertexAttribPointer(1, 2, this.device.gl.FLOAT, false, 16, 8);
    this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, null);

    this.device.gl.bindVertexArray(null);

    // Create texture
    let textures: { [index: string]: WebGLTexture } = {}

    textures["u_image_bg"] = this.device.gl.createTexture();
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, textures["u_image_bg"])
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.LINEAR)

    textures["u_image_char_body"] = this.device.gl.createTexture();
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, textures["u_image_char_body"])
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.LINEAR)

    this.backgroundTextures = textures;
  }

  assembleMeshPipelines(data: GLPipelineCharData) {
    const char = data.char!;

    // statistics
    let meshStatistics = {
      max_pca_component_count: 4,
      max_bs_count: 4,
      max_bones: Math.max(char.skeleton.length, 1)
    }
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      const textureModels = char.mesh[mesh_index].textureModels;
      let pca_component_count = 0;
      for(let model of textureModels){
        let pca_component_count_model = model.data.size[0] + (4 - 1);
        pca_component_count_model -= pca_component_count_model % 4;
        pca_component_count = Math.max(pca_component_count, pca_component_count_model);
      }
      meshStatistics.max_pca_component_count = Math.max(meshStatistics.max_pca_component_count, pca_component_count);

      let max_bs_count = char.mesh[mesh_index].blendshapes.size[0] - 1 + (4 - 1);
      max_bs_count -= max_bs_count % 4;
      meshStatistics.max_bs_count = Math.max(meshStatistics.max_bs_count, max_bs_count);
    }
    this.meshStatistics = meshStatistics;
    this._ub_rig_info_data = new Float32Array(this.meshStatistics.max_bones * 16 + this.meshStatistics.max_bs_count);
    this._ub_pca_info_data = new Float32Array(this.meshStatistics.max_pca_component_count);
    const shader = generateMeshPipelineShader(this.meshStatistics);

    let program = this.device.compileShaderProgram({vertex: shader.vertex, fragment: shader.fragment});
    let progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_mesh);
    let progUniformBlocks = this.device.getShaderProgramUniformBlockLocation(program, uniform_block_list_mesh);
    this.meshPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: progUniformBlocks,
    };
    this.device.gl.uniformBlockBinding(this.meshPipelineInfo.program, this.meshPipelineInfo.progUniformBlocks["ub_pca_info"], 1);

    program = this.device.compileShaderProgram({vertex: shader.vertex, fragment: shader.fragment_mask});
    progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_mesh);
    progUniformBlocks = this.device.getShaderProgramUniformBlockLocation(program, uniform_block_list_mesh);
    this.maskPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: progUniformBlocks,
    };
    // this.device.gl.uniformBlockBinding(this.maskPipelineInfo.program, this.maskPipelineInfo.progUniformBlocks["ub_rig_info"], 0);

    this.meshInfos = [];
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      let currentMeshInfo: MeshInfo = {
        VAO: this.device.gl.createVertexArray(),
        buffers: {},
        textures: {},
        texturePCAModels: [],
        uniformUInts: {},
      };

      // Setup buffers and attributes
      // 弃用 VAO，手动绑定
      // this.device.gl.bindVertexArray(currentMeshInfo.VAO);
      
      currentMeshInfo.buffers['pos'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['pos']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].blendshapes.part(0).data, this.device.gl.STATIC_DRAW);
      // VAO 绑定逻辑移到 renderMesh

      currentMeshInfo.buffers['tex_coord'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['tex_coord']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].UVCoord.data, this.device.gl.STATIC_DRAW);

      if(char.mesh[mesh_index].opacity){
        currentMeshInfo.buffers['opacity'] = this.device.gl.createBuffer();
        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['opacity']);
        this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].opacity!.data, this.device.gl.STATIC_DRAW);
      }

      currentMeshInfo.buffers['bone_indices'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_indices']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].jointIndex, this.device.gl.STATIC_DRAW);

      currentMeshInfo.buffers['bone_weight'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_weight']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].jointWeight, this.device.gl.STATIC_DRAW);
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, null);

      currentMeshInfo.buffers['indices'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers['indices']);
      this.device.gl.bufferData(this.device.gl.ELEMENT_ARRAY_BUFFER, char.mesh[mesh_index].triangles.data, this.device.gl.STATIC_DRAW);
      this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, null); // 解绑

      currentMeshInfo.buffers['ub_pca_info'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_pca_info']);
      this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_pca_component_count), this.device.gl.DYNAMIC_DRAW);

      // currentMeshInfo.buffers['ub_rig_info'] = this.device.gl.createBuffer();
      // this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_rig_info']);
      // this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_bones * 16 + meshStatistics.max_bs_count), this.device.gl.DYNAMIC_DRAW);

      // this.device.gl.bindVertexArray(null);

      // Create texture

      // blendshape texture
      if (char.mesh[mesh_index].blendshapes.size[0] > 1){
        let bs_texture_size = [Math.ceil((char.mesh[mesh_index].blendshapes.size[0] - 1) / 4), char.mesh[mesh_index].blendshapes.size[1] * char.mesh[mesh_index].blendshapes.size[2]];
        // reshape the texture into a square one
        let square_bs_texture_size = Math.ceil(Math.sqrt(bs_texture_size[0] * bs_texture_size[1]));
        let bs_vec_stride = bs_texture_size[0] * 4;
        let bs_texture_data = new Float32Array(square_bs_texture_size * square_bs_texture_size * 4);
        for (let i = 0; i < bs_texture_size[1]; i++) {
          for (let j = 1; j < char.mesh[mesh_index].blendshapes.size[0]; j++)bs_texture_data[i * bs_vec_stride + (j - 1)] = char.mesh[mesh_index].blendshapes.data[j * bs_texture_size[1] + i] as number;
          for (let j = char.mesh[mesh_index].blendshapes.size[0] - 1; j < bs_vec_stride; j++)bs_texture_data[i * bs_vec_stride + j] = 0.0;
        }
        currentMeshInfo.textures["u_image_bs"] = this.device.gl.createTexture();
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, currentMeshInfo.textures["u_image_bs"]);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
        this.device.texImage2D(this.device.gl.TEXTURE_2D, 0, square_bs_texture_size, square_bs_texture_size, this.device.gl.RGBA, bs_texture_data);
        {
          const bsErr = this.device.gl.getError();
          if (bsErr !== 0) console.error(`[GLPipeline] BS texture upload GL error mesh[${mesh_index}]: ${bsErr}`);
        }

        currentMeshInfo.uniformUInts["u_bs_count"] = bs_texture_size[0];
      }
      else currentMeshInfo.uniformUInts["u_bs_count"] = 0;

      // PCA textures
      for (let pca_model of char.mesh[mesh_index].textureModels) {
        let pca_texture = this.device.gl.createTexture();
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D_ARRAY, pca_texture);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D_ARRAY, this.device.gl.TEXTURE_WRAP_R, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D_ARRAY, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D_ARRAY, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D_ARRAY, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.LINEAR);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D_ARRAY, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.LINEAR);

        let dataType = this.device.getGLArrayElementType(pca_model.data.data);
        let assembledPCAModel: TexturePCAModel = {
          texture: pca_texture,
          unsigned: this.device.gl.UNSIGNED_BYTE === dataType || this.device.gl.UNSIGNED_SHORT === dataType || this.device.gl.UNSIGNED_INT === dataType
        }

        let PCAData = pca_model.data.data;
        if("Float64Array" === pca_model.data.data[Symbol.toStringTag]
          || (this.device.gl.FLOAT === dataType && !this.compat_features["OES_texture_float_linear"])
          || (this.device.gl.HALF_FLOAT === dataType && !this.compat_features["OES_texture_half_float_linear"])){
          const texture_component_size = pca_model.data.size[1] * pca_model.data.size[2] * 3;
          const roundedTexture = new Uint8Array(pca_model.data.size[0] * texture_component_size);
          let scalingFactor = new Float32Array(pca_model.data.size[0]);
          for(let i = 0; i < pca_model.data.size[0]; i++){
            let scale_factor = 1e-6;
            for(let j = 0; j < texture_component_size; j++)scale_factor = Math.max(scale_factor, Math.abs(pca_model.data.data[i * texture_component_size + j] as number));
            let inv_scale_factor = 1.0 / scale_factor;
            for(let j = 0; j < texture_component_size; j++){
              let scaled_value = pca_model.data.data[i * texture_component_size + j] as number * inv_scale_factor;
              roundedTexture[i * texture_component_size + j] = Math.round((scaled_value * 0.5 + 0.5) * 255.0);
            }
            scalingFactor[i] = scale_factor;
          }
          PCAData = roundedTexture;
          assembledPCAModel.unsigned = true;
          assembledPCAModel.scalingFactor = scalingFactor;
        }
        if(pca_model.scalingFactor)assembledPCAModel.scalingFactor = pca_model.scalingFactor.data as Float32Array;

        this.device.texImage3D(this.device.gl.TEXTURE_2D_ARRAY, 0, pca_model.data.size[1], pca_model.data.size[2], pca_model.data.size[0], this.device.gl.RGB, PCAData);
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D_ARRAY, null);
        currentMeshInfo.texturePCAModels.push(assembledPCAModel);
      }
      this.meshInfos.push(currentMeshInfo);
    }
      
    // texture render targets
    // 获取画布尺寸，注意：device.canvas 在小程序中可能没有 width/height 属性，需要外部传入或者通过 gl.drawingBufferWidth
    const width = this.device.gl.drawingBufferWidth;
    const height = this.device.gl.drawingBufferHeight;

    this.FrameTexture_meshColor = this.device.gl.createTexture();
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
    this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGBA8, width, height, 0, this.device.gl.RGBA, this.device.gl.UNSIGNED_BYTE, null);
    
    this.FrameTexture_meshAlpha = this.device.gl.createTexture();
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
    this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGBA8, width, height, 0, this.device.gl.RGBA, this.device.gl.UNSIGNED_BYTE, null);

    // depth renderbuffer（保存引用以便 resize 时释放）
    this.maskDepthBuffer = this.device.gl.createRenderbuffer();
    this.device.gl.bindRenderbuffer(this.device.gl.RENDERBUFFER, this.maskDepthBuffer);
    if(data.multisample && data.multisample > 1)this.device.gl.renderbufferStorageMultisample(this.device.gl.RENDERBUFFER, data.multisample, this.device.gl.DEPTH_COMPONENT16, width, height);
    else this.device.gl.renderbufferStorage(this.device.gl.RENDERBUFFER, this.device.gl.DEPTH_COMPONENT16, width, height);

    this.maskColorBuffer = this.device.gl.createRenderbuffer();
    this.device.gl.bindRenderbuffer(this.device.gl.RENDERBUFFER, this.maskColorBuffer);
    if(data.multisample && data.multisample > 1)this.device.gl.renderbufferStorageMultisample(this.device.gl.RENDERBUFFER, data.multisample, this.device.gl.RGBA8, width, height);
    else this.device.gl.renderbufferStorage(this.device.gl.RENDERBUFFER, this.device.gl.RGBA8, width, height);

    this.FrameBuffer_MSAA = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.framebufferRenderbuffer(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.RENDERBUFFER, this.maskColorBuffer!);
    this.device.gl.framebufferRenderbuffer(this.device.gl.FRAMEBUFFER, this.device.gl.DEPTH_ATTACHMENT, this.device.gl.RENDERBUFFER, this.maskDepthBuffer!);

    this.FrameBuffer_meshColor = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshColor);
    this.device.gl.framebufferTexture2D(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor, 0);

    this.FrameBuffer_meshAlpha = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    this.device.gl.framebufferTexture2D(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha, 0);

    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, null);

    this.initSkeletonStatus = char.evalSkeleton();
  }

  private initFrame() {
    // DEBUG: 检查 Viewport 尺寸
    // const w = this.device.gl.drawingBufferWidth;
    // const h = this.device.gl.drawingBufferHeight;
    // if (w === 0 || h === 0) {
    //     console.error('[GLPipeline] Zero viewport size!', w, h);
    // }
    
    this.device.gl.viewport(0, 0, this.device.gl.drawingBufferWidth, this.device.gl.drawingBufferHeight);
    this.device.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.device.gl.clearDepth(1.0);
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshColor);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT);
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT);
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, null);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT | this.device.gl.DEPTH_BUFFER_BIT);
  }

  private renderBackground(background: ArrayBuffer | WebGLTexture | null, char_body: ArrayBuffer | WebGLTexture, transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number; } | null, bodyWidth: number = 0, bodyHeight: number = 0) {
    this.device.gl.disable(this.device.gl.DEPTH_TEST);
    this.device.gl.disable(this.device.gl.CULL_FACE);
    this.device.gl.disable(this.device.gl.BLEND);

    this.device.gl.useProgram(this.backgroundPipelineInfo.program);
    if(transform){
      this.device.gl.uniformMatrix2fv(this.backgroundPipelineInfo.progUniforms['u_transform_2d'], false, new Float32Array([
        1.0 / transform.scaleX, 1.0 / transform.scaleY, -transform.offsetX / transform.scaleX, -transform.offsetY / transform.scaleY
      ]));
    }
    else this.device.gl.uniformMatrix2fv(this.backgroundPipelineInfo.progUniforms['u_transform_2d'], false, new Float32Array([1.0, 1.0, 0.0, 0.0]));
    this.device.gl.uniform1ui(this.backgroundPipelineInfo.progUniforms['flags'], background === null ? 0 : 1);
    
    if (this.backgroundBuffers.pos) {
        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, this.backgroundBuffers.pos);
        this.device.gl.enableVertexAttribArray(0);
        this.device.gl.vertexAttribPointer(0, 2, this.device.gl.FLOAT, false, 16, 0);
        this.device.gl.enableVertexAttribArray(1);
        this.device.gl.vertexAttribPointer(1, 2, this.device.gl.FLOAT, false, 16, 8);
    } else {
        this.device.gl.bindVertexArray(this.backgroundVAO);
    }

    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_bg`], 0);
    // Background 纹理处理略... 假设 background 也是纹理或 buffer

    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_char_body`], 1);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 1);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.backgroundTextures!["u_image_char_body"]);
    
    // 更新身体纹理
    if (char_body instanceof ArrayBuffer || char_body instanceof Uint8Array || char_body instanceof Uint8ClampedArray) {
        if (bodyWidth > 0 && bodyHeight > 0) {
            this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGBA, bodyWidth, bodyHeight, 0, this.device.gl.RGBA, this.device.gl.UNSIGNED_BYTE, new Uint8Array(char_body as ArrayBuffer));
        } else {
            console.error('[GLPipeline] Invalid body dimensions:', bodyWidth, bodyHeight);
        }
    } else {
        console.error('[GLPipeline] Invalid char_body type:', char_body);
    }
    
    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_mesh_color`], 2);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 2);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor);
    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_mesh_alpha`], 3);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 3);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha);

    // 手动绑定 Attributes (因为弃用了 VAO，必须在每次 draw 前重置状态)
    // 否则会使用 renderMesh 遗留的 Buffer 状态，导致背景绘制错误
    this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, this.backgroundBuffers.pos);
    
    // pos (location 0)
    this.device.gl.enableVertexAttribArray(0);
    this.device.gl.vertexAttribPointer(0, 2, this.device.gl.FLOAT, false, 16, 0);
    
    // texCoord (location 1)
    this.device.gl.enableVertexAttribArray(1);
    this.device.gl.vertexAttribPointer(1, 2, this.device.gl.FLOAT, false, 16, 8);
    
    // 禁用 renderMesh 可能开启的其他 Attributes (location 2~6)
    for (let i = 2; i < 7; i++) {
        this.device.gl.disableVertexAttribArray(i);
    }

    this.device.gl.drawArrays(this.device.gl.TRIANGLES, 0, 6);
  }

  private _renderMeshCallCount = 0;

  private renderMesh(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN, videoWidth: number = 0, videoHeight: number = 0) {
    this.device.gl.enable(this.device.gl.DEPTH_TEST);
    this.device.gl.disable(this.device.gl.CULL_FACE);
    this.device.gl.disable(this.device.gl.BLEND);

    const char = data.char!;
    const canvasW = this.device.gl.drawingBufferWidth;
    const canvasH = this.device.gl.drawingBufferHeight;
    // Keep width/height as canvas dimensions for FBO blit operations (blit uses canvas pixel coords).
    const width = canvasW;
    const height = canvasH;
    // Body video is packed double-width (color|alpha side-by-side), so actual content = videoWidth/2 x videoHeight.
    // char.bin camera was calibrated for the actual content resolution (e.g. 1080x1920).
    // We must use that same resolution for the projection to align face mesh with body video.
    const projW = (videoWidth > 0) ? Math.round(videoWidth / 2) : canvasW;
    const projH = (videoHeight > 0) ? videoHeight : canvasH;

    this._renderMeshCallCount++;

    let proj_mat = new Float32Array(flatten(mmul(char.cameraConfig.getProjMatrix([projW, projH], 200, 800), char.cameraConfig.getExtrinsicMatrix())));

    // Fine-tune face mesh alignment in NDC space.
    // +X = shift right, -X = shift left  (1.0 NDC = half canvas width)
    // +Y = shift up,    -Y = shift down   (1.0 NDC = half canvas height)
    // Example: 0.05 NDC ≈ 50px shift on a 2262-tall canvas
    const DEBUG_FACE_OFFSET_X_NDC = canvasW > 0 ? (2.0 * this.faceOffsetXPx / canvasW) : 0.0;
    const DEBUG_FACE_OFFSET_Y_NDC = canvasH > 0 ? (-2.0 * this.faceOffsetYPx / canvasH) : 0.0;

    let transform_2d_mat = new Float32Array([
      data.transform.scaleX,
      data.transform.scaleY,
      (data.transform.scaleX - 1.0) + 2.0 * data.transform.offsetX + DEBUG_FACE_OFFSET_X_NDC,
      (1.0 - data.transform.scaleY) - 2.0 * data.transform.offsetY + DEBUG_FACE_OFFSET_Y_NDC
    ]);

    let currentSkeletonStatus = char.evalSkeletonFromMovable(frame_data.movableJointTransforms);

    // ─── Face tracking correction ─────────────────────────────────────────────────
    //
    // ROOT CAUSE: face tracking joints only move ~0.3-1 world unit per frame, but the
    // body video's head can move much more during large body animations.
    // We decompose each joint's motion into two components and scale them independently:
    //
    //   HEAD_MOTION_SCALE  – amplifies the "common mode" (average across j0-j4).
    //     This represents global head translation from the body animation.
    //     > 1.0 makes the face mesh follow the body video's head movement more closely.
    //     Try: 1.0 → 2.0 → 3.0 until face tracks body video head.
    //     Watch for over-shoot: if face overshoots body video head, reduce this value.
    //
    //   EXPR_MOTION_SCALE  – multiplies the differential (per-joint deviation from avg).
    //     This represents facial expressions (mouth, cheek, brow movements).
    //     Keep at 1.0 unless expressions look too subtle or exaggerated.
    //
    //   EYE_ANCHOR_JOINT / EYE_EXTRA_SCALE – separate eye correction (j5/j6).
    //     Eyes are re-anchored to avoid drifting from face socket.
    //
    if (char.skeleton.length >= 7) {
      const HEAD_MOTION_SCALE = this.headMotionScale;
      const EXPR_MOTION_SCALE = this.exprMotionScale;
      const EYE_ANCHOR_JOINT  = 4;     // j4 = upper face, closest to eye socket area
      const EYE_EXTRA_SCALE   = this.eyeExtraScale;

      // Step 1: Decompose j0-j4 into head movement + expression, apply separate scales.
      // j5, j6 (eyes) are handled separately in Step 2.
      const FACE_JOINTS = [0, 1, 2, 3, 4];

      if (HEAD_MOTION_SCALE !== 1.0 || EXPR_MOTION_SCALE !== 1.0) {
        // Compute average delta (= head motion component) across face skin joints
        let avgDX = 0, avgDY = 0, avgDZ = 0;
        for (const ji of FACE_JOINTS) {
          const initT = this.initSkeletonStatus[ji].translation;
          const curT  = currentSkeletonStatus[ji].translation;
          avgDX += curT[0] - initT[0];
          avgDY += curT[1] - initT[1];
          avgDZ += curT[2] - initT[2];
        }
        avgDX /= FACE_JOINTS.length;
        avgDY /= FACE_JOINTS.length;
        avgDZ /= FACE_JOINTS.length;

        // Apply to each face skin joint
        for (const ji of FACE_JOINTS) {
          const initT = this.initSkeletonStatus[ji].translation;
          const curT  = currentSkeletonStatus[ji].translation;
          const diffX = (curT[0] - initT[0]) - avgDX;  // expression component
          const diffY = (curT[1] - initT[1]) - avgDY;
          const diffZ = (curT[2] - initT[2]) - avgDZ;
          currentSkeletonStatus[ji].translation = [
            initT[0] + avgDX * HEAD_MOTION_SCALE + diffX * EXPR_MOTION_SCALE,
            initT[1] + avgDY * HEAD_MOTION_SCALE + diffY * EXPR_MOTION_SCALE,
            initT[2] + avgDZ * HEAD_MOTION_SCALE + diffZ * EXPR_MOTION_SCALE,
          ];
        }
      }

      // Step 2: re-anchor eye joints (j5, j6) to the upper-face anchor joint.
      // This prevents eyes from drifting when face tracking over-estimates eye motion.
      const initA = this.initSkeletonStatus[EYE_ANCHOR_JOINT].translation;
      const curA  = currentSkeletonStatus[EYE_ANCHOR_JOINT].translation;
      const dA = [curA[0]-initA[0], curA[1]-initA[1], curA[2]-initA[2]] as [number,number,number];
      for (const eyeIdx of [5, 6]) {
        const initE = this.initSkeletonStatus[eyeIdx].translation;
        const curE  = currentSkeletonStatus[eyeIdx].translation;
        const dE    = [curE[0]-initE[0], curE[1]-initE[1], curE[2]-initE[2]];
        const extra = [dE[0]-dA[0], dE[1]-dA[1], dE[2]-dA[2]];
        currentSkeletonStatus[eyeIdx].translation = [
          initE[0] + dA[0] + extra[0] * EYE_EXTRA_SCALE,
          initE[1] + dA[1] + extra[1] * EYE_EXTRA_SCALE,
          initE[2] + dA[2] + extra[2] * EYE_EXTRA_SCALE,
        ];
      }
    }

    // 填充骨骼矩阵
    // 必须确保所有矩阵都被初始化（至少为 Identity），防止全 0 导致顶点塌缩
    for (let i = 0; i < this.meshStatistics.max_bones; i++) {
      let mat: number[][];
      if (i < char.skeleton.length) {
        const joint_transform = currentSkeletonStatus[i].apply(this.initSkeletonStatus[i].inv()) as RigidTransform;
        mat = joint_transform.homogeneous_matrix();
      } else {
        mat = [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1]
        ];
      }
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          this._ub_rig_info_data![i * 16 + j * 4 + k] = mat[k][j];
        }
      }
    }

    // render mask
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.device.gl.clearDepth(1.0);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT | this.device.gl.DEPTH_BUFFER_BIT);

    this.device.gl.useProgram(this.maskPipelineInfo!.program);
    this.device.gl.uniformMatrix4fv(this.maskPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat);
    this.device.gl.uniformMatrix2fv(this.maskPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat);
    
    // 上传骨骼数据到 Mask Pass
    {
      const matrixDataSize = this.meshStatistics.max_bones * 16;
      const matrixData = this._ub_rig_info_data.subarray(0, matrixDataSize);
      this.device.gl.uniformMatrix4fv(this.maskPipelineInfo.progUniforms['u_joint_matrices'], false, matrixData);
      
      if (this.meshStatistics.max_bs_count > 0) {
         const weightData = this._ub_rig_info_data.subarray(matrixDataSize);
         this.device.gl.uniform4fv(this.maskPipelineInfo.progUniforms['u_bs_weights'], weightData);
      }
    }

    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      // Web SDK: only meshes with genMask=true should contribute to the alpha mask.
      // Without this check, non-mask meshes (e.g. eye interiors, oral cavity) pollute
      // the alpha channel and cause incorrect compositing with the body video.
      if(!char.mesh[mesh_index].genMask) continue;

        const currentMeshInfo = this.meshInfos[mesh_index];

        if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
          ub_rig_info_data_offset = this.meshStatistics.max_bones * 16;
          let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count);
          for (let i = 0; i < effective_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1];
          for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0;

          // 更新 BlendShape 权重 (Mask Pass)
          const matrixDataSize = this.meshStatistics.max_bones * 16;
          const weightData = this._ub_rig_info_data.subarray(matrixDataSize);
          this.device.gl.uniform4fv(this.maskPipelineInfo.progUniforms['u_bs_weights'], weightData);
        }

        let flags = 0;
        if (char.mesh[mesh_index].opacity) flags += 1;

        for (const var_name in currentMeshInfo.uniformUInts)this.device.gl.uniform1ui(this.maskPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name]);
        this.device.gl.uniform1ui(this.maskPipelineInfo!.progUniforms['flags'], flags);

        // 手动绑定 Attributes
        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['pos']);
        this.device.gl.enableVertexAttribArray(0);
        this.device.gl.vertexAttribPointer(0, 3, this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data)!, false, 0, 0);

        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['tex_coord']);
        this.device.gl.enableVertexAttribArray(1);
        this.device.gl.vertexAttribPointer(1, 2, this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data)!, true, 0, 0);

        if(char.mesh[mesh_index].opacity){
          this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['opacity']);
          this.device.gl.enableVertexAttribArray(2);
          this.device.gl.vertexAttribPointer(2, 1, this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data)!, true, 0, 0);
        } else {
            this.device.gl.disableVertexAttribArray(2);
        }

        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['bone_indices']);
        const stride_indices = char.maxJointsPerVertex;
        this.device.gl.enableVertexAttribArray(3);
        this.device.gl.vertexAttribIPointer(3, 4, this.device.gl.UNSIGNED_BYTE, stride_indices, 0);
        if(char.maxJointsPerVertex > 4){
            this.device.gl.enableVertexAttribArray(4);
            this.device.gl.vertexAttribIPointer(4, 4, this.device.gl.UNSIGNED_BYTE, stride_indices, 4);
        } else {
            this.device.gl.disableVertexAttribArray(4);
            this.device.gl.vertexAttribI4ui(4, 0, 0, 0, 0);
        }

        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['bone_weight']);
        const stride_weights = char.maxJointsPerVertex * 4;
        this.device.gl.enableVertexAttribArray(5);
        this.device.gl.vertexAttribPointer(5, 4, this.device.gl.FLOAT, false, stride_weights, 0)
        if(char.maxJointsPerVertex > 4){
            this.device.gl.enableVertexAttribArray(6);
            this.device.gl.vertexAttribPointer(6, 4, this.device.gl.FLOAT, false, stride_weights, 16)
        } else {
            this.device.gl.disableVertexAttribArray(6);
            this.device.gl.vertexAttrib4f(6, 0.0, 0.0, 0.0, 0.0);
        }

        this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers!["indices"]);

        this.device.gl.uniform1i(this.maskPipelineInfo!.progUniforms[`u_image_bs`], 0);
        this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 0);
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, currentMeshInfo.textures!["u_image_bs"]);

        this.device.gl.drawElements(this.device.gl.TRIANGLES, char.mesh[mesh_index].triangles.itemSize(), this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)!, 0);
    }
    this.device.gl.bindFramebuffer(this.device.gl.DRAW_FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    this.device.gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, this.device.gl.COLOR_BUFFER_BIT, this.device.gl.NEAREST);

    // render color
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT | this.device.gl.DEPTH_BUFFER_BIT);
    this.device.gl.useProgram(this.meshPipelineInfo!.program);
    this.device.gl.uniformMatrix4fv(this.meshPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat);
    this.device.gl.uniformMatrix2fv(this.meshPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat);
    
    // 上传骨骼数据到 Mesh Pass
    {
      const matrixDataSize = this.meshStatistics.max_bones * 16;
      const matrixData = this._ub_rig_info_data.subarray(0, matrixDataSize);
      this.device.gl.uniformMatrix4fv(this.meshPipelineInfo.progUniforms['u_joint_matrices'], false, matrixData);

      if (this.meshStatistics.max_bs_count > 0) {
         const weightData = this._ub_rig_info_data.subarray(matrixDataSize);
         this.device.gl.uniform4fv(this.meshPipelineInfo.progUniforms['u_bs_weights'], weightData);
      }
    }

    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      const currentMeshInfo = this.meshInfos[mesh_index];
      let PCAModel = currentMeshInfo.texturePCAModels[frame_data.mesh[mesh_index].textureModelIndex];

      if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
        ub_rig_info_data_offset = this.meshStatistics.max_bones * 16;
        let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count);
        for (let i = 0; i < effective_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1];
        for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0;

        // 更新 BlendShape 权重 (Mesh Pass)
        const matrixDataSize = this.meshStatistics.max_bones * 16;
        const weightData = this._ub_rig_info_data.subarray(matrixDataSize);
        this.device.gl.uniform4fv(this.meshPipelineInfo.progUniforms['u_bs_weights'], weightData);
      }

      let flags = 0;
      if (char.mesh[mesh_index].opacity) flags += 1;
      if (this.LUTTexture !== null) flags += 2;
      if(PCAModel.unsigned)flags += 4;

      for (const var_name in currentMeshInfo.uniformUInts)this.device.gl.uniform1ui(this.meshPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name]);
      this.device.gl.uniform1ui(this.meshPipelineInfo!.progUniforms['flags'], flags);
      this.device.gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_gamma'], this.currentGamma.r, this.currentGamma.g, this.currentGamma.b);
      this.device.gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_color_balance'], this.currentColorBalance.rc, this.currentColorBalance.gm, this.currentColorBalance.by);

      // 移除 UBO 绑定
      // this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_rig_info']);
      // this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, this._ub_rig_info_data, this.device.gl.DYNAMIC_DRAW);
      // this.device.gl.bindBufferBase(this.device.gl.UNIFORM_BUFFER, 0, currentMeshInfo.buffers!["ub_rig_info"]);

      let effective_pca_component_count = Math.min(frame_data.mesh[mesh_index].texturePCAWeights.length + 1, this._ub_pca_info_data!.length);
      this._ub_pca_info_data![0] = 1.0;
      for (let i = 1; i < effective_pca_component_count; i++)this._ub_pca_info_data![i] = frame_data.mesh[mesh_index].texturePCAWeights[i - 1];
      if(PCAModel.scalingFactor){
        for (let i = 0; i < effective_pca_component_count; i++)this._ub_pca_info_data![i] *= PCAModel.scalingFactor[i];
      }
      for (let i = effective_pca_component_count; i < this.meshStatistics.max_pca_component_count; i++)this._ub_pca_info_data![i] = 0.0;
      this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_pca_info']);
      this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, this._ub_pca_info_data, this.device.gl.DYNAMIC_DRAW);
      this.device.gl.bindBufferBase(this.device.gl.UNIFORM_BUFFER, 1, currentMeshInfo.buffers!["ub_pca_info"]);

      // this.device.gl.bindVertexArray(currentMeshInfo.VAO);
      // 手动绑定 Attributes (Color Pass)
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['pos']);
      this.device.gl.enableVertexAttribArray(0);
      this.device.gl.vertexAttribPointer(0, 3, this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data)!, false, 0, 0);

      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['tex_coord']);
      this.device.gl.enableVertexAttribArray(1);
      this.device.gl.vertexAttribPointer(1, 2, this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data)!, true, 0, 0);

      if(char.mesh[mesh_index].opacity){
        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['opacity']);
        this.device.gl.enableVertexAttribArray(2);
        this.device.gl.vertexAttribPointer(2, 1, this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data)!, true, 0, 0);
      } else {
        this.device.gl.disableVertexAttribArray(2);
      }

      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['bone_indices']);
        const stride_indices = char.maxJointsPerVertex;
        this.device.gl.enableVertexAttribArray(3);
        this.device.gl.vertexAttribIPointer(3, 4, this.device.gl.UNSIGNED_BYTE, stride_indices, 0);
        if(char.maxJointsPerVertex > 4){
            this.device.gl.enableVertexAttribArray(4);
            this.device.gl.vertexAttribIPointer(4, 4, this.device.gl.UNSIGNED_BYTE, stride_indices, 4);
        } else {
            this.device.gl.disableVertexAttribArray(4);
            this.device.gl.vertexAttribI4ui(4, 0, 0, 0, 0);
        }

        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers!['bone_weight']);
        const stride_weights = char.maxJointsPerVertex * 4;
        this.device.gl.enableVertexAttribArray(5);
        this.device.gl.vertexAttribPointer(5, 4, this.device.gl.FLOAT, false, stride_weights, 0)
        if(char.maxJointsPerVertex > 4){
            this.device.gl.enableVertexAttribArray(6);
            this.device.gl.vertexAttribPointer(6, 4, this.device.gl.FLOAT, false, stride_weights, 16)
        } else {
            this.device.gl.disableVertexAttribArray(6);
            this.device.gl.vertexAttrib4f(6, 0.0, 0.0, 0.0, 0.0);
        }
      
      this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers!["indices"]);

      this.device.gl.uniform1i(this.meshPipelineInfo!.progUniforms[`u_image_bs`], 0);
      this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 0);
      this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, currentMeshInfo.textures!["u_image_bs"]);
      this.device.gl.uniform1i(this.meshPipelineInfo!.progUniforms[`u_image_pca`], 1);
      this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 1);
      if(PCAModel.texture)this.device.gl.bindTexture(this.device.gl.TEXTURE_2D_ARRAY, PCAModel.texture);
      this.device.gl.uniform1i(this.meshPipelineInfo!.progUniforms[`u_image_lut`], 2);
      if (this.LUTTexture) {
        this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 2);
        this.device.gl.bindTexture(this.device.gl.TEXTURE_3D, this.LUTTexture);
      }
      this.device.gl.drawElements(this.device.gl.TRIANGLES, char.mesh[mesh_index].triangles.itemSize(), this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)!, 0);
    }

    this.device.gl.bindFramebuffer(this.device.gl.DRAW_FRAMEBUFFER, this.FrameBuffer_meshColor);
    this.device.gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, this.device.gl.COLOR_BUFFER_BIT, this.device.gl.NEAREST);
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, null);
  }

  constructor(device: GLDeviceMP) {
    this.device = device;
    this.reinitialize();
  }
  public reinitialize(){
    this.compat_features = {};
    this.compat_features["OES_texture_float_linear"] = this.device.gl.getExtension("OES_texture_float_linear");
    this.compat_features["OES_texture_half_float_linear"] = this.device.gl.getExtension("OES_texture_half_float_linear");
    this.assembleBackgroundPipeline();
    if(this.charData)this.assembleMeshPipelines(this.charData);
  }
  public setCharData(charData?: GLPipelineCharData) {
    if(charData?.char){
      this.charData = charData;
      this.assembleMeshPipelines(this.charData);
    }
    else this.charData = null;
  }
  public setGamma(gammaR: number, gammaG: number, gammaB: number) {
    this.currentGamma = { r: gammaR, g: gammaG, b: gammaB };
  }
  public setColorBalance(rc: number, gm: number, by: number) {
    this.currentColorBalance = { rc: rc, gm: gm, by: by };
  }
  public setFaceAlignmentConfig(config?: {
    offsetXPx?: number;
    offsetYPx?: number;
    headMotionScale?: number;
    exprMotionScale?: number;
    eyeExtraScale?: number;
  }) {
    if (!config) return;
    if (Number.isFinite(config.offsetXPx)) this.faceOffsetXPx = Number(config.offsetXPx);
    if (Number.isFinite(config.offsetYPx)) this.faceOffsetYPx = Number(config.offsetYPx);
    if (Number.isFinite(config.headMotionScale)) this.headMotionScale = Number(config.headMotionScale);
    if (Number.isFinite(config.exprMotionScale)) this.exprMotionScale = Number(config.exprMotionScale);
    if (Number.isFinite(config.eyeExtraScale)) this.eyeExtraScale = Number(config.eyeExtraScale);
  }
  
  /**
   * 根据视频内容分辨率与画布分辨率自动计算 aspect-ratio-correct transform。
   * 等效于 Web SDK 在 AvatarRenderer.style() 里把 canvas 设成内容分辨率的效果。
   * 策略：cover 模式（填满画布，居中裁剪溢出部分）。
   */
  private autoComputeTransform(imageWidth: number, imageHeight: number): void {
    if (!this.charData || imageWidth <= 0 || imageHeight <= 0) return;
    const contentW = Math.round(imageWidth / 2);
    const contentH = imageHeight;
    const canvasW = this.device.gl.drawingBufferWidth;
    const canvasH = this.device.gl.drawingBufferHeight;
    if (canvasW <= 0 || canvasH <= 0) return;

    const contentAR = contentW / contentH;
    const canvasAR = canvasW / canvasH;

    let scaleX = 1.0, scaleY = 1.0, offsetX = 0.0, offsetY = 0.0;

    if (canvasAR < contentAR - 0.001) {
      scaleX = contentAR / canvasAR;
      offsetX = -(scaleX - 1) / 2;
    } else if (canvasAR > contentAR + 0.001) {
      scaleY = canvasAR / contentAR;
      offsetY = (1 - scaleY) / 2;
    }

    this.charData.transform.scaleX = scaleX;
    this.charData.transform.scaleY = scaleY;
    this.charData.transform.offsetX = offsetX;
    this.charData.transform.offsetY = offsetY;
  }

  public renderFrame(
    image: ArrayBuffer | Uint8Array | null,
    frame: IBRAnimationFrameData_NN | null,
    background: ArrayBuffer | null,
    transform: {
      offsetX: number;
      offsetY: number;
      scaleX: number;
      scaleY: number;
    } | null,
    imageWidth: number,
    imageHeight: number
  ) {
    this.autoComputeTransform(imageWidth, imageHeight);

    this.initFrame();
    if (null !== this.charData && null !== this.charData.char && frame){
        this.renderMesh(this.charData!, frame, imageWidth, imageHeight);
    }
    this.renderBackground(background, image as ArrayBuffer, transform ?? (null === this.charData ? null : this.charData.transform), imageWidth, imageHeight);
    
    this.device.gl.flush();
  }

  /**
   * 画布尺寸变更时重建 FBO/纹理，使渲染与当前 gl.drawingBufferWidth/Height 一致。
   * 调用前应由外部设置好 canvas.width / canvas.height。
   */
  public resizeFramebuffers(): void {
    const gl = this.device.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (width <= 0 || height <= 0) return;

    const data = this.charData;
    const multisample = data?.multisample ?? 0;

    if (this.FrameBuffer_MSAA) {
      gl.deleteFramebuffer(this.FrameBuffer_MSAA);
      this.FrameBuffer_MSAA = null;
    }
    if (this.FrameBuffer_meshColor) {
      gl.deleteFramebuffer(this.FrameBuffer_meshColor);
      this.FrameBuffer_meshColor = null;
    }
    if (this.FrameBuffer_meshAlpha) {
      gl.deleteFramebuffer(this.FrameBuffer_meshAlpha);
      this.FrameBuffer_meshAlpha = null;
    }
    if (this.maskDepthBuffer) {
      gl.deleteRenderbuffer(this.maskDepthBuffer);
      this.maskDepthBuffer = null;
    }
    if (this.maskColorBuffer) {
      gl.deleteRenderbuffer(this.maskColorBuffer);
      this.maskColorBuffer = null;
    }
    if (this.FrameTexture_meshColor) {
      gl.deleteTexture(this.FrameTexture_meshColor);
      this.FrameTexture_meshColor = null;
    }
    if (this.FrameTexture_meshAlpha) {
      gl.deleteTexture(this.FrameTexture_meshAlpha);
      this.FrameTexture_meshAlpha = null;
    }

    this.FrameTexture_meshColor = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshColor);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this.FrameTexture_meshAlpha = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.FrameTexture_meshAlpha);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this.maskDepthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.maskDepthBuffer);
    if (multisample > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, multisample, gl.DEPTH_COMPONENT16, width, height);
    else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

    this.maskColorBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.maskColorBuffer);
    if (multisample > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, multisample, gl.RGBA8, width, height);
    else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);

    this.FrameBuffer_MSAA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.maskColorBuffer!);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.maskDepthBuffer!);

    this.FrameBuffer_meshColor = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshColor);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FrameTexture_meshColor!, 0);

    this.FrameBuffer_meshAlpha = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FrameTexture_meshAlpha!, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  public destroy(): void {
    if (this.meshInfos) {
        this.meshInfos.forEach(meshInfo => {
            if (meshInfo.VAO) this.device.gl.deleteVertexArray(meshInfo.VAO);
            Object.values(meshInfo.buffers).forEach(buffer => buffer && this.device.gl.deleteBuffer(buffer));
            Object.values(meshInfo.textures).forEach(texture => texture && this.device.gl.deleteTexture(texture));
            meshInfo.texturePCAModels.forEach(pcaModel => pcaModel.texture && this.device.gl.deleteTexture(pcaModel.texture));
        });
        this.meshInfos = [];
    }
    if (this.FrameBuffer_MSAA) this.device.gl.deleteFramebuffer(this.FrameBuffer_MSAA);
    if (this.FrameBuffer_meshColor) this.device.gl.deleteFramebuffer(this.FrameBuffer_meshColor);
    if (this.FrameBuffer_meshAlpha) this.device.gl.deleteFramebuffer(this.FrameBuffer_meshAlpha);
    if (this.maskDepthBuffer) this.device.gl.deleteRenderbuffer(this.maskDepthBuffer);
    if (this.maskColorBuffer) this.device.gl.deleteRenderbuffer(this.maskColorBuffer);
    if (this.FrameTexture_meshColor) this.device.gl.deleteTexture(this.FrameTexture_meshColor);
    if (this.FrameTexture_meshAlpha) this.device.gl.deleteTexture(this.FrameTexture_meshAlpha);
    if (this.LUTTexture) this.device.gl.deleteTexture(this.LUTTexture);
    if (this.meshPipelineInfo?.program) this.device.gl.deleteProgram(this.meshPipelineInfo.program);
    if (this.maskPipelineInfo?.program) this.device.gl.deleteProgram(this.maskPipelineInfo.program);

    this.device.destroy?.();
  }
}
