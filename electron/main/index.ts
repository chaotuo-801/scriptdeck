import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { store } from './store'
import { supervisor } from './supervisor'
import { registerIpc, emit } from './ipc'
import { TrayController } from './tray'
import { IPC } from '../../shared/types'

let win: BrowserWindow | null = null
let tray: TrayController | null = null
let isQuitting = false
const startHidden = process.argv.includes('--hidden')
const captureArg = process.argv.find(a => a.startsWith('--capture='))
const captureDelay = Number(process.argv.find(a => a.startsWith('--capture-delay='))?.split('=')[1] ?? 900)

function showMain(): void {
  if (!win || win.isDestroyed()) {
    win = createWindow()
  }
  win.show()
  win.focus()
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0A0B0D',
    title: 'ScriptDeck',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  w.once('ready-to-show', () => { if (!startHidden) w.show() })

  if (captureArg) {
    w.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void w.webContents.capturePage().then(async image => {
          await fsp.writeFile(captureArg.slice('--capture='.length), image.toPNG())
          app.quit()
        })
      }, captureDelay)
    })
  }

  w.on('close', event => {
    if (isQuitting) return
    if (store.getSettings().closeToTray) {
      event.preventDefault()
      w.hide()
    }
  })

  w.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void w.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return w
}

async function bootstrap(): Promise<void> {
  await store.init()
  if (app.isPackaged) {
    const s = store.getSettings()
    app.setLoginItemSettings({ openAtLogin: s.autoStart, args: ['--hidden'] })
  }
  registerIpc(() => tray?.update())

  win = createWindow()
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(__dirname, '../../resources')
  tray = new TrayController({
    showMain,
    focusService: id => { showMain(); emit(IPC.evtFocusService, id) },
    quit: () => app.quit(),
    resourcesDir
  })
  tray.start()

  supervisor.on('status', payload => {
    emit(IPC.evtServiceChanged, payload)
    tray?.update()
  })
  supervisor.on('log', payload => emit(IPC.evtLog, payload))
  supervisor.on('toast', payload => emit(IPC.evtToast, payload))

  await supervisor.startAll()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())
  app.whenReady().then(() => {
    app.setAppUserModelId('com.scriptdeck.app')
    return bootstrap()
  }).catch(err => {
    console.error('bootstrap failed', err)
  })
}

app.on('activate', () => showMain())

app.on('window-all-closed', () => {
  if (!store.getSettings().closeToTray) app.quit()
})

app.on('before-quit', event => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  tray?.destroy()
  void (async () => {
    await supervisor.dispose().catch(() => undefined)
    await store.flush().catch(() => undefined)
    app.quit()
  })()
})
