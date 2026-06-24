// 导出所有 Buff 脚本
export * from '@/domain/buff/scripts/base/BaseBuffScript'
export * from '@/domain/buff/scripts/base/BuffScriptUtils'
export * from '@/domain/buff/scripts/base/BuffTemplate'

// 单独导出类，避免 BUFF_ID 冲突
export { MountainGodBuff } from '@/domain/buff/scripts/combat/MountainGodBuff'
export { PoisonDebuff } from '@/domain/buff/scripts/combat/PoisonDebuff'
export { BerserkBuff } from '@/domain/buff/scripts/combat/BerserkBuff'
export { HealOverTime } from '@/domain/buff/scripts/support/HealOverTime'
export { ShieldBuff } from '@/domain/buff/scripts/support/ShieldBuff'

// 新增buff脚本导出
export { HitReductionDebuff } from '@/domain/buff/scripts/combat/HitReductionDebuff'
export { DodgeUpBuff } from '@/domain/buff/scripts/combat/DodgeUpBuff'
export { SpeedReductionDebuff } from '@/domain/buff/scripts/combat/SpeedReductionDebuff'
export { AttackUpBuff } from '@/domain/buff/scripts/combat/AttackUpBuff'
export { DefenseUpBuff } from '@/domain/buff/scripts/combat/DefenseUpBuff'
export { CritDamageReductionDebuff } from '@/domain/buff/scripts/combat/CritDamageReductionDebuff'
export { StoneSkinBuff } from '@/domain/buff/scripts/combat/StoneSkinBuff'
export { MountainChildBuff } from '@/domain/buff/scripts/combat/MountainChildBuff'
export { StrongPoisonDebuff } from '@/domain/buff/scripts/combat/StrongPoisonDebuff'
export { StunDebuff } from '@/domain/buff/scripts/combat/StunDebuff'

// 导出脚本映射，方便注册
export const buffScripts = {
  mountain_god: () => import('@/domain/buff/scripts/combat/MountainGodBuff'),
  poison: () => import('@/domain/buff/scripts/combat/PoisonDebuff'),
  berserk: () => import('@/domain/buff/scripts/combat/BerserkBuff'),
  heal_over_time: () => import('@/domain/buff/scripts/support/HealOverTime'),
  shield: () => import('@/domain/buff/scripts/support/ShieldBuff'),
  // 新增buff脚本映射
  buff_hit_reduction: () => import('@/domain/buff/scripts/combat/HitReductionDebuff'),
  buff_dodge_up: () => import('@/domain/buff/scripts/combat/DodgeUpBuff'),
  buff_speed_reduction: () => import('@/domain/buff/scripts/combat/SpeedReductionDebuff'),
  buff_atk_up: () => import('@/domain/buff/scripts/combat/AttackUpBuff'),
  buff_def_up: () => import('@/domain/buff/scripts/combat/DefenseUpBuff'),
  buff_crit_damage_reduction: () => import('@/domain/buff/scripts/combat/CritDamageReductionDebuff'),
  buff_stone_skin: () => import('@/domain/buff/scripts/combat/StoneSkinBuff'),
  buff_mountain_child: () => import('@/domain/buff/scripts/combat/MountainChildBuff'),
  buff_strong_poison: () => import('@/domain/buff/scripts/combat/StrongPoisonDebuff'),
  buff_stun: () => import('@/domain/buff/scripts/combat/StunDebuff')
}

export type BuffScriptType = keyof typeof buffScripts

