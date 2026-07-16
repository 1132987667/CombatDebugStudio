/**
 * 目标解析器 — 根据技能 selector 从参与者列表中选出目标实体
 * 从 BattleExecutor.getSkillTargets() 提取，供主动/被动技能统一使用
 */
import { PARTICIPANT_SIDE, type BattleEntity } from '@/domain/battle/type/types'
import {
  TargetFaction,
  TargetStrategy,
  SkillStepType,
  type SkillTargetConfig,
  type SkillStep,
} from '@/domain/skill/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/**
 * 根据技能 selector 解析目标
 * @param participants 所有参与者（Map）
 * @param source 施法者
 * @param selector 目标选择配置
 * @param steps 可选 — 技能步骤列表，用于 FIRST 策略的智能默认
 * @returns 目标实体数组
 */
export function resolveSkillTargets(
  participants: Map<string, BattleEntity>,
  source: BattleEntity,
  selector: SkillTargetConfig,
  steps?: SkillStep[],
): BattleEntity[] {
  const all = Array.from(participants.values())

  // --- self ---
  if (selector.faction === TargetFaction.SELF) return [source]

  const isEnemySide = source.team === PARTICIPANT_SIDE.ALLY
  const factionFilter = (p: BattleEntity): boolean => {
    if (!p.isAlive()) return false
    if (selector.faction === TargetFaction.ALL) return true
    if (selector.faction === TargetFaction.ALLY) return p.team === source.team
    // 'enemy'
    return (
      p.team ===
      (isEnemySide ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY)
    )
  }

  let candidates = all.filter(factionFilter)
  if (candidates.length === 0) return []

  const take = (arr: BattleEntity[], n: number): BattleEntity[] =>
    arr.slice(0, Math.max(1, n))

  const strategy = selector.strategy || TargetStrategy.FIRST
  switch (strategy) {
    case TargetStrategy.ALL:
      return candidates
    case TargetStrategy.LOWEST_HP: {
      const target = candidates.reduce((min, p) =>
        p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
          Math.max(p.getAttribute(ATTRIBUTE_CODE.maxHealth), 1) <
        min.getAttribute(ATTRIBUTE_CODE.currentHealth) /
          Math.max(min.getAttribute(ATTRIBUTE_CODE.maxHealth), 1)
          ? p
          : min,
      )
      return [target]
    }
    case TargetStrategy.RANDOM:
      return take(
        candidates.sort(() => Math.random() - 0.5),
        selector.count === TargetStrategy.ALL
          ? candidates.length
          : (selector.count ?? 1),
      )
    case TargetStrategy.FRONT:
      return [candidates[0]]
    case TargetStrategy.BACK:
      return [candidates[candidates.length - 1]]
    case TargetStrategy.ADJACENT: {
      const sourceSeat = source.seatIndex
      return candidates.filter(
        (p) => Math.abs(p.seatIndex - sourceSeat) === 1 && p.isAlive(),
      )
    }
    case TargetStrategy.RANDOM_ADJACENT: {
      const sourceSeat = source.seatIndex
      const adjacent = candidates.filter(
        (p) => Math.abs(p.seatIndex - sourceSeat) === 1 && p.isAlive(),
      )
      if (adjacent.length === 0) return [source]
      return [adjacent[Math.floor(Math.random() * adjacent.length)]]
    }
    case TargetStrategy.FIRST:
    default: {
      // 智能默认：如果技能含治疗/增益步骤，选最低血量；否则选第一个
      if (steps?.some((s) => s.type === SkillStepType.HEAL || s.type === SkillStepType.APPLY_BUFF)) {
        const target = candidates.reduce((min, p) =>
          p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
            Math.max(p.getAttribute(ATTRIBUTE_CODE.maxHealth), 1) <
          min.getAttribute(ATTRIBUTE_CODE.currentHealth) /
            Math.max(min.getAttribute(ATTRIBUTE_CODE.maxHealth), 1)
            ? p
            : min,
        )
        return [target]
      }
      return take(
        candidates,
        selector.count === TargetStrategy.ALL
          ? candidates.length
          : (selector.count ?? 1),
      )
    }
  }
}

/**
 * 解析步骤级目标选择（快捷入口）
 * 根据 step.targetType 从主目标的相邻位置中选择额外目标
 * @param participants 所有参与者
 * @param mainTarget 主目标
 * @param stepTargetType 步骤目标策略（如 random_adjacent）
 * @returns 额外目标数组
 */
export function resolveStepTargets(
  participants: Map<string, BattleEntity>,
  mainTarget: BattleEntity,
  stepTargetType: string,
): BattleEntity[] {
  const all = Array.from(participants.values())
  const teamMates = all.filter(
    (p) => p.team === mainTarget.team && p.isAlive(),
  )
  const adjacent = teamMates.filter(
    (p) => Math.abs(p.seatIndex - mainTarget.seatIndex) === 1,
  )
  if (adjacent.length === 0) return []

  switch (stepTargetType) {
    case 'random_adjacent':
      return [adjacent[Math.floor(Math.random() * adjacent.length)]]
    case 'adjacent':
      return adjacent
    default:
      return []
  }
}

/**
 * ponytail: P0/AI-1 — 验证建议目标是否满足 selector 约束
 * 含阵营检查 + 位置策略验证（FRONT/BACK/ADJACENT）
 * @returns true 如果目标是 selector 的合法目标
 */
export function validateTargetAgainstSelector(
  target: BattleEntity,
  source: BattleEntity,
  selector: SkillTargetConfig,
  participants: Map<string, BattleEntity>,
): boolean {
  if (!target.isAlive()) return false

  if (selector.faction === TargetFaction.SELF) return target.id === source.id
  if (selector.faction === TargetFaction.ALL) return true

  // 阵营筛选
  const sameTeam = target.team === source.team
  if (selector.faction === TargetFaction.ALLY && !sameTeam) return false
  if (selector.faction === TargetFaction.ENEMY && sameTeam) return false

  // 位置策略验证
  const strategy = selector.strategy || TargetStrategy.FIRST
  const isEnemySide = source.team === PARTICIPANT_SIDE.ALLY
  const candidates = Array.from(participants.values()).filter((p) => {
    if (!p.isAlive()) return false
    if (selector.faction === TargetFaction.ALL) return true
    if (selector.faction === TargetFaction.ALLY) return p.team === source.team
    return p.team === (isEnemySide ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY)
  })

  switch (strategy) {
    case TargetStrategy.FRONT:
      return candidates.length > 0 && target.id === candidates[0].id
    case TargetStrategy.BACK:
      return candidates.length > 0 && target.id === candidates[candidates.length - 1].id
    case TargetStrategy.ADJACENT:
    case TargetStrategy.RANDOM_ADJACENT:
      return candidates.some(
        (p) => Math.abs(p.seatIndex - source.seatIndex) === 1 && p.id === target.id,
      )
    default:
      return true
  }
}
