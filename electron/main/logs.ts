import { app, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LogLine, Settings } from '../../shared/types'

const TS_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s?(.*)$/

function classify(text: string): LogLine['level'] {
  if (/\b(ERROR|ERR|FATAL|EXCEPTION|EADDRINUSE)\b/i.test(text)) return 'error'
  if (/\b(WARN|WARNING)\b/i.test(text)) return 'warn'
  return 'info'
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export class LogManager {
  private readonly root = path.join(app.getPath('userData'), 'logs')
  private buffers = new Map<string, string>()
  private queues = new Map<string, Promise<void>>()

  dirFor(id: string): string {
    return path.join(this.root, id)
  }

  fileFor(id: string): string {
    return path.join(this.dirFor(id), 'current.log')
  }

  async ensure(id: string): Promise<void> {
    await fs.mkdir(this.dirFor(id), { recursive: true })
  }

  /** Split incoming raw output into complete, timestamped lines. */
  ingest(id: string, chunk: string, maxBytes: number, keep: number): LogLine[] {
    const merged = (this.buffers.get(id) ?? '') + chunk.replace(/\r\n/g, '\n')
    const parts = merged.split('\n')
    this.buffers.set(id, parts.pop() ?? '')
    const lines: LogLine[] = []
    for (const raw of parts) {
      const text = raw.replace(/\r$/, '')
      if (!text) continue
      lines.push({ time: stamp(), level: classify(text), text })
    }
    if (lines.length) this.enqueueWrite(id, lines, maxBytes, keep)
    return lines
  }

  flushPartial(id: string): LogLine[] {
    const rest = this.buffers.get(id)
    this.buffers.delete(id)
    if (!rest) return []
    return [{ time: stamp(), level: classify(rest), text: rest }]
  }

  private enqueueWrite(id: string, lines: LogLine[], maxBytes: number, keep: number): void {
    const prev = this.queues.get(id) ?? Promise.resolve()
    const next = prev.then(async () => {
      await this.ensure(id)
      await this.rotateIfNeeded(id, maxBytes, keep)
      const payload = lines.map(l => `[${l.time}] ${l.text}\n`).join('')
      await fs.appendFile(this.fileFor(id), payload, 'utf8')
    }).catch(() => undefined)
    this.queues.set(id, next)
  }

  private async rotateIfNeeded(id: string, maxBytes: number, keep: number): Promise<void> {
    const file = this.fileFor(id)
    let size = 0
    try { size = (await fs.stat(file)).size } catch { return }
    if (size < maxBytes) return
    for (let i = keep - 1; i >= 1; i--) {
      const from = path.join(this.dirFor(id), `current-${i}.log`)
      const to = path.join(this.dirFor(id), `current-${i + 1}.log`)
      try { await fs.rename(from, to) } catch { /* missing */ }
    }
    try { await fs.rename(file, path.join(this.dirFor(id), 'current-1.log')) } catch { /* ignore */ }
  }

  async tail(id: string, lines = 200): Promise<LogLine[]> {
    const file = this.fileFor(id)
    let handle: import('node:fs/promises').FileHandle | undefined
    try {
      handle = await fs.open(file, 'r')
      const { size } = await handle.stat()
      const window = Math.min(size, 256 * 1024)
      const buf = Buffer.alloc(window)
      await handle.read(buf, 0, window, size - window)
      const text = buf.toString('utf8')
      const rows = text.split('\n').map(r => r.replace(/\r$/, '')).filter(r => r.trim().length > 0).slice(-lines)
      return rows.map(row => {
        const m = TS_RE.exec(row)
        if (!m) return { time: '', level: classify(row), text: row }
        return { time: m[1].slice(11), level: classify(m[2]), text: m[2] }
      })
    } catch {
      return []
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  async clear(id: string): Promise<void> {
    this.buffers.delete(id)
    await this.ensure(id)
    await fs.writeFile(this.fileFor(id), '', 'utf8')
  }

  async reveal(id: string): Promise<void> {
    await this.ensure(id)
    const file = this.fileFor(id)
    try { await fs.access(file) } catch { await fs.writeFile(file, '', 'utf8') }
    shell.showItemInFolder(file)
  }

  async applyRetention(id: string, keep: number): Promise<void> {
    const dir = this.dirFor(id)
    let entries: string[] = []
    try { entries = await fs.readdir(dir) } catch { return }
    const rotated = entries.filter(e => /^current-\d+\.log$/.test(e)).sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0)
      const nb = Number(b.match(/\d+/)?.[0] ?? 0)
      return nb - na
    })
    for (const name of rotated.slice(Math.max(0, keep - 1))) {
      await fs.rm(path.join(dir, name), { force: true }).catch(() => undefined)
    }
  }
}

export const logs = new LogManager()
export type { Settings }
