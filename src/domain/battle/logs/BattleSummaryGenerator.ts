/**
 * 文件: BattleSummaryGenerator.ts
 * 功能: 最新战报持有者（薄封装）
 * 描述: 战报统计已统一到 unified-summary.ts（summarizeBattle，从事件流派生），
 *       本类仅保存"最新一场战斗的战报"，供叙事渲染器（RoundNarrativeRenderer）在
 *       TXT/HTML 导出末尾追加"战报摘要"块。
 *       写入方：battleStore.buildBattleSummary（实时）、BattleDataGenerator（批量生成）。
 * 版本: 2.0.0
 */

import type { BattleSummary } from '@/domain/battle/replay/unified/unified-summary'

/**
 * 最新战报持有者
 * 单例模式，全系统共享同一个实例。仅存最新一场，覆盖式更新。
 */
export class BattleSummaryGenerator {
  private static _instance: BattleSummaryGenerator | null = null

  /** 最新生成的战报 */
  private _lastSummary: BattleSummary | null = null

  static get instance(): BattleSummaryGenerator {
    if (!this._instance) {
      this._instance = new BattleSummaryGenerator()
    }
    return this._instance
  }

  /** 获取最新战报 */
  get lastSummary(): BattleSummary | null {
    return this._lastSummary
  }

  /** 设置最新战报（实时/批量生成完成时写入，供叙事渲染器取摘要块） */
  setSummary(summary: BattleSummary): void {
    this._lastSummary = summary
  }

  /** 手动清空 */
  reset(): void {
    this._lastSummary = null
  }
}
