/**
 * triggers/index.ts — 触发器脚本实现 + 注册入口
 *
 * 所有脚本签名：(ctx: TriggerExecutionContext) => void
 * 通过 BuffSystem.registerTriggerScript 注册到 triggerScripts 映射表。
 * 在 BuffSystem 构造函数中被调用，与 registerDefaultTriggerScripts 并列。
 *
 * ponytail: 所有脚本都很简短（15-30行），集中在一个文件中便于管理。
 * 如果日后总数超过 30 个或单文件超过 300 行，按类别拆分：
 *   healTriggers.ts / damageTriggers.ts / debuffTriggers.ts / summonTrigger.ts
 */
import type { TriggerExecutionContext } from '@/domain/buff/BuffSystem'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ControlType } from '@/domain/buff/types'

/** 从上下文中获取源参与者的队伍 */
function getSourceTeam(ctx: TriggerExecutionContext): string | undefined {
  if (!ctx.sourceId || !ctx.battleData?.participants) return undefined
  return ctx.battleData.participants.get(ctx.sourceId)?.team
}

// ===================== 治疗类 =====================

/** heal_percent_max_hp — 按最大生命值百分比治疗目标 */
export function healPercentMaxHp(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percent as number) ?? 0.05
  const targetId = (ctx.params?.target as string) === 'self' ? ctx.targetId ?? '' : ctx.targetId ?? ''
  if (!targetId) return
  // ponytail: 通过负 damage 实现百分比治疗; requestHeal(0) 曾在此处但会触发无效回调链
  ctx.buffSystem?.requestDamage(targetId, 0, -Math.abs(percent))
}

/** heal_lowest_hp_ally — 治疗血量最低的队友 */
export function healLowestHpAlly(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percentMaxHp as number) ?? 0.05
  const battleData = ctx.battleData
  if (!battleData?.participants) return
  const sourceTeam = getSourceTeam(ctx)
  if (!sourceTeam) return
  const allies = Array.from(battleData.participants.values()).filter(
    (p: BattleEntity) => p.team === sourceTeam && p.isAlive?.() && p.id !== ctx.targetId,
  )
  if (allies.length === 0) return
  const lowest = allies.reduce((a: BattleEntity, b: BattleEntity) =>
    (a.getAttribute?.('currentHealth') ?? 0) < (b.getAttribute?.('currentHealth') ?? 0) ? a : b,
  )
  // ponytail: 同上，不调用 requestHeal(0) 以避免触发 HEAL_RECEIVED 被动循环
  ctx.buffSystem?.requestDamage(lowest.id, 0, -percent)
}

/** heal_all_allies — 治疗所有队友 */
export function healAllAllies(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percentMaxHp as number) ?? 0.03
  const battleData = ctx.battleData
  if (!battleData?.participants) return
  const sourceTeam = getSourceTeam(ctx)
  if (!sourceTeam) return
  const allies = Array.from(battleData.participants.values()).filter(
    (p: BattleEntity) => p.team === sourceTeam && p.isAlive?.(),
  )
  for (const ally of allies) {
    ctx.buffSystem?.requestHeal(ally.id, 0)
    ctx.buffSystem?.requestDamage(ally.id, 0, -percent)
  }
}

/** heal_on_fire_damage — 受火焰伤害时按比例治疗（预留占位，待价值系统接入） */
export function healOnFireDamage(ctx: TriggerExecutionContext): void {
  // ponytail: 需要战斗系统在火焰伤害事件中传递 damage 值到 extra 字段
  const damageValue = ((ctx.extra?.damage as number) ?? 0)
  const healPercent = (ctx.params?.percent as number) ?? 0.5
  if (damageValue <= 0) return
  ctx.buffSystem?.requestHeal(ctx.targetId ?? '', Math.round(damageValue * healPercent))
}

// ===================== 伤害/反弹/格挡类 =====================

/** deal_dot_damage — 持续伤害（百分比），由 buff_poison/buff_strong_poison 使用 */
export function dealDotDamage(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percent as number) ?? 0.05
  ctx.buffSystem?.requestDamage(ctx.targetId ?? '', 0, percent)
}

/** reflect_damage — 按百分比反弹伤害给攻击者 */
export function reflectDamage(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percent as number) ?? 0.3
  const damageTaken = ((ctx.extra?.damage as number) ?? 0)
  const attackerId = ctx.sourceId ?? ''
  if (damageTaken <= 0 || !attackerId) return
  ctx.buffSystem?.requestDamage(attackerId, Math.round(damageTaken * percent))
}

/** reflect_fire_damage — 按百分比反弹火焰伤害 */
export function reflectFireDamage(ctx: TriggerExecutionContext): void {
  // ponytail: 与 reflect_damage 逻辑相同，区别在于触发条件由战斗系统在火焰伤害时 emit 控制
  const percent = (ctx.params?.percent as number) ?? 0.5
  const damageTaken = ((ctx.extra?.damage as number) ?? 0)
  const attackerId = ctx.sourceId ?? ''
  if (damageTaken <= 0 || !attackerId) return
  ctx.buffSystem?.requestDamage(attackerId, Math.round(damageTaken * percent))
}

