// 导出所有 Buff 脚本
export * from './base/BaseBuffScript'
export * from './base/BuffScriptUtils'
export * from './base/BuffTemplate'

// 单独导出类，避免 BUFF_ID 冲突
export { MountainGodBuff } from './combat/MountainGodBuff'
export { PoisonDebuff } from './combat/PoisonDebuff'
export { BerserkBuff } from './combat/BerserkBuff'
export { HealOverTime } from './support/HealOverTime'
export { ShieldBuff } from './support/ShieldBuff'

// 新增buff脚本导出
export { HitReductionDebuff } from './combat/HitReductionDebuff'
export { DodgeUpBuff } from './combat/DodgeUpBuff'
export { SpeedReductionDebuff } from './combat/SpeedReductionDebuff'
export { AttackUpBuff } from './combat/AttackUpBuff'
export { DefenseUpBuff } from './combat/DefenseUpBuff'
export { CritDamageReductionDebuff } from './combat/CritDamageReductionDebuff'
export { StoneSkinBuff } from './combat/StoneSkinBuff'
export { MountainChildBuff } from './combat/MountainChildBuff'
export { StrongPoisonDebuff } from './combat/StrongPoisonDebuff'
export { StunDebuff } from './combat/StunDebuff'

// 导出脚本映射，方便注册
export const buffScripts = {
  mountain_god: () => import('./combat/MountainGodBuff'),
  poison: () => import('./combat/PoisonDebuff'),
  berserk: () => import('./combat/BerserkBuff'),
  heal_over_time: () => import('./support/HealOverTime'),
  shield: () => import('./support/ShieldBuff'),
  // 新增buff脚本映射
  buff_hit_reduction: () => import('./combat/HitReductionDebuff'),
  buff_dodge_up: () => import('./combat/DodgeUpBuff'),
  buff_speed_reduction: () => import('./combat/SpeedReductionDebuff'),
  buff_atk_up: () => import('./combat/AttackUpBuff'),
  buff_def_up: () => import('./combat/DefenseUpBuff'),
  buff_crit_damage_reduction: () => import('./combat/CritDamageReductionDebuff'),
  buff_stone_skin: () => import('./combat/StoneSkinBuff'),
  buff_mountain_child: () => import('./combat/MountainChildBuff'),
  buff_strong_poison: () => import('./combat/StrongPoisonDebuff'),
  buff_stun: () => import('./combat/StunDebuff')
}

export type BuffScriptType = keyof typeof buffScripts
