// 导出所有 Buff 脚本
export * from '@/scripts/base/BaseBuffScript'
export * from '@/scripts/base/BuffScriptUtils'
export * from '@/scripts/base/BuffTemplate'

// 单独导出类，避免 BUFF_ID 冲突
export { MountainGodBuff } from '@/scripts/combat/MountainGodBuff'
export { PoisonDebuff } from '@/scripts/combat/PoisonDebuff'
export { BerserkBuff } from '@/scripts/combat/BerserkBuff'
export { HealOverTime } from '@/scripts/support/HealOverTime'
export { ShieldBuff } from '@/scripts/support/ShieldBuff'

// 新增buff脚本导出
export { HitReductionDebuff } from '@/scripts/combat/HitReductionDebuff'
export { DodgeUpBuff } from '@/scripts/combat/DodgeUpBuff'
export { SpeedReductionDebuff } from '@/scripts/combat/SpeedReductionDebuff'
export { AttackUpBuff } from '@/scripts/combat/AttackUpBuff'
export { DefenseUpBuff } from '@/scripts/combat/DefenseUpBuff'
export { CritDamageReductionDebuff } from '@/scripts/combat/CritDamageReductionDebuff'
export { StoneSkinBuff } from '@/scripts/combat/StoneSkinBuff'
export { MountainChildBuff } from '@/scripts/combat/MountainChildBuff'
export { StrongPoisonDebuff } from '@/scripts/combat/StrongPoisonDebuff'
export { StunDebuff } from '@/scripts/combat/StunDebuff'

// 导出脚本映射，方便注册
export const buffScripts = {
  mountain_god: () => import('@/scripts/combat/MountainGodBuff'),
  poison: () => import('@/scripts/combat/PoisonDebuff'),
  berserk: () => import('@/scripts/combat/BerserkBuff'),
  heal_over_time: () => import('@/scripts/support/HealOverTime'),
  shield: () => import('@/scripts/support/ShieldBuff'),
  // 新增buff脚本映射
  buff_hit_reduction: () => import('@/scripts/combat/HitReductionDebuff'),
  buff_dodge_up: () => import('@/scripts/combat/DodgeUpBuff'),
  buff_speed_reduction: () => import('@/scripts/combat/SpeedReductionDebuff'),
  buff_atk_up: () => import('@/scripts/combat/AttackUpBuff'),
  buff_def_up: () => import('@/scripts/combat/DefenseUpBuff'),
  buff_crit_damage_reduction: () => import('@/scripts/combat/CritDamageReductionDebuff'),
  buff_stone_skin: () => import('@/scripts/combat/StoneSkinBuff'),
  buff_mountain_child: () => import('@/scripts/combat/MountainChildBuff'),
  buff_strong_poison: () => import('@/scripts/combat/StrongPoisonDebuff'),
  buff_stun: () => import('@/scripts/combat/StunDebuff')
}

export type BuffScriptType = keyof typeof buffScripts
