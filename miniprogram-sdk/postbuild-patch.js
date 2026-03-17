/**
 * Postbuild 处理脚本 - 小程序 SDK
 * 
 * 功能：
 * 1. 路径修正（相对路径）
 * 2. 全局变量替换
 * 3. 代码优化
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

/**
 * 处理单个文件
 */
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // 1. 修正相对路径（如果需要）
  // content = content.replace(/from\s+['"]\.\.\/\.\.\/src\//g, "from '../src/");
  
  // 2. 替换全局变量
  // 确保 globalThis 可用
  if (!content.includes('globalThis')) {
    content = `(function() { if (typeof globalThis === 'undefined') { var globalThis = this; } })();\n${content}`;
  }
  
  // 3. 移除开发环境代码（如果需要）
  // content = content.replace(/console\.(debug|log)\([^)]*\);?/g, '');
  
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[Postbuild] Processed: ${path.relative(distDir, filePath)}`);
}

/**
 * 处理所有构建产物
 */
function processAllFiles(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processAllFiles(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.cjs')) {
      processFile(filePath);
    }
  });
}

/**
 * 主函数
 */
function main() {
  console.log('[Postbuild] Starting postbuild processing...');
  
  if (!fs.existsSync(distDir)) {
    console.error(`[Postbuild] Dist directory not found: ${distDir}`);
    process.exit(1);
  }
  
  processAllFiles(distDir);

  // 拷贝构建产物到 examples
  const srcFile = path.join(distDir, 'xmov-avatar-mp.heavy.js');
  const destDir = path.resolve(__dirname, 'examples', 'basic', 'lib');
  const destFile = path.join(destDir, 'xmov-avatar-mp.heavy.js');
  if (fs.existsSync(srcFile)) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcFile, destFile);
    console.log('[Postbuild] Copied SDK to examples/basic/lib/');
  }
  
  console.log('[Postbuild] Postbuild processing completed!');
}

// 执行
main();
