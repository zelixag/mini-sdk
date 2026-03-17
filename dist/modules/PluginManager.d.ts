import { ITextProcessorPlugin, IPluginConfig } from "../types/plugin";
/**
 * 极简插件管理器
 * 只支持注册KA插件和自定义插件，注册即启用
 */
export default class PluginManager {
    private plugin;
    private config;
    private buffer;
    /**
     * 注册KA意图插件
     * @param config 插件配置
     */
    registerKAIntentPlugin(config?: IPluginConfig): void;
    /**
     * 注册自定义插件（如有需要）
     * @param plugin 自定义插件
     * @param config 插件配置
     */
    registerCustomPlugin(plugin: ITextProcessorPlugin, config?: IPluginConfig): void;
    /**
     * 处理文本，应用当前已注册插件，带缓冲区逻辑
     * @param text 原始文本
     * @param isStart 是否为开始
     * @param isEnd 是否为结束
     * @returns 处理后的文本及isStart/isEnd标志
     */
    processText(text: string, isStart?: boolean, isEnd?: boolean): {
        ssml: string;
        isStart: boolean;
        isEnd: boolean;
    } | undefined;
}
