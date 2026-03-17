import path from 'node:path'
import process from 'node:process'
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from 'electron'

let mainWindow: BrowserWindow | null = null
let walkWindow: BrowserWindow | null = null
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
// 禁用窗口动画
app.commandLine.appendSwitch('wm-window-animations-disabled')

const createMainWindow = () => {
  if (mainWindow) {
    mainWindow.show()
    return
  }
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  globalShortcut.register('Ctrl+Shift+i', () => {
    mainWindow?.webContents.toggleDevTools()
  })
  if (!app.isPackaged) {
    mainWindow.webContents.loadURL(process.env.ELECTRON_RENDERER_URL as string)
  }
  else {
    mainWindow.webContents.loadFile(path.resolve(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
    walkWindow?.close()
    walkWindow = null
  })
}

const createWalkWindow =  () => {
  if (walkWindow) {
    walkWindow.show()
    return
  }
  walkWindow = new BrowserWindow({
    width: 540,
    height: 960,
    parent: mainWindow!,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/walk.mjs'),
      sandbox: false,
    },
  })
  globalShortcut.register('Ctrl+Shift+j', () => {
    walkWindow?.webContents.toggleDevTools()
  })
  if (!app.isPackaged) {
    walkWindow.webContents.loadURL(process.env.ELECTRON_RENDERER_URL as string)
  }
  else {
    walkWindow.webContents.loadFile(path.resolve(__dirname, '../renderer/index.html'))
  }
  walkWindow.on('closed', () => {
    walkWindow = null
  })
}

// ---------------------ipc---------------------
ipcMain.on('open-walk-window', () => {
  createWalkWindow()
})
ipcMain.on('close-walk-window', () => {
  if (walkWindow) {
    walkWindow.close()
  }
})
ipcMain.on('start-walk-test', () => {
  if (walkWindow) {
    walkWindow.webContents.send('start-walk-test')
  }
})

let originBounds: any = null
let oldOffsetX = 0
let oldTime = 0
let scaleFactor = 1

ipcMain.on('speak_walk_start', () => {
  if (!walkWindow) return
  oldOffsetX = 0
  originBounds = walkWindow.getBounds()
  const currentScreen = screen.getDisplayNearestPoint(walkWindow.getBounds());
  scaleFactor = currentScreen.scaleFactor
  console.log(scaleFactor)
})
ipcMain.on('set-character-canvas-offset', (event, data: {offsetX: number;}) => {
  if (!walkWindow) return
  const offsetX = Math.ceil(data.offsetX / scaleFactor)
  if (!originBounds || oldOffsetX === offsetX) {
    return
  }
  oldOffsetX = offsetX
  // const now = Date.now()
  // const timeGap = oldTime ? (now - oldTime) : 0
  // oldTime = now
  // walkWindow.webContents.send('start-walk-test',{timeGap,offsetX})
  walkWindow.setPosition(originBounds.x +offsetX, originBounds.y)
})

// ---------------------app---------------------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(-1)
}
else {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

  app.whenReady().then(() => {
    createMainWindow()
  })

  app.on('activate', () => createMainWindow())

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin')
      return
    app.quit()
  })

  app.on('will-quit', () => {
    app.quit()
  })
}
