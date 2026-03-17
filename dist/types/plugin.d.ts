/**
 * 插件系统类型定义
 */
export interface IPluginConfig {
    [key: string]: any;
}
export interface ITextProcessorPlugin {
    name: string;
    process: (text: string, config?: IPluginConfig) => string | Generator<string, void, unknown>;
}
export interface IKAIntentPluginConfig extends IPluginConfig {
    BUFFER_LEN?: number;
    KA_DISTANCE?: number;
    SSML_BUFFER_LEN?: number;
}
export interface IPluginRegistrationOptions {
    name: string;
    plugin: ITextProcessorPlugin;
    config?: IPluginConfig;
    enabled?: boolean;
}
