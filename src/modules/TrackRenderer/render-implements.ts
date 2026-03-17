/**
 * widget_xx 的默认实现
 */
import {
  IWidgetPic,
  IWidgetSubtitle,
  IWidget,
} from "../../types/event";
import { IRawWidgetData } from "../../types/frame-data";

// 用于跟踪已创建的widget，键格式为"type-axisId"
// 使用容器元素的ID作为key（固定字符串），避免WeakMap对象引用问题
const containerWidgetMaps = new Map<string, Map<string, HTMLDivElement>>();
let containerIdCounter = 0;

// 获取容器元素
function getContainerElement(instance: any): HTMLElement | null {
  if (!instance) return null;
  // 优先从 instance.el 获取容器元素
  if (instance.el && instance.el instanceof HTMLElement) {
    return instance.el;
  }
  return null;
}

// 获取或生成容器的唯一ID
function getContainerId(container: HTMLElement): string {
  // 如果容器已有ID，直接使用
  if (container.id) {
    return container.id;
  }
  // 如果容器有 data-widget-container-id 属性，使用它
  const existingId = container.getAttribute('data-widget-container-id');
  if (existingId) {
    return existingId;
  }
  // 生成新的唯一ID并设置
  const newId = `widget-container-${++containerIdCounter}`;
  container.setAttribute('data-widget-container-id', newId);
  return newId;
}

// 获取或创建容器元素的 widget Map（使用容器ID作为key）
function getContainerWidgetMap(container: HTMLElement): Map<string, HTMLDivElement> {
  const containerId = getContainerId(container);
  if (!containerWidgetMaps.has(containerId)) {
    containerWidgetMaps.set(containerId, new Map<string, HTMLDivElement>());
  }
  return containerWidgetMaps.get(containerId)!;
}

// 检查 Map 中是否包含指定的容器
function hasContainerInMap(container: HTMLElement): boolean {
  const containerId = getContainerId(container);
  return containerWidgetMaps.has(containerId);
}

const subtitleStyle = 
`bottom: 50px;
left: 50%;
transform: translateX(-50%);
background: rgba(0, 0, 0, 0.8);
color: white;
padding: 12px 20px;
border-radius: 8px;
font-size: 16px;
font-weight: 500;
z-index: 1000;
max-width: 80%;
min-width: 200px;
word-break: break-word;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
text-align: center;`;

