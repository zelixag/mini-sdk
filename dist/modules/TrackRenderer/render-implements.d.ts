/**
 * widget_xx 的默认实现
 */
import { IWidgetPic, IWidgetSubtitle, IWidget } from "../../types/event";
import { IRawWidgetData } from "../../types/frame-data";
declare const WidgetDefaultRenderer: {
    _el(data: IWidget): HTMLDivElement;
    WIDGET_PIC(data: IWidgetPic, instance?: any): HTMLDivElement;
    WIDGET_SUBTITLE(data: IWidgetSubtitle, instance?: any): HTMLDivElement | null;
    CUSTOM_WIDGET?(data: IRawWidgetData): void;
    PROXY_WIDGET?: {
        [key: string]: (data: any) => void;
    };
    destroy(instance?: any): void;
    _getWidgetKey(type: string, axisId?: number): string;
    _replaceWidget(type: string, axisId: number, newElement: HTMLDivElement, instance?: any): void;
    _currentInstance?: any;
};
export default WidgetDefaultRenderer;
