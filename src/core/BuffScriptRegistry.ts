import { IBuffScript } from '@/types/buff'
import { SimpleLogger } from '@/utils/logging'

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
 * 使用单例模式确保系统全局唯一
 * 支持脚本的注册、获取、批量注册、检查和卸载
 */
export class BuffScriptRegistry {
  /** 单例实例 */
  private static instance: BuffScriptRegistry
  /** 脚本注册表，以脚本ID为键 */
  private registry = new Map<string, RegistryEntry>()
  /** 日志记录器 */
  private readonly logger = new SimpleLogger({ prefix: 'BuffScriptRegistry' })

  /**
   * 私有构造函数
   * 防止外部直接实例化，确保单例模式
   */
  private constructor() {}

  /**
   * 获取单例实例
   * @returns Buff脚本注册表实例
   */
  public static getInstance(): BuffScriptRegistry {
    if (!BuffScriptRegistry.instance) {
      BuffScriptRegistry.instance = new BuffScriptRegistry()
    }
    return BuffScriptRegistry.instance
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
      this.logger.warn(`Script "${scriptId}" already registered, overwriting`)
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

    this.logger.info(`Registered buff script: ${scriptId}`)
  }

  /**
   * 获取Buff脚本实例
   * @param scriptId 脚本ID
   * @returns Buff脚本实例，不存在或创建失败则返回null
   */
  public get<TParams = any>(scriptId: string): IBuffScript<TParams> | null {
    const entry = this.registry.get(scriptId)
    if (!entry) {
      this.logger.error(`Buff script not found: ${scriptId}`)
      return null
    }

    try {
      return entry.factory()
    } catch (e) {
      this.logger.error(`Failed to instantiate script "${scriptId}":`, e)
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
