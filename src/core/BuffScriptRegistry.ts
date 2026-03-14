/**
 * 文件: BuffScriptRegistry.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: Buff脚本注册表
 * 描述: 负责管理和注册Buff脚本，使用单例模式确保系统全局唯一，支持脚本的注册、获取、批量注册、检查和卸载
 * 版本: 1.0.0
 */

import { IBuffScript } from '@/types/buff'
import { battleLogManager } from '@/utils/logging'
import buffsData from '@configs/buffs/buffs.json'

/**
 * Buff配置数据接口
 * 对应buffs.json中的配置结构
 */
interface BuffConfigData {
  id: string
  name?: string
  maxStacks?: number
  duration?: number
  attributes?: Record<string, string>
  onAdd?: string
}

/**
 * 脚本工厂类型
 * 用于创建IBuffScript实例的函数类型
 */
type ScriptFactory<TParams = any> = () => IBuffScript<TParams>

/**
 * 注册表条目接口
 * 包含脚本工厂和元数据信息
 */
interface RegistryEntry<TParams = any> {
  /** 脚本工厂函数 */
  factory: ScriptFactory<TParams>
  /** 脚本元数据 */
  metadata: {
    /** 脚本ID */
    scriptId: string
    /** 脚本文件路径 */
    filePath: string
    /** 加载时间戳 */
    loadTime: number
    /** 脚本版本（可选） */
    version?: string
  }
}

/**
 * Buff脚本注册表类
 * 负责管理和注册Buff脚本
 * 支持脚本的注册、获取、批量注册、检查和卸载
 * 使用依赖注入方式获取实例，推荐通过容器使用
 */
export class BuffScriptRegistry {
  /** 脚本注册表，以脚本ID为键 */
  private registry = new Map<string, RegistryEntry>()
  /** Buff配置数据缓存，以buffId为键 */
  private buffConfigs = new Map<string, BuffConfigData>()

  /**
   * 构造函数
   */
  public constructor() {
    this.loadBuffConfigs()
  }

  /**
   * 加载Buff配置文件
   * 从buffs.json中读取配置数据并缓存
   */
  private loadBuffConfigs(): void {
    try {
      if (Array.isArray(buffsData)) {
        for (const buff of buffsData) {
          if (buff.id) {
            this.buffConfigs.set(buff.id, buff as BuffConfigData)
          }
        }
        battleLogManager.addDebugLog(
          `已加载 ${this.buffConfigs.size} 个Buff配置`,
        )
      }
    } catch (error) {
      battleLogManager.addDebugLog('加载Buff配置失败:', error)
    }
  }

  /**
   * 获取Buff配置数据
   * @param buffId Buff ID
   * @returns Buff配置数据
   */
  public getBuffConfig(buffId: string): BuffConfigData | undefined {
    return this.buffConfigs.get(buffId)
  }

  /**
   * 获取Buff的属性修饰符
   * @param buffId Buff ID
   * @returns 属性修饰符对象
   */
  public getBuffAttributes(buffId: string): Record<string, string> | undefined {
    const config = this.buffConfigs.get(buffId)
    return config?.attributes
  }

