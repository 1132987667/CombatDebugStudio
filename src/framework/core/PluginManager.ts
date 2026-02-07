/**
 * 通用战斗框架 - 插件管理器
 *
 * 功能：
 * 1. 统一的插件注册和管理机制
 * 2. 插件生命周期管理（加载/初始化/销毁）
 * 3. 插件依赖关系解析
 * 4. 插件配置管理
 * 5. 插件隔离和错误边界
 */

import type {
  IPluginManager,
  Plugin,
  IEventSystem,
  IConfigManager,
} from './interfaces'
import { FrameworkLogger } from '@/utils/logging'

/**
 * 插件包装器
 */
interface PluginWrapper {
  plugin: Plugin
  isInitialized: boolean
  dependencies: string[]
  config: any
  error?: Error
}

/**
 * 插件管理器实现
 */
export class PluginManager implements IPluginManager {
  private plugins: Map<string, PluginWrapper> = new Map()
  private eventSystem: IEventSystem
  private configManager: IConfigManager
  private logger: Logger
  private isInitialized = false

  constructor(eventSystem: IEventSystem, configManager: IConfigManager) {
    this.eventSystem = eventSystem
    this.configManager = configManager
    this.logger = new Logger()
  }

  /**
   * 注册插件
   */
  public registerPlugin(plugin: Plugin, config?: any): void {
    if (this.plugins.has(plugin.id)) {
      this.logger.warn(`Plugin already registered: ${plugin.id}`)
      return
    }

    const wrapper: PluginWrapper = {
      plugin,
      isInitialized: false,
      dependencies: [],
      config: config || {},
    }

    this.plugins.set(plugin.id, wrapper)

    this.logger.info('Plugin registered', {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
    })

    // 触发插件注册事件
    this.eventSystem.emit('plugin:registered', {
      pluginId: plugin.id,
      pluginName: plugin.name,
      timestamp: Date.now(),
    })
  }

  /**
   * 卸载插件
   */
  public async unregisterPlugin(pluginId: string): Promise<void> {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      this.logger.warn(`Plugin not found: ${pluginId}`)
      return
    }

    // 如果插件已初始化，先销毁
    if (wrapper.isInitialized) {
      await this.destroyPlugin(pluginId)
    }

    this.plugins.delete(pluginId)

    this.logger.info('Plugin unregistered', { pluginId })

