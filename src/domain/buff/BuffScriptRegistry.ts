import {
  IBuffScript,
  ScriptBuffConfig,
} from '@/domain/buff/types'
import { buffsData } from '@/shared/types/buffs-json'
import effectsData from '@configs/effects/effects.json'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'
import { AtomicEffectRegistry } from '@/domain/buff/atomic/AtomicEffectRegistry'
import {
  BuffConfigResolver,
  type ResolvedBuffConfig,
} from '@/domain/buff/atomic/BuffConfigResolver'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { AttributeValueConfig } from '@/shared/types/buffs-json'
import type { EffectsJsonData } from '@/shared/types/effects-json'
// NOTE: 仅引用静态脚本清单（映射键 = 脚本类 BUFF_ID），用于构造时校验。
//       BuffScriptLoader.loadScripts 是异步的、晚于 registry 构造，此时 this.registry 尚为空，
//       因此"是否有脚本"须以静态清单判断，而非注册表。
import { buffScripts } from '@/domain/buff/scripts/index'

/** 效果定义：脚本 + 配置的统一视图 */
export interface EffectDefinition {
  script: IBuffScript | null
  config: BuffJsonEntry | null
}

/** Aura 光环修饰符 */
export interface BuffAuraModifier {
  id?: string
  targetAttribute: string
  type: ModifierType
  value: number
  condition?: string
}

/** Aura 光环配置 */
export interface BuffAuraConfig {
  targetSelector: 'self' | 'allies' | 'enemies'
  modifiers: BuffAuraModifier[]
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
  private buffConfigs = new Map<string, BuffJsonEntry>()
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
            // 配置值格式与键名校验由 validateBuffConfigs 统一执行（值须为 {value,type} 对象）
            this.buffConfigs.set(buff.id, buff as BuffJsonEntry)
          }
        }
        // TODO(P1): CONFIG_LOAD 事件落地后覆盖配置加载信息
      } else {
        LoggerProvider.logger.addDebugLog('buffs.json 格式错误: 不是数组', {
          level: LogLevel.ERROR,
        })
      }
    } catch (error) {
      LoggerProvider.logger.addDebugLog('加载 Buff 配置失败:', {
        level: LogLevel.ERROR,
        error: error as Error,
      })
    }
    this.loadEffectConfigs()
    this.validateBuffConfigs()
  }

  /** 加载时校验：不合规配置在加载时立即失败（校验失败 = 构建失败） */
  private validateBuffConfigs(): void {
    const knownCodes = Object.values(ATTRIBUTE_CODE) as string[]

    const validateAttrs = (
      attrs: Record<string, unknown> | undefined,
      where: string,
    ) => {
      if (!attrs) return
      for (const [key, value] of Object.entries(attrs)) {
        if (!knownCodes.includes(key)) {
          throw new Error(
            `[BuffConfigValidator] ${where} 中的 "${key}" 不在 ATTRIBUTE_CODE 中，修饰符将静默失效`,
          )
        }
        const cfg = value as { value?: unknown; type?: unknown } | null
        if (
          typeof cfg !== 'object' || cfg === null ||
          typeof cfg.value !== 'number' ||
          (cfg.type !== 'PERCENTAGE' && cfg.type !== 'ADDITIVE')
        ) {
          throw new Error(
            `[BuffConfigValidator] ${where} 中 "${key}" 的值格式非法，须为 { value: number, type: 'PERCENTAGE'|'ADDITIVE' }`,
          )
        }
      }
    }

    for (const [buffId] of this.buffConfigs) {
      const raw = this.buffConfigs.get(buffId)
      if (!raw) continue

      validateAttrs(raw.attributes as Record<string, unknown> | undefined, `${buffId}.attributes`)
      if (raw.effects) {
        for (const effect of raw.effects) {
          validateAttrs(
            (effect.params?.attributes ?? undefined) as Record<string, unknown> | undefined,
            `${buffId}.effects[].params.attributes`,
          )
        }
      }

      const hasScript =
        this.registry.has(buffId) ||
        Object.prototype.hasOwnProperty.call(buffScripts, buffId)
      const resolved = this.getResolvedBuffConfig(buffId)
      const hasEffectPlan = resolved?.effectPlan && resolved.effectPlan.length > 0
      const hasTriggers = (raw.triggers?.length ?? 0) > 0

      if (!hasScript && !hasEffectPlan && !hasTriggers) {
        throw new Error(
          `[BuffConfigValidator] ${buffId}: 无脚本、无 effects[]、无 triggers。` +
          `请至少配置其一。旧字段 attributes/controlType/immunities/aura 不再被识别。`
        )
      }
    }
  }

  /** 将 effects.json 的配置加载到注册表（属性对象与 polarity 由配置显式声明，不做翻译/量级猜测） */
  private loadEffectConfigs(): void {
    try {
      const raw = effectsData as EffectsJsonData
      if (!raw?.effects) return
      let count = 0
      for (const effect of raw.effects) {
        if (!effect.id) continue
        if (this.buffConfigs.has(effect.id)) continue // buffs.json 优先
        const params = effect.params || {}
        const attributes = (params.attributes ??
          {}) as Record<string, AttributeValueConfig>
        // polarity 由配置显式声明（type: "buff" | "debuff"）
        const polarity =
          effect.type === 'debuff'
            ? 'negative'
            : effect.type === 'buff'
              ? 'positive'
              : undefined
        const config: BuffJsonEntry = {
          id: effect.id,
          name: effect.id,
          polarity,
          description: effect.description ?? '',
          duration: (params.duration as number) ?? 1,
          maxStacks: (params.maxStacks as number) ?? 1,
          effects: [{
            type: 'modifier',
            params: {
              attributes,
              perStack: true,
            },
          }],
        }
        this.buffConfigs.set(effect.id, config)
        count++
      }
      if (count > 0) {
        // TODO(P1): CONFIG_LOAD 事件落地后覆盖配置加载信息
      }
    } catch (error) {
      LoggerProvider.logger.addDebugLog('加载效果配置失败:', {
        level: LogLevel.ERROR,
        error: error as Error,
      })
    }
  }

  public getBuffConfig(buffId: string): BuffJsonEntry | undefined {
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
    const resolved = resolver.resolve(raw as Record<string, any>)
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

  /** 获取已解析配置的 effectPlan（仅返回 effectPlan，无配置） */
  public getEffectPlan(
    buffId: string,
  ): ResolvedBuffConfig['effectPlan'] | undefined {
    return this.getResolvedBuffConfig(buffId)?.effectPlan
  }

  /** 检查 Buff 是否有非空的 effectPlan（纯数据驱动标记） */
  public hasEffectPlan(buffId: string): boolean {
    const resolved = this.getResolvedBuffConfig(buffId)
    return !!resolved && resolved.effectPlan.length > 0
  }

  public loadBuffConfigsFromArray(configs: BuffJsonEntry[]): void {
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
        { level: LogLevel.WARN },
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
    }
  }

  /** 获取脚本自包含的默认配置 */
  public getDefaultConfig(scriptId: string): ScriptBuffConfig | undefined {
    return this.defaultConfigs.get(scriptId)
  }

  public registerScript(
    scriptId: string,
    script: IBuffScript,
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
        { level: LogLevel.ERROR, error: e as Error },
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
