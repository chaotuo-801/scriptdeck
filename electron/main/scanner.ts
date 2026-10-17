import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ScanCandidate, ServiceKind } from '../../shared/types'
import { listRuntimes } from './runtime'
import { checkPort } from './ports'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.cache'])

function kindFor(file: string): ServiceKind | null {
  const ext = path.extname(file).toLowerCase()
  for (const rt of listRuntimes()) {
    if (rt.extensions.includes(ext)) return rt.kind
  }
  return null
}

function detectPort(text: string): number | undefined {
  const patterns = [
    /(?:PORT|ShimPort|shim_port)\s*[=:]\s*['"]?(\d{2,5})/,
    /--port[=\s]+(\d{2,5})/,
    /listen\(\s*(?:process\.env\.\w+\s*\|\|\s*)?(\d{2,5})/,
    /127\.0\.0\.1:(\d{2,5})/
  ]
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return Number(m[1])
  }
  return undefined
}

function detectEnv(text: string): string[] {
  const keys = new Set<string>()
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) keys.add(m[1])
  for (const m of text.matchAll(/os\.environ(?:\.get)?[\[(]\s*['"]([A-Z][A-Z0-9_]+)['"]/g)) keys.add(m[1])
  for (const m of text.matchAll(/ENV\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) keys.add(m[1])
  return [...keys].slice(0, 8)
}

export async function scanFolder(dir: string, depth = 2): Promise<ScanCandidate[]> {
  const out: ScanCandidate[] = []
  async function walk(current: string, level: number): Promise<void> {
    if (level > depth || out.length > 200) return
    let entries: import('node:fs').Dirent[]
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length > 200) return
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, level + 1)
        continue
      }
      const kind = kindFor(entry.name)
      if (!kind) continue
      let head = ''
      try {
        const handle = await fs.open(full, 'r')
        const buf = Buffer.alloc(64 * 1024)
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
        head = buf.subarray(0, bytesRead).toString('utf8')
        await handle.close()
      } catch { /* unreadable */ }
      const port = detectPort(head)
      let warning: string | undefined
      if (port) {
        const info = await checkPort(port)
        if (info.inUse) warning = `端口 ${port} 已被${info.processName ? ` ${info.processName}` : ''}${info.pid ? ` (${info.pid})` : ''}占用`
      }
      out.push({
        path: full,
        name: path.basename(entry.name, path.extname(entry.name)),
        kind,
        port,
        envKeys: detectEnv(head),
        selected: !warning,
        warning
      })
    }
  }
  await walk(dir, 0)
  return out
}
