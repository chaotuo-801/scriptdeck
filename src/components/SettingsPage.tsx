import type { Settings, ThemeMode } from '../../shared/types'
import { Toggle, Seg } from './Ui'

interface Props {
  settings: Settings
  onChange: (next: Settings) => void
  notify: (kind: 'info' | 'error', message: string) => void
}

export default function SettingsPage({ settings, onChange, notify }: Props) {
  const update = async (patch: Partial<Settings>) => {
    try {
      const next = await window.sd.settings.update(patch)
      onChange(next)
    } catch (err) {
      notify('error', (err as Error).message)
    }
  }

  return (
    <div className="setwrap">
      <div className="sethead"><h2>设置</h2><span>PREFERENCES</span></div>

      <div className="setcard">
        <h3>外观</h3>
        <div className="setrow first">
          <div><div className="lbl">主题</div><div className="hint">浅色与深色各自一套完整配色</div></div>
          <div className="ctl">
            <Seg<ThemeMode>
              value={settings.theme}
              width={236}
              options={[{ value: 'system', label: '跟随系统' }, { value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }]}
              onChange={v => void update({ theme: v })}
            />
          </div>
        </div>
        <div className="setrow">
          <div><div className="lbl">列表密度</div><div className="hint">紧凑模式一屏约可显示 12 条服务</div></div>
          <div className="ctl">
            <Seg
              value={settings.density}
              width={150}
              options={[{ value: 'compact', label: '紧凑' }, { value: 'standard', label: '标准' }]}
              onChange={v => void update({ density: v })}
            />
          </div>
        </div>
        <div className="setrow">
          <div><div className="lbl">强调色</div><div className="hint">当前：琥珀（后续版本可换）</div></div>
          <div className="ctl">
            <span className="swatch" style={{ background: '#F0A93B', boxShadow: '0 0 0 2px var(--accent-soft)' }} />
            <span className="swatch" style={{ background: '#4ADE80', opacity: .5 }} />
            <span className="swatch" style={{ background: '#5B8CFF', opacity: .5 }} />
          </div>
        </div>
      </div>

      <div className="setcard">
        <h3>启动与驻留</h3>
        <div className="setrow first">
          <div><div className="lbl">开机自启 ScriptDeck</div><div className="hint">登录 Windows 后静默驻留托盘</div></div>
          <div className="ctl"><Toggle on={settings.autoStart} onChange={v => void update({ autoStart: v })} label="开机自启" /></div>
        </div>
        <div className="setrow">
          <div><div className="lbl">关闭主窗口时</div><div className="hint">服务继续在后台运行</div></div>
          <div className="ctl">
            <Seg
              value={settings.closeToTray ? 'tray' : 'quit'}
              width={190}
              options={[{ value: 'tray', label: '缩到托盘' }, { value: 'quit', label: '退出应用' }]}
              onChange={v => void update({ closeToTray: v === 'tray' })}
            />
          </div>
        </div>
      </div>

      <div className="setcard">
        <h3>日志</h3>
        <div className="setrow first">
          <div><div className="lbl">单文件上限</div><div className="hint">超出后自动轮转</div></div>
          <div className="ctl">
            <select className="input" style={{ width: 110 }} value={settings.logMaxBytes} onChange={e => void update({ logMaxBytes: Number(e.target.value) })}>
              <option value={1024 * 1024}>1 MB</option>
              <option value={5 * 1024 * 1024}>5 MB</option>
              <option value={10 * 1024 * 1024}>10 MB</option>
              <option value={20 * 1024 * 1024}>20 MB</option>
            </select>
          </div>
        </div>
        <div className="setrow">
          <div><div className="lbl">保留份数</div></div>
          <div className="ctl">
            <select className="input" style={{ width: 110 }} value={settings.logKeep} onChange={e => void update({ logKeep: Number(e.target.value) })}>
              <option value={3}>3 份</option>
              <option value={5}>5 份</option>
              <option value={10}>10 份</option>
            </select>
          </div>
        </div>
        <div className="setrow">
          <div><div className="lbl">数据目录</div><div className="hint">配置、日志与导入记录都保存在这里</div></div>
          <div className="ctl"><button className="btn" onClick={() => void window.sd.app.openDataDir()}>打开目录</button></div>
        </div>
      </div>

      <div className="setcard">
        <h3>关于</h3>
        <div className="setrow first">
          <div><div className="lbl">ScriptDeck 0.1.0</div><div className="hint">Electron · 本地运行 · 不上传任何数据</div></div>
          <div className="ctl"><span className="muted" style={{ fontSize: 9.5 }}>Schema v1</span></div>
        </div>
      </div>
    </div>
  )
}
