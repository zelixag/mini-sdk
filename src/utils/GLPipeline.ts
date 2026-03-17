// @ts-nocheck
import { GLDevice } from './GLDevice'
import { RigidTransform, IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, TextureFloat_3D } from './DataInterface'
import { mmul, flatten } from './Math'
import { performanceConstant } from "./perfermance";

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

  return { vertex: vs_mesh, fragment_mask: fs_mask, fragment: fs_mesh };
}

const uniform_var_list_mesh = [
  "u_proj_mat", "u_transform_2d", "u_image", "u_image_bs", "u_image_pca", "u_image_lut", "u_bs_count", "flags", "u_gamma", "u_color_balance"
];
const uniform_block_list_mesh = [
  "ub_pca_info", "ub_rig_info"
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

export interface GLPipelineFrameData {
  backgroundTexture: HTMLImageElement | HTMLVideoElement | null,
  charBodyTexture: HTMLImageElement | HTMLVideoElement,
  data: IBRAnimationFrameData_NN | null,
  onPostRender: (pipeline: GLPipeline) => GLPipelineFrameData | null // used for capturing rendered images.
}

export class GLPipeline {
  public readonly device: GLDevice;
  private compat_features: { [index: string]: unknown } = {};

  private charData: GLPipelineCharData | null = null;
  private backgroundPipelineInfo!: PipelineInfo
  private backgroundVAO!: WebGLVertexArrayObject;
  private backgroundTextures: { [index: string]: WebGLTexture } = {};
  private backgroundTextureSrc: unknown = null;

  private meshPipelineInfo: PipelineInfo | null = null;
  private maskPipelineInfo: PipelineInfo | null = null;
  private meshInfos: Array<MeshInfo> = [];
  private meshStatistics: MeshStatistics = {
    max_pca_component_count: 4,
    max_bs_count: 4,
    max_bones: 1
  };

  private FrameTexture_meshColor: WebGLTexture | null = null;
  private FrameTexture_meshAlpha: WebGLTexture | null = null;
  private LUTTexture: WebGLTexture | null = null;

  private FrameBuffer_MSAA: WebGLFramebuffer | null = null;
  private FrameBuffer_meshColor: WebGLFramebuffer | null = null;
  private FrameBuffer_meshAlpha: WebGLFramebuffer | null = null;
  private initSkeletonStatus: RigidTransform[] = [];

  private frameDataCallback: () => GLPipelineFrameData | null = () => null;

  private currentGamma: {r: number, g: number, b: number } = { r: 1.0, g: 1.0, b: 1.0 };
  private currentColorBalance: { rc: number, gm: number, by: number } = { rc: 0.0, gm: 0.0, by: 0.0 };

  private _ub_rig_info_data: Float32Array | null = null;
  private _ub_pca_info_data: Float32Array | null = null;

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
    if (!textures["u_image_bg"]) throw new Error('WebGL texture creation failed.');
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, textures["u_image_bg"])
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE)
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.LINEAR)

    textures["u_image_char_body"] = this.device.gl.createTexture();
    if (!textures["u_image_char_body"]) throw new Error('WebGL texture creation failed.');
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
    this.device.gl.uniformBlockBinding(this.meshPipelineInfo.program, this.meshPipelineInfo.progUniformBlocks["ub_rig_info"], 0);
    this.device.gl.uniformBlockBinding(this.meshPipelineInfo.program, this.meshPipelineInfo.progUniformBlocks["ub_pca_info"], 1);

    program = this.device.compileShaderProgram({vertex: shader.vertex, fragment: shader.fragment_mask});
    progUniforms = this.device.getShaderProgramUniformLocation(program, uniform_var_list_mesh);
    progUniformBlocks = this.device.getShaderProgramUniformBlockLocation(program, uniform_block_list_mesh);
    this.maskPipelineInfo = {
      program: program,
      progUniforms: progUniforms,
      progUniformBlocks: progUniformBlocks,
    };
    this.device.gl.uniformBlockBinding(this.maskPipelineInfo.program, this.maskPipelineInfo.progUniformBlocks["ub_rig_info"], 0);

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
      this.device.gl.bindVertexArray(currentMeshInfo.VAO);
      
      if(null === this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data))throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].blendshapes.data}`);
      currentMeshInfo.buffers['pos'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['pos']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].blendshapes.part(0).data, this.device.gl.STATIC_DRAW);
      this.device.gl.enableVertexAttribArray(0);
      this.device.gl.vertexAttribPointer(0, 3, this.device.getGLArrayElementType(char.mesh[mesh_index].blendshapes.data)!, false, 0, 0);

      if(null === this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data))throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].UVCoord.data}`);
      currentMeshInfo.buffers['tex_coord'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['tex_coord']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].UVCoord.data, this.device.gl.STATIC_DRAW);
      this.device.gl.enableVertexAttribArray(1);
      this.device.gl.vertexAttribPointer(1, 2, this.device.getGLArrayElementType(char.mesh[mesh_index].UVCoord.data)!, true, 0, 0);

      if(char.mesh[mesh_index].opacity){
        if(null === this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data))throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].opacity!.data}`);
        currentMeshInfo.buffers['opacity'] = this.device.gl.createBuffer();
        this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['opacity']);
        this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].opacity!.data, this.device.gl.STATIC_DRAW);
        this.device.gl.enableVertexAttribArray(2);
        this.device.gl.vertexAttribPointer(2, 1, this.device.getGLArrayElementType(char.mesh[mesh_index].opacity!.data)!, true, 0, 0);
      }

      currentMeshInfo.buffers['bone_indices'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_indices']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].jointIndex, this.device.gl.STATIC_DRAW);
      this.device.gl.enableVertexAttribArray(3);
      this.device.gl.vertexAttribIPointer(3, 4, this.device.gl.UNSIGNED_BYTE, 8, 0);
      this.device.gl.enableVertexAttribArray(4);
      this.device.gl.vertexAttribIPointer(4, 4, this.device.gl.UNSIGNED_BYTE, 8, 4);

      currentMeshInfo.buffers['bone_weight'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, currentMeshInfo.buffers['bone_weight']);
      this.device.gl.bufferData(this.device.gl.ARRAY_BUFFER, char.mesh[mesh_index].jointWeight, this.device.gl.STATIC_DRAW);
      this.device.gl.enableVertexAttribArray(5);
      this.device.gl.vertexAttribPointer(5, 4, this.device.gl.FLOAT, false, 32, 0)
      this.device.gl.enableVertexAttribArray(6);
      this.device.gl.vertexAttribPointer(6, 4, this.device.gl.FLOAT, false, 32, 16)
      this.device.gl.bindBuffer(this.device.gl.ARRAY_BUFFER, null);

      if(null === this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data))throw new Error(`Data type unsupported by WebGL: ${char.mesh[mesh_index].triangles.data}`);
      currentMeshInfo.buffers['indices'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers['indices']);
      this.device.gl.bufferData(this.device.gl.ELEMENT_ARRAY_BUFFER, char.mesh[mesh_index].triangles.data, this.device.gl.STATIC_DRAW);

      currentMeshInfo.buffers['ub_pca_info'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_pca_info']);
      this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_pca_component_count), this.device.gl.DYNAMIC_DRAW);

      currentMeshInfo.buffers['ub_rig_info'] = this.device.gl.createBuffer();
      this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers['ub_rig_info']);
      this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, new Float32Array(meshStatistics.max_bones * 16 + meshStatistics.max_bs_count), this.device.gl.DYNAMIC_DRAW);

      this.device.gl.bindVertexArray(null);

      // Create texture

      // blendshape texture
      if (char.mesh[mesh_index].blendshapes.size[0] > 1){
        let bs_texture_size = [Math.ceil((char.mesh[mesh_index].blendshapes.size[0] - 1) / 4), char.mesh[mesh_index].blendshapes.size[1] * char.mesh[mesh_index].blendshapes.size[2]];
        // reshape the texture into a square one
        let square_bs_texture_size = Math.ceil(Math.sqrt(bs_texture_size[0] * bs_texture_size[1]));
        let bs_vec_stride = bs_texture_size[0] * 4;
        // let texture_row_stride = square_bs_texture_size * 4;
        let bs_texture_data = new Float32Array(square_bs_texture_size * square_bs_texture_size * 4);
        for (let i = 0; i < bs_texture_size[1]; i++) {
          for (let j = 1; j < char.mesh[mesh_index].blendshapes.size[0]; j++)bs_texture_data[i * bs_vec_stride + (j - 1)] = char.mesh[mesh_index].blendshapes.data[j * bs_texture_size[1] + i] as number;
          for (let j = char.mesh[mesh_index].blendshapes.size[0] - 1; j < bs_vec_stride; j++)bs_texture_data[i * bs_vec_stride + j] = 0.0;
        }
        currentMeshInfo.textures["u_image_bs"] = this.device.gl.createTexture();
        if (!currentMeshInfo.textures["u_image_bs"]) throw new Error('WebGL texture creation failed.');
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, currentMeshInfo.textures["u_image_bs"]);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
        this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
        this.device.texImage2D(this.device.gl.TEXTURE_2D, 0, square_bs_texture_size, square_bs_texture_size, this.device.gl.RGBA, bs_texture_data);

        currentMeshInfo.uniformUInts["u_bs_count"] = bs_texture_size[0];
      }
      else currentMeshInfo.uniformUInts["u_bs_count"] = 0;

      // PCA textures
      for (let pca_model of char.mesh[mesh_index].textureModels) {
        let pca_texture = this.device.gl.createTexture();
        if (!pca_texture) throw new Error('WebGL texture creation failed.');
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
          // for every component, calculate their scale factor and round (-1, 1) to (0, 255)
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
    this.FrameTexture_meshColor = this.device.gl.createTexture();
    if (!this.FrameTexture_meshColor) throw Error('WebGL texture creation failed.');
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
    this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGBA8, this.device.canvas.width, this.device.canvas.height, 0, this.device.gl.RGBA, this.device.gl.UNSIGNED_BYTE, null);
    
    this.FrameTexture_meshAlpha = this.device.gl.createTexture();
    if (!this.FrameTexture_meshAlpha) throw Error('WebGL texture creation failed.');
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.NEAREST);
    this.device.gl.texParameteri(this.device.gl.TEXTURE_2D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.NEAREST);
    this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGBA8, this.device.canvas.width, this.device.canvas.height, 0, this.device.gl.RGBA, this.device.gl.UNSIGNED_BYTE, null);

    // depth renderbuffer for mask rendering
    const maskDepthBuffer = this.device.gl.createRenderbuffer();
    this.device.gl.bindRenderbuffer(this.device.gl.RENDERBUFFER, maskDepthBuffer);
    if(data.multisample && data.multisample > 1)this.device.gl.renderbufferStorageMultisample(this.device.gl.RENDERBUFFER, data.multisample, this.device.gl.DEPTH_COMPONENT16, this.device.canvas.width, this.device.canvas.height);
    else this.device.gl.renderbufferStorage(this.device.gl.RENDERBUFFER, this.device.gl.DEPTH_COMPONENT16, this.device.canvas.width, this.device.canvas.height);

    const maskColorBuffer = this.device.gl.createRenderbuffer();
    this.device.gl.bindRenderbuffer(this.device.gl.RENDERBUFFER, maskColorBuffer);
    if(data.multisample && data.multisample > 1)this.device.gl.renderbufferStorageMultisample(this.device.gl.RENDERBUFFER, data.multisample, this.device.gl.RGBA8, this.device.canvas.width, this.device.canvas.height);
    else this.device.gl.renderbufferStorage(this.device.gl.RENDERBUFFER, this.device.gl.RGBA8, this.device.canvas.width, this.device.canvas.height);

    this.FrameBuffer_MSAA = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.framebufferRenderbuffer(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.RENDERBUFFER, maskColorBuffer);
    this.device.gl.framebufferRenderbuffer(this.device.gl.FRAMEBUFFER, this.device.gl.DEPTH_ATTACHMENT, this.device.gl.RENDERBUFFER, maskDepthBuffer);

    this.FrameBuffer_meshColor = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshColor);
    this.device.gl.framebufferTexture2D(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor, 0);

    this.FrameBuffer_meshAlpha = this.device.gl.createFramebuffer();
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    this.device.gl.framebufferTexture2D(this.device.gl.FRAMEBUFFER, this.device.gl.COLOR_ATTACHMENT0, this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha, 0);

    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, null);

    this.initSkeletonStatus = char.evalSkeleton();

    // LUT textures
    if (data.LUT === null)this.LUTTexture = null;
    else {
      this.LUTTexture = this.device.gl.createTexture();
      if (!this.LUTTexture) throw new Error('WebGL texture creation failed.');
      this.device.gl.bindTexture(this.device.gl.TEXTURE_3D, this.LUTTexture);
      this.device.gl.texParameteri(this.device.gl.TEXTURE_3D, this.device.gl.TEXTURE_WRAP_R, this.device.gl.CLAMP_TO_EDGE);
      this.device.gl.texParameteri(this.device.gl.TEXTURE_3D, this.device.gl.TEXTURE_WRAP_S, this.device.gl.CLAMP_TO_EDGE);
      this.device.gl.texParameteri(this.device.gl.TEXTURE_3D, this.device.gl.TEXTURE_WRAP_T, this.device.gl.CLAMP_TO_EDGE);
      this.device.gl.texParameteri(this.device.gl.TEXTURE_3D, this.device.gl.TEXTURE_MIN_FILTER, this.device.gl.LINEAR);
      this.device.gl.texParameteri(this.device.gl.TEXTURE_3D, this.device.gl.TEXTURE_MAG_FILTER, this.device.gl.LINEAR);
      if(this.compat_features["OES_texture_float_linear"]){
        this.device.texImage3D(this.device.gl.TEXTURE_3D, 0, data.LUT.size[1], data.LUT.size[2], data.LUT.size[0], this.device.gl.RGB, data.LUT.data);
      }
      else {
        // this will reduce the quality of LUT color correction significantly
        const roundedTexture = new Uint8Array(data.LUT.size[0] * data.LUT.size[1] * data.LUT.size[2] * 3);
        // for the mean texture, convert float to uint8 directly
        for(let j = 0; j < roundedTexture.length; j++)roundedTexture[j] = Math.round(data.LUT.data[j] * 255.0);
        this.device.texImage3D(this.device.gl.TEXTURE_3D, 0, data.LUT.size[1], data.LUT.size[2], data.LUT.size[0], this.device.gl.RGB, roundedTexture);
      }
      this.device.gl.bindTexture(this.device.gl.TEXTURE_3D, null);
    }

    this.backgroundTextureSrc = null;
  }
  private initFrame() {
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
  private renderBackground(background: HTMLImageElement | HTMLVideoElement | null, char_body: HTMLImageElement | HTMLVideoElement, transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number; } | null) {
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
    this.device.gl.bindVertexArray(this.backgroundVAO);

    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_bg`], 0);
    if (background !== null) {
      this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 0);
      this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.backgroundTextures!["u_image_bg"]);
      if (this.backgroundTextureSrc !== background) {
        this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGB, this.device.gl.RGB, this.device.gl.UNSIGNED_BYTE, background);
        this.backgroundTextureSrc = background;
      }
    }
    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_char_body`], 1);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 1);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.backgroundTextures!["u_image_char_body"]);
    
    // [DEBUG] 数据流追踪：纹理上传
    try {
      (window as any).avatarSDKLogger?.log('[DEBUG] GLPipeline.renderBackground - texImage2D:', {
        hasCharBody: !!char_body,
        charBodyType: typeof char_body,
        charBodyKeys: char_body ? Object.keys(char_body) : [],
        charBodyWidth: char_body?.displayWidth || char_body?.width,
        charBodyHeight: char_body?.displayHeight || char_body?.height,
        isVideoFrame: char_body && typeof char_body.close === 'function',
        isImageBitmap: char_body && typeof char_body.close === 'function' && char_body.width !== undefined
      });
      
      this.device.gl.texImage2D(this.device.gl.TEXTURE_2D, 0, this.device.gl.RGB, this.device.gl.RGB, this.device.gl.UNSIGNED_BYTE, char_body);
      
      (window as any).avatarSDKLogger?.log('[DEBUG] GLPipeline.renderBackground - texImage2D success');
    } catch (error) {
      (window as any).avatarSDKLogger?.error('[DEBUG] GLPipeline.renderBackground - texImage2D failed:', error);
      throw error;
    }
    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_mesh_color`], 2);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 2);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshColor);
    this.device.gl.uniform1i(this.backgroundPipelineInfo.progUniforms[`u_image_mesh_alpha`], 3);
    this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 3);
    this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, this.FrameTexture_meshAlpha);
    this.device.gl.drawArrays(this.device.gl.TRIANGLES, 0, 6);
  }
  private renderMesh(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN) {
    this.device.gl.enable(this.device.gl.DEPTH_TEST);
    this.device.gl.disable(this.device.gl.CULL_FACE);
    this.device.gl.disable(this.device.gl.BLEND);

    const char = data.char!;

    let proj_mat = new Float32Array(flatten(mmul(char.cameraConfig.getProjMatrix([this.device.canvas.width, this.device.canvas.height], 200, 800), char.cameraConfig.getExtrinsicMatrix())));
    let transform_2d_mat = new Float32Array([data.transform.scaleX, data.transform.scaleY, (data.transform.scaleX - 1.0) + 2.0 * data.transform.offsetX, (1.0 - data.transform.scaleY) - 2.0 * data.transform.offsetY]);

    let currentSkeletonStatus = char.evalSkeletonFromMovable(frame_data.movableJointTransforms);
    let joint_matrices = Array(char.skeleton.length);
    for (let i = 0; i < char.skeleton.length; i++) {
      const joint_transform = currentSkeletonStatus[i].apply(this.initSkeletonStatus[i].inv()) as RigidTransform;
      joint_matrices[i] = joint_transform.homogeneous_matrix();
    }

    let ub_rig_info_data_offset = 0;
    for (let i = 0; i < Math.min(this.meshStatistics.max_bones, char.skeleton.length); i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++)this._ub_rig_info_data![ub_rig_info_data_offset + j * 4 + k] = joint_matrices[i][k][j];
      }
      ub_rig_info_data_offset += 16;
    }

    // render mask
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.device.gl.clearDepth(1.0);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT | this.device.gl.DEPTH_BUFFER_BIT);

    this.device.gl.useProgram(this.maskPipelineInfo!.program);
    this.device.gl.uniformMatrix4fv(this.maskPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat);
    this.device.gl.uniformMatrix2fv(this.maskPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat);
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      if(char.mesh[mesh_index].genMask){
        const currentMeshInfo = this.meshInfos[mesh_index];

        if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
          ub_rig_info_data_offset = this.meshStatistics.max_bones * 16;
          let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count);
          for (let i = 0; i < effective_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1];
          for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0;
        }

        let flags = 0;
        if (char.mesh[mesh_index].opacity) flags += 1;

        for (const var_name in currentMeshInfo.uniformUInts)this.device.gl.uniform1ui(this.maskPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name]);
        this.device.gl.uniform1ui(this.maskPipelineInfo!.progUniforms['flags'], flags);

        this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_rig_info']);
        this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, this._ub_rig_info_data, this.device.gl.DYNAMIC_DRAW);
        this.device.gl.bindBufferBase(this.device.gl.UNIFORM_BUFFER, 0, currentMeshInfo.buffers!["ub_rig_info"]);

        this.device.gl.bindVertexArray(currentMeshInfo.VAO);
        this.device.gl.bindBuffer(this.device.gl.ELEMENT_ARRAY_BUFFER, currentMeshInfo.buffers!["indices"]);
        this.device.gl.uniform1i(this.maskPipelineInfo!.progUniforms[`u_image_bs`], 0);
        this.device.gl.activeTexture(this.device.gl.TEXTURE0 + 0);
        this.device.gl.bindTexture(this.device.gl.TEXTURE_2D, currentMeshInfo.textures!["u_image_bs"]);

        this.device.gl.drawElements(this.device.gl.TRIANGLES, char.mesh[mesh_index].triangles.itemSize(), this.device.getGLArrayElementType(char.mesh[mesh_index].triangles.data)!, 0);
      }
    }
    this.device.gl.bindFramebuffer(this.device.gl.DRAW_FRAMEBUFFER, this.FrameBuffer_meshAlpha);
    this.device.gl.blitFramebuffer(0, 0, this.device.canvas.width, this.device.canvas.height, 0, 0, this.device.canvas.width, this.device.canvas.height, this.device.gl.COLOR_BUFFER_BIT, this.device.gl.NEAREST);

    // render color
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, this.FrameBuffer_MSAA);
    this.device.gl.clear(this.device.gl.COLOR_BUFFER_BIT | this.device.gl.DEPTH_BUFFER_BIT);
    this.device.gl.useProgram(this.meshPipelineInfo!.program);
    this.device.gl.uniformMatrix4fv(this.meshPipelineInfo!.progUniforms['u_proj_mat'], true, proj_mat);
    this.device.gl.uniformMatrix2fv(this.meshPipelineInfo!.progUniforms['u_transform_2d'], false, transform_2d_mat);
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
      const currentMeshInfo = this.meshInfos[mesh_index];
      let PCAModel = currentMeshInfo.texturePCAModels[frame_data.mesh[mesh_index].textureModelIndex];

      if (char.mesh[mesh_index].blendshapes.size[0] > 1) {
        ub_rig_info_data_offset = this.meshStatistics.max_bones * 16;
        let effective_bs_count = Math.min(char.mesh[mesh_index].blendshapeIndices.length - 1, this.meshStatistics.max_bs_count);
        for (let i = 0; i < effective_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = frame_data.blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[i + 1] - 1];
        for (let i = effective_bs_count; i < this.meshStatistics.max_bs_count; i++)this._ub_rig_info_data![ub_rig_info_data_offset + i] = 0.0;
      }

      let flags = 0;
      if (char.mesh[mesh_index].opacity) flags += 1;
      if (this.LUTTexture !== null) flags += 2;
      if(PCAModel.unsigned)flags += 4;

      for (const var_name in currentMeshInfo.uniformUInts)this.device.gl.uniform1ui(this.meshPipelineInfo!.progUniforms[var_name], currentMeshInfo.uniformUInts[var_name]);
      this.device.gl.uniform1ui(this.meshPipelineInfo!.progUniforms['flags'], flags);
      this.device.gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_gamma'], this.currentGamma.r, this.currentGamma.g, this.currentGamma.b);
      this.device.gl.uniform3f(this.meshPipelineInfo!.progUniforms['u_color_balance'], this.currentColorBalance.rc, this.currentColorBalance.gm, this.currentColorBalance.by);

      this.device.gl.bindBuffer(this.device.gl.UNIFORM_BUFFER, currentMeshInfo.buffers!['ub_rig_info']);
      this.device.gl.bufferData(this.device.gl.UNIFORM_BUFFER, this._ub_rig_info_data, this.device.gl.DYNAMIC_DRAW);
      this.device.gl.bindBufferBase(this.device.gl.UNIFORM_BUFFER, 0, currentMeshInfo.buffers!["ub_rig_info"]);

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

      this.device.gl.bindVertexArray(currentMeshInfo.VAO);
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
    this.device.gl.blitFramebuffer(0, 0, this.device.canvas.width, this.device.canvas.height, 0, 0, this.device.canvas.width, this.device.canvas.height, this.device.gl.COLOR_BUFFER_BIT, this.device.gl.NEAREST);
    this.device.gl.bindFramebuffer(this.device.gl.FRAMEBUFFER, null);
  }

  constructor(device: GLDevice) {
    this.device = device;
    this.reinitialize();
  }
  public reinitialize(){
    this.compat_features = {};
    this.compat_features["OES_texture_float_linear"] = this.device.gl.getExtension("OES_texture_float_linear");  // this extension is essential for loseless PCA texture composition
    this.compat_features["OES_texture_half_float_linear"] = this.device.gl.getExtension("OES_texture_half_float_linear");
    this.assembleBackgroundPipeline();
    if(this.charData)this.assembleMeshPipelines(this.charData);
  }
  public setSyncMedia(syncMedia?: HTMLVideoElement) {
    this.device.run((device) => this._onRender(), syncMedia);
  }
  public setCharData(charData?: GLPipelineCharData) {
    if(charData?.char){
      this.charData = charData;
      this.assembleMeshPipelines(this.charData);
    }
    else this.charData = null;
  }
  public setFrameDataCallback(cb: () => GLPipelineFrameData | null) {
    this.frameDataCallback = cb;
  }
  public setGamma(gammaR: number, gammaG: number, gammaB: number) {
    this.currentGamma = { r: gammaR, g: gammaG, b: gammaB };
  }
  public setColorBalance(rc: number, gm: number, by: number) {
    this.currentColorBalance = { rc: rc, gm: gm, by: by };
  }
  private _onRender() {
    const frameData = this.frameDataCallback();
    if (null !== frameData) {
      this.initFrame();
      if(null !== this.charData && null !== this.charData.char && null !== frameData.data)this.renderMesh(this.charData, frameData.data);
      this.renderBackground(frameData.backgroundTexture, frameData.charBodyTexture, null === this.charData ? null : this.charData.transform);
      if(!this.first_webgl_render) {
        (window as any).performanceTracker.markEnd(performanceConstant.first_webgl_render);
        this.first_webgl_render = true;
      }
      if(null !== frameData.onPostRender)frameData.onPostRender(this);
    }
    
    this.device.gl?.flush();
  }
  public renderFrame(
    image: ImageBitmap | any,
    frame: IBRAnimationFrameData_NN | null,
    background: HTMLImageElement | null,
    transform: {
      offsetX: number;
      offsetY: number;
      scaleX: number;
      scaleY: number;
    } | null
  ) {
    this.initFrame();
    // 检查faceFrame数据是否有效
    if (null !== this.charData && null !== this.charData.char && frame){
        this.renderMesh(this.charData!, frame);
    }
    // 总是渲染背景
    this.renderBackground(background, image, transform ?? (null === this.charData ? null : this.charData.transform));
    if(!this.first_webgl_render) {
      (window as any).performanceTracker.markEnd(performanceConstant.first_webgl_render);
      this.first_webgl_render = true;
    }
    this.device.gl.flush();
  }
  
