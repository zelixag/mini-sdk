/**
 * Rollup 构建脚本包装器
 * 执行 build-heavy-rollup.js 配置并运行 postbuild 处理
 */

import { rollup } from 'rollup';
import config from './build-heavy-rollup.js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  console.log('[Build] Starting Rollup build...');
  
  try {
    // 执行 Rollup 构建
    const bundle = await rollup(config);
    
    // 写入输出文件
    if (config.output) {
      const outputs = Array.isArray(config.output) ? config.output : [config.output];
      for (const output of outputs) {
        await bundle.write(output);
        console.log(`[Build] Generated: ${output.file}`);
      }
    }
    
    await bundle.close();
    
    console.log('[Build] Rollup build completed!');
    
    // 执行 postbuild 处理
    console.log('[Build] Running postbuild processing...');
    execSync('node postbuild-patch.js', { 
      cwd: __dirname,
      stdio: 'inherit' 
    });
    
    console.log('[Build] All build steps completed!');
  } catch (error) {
    console.error('[Build] Build failed:', error);
    process.exit(1);
  }
}

build();
