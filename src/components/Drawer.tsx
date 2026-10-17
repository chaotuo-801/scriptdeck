import { useState } from 'react'
import type { HealthType, RestartPolicy, ServiceInput, ServiceKind, ServiceView } from '../../shared/types'
import { Hint, Icon, Toggle } from './Ui'

interface Props {
  editing?: ServiceView
  onClose: () => void
  onSave: (input: ServiceInput, id?: string, startAfter?: boolean) => void
  notify: (kind: 'info' | 'error', message: string) => void
}

function defaults(): ServiceInput {
  return {
    name: '',
    group: '未分组',
    kind: 'node',
    scriptPath: '',
    args: [],
    cwd: '',
    env: {},
    autoStart: false,
    restartPolicy: 'on-failure',
    maxRestarts: 5,
    health: { type: 'process', intervalMs: 5000 }
  }
}

function splitArgs(raw: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = '' }
    } else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

export default function Drawer({ editing, onClose, onSave, notify }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [group, setGroup] = useState(editing?.group ?? '未分组')
  const [kind, setKind] = useState<ServiceKind>(editing?.kind ?? 'node')
  const [scriptPath, setScriptPath] = useState(editing?.scriptPath ?? '')
  const [args, setArgs] = useState(editing?.args.join(' ') ?? '')
  const [cwd, setCwd] = useState(editing?.cwd ?? '')
  const [envRows, setEnvRows] = useState<Array<{ k: string; v: string }>>(
    Object.entries(editing?.env ?? {}).map(([k, v]) => ({ k, v }))
  )
  const [autoStart, setAutoStart] = useState(editing?.autoStart ?? false)
  const [policy, setPolicy] = useState<RestartPolicy>(editing?.restartPolicy ?? 'on-failure')
  const [maxRestarts, setMaxRestarts] = useState(String(editing?.maxRestarts ?? 5))
  const [healthType, setHealthType] = useState<HealthType>(editing?.health.type ?? 'process')
  const [port, setPort] = useState(editing?.health.port ? String(editing.health.port) : '')
  const [healthPath, setHealthPath] = useState(editing?.health.path ?? '/')
  const [interval, setInterval] = useState(String(Math.round((editing?.health.intervalMs ?? 5000) / 1000)))

  const applyPreset = (preset: 'node' | 'python' | 'pwsh') => {
    setKind(preset)
    setHealthType(preset === 'node' ? 'tcp' : 'process')
    if (!name) setName(preset === 'node' ? 'Node 服务' : preset === 'python' ? 'Python 服务' : 'PowerShell 守护')
  }

  const browse = async () => {
    const file = await window.sd.dialogs.pickScript()
    if (!file) return
    setScriptPath(file)
    if (!name) setName(file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '')
    if (!cwd) setCwd(file.replace(/[\\/][^\\/]+$/, ''))
  }

  const checkPort = async () => {
    const p = Number(port)
    if (!p) { notify('error', '请先填写端口'); return }
    const info = await window.sd.ports.check(p)
    if (info.inUse) notify('error', `端口 ${p} 已被 ${info.processName ?? '未知进程'}${info.pid ? ` (${info.pid})` : ''} 占用`)
    else notify('info', `端口 ${p} 空闲`)
  }

  const submit = (startAfter: boolean) => {
    if (!name.trim()) { notify('error', '请填写服务名称'); return }
    if (!scriptPath.trim()) { notify('error', '请选择脚本路径'); return }
    const env: Record<string, string> = {}
    for (const row of envRows) if (row.k.trim()) env[row.k.trim()] = row.v
    const input: ServiceInput = {
      name: name.trim(),
      group: group.trim() || '未分组',
      kind,
      scriptPath: scriptPath.trim(),
      args: splitArgs(args),
      cwd: cwd.trim(),
      env,
      autoStart,
      restartPolicy: policy,
      maxRestarts: Math.max(1, Number(maxRestarts) || 5),
      health: {
        type: healthType,
        port: port ? Number(port) : undefined,
        path: healthPath || '/',
        intervalMs: Math.max(1, Number(interval) || 5) * 1000
      }
    }
    onSave(input, editing?.id, startAfter)
  }

  return (
    <>
      <div className="ov" onClick={onClose} />
      <div className="drawer">
        <div className="dh">
          <h3>{editing ? '编辑服务' : '新建服务'}</h3>
          <span style={{ fontSize: 9, color: 'var(--dim)' }}>PRESET</span>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}><Icon name="close" size={13} /></button>
        </div>

        <div className="db">
          <div className="presets">
            <button className={`preset ${kind === 'node' ? 'on' : ''}`} onClick={() => applyPreset('node')}>NODE HTTP 代理<span>NODE PROXY</span></button>
            <button className={`preset ${kind === 'python' ? 'on' : ''}`} onClick={() => applyPreset('python')}>PYTHON 服务<span>PYTHON</span></button>
            <button className={`preset ${kind === 'pwsh' ? 'on' : ''}`} onClick={() => applyPreset('pwsh')}>POWERSHELL 守护<span>PWSH</span></button>
          </div>

          <div className="sect">
            <h4>基本信息</h4>
            <div className="f"><label className="lbl-row">名称<Hint text={"显示在列表和托盘中的名字，只用于辨识，不影响启动。"} place="bottom" /></label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="例如 CC Switch CORS 中转" />
            </div>
            <div className="row2">
              <div className="f"><label className="lbl-row">分组<Hint text={"左侧导航按分组归类，同名分组会自动合并。\n可以随时改名，不影响运行中的服务。"} place="bottom" /></label>
                <input className="input" value={group} onChange={e => setGroup(e.target.value)} placeholder="未分组" />
              </div>
              <div className="f"><label className="lbl-row">启动方式<Hint text={"手动：只有点启动按钮时才运行。\n随应用启动：ScriptDeck 启动后自动拉起，前提是应用本身开机自启。"} place="bottom" align="right" /></label>
                <div className="seg">
                  <button className={!autoStart ? 'on' : ''} onClick={() => setAutoStart(false)}>手动</button>
                  <button className={autoStart ? 'on' : ''} onClick={() => setAutoStart(true)}>随应用启动</button>
                </div>
              </div>
            </div>
          </div>

          <div className="sect">
            <h4>运行方式</h4>
            <div className="f"><label className="lbl-row">脚本路径<Hint text={"要运行的脚本文件。\nNode / Python / PowerShell 会把该路径作为参数传给解释器；exe 类型则直接执行。"} /></label>
              <div className="input" style={{ paddingRight: 4 }}>
                <input style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', minWidth: 0 }} value={scriptPath} onChange={e => setScriptPath(e.target.value)} placeholder="选择或粘贴脚本路径" />
                <button className="btn sm" onClick={() => void browse()}>浏览</button>
              </div>
            </div>
            <div className="row2">
              <div className="f"><label className="lbl-row">解释器 / 类型<Hint text={"决定用什么方式启动。\nnode → .js/.mjs；python → .py；pwsh → .ps1；cmd → .bat/.cmd；exe → 直接运行可执行文件。"} /></label>
                <div className="seg">
                  {(['node', 'python', 'pwsh', 'cmd', 'exe'] as ServiceKind[]).map(k => (
                    <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>
                  ))}
                </div>
              </div>
              <div className="f"><label className="lbl-row">工作目录<Hint text={"子进程的当前目录。\n留空则使用脚本所在目录。脚本里用到相对路径时尤其重要。"} align="right" /></label>
                <input className="input" value={cwd} onChange={e => setCwd(e.target.value)} placeholder="默认脚本所在目录" />
              </div>
            </div>
            <div className="f"><label className="lbl-row">参数<Hint text={"附加给脚本的命令行参数，空格分隔。\n值里有空格时用双引号包起来，例如 --name \"my app\"。"} /></label>
              <input className="input" value={args} onChange={e => setArgs(e.target.value)} placeholder="空格分隔，引号内的内容视为一个参数" />
            </div>
          </div>

          <div className="sect">
            <h4 className="sec-h">环境变量<Hint text={"启动时注入给子进程的键值对，会覆盖同名系统环境变量。\n例如 SHIM_PORT=15722、SHIM_UPSTREAM=http://127.0.0.1:15721。"} /></h4>
            {envRows.map((row, i) => (
              <div className="envrow" key={i}>
                <input className="input" placeholder="KEY" value={row.k} onChange={e => setEnvRows(rows => rows.map((r, ri) => ri === i ? { ...r, k: e.target.value } : r))} />
                <input className="input" placeholder="value" value={row.v} onChange={e => setEnvRows(rows => rows.map((r, ri) => ri === i ? { ...r, v: e.target.value } : r))} />
                <button className="mini" onClick={() => setEnvRows(rows => rows.filter((_, ri) => ri !== i))}><Icon name="close" size={11} /></button>
              </div>
            ))}
            <button className="btn sm" onClick={() => setEnvRows(rows => [...rows, { k: '', v: '' }])}>＋ 添加变量</button>
          </div>

          <div className="sect">
            <h4 className="sec-h">重启策略<Hint text={"进程退出后的处理方式。\n不重启：保持停止；异常时：退出码非 0 才重启；总是：任何退出都重启。"} /></h4>
            <div className="row2">
              <div className="f">
                <div className="seg">
                  <button className={policy === 'none' ? 'on' : ''} onClick={() => setPolicy('none')}>不重启</button>
                  <button className={policy === 'on-failure' ? 'on' : ''} onClick={() => setPolicy('on-failure')}>异常时</button>
                  <button className={policy === 'always' ? 'on' : ''} onClick={() => setPolicy('always')}>总是</button>
                </div>
              </div>
              <div className="f"><label className="lbl-row">最大重启次数<Hint text={"连续自动重启的上限。\n达到后停止重试并保持异常状态，避免无限循环。"} align="right" /></label>
                <input className="input" value={maxRestarts} onChange={e => setMaxRestarts(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="sect">
            <h4 className="sec-h">健康检查<Hint text={"判断服务是否真正可用的方式。\n进程存活：只看进程在不在；\n端口可连：尝试连接本机端口；\nHTTP 探活：请求指定路径，状态码小于 500 视为健康。"} /></h4>
            <div className="seg" style={{ marginBottom: 8 }}>
              <button className={healthType === 'process' ? 'on' : ''} onClick={() => setHealthType('process')}>进程存活</button>
              <button className={healthType === 'tcp' ? 'on' : ''} onClick={() => setHealthType('tcp')}>端口可连</button>
              <button className={healthType === 'http' ? 'on' : ''} onClick={() => setHealthType('http')}>HTTP 探活</button>
            </div>
            <div className="row3">
              <div className="f"><label className="lbl-row">端口<Hint text={"健康检查连接的本地端口，通常与服务实际监听的端口一致。"} /></label>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input className="input" value={port} onChange={e => setPort(e.target.value)} placeholder="15722" />
                  <button className="btn sm" onClick={() => void checkPort()}>检查</button>
                </div>
              </div>
              <div className="f"><label className="lbl-row">路径<Hint text={"HTTP 探活请求的路径，例如 /health。\n只有选择 HTTP 探活时才会用到。"} /></label><input className="input" value={healthPath} onChange={e => setHealthPath(e.target.value)} placeholder="/" /></div>
              <div className="f"><label className="lbl-row">间隔（秒）<Hint text={"两次检查之间的间隔。\n默认 5 秒；太短会增加不必要的开销。"} align="right" /></label><input className="input" value={interval} onChange={e => setInterval(e.target.value)} /></div>
            </div>
          </div>
        </div>

        <div className="dfoot">
          <button className="btn" onClick={onClose}>取消</button>
          <div className="r">
            <button className="btn" onClick={() => submit(false)}>仅保存</button>
            <button className="btn primary" onClick={() => submit(true)}>{editing ? '保存并重启' : '保存并启动'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
