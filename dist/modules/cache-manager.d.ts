export default class CacheManager {
    cacheServer: string;
    constructor(cacheServer: string);
    getVideo(url: string): string;
}
