import fs from 'fs/promises';
import path from 'path';

// 核心配置
const config = {
    // 替换规则列表: [[原字符串, 目标字符串], ...]
    replaceRules: [["XmovAvatar", "LiteAvatar"], ["XMOV AVATAR", "Lite AVATAR"]],
    // 目标路径列表: 可包含文件或文件夹路径
    targetPaths: [
        "./src",  // 文件夹
        "./package.json",  // package.json
    ],
    // 是否递归处理文件夹中的子文件夹
    recursive: true,
    // 跳过的文件/文件夹（支持通配符）
    skipPatterns: ["node_modules", "dist", "app", "docs", ".git", "*.log"]
};

/**
 * 检查路径是否需要跳过
 * @param {string} path - 要检查的路径
 * @returns {boolean} 是否需要跳过
 */
function shouldSkip(path) {
    const baseName = path.split(/[\\/]/).pop();
    return config.skipPatterns.some(pattern => {
        // 简单通配符匹配（*匹配任意字符）
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        return regex.test(baseName);
    });
}

/**
 * 替换单个文件中的字符串
 * @param {string} filePath - 文件路径
 */
async function replaceInFile(filePath) {
    if (shouldSkip(filePath)) {
        return;
    }

    try {
        // 检查文件大小，跳过大型文件
        const stats = await fs.stat(filePath);
        if (stats.size > 10 * 1024 * 1024) { // 大于10MB
            return;
        }

        // 读取并替换内容
        let content = await fs.readFile(filePath, 'utf8');
        let modifiedContent = content;

        config.replaceRules.forEach(([oldStr, newStr]) => {
            modifiedContent = modifiedContent.replace(new RegExp(oldStr, 'g'), newStr);
        });

        // 内容有变化才写入
        if (modifiedContent !== content) {
            await fs.writeFile(filePath, modifiedContent, 'utf8');
        }
    } catch (err) {
    }
}

/**
 * 处理单个文件夹
 * @param {string} dirPath - 文件夹路径
 */
async function processDirectory(dirPath) {
    if (shouldSkip(dirPath)) {
        return;
    }

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                if (config.recursive) {
                    await processDirectory(fullPath);
                }
            } else if (entry.isFile()) {
                await replaceInFile(fullPath);
            }
        }
    } catch (err) {
    }
}

/**
 * 处理单个路径（文件或文件夹）
 * @param {string} targetPath - 目标路径
 */
async function processPath(targetPath) {
    const resolvedPath = path.resolve(targetPath);
    
    try {
        const stats = await fs.stat(resolvedPath);
        
        if (stats.isFile()) {
            await replaceInFile(resolvedPath);
        } else if (stats.isDirectory()) {
            await processDirectory(resolvedPath);
        } else {
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
        } else {
        }
    }
}

/**
 * 主函数：处理所有目标路径
 */
async function main() {
    // 遍历处理所有目标路径
    for (const path of config.targetPaths) {
        await processPath(path);
    }
}

// 启动执行
main();
    