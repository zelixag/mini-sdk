export class EventEmitter<
  T extends Record<string, any> = Record<string, any>,
> {
  private listeners: Map<string, Set<Function>> = new Map()

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): () => void {
    const key = event as string
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(listener)
    return () => this.off(event, listener)
  }

  off<K extends keyof T>(event: K, listener: Function): void {
    this.listeners.get(event as string)?.delete(listener)
  }

  emit<K extends keyof T>(event: K, data?: T[K]): void {
    this.listeners.get(event as string)?.forEach((fn) => {
      try {
        fn(data)
      } catch (e) {
        console.error('EventEmitter error:', e)
      }
    })
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
