export interface TtsOptions {
  url: string
  onOpen?: (event: Event) => void
  onMessage?: (event: MessageEvent) => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
}

export default class Tts {
  ws: WebSocket

  constructor(options: TtsOptions) {
    this.ws = new WebSocket(options.url)
    this.ws.binaryType = 'arraybuffer'

    if (options.onOpen) this.ws.onopen = options.onOpen
    if (options.onMessage) this.ws.onmessage = options.onMessage
    if (options.onClose) this.ws.onclose = options.onClose
    if (options.onError) this.ws.onerror = options.onError
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.error('WebSocket is not open. Cannot send message.')
    }
  }

  close() {
    this.ws.close()
  }

  get readyState(): number {
    return this.ws.readyState
  }
}
