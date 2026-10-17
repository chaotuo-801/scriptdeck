import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LogLine, ServiceInput, ServiceView, Settings } from '../shared/types'
import { Icon } from './components/Ui'
import Detail from './components/Detail'
import Drawer from './components/Drawer'
import ImportModal from './components/ImportModal'
import SettingsPage from './components/SettingsPage'

type Toast = { id: number; kind: 'info' | 'error'; message: string }

function uptime(startedAt?: number): string {
  if (!startedAt) return '—'
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`
}

function statusKey(s: ServiceView): 'run' | 'err' | 'stop' | 'mid' {
  if (s.runtime.state === 'exited') return 'err'
  if (s.runtime.state === 'running') return 'run'
  if (s.runtime.state === 'starting' || s.runtime.state === 'stopping') return 'mid'
  return 'stop'
}

const stText = { run: 'RUN', err: 'ERR', stop: 'STOP', mid: 'SYNC' } as const

export default function App() {
  const [services, setServices] = useState<ServiceView[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'services' | 'settings'>('services')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [drawer, setDrawer] = useState<{ open: boolean; editing?: ServiceView }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const [confirm, setConfirm] = useState<ServiceView | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const selectedRef = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const refresh = useCallback(async (keep?: string | null) => {
    const list = await window.sd.services.list()
    setServices(list)
    setSelectedId(prev => {
      const wanted = keep === undefined ? prev : keep
      if (wanted && list.some(s => s.id === wanted)) return wanted
      return list[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [list, s] = await Promise.all([window.sd.services.list(), window.sd.settings.get()])
        setServices(list)
        setSettings(s)
        setSelectedId(list[0]?.id ?? null)
      } catch (err) {
        notify('error', (err as Error).message)
      }
    })()
  }, [notify])

  useEffect(() => {
    const offStatus = window.sd.onServiceChanged(e => {
      setServices(prev => prev.map(s => (s.id === e.id ? { ...s, runtime: e.runtime } : s)))
    })
    const offLog = window.sd.onLog(e => {
      if (e.id !== selectedRef.current) return
      setLogs(prev => [...prev, ...e.lines].slice(-4000))
    })
    const offSettings = window.sd.onSettingsChanged(s => setSettings(s))
    const offToast = window.sd.onToast(e => notify(e.kind, e.message))
    const offFocus = window.sd.onFocusService(id => {
      setView('services')
      setSelectedId(id)
    })
    return () => { offStatus(); offLog(); offSettings(); offToast(); offFocus() }
  }, [notify])

  selectedRef.current = selectedId

  useEffect(() => {
    if (!selectedId) { setLogs([]); return }
    let alive = true
    void window.sd.logs.tail(selectedId, 400).then(rows => { if (alive) setLogs(rows) }).catch(() => undefined)
    return () => { alive = false }
  }, [selectedId])

  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.density = settings.density
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn() } catch (err) { notify('error', (err as Error).message ?? String(err)) }
  }, [notify])

  const toggle = useCallback((svc: ServiceView) => {
    const active = svc.runtime.state === 'running' || svc.runtime.state === 'starting' || svc.runtime.state === 'stopping'
    void run(async () => {
      if (active) await window.sd.services.stop(svc.id)
      else await window.sd.services.start(svc.id)
      await refresh()
    })
  }, [run, refresh])

  const save = useCallback(async (input: ServiceInput, id?: string, startAfter?: boolean) => {
    try {
      const saved = id ? await window.sd.services.update(id, input) : await window.sd.services.create(input)
      await refresh(saved?.id ?? null)
      if (saved?.id) setSelectedId(saved.id)
      setDrawer({ open: false })
      notify('info', startAfter ? '已保存并启动' : id ? '服务已更新' : '服务已创建')
    } catch (err) {
      notify('error', (err as Error).message)
    }
  }, [refresh, notify])

  const remove = useCallback(async (svc: ServiceView) => {
    try {
      await window.sd.services.remove(svc.id)
      setConfirm(null)
      await refresh(null)
      notify('info', '服务已删除，日志目录保留')
    } catch (err) {
      notify('error', (err as Error).message)
    }
  }, [refresh, notify])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus() }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); setDrawer({ open: true }) }
      if (mod && e.key === 'Enter' && selectedId) {
        const svc = services.find(s => s.id === selectedId)
        if (svc) { e.preventDefault(); toggle(svc) }
      }
      if (e.key === 'Escape') { setDrawer({ open: false }); setImportOpen(false); setConfirm(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, services, toggle])

  const selected = useMemo(() => services.find(s => s.id === selectedId) ?? null, [services, selectedId])

  const groups = useMemo(() => {
    const map = new Map<string, ServiceView[]>()
    for (const s of services) {
      const key = s.group || '未分组'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      color: items.some(i => i.runtime.state === 'exited') ? 'var(--bad)' : items.some(i => i.runtime.state === 'running') ? 'var(--ok)' : 'var(--off)'
    }))
  }, [services])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return services.filter(s => {
      if (group !== 'all' && (s.group || '未分组') !== group) return false
      if (!q) return true
      return `${s.name} ${s.kind} ${s.scriptPath} ${s.health.port ?? ''}`.toLowerCase().includes(q)
    })
  }, [services, group, query])

  const counts = useMemo(() => ({
    running: services.filter(s => s.runtime.state === 'running').length,
    stopped: services.filter(s => ['stopped', 'stopping'].includes(s.runtime.state)).length,
    exited: services.filter(s => s.runtime.state === 'exited').length
  }), [services])

  const noServices = services.length === 0

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand"><span className="mark">S</span>SCRIPTSDECK</div>
        <div className="glob">
          RUN <b style={{ color: 'var(--ok)' }}>{counts.running}</b> &nbsp;/&nbsp;
          STOP <b style={{ color: 'var(--off)' }}>{counts.stopped}</b> &nbsp;/&nbsp;
          ERR <b style={{ color: 'var(--bad)' }}>{counts.exited}</b>
        </div>
        <div className="tb-right">
          <button className="btn primary" onClick={() => setDrawer({ open: true })}>
            <Icon name="plus" size={12} /> NEW
          </button>
          <button className="btn" disabled={!counts.running} onClick={() => void run(async () => { await window.sd.services.stopAll(); await refresh() })}>
            STOP ALL
          </button>
          <div className="wctl">
            <button onClick={() => void window.sd.window.minimize()} aria-label="最小化">─</button>
            <button onClick={() => void window.sd.window.maximize()} aria-label="最大化">▢</button>
            <button className="close" onClick={() => void window.sd.window.close()} aria-label="关闭">✕</button>
          </div>
        </div>
      </header>

      <div className="body">
        <aside className="rail">
          <div className="label">SERVICES</div>
          <button className={`nav ${view === 'services' && group === 'all' ? 'on' : ''}`} onClick={() => { setView('services'); setGroup('all') }}>
            <Icon name="grid" />全部服务<span className="n">{services.length}</span>
          </button>
          {groups.map(g => (
            <button key={g.name} className={`nav ${view === 'services' && group === g.name ? 'on' : ''}`} onClick={() => { setView('services'); setGroup(g.name) }}>
              <span className="dot" style={{ background: g.color }} />{g.name}<span className="n">{g.count}</span>
            </button>
          ))}
          <div className="label">SYSTEM</div>
          <button className="nav" onClick={() => void window.sd.app.openDataDir()}><Icon name="folder" />数据目录</button>
          <div className="sp" />
          <div className="foot">
            <button className={`nav ${view === 'settings' ? 'on' : ''}`} onClick={() => setView('settings')}><Icon name="settings" />设置</button>
            <button className="nav" onClick={() => notify('info', 'ScriptDeck v0.1.0')}><Icon name="info" />关于 v0.1.0</button>
          </div>
        </aside>

        {view === 'services' ? (
          <section className="list">
            <div className="lhead">
              <div className="ltitle"><h1>ALL SERVICES</h1><span>{services.length}</span></div>
              <div className="chips">
                <span className="chip"><span className="dot ok" />RUN <b>{counts.running}</b></span>
                <span className="chip"><span className="dot off" />STOP <b>{counts.stopped}</b></span>
                <span className="chip"><span className="dot err" />ERR <b>{counts.exited}</b></span>
              </div>
              <input
                ref={searchRef}
                className="input"
                style={{ marginTop: 8, height: 24 }}
                placeholder="搜索服务、端口或命令  (Ctrl+F)"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            {noServices ? (
              <div className="empty">
                <div className="glyph"><Icon name="grid" size={18} /></div>
                <h3>还没有服务</h3>
                <p>把常驻脚本接进来，之后开关、状态和日志都在这里。</p>
                <div className="acts">
                  <button className="btn primary" onClick={() => setImportOpen(true)}>从文件夹导入</button>
                  <button className="btn" onClick={() => setDrawer({ open: true })}>手动新建</button>
                </div>
                <div className="plist">
                  <button className="prow" onClick={() => setImportOpen(true)}><Icon name="folder" size={13} />Node HTTP 代理<span>预设</span></button>
                  <button className="prow" onClick={() => setImportOpen(true)}><Icon name="folder" size={13} />Python 服务<span>预设</span></button>
                  <button className="prow" onClick={() => setDrawer({ open: true })}><Icon name="terminal" size={13} />PowerShell 守护<span>预设</span></button>
                </div>
              </div>
            ) : (
              <div className="rows">
                {filtered.map(s => {
                  const key = statusKey(s)
                  return (
                    <button key={s.id} className={`row ${s.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(s.id)}>
                      <span className={`st ${key}`}>{stText[key]}</span>
                      <div className="rinfo">
                        <div className="rname">{s.name}</div>
                        <div className="rmeta">{s.kind} · {s.health.port ? `127.0.0.1:${s.health.port}` : 'no port'}</div>
                      </div>
                      <span className="rtime">{s.runtime.state === 'running' ? uptime(s.runtime.startedAt) : '—'}</span>
                      <span className="row-actions">
                        <span className="mini" role="button" title={s.runtime.state === 'running' ? '停止' : '启动'} onClick={e => { e.stopPropagation(); toggle(s) }}>
                          <Icon name={s.runtime.state === 'running' ? 'stop' : 'play'} size={11} />
                        </span>
                        <span className="mini" role="button" title="重启" onClick={e => { e.stopPropagation(); void run(async () => { await window.sd.services.restart(s.id); await refresh() }) }}>
                          <Icon name="restart" size={11} />
                        </span>
                      </span>
                    </button>
                  )
                })}
                {filtered.length === 0 ? <div className="empty-log">没有匹配的服务</div> : null}
              </div>
            )}
          </section>
        ) : null}

        <section className="detail">
          {view === 'settings' && settings ? (
            <SettingsPage settings={settings} onChange={next => setSettings(next)} notify={notify} />
          ) : selected ? (
            <Detail
              service={selected}
              logs={logs}
              onStart={() => void run(async () => { await window.sd.services.start(selected.id); await refresh() })}
              onStop={() => void run(async () => { await window.sd.services.stop(selected.id); await refresh() })}
              onRestart={() => void run(async () => { await window.sd.services.restart(selected.id); await refresh() })}
              onToggle={() => toggle(selected)}
              onEdit={() => setDrawer({ open: true, editing: selected })}
              onDelete={() => setConfirm(selected)}
              onClearLogs={() => void run(async () => { await window.sd.logs.clear(selected.id); setLogs([]) })}
              onRevealLogs={() => void window.sd.logs.reveal(selected.id)}
              onCheckHealth={() => void run(async () => { await window.sd.health.check(selected.id); await refresh() })}
              notify={notify}
            />
          ) : (
            <div className="guide">
              <h2>三步接管你的第一个脚本</h2>
              <p className="sub">不用改代码，也不用记命令。ScriptDeck 只负责启动它、看着它、把输出留给你。</p>
              <div className="step"><span className="no">1</span><div><b>选择文件夹</b><span>扫描目录里的 .mjs / .py / .ps1 / .cmd，自动识别解释器和端口。</span></div></div>
              <div className="step"><span className="no">2</span><div><b>确认候选清单</b><span>勾掉不需要的，端口冲突会在导入前就标出来。</span></div></div>
              <div className="step"><span className="no">3</span><div><b>保存并启动</b><span>运行状态、日志和健康检查立刻出现在主界面。</span></div></div>
              <div className="codebox">
                <div className="dim"># 导入后等价于手动执行</div>
                <div>node proxy.mjs</div>
                <div className="dim"># 工作目录 C:\Users\WOCK\tools\ccswitch-cors-shim</div>
              </div>
            </div>
          )}
        </section>
      </div>

      {drawer.open ? (
        <Drawer editing={drawer.editing} onClose={() => setDrawer({ open: false })} onSave={save} notify={notify} />
      ) : null}

      {importOpen ? (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={async ids => {
            setImportOpen(false)
            await refresh(ids[0] ?? null)
            if (ids[0]) setSelectedId(ids[0])
            notify('info', `已导入 ${ids.length} 个服务`)
          }}
          notify={notify}
        />
      ) : null}

      {confirm ? (
        <>
          <div className="ov" onClick={() => setConfirm(null)} />
          <div className="modal" style={{ width: 420 }}>
            <div className="mh"><h3>删除服务</h3></div>
            <div style={{ padding: '16px 16px 6px', fontSize: 11, lineHeight: 1.8, color: 'var(--muted)' }}>
              将删除 <b style={{ color: 'var(--text)' }}>{confirm.name}</b> 的配置并停止它。日志文件会保留在数据目录中。
            </div>
            <div className="mf">
              <div className="r">
                <button className="btn" onClick={() => setConfirm(null)}>取消</button>
                <button className="btn hot" onClick={() => void remove(confirm)}>删除</button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'err' : ''}`}>
            <Icon name={t.kind === 'error' ? 'alert' : 'info'} size={13} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
