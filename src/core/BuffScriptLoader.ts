import { BuffScriptRegistry } from './BuffScriptRegistry'

export class BuffScriptLoader {
  private static instance: BuffScriptLoader
  private loadedScripts = new Set<string>()

  private constructor() {}

  public static getInstance(): BuffScriptLoader {
    if (!BuffScriptLoader.instance) {
      BuffScriptLoader.instance = new BuffScriptLoader()
    }
    return BuffScriptLoader.instance
  }

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

  public async reloadScripts(): Promise<void> {
    // 清空已加载的脚本
    this.loadedScripts.clear()
    // 使用批量卸载而不是清空整个注册表
    const registry = BuffScriptRegistry.getInstance()
    const scriptIds = registry.list()
    scriptIds.forEach(id => registry.unregister(id))
    await this.loadScripts()
  }

  public getLoadedScriptCount(): number {
    return this.loadedScripts.size
  }

  public clear(): void {
    this.loadedScripts.clear()
    // 使用批量卸载而不是清空整个注册表
    const registry = BuffScriptRegistry.getInstance()
    const scriptIds = registry.list()
    scriptIds.forEach(id => registry.unregister(id))
  }
}