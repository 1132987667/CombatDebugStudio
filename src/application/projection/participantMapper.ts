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

import type { UIParticipantSnapshot, BuffDisplayItem } from '@/shared/types/projection'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { AttributeCodeNames } from '@/domain/attribute/types'

/**
 * 将 BattleEntity 映射为 UI 快照
 *
 * @param entity — 领域层的战斗参与者
 * @param buffSystem — BuffSystem 实例（用于读取 buff 显示数据）
 * @returns 纯数据快照，可直接写入 Vue reactive 状态
 */
export function participantToSnapshot(
  entity: BattleEntity,
  buffSystem: BuffSystem,
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

    // Buff 显示数据
    buffs: buildBuffDisplay(entity, buffSystem),

    // 版本戳
    version: entity.statsVersion,
  }
}

/**
 * 构建 Buff 显示条目列表
 *
 * 逻辑源自 ParticipantCard.vue 的 buffListItems computed +
 * useBuffDisplay 中的摘要生成，现在在投影层预计算。
 */
function buildBuffDisplay(
  entity: BattleEntity,
  buffSystem: BuffSystem,
): BuffDisplayItem[] {
  const items: BuffDisplayItem[] = []
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

      items.push({
        instanceId: id,
        name: config.name,
        isDebuff: config.isDebuff === true,
        remainingTurns: instance.remainingTurns,
        stacks: instance.currentStacks,
        summary: buildAttributeSummary(config.attributes ?? {}),
      })
    }
  }

  // 源2: InterventionManager 维护的手动状态（兼容层）
  const manualEffects = entity.statusEffects ?? []
  for (const s of manualEffects) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id)
      items.push({
        instanceId: s.id,
        name: s.name,
        isDebuff: s.type === 'debuff',
        remainingTurns: s.remainingTurns,
        stacks: 1,
        summary: '',
      })
    }
  }

  return items
}

/**
 * 从 BuffConfig.attributes 生成显示摘要
 * 如 { attack: "+0.15", defense: "-0.10" } → "攻击+15% 防御-10%"
 */
function buildAttributeSummary(attributes: Record<string, string>): string {
  const parts: string[] = []

  for (const [code, raw] of Object.entries(attributes)) {
    const cn = (AttributeCodeNames as Record<string, string>)[code] ?? code
    const num = parseFloat(raw)
    if (isNaN(num)) continue
    if (num >= 0) parts.push(`${cn}+${Math.round(num * 100)}%`)
    else parts.push(`${cn}${Math.round(num * 100)}%`)
  }

  return parts.join(' ')
}