const WidgetDefaultRenderer: {
  _el(data: IWidget): HTMLDivElement;
  WIDGET_PIC(data: IWidgetPic, instance?: any): HTMLDivElement;
  // WIDGET_SLIDESHOW(data: IWidgetSlideshow): HTMLDivElement;
  WIDGET_SUBTITLE(data: IWidgetSubtitle, instance?: any): HTMLDivElement | null;
  // WIDGET_TEXT(data: IWidgetText): HTMLDivElement;
  // WIDGET_VIDEO(data: IWidgetVideo): HTMLDivElement;
  CUSTOM_WIDGET?(data: IRawWidgetData): void;
  PROXY_WIDGET?: {
    [key: string]: (data: any) => void
  }
  destroy(instance?: any): void;
  _getWidgetKey(type: string, axisId?: number): string;
  _replaceWidget(type: string, axisId: number, newElement: HTMLDivElement, instance?: any): void;
  _currentInstance?: any; // 当前实例引用
} = {
  /**
   * 生成基础容器元素
   * @param axis_id 用于设置z-index的层级ID
   */
  _el(data: IWidget) {
    const { axis_id, x_location, y_location, width, height } = data;
    const _div = document.createElement('div');
    _div.setAttribute('class', 'avatar-sdk-widget-container');
    let style = 'position:absolute;';
    style += axis_id !== undefined ? `z-index:${axis_id};` : 'z-index:1;';
    if(x_location !== undefined && y_location !== undefined) {
      style += `top:${y_location * 100}%;left:${x_location * 100}%;`;
    }
    if(width !== undefined && height !== undefined) {
      style += `width:${width * 100}%;height:${height * 100}%;`;
    }
    _div.setAttribute('style', style);
    return _div;
  },

  /**
   * 生成widget的唯一标识键
   * @param type widget类型
   * @param axisId 层级ID
   * @returns 唯一标识字符串
   */
  _getWidgetKey(type: string, axisId?: number): string {
    // 使用默认值确保即使没有axisId也能正常工作
    const id = axisId ?? 'default';
    return `${type}-${id}`;
  },

  /**
   * 替换相同类型和层级的widget
   * @param type widget类型
   * @param axisId 层级ID
   * @param newElement 新的widget元素
   * @param instance 实例引用（用于区分不同数字人实例）
   */
  _replaceWidget(type: string, axisId: number, newElement: HTMLDivElement, instance?: any): void {
    const key = this._getWidgetKey(type, axisId);
    const actualInstance = instance || this._currentInstance;
    const container = getContainerElement(actualInstance);
    if (!container) {
      return;
    }
    const widgetMap = getContainerWidgetMap(container);
    if (widgetMap.has(key)) {
      const oldElement = widgetMap.get(key);
      if (oldElement && oldElement.parentNode) {
        oldElement.remove();
      }
    }
    widgetMap.set(key, newElement);
  },

  /**
   * 渲染图片widget
   */
  WIDGET_PIC(data: IWidgetPic, instance?: any): HTMLDivElement {
    const div = this._el(data);
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.setAttribute('style', 'width:100%;height:100%;');
    img.src = data.image;
    div.appendChild(img);
    
    this._replaceWidget('WIDGET_PIC', data.axis_id, div, instance);
    return div;
  },

  /**
   * 渲染幻灯片widget
   */
  // WIDGET_SLIDESHOW(data: IWidgetSlideshow): HTMLDivElement {
  //   const div = this._el(data.axis_id);
  //   const img = document.createElement('img');
  //   img.src = data.images[0];
  //   div.appendChild(img);
    
  //   this._replaceWidget('WIDGET_SLIDESHOW', data.axis_id, div);
  //   return div;
  // },

  /**
   * 渲染字幕widget
   */
  WIDGET_SUBTITLE(data: IWidgetSubtitle, instance?: any): HTMLDivElement | null {
    const { type, text, axis_id } = data;
    const actualInstance = instance || this._currentInstance;
    const container = getContainerElement(actualInstance);
    if(type === 'subtitle_off') {
      // 移除对应的div
      if (container) {
        const widgetMap = getContainerWidgetMap(container);
        const key = this._getWidgetKey('WIDGET_SUBTITLE', axis_id);
        if(widgetMap.has(key)) {
          const oldElement = widgetMap.get(key);
          if (oldElement && oldElement.parentNode) {
            oldElement.remove();
          }
          widgetMap.delete(key);
        }
      }
      return null;
    }
    const div = this._el(data);
    div.innerHTML = text;
    div.setAttribute('style', div.style.cssText + subtitleStyle);
    this._replaceWidget('WIDGET_SUBTITLE', axis_id, div, instance);
    return div;
  },

  /**
   * 渲染文本widget
   */
  // WIDGET_TEXT(data: IWidgetText): HTMLDivElement {
  //   const div = this._el(data.axis_id);
  //   div.innerHTML = data.text_content;
    
  //   this._replaceWidget('WIDGET_TEXT', data.axis_id, div);
  //   return div;
  // },

  /**
   * 渲染视频widget
   */
  // WIDGET_VIDEO(data: IWidgetVideo): HTMLDivElement {
  //   const div = this._el(data.axis_id);
  //   const video = document.createElement('video');
  //   video.setAttribute('style', 'width:100%;height:100%;object-fit:cover;');
  //   video.src = data.video;
  //   video.autoplay = true;
  //   video.loop = true;
  //   video.muted = true;
  //   div.appendChild(video);
    
  //   this._replaceWidget('WIDGET_VIDEO', data.axis_id, div);
  //   return div;
  // },

  /**
   * 销毁指定实例的widget
   * @param instance 实例引用（用于区分不同数字人实例）
   */
  destroy(instance?: any) {
    // 使用与 _replaceWidget 相同的逻辑，通过容器元素来查找和清理
    const actualInstance = instance || this._currentInstance;
    const container = getContainerElement(actualInstance);
    
    if (container) {
      const containerId = getContainerId(container);
      
      // 检查 Map 中是否存在该容器
      if (containerWidgetMaps.has(containerId)) {
        // 从容器对应的 widgetMap 中清理
        const widgetMap = containerWidgetMaps.get(containerId)!;
        widgetMap.forEach((element, key) => {
          if(key.startsWith('WIDGET_SUBTITLE') || key.startsWith('WIDGET_PIC')) {
            // 使用 remove() 方法更可靠，会自动检查元素是否在 DOM 中
            if (element && element.parentNode) {
              element.remove();
            }
          }
        });
        widgetMap.clear();
        containerWidgetMaps.delete(containerId);
      } else {
        // 备用清理方法：从容器 DOM 中查找并删除所有 widget 元素
        const widgets = container.querySelectorAll('.avatar-sdk-widget-container');
        widgets.forEach((widget) => {
          widget.remove();
        });
      }
    }
  }
}

export default WidgetDefaultRenderer;