  /**
   * 解析属性修饰符字符串
   * 将 "+10" 解析为数值和类型
   * @param value 属性值字符串，如 "+10", "-0.15", "0.2"
   * @returns 包含数值和修饰类型的对象
   */
  public parseAttributeValue(value: string): {
    value: number
    type: 'ADDITIVE' | 'PERCENTAGE'
  } {
    const trimmed = value.trim()
    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
      const numValue = parseFloat(trimmed)
      if (Math.abs(numValue) < 1) {
        return { value: numValue, type: 'PERCENTAGE' }
      }
      return { value: numValue, type: 'ADDITIVE' }
    }
    const numValue = parseFloat(trimmed)
    if (isNaN(numValue)) {
      return { value: 0, type: 'ADDITIVE' }
    }
    if (Math.abs(numValue) < 1) {
      return { value: numValue, type: 'PERCENTAGE' }
    }
    return { value: numValue, type: 'ADDITIVE' }
  }

  /**
   * 标准化属性名称
   * 将不同格式的属性名称转换为统一的内部格式
   * @param attribute 属性名称
   * @returns 标准化后的属性名称
   */
  public normalizeAttributeName(attribute: string): string {
    const attributeMap: Record<string, string> = {
      speed: 'SPD',
      attack: 'ATK',
      defense: 'DEF',
      health: 'HP',
      critRate: 'CRIT_RATE',
      critDamage: 'CRIT_DMG',
      physicalDamageTaken: 'PHYSICAL_DMG_TAKEN',
      magicDamageTaken: 'MAGIC_DMG_TAKEN',
      fireDamageTaken: 'FIRE_DMG_TAKEN',
      waterDamageTaken: 'WATER_DMG_TAKEN',
      lightningDamageTaken: 'LIGHTNING_DMG_TAKEN',
      demonDamage: 'DEMON_DMG',
      buddhistDamage: 'BUDDHIST_DMG',
      slowImmune: 'SLOW_IMMUNE',
      stunResist: 'STUN_RESIST',
      knockbackResist: 'KNOCKBACK_RESIST',
      poisonResist: 'POISON_RESIST',
      bleedResist: 'BLEED_RESIST',
      burnImmune: 'BURN_IMMUNE',
      fireDamage: 'FIRE_DMG',
      poisonChance: 'POISON_CHANCE',
      webSuccessRate: 'WEB_SUCCESS_RATE',
      debuffDuration: 'DEBUFF_DURATION',
      hitRate: 'HIT_RATE',
      dodge: 'DODGE',
      skillCooldown: 'SKILL_CD',
    }
    return attributeMap[attribute.toLowerCase()] || attribute.toUpperCase()
  }

  /**
   * 批量加载Buff配置（用于动态刷新配置）
   * @param configs Buff配置数组
   */
  public loadBuffConfigsFromArray(configs: BuffConfigData[]): void {
    for (const buff of configs) {
      if (buff.id) {
        this.buffConfigs.set(buff.id, buff)
      }
    }
  }

  /**
   * 重新加载Buff配置文件
   */
  public reloadBuffConfigs(): void {
    this.buffConfigs.clear()
    this.loadBuffConfigs()
  }

  /**
   * 注册Buff脚本
   * @param scriptId 脚本ID
   * @param factory 脚本工厂函数
   * @param metadata 脚本元数据（可选）
   */
  public register<TParams = any>(
    scriptId: string,
    factory: ScriptFactory<TParams>,
    metadata?: Partial<RegistryEntry['metadata']>,
  ): void {
    if (this.registry.has(scriptId)) {
      battleLogManager.addDebugLog(
        `Script "${scriptId}" already registered, overwriting`,
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

    battleLogManager.addDebugLog(`Registered buff script: ${scriptId}`)
  }

  /**
   * 注册Buff脚本实例（兼容测试代码）
   * @param scriptId 脚本ID
   * @param script 脚本实例
   */
  public registerScript(scriptId: string, script: any): void {
    this.register(scriptId, () => script, {
      filePath: 'test',
      version: 'test',
    })
  }

  /**
   * 获取Buff脚本实例
   * @param scriptId 脚本ID
   * @returns Buff脚本实例，不存在或创建失败则返回null
   */
  public get<TParams = any>(scriptId: string): IBuffScript<TParams> | null {
    const entry = this.registry.get(scriptId)
    if (!entry) {
      battleLogManager.addDebugLog(`Buff script not found: ${scriptId}`)
      return null
    }

    try {
      return entry.factory()
    } catch (e) {
      battleLogManager.addDebugLog(
        `Failed to instantiate script "${scriptId}":`,
        e,
      )
      return null
    }
  }

  /**
   * 批量注册Buff脚本
   * @param entries 脚本注册条目数组
   */
  public batchRegister(
    entries: { scriptId: string; factory: ScriptFactory; filePath: string }[],
  ): void {
    entries.forEach((entry) => {
      this.register(entry.scriptId, entry.factory, { filePath: entry.filePath })
    })
  }

  /**
   * 检查脚本是否已注册
   * @param scriptId 脚本ID
   * @returns 是否已注册
   */
  public has(scriptId: string): boolean {
    return this.registry.has(scriptId)
  }

  /**
   * 获取所有已注册脚本的ID列表
   * @returns 脚本ID数组
   */
  public list(): string[] {
    return Array.from(this.registry.keys())
  }

  /**
   * 卸载Buff脚本
   * 用于热重载支持，卸载旧版本脚本
   * @param scriptId 脚本ID
   * @returns 是否成功卸载
   */
  public unregister(scriptId: string): boolean {
    return this.registry.delete(scriptId)
  }
}
