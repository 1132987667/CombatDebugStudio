/**
 * 文件: BuffAutoRegistry.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 自动Buff脚本注册器
 * 描述: 负责自动扫描和注册所有Buff脚本，支持批量注册和错误处理
 * 版本: 1.0.0
 */

import { BuffScriptRegistry } from './BuffScriptRegistry'
import { battleLogManager } from '@/utils/logging'
import { buffScripts, type BuffScriptType } from '@/scripts'

/**
 * 自动buff脚本注册器
 * 负责自动扫描和注册所有buff脚本
 */
export class BuffAutoRegistry {
  private logger = battleLogManager
  private registry = BuffScriptRegistry.getInstance()
  private registeredScripts = new Set<string>()

  /**
   * 自动注册所有buff脚本
   */
  public async autoRegisterAllScripts(): Promise<void> {
    this.logger.info('开始自动注册buff脚本...')

    const scriptTypes = Object.keys(buffScripts) as BuffScriptType[]
    let successCount = 0
    let errorCount = 0

    for (const scriptType of scriptTypes) {
      try {
        await this.registerScript(scriptType)
        successCount++
      } catch (error) {
        this.logger.error(`注册脚本失败: ${scriptType}`, error)
        errorCount++
      }
    }

    this.logger.info(
      `buff脚本自动注册完成: 成功 ${successCount} 个, 失败 ${errorCount} 个`,
    )
  }

  /**
   * 注册单个buff脚本
   */
  public async registerScript(scriptType: BuffScriptType): Promise<void> {
    if (this.registeredScripts.has(scriptType)) {
      this.logger.debug(`脚本已注册: ${scriptType}`)
      return
    }

    try {
      const scriptModule = await buffScripts[scriptType]()
      const scriptClass = Object.values(scriptModule)[0] as any

      if (!scriptClass || typeof scriptClass !== 'function') {
        throw new Error(`无效的脚本类: ${scriptType}`)
      }

      // 获取BUFF_ID常量
      const buffId = scriptClass.BUFF_ID || scriptType

      // 注册脚本
      this.registry.register(buffId, () => new scriptClass(), {
        filePath: `scripts/${scriptType}`,
        scriptType,
      })

      this.registeredScripts.add(scriptType)
      this.logger.debug(`成功注册buff脚本: ${buffId}`)
    } catch (error) {
      throw new Error(`注册脚本失败: ${scriptType} - ${error}`)
    }
  }

  /**
   * 批量注册buff脚本
   */
  public async registerScripts(scriptTypes: BuffScriptType[]): Promise<void> {
    this.logger.info(`批量注册buff脚本: ${scriptTypes.join(', ')}`)

    for (const scriptType of scriptTypes) {
      try {
        await this.registerScript(scriptType)
      } catch (error) {
        this.logger.error(`批量注册失败: ${scriptType}`, error)
      }
    }
  }

  /**
   * 检查脚本是否已注册
   */
  public isScriptRegistered(scriptType: BuffScriptType): boolean {
    return this.registeredScripts.has(scriptType)
  }

  /**
   * 获取已注册的脚本列表
   */
  public getRegisteredScripts(): string[] {
    return Array.from(this.registeredScripts)
  }

  /**
   * 清空注册记录
   */
  public clearRegistry(): void {
    this.registeredScripts.clear()
    this.logger.info('已清空buff脚本注册记录')
  }

  /**
   * 重新注册所有脚本
   */
  public async reRegisterAllScripts(): Promise<void> {
    this.clearRegistry()
    await this.autoRegisterAllScripts()
  }

  /**
   * 动态注册新脚本
   */
  public async registerDynamicScript(
    buffId: string,
    scriptFactory: () => any,
    metadata?: { filePath?: string; scriptType?: string },
  ): Promise<void> {
    if (this.registeredScripts.has(buffId)) {
      this.logger.warn(`脚本已存在: ${buffId}`)
      return
    }

    try {
      this.registry.register(buffId, scriptFactory, metadata)
      this.registeredScripts.add(buffId)
      this.logger.debug(`动态注册成功: ${buffId}`)
    } catch (error) {
      throw new Error(`动态注册失败: ${buffId} - ${error}`)
    }
  }

  /**
   * 扫描并注册缺失的脚本
   */
  public async scanAndRegisterMissingScripts(): Promise<string[]> {
    const scriptTypes = Object.keys(buffScripts) as BuffScriptType[]
    const missingScripts: string[] = []

    for (const scriptType of scriptTypes) {
      if (!this.isScriptRegistered(scriptType)) {
        missingScripts.push(scriptType)
      }
    }

    if (missingScripts.length > 0) {
      this.logger.info(
        `发现 ${missingScripts.length} 个未注册脚本: ${missingScripts.join(', ')}`,
      )
      await this.registerScripts(missingScripts)
    } else {
      this.logger.debug('所有脚本均已注册')
    }

    return missingScripts
  }

  /**
   * 获取脚本注册统计信息
   */
  public getRegistryStats(): {
    totalScripts: number
    registeredScripts: number
    missingScripts: number
    registeredList: string[]
    missingList: string[]
  } {
    const scriptTypes = Object.keys(buffScripts) as BuffScriptType[]
    const registeredList = this.getRegisteredScripts()
    const missingList = scriptTypes.filter(
      (type) => !this.isScriptRegistered(type),
    )

    return {
      totalScripts: scriptTypes.length,
      registeredScripts: registeredList.length,
      missingScripts: missingList.length,
      registeredList,
      missingList,
    }
  }
}

/**
 * 全局自动注册器实例
 */
export const buffAutoRegistry = new BuffAutoRegistry()

/**
 * 初始化自动注册器
 */
export async function initializeBuffAutoRegistry(): Promise<void> {
  try {
    await buffAutoRegistry.autoRegisterAllScripts()
    battleLogManager.info('buff脚本自动注册器初始化完成')
  } catch (error) {
    battleLogManager.error('buff脚本自动注册器初始化失败', error)
    throw error
  }
}
