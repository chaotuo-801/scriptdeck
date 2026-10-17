export type ServiceKind = 'node' | 'python' | 'pwsh' | 'cmd' | 'exe'
export type RestartPolicy = 'none' | 'on-failure' | 'always'
export type HealthType = 'process' | 'tcp' | 'http'
export type RunState = 'stopped' | 'starting' | 'running' | 'stopping' | 'exited'
export type ThemeMode = 'system' | 'dark' | 'light'

export interface HealthConfig {
  type: HealthType
  port?: number
  path?: string
  intervalMs: number
}

export interface Service {
  id: string
  name: string
  group: string
  kind: ServiceKind
  scriptPath: string
  args: string[]
  cwd: string
  env: Record<string, string>
  autoStart: boolean
  restartPolicy: RestartPolicy
  maxRestarts: number
  health: HealthConfig
  createdAt: string
  updatedAt: string
  /** Reserved for forward-compatible fields added by future versions. */
  meta?: Record<string, unknown>
}

export type ServiceInput = Omit<Service, 'id' | 'createdAt' | 'updatedAt'>

export interface HealthResult {
  ok: boolean
  latencyMs?: number
  message: string
  checkedAt: number
}

export interface RuntimeInfo {
  state: RunState
  pid?: number
  startedAt?: number
  exitCode?: number | null
  restarts: number
  lastError?: string
  health?: HealthResult
  stopping?: boolean
}

export interface ServiceView extends Service {
  runtime: RuntimeInfo
}

export interface LogLine {
  time: string
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface Settings {
  theme: ThemeMode
  closeToTray: boolean
  autoStart: boolean
  logMaxBytes: number
  logKeep: number
  density: 'compact' | 'standard'
}

export interface ScanCandidate {
  path: string
  name: string
  kind: ServiceKind
  port?: number
  envKeys: string[]
  selected: boolean
  warning?: string
}

export interface PortInfo {
  inUse: boolean
  pid?: number
  processName?: string
}

export interface StatusEvent {
  id: string
  runtime: RuntimeInfo
}

export interface LogEvent {
  id: string
  lines: LogLine[]
}

export interface ToastEvent {
  kind: 'info' | 'error'
  message: string
}

/**
 * Extensibility point: new service kinds are registered in the runtime registry,
 * new health probes in the health registry, and new scanners in the scanner list.
 * The renderer only depends on the shapes below.
 */
export interface ScriptDeckApi {
  platform: string
  services: {
    list(): Promise<ServiceView[]>
    create(input: ServiceInput): Promise<ServiceView>
    update(id: string, patch: Partial<ServiceInput>): Promise<ServiceView>
    remove(id: string): Promise<void>
    start(id: string): Promise<ServiceView>
    stop(id: string): Promise<ServiceView>
    restart(id: string): Promise<ServiceView>
    startAll(): Promise<void>
    stopAll(): Promise<void>
  }
  logs: {
    tail(id: string, lines?: number): Promise<LogLine[]>
    clear(id: string): Promise<void>
    reveal(id: string): Promise<void>
  }
  health: { check(id: string): Promise<HealthResult> }
  ports: { check(port: number): Promise<PortInfo> }
  dialogs: {
    pickScript(): Promise<string | null>
    pickFolder(): Promise<string | null>
  }
  importer: {
    scan(dir: string): Promise<ScanCandidate[]>
    commit(items: ScanCandidate[]): Promise<ServiceView[]>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  app: { quit(): Promise<void>; showMain(): Promise<void>; openDataDir(): Promise<void> }
  window: { minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void> }
  onServiceChanged(cb: (e: StatusEvent) => void): () => void
  onLog(cb: (e: LogEvent) => void): () => void
  onSettingsChanged(cb: (s: Settings) => void): () => void
  onToast(cb: (e: ToastEvent) => void): () => void
  onFocusService(cb: (id: string) => void): () => void
}

export const IPC = {
  servicesList: 'services:list',
  servicesCreate: 'services:create',
  servicesUpdate: 'services:update',
  servicesRemove: 'services:remove',
  servicesStart: 'services:start',
  servicesStop: 'services:stop',
  servicesRestart: 'services:restart',
  servicesStartAll: 'services:start-all',
  servicesStopAll: 'services:stop-all',
  logsTail: 'logs:tail',
  logsClear: 'logs:clear',
  logsReveal: 'logs:reveal',
  healthCheck: 'health:check',
  portsCheck: 'ports:check',
  dialogPickScript: 'dialog:pick-script',
  dialogPickFolder: 'dialog:pick-folder',
  importScan: 'import:scan',
  importCommit: 'import:commit',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  appQuit: 'app:quit',
  appShowMain: 'app:show-main',
  appOpenDataDir: 'app:open-data-dir',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  evtServiceChanged: 'evt:service-changed',
  evtLog: 'evt:log',
  evtSettingsChanged: 'evt:settings-changed',
  evtToast: 'evt:toast',
  evtFocusService: 'evt:focus-service'
} as const
