/**
 * 文件: log-renderer.ts
 * 功能: 玩家日志渲染器接口
 * 描述: 定义 PlayerLogRenderer 接口，供不同的日志模板风格实现。
 *
 * 设计原则: Typography-First（排版优先）。
 * 全部依赖于纯中文文本排版和 CSS 着色，不依赖任何符号/图标。
 * 版本: 1.0.0
 */

import type { BattleAction } from '@/domain/battle/type/types'
import type { BattleLogEntry, LogSegment, ParticipantMap } from './battle-log'

/**
 * 玩家日志渲染器接口
 * 每种展示风格（叙事、极简等）实现此接口，
 * 将 BattleLogEntry 渲染为着色后的 LogSegment[]。
 */
export interface PlayerLogRenderer {
  /** 渲染器唯一标识，如 'pokemon', 'slay-the-spire' */
  id: string
  /** 渲染器显示名称，如 '纯文本叙事', '极简数据' */
  name: string
  /** 描述文案，用于 UI 下拉提示 */
  description: string
  /**
   * 将 BattleLogEntry 渲染为 LogSegment[]
   * @param entry 战斗日志条目
   * @param action 原始战斗动作（可选，极简风格需要数值信息）
   * @param participants 参与者映射表（用于查询敌我阵营、名称等）
   */
  render(
    entry: BattleLogEntry,
    action: BattleAction | undefined,
    participants: ParticipantMap,
  ): LogSegment[]
}
