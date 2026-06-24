import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { container } from '@/infrastructure/di/Container'

export class BuffScriptLoader {
  private loadedScripts = new Set<string>()
  private registry: BuffScriptRegistry

  constructor(registry?: BuffScriptRegistry) {
    this.registry = registry || container.resolve('BuffScriptRegistry')
  }

  public async loadScripts(): Promise<void> {
    try {
      const modules = (import.meta as any).glob('@/domain/buff/scripts/**/*.ts', { eager: false })
      for (const [path, moduleLoader] of Object.entries(modules)) {
        try {
          const module: any = await (moduleLoader as any)()
          for (const [exportName, exportValue] of Object.entries(module)) {
            if (typeof exportValue === 'function' && (exportValue as any).BUFF_ID) {
              const BuffClass = exportValue as any
              const buffId = BuffClass.BUFF_ID
              this.registry.register(buffId, () => new BuffClass(), { filePath: path })
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
