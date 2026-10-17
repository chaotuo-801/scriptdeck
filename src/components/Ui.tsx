import type { ReactNode } from 'react'
import type { RunState } from '../../shared/types'

export type IconName =
  | 'grid' | 'folder' | 'settings' | 'info' | 'search' | 'plus' | 'play' | 'stop'
  | 'restart' | 'more' | 'close' | 'chevron' | 'external' | 'check' | 'alert'
  | 'copy' | 'trash' | 'edit' | 'terminal' | 'bolt'

const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="2.5" y="2.5" width="4.6" height="4.6" rx=".8" /><rect x="8.9" y="2.5" width="4.6" height="4.6" rx=".8" /><rect x="2.5" y="8.9" width="4.6" height="4.6" rx=".8" /><rect x="8.9" y="8.9" width="4.6" height="4.6" rx=".8" /></>,
  folder: <path d="M2 4.6h4l1.3 1.6H14v7H2z" />,
  settings: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" /></>,
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.2v4M8 4.9v.2" /></>,
  search: <><circle cx="7" cy="7" r="4.3" /><path d="M10.4 10.4L14 14" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  play: <path d="M5.4 3.4L12 8l-6.6 4.6z" />,
  stop: <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1" />,
  restart: <><path d="M13.2 8a5.2 5.2 0 11-1.6-3.8" /><path d="M13.4 2.6v3.2h-3.2" /></>,
  more: <><circle cx="3.4" cy="8" r=".9" /><circle cx="8" cy="8" r=".9" /><circle cx="12.6" cy="8" r=".9" /></>,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  external: <><path d="M9 3h4v4M13 3L7.5 8.5" /><path d="M11.5 9.5V13H3V4.5h3.5" /></>,
  check: <path d="M3 8.4l3.2 3.2L13 5" />,
  alert: <><path d="M8 2.6l5.6 10.2H2.4z" /><path d="M8 6.4v3.1M8 11.4v.2" /></>,
  copy: <><rect x="5.4" y="5.4" width="8" height="8" rx="1.2" /><path d="M10.6 5.4V3.6a1 1 0 00-1-1H3.6a1 1 0 00-1 1v6a1 1 0 001 1h1.8" /></>,
  trash: <><path d="M3 4.6h10M6.2 4.6V3.2h3.6v1.4M4.4 4.6l.6 8.2h6l.6-8.2" /></>,
  edit: <><path d="M11.2 2.9l1.9 1.9-7.3 7.3-2.6.7.7-2.6z" /></>,
  terminal: <><rect x="2" y="3" width="12" height="10" rx="1.2" /><path d="M4.4 6.2l1.9 1.8-1.9 1.8M8.2 9.8h3.2" /></>,
  bolt: <path d="M8.6 1.8L3.4 9h3.6l-.6 5.2L11.8 7H8.2z" />
}

export function Icon({ name, size = 15, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`i ${className}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const stateLabel: Record<RunState, string> = {
  running: 'RUNNING',
  starting: 'STARTING',
  stopping: 'STOPPING',
  stopped: 'STOPPED',
  exited: 'EXITED'
}

export function StatusPill({ state, code }: { state: RunState; code?: number | null }) {
  const cls = state === 'running' || state === 'starting' ? 'ok' : state === 'exited' ? 'err' : 'off'
  return (
    <span className={`pill ${cls}`}>
      <span className={`dot ${cls}`} />
      {stateLabel[state]}{state === 'exited' && code != null ? ` · ${code}` : ''}
    </span>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`sw ${on ? 'on' : ''}`} aria-label={label} aria-pressed={on} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

export function Seg<T extends string>({ value, options, onChange, width }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; width?: number }) {
  return (
    <div className="seg" style={width ? { width } : undefined}>
      {options.map(o => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" />
}

export function Hint({ text, place = 'top', align = 'left' }: { text: string; place?: 'top' | 'bottom'; align?: 'left' | 'right' | 'center' }) {
  return (
    <span className={`hint-wrap ${place} ${align}`} tabIndex={0} role="img" aria-label={text}>
      <Icon name="info" size={11} />
      <span className="tip" role="tooltip">{text}</span>
    </span>
  )
}