/** block_damage_percent — 按百分比格挡伤害，减少所受伤害 */
export function blockDamagePercent(ctx: TriggerExecutionContext): void {
  const percent = (ctx.params?.percent as number) ?? 0.5
  const damageTaken = ((ctx.extra?.damage as number) ?? 0)
  if (damageTaken <= 0) return
  const blocked = Math.round(damageTaken * percent)
  ctx.buffSystem?.requestHeal(ctx.targetId ?? '', blocked)
}

/** share_damage — 将伤害分摊给所有队友 */
export function shareDamage(ctx: TriggerExecutionContext): void {
  const damageTaken = ((ctx.extra?.damage as number) ?? 0)
  const battleData = ctx.battleData
  if (damageTaken <= 0 || !battleData?.participants) return
  const sourceTeam = getSourceTeam(ctx)
  if (!sourceTeam) return
  const allies = Array.from(battleData.participants.values()).filter(
    (p: BattleEntity) => p.team === sourceTeam && p.isAlive?.(),
  )
  if (allies.length <= 1) return
  const sharePerAlly = Math.round(damageTaken / allies.length)
  for (const ally of allies) {
    if (ally.id !== ctx.targetId) {
      ctx.buffSystem?.requestDamage(ally.id, sharePerAlly)
    }
  }
  ctx.buffSystem?.requestHeal(ctx.targetId ?? '', damageTaken - sharePerAlly)
}

// ===================== 施加 Debuff 类 =====================

/** apply_debuff_to_attacker — 给攻击者施加指定 buffId 的 debuff */
export function applyDebuffToAttacker(ctx: TriggerExecutionContext): void {
  const buffId = (ctx.params?.buffId as string) ?? ''
  const duration = (ctx.params?.duration as number) ?? 2
  const attackerId = ctx.sourceId ?? ''
  if (!buffId || !attackerId) return
  ctx.buffSystem?.addBuff(attackerId, buffId, { duration }, ctx.currentTurn ?? 0)
}

/** apply_poison — 施加中毒 debuff（固定配置） */
export function applyPoison(ctx: TriggerExecutionContext): void {
  ctx.buffSystem?.addBuff(ctx.targetId ?? '', 'buff_poison', {}, ctx.currentTurn ?? 0)
}

/** apply_silence_to_attacker — 给攻击者施加沉默 */
export function applySilenceToAttacker(ctx: TriggerExecutionContext): void {
  const attackerId = ctx.sourceId ?? ''
  if (!attackerId) return
  ctx.buffSystem?.addBuff(
    attackerId,
    'buff_silence',
    {
      duration: 1,
      controlType: ControlType.SILENCE,
      controlPriority: 50,
    },
    ctx.currentTurn ?? 0,
  )
}

/** cleanse_random_debuff — 驱散目标一个随机 debuff */
export function cleanseRandomDebuff(ctx: TriggerExecutionContext): void {
  const targetId = ctx.targetId ?? ''
  if (!targetId) return
  const buffs = ctx.buffSystem?.getBuffInstances(targetId) ?? []
  const debuffs = buffs.filter((b) => {
    const config = ctx.buffSystem?.getBuffConfigByInstanceId(b.id)
    return config?.isDebuff === true && config?.dispellable !== false
  })
  if (debuffs.length === 0) return
  const target = debuffs[Math.floor(Math.random() * debuffs.length)]
  ctx.buffSystem?.removeBuff(target.id)
}

// ===================== 护盾类 =====================

/** apply_shield — 施加护盾效果（通过 buff_shield 实现） */
export function applyShield(ctx: TriggerExecutionContext): void {
  const shieldPercent = (ctx.params?.shieldPercent as number) ?? 0.1
  ctx.buffSystem?.addBuff(
    ctx.targetId ?? '',
    'buff_shield',
    {
      duration: 1,
      parameters: { shieldPercent },
    },
    ctx.currentTurn ?? 0,
  )
}

// ===================== 召唤类 =====================

/**
 * summon_unit — 召唤单位
 * ponytail: 召唤系统尚未实现。当前仅打日志占位。
 * 升级路径：实现战斗系统的单位召唤管道后，在此处调用 ctx.buffSystem 的召唤接口。
 */
export function summonUnit(_ctx: TriggerExecutionContext): void {
  console.warn('[Trigger] summon_unit — 召唤系统尚未实现，跳过')
}

// ===================== 注册入口 =====================

/** 所有触发器脚本 ID → 处理函数的映射，供 BuffSystem 批量注册 */
export const TRIGGER_SCRIPTS: Record<string, (ctx: TriggerExecutionContext) => void> = {
  heal_percent_max_hp: healPercentMaxHp,
  heal_lowest_hp_ally: healLowestHpAlly,
  heal_all_allies: healAllAllies,
  heal_on_fire_damage: healOnFireDamage,
  deal_dot_damage: dealDotDamage,
  reflect_damage: reflectDamage,
  reflect_fire_damage: reflectFireDamage,
  block_damage_percent: blockDamagePercent,
  share_damage: shareDamage,
  apply_debuff_to_attacker: applyDebuffToAttacker,
  apply_poison: applyPoison,
  apply_silence_to_attacker: applySilenceToAttacker,
  cleanse_random_debuff: cleanseRandomDebuff,
  apply_shield: applyShield,
  summon_unit: summonUnit,
}
