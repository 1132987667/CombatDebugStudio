/**
 * 文件: Framework.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 核心框架类
 * 描述: 框架初始化和配置管理，模块生命周期管理，插件系统集成，事件系统管理，资源管理和性能监控
 * 版本: 1.0.0
 */

/**
 * 通用战斗框架 - 核心框架类
 *
 * 职责：
 * 1. 框架初始化和配置管理
 * 2. 模块生命周期管理
 * 3. 插件系统集成
 * 4. 事件系统管理
 * 5. 资源管理和性能监控
 */

import type {
  FrameworkConfig,
  IBattleSystem,
  IAISystem,
  IConfigManager,
  IPluginManager,
  IEventSystem,
} from './interfaces'
import { EventSystem } from './EventSystem'
import { ConfigManager } from './ConfigManager'
import { PluginManager } from './PluginManager'
import { FrameworkLogger } from '@/utils/logging'
import { PerformanceMonitor } from '../utils/PerformanceMonitor'

/**
 * 通用战斗框架主类
 */
export class CombatFramework {
  private static instance: CombatFramework
  private config: FrameworkConfig
  private logger: Logger
  private performanceMonitor: PerformanceMonitor
  private eventSystem: IEventSystem
  private configManager: IConfigManager
  private pluginManager: IPluginManager
  private isInitialized = false

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {
    // 默认配置
    this.config = {
      version: '1.0.0',
      debug: false,
      performanceMonitoring: true,
      logLevel: 'info',
      resourceLimits: {
        maxBattles: 100,
        maxParticipants: 1000,
        maxActionsPerBattle: 1000,
      },
    }

    // 初始化核心组件
    this.logger = new Logger()
    this.performanceMonitor = new PerformanceMonitor()
    this.eventSystem = new EventSystem()
    this.configManager = new ConfigManager()
    this.pluginManager = new PluginManager(this.eventSystem, this.configManager)
  }

  /**
   * 获取框架单例实例
   */
  public static getInstance(): CombatFramework {
    if (!CombatFramework.instance) {
      CombatFramework.instance = new CombatFramework()
    }
    return CombatFramework.instance
  }

  /**
   * 初始化框架
   */
  public async initialize(config?: Partial<FrameworkConfig>): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Framework already initialized')
      return
    }

    try {
      // 合并配置
      if (config) {
        this.config = { ...this.config, ...config }
      }

      // 初始化性能监控
      if (this.config.performanceMonitoring) {
        this.performanceMonitor.start()
      }

      // 初始化配置管理器
      await this.configManager.initialize()

      // 初始化插件管理器
      await this.pluginManager.initializePlugins()

      // 注册框架事件
      this.registerFrameworkEvents()

      this.isInitialized = true
      this.logger.info('CombatFramework initialized successfully', {
        version: this.config.version,
        debug: this.config.debug,
      })

      // 触发初始化完成事件
      this.eventSystem.emit('framework:initialized', {
        version: this.config.version,
        timestamp: Date.now(),
      })
    } catch (error) {
      this.logger.error('Failed to initialize CombatFramework', { error })
      throw error
    }
  }

  /**
   * 销毁框架
   */
  public async destroy(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    try {
      // 停止性能监控
      if (this.config.performanceMonitoring) {
        this.performanceMonitor.stop()
      }

      // 销毁所有插件
      await this.pluginManager.destroyAllPlugins()

      // 清理事件监听器
      this.eventSystem.removeAllListeners()

      this.isInitialized = false
      this.logger.info('CombatFramework destroyed successfully')
    } catch (error) {
      this.logger.error('Failed to destroy CombatFramework', { error })
    }
  }

  /**
   * 获取配置管理器
   */
  public getConfigManager(): IConfigManager {
    return this.configManager
  }

  /**
   * 获取插件管理器
   */
  public getPluginManager(): IPluginManager {
    return this.pluginManager
  }

  /**
   * 获取事件系统
   */
  public getEventSystem(): IEventSystem {
    return this.eventSystem
  }

  /**
   * 获取性能监控器
   */
  public getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor
  }

  /**
   * 获取日志记录器
   */
  public getLogger(): Logger {
    return this.logger
  }

  /**
   * 获取框架配置
   */
  public getConfig(): FrameworkConfig {
    return { ...this.config }
  }

  /**
   * 更新框架配置
   */
  public updateConfig(updates: Partial<FrameworkConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...updates }

    // 触发配置变更事件
    this.eventSystem.emit('framework:configChanged', {
      oldConfig,
      newConfig: this.config,
      timestamp: Date.now(),
    })

    this.logger.info('Framework configuration updated', { updates })
  }

  /**
   * 检查框架是否已初始化
   */
  public isFrameworkInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * 注册框架核心事件
   */
  private registerFrameworkEvents(): void {
    // 性能监控事件
    this.eventSystem.on('performance:metric', (metric) => {
      if (this.config.debug) {
        this.logger.debug('Performance metric', metric)
      }
    })

    // 错误处理事件
    this.eventSystem.on('framework:error', (error) => {
      this.logger.error('Framework error', error)
    })

    // 资源监控事件
    this.eventSystem.on('resource:warning', (warning) => {
      this.logger.warn('Resource warning', warning)
    })
  }

  /**
   * 获取框架状态信息
   */
  public getStatus(): FrameworkStatus {
    return {
      initialized: this.isInitialized,
      version: this.config.version,
      uptime: this.performanceMonitor.getUptime(),
      activePlugins: this.pluginManager.getAllPlugins().length,
      memoryUsage: process.memoryUsage(),
      performanceMetrics: this.performanceMonitor.getMetrics(),
    }
  }
}

/**
 * 框架状态接口
 */
export interface FrameworkStatus {
  initialized: boolean
  version: string
  uptime: number
  activePlugins: number
  memoryUsage: NodeJS.MemoryUsage
  performanceMetrics: any
}

/**
 * 框架便捷访问方法
 */
export function getFramework(): CombatFramework {
  return CombatFramework.getInstance()
}

export async function initializeFramework(
  config?: Partial<FrameworkConfig>,
): Promise<void> {
  return getFramework().initialize(config)
}

export async function destroyFramework(): Promise<void> {
  return getFramework().destroy()
}

export function getConfigManager(): IConfigManager {
  return getFramework().getConfigManager()
}

export function getPluginManager(): IPluginManager {
  return getFramework().getPluginManager()
}

export function getEventSystem(): IEventSystem {
  return getFramework().getEventSystem()
}
