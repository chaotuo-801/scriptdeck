import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PortInfo } from '../../shared/types'

const run = promisify(execFile)

function probe(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = (ok: boolean) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(400)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function owner(port: number): Promise<{ pid?: number; processName?: string }> {
  try {
    const { stdout } = await run('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    const line = stdout.split(/\r?\n/).find(l => l.includes(`:${port} `) && /LISTENING/i.test(l))
    const pid = Number(line?.trim().split(/\s+/).pop())
    if (!pid) return {}
    try {
      const { stdout: tasks } = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true })
      const name = tasks.split(',')[0]?.replace(/"/g, '').trim()
      return { pid, processName: name || undefined }
    } catch {
      return { pid }
    }
  } catch {
    return {}
  }
}

export async function checkPort(port: number): Promise<PortInfo> {
  const inUse = await probe(port)
  if (!inUse) return { inUse: false }
  return { inUse: true, ...(await owner(port)) }
}
