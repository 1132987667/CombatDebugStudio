import { IBuffScript } from '@/domain/buff/types'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import buffsData from '@configs/buffs/buffs.json'

interface BuffConfigData {
  id: string
  name?: string
  maxStacks?: number
  duration?: number
  attributes?: Record<string, string>
  onAdd?: string
}

type ScriptFactory<TParams = any> = () => IBuffScript<TParams>

interface RegistryEntry<TParams = any> {
  factory: ScriptFactory<TParams>
  metadata: {
    scriptId: string
    filePath: string
    loadTime: number
    version?: string
  }
}

export class BuffScriptRegistry {
  private registry = new Map<string, RegistryEntry>()
  private buffConfigs = new Map<string, BuffConfigData>()

  public constructor() {
    this.loadBuffConfigs()
  }

  private loadBuffConfigs(): void {
    try {
      if (Array.isArray(buffsData)) {
        for (const buff of buffsData) {
          if (buff.id) {
            this.buffConfigs.set(buff.id, buff as BuffConfigData)
          }
        }
        battleLogManager.addDebugLog(`Loaded ${this.buffConfigs.size} buff configs`)
      }
    } catch (error) {
      battleLogManager.addDebugLog('Failed to load buff configs:', error)
    }
  }

  public getBuffConfig(buffId: string): BuffConfigData | undefined {
    return this.buffConfigs.get(buffId)
  }

  public getBuffAttributes(buffId: string): Record<string, string> | undefined {
    const config = this.buffConfigs.get(buffId)
    return config?.attributes
  }

  public parseAttributeValue(value: string): {
    value: number
    type: 'ADDITIVE' | 'PERCENTAGE'
  } {
    const trimmed = value.trim()
    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
      const numValue = parseFloat(trimmed)
      if (Math.abs(numValue) < 1) return { value: numValue, type: 'PERCENTAGE' }
      return { value: numValue, type: 'ADDITIVE' }
    }
    const numValue = parseFloat(trimmed)
    if (isNaN(numValue)) return { value: 0, type: 'ADDITIVE' }
    if (Math.abs(numValue) < 1) return { value: numValue, type: 'PERCENTAGE' }
    return { value: numValue, type: 'ADDITIVE' }
  }

  public loadBuffConfigsFromArray(configs: BuffConfigData[]): void {
    for (const buff of configs) {
      if (buff.id) this.buffConfigs.set(buff.id, buff)
    }
  }

  public reloadBuffConfigs(): void {
    this.buffConfigs.clear()
    this.loadBuffConfigs()
  }

  public register<TParams = any>(
    scriptId: string,
    factory: ScriptFactory<TParams>,
    metadata?: Partial<RegistryEntry['metadata']>,
  ): void {
    if (this.registry.has(scriptId)) {
      battleLogManager.addDebugLog(`Script "${scriptId}" already registered, overwriting`)
    }
    this.registry.set(scriptId, {
      factory,
      metadata: {
        scriptId,
        filePath: metadata?.filePath ?? 'unknown',
        loadTime: Date.now(),
        version: metadata?.version,
      },
    })
    battleLogManager.addDebugLog(`Registered buff script: ${scriptId}`)
  }

  public registerScript(scriptId: string, script: any): void {
    this.register(scriptId, () => script, { filePath: 'test', version: 'test' })
  }

  public get<TParams = any>(scriptId: string): IBuffScript<TParams> | null {
    const entry = this.registry.get(scriptId)
    if (!entry) {
      battleLogManager.addDebugLog(`Buff script not found: ${scriptId}`)
      return null
    }
    try {
      return entry.factory()
    } catch (e) {
      battleLogManager.addDebugLog(`Failed to instantiate script "${scriptId}":`, e)
      return null
    }
  }

  public batchRegister(
    entries: { scriptId: string; factory: ScriptFactory; filePath: string }[],
  ): void {
    entries.forEach((entry) => {
      this.register(entry.scriptId, entry.factory, { filePath: entry.filePath })
    })
  }

  public has(scriptId: string): boolean {
    return this.registry.has(scriptId)
  }

  public list(): string[] {
    return Array.from(this.registry.keys())
  }

  public unregister(scriptId: string): boolean {
    return this.registry.delete(scriptId)
  }
}
