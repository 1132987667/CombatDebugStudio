import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { container } from '@/infrastructure/di/Container'
import type { ScriptBuffConfig, IBuffScript } from '@/domain/buff/types'

/** Buff 脚本构造器接口，搭配类型守卫使用 */
interface BuffScriptConstructor {
  new(...args: any[]): IBuffScript
  BUFF_ID: string
  CONFIG?: ScriptBuffConfig
}

/** 类型守卫：判断导出值是否为 BuffScriptConstructor */
function isBuffConstructor(value: unknown): value is BuffScriptConstructor {
  return typeof value === 'function' && typeof (value as unknown as Record<string, unknown>).BUFF_ID === 'string'
}

export class BuffScriptLoader {
  private loadedScripts = new Set<string>()
  private registry: BuffScriptRegistry

  constructor(registry?: BuffScriptRegistry) {
    this.registry = registry || container.resolve('BuffScriptRegistry')
  }

  public async loadScripts(): Promise<void> {
    try {
      const modules = import.meta.glob('@/domain/buff/scripts/**/*.ts', { eager: false }) as Record<string, () => Promise<Record<string, unknown>>>
      for (const [path, moduleLoader] of Object.entries(modules)) {
        // ponytail: 跳过 barrel 文件（index.ts），避免每个 buff 被注册两次
        if (path.endsWith('/index.ts')) continue
        try {
          const module = await moduleLoader()
          for (const [exportName, exportValue] of Object.entries(module)) {
            if (isBuffConstructor(exportValue)) {
              const BuffClass = exportValue
              const buffId = BuffClass.BUFF_ID
              // ponytail: 读取脚本类的静态 CONFIG（自包含模式），传给 registry
              const defaultConfig = BuffClass.CONFIG
              this.registry.register(buffId, () => new BuffClass(), { filePath: path }, defaultConfig)
              this.loadedScripts.add(exportName)
              console.log(`Loaded and registered buff script: ${exportName} (${buffId})${defaultConfig ? ' [self-contained]' : ''}`)
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

  public async reloadScripts(): Promise<void> {
    this.loadedScripts.clear()
    const scriptIds = this.registry.list()
    scriptIds.forEach((id) => this.registry.unregister(id))
    await this.loadScripts()
  }

  public getLoadedScriptCount(): number {
    return this.loadedScripts.size
  }

  public clear(): void {
    this.loadedScripts.clear()
    const scriptIds = this.registry.list()
    scriptIds.forEach((id) => this.registry.unregister(id))
  }
}
