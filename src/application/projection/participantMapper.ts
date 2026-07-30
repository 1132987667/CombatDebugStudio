/**
 * participantMapper.ts — 领域实体 → UI 快照的外部映射器
 *
 * 职责：将 BattleEntity（领域对象）转换为 UIParticipantSnapshot（纯数据）。
 * 此函数不在领域实体上，不在 Vue 组件中，是投影层的纯函数。
 *
 * 设计原则：
 * - 只读取 BattleEntity 的公有 getter/property
 * - 不修改领域实体
 * - 所有 UI 格式化逻辑在此完成（如 Buff summary 字符串）
 */

import type { UIParticipantSnapshot } from '@/shared/types/projection'
import type { BuffRawItem } from '@/shared/types/buff-display'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { classifyBuff } from '@/shared/types/buff-classification'

/**
 * 将 BattleEntity 映射为 UI 快照
 *
 * @param entity — 领域层的战斗参与者
 * @param buffSystem — BuffSystem 实例（用于读取 buff 显示数据）
 * @param formationRow — 可选阵型行位置
 * @param reviveCount — 可选本场已复活次数
 * @returns 纯数据快照，可直接写入 Vue reactive 状态
 */
export function participantToSnapshot(
  entity: BattleEntity,
  buffSystem: BuffSystem,
  formationRow?: 'front' | 'back',
  reviveCount?: number,
): UIParticipantSnapshot {
  const hp = entity.currentHealth
  const maxHp = entity.maxHealth
  const curEnergy = entity.currentEnergy
  const maxEnergy = entity.maxEnergy

  return {
    id: entity.id,
    name: entity.name,
    level: entity.level,
    team: entity.team as 'ally' | 'enemy',

    // 核心数值（与领域层字段名统一）
    currentHealth: hp,
    maxHealth: maxHp,
    currentEnergy: curEnergy,
    maxEnergy,
    attack: entity.getAttribute('attack'),
    defense: entity.getAttribute('defense'),
    speed: entity.getAttribute('speed'),
    critRate: entity.getAttribute('critRate'),
    critDamage: entity.getAttribute('critDamage'),

    // 派生状态
    isAlive: entity.isAlive(),
    healthPercent: maxHp > 0 ? (hp / maxHp) * 100 : 0,
    energyPercent: maxEnergy > 0 ? (curEnergy / maxEnergy) * 100 : 0,

    // 护盾值（来自 BuffSystem.shieldValues）
    shield: buffSystem.getShieldValue(entity.id),

    // Buff 显示数据（BuffRawItem[]，供 useBuffDisplay 管道消费）
    buffs: buildBuffRawItems(entity, buffSystem),

    // 版本戳
    version: entity.statsVersion,

    // 阵型/复活信息
    formationRow,
    reviveCount,
  }
}

/**
 * 构建 Buff 原始条目列表（BuffRawItem[]）
 *
 * 逻辑与 ParticipantCard.vue 的 buffListItems computed 完全一致，
 * 但在此处（投影层）预计算，组件层改为纯消费快照。
 * 输出 BuffRawItem[] 供 useBuffDisplay 管道消费。
 */
function buildBuffRawItems(
  entity: BattleEntity,
  buffSystem: BuffSystem,
): BuffRawItem[] {
  const result: BuffRawItem[] = []
  const seenIds = new Set<string>()

  // 源1: BuffSystem 管理的 buff
  if (typeof entity.getBuffInstanceIds === 'function') {
    const instanceIds = entity.getBuffInstanceIds()
    for (const id of instanceIds) {
      const instance = buffSystem.getBuffInstanceById(id)
      if (!instance) continue
      const config = instance.context.config
      if (!config) continue
      seenIds.add(id)
      seenIds.add(config.id)
      result.push({
        id,
        buffId: config.id,
        name: config.name,
        description: config.description ?? '',
        remainingTurns: instance.remainingTurns,
        currentStacks: instance.currentStacks,
        isNegative: classifyBuff(config as Parameters<typeof classifyBuff>[0]).isNegative,
        attributes: config.attributes,
        effectLines: instance.effectLines ?? [],
        conditionState: instance.conditionState,
        controlType: config.controlType,
      })
    }
  }

  // 源2: InterventionManager 手动状态
  const manualEffects = entity.statusEffects ?? []
  for (const s of manualEffects) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id)
      result.push({
        id: s.id, buffId: s.id, name: s.name, description: '',
        remainingTurns: s.remainingTurns, currentStacks: 1,
        isNegative: s.type === 'debuff', effectLines: [], conditionState: undefined,
      })
    }
  }
  return result
}