    // 触发插件卸载事件
    this.eventSystem.emit('plugin:unregistered', {
      pluginId,
      timestamp: Date.now(),
    })
  }

  /**
   * 获取插件
   */
  public getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.plugin
  }

  /**
   * 获取所有插件
   */
  public getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).map((wrapper) => wrapper.plugin)
  }

  /**
   * 初始化所有插件
   */
  public async initializePlugins(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('PluginManager already initialized')
      return
    }

    try {
      this.logger.info('Starting plugin initialization...')

      // 解析插件依赖关系
      const pluginOrder = this.resolveDependencies()

      // 按依赖顺序初始化插件
      for (const pluginId of pluginOrder) {
        await this.initializePlugin(pluginId)
      }

      this.isInitialized = true
      this.logger.info('All plugins initialized successfully')

      // 触发插件初始化完成事件
      this.eventSystem.emit('plugins:initialized', {
        pluginCount: this.plugins.size,
        timestamp: Date.now(),
      })
    } catch (error) {
      this.logger.error('Plugin initialization failed', { error })
      throw error
    }
  }

  /**
   * 销毁所有插件
   */
  public async destroyAllPlugins(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    try {
      this.logger.info('Destroying all plugins...')

      // 按依赖逆序销毁插件
      const pluginOrder = this.resolveDependencies()

      for (const pluginId of pluginOrder.reverse()) {
        await this.destroyPlugin(pluginId)
      }

      this.isInitialized = false
      this.logger.info('All plugins destroyed successfully')
    } catch (error) {
      this.logger.error('Plugin destruction failed', { error })
    }
  }

  /**
   * 获取插件状态
   */
  public getPluginStatus(pluginId: string): PluginStatus | undefined {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      return undefined
    }

    return {
      pluginId,
      pluginName: wrapper.plugin.name,
      isInitialized: wrapper.isInitialized,
      hasError: !!wrapper.error,
      error: wrapper.error,
      config: wrapper.config,
    }
  }

  /**
   * 获取所有插件状态
   */
  public getAllPluginStatuses(): PluginStatus[] {
    const statuses: PluginStatus[] = []

    for (const [pluginId, wrapper] of this.plugins.entries()) {
      statuses.push({
        pluginId,
        pluginName: wrapper.plugin.name,
        isInitialized: wrapper.isInitialized,
        hasError: !!wrapper.error,
        error: wrapper.error,
        config: wrapper.config,
      })
    }

    return statuses
  }

  /**
   * 更新插件配置
   */
  public async updatePluginConfig(
    pluginId: string,
    config: any,
  ): Promise<void> {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    const oldConfig = { ...wrapper.config }
    wrapper.config = { ...oldConfig, ...config }

    // 如果插件已初始化，重新初始化以应用新配置
    if (wrapper.isInitialized) {
      await this.destroyPlugin(pluginId)
      await this.initializePlugin(pluginId)
    }

    this.logger.info('Plugin configuration updated', { pluginId, config })

    // 触发配置更新事件
    this.eventSystem.emit('plugin:configUpdated', {
      pluginId,
      oldConfig,
      newConfig: wrapper.config,
      timestamp: Date.now(),
    })
  }

  /**
   * 检查插件依赖是否满足
   */
  public checkDependencies(pluginId: string): DependencyCheckResult {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      return { satisfied: false, missing: [pluginId] }
    }

    const missing: string[] = []

    for (const dep of wrapper.dependencies) {
      if (!this.plugins.has(dep)) {
        missing.push(dep)
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    }
  }

  /**
   * 重新加载插件
   */
  public async reloadPlugin(pluginId: string): Promise<void> {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    this.logger.info('Reloading plugin', { pluginId })

    // 销毁并重新初始化
    if (wrapper.isInitialized) {
      await this.destroyPlugin(pluginId)
    }

    await this.initializePlugin(pluginId)

    this.logger.info('Plugin reloaded successfully', { pluginId })
  }

  /**
   * 初始化单个插件
   */
  private async initializePlugin(pluginId: string): Promise<void> {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    if (wrapper.isInitialized) {
      this.logger.warn(`Plugin already initialized: ${pluginId}`)
      return
    }

    // 检查依赖关系
    const depCheck = this.checkDependencies(pluginId)
    if (!depCheck.satisfied) {
      throw new Error(
        `Plugin dependencies not satisfied: ${pluginId}, missing: ${depCheck.missing.join(', ')}`,
      )
    }

    try {
      this.logger.debug('Initializing plugin', { pluginId })

      // 初始化插件
      await wrapper.plugin.initialize(wrapper.config)
      wrapper.isInitialized = true
      wrapper.error = undefined

      this.logger.info('Plugin initialized successfully', { pluginId })

      // 触发插件初始化事件
      this.eventSystem.emit('plugin:initialized', {
        pluginId,
        pluginName: wrapper.plugin.name,
        timestamp: Date.now(),
      })
    } catch (error) {
      wrapper.error = error as Error
      this.logger.error('Plugin initialization failed', {
        pluginId,
        error: error.message,
      })

      // 触发插件初始化失败事件
      this.eventSystem.emit('plugin:initializationFailed', {
        pluginId,
        error: error.message,
        timestamp: Date.now(),
      })

      throw error
    }
  }

  /**
   * 销毁单个插件
   */
  private async destroyPlugin(pluginId: string): Promise<void> {
    const wrapper = this.plugins.get(pluginId)
    if (!wrapper) {
      return
    }

    if (!wrapper.isInitialized) {
      return
    }

    try {
      this.logger.debug('Destroying plugin', { pluginId })

      // 销毁插件
      await wrapper.plugin.destroy()
      wrapper.isInitialized = false

      this.logger.info('Plugin destroyed successfully', { pluginId })

      // 触发插件销毁事件
      this.eventSystem.emit('plugin:destroyed', {
        pluginId,
        timestamp: Date.now(),
      })
    } catch (error) {
      this.logger.error('Plugin destruction failed', {
        pluginId,
        error: error.message,
      })

      // 触发插件销毁失败事件
      this.eventSystem.emit('plugin:destructionFailed', {
        pluginId,
        error: error.message,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * 解析插件依赖关系
   */
  private resolveDependencies(): string[] {
    const visited = new Set<string>()
    const order: string[] = []

    const visit = (pluginId: string) => {
      if (visited.has(pluginId)) {
        return
      }

      visited.add(pluginId)

      const wrapper = this.plugins.get(pluginId)
      if (wrapper) {
        // 先访问依赖
        for (const dep of wrapper.dependencies) {
          visit(dep)
        }

        // 再访问当前插件
        order.push(pluginId)
      }
    }

    // 对所有插件进行拓扑排序
    for (const pluginId of this.plugins.keys()) {
      visit(pluginId)
    }

    return order
  }
}

/**
 * 插件状态接口
 */
export interface PluginStatus {
  pluginId: string
  pluginName: string
  isInitialized: boolean
  hasError: boolean
  error?: Error
  config: any
}

/**
 * 依赖检查结果
 */
export interface DependencyCheckResult {
  satisfied: boolean
  missing: string[]
}

/**
 * 基础插件类（供插件开发者继承）
 */
export abstract class BasePlugin implements Plugin {
  public abstract readonly id: string
  public abstract readonly name: string
  public abstract readonly version: string
  public abstract readonly description: string

  protected config: any = {}
  protected logger: Logger

  constructor() {
    this.logger = new Logger()
  }

  /**
   * 初始化插件
   */
  public async initialize(config: any): Promise<void> {
    this.config = config
    this.logger.info(`Plugin ${this.name} initialized`)
    await this.onInitialize()
  }

  /**
   * 销毁插件
   */
  public async destroy(): Promise<void> {
    await this.onDestroy()
    this.logger.info(`Plugin ${this.name} destroyed`)
  }

  /**
   * 获取插件配置
   */
  public getConfig(): any {
    return this.config
  }

  /**
   * 插件初始化钩子（子类实现）
   */
  protected abstract onInitialize(): Promise<void>

  /**
   * 插件销毁钩子（子类实现）
   */
  protected abstract onDestroy(): Promise<void>
}

/**
 * 预定义插件类型
 */
export const PluginTypes = {
  // AI插件
  AI: 'ai',

  // 技能系统插件
  SKILL_SYSTEM: 'skill-system',

  // 状态效果插件
  STATUS_EFFECT: 'status-effect',

  // 战斗规则插件
  BATTLE_RULES: 'battle-rules',

  // UI集成插件
  UI_INTEGRATION: 'ui-integration',

  // 数据持久化插件
  PERSISTENCE: 'persistence',

  // 网络同步插件
  NETWORK_SYNC: 'network-sync',

  // 调试工具插件
  DEBUG_TOOLS: 'debug-tools',
} as const
