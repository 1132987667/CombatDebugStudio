import type { BuffContext } from '@/core/BuffContext'

export interface IBuffScript<TParams = any> {
  onApply(context: BuffContext): void
  onRemove(context: BuffContext): void
  onUpdate(context: BuffContext, deltaTime: number): void
  onRefresh(context: BuffContext): void
  params?: TParams
}

export interface BuffConfig {
  id: string
  name: string
  description: string
  duration: number
  maxStacks: number
  cooldown: number
  isPermanent?: boolean
  isDebuff?: boolean
  parameters?: Record<string, any>
}

export interface BuffInstance {
  id: string
  characterId: string
  buffId: string
  script: IBuffScript
  context: BuffContext
  startTime: number
  duration: number
  isActive: boolean
}

export interface BuffScriptMetadata {
  buffId: string
  scriptPath: string
  isLoaded: boolean
}
