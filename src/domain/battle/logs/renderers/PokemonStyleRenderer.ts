/**
 * 文件: PokemonStyleRenderer.ts
 * 功能: 全文本叙事风格 — 玩家日志渲染器（默认）
 * 描述: 纯中文自然语言叙述，不依赖任何图标/Emoji。
 *       教科书般的流程化叙事，强调"谁对谁做了什么"。
 *       友方名称绿色、敌方名称红色、伤害红色、治疗绿色，
 *       Buff/状态使用中文【】标记。
 * 版本: 1.0.0
 *
 * 设计原则: Typography-First — 排版优先，纯文本信息架构。
 * 所有状态变化、属性修正及战斗反馈完全通过格式化文本来表达
 *（颜色、字重、字号变化），而非依赖图形符号。
 */

import type { BattleLogEntry, LogSegment, ParticipantMap } from '@/shared/types/battle-log'
import type { BattleAction } from '@/domain/battle/type/types'
import type { PlayerLogRenderer } from '@/shared/types/log-renderer'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'

/**
 * 全文本叙事风格渲染器（默认）
 *
 * 不输出任何 Emoji 或图标符号，仅依赖：
 * - 角色名着色（友方绿/敌方红）
 * - 数值着色（伤害红/治疗绿/暴击黄）
 * - 中文动词精准表达（攻击/治疗/施放/触发）
 * - 中文【】标记技能和 Buff 名称
 */
export const PokemonStyleRenderer: PlayerLogRenderer = {
  id: 'pokemon',
  name: '纯文本叙事',
  description: '全中文自然语言叙述，排版优先，无图标',

  render(
    entry: BattleLogEntry,
    _action: BattleAction | undefined,
    _participants: ParticipantMap,
  ): LogSegment[] {
    const segments = entry.segments ?? []

    if (segments.length === 0) {
      return [{ text: entry.message ?? '' }]
    }

    // 纯文本透传：segments 已由 battleActionToLogEntry 生成完整的中文描述，
    // 包含角色名着色和数值着色。渲染器仅需原样输出。
    return segments.map((seg) => ({
      text: seg.text,
      classStr: seg.classStr,
    }))
  },
}
