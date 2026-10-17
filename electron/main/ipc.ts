import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/types'
import type { ScanCandidate, ServiceInput, Settings } from '../../shared/types'
import { store } from './store'
import { supervisor } from './supervisor'
import { logs } from './logs'
import { checkPort } from './ports'
import { scanFolder } from './scanner'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function pickWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function fromCandidate(c: ScanCandidate): ServiceInput {
  const dir = path.dirname(c.path)
  return {
    name: c.name,
    group: '未分组',
    kind: c.kind,
    scriptPath: c.path,
    args: [],
    cwd: dir,
    env: {},
    autoStart: false,
    restartPolicy: 'on-failure',
    maxRestarts: 5,
    health: c.port
      ? { type: 'tcp', port: c.port, intervalMs: 5000 }
      : { type: 'process', intervalMs: 5000 },
    meta: { detectedEnvKeys: c.envKeys, importedAt: new Date().toISOString() }
  }
}

export function registerIpc(onSettingsChanged?: (s: Settings) => void): void {
  ipcMain.handle(IPC.servicesList, () => supervisor.views())
  ipcMain.handle(IPC.servicesCreate, (_e, input: ServiceInput) => {
    const created = store.create(input)
    return supervisor.view(created.id)
  })
  ipcMain.handle(IPC.servicesUpdate, (_e, id: string, patch: Partial<ServiceInput>) => store.update(id, patch))
  ipcMain.handle(IPC.servicesRemove, async (_e, id: string) => {
    await supervisor.stop(id)
    store.remove(id)
  })
  ipcMain.handle(IPC.servicesStart, async (_e, id: string) => {
    await supervisor.start(id)
    return supervisor.view(id)
  })
  ipcMain.handle(IPC.servicesStop, async (_e, id: string) => {
    await supervisor.stop(id)
    return supervisor.view(id)
  })
  ipcMain.handle(IPC.servicesRestart, async (_e, id: string) => {
    await supervisor.restart(id)
    return supervisor.view(id)
  })
  ipcMain.handle(IPC.servicesStartAll, async () => {
    for (const s of store.getServices()) await supervisor.start(s.id).catch(() => undefined)
  })
  ipcMain.handle(IPC.servicesStopAll, async () => { await supervisor.stopAll() })

  ipcMain.handle(IPC.logsTail, (_e, id: string, lines?: number) => logs.tail(id, lines ?? 200))
  ipcMain.handle(IPC.logsClear, (_e, id: string) => logs.clear(id))
  ipcMain.handle(IPC.logsReveal, (_e, id: string) => logs.reveal(id))
  ipcMain.handle(IPC.healthCheck, (_e, id: string) => supervisor.checkHealth(id))
  ipcMain.handle(IPC.portsCheck, (_e, port: number) => checkPort(port))

  ipcMain.handle(IPC.dialogPickScript, async () => {
    const win = pickWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: '选择脚本',
      properties: ['openFile'],
      filters: [
        { name: 'Scripts', extensions: ['js', 'mjs', 'cjs', 'py', 'ps1', 'bat', 'cmd', 'exe'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.dialogPickFolder, async () => {
    const win = pickWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, { title: '选择要扫描的文件夹', properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.importScan, (_e, dir: string) => scanFolder(dir))
  ipcMain.handle(IPC.importCommit, (_e, items: ScanCandidate[]) => {
    return items.filter(i => i.selected).map(i => {
      const created = store.create(fromCandidate(i))
      return supervisor.view(created.id)
    })
  })

  ipcMain.handle(IPC.settingsGet, () => store.getSettings())
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: Partial<Settings>) => {
    const next = store.updateSettings(patch)
    app.setLoginItemSettings({ openAtLogin: next.autoStart, args: ['--hidden'] })
    broadcast(IPC.evtSettingsChanged, next)
    onSettingsChanged?.(next)
    return next
  })

  ipcMain.handle(IPC.appQuit, () => { app.quit() })
  ipcMain.handle(IPC.appOpenDataDir, async () => { await shell.openPath(app.getPath('userData')) })
  ipcMain.handle(IPC.windowMinimize, e => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  ipcMain.handle(IPC.windowMaximize, e => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize(); else win.maximize()
  })
  ipcMain.handle(IPC.windowClose, e => { BrowserWindow.fromWebContents(e.sender)?.close() })
  ipcMain.handle(IPC.appShowMain, () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { win.show(); win.focus() }
  })
}

export function emit(channel: string, payload: unknown): void {
  broadcast(channel, payload)
}
