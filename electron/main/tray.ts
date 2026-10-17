import { app, Menu, Tray, nativeImage, type NativeImage } from 'electron'
import path from 'node:path'
import { store } from './store'
import { supervisor } from './supervisor'
import { emit } from './ipc'
import { IPC } from '../../shared/types'

interface TrayOptions {
  showMain: () => void
  focusService: (id: string) => void
  quit: () => void
  resourcesDir: string
}

export class TrayController {
  private tray: Tray | null = null
  private opts: TrayOptions

  constructor(opts: TrayOptions) {
    this.opts = opts
  }

  private image(name: string): NativeImage {
    const file = path.join(this.opts.resourcesDir, name)
    const img = nativeImage.createFromPath(file)
    if (!img.isEmpty()) return img
    return nativeImage.createEmpty()
  }

  start(): void {
    if (this.tray) return
    this.tray = new Tray(this.image('tray-idle.png'))
    this.tray.setToolTip('脚本坞 ScriptDeck')
    this.tray.on('click', () => this.opts.showMain())
    this.update()
  }

  update(): void {
    if (!this.tray) return
    const views = supervisor.views()
    const running = views.filter(v => v.runtime.state === 'running')
    const errored = views.filter(v => v.runtime.state === 'exited')
    const icon = errored.length ? 'tray-err.png' : running.length ? 'tray-ok.png' : 'tray-idle.png'
    this.tray.setImage(this.image(icon))
    this.tray.setToolTip(`脚本坞 · ${running.length} 运行中${errored.length ? ` · ${errored.length} 异常` : ''}`)

    const quick = [...running, ...errored].slice(0, 5)
    const menu = Menu.buildFromTemplate([
      { label: `脚本坞 · ${running.length} 运行中${errored.length ? ` · ${errored.length} 异常` : ''}`, enabled: false },
      { type: 'separator' },
      ...quick.map(v => ({
        label: `${v.runtime.state === 'exited' ? '✕' : '●'} ${v.name}`,
        click: () => this.opts.focusService(v.id)
      })),
      ...(quick.length ? [{ type: 'separator' as const }] : []),
      { label: '打开主界面', click: () => this.opts.showMain() },
      {
        label: '全部停止',
        enabled: running.length > 0,
        click: () => { void supervisor.stopAll().then(() => this.update()) }
      },
      { type: 'separator' },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: store.getSettings().autoStart,
        click: item => {
          const next = store.updateSettings({ autoStart: item.checked })
          app.setLoginItemSettings({ openAtLogin: next.autoStart, args: ['--hidden'] })
          emit(IPC.evtSettingsChanged, next)
        }
      },
      { label: '退出', click: () => this.opts.quit() }
    ])
    this.tray.setContextMenu(menu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
