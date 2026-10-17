import { EventEmitter } from 'node:events'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { HealthResult, LogLine, RuntimeInfo, RunState, ServiceView, StatusEvent, LogEvent, ToastEvent } from '../../shared/types'
import { store } from './store'
import { logs } from './logs'
import { buildLaunch } from './runtime'
import { runHealth } from './health'

interface Managed {
  state: RunState
  child?: ChildProcess
  pid?: number
  startedAt?: number
  exitCode?: number | null
  restarts: number
  stopRequested: boolean
  lastError?: string
  health?: HealthResult
  startTimer?: NodeJS.Timeout
  restartTimer?: NodeJS.Timeout
  healthTimer?: NodeJS.Timeout
  exitWaiters: Array<() => void>
}

const empty = (): Managed => ({ state: 'stopped', restarts: 0, stopRequested: false, exitWaiters: [] })

export class Supervisor extends EventEmitter {
  private managed = new Map<string, Managed>()

  private get(id: string): Managed {
    let m = this.managed.get(id)
    if (!m) { m = empty(); this.managed.set(id, m) }
    return m
  }

  runtimeOf(id: string): RuntimeInfo {
    const m = this.managed.get(id)
    if (!m) return { state: 'stopped', restarts: 0 }
    return {
      state: m.state,
      pid: m.pid,
      startedAt: m.startedAt,
      exitCode: m.exitCode,
      restarts: m.restarts,
      lastError: m.lastError,
      health: m.health
    }
  }

  views(): ServiceView[] {
    return store.getServices().map(s => ({ ...s, runtime: this.runtimeOf(s.id) }))
  }

  view(id: string): ServiceView | undefined {
    const s = store.getService(id)
    return s ? { ...s, runtime: this.runtimeOf(id) } : undefined
  }

  private emitStatus(id: string): void {
    const s = store.getService(id)
    if (!s) return
    const payload: StatusEvent = { id, runtime: this.runtimeOf(id) }
    this.emit('status', payload)
  }

  private emitToast(kind: ToastEvent['kind'], message: string): void {
    this.emit('toast', { kind, message } satisfies ToastEvent)
  }

