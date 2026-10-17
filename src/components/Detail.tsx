import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogLine, ServiceView } from '../../shared/types'
import { Icon, StatusPill } from './Ui'

type Tab = 'overview' | 'logs' | 'config' | 'health'

interface Props {
  service: ServiceView
  logs: LogLine[]
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onClearLogs: () => void
  onRevealLogs: () => void
  onCheckHealth: () => void
  notify: (kind: 'info' | 'error', message: string) => void
}

function ago(ts?: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function uptime(startedAt?: number): string {
  if (!startedAt) return '—'
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${sec % 60}s`
}

export default function Detail(props: Props) {
  const { service, logs, notify } = props
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const logRef = useRef<HTMLDivElement | null>(null)
  const runtime = service.runtime
  const active = runtime.state === 'running' || runtime.state === 'starting'
  const health = runtime.health

  useEffect(() => { setTab('overview'); setFilter('') }, [service.id])

  useEffect(() => {
    if (tab !== 'logs' || !follow) return
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, tab, follow])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = q ? logs.filter(l => l.text.toLowerCase().includes(q)) : logs
    return rows.slice(-1500)
  }, [logs, filter])

  const copyPath = () => {
    void navigator.clipboard.writeText(service.scriptPath).then(
      () => notify('info', '路径已复制'),
      () => notify('error', '复制失败')
    )
  }

  return (
    <>
      <div className="dhead">
        <div className="dtitle">
          <h2>{service.name}</h2>
          <StatusPill state={runtime.state} code={runtime.exitCode} />
          <div className="dacts">
            <button className={`btn ${active ? 'hot' : 'primary'}`} onClick={props.onToggle}>
              <Icon name={active ? 'stop' : 'play'} size={12} />{active ? 'STOP' : 'START'}
            </button>
            <button className="btn" onClick={props.onRestart}><Icon name="restart" size={12} />RESTART</button>
            <button className="btn" onClick={props.onEdit}><Icon name="edit" size={12} />编辑</button>
            <button className="btn ghost" onClick={props.onDelete} title="删除服务"><Icon name="trash" size={13} /></button>
          </div>
        </div>
        <div className="dpath" title={service.scriptPath}>{service.scriptPath}</div>
        <div className="tabs">
          <button className={`tab ${tab === 'overview' ? 'on' : ''}`} onClick={() => setTab('overview')}><i>01</i>概览</button>
          <button className={`tab ${tab === 'logs' ? 'on' : ''}`} onClick={() => setTab('logs')}><i>02</i>日志</button>
          <button className={`tab ${tab === 'config' ? 'on' : ''}`} onClick={() => setTab('config')}><i>03</i>配置</button>
          <button className={`tab ${tab === 'health' ? 'on' : ''}`} onClick={() => setTab('health')}><i>04</i>健康</button>
        </div>
      </div>

      <div className="dbody">
        {runtime.state === 'exited' ? (
          <div className="banner">
            <div>
              <div className="t">进程异常退出 · 退出码 {runtime.exitCode ?? 'null'}</div>
              <div className="d">
                已自动重启 {runtime.restarts} / {service.maxRestarts} 次。{runtime.lastError ?? '查看日志定位原因。'}
              </div>
            </div>
            <div className="acts">
              <button className="btn" onClick={() => setTab('logs')}>查看日志</button>
              <button className="btn primary" onClick={props.onStart}>重新启动</button>
            </div>
          </div>
        ) : null}

        {tab === 'overview' ? (
          <>
            <div className="metrics">
              <div className="metric">
                <div className="k">HEALTH</div>
                <div className="v">
                  <span className={`dot ${health ? (health.ok ? 'ok' : 'err') : 'off'}`} />
                  {health ? health.message : runtime.state === 'running' ? '等待首次检查' : '未运行'}
                  {health?.latencyMs != null ? <small>{health.latencyMs}ms</small> : null}
                </div>
              </div>
              <div className="metric">
                <div className="k">UPTIME</div>
                <div className="v">{runtime.state === 'running' ? uptime(runtime.startedAt) : '—'} <small>{runtime.pid ? `PID ${runtime.pid}` : ''}</small></div>
              </div>
              <div className="metric">
                <div className="k">RESTARTS</div>
                <div className="v" style={runtime.restarts ? { color: 'var(--warn)' } : undefined}>{runtime.restarts} <small>/ {service.maxRestarts}</small></div>
              </div>
            </div>

            <div className="term">
              <div className="termbar">
                <span className="dots"><i /><i /><i /></span>
                <span>current.log</span><span style={{ color: 'var(--scroll)' }}>|</span><span>stdout stderr</span>
                <span className="follow"><span className="dot ok" />跟随中</span>
              </div>
              <div className="termbody">
                {logs.length === 0 ? <div className="muted">尚无输出。启动服务后日志会实时出现在这里。</div> : logs.slice(-9).map((l, i) => (
                  <div key={i} className={`ln ${l.level}`}>
                    <time>{l.time}</time>
                    <span className="lv">{l.level === 'error' ? 'ERR' : l.level === 'warn' ? 'WARN' : 'INFO'}</span>
                    {l.text}
                  </div>
                ))}
              </div>
              <div className="prompt">
                <b>PS&gt;</b><span>{service.kind} {service.scriptPath.split(/[\\/]/).pop()}</span>
                <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setTab('logs')}>查看全部</button>
                <span className="cursor" />
              </div>
            </div>

            <div className="side">
              <div className="events">
                <div className="ev"><time>PID</time><span>{runtime.pid ?? '—'}</span></div>
                <div className="ev"><time>START</time><span>{runtime.startedAt ? new Date(runtime.startedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</span></div>
                <div className="ev"><time>HEALTH</time><span>{health ? `${health.message}${health.latencyMs != null ? ` · ${health.latencyMs}ms` : ''}` : '—'}</span></div>
              </div>
              <div className="events" style={{ width: 206 }}>
                <div className="ev"><time>AUTO</time><span>开机启动 <b>{service.autoStart ? 'ON' : 'OFF'}</b></span></div>
                <div className="ev"><time>AUTO</time><span>重启策略 <b>{service.restartPolicy}</b></span></div>
                <div className="ev"><time>CHECK</time><span>每 <b>{Math.round(service.health.intervalMs / 1000)}s</b></span></div>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'logs' ? (
          <div className="logpage">
            <div className="logtool">
              <input className="input" placeholder="过滤日志 (关键字)" value={filter} onChange={e => setFilter(e.target.value)} />
              <span className="muted" style={{ fontSize: 10 }}>{shown.length} / {logs.length} 行</span>
              <div className="spacer" />
              <button className={`btn ${follow ? 'primary' : ''}`} onClick={() => setFollow(v => !v)}>
                <span className={`dot ${follow ? 'ok' : 'off'}`} />{follow ? '跟随中' : '已暂停'}
              </button>
              <button className="btn" onClick={props.onRevealLogs}><Icon name="folder" size={12} />目录</button>
              <button className="btn" onClick={props.onClearLogs}>清空</button>
            </div>
            <div className="logpanel">
              <div className="termbar">
                <span className="dots"><i /><i /><i /></span>
                <span>current.log</span><span style={{ color: 'var(--scroll)' }}>|</span><span>UTF-8</span>
                <span className="follow"><span className={`dot ${follow ? 'ok' : 'off'}`} />{follow ? 'FOLLOW' : 'PAUSED'}</span>
              </div>
              <div className="termbody" ref={logRef}>
                {shown.length === 0 ? <div className="muted" style={{ padding: 8 }}>暂无日志</div> : shown.map((l, i) => (
                  <div key={i} className={`ln ${l.level}`}>
                    <time>{l.time}</time>
                    <span className="lv">{l.level === 'error' ? 'ERR' : l.level === 'warn' ? 'WARN' : 'INFO'}</span>
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'config' ? (
          <>
            <div className="config-grid">
              <div className="cfg"><div className="k">类型</div><div className="v">{service.kind}</div></div>
              <div className="cfg"><div className="k">分组</div><div className="v">{service.group || '未分组'}</div></div>
              <div className="cfg" style={{ gridColumn: '1 / -1' }}><div className="k">脚本路径</div><div className="v">{service.scriptPath}</div></div>
              <div className="cfg"><div className="k">启动参数</div><div className="v">{service.args.length ? service.args.join(' ') : '无'}</div></div>
              <div className="cfg"><div className="k">工作目录</div><div className="v">{service.cwd || '脚本所在目录'}</div></div>
              <div className="cfg" style={{ gridColumn: '1 / -1' }}>
                <div className="k">环境变量</div>
                <div className="v">{Object.keys(service.env).length ? Object.entries(service.env).map(([k, v]) => `${k}=${v}`).join('\n') : '无'}</div>
              </div>
              <div className="cfg"><div className="k">开机启动</div><div className="v">{service.autoStart ? '开启' : '关闭'}</div></div>
              <div className="cfg"><div className="k">重启策略</div><div className="v">{service.restartPolicy} · 最多 {service.maxRestarts} 次</div></div>
              <div className="cfg"><div className="k">健康检查</div><div className="v">{service.health.type}{service.health.port ? ` · ${service.health.port}` : ''} · {Math.round(service.health.intervalMs / 1000)}s</div></div>
              <div className="cfg"><div className="k">最近更新</div><div className="v">{new Date(service.updatedAt).toLocaleString('zh-CN', { hour12: false })}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn" onClick={props.onEdit}><Icon name="edit" size={12} />编辑配置</button>
              <button className="btn ghost" onClick={copyPath}><Icon name="copy" size={12} />复制路径</button>
            </div>
          </>
        ) : null}

        {tab === 'health' ? (
          <>
            <div className="metrics">
              <div className="metric">
                <div className="k">STATUS</div>
                <div className="v" style={{ color: health ? (health.ok ? 'var(--ok)' : 'var(--bad)') : undefined }}>
                  {health ? (health.ok ? '健康' : '异常') : '未检查'}
                </div>
              </div>
              <div className="metric"><div className="k">LATENCY</div><div className="v">{health?.latencyMs != null ? `${health.latencyMs}ms` : '—'}</div></div>
              <div className="metric"><div className="k">CHECKED</div><div className="v">{health ? new Date(health.checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}</div></div>
            </div>
            <div className="config-grid">
              <div className="cfg"><div className="k">探活方式</div><div className="v">{service.health.type}</div></div>
              <div className="cfg"><div className="k">端口</div><div className="v">{service.health.port ?? '未配置'}</div></div>
              <div className="cfg"><div className="k">路径</div><div className="v">{service.health.path || '/'}</div></div>
              <div className="cfg"><div className="k">间隔</div><div className="v">{Math.round(service.health.intervalMs / 1000)} 秒</div></div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn primary" onClick={props.onCheckHealth}><Icon name="bolt" size={12} />立即检查</button>
            </div>
            <div className="events" style={{ flex: 'none' }}>
              <div className="ev"><time>RESULT</time><span>{health ? health.message : '尚未执行检查'}</span></div>
              <div className="ev"><time>TIME</time><span>{health ? ago(health.checkedAt) : '—'}</span></div>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
