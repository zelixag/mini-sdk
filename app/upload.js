import OSS from 'ali-oss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const dotenv = (await import('dotenv')).default;
  dotenv.config(); // 加载 .env，便于本地运行
} catch {
  // dotenv 可选
}

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 阿里云OSS配置（从环境变量读取，勿将密钥提交到仓库）
const ossConfig = {
  region: process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET || 'xmov-youyan'
};
if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
  console.error('Error: Set ALIYUN_OSS_ACCESS_KEY_ID and ALIYUN_OSS_ACCESS_KEY_SECRET in environment or .env');
  process.exit(1);
}

// 不同环境对应的OSS目录
const envMap = {
  develop: 'youling-lite-sdk/develop',
  dev: 'youling-lite-sdk/dev',
  test: 'youling-lite-sdk/test',
  pre: 'youling-lite-sdk/pre',
  gray: 'youling-lite-sdk/gray',
  production: 'youling-lite-sdk/prod'
};


// 获取命令行参数中的环境变量
const env = process.argv[2] || 'production';
const ossDir = envMap[env] || 'prod';

// 构建产物目录
const distDir = path.join(__dirname, 'build');

// 创建OSS客户端
const client = new OSS(ossConfig);

// 递归读取目录下的所有文件
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// 清空OSS目录
async function clearOssDir(dir) {
  try {
    console.log(`Clearing OSS directory: ${dir}...`);
    
    // 列出目录下的所有文件
    let result = await client.list({
      prefix: dir,
      delimiter: '/'
    });
    
    // 删除文件
    if (result.objects && result.objects.length > 0) {
      const deletePromises = result.objects.map(obj => client.delete(obj.name));
      await Promise.all(deletePromises);
      console.log(`Deleted ${result.objects.length} files from ${dir}`);
    }
    
    // 删除子目录
    if (result.prefixes && result.prefixes.length > 0) {
      for (const prefix of result.prefixes) {
        await clearOssDir(prefix);
      }
    }
    
    console.log(`Cleared OSS directory: ${dir} successfully!`);
  } catch (error) {
    console.error(`Failed to clear OSS directory ${dir}:`, error);
    // 清空目录失败不影响上传，继续执行
  }
}

// 上传文件到OSS
async function uploadFile(filePath) {
  try {
    // 计算相对路径
    const relativePath = path.relative(distDir, filePath);
    // OSS目标路径
    const ossPath = path.join(ossDir, relativePath).replace(/\\/g, '/');
    
    console.log(`Uploading ${filePath} to ${ossPath}...`);
    
    // 上传文件
    await client.put(ossPath, filePath);
    
    console.log(`Uploaded ${filePath} successfully!`);
  } catch (error) {
    console.error(`Failed to upload ${filePath}:`, error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log(`Starting upload to OSS for environment: ${env}`);
    console.log(`Target OSS directory: ${ossDir}`);
    
    // 检查build目录是否存在
    if (!fs.existsSync(distDir)) {
      console.error('Error: build directory does not exist. Please run build command first.');
      process.exit(1);
    }
    
    // 清空OSS目录
    await clearOssDir(ossDir);
    
    // 获取所有文件
    const files = getAllFiles(distDir);
    console.log(`Found ${files.length} files to upload.`);
    
    // 上传所有文件
    for (const file of files) {
      await uploadFile(file);
    }
    
    console.log('All files uploaded successfully!');
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

// 执行主函数
main();
