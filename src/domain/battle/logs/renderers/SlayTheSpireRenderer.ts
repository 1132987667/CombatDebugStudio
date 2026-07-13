/**
 * 文件: SlayTheSpireRenderer.ts
 * 功能: 极简数据风格 — 玩家日志渲染器
 * 描述: 中文纯文本紧凑格式，单行一条事件，数据密集，适合快速浏览。
 *       参考版本B《杀戮尖塔》极简风格，但以中文文本取代 Emoji：
 *       T1  剑士 → 史莱姆: 104
 *       T2  牧师 → 剑士: 180 【治疗】
 * 版本: 1.0.0
 *
 * 设计原则: 纯文本信息架构 — 无图标，全中文排版。
 */

import type { BattleLogEntry, LogSegment, ParticipantMap } from '@/shared/types/battle-log'
import type { BattleAction } from '@/domain/battle/type/types'
import type { PlayerLogRenderer } from '@/shared/types/log-renderer'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'

/**
 * 极简风格渲染器
 *
 * ponytail: 通过解析 BattleLogEntry 的 category 和 message 推断数据，
 * 不依赖 BattleAction 的完整字段。如果渲染器被频繁调用且需要精确数据，
 * 升级路径：调用方在 context 中传入 { damage, heal, isCrit, skillName }。
 */
export const SlayTheSpireRenderer: PlayerLogRenderer = {
  id: 'slay-the-spire',
  name: '极简数据',
  description: '紧凑中文数据行，无图标，信息密度高',

  render(
    entry: BattleLogEntry,
    _action: BattleAction | undefined,
    _participants: ParticipantMap,
  ): LogSegment[] {
    const cat = entry.category
    const source = entry.source ?? ''
    const target = entry.target ?? ''
    const message = entry.message ?? ''

    // 从已有的 segments 中提取数值文本
    const damageText = extractNumber(entry, 'damage')

    switch (cat) {
      case BATTLE_LOG_CATEGORIES.DAMAGE: {
        // 纯文本: "剑士 → 史莱姆: 104"
        const text = target
          ? `${source} → ${target}: ${damageText}`
          : `${source}: ${damageText}`
        return [{ text, classStr: 'log-damage' }]
      }

      case BATTLE_LOG_CATEGORIES.HEAL: {
        // 纯文本: "牧师 → 剑士: 180 【治疗】"
        const healText = extractNumber(entry, 'heal') || '?'
        return [{
          text: target
            ? `${source} → ${target}: ${healText} 【治疗】`
            : `${source}: ${healText} 【治疗】`,
          classStr: 'log-heal',
        }]
      }

      case BATTLE_LOG_CATEGORIES.CRIT: {
        // 纯文本: "剑士 → 史莱姆: 110 【暴击】"
        return [{
          text: target
            ? `${source} → ${target}: ${damageText} 【暴击】`
            : `${source}: ${damageText} 【暴击】`,
          classStr: 'log-crit',
        }]
      }

      case BATTLE_LOG_CATEGORIES.STATUS: {
        // 纯文本: "剑士 获得 复仇怒火" 或 "剑士 受到 中毒"
        const isDebuff = message.includes('减益') || message.includes('中毒')
        const prefix = isDebuff ? '受到' : '获得'
        return [{
          text: `${source} ${prefix} ${message}`,
        }]
      }

      case BATTLE_LOG_CATEGORIES.ACTION: {
        return [{
          text: target ? `${source} → ${target}: ${message}` : `${source}: ${message}`,
        }]
      }

      case BATTLE_LOG_CATEGORIES.SYSTEM: {
        return [{ text: message }]
      }

      default:
        return entry.segments && entry.segments.length > 0
          ? entry.segments
          : [{ text: message }]
    }
  },
}

/**
 * 从日志条目的 segments 或 message 中提取数字
 * ponytail: 简单的正则提取，不保证 100% 准确。
 * 升级路径：调用方在 BattleLogEntry.context 中传入精确数值。
 */
function extractNumber(entry: BattleLogEntry, _label: string): string {
  // 先从 segments 中找带 classStr 的数值片段
  if (entry.segments) {
    for (const seg of entry.segments) {
      if (seg.classStr === 'log-damage' || seg.classStr === 'log-heal' || seg.classStr === 'log-crit') {
        const num = parseInt(seg.text, 10)
        if (!isNaN(num)) return num.toString()
      }
    }
  }
  // 回退：从 message 中提取第一个数字
  const match = entry.message?.match(/\d+/)
  return match ? match[0] : '?'
}
