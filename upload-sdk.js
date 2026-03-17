import OSS from 'ali-oss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取package.json获取版本号
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = packageJson.version;

// 构建产物目录
const distDir = path.join(__dirname, 'dist');

// OSS 配置从环境变量读取（勿将密钥提交到仓库）
const ossConfig1 = {
  region: process.env.ALIYUN_OSS1_REGION || 'oss-cn-shanghai',
  accessKeyId: process.env.ALIYUN_OSS1_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS1_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS1_BUCKET || 'public-xingyun3d'
};
const ossConfig2 = {
  region: process.env.ALIYUN_OSS2_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.ALIYUN_OSS2_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS2_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS2_BUCKET || 'xmov-youyan'
};
const hasOss1 = ossConfig1.accessKeyId && ossConfig1.accessKeySecret;
const hasOss2 = ossConfig2.accessKeyId && ossConfig2.accessKeySecret;
if (!hasOss1 && !hasOss2) {
  console.error('Error: Set ALIYUN_OSS1_* and/or ALIYUN_OSS2_* env vars (ACCESS_KEY_ID, ACCESS_KEY_SECRET, REGION, BUCKET)');
  process.exit(1);
}

// 创建OSS客户端（仅当对应环境变量已设置时）
const client1 = hasOss1 ? new OSS(ossConfig1) : null;
const client2 = hasOss2 ? new OSS(ossConfig2) : null;

// 获取命令行参数中的模式
const mode = process.argv[2] || 'build';

// 复制文件函数
function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
}

// 上传文件到OSS
async function uploadFile(client, filePath, ossPath) {
  try {
    console.log(`Uploading ${filePath} to ${ossPath}...`);
    await client.put(ossPath, filePath);
    console.log(`Uploaded ${filePath} to ${ossPath} successfully!`);
  } catch (error) {
    console.error(`Failed to upload ${filePath} to ${ossPath}:`, error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log(`Starting upload process for mode: ${mode}`);
    console.log(`Version: ${version}`);
    
    // 检查dist目录是否存在
    if (!fs.existsSync(distDir)) {
      console.error('Error: dist directory does not exist. Please run build command first.');
      process.exit(1);
    }
    
    const indexUmdPath = path.join(distDir, 'index.umd.js');
    
    // 检查index.umd.js是否存在
    if (!fs.existsSync(indexUmdPath)) {
      console.error('Error: index.umd.js does not exist in dist directory.');
      process.exit(1);
    }
    
    if (mode === 'build') {
      // 构建模式：复制文件并上传
      const indexUmdVersionPath = path.join(distDir, `index.umd.${version}.js`);
      const xmovAvatarVersionPath = path.join(distDir, `xmovAvatar.${version}.js`);
      
      // 复制文件
      copyFile(indexUmdPath, indexUmdVersionPath);
      copyFile(indexUmdPath, xmovAvatarVersionPath);

       // 上传到第一个OSS账号
      if (client1) await uploadFile(client1, xmovAvatarVersionPath, `xingyun3d/general/litesdk/xmovAvatar.${version}.js`);
      
      // 上传到第二个OSS账号
      if (client2) await uploadFile(client2, indexUmdVersionPath, `youling-lite-sdk/index.umd.${version}.js`);
      
      // 删除临时文件
      if (fs.existsSync(indexUmdVersionPath)) {
        fs.unlinkSync(indexUmdVersionPath);
        console.log(`Deleted ${indexUmdVersionPath}`);
      }
      if (fs.existsSync(xmovAvatarVersionPath)) {
        fs.unlinkSync(xmovAvatarVersionPath);
        console.log(`Deleted ${xmovAvatarVersionPath}`);
      }
      
      
    } else if (mode === 'lite') {
      // Lite模式：上传为LiteAvatar.version.js
      const liteAvatarPath = path.join(distDir, `LiteAvatar.${version}.js`);
      
      // 复制文件
      copyFile(indexUmdPath, liteAvatarPath);
      
      // 上传到第一个OSS账号
      if (client1) await uploadFile(client1, liteAvatarPath, `xingyun3d/general/litesdk/LiteAvatar.${version}.js`);
      
      // 删除临时文件
      if (fs.existsSync(liteAvatarPath)) {
        fs.unlinkSync(liteAvatarPath);
        console.log(`Deleted ${liteAvatarPath}`);
      }
    }
    
    console.log('All files uploaded successfully!');
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

// 执行主函数
main();
