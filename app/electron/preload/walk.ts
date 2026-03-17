import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('IS_WALK_WINDOW', true)

const electronApi: { [key: string]: any } = {
  ipcReceive: (channel: any, callback: (...rest: any[]) => void) => {
    const realCallback = (event: Electron.Event, ...rest: any[]) => {
      callback(...rest)
    }
    ipcRenderer.on(channel, realCallback)
    return () => ipcRenderer.removeListener(channel, realCallback)
  },
  ipcSend: (channel: any, ...msg: any) => {
    ipcRenderer.send(channel, ...msg)
  },
  ipcInvoke: (channel: any, ...msg: any) => {
    return ipcRenderer.invoke(channel, ...msg)
  }
}

contextBridge.exposeInMainWorld('IPC', electronApi)