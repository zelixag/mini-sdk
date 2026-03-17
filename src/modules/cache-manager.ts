export default class CacheManager {
  cacheServer: string;
  constructor(cacheServer: string) {
    this.cacheServer = cacheServer;
  }

  // preCache(appId: string, appSecret: string): Promise<void> {
  //   return fetch(`${this.cacheServer}/precache?appId=${appId}&appSecret=${appSecret}`).then(res => res.json())
  // }

  getVideo(url: string): string {
    return `${this.cacheServer}/get_video?url=${encodeURIComponent(url)}`
  }
}