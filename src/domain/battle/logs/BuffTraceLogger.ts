/**
 * 文件: BuffTraceLogger.ts
 * 功能: 技术调试日志 — Buff 变更追踪
 * 描述: 在 Buff 施加/移除/属性变更时输出 TRACE 级别日志，
 *       帮助排查 Buff 生命周期和属性修饰符相关问题。
 *       对应设计文档第 4.7 节。
 * 版本: 1.0.0
 */

import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

/**
 * Buff 变更追踪器
 * 纯静态方法，在 BuffSystem 的关键路径上调用。
 * ponytail: 不做完整的树状展开，只输出单行 TRACE 摘要。
 * 升级路径：如需参考 TraceDamageLogger 的树状结构，复制它的缩进输出模式即可。
 */
export class BuffTraceLogger {
  private static counter = 0

  /**
   * Buff 施加时调用
   * @param characterId 目标角色ID
   * @param buffName Buff 名称
   * @param instanceId 实例ID
   * @param stacks 层数
   * @param duration 持续回合数（-1 = 永久）
   */
  static onApply(
    characterId: string,
    buffName: string,
    instanceId: string,
    stacks: number,
    duration: number,
  ): void {
    const id = ++this.counter
    battleLogManager.addDebugLog(
      `[${id}] BUFF_APPLY ${buffName}→${characterId} |` +
      ` instance=${instanceId} stack=${stacks} duration=${duration}`,
      {
        level: LogLevel.TRACE,
      }
    )
  }

  /**
   * Buff 移除时调用
   */
  static onRemove(
    characterId: string,
    buffName: string,
    instanceId: string,
  ): void {
    const id = ++this.counter
    battleLogManager.addDebugLog(
      `[${id}] BUFF_REMOVE ${buffName}→${characterId} | instance=${instanceId}`,
      {
        level: LogLevel.TRACE,
      }
    )
  }

  /**
   * Buff 层数更新/刷新时调用
   */
  static onUpdate(
    characterId: string,
    buffName: string,
    instanceId: string,
    oldStacks: number,
    newStacks: number,
    remainingTurns: number,
  ): void {
    const id = ++this.counter
    battleLogManager.addDebugLog(
      `[${id}] BUFF_UPDATE ${buffName}→${characterId} |` +
      ` instance=${instanceId} stack=${oldStacks}→${newStacks} remain=${remainingTurns}`,
      {
        level: LogLevel.TRACE,
      }
    )
  }

  /**
   * 属性修饰符变更时调用
   * @param characterId 目标角色ID
   * @param buffName Buff 名称（来源）
   * @param attribute 属性名
   * @param valueStr 修饰符值字符串（如 '+5%'）
   * @param currentTotal 当前属性累计值
   */
  static onModifier(
    characterId: string,
    buffName: string,
    attribute: string,
    valueStr: string,
    currentTotal: number,
  ): void {
    const id = ++this.counter
    battleLogManager.addDebugLog(
      `[${id}] BUFF_MOD ${buffName}→${characterId} |` +
      ` attr=${attribute} mod=${valueStr} total=${currentTotal}`,
      {
        level: LogLevel.TRACE,
      }
    )
  }
}
