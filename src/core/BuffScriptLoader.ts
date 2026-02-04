import { BuffScriptRegistry } from './BuffScriptRegistry'

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
   * 手动导入已知的脚本并注册到脚本注册表
   */
  public async loadScripts(): Promise<void> {
    try {
      // 手动导入已知的脚本
      // 注意：在实际项目中，这里可以使用 Vite 的 glob 导入
      // 但为了类型安全，我们暂时使用手动导入
      const { MountainGodBuff } = await import('@/scripts/combat/MountainGodBuff')
      const { PoisonDebuff } = await import('@/scripts/combat/PoisonDebuff')
      const { BerserkBuff } = await import('@/scripts/combat/BerserkBuff')
      const { HealOverTime } = await import('@/scripts/support/HealOverTime')
      const { ShieldBuff } = await import('@/scripts/support/ShieldBuff')

      // 注册脚本
      const registry = BuffScriptRegistry.getInstance()
      
      if (MountainGodBuff.BUFF_ID) {
        registry.register(MountainGodBuff.BUFF_ID, () => new MountainGodBuff(), { 
          filePath: '@/scripts/combat/MountainGodBuff'
        })
        this.loadedScripts.add('MountainGodBuff')
      }
      
      if (PoisonDebuff.BUFF_ID) {
        registry.register(PoisonDebuff.BUFF_ID, () => new PoisonDebuff(), { 
          filePath: '@/scripts/combat/PoisonDebuff'
        })
        this.loadedScripts.add('PoisonDebuff')
      }
      
      if (BerserkBuff.BUFF_ID) {
        registry.register(BerserkBuff.BUFF_ID, () => new BerserkBuff(), { 
          filePath: '@/scripts/combat/BerserkBuff'
        })
        this.loadedScripts.add('BerserkBuff')
      }
      
      if (HealOverTime.BUFF_ID) {
        registry.register(HealOverTime.BUFF_ID, () => new HealOverTime(), { 
          filePath: '@/scripts/support/HealOverTime'
        })
        this.loadedScripts.add('HealOverTime')
      }
      
      if (ShieldBuff.BUFF_ID) {
        registry.register(ShieldBuff.BUFF_ID, () => new ShieldBuff(), { 
          filePath: '@/scripts/support/ShieldBuff'
        })
        this.loadedScripts.add('ShieldBuff')
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
    scriptIds.forEach(id => registry.unregister(id))
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
    scriptIds.forEach(id => registry.unregister(id))
  }
}