  async start(id: string): Promise<void> {
    const service = store.getService(id)
    if (!service) throw new Error('服务不存在')
    const m = this.get(id)
    if (m.state === 'running' || m.state === 'starting') return
    if (!existsSync(service.scriptPath)) {
      m.state = 'exited'
      m.lastError = '脚本路径不存在'
      this.emitStatus(id)
      throw new Error(`脚本路径不存在: ${service.scriptPath}`)
    }

    if (m.restartTimer) { clearTimeout(m.restartTimer); m.restartTimer = undefined }
    const launch = buildLaunch(service)
    const cwd = launch.cwd || path.dirname(service.scriptPath)
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: { ...process.env, ...launch.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    m.child = child
    m.pid = child.pid
    m.state = 'starting'
    m.startedAt = Date.now()
    m.exitCode = undefined
    m.stopRequested = false
    m.lastError = undefined
    m.health = undefined
    this.emitStatus(id)

    child.stdout?.on('data', (d: Buffer) => this.onData(id, d.toString()))
    child.stderr?.on('data', (d: Buffer) => this.onData(id, d.toString()))
    child.on('error', err => {
      m.lastError = err.message
      this.emitStatus(id)
    })
    child.once('exit', code => this.onExit(id, code))

    if (m.startTimer) clearTimeout(m.startTimer)
    m.startTimer = setTimeout(() => {
      if (m.state === 'starting') {
        m.state = 'running'
        this.emitStatus(id)
        this.startHealth(id)
      }
    }, 700)
  }

  private onData(id: string, chunk: string): void {
    const settings = store.getSettings()
    const lines = logs.ingest(id, chunk, settings.logMaxBytes, settings.logKeep)
    if (lines.length) {
      const payload: LogEvent = { id, lines }
      this.emit('log', payload)
    }
  }

  private onExit(id: string, code: number | null): void {
    const m = this.get(id)
    if (m.startTimer) { clearTimeout(m.startTimer); m.startTimer = undefined }
    this.stopHealth(id)
    const tail = logs.flushPartial(id)
    if (tail.length) this.emit('log', { id, lines: tail } satisfies LogEvent)

    const wasStopping = m.stopRequested
    m.child = undefined
    m.pid = undefined
    m.exitCode = code

    if (wasStopping) {
      m.state = 'stopped'
      m.stopRequested = false
      m.health = undefined
      this.emitStatus(id)
      this.resolveExit(m)
      return
    }

    m.state = 'exited'
    m.lastError = `进程退出，退出码 ${code ?? 'null'}`

    const service = store.getService(id)
    if (!service) { this.emitStatus(id); return }
    const failed = code !== 0
    const shouldRestart = service.restartPolicy !== 'none' && (service.restartPolicy === 'always' || failed) && m.restarts < service.maxRestarts
    if (shouldRestart) m.restarts += 1
    this.emitStatus(id)

    if (shouldRestart) {
      const delay = Math.min(30000, 1000 * Math.pow(2, m.restarts - 1))
      this.emitToast('info', `${service.name} 已退出，${Math.round(delay / 1000)} 秒后第 ${m.restarts} 次重启`)
      m.restartTimer = setTimeout(() => {
        m.restartTimer = undefined
        void this.start(id).catch(() => undefined)
      }, delay)
    } else if (failed) {
      this.emitToast('error', `${service.name} 异常退出（code ${code}）`)
    }
    this.resolveExit(m)
  }

  private resolveExit(m: Managed): void {
    const waiters = m.exitWaiters.splice(0)
    for (const fn of waiters) fn()
  }

  async stop(id: string): Promise<void> {
    const m = this.managed.get(id)
    if (!m || (m.state !== 'running' && m.state !== 'starting' && m.state !== 'exited')) return
    if (m.restartTimer) { clearTimeout(m.restartTimer); m.restartTimer = undefined }
    if (m.startTimer) { clearTimeout(m.startTimer); m.startTimer = undefined }
    const child = m.child
    const pid = m.pid
    if (!child || !pid) {
      m.state = 'stopped'
      m.health = undefined
      this.emitStatus(id)
      return
    }

    m.stopRequested = true
    m.state = 'stopping'
    this.emitStatus(id)

    const exited = new Promise<void>(resolve => m.exitWaiters.push(resolve))
    try { child.kill() } catch { /* ignore */ }

    const force = setTimeout(() => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined)
    }, 3000)

    await Promise.race([
      exited,
      new Promise<void>(resolve => setTimeout(resolve, 5000))
    ])
    clearTimeout(force)
    if (m.state === 'stopping') {
      m.state = 'stopped'
      m.stopRequested = false
      m.child = undefined
      m.pid = undefined
      m.health = undefined
      this.emitStatus(id)
    }
  }

  async restart(id: string): Promise<void> {
    await this.stop(id)
    await new Promise(resolve => setTimeout(resolve, 150))
    await this.start(id)
  }

  async startAll(): Promise<void> {
    for (const s of store.getServices()) {
      if (s.autoStart) await this.start(s.id).catch(() => undefined)
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(store.getServices().map(s => this.stop(s.id)))
  }

  async checkHealth(id: string): Promise<HealthResult> {
    const service = store.getService(id)
    if (!service) throw new Error('服务不存在')
    const m = this.get(id)
    const res = await runHealth(service, { pid: m.pid })
    m.health = res
    this.emitStatus(id)
    return res
  }

  private startHealth(id: string): void {
    this.stopHealth(id)
    const m = this.get(id)
    const service = store.getService(id)
    if (!service) return
    const interval = Math.max(1500, service.health.intervalMs || 5000)
    m.healthTimer = setInterval(() => { void this.checkHealth(id).catch(() => undefined) }, interval)
    void this.checkHealth(id).catch(() => undefined)
  }

  private stopHealth(id: string): void {
    const m = this.managed.get(id)
    if (m?.healthTimer) { clearInterval(m.healthTimer); m.healthTimer = undefined }
  }

  async dispose(): Promise<void> {
    await this.stopAll()
    for (const m of this.managed.values()) {
      if (m.healthTimer) clearInterval(m.healthTimer)
      if (m.restartTimer) clearTimeout(m.restartTimer)
      if (m.startTimer) clearTimeout(m.startTimer)
    }
  }
}

export const supervisor = new Supervisor()
