import {
  IBuffScript,
  ScriptBuffConfig,
  type TriggerAction,
} from '@/domain/buff/types'
import buffsData from '@configs/buffs/buffs.json'
import effectsData from '@configs/effects/effects.json'
import { ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { AtomicEffectRegistry } from '@/domain/buff/atomic/AtomicEffectRegistry'
import { BuffConfigResolver, type ResolvedBuffConfig } from '@/domain/buff/atomic/BuffConfigResolver'

/** 效果定义：脚本 + 配置的统一视图 */
export interface EffectDefinition {
  script: IBuffScript | null
  config: BuffConfigData | null
}

/** Aura 光环修饰符 */
interface BuffAuraModifier {
  id?: string
  targetAttribute: string
  type: string
  value: number
  condition?: string
}

/** Aura 光环配置 */
export interface BuffAuraConfig {
  targetSelector: 'self' | 'allies' | 'enemies'
  modifiers: BuffAuraModifier[]
}

interface BuffConfigData {
  id: string
  name?: string
  maxStacks?: number
  duration?: number
  attributes?: Record<string, string>
  immunities?: string[]
  tags?: string[]
  aura?: BuffAuraConfig
  onAdd?: string
  triggers?: TriggerAction[]
  /** buffs.json 中的 category（如 aura/attribute/trigger/control/dot/shield） */
  category?: string
  /** 控制类型（如 stun/silence/freeze） */
  controlType?: string
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
  /** 脚本注册表 */
  private registry = new Map<string, RegistryEntry>()
  private buffConfigs = new Map<string, BuffConfigData>()
  /** 脚本自包含的默认配置（由脚本类的静态 CONFIG 提供） */
  private defaultConfigs = new Map<string, ScriptBuffConfig>()

  /** 原子效果注册表（惰性初始化） */
  private atomicRegistry: AtomicEffectRegistry | null = null
  /** Buff 配置解析器（惰性初始化） */
  private configResolver: BuffConfigResolver | null = null
  /** 已解析的运行时配置缓存 */
  private resolvedConfigs = new Map<string, ResolvedBuffConfig>()

  public constructor() {
    this.loadBuffConfigs()
  }

  /** 确保原子效果注册表和解析器已初始化 */
  private ensureResolver(): BuffConfigResolver {
    if (!this.atomicRegistry) {
      this.atomicRegistry = new AtomicEffectRegistry()
    }
    if (!this.configResolver) {
      this.configResolver = new BuffConfigResolver(this.atomicRegistry)
    }
    return this.configResolver
  }

  /** 加载 buffs.json 中的配置 */
  private loadBuffConfigs(): void {
    try {
      if (Array.isArray(buffsData)) {
        for (const buff of buffsData) {
          if (buff.id) {
            // 校验 attributes 值格式
            if (buff.attributes) {
              for (const [key, value] of Object.entries(buff.attributes)) {
                if (typeof value !== 'string') {
                  LoggerProvider.logger.addDebugLog(
                    `Buff ${buff.id} 属性 ${key} 的值不是字符串: ${value}`,
                  )
                  continue
                }
                const trimmed = (value as string).trim()
                const numericStr = trimmed.replace('%', '')
                if (isNaN(parseFloat(numericStr))) {
                  LoggerProvider.logger.addDebugLog(
                    `Buff ${buff.id} 属性 ${key} 的值无法解析为数字: "${value}"`,
                  )
                }
              }
            }
            this.buffConfigs.set(buff.id, buff as BuffConfigData)
            console.log(`加载 Buff 配置: ${buff.id}`)
          }
        }
        LoggerProvider.logger.addDebugLog(
          `Loaded ${this.buffConfigs.size} buff configs from buffs.json`,
        )
      } else {
        LoggerProvider.logger.addDebugLog('buffs.json 格式错误: 不是数组')
      }
    } catch (error) {
      LoggerProvider.logger.addDebugLog('加载 Buff 配置失败:', {
        error: error as Error,
      })
    }
    this.loadEffectConfigs()
  }

  /** 效果参数到属性修饰符的映射表 */
  private static readonly EFFECT_PARAM_MAP: Record<string, string> = {
    attackBonus: 'attack',
    defenseBonus: 'defense',
    speedBonus: 'speed',
    healthBonus: 'maxHealth',
    criticalRateBonus: 'critRate',
    criticalDamageBonus: 'critDamage',
    teamAttackBonus: 'attack',
    teamHealPerTurn: 'hpRegenPercent',
    controlDurationReduction: 'controlDurationReduction',
    defenseReduction: 'defense',
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
          attributes:
            Object.keys(attributes).length > 0 ? attributes : undefined,
        }
        this.buffConfigs.set(effect.id, config)
        count++
      }
      if (count > 0) {
        LoggerProvider.logger.addDebugLog(
          `Loaded ${count} effect configs from effects.json`,
        )
      }
    } catch (error) {
      LoggerProvider.logger.addDebugLog('加载效果配置失败:', {
        error: error as Error,
      })
    }
  }

  public getBuffConfig(buffId: string): BuffConfigData | undefined {
    return this.buffConfigs.get(buffId)
  }

  /**
   * 获取带 effectPlan 的已解析运行时配置
   * 首次访问时惰性解析并缓存
   */
  public getResolvedBuffConfig(buffId: string): ResolvedBuffConfig | undefined {
    const cached = this.resolvedConfigs.get(buffId)
    if (cached) return cached

    const raw = this.buffConfigs.get(buffId)
    if (!raw) return undefined

    const resolver = this.ensureResolver()
    const resolved = resolver.resolve(raw as unknown as Record<string, any>)
    this.resolvedConfigs.set(buffId, resolved)
    return resolved
  }

  /** 清除解析缓存（在 reloadBuffConfigs 后调用） */
  private clearResolvedCache(): void {
    this.resolvedConfigs.clear()
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

  /** 获取已解析配置的 effectPlan（仅返回 effectPlan，无配置） */
  public getEffectPlan(buffId: string): ResolvedBuffConfig['effectPlan'] | undefined {
    return this.getResolvedBuffConfig(buffId)?.effectPlan
  }

  /** 检查 Buff 是否有非空的 effectPlan（纯数据驱动标记） */
  public hasEffectPlan(buffId: string): boolean {
    const resolved = this.getResolvedBuffConfig(buffId)
    return !!resolved && resolved.effectPlan.length > 0
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
    if (Math.abs(numValue) < 1)
      return { value: numValue * 100, type: ModifierType.PERCENTAGE }
    return { value: numValue, type: ModifierType.ADDITIVE }
  }

  public loadBuffConfigsFromArray(configs: BuffConfigData[]): void {
    for (const buff of configs) {
      if (buff.id) {
        this.buffConfigs.set(buff.id, buff)
        this.clearResolvedCache() // 清除缓存以便下次重新解析
      }
    }
  }

  public reloadBuffConfigs(): void {
    this.buffConfigs.clear()
    this.clearResolvedCache()
    this.loadBuffConfigs()
  }

  public register<TParams = any>(
    scriptId: string,
    factory: ScriptFactory<TParams>,
    metadata?: Partial<RegistryEntry['metadata']>,
    defaultConfig?: ScriptBuffConfig,
  ): void {
    if (this.registry.has(scriptId)) {
      LoggerProvider.logger.addDebugLog(
        `BUFF脚本 "${scriptId}" 已经注册, 请检查`,
      )
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
    if (defaultConfig) {
      this.defaultConfigs.set(scriptId, defaultConfig)
      LoggerProvider.logger.addDebugLog(
        `BUFF脚本 "${scriptId}" 提供自包含配置 (${Object.keys(defaultConfig).length} 个字段)`,
      )
    }
    LoggerProvider.logger.addDebugLog(`注册BUFF脚本: ${scriptId}`)
  }

  /** 获取脚本自包含的默认配置 */
  public getDefaultConfig(scriptId: string): ScriptBuffConfig | undefined {
    return this.defaultConfigs.get(scriptId)
  }

  /** 检查脚本是否为自包含模式——脚本自行管理修饰符，框架不再重复从 JSON 读取 */
  public isSelfContained(scriptId: string): boolean {
    // ponytail: 显式标记或任何已注册的脚本均视为自包含
    // 纯 JSON 配置（无脚本）的 buff 才通过 applyAttributeModifiers 应用修饰符
    return (
      this.defaultConfigs.get(scriptId)?.selfContained === true ||
      this.registry.has(scriptId)
    )
  }

  public registerScript(
    scriptId: string,
    script: any,
    defaultConfig?: ScriptBuffConfig,
  ): void {
    this.register(
      scriptId,
      () => script,
      { filePath: 'test', version: 'test' },
      defaultConfig,
    )
  }

  public get<TParams = any>(scriptId: string): IBuffScript<TParams> | null {
    const entry = this.registry.get(scriptId)
    if (!entry) {
      return null
    }
    try {
      return entry.factory()
    } catch (e) {
      LoggerProvider.logger.addDebugLog(
        `Failed to instantiate script "${scriptId}":`,
        { error: e as Error },
      )
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
