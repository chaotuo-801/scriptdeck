import net from 'node:net'
import http from 'node:http'
import type { HealthConfig, HealthResult, Service } from '../../shared/types'

export interface HealthContext {
  pid?: number
}

export type HealthProbe = (config: HealthConfig, ctx: HealthContext) => Promise<HealthResult>

const now = () => Date.now()

function result(ok: boolean, message: string, startedAt: number): HealthResult {
  return { ok, message, latencyMs: now() - startedAt, checkedAt: now() }
}

export const probes: Record<string, HealthProbe> = {
  process: async (_cfg, ctx) => {
    const t = now()
    if (!ctx.pid) return result(false, 'no process', t)
    try {
      process.kill(ctx.pid, 0)
      return result(true, '进程存活', t)
    } catch {
      return result(false, '进程不存在', t)
    }
  },
  tcp: async (cfg, ctx) => {
    const t = now()
    const port = cfg.port
    if (!port) return result(false, '未配置端口', t)
    return new Promise<HealthResult>(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      const done = (ok: boolean, msg: string) => {
        socket.destroy()
        resolve(result(ok, msg, t))
      }
      socket.setTimeout(1200)
      socket.once('connect', () => done(true, '端口可连'))
      socket.once('timeout', () => done(false, '连接超时'))
      socket.once('error', err => done(false, (err as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? '连接被拒绝' : err.message))
    })
  },
  http: async (cfg, ctx) => {
    const t = now()
    const port = cfg.port
    if (!port) return result(false, '未配置端口', t)
    return new Promise<HealthResult>(resolve => {
      const req = http.get({ host: '127.0.0.1', port, path: cfg.path || '/', timeout: 1500 }, res => {
        res.resume()
        const code = res.statusCode ?? 0
        resolve(result(code > 0 && code < 500, `HTTP ${code}`, t))
      })
      req.on('timeout', () => { req.destroy(); resolve(result(false, '请求超时', t)) })
      req.on('error', err => resolve(result(false, err.message, t)))
    })
  }
}

export function registerProbe(name: string, probe: HealthProbe): void {
  probes[name] = probe
}

export async function runHealth(service: Service, ctx: HealthContext): Promise<HealthResult> {
  const probe = probes[service.health.type] ?? probes.process
  try {
    return await probe(service.health, ctx)
  } catch (err) {
    return { ok: false, message: (err as Error).message, checkedAt: Date.now() }
  }
}
