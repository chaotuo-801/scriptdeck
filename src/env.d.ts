import type { ScriptDeckApi } from '../shared/types'

declare global {
  interface Window {
    sd: ScriptDeckApi
  }
}

export {}
