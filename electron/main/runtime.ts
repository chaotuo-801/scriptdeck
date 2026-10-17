import path from 'node:path'
import type { Service, ServiceKind } from '../../shared/types'

export interface LaunchSpec {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
}

export interface RuntimeAdapter {
  kind: ServiceKind
  label: string
  extensions: string[]
  build(service: Service): LaunchSpec
}

const baseEnv = { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', FORCE_COLOR: '0' }

const adapters = new Map<ServiceKind, RuntimeAdapter>()

export function registerRuntime(adapter: RuntimeAdapter): void {
  adapters.set(adapter.kind, adapter)
}

export function listRuntimes(): RuntimeAdapter[] {
  return [...adapters.values()]
}

export function buildLaunch(service: Service): LaunchSpec {
  const adapter = adapters.get(service.kind)
  if (!adapter) throw new Error(`未注册的运行类型: ${service.kind}`)
  const spec = adapter.build(service)
  return {
    ...spec,
    cwd: spec.cwd || service.cwd || path.dirname(service.scriptPath),
    env: { ...baseEnv, ...spec.env, ...service.env }
  }
}

registerRuntime({ kind: 'node', label: 'Node', extensions: ['.mjs', '.js', '.cjs'], build: s => ({ command: 'node', args: [s.scriptPath, ...s.args], env: {}, cwd: s.cwd }) })
registerRuntime({ kind: 'python', label: 'Python', extensions: ['.py'], build: s => ({ command: 'python', args: [s.scriptPath, ...s.args], env: {}, cwd: s.cwd }) })
registerRuntime({ kind: 'pwsh', label: 'PowerShell', extensions: ['.ps1'], build: s => ({ command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', s.scriptPath, ...s.args], env: {}, cwd: s.cwd }) })
registerRuntime({ kind: 'cmd', label: 'CMD', extensions: ['.bat', '.cmd'], build: s => ({ command: 'cmd.exe', args: ['/d', '/s', '/c', s.scriptPath, ...s.args], env: {}, cwd: s.cwd }) })
registerRuntime({ kind: 'exe', label: 'Executable', extensions: ['.exe'], build: s => ({ command: s.scriptPath, args: s.args, env: {}, cwd: s.cwd }) })
