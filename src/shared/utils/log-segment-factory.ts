/**
 * 文件: log-segment-factory.ts
 * 功能: 日志片段工厂 — 统一收口所有实体名的 LogSegment 生成
 * 描述: 三个工厂函数分别用于 buff/技能/被动，同时产出 classStr（着色）和 hover（可悬浮）。
 *       各调用点不再手拼实体名文本，统一走此工厂。
 *
 * 设计原则：
 * - 可测试：所有外部依赖通过接口注入
 * - 向后兼容：不修改现有 LogSegment 结构
 * - 一致性：classStr 和 hover 在同一处决定
 */

import type { LogSegment, LogSegmentHover } from '@/shared/types/battle-log'
import {
  classifyBuff,
  getBuffLogClass,
  type BuffClassificationInput,
} from '@/shared/types/buff-classification'

// ==================== 可注入的查找接口 ====================

/**
 * Buff 配置查找接口（工厂不依赖具体的 BuffScriptRegistry）
 */
export interface BuffConfigLookup {
  getBuffConfig(buffId: string): BuffClassificationInput | undefined
}

/**
 * 技能/被动配置查找接口（工厂不依赖具体的 SkillManager）
 */
export interface SkillConfigLookup {
  getSkillConfig(skillId: string): { name: string; description?: string } | undefined
}

// ==================== 工厂函数 ====================

/**
 * 生成 buff 名称的 LogSegment
 *
 * 根据 buffId 查配置 → 获取名称 → classifyBuff 判定颜色 → 注入 hover
 *
 * @param buffId - Buff 的唯一标识
 * @param lookup - Buff 配置查找器（通常是 BuffScriptRegistry）
 * @returns LogSegment（含 classStr 和 hover）
 *
 * 使用示例：
 * ```
 * const seg = buffSegment('buff_leader_aura', buffScriptRegistry)
 * // → { text: '统领光环', classStr: 'log-buff', hover: { kind: 'buff', id: 'buff_leader_aura' } }
 * ```
 */
export function buffSegment(
  buffId: string,
  lookup: BuffConfigLookup,
): LogSegment {
  const config = lookup.getBuffConfig(buffId)
  const name = config?.name ?? config?.id ?? buffId
  const classification = classifyBuff(config)
  const classStr = getBuffLogClass(classification)
  const hover: LogSegmentHover = { kind: 'buff', id: buffId }

  return { text: `【${name}】`, classStr, hover, kind: 'buff' }
}

/**
 * 生成技能名称的 LogSegment
 *
 * @param skillId - 技能的唯一标识
 * @param lookup - 技能配置查找器（通常是 SkillManager）
 * @returns LogSegment（含 classStr 和 hover）
 */
export function skillSegment(
  skillId: string,
  lookup: SkillConfigLookup,
): LogSegment {
  const config = lookup.getSkillConfig(skillId)
  const name = config?.name ?? skillId
  const hover: LogSegmentHover = { kind: 'skill', id: skillId }

  return { text: `【${name}】`, classStr: 'log-skill', hover, kind: 'skill' }
}

/**
 * 生成被动技能名称的 LogSegment
 *
 * @param skillId - 被动技能的唯一标识
 * @param lookup - 技能配置查找器（通常是 SkillManager）
 * @returns LogSegment（含 classStr 和 hover）
 */
export function passiveSegment(
  skillId: string,
  lookup: SkillConfigLookup,
): LogSegment {
  const config = lookup.getSkillConfig(skillId)
  const name = config?.name ?? skillId
  const hover: LogSegmentHover = { kind: 'passive', id: skillId }

  return { text: `【${name}】`, classStr: 'log-passive', hover, kind: 'passive' }
}
