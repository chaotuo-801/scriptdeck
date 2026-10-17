import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Service, ServiceInput, Settings } from '../../shared/types'

const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  closeToTray: true,
  autoStart: false,
  logMaxBytes: 5 * 1024 * 1024,
  logKeep: 5,
  density: 'compact'
}

interface PersistedState {
  version: number
  services: Service[]
  settings: Settings
}

/** Versioned migrations. Add a new entry when the shape changes; never rewrite history. */
const MIGRATIONS: Record<number, (state: PersistedState) => PersistedState> = {
  // 1 -> 2 example:
  // 2: (state) => ({ ...state, version: 2, services: state.services.map(s => ({ ...s, newField: 0 })) })
}

function emptyState(): PersistedState {
  return { version: SCHEMA_VERSION, services: [], settings: { ...DEFAULT_SETTINGS } }
}

export class Store {
  private file = path.join(app.getPath('userData'), 'data', 'state.json')
  private state: PersistedState = emptyState()
  private timer: NodeJS.Timeout | null = null

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      let next: PersistedState = {
        version: parsed.version ?? 1,
        services: Array.isArray(parsed.services) ? parsed.services : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
      }
      while (next.version < SCHEMA_VERSION) {
        const migrate = MIGRATIONS[next.version + 1]
        if (!migrate) break
        next = migrate(next)
      }
      this.state = next
    } catch {
      this.state = emptyState()
      await this.flush()
    }
  }

  getServices(): Service[] {
    return this.state.services.map(s => ({ ...s }))
  }

  getService(id: string): Service | undefined {
    const found = this.state.services.find(s => s.id === id)
    return found ? { ...found } : undefined
  }

  getSettings(): Settings {
    return { ...this.state.settings }
  }

  create(input: ServiceInput): Service {
    const now = new Date().toISOString()
    const service: Service = { ...input, id: randomUUID(), createdAt: now, updatedAt: now }
    this.state.services.push(service)
    this.schedule()
    return { ...service }
  }

  update(id: string, patch: Partial<ServiceInput>): Service | undefined {
    const idx = this.state.services.findIndex(s => s.id === id)
    if (idx < 0) return undefined
    const next = { ...this.state.services[idx], ...patch, id, updatedAt: new Date().toISOString() }
    this.state.services[idx] = next
    this.schedule()
    return { ...next }
  }

  remove(id: string): boolean {
    const before = this.state.services.length
    this.state.services = this.state.services.filter(s => s.id !== id)
    const changed = this.state.services.length !== before
    if (changed) this.schedule()
    return changed
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.state.settings = { ...this.state.settings, ...patch }
    this.schedule()
    return { ...this.state.settings }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 200)
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8')
    await fs.rename(tmp, this.file)
  }
}

export const store = new Store()