public destroy(): void {
    // 销毁网格相关资源
    if (this.meshInfos) {
        this.meshInfos.forEach(meshInfo => {
            // 销毁VAO
            if (meshInfo.VAO) {
                this.device.gl.deleteVertexArray(meshInfo.VAO);
            }

            // 销毁缓冲区
            Object.values(meshInfo.buffers).forEach(buffer => {
                if (buffer) {
                    this.device.gl.deleteBuffer(buffer);
                }
            });

            // 销毁纹理
            Object.values(meshInfo.textures).forEach(texture => {
                if (texture) {
                    this.device.gl.deleteTexture(texture);
                }
            });

            // 销毁PCA纹理数组
            meshInfo.texturePCAModels.forEach(pcaModel => {
                if (pcaModel.texture) {
                    this.device.gl.deleteTexture(pcaModel.texture);
                }
            });
        });
        this.meshInfos = [];
    }

    // 销毁帧缓冲和渲染缓冲
    if (this.FrameBuffer_MSAA) {
        this.device.gl.deleteFramebuffer(this.FrameBuffer_MSAA);
        this.FrameBuffer_MSAA = null;
    }
    if (this.FrameBuffer_meshColor) {
        this.device.gl.deleteFramebuffer(this.FrameBuffer_meshColor);
        this.FrameBuffer_meshColor = null;
    }
    if (this.FrameBuffer_meshAlpha) {
        this.device.gl.deleteFramebuffer(this.FrameBuffer_meshAlpha);
        this.FrameBuffer_meshAlpha = null;
    }

    // 销毁帧纹理
    if (this.FrameTexture_meshColor) {
        this.device.gl.deleteTexture(this.FrameTexture_meshColor);
        this.FrameTexture_meshColor = null;
    }
    if (this.FrameTexture_meshAlpha) {
        this.device.gl.deleteTexture(this.FrameTexture_meshAlpha);
        this.FrameTexture_meshAlpha = null;
    }

    // 销毁LUT纹理
    if (this.LUTTexture) {
        this.device.gl.deleteTexture(this.LUTTexture);
        this.LUTTexture = null;
    }

    // 销毁着色器程序
    if (this.meshPipelineInfo?.program) {
        this.device.gl.deleteProgram(this.meshPipelineInfo.program);
        this.meshPipelineInfo.program = null;
    }
    if (this.maskPipelineInfo?.program) {
        this.device.gl.deleteProgram(this.maskPipelineInfo.program);
        this.maskPipelineInfo.program = null;
    }

    // 清除数据数组引用
    this._ub_rig_info_data = null;
    this._ub_pca_info_data = null;

    // 通知设备销毁（如果需要）
    this.device.destroy?.();
  }
}
