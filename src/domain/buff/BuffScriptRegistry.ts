import { IBuffScript } from '@/domain/buff/types'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import buffsData from '@configs/buffs/buffs.json'
import effectsData from '@configs/effects/effects.json'
import { ModifierType } from '@/domain/attribute/types'

/** 效果定义：脚本 + 配置的统一视图 */
export interface EffectDefinition {
  script: IBuffScript | null
  config: BuffConfigData | null
}

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
        battleLogManager.addDebugLog(`Loaded ${this.buffConfigs.size} buff configs from buffs.json`)
      }
    } catch (error) {
      battleLogManager.addDebugLog('Failed to load buff configs:', error)
    }
    this.loadEffectConfigs()
  }

  /** 效果参数到属性修饰符的映射表 */
  private static readonly EFFECT_PARAM_MAP: Record<string, string> = {
    attackBonus: 'ATK',
    defenseBonus: 'DEF',
    speedBonus: 'SPD',
    healthBonus: 'MAX_HP',
    criticalRateBonus: 'CRIT_RATE',
    criticalDamageBonus: 'CRIT_DMG',
    teamAttackBonus: 'ATK',
    teamHealPerTurn: 'HP_REGEN_PERCENT',
    controlDurationReduction: 'CONTROL_DURATION_REDUCTION',
    defenseReduction: 'DEF',
  }

  /** 将 effects.json 的参数转换为 attributes 格式并加载到注册表 */
  private loadEffectConfigs(): void {
    try {
      const raw = effectsData as { effects: Array<Record<string, any>> }
      if (!raw?.effects) return
      let count = 0
      for (const effect of raw.effects) {
        if (!effect.id) continue
        if (this.buffConfigs.has(effect.id)) continue // buffs.json 优先
        const attributes: Record<string, string> = {}
        const params = effect.params || {}
        for (const [key, value] of Object.entries(params)) {
          const attr = BuffScriptRegistry.EFFECT_PARAM_MAP[key]
          if (!attr || typeof value !== 'number') continue
          let pct: number
          if (key === 'defenseReduction') {
            pct = Math.round((1 - value) * 100) // 0.7 → -30%
          } else if (value > 1) {
            pct = Math.round((value - 1) * 100) // 1.2 → +20%
          } else {
            pct = Math.round(value * 100) // 0.03 → +3%
          }
          const sign = pct >= 0 ? '+' : ''
          attributes[attr] = `${sign}${pct}%`
        }
        const config: BuffConfigData = {
          id: effect.id,
          name: effect.id,
          duration: params.duration ?? 1,
          maxStacks: params.maxStacks ?? 1,
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        }
        this.buffConfigs.set(effect.id, config)
        count++
      }
      if (count > 0) {
        battleLogManager.addDebugLog(`Loaded ${count} effect configs from effects.json`)
      }
    } catch (error) {
      battleLogManager.addDebugLog('Failed to load effects configs:', error)
    }
  }

  public getBuffConfig(buffId: string): BuffConfigData | undefined {
    return this.buffConfigs.get(buffId)
  }

  /** 统一查询效果定义：脚本优先，配置兜底 */
  public resolve(effectId: string): EffectDefinition | null {
    const script = this.get(effectId)
    const config = this.buffConfigs.get(effectId) ?? null
    if (!script && !config) return null
    return { script, config }
  }

  public getBuffAttributes(buffId: string): Record<string, string> | undefined {
    const config = this.buffConfigs.get(buffId)
    return config?.attributes
  }

  public parseAttributeValue(value: string): {
    value: number
    type: ModifierType
  } {
    const trimmed = value.trim()
    // ponytail: detect explicit % suffix first — "+10%" → PERCENTAGE 0.1
    const isPercent = trimmed.includes('%')
    const numericStr = trimmed.replace('%', '')
    const numValue = parseFloat(numericStr)
    if (isNaN(numValue)) return { value: 0, type: ModifierType.ADDITIVE }

    if (isPercent) {
      // ponytail: x100 convention — "20%" means 20, recalc does (100+20)/100 = 1.2
      return { value: numValue, type: ModifierType.PERCENTAGE }
    }
    // backward compatible: decimal like "+0.1" is also PERCENTAGE → convert to x100
    if (Math.abs(numValue) < 1) return { value: numValue * 100, type: ModifierType.PERCENTAGE }
    return { value: numValue, type: ModifierType.ADDITIVE }
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
