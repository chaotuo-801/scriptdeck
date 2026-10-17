import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/types'
import type { LogEvent, ScriptDeckApi, Settings, StatusEvent, ToastEvent } from '../../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.removeListener(channel, handler) }
}

const api: ScriptDeckApi = {
  platform: process.platform,
  services: {
    list: () => ipcRenderer.invoke(IPC.servicesList),
    create: input => ipcRenderer.invoke(IPC.servicesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.servicesUpdate, id, patch),
    remove: id => ipcRenderer.invoke(IPC.servicesRemove, id),
    start: id => ipcRenderer.invoke(IPC.servicesStart, id),
    stop: id => ipcRenderer.invoke(IPC.servicesStop, id),
    restart: id => ipcRenderer.invoke(IPC.servicesRestart, id),
    startAll: () => ipcRenderer.invoke(IPC.servicesStartAll),
    stopAll: () => ipcRenderer.invoke(IPC.servicesStopAll)
  },
  logs: {
    tail: (id, lines) => ipcRenderer.invoke(IPC.logsTail, id, lines),
    clear: id => ipcRenderer.invoke(IPC.logsClear, id),
    reveal: id => ipcRenderer.invoke(IPC.logsReveal, id)
  },
  health: { check: id => ipcRenderer.invoke(IPC.healthCheck, id) },
  ports: { check: port => ipcRenderer.invoke(IPC.portsCheck, port) },
  dialogs: {
    pickScript: () => ipcRenderer.invoke(IPC.dialogPickScript),
    pickFolder: () => ipcRenderer.invoke(IPC.dialogPickFolder)
  },
  importer: {
    scan: dir => ipcRenderer.invoke(IPC.importScan, dir),
    commit: items => ipcRenderer.invoke(IPC.importCommit, items)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: patch => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  app: {
    quit: () => ipcRenderer.invoke(IPC.appQuit),
    showMain: () => ipcRenderer.invoke(IPC.appShowMain),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    maximize: () => ipcRenderer.invoke(IPC.windowMaximize),
    close: () => ipcRenderer.invoke(IPC.windowClose)
  },
  onServiceChanged: cb => subscribe<StatusEvent>(IPC.evtServiceChanged, cb),
  onLog: cb => subscribe<LogEvent>(IPC.evtLog, cb),
  onSettingsChanged: cb => subscribe<Settings>(IPC.evtSettingsChanged, cb),
  onToast: cb => subscribe<ToastEvent>(IPC.evtToast, cb),
  onFocusService: cb => subscribe<string>(IPC.evtFocusService, cb)
}

contextBridge.exposeInMainWorld('sd', api)
