/**
 * UI 控件渲染，所有轨道的元素
 */
import { DataCacheQueue } from "../control/DataCacheQueue";
import DefaultWidgetRenderer from "../modules/TrackRenderer/render-implements";
import TrackerRenderer from "../modules/TrackRenderer/index";
import ResourceManager from "../modules/ResourceManager";
import { performanceConstant } from "../utils/perfermance";
import XmovAvatar from "../index";
import { AvatarStatus } from "../types";

type Option = {
  sdk: XmovAvatar;
  dataCacheQueue: DataCacheQueue;
  resourceManager: ResourceManager;
  enableClientInterrupt: boolean;
  onVoiceEnd: (speech_id: number) => void;
  onVoiceStart: (duration: number,speech_id: number) => void;
  onWalkStateChange: (state: string) => void;
  clearSubtitleOn: (speech_id: number) => void;
  sendSdkPoint: (type: string, data: any, extra?: any) => void;
  onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
};
export default class UIRenderer {
  private TAG = "[UIRenderer]";
  options: Option;
  trackerRenderer: TrackerRenderer[] = [];
  root = document.createElement("div");
  lastFrameIndex: number = -1;
  onVoiceEnd: (speech_id: number) => void;
  onVoiceStart: (duration: number, speech_id: number) => void;
  onWalkStateChange: (state: string) => void;
  clearSubtitleOn: (speech_id: number) => void;
  initEventsRendered: boolean = false;  
  interruptSpeechId: number = -1;
  enableClientInterrupt: boolean = false;
  onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
  constructor(options: Option) {
    this.options = options;
    this.root.setAttribute("style", "position:absolute;");
    this.onVoiceStart = options.onVoiceStart;
    this.onVoiceEnd = options.onVoiceEnd;
    this.clearSubtitleOn = options.clearSubtitleOn;
    this.initEventsRendered = false;  
    this.onWalkStateChange = options.onWalkStateChange;
    this.enableClientInterrupt = options.enableClientInterrupt;
    this.onSpeakStateChange = options.onSpeakStateChange;
  }

  render(frame: number) {
    // if(this.options.sdk.getStatus() === AvatarStatus.offline) return;
    let initEvents: any[] = [];
    if (this.lastFrameIndex === -1) {
      this.lastFrameIndex = frame;
      const config = this.options.resourceManager.getConfig();
      if(config.init_events && config.init_events.length > 0){
        initEvents = config.init_events;
      }
    }
    let event: any = null;
    if (frame - this.lastFrameIndex > 1) {
      event = this.options.dataCacheQueue._getEventInterval(
        this.lastFrameIndex,
        frame
      );
    } else {
      event = this.options.dataCacheQueue._getEvent(frame);
    }
    // 仅执行一次
    if(!this.initEventsRendered){
      this.initEventsRendered = true;
      if(event){
        event.e = event.e.concat(initEvents);
      } else {
        event = {
          e: initEvents,
        };
      }
    }
    if (!event) {
      return;
    }
    if(this.enableClientInterrupt) {
      // 根据interruptSpeechId过滤旧的数据,加入前端interrupt事件后，可能在前端打断后，服务仍下发数据
      event.e = event.e.filter(item => item.speech_id > this.interruptSpeechId || item.speech_id === undefined || item.speech_id === null);
    }
    if(event.e.some(item => item.type === "voice_start")) {
      const voiceStart = event.e.find(item => item.type === "voice_start");
      const duration = (window as any).performanceTracker.markEnd(performanceConstant.voice_response_play, 'speak');
      this.options.sendSdkPoint('rendering_display', {multi_turn_conversation_id: voiceStart?.multi_turn_conversation_id});
      this.onVoiceStart(duration, voiceStart?.speech_id);
    }
    // 检查并处理voice_end事件
    if (event.e.some(item => item.type === "voice_end")) {
      const voiceEnd = event.e.find(item => item.type === "voice_end");
      this.onVoiceEnd(voiceEnd?.speech_id);
    }
    // 检查并处理walk_start或speak_walk_start事件
    if (event.e.some(item => item.type === "walk_start") || event.e.some(item => item.type === "speak_walk_start")) {
      this.onWalkStateChange("walk_start");
    }
    // 检查并处理walk_end或speak_walk_end事件
    if (event.e.some(item => item.type === "walk_end") || event.e.some(item => item.type === "speak_walk_end")) {
      this.onWalkStateChange("walk_end");
    }
    
    // 定义需要处理的语音事件类型列表
    const speakEventTypes = ["speak_start", "speak_end", "speak_error"];
    speakEventTypes.forEach(eventType => {
      const speakEvent = event.e.find(item => item.type === eventType);
      if (speakEvent) {
        this.onSpeakStateChange(eventType, speakEvent.client_speak_id);
      }
    });

    // 检查并处理subtitle_off事件
    if (event.e.some(item => item.type === "subtitle_off")) {
      const speech_id = event.e.find(item => item.type === "subtitle_off")?.speech_id;
      this.clearSubtitleOn(speech_id);
    }
    const remainingWidgets = [...event.e];

    // 循环遍历 event.e 数组中的所有元素
    for (let i = 0; i < event.e.length; i++) {
      const widgetData = event.e[i];
      if (Object.prototype.hasOwnProperty.call(widgetData, "event_type")) {
        // 先不处理 ka/ka_intent
        continue;
      }
      // 如果有自定义的渲染器，则所有事件都交给自定义的渲染器处理
      if (DefaultWidgetRenderer.CUSTOM_WIDGET) {
        DefaultWidgetRenderer.CUSTOM_WIDGET(widgetData);
        // 从剩余元素中删除已处理的元素
        const index = remainingWidgets.indexOf(widgetData);
        if (index > -1) {
          remainingWidgets.splice(index, 1);
        }
        continue;
      }
      // 如果有代理的渲染器，则根据类型执行代理的渲染器
      if (DefaultWidgetRenderer.PROXY_WIDGET && DefaultWidgetRenderer.PROXY_WIDGET[widgetData.type]) {
        DefaultWidgetRenderer.PROXY_WIDGET[widgetData.type](widgetData);
        
        // 从剩余元素中删除已处理的元素
        const index = remainingWidgets.indexOf(widgetData);
        if (index > -1) {
          remainingWidgets.splice(index, 1);
        }
        continue;
      }
    }
    // 对剩余未自定义的元素执行 TrackerRenderer
    if (remainingWidgets.length > 0) {
      // 遍历剩余的元素，每个单独执行 TrackerRenderer
      // 传递 SDK 实例引用，用于区分不同数字人实例的 widget
      for (const widgetData of remainingWidgets) {
        const tracker = new TrackerRenderer(widgetData, this.options.sdk);
        this.trackerRenderer.push(tracker);
      }
    }
    return this.trackerRenderer;
  }

  clearTrackerRenderer() {
    this.trackerRenderer = [];
  }

  setInterrupt(speech_id: number) {
    this.interruptSpeechId = speech_id;
  }

  destroy() {
    this.lastFrameIndex = -1;
    this.initEventsRendered = false;
    // 传递 SDK 实例引用，只清除当前实例的 widget
    DefaultWidgetRenderer.destroy(this.options.sdk);
    this.trackerRenderer.forEach((tracker) => tracker.destroy());
  }
}
