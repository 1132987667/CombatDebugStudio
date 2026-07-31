import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { container } from '@/infrastructure/di/Container'
import type { ScriptBuffConfig, IBuffScript } from '@/domain/buff/types'
import { buffScripts } from '@/domain/buff/scripts/index'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

/** Buff 脚本构造器接口（静态 BUFF_ID 是类的显式身份声明，CONFIG 提供自包含配置） */
interface BuffScriptConstructor {
  new (...args: any[]): IBuffScript
  BUFF_ID: string
  CONFIG?: ScriptBuffConfig
}

/**
 * Buff 脚本加载器
 *
 * 只负责两件事：按 scripts/index.ts 的显式映射 import 模块、调用 registry.register。
 * 不做目录扫描（import.meta.glob）、不做鸭子类型探测、不依赖路径命名约定。
 * 模块内按 BUFF_ID 精确匹配类——BUFF_ID 是脚本类自己声明的身份，非结构推断。
 */
export class BuffScriptLoader {
  private loadedScripts = new Set<string>()
  private registry: BuffScriptRegistry

  constructor(registry?: BuffScriptRegistry) {
    this.registry = registry || container.resolve('BuffScriptRegistry')
  }

  public async loadScripts(): Promise<void> {
    for (const [buffId, moduleLoader] of Object.entries(buffScripts)) {
      try {
        const module = await moduleLoader()
        const BuffClass = Object.values(module).find(
          (v): v is BuffScriptConstructor =>
            typeof v === 'function' &&
            (v as BuffScriptConstructor).BUFF_ID === buffId,
        )
        if (!BuffClass) {
          LoggerProvider.logger.addDebugLog(
            `Buff script module 中未找到 BUFF_ID 为 "${buffId}" 的类`,
            { level: LogLevel.ERROR },
          )
          continue
        }
        // 脚本类的静态 CONFIG（自包含模式），传给 registry
        const defaultConfig = BuffClass.CONFIG
        this.registry.register(
          buffId,
          () => new BuffClass(),
          { filePath: `scripts/${buffId}` },
          defaultConfig,
        )
        this.loadedScripts.add(buffId)
      } catch (moduleError) {
        LoggerProvider.logger.addDebugLog(`Failed to load buff script ${buffId}:`, {
          level: LogLevel.ERROR,
          error: moduleError as Error,
        })
      }
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
