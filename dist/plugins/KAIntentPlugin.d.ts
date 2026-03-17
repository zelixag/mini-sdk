import { ITextProcessorPlugin, IKAIntentPluginConfig } from "../types/plugin";
/**
 * KA意图处理插件
 */
export declare class KAIntentPlugin implements ITextProcessorPlugin {
    name: string;
    /**
     * 处理文本，添加KA意图标记
     * @param text 原始文本
     * @param config 插件配置
     * @returns 处理后的生成器
     */
    process(text: string, config?: IKAIntentPluginConfig): Generator<string, void, unknown>;
    /**
     * 后处理KA意图
     * @param answer 待处理文本
     * @param BUFFER_LEN buffer长度
     * @param KA_DISTANCE KA间距
     */
    private postProcessKa;
}
export declare const kaIntentPlugin: KAIntentPlugin;
