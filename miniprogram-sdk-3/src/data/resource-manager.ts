import { request, downloadAsBuffer, downloadFile } from '../platform/network'
import { signRequest } from '../protocol/token'
import { IBRAnimationGeneratorCharInfo_NN } from './data-interface'
import { createModuleLogger } from '../utils/logger'
import type { IInitParams, ISessionResponse, IOfflineIdle } from '../types'

const log = createModuleLogger('Resource')

export class ResourceManager {
  private sessionId: string = ''
  private room: string = ''
  private token: string = ''
  private socketUrl: string = ''
  private config: ISessionResponse['config'] | null = null
  private resourcePack: ISessionResponse['resource_pack'] | null = null
  private charData: IBRAnimationGeneratorCharInfo_NN | null = null
  private blendshapeMap: number[][] | null = null
  private offlineIdle: IOfflineIdle[] = []
  private initParams: IInitParams | null = null
  // Video cache: tempFilePath strings (for VideoDecoder)
  private videoCache: Map<string, string> = new Map()
  private maxCacheSize = 10 * 1024 * 1024  // 10MB

  async startSession(params: IInitParams): Promise<void> {
    this.initParams = params
    const url = `${params.gatewayServer}/api/session`
    const body: Record<string, any> = {}
    if (params.tag) body.tag = params.tag
    if (params.config) body.config = params.config

    const signed = signRequest(params.appId, params.appSecret, 'POST', url, body)

    const res = await request<any>({
      url,
      method: 'POST',
      data: signed.data,
      headers: signed.headers as any,
    })

    if (res.statusCode !== 200 || !res.data?.data) {
      throw new Error(`Session start failed: ${res.statusCode} ${JSON.stringify(res.data)}`)
    }

    const session = res.data.data as ISessionResponse
    this.sessionId = session.session_id
    this.room = session.room
    this.token = session.token
    this.socketUrl = session.socket_io_url
    this.config = session.config
    this.resourcePack = session.resource_pack
    this.blendshapeMap = session.resource_pack.blendshape_map || null
    this.offlineIdle = session.resource_pack.offline_idle || []

    log.info('Session started:', this.sessionId)
    log.info('Resource pack:', JSON.stringify({
      body_data_dir: this.resourcePack?.body_data_dir,
      face_ani_char_data: this.resourcePack?.face_ani_char_data,
      face_ani_preload_data: this.resourcePack?.face_ani_preload_data,
    }))
  }

  async loadCharData(onProgress?: (p: number) => void): Promise<IBRAnimationGeneratorCharInfo_NN | null> {
    const url = this.resourcePack?.face_ani_char_data
    if (!url) {
      log.warn('No face_ani_char_data in resource pack')
      return null
    }

    log.info('Loading char data from:', url)

    try {
      onProgress?.(0.1)
      const buffer = await downloadAsBuffer(url)
      onProgress?.(0.8)

      const spec: any = {}
      if (this.blendshapeMap) spec.blendshapeMap = this.blendshapeMap

      this.charData = new IBRAnimationGeneratorCharInfo_NN(buffer, spec)
      onProgress?.(1.0)
      log.info('CharData loaded, meshes:', this.charData.mesh.length, 'joints:', this.charData.skeleton.length)
      return this.charData
    } catch (e) {
      log.error('Failed to load char data:', e)
      throw e
    }
  }

  async loadVideo(videoName: string): Promise<string> {
    // Check cache first
    if (this.videoCache.has(videoName)) {
      return this.videoCache.get(videoName)!
    }

    // Download to temp file path (for VideoDecoder)
    const tempPath = await this.downloadVideoToTemp(videoName)

    // Cache with size limit
    this.videoCache.set(videoName, tempPath)
    this._evictCache()

    return tempPath
  }

  /** 获取缓存的视频路径（供 VideoDecoder 使用） */
  getCachedVideoPath(name: string): string | undefined {
    return this.videoCache.get(name)
  }

  /** 获取身体视频 URL */
  getVideoUrl(name: string): string {
    const bodyDataDir = this.resourcePack?.body_data_dir
    if (!bodyDataDir || !name) return ''
    const dir = bodyDataDir
    return dir.endsWith('/') ? `${dir}${name}.mp4` : `${dir}/${name}.mp4`
  }

  /** 获取视频路径（如果没有缓存则下载） */
  async getVideoPath(name: string): Promise<string> {
    // 检查缓存
    if (this.videoCache.has(name)) {
      return this.videoCache.get(name)!
    }

    // 下载视频
    try {
      const tempPath = await this.downloadVideoToTemp(name)
      return tempPath
    } catch (e) {
      log.error('Failed to get video path:', name, e)
      return ''
    }
  }

  async downloadVideoToTemp(videoName: string): Promise<string> {
    const url = this.getVideoUrl(videoName)
    if (!url) {
      log.error('getVideoUrl returned empty, body_data_dir might be empty!')
      throw new Error('body_data_dir is empty')
    }
    log.info('Downloading video from:', url)
    return downloadFile(url)
  }

  private _evictCache(): void {
    // 简化：限制缓存数量最多 10 个视频
    const MAX_CACHED_VIDEOS = 10
    if (this.videoCache.size > MAX_CACHED_VIDEOS) {
      // Remove oldest entries
      const keys = Array.from(this.videoCache.keys())
      while (this.videoCache.size > MAX_CACHED_VIDEOS && keys.length > 0) {
        const oldest = keys.shift()!
        this.videoCache.delete(oldest)
      }
    }
  }

  async stopSession(reason: string = 'user_stop'): Promise<void> {
    if (!this.sessionId || !this.initParams) return

    try {
      const url = `${this.initParams.gatewayServer}/api/session/stop`
      const body = { session_id: this.sessionId, stop_reason: reason }
      const signed = signRequest(this.initParams.appId, this.initParams.appSecret, 'POST', url, body)

      await request({
        url,
        method: 'POST',
        data: signed.data,
        headers: signed.headers as any,
      })
      log.info('Session stopped:', this.sessionId)
    } catch (e) {
      log.warn('Stop session error:', e)
    }
  }

  // Getters
  getSessionId(): string { return this.sessionId }
  getRoom(): string { return this.room }
  getToken(): string { return this.token }
  getSocketUrl(): string { return this.socketUrl }
  getConfig(): ISessionResponse['config'] | null { return this.config }
  getCharData(): IBRAnimationGeneratorCharInfo_NN | null { return this.charData }
  getBlendshapeMap(): number[][] | null { return this.blendshapeMap }
  getOfflineIdle(): IOfflineIdle[] { return this.offlineIdle }
  getBodyDataDir(): string { return this.resourcePack?.body_data_dir || '' }

  destroy(): void {
    this.videoCache.clear()
    this.charData = null
    this.config = null
    this.resourcePack = null
  }
}
