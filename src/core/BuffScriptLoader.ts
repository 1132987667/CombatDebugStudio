/**
 * 文件: BuffScriptLoader.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: Buff脚本加载器
 * 描述: 负责加载和注册Buff脚本，使用单例模式确保系统全局唯一，支持脚本的动态加载、重载和清理
 * 版本: 1.0.0
 */

import { BuffScriptRegistry } from '@/core/BuffScriptRegistry'

/**
 * Buff脚本加载器类
 * 负责加载和注册Buff脚本
 * 使用单例模式确保系统全局唯一
 * 支持脚本的动态加载、重载和清理
 */
export class BuffScriptLoader {
  /** 单例实例 */
  private static instance: BuffScriptLoader
  /** 已加载的脚本名称集合 */
  private loadedScripts = new Set<string>()

  /**
   * 私有构造函数
   * 防止外部直接实例化，确保单例模式
   */
  private constructor() {}

  /**
   * 获取单例实例
   * @returns Buff脚本加载器实例
   */
  public static getInstance(): BuffScriptLoader {
    if (!BuffScriptLoader.instance) {
      BuffScriptLoader.instance = new BuffScriptLoader()
    }
    return BuffScriptLoader.instance
  }

  /**
   * 加载Buff脚本
   * 使用Vite的glob导入自动扫描scripts/目录下的所有Buff脚本并注册
   */
  public async loadScripts(): Promise<void> {
    try {
      // 使用Vite的glob导入自动扫描scripts/目录下的所有脚本
      const modules = import.meta.glob('@/scripts/**/*.ts', { eager: false })
      
      // 注册脚本
      const registry = BuffScriptRegistry.getInstance()
      
      // 遍历所有找到的模块
      for (const [path, moduleLoader] of Object.entries(modules)) {
        try {
          // 动态加载模块
          const module = await moduleLoader()
          
          // 遍历模块导出的所有成员
          for (const [exportName, exportValue] of Object.entries(module)) {
            // 检查是否是Buff脚本类（有BUFF_ID静态属性）
            if (typeof exportValue === 'function' && exportValue.BUFF_ID) {
              const BuffClass = exportValue
              const buffId = BuffClass.BUFF_ID
              
              // 注册脚本
              registry.register(
                buffId,
                () => new BuffClass(),
                {
                  filePath: path,
                },
              )
              
              this.loadedScripts.add(exportName)
              console.log(`Loaded and registered buff script: ${exportName} (${buffId})`)
            }
          }
        } catch (moduleError) {
          console.error(`Failed to load module ${path}:`, moduleError)
        }
      }
    } catch (error) {
      console.error('Failed to load buff scripts:', error)
    }
  }

  /**
   * 重载Buff脚本
   * 清空已加载的脚本并重新加载
   */
  public async reloadScripts(): Promise<void> {
    // 清空已加载的脚本
    this.loadedScripts.clear()
    // 使用批量卸载而不是清空整个注册表
    const registry = BuffScriptRegistry.getInstance()
    const scriptIds = registry.list()
    scriptIds.forEach((id) => registry.unregister(id))
    await this.loadScripts()
  }

  /**
   * 获取已加载的脚本数量
   * @returns 已加载的脚本数量
   */
  public getLoadedScriptCount(): number {
    return this.loadedScripts.size
  }

  /**
   * 清空所有已加载的脚本
   */
  public clear(): void {
    this.loadedScripts.clear()
    // 使用批量卸载而不是清空整个注册表
    const registry = BuffScriptRegistry.getInstance()
    const scriptIds = registry.list()
    scriptIds.forEach((id) => registry.unregister(id))
  }
}
