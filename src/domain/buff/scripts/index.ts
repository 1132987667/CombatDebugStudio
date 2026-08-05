// 导出所有Buff 脚本
export * from '@/domain/buff/scripts/templates/BaseBuffScript'
export * from '@/domain/buff/scripts/templates/BuffTemplate'

// 单独导出类，避免 BUFF_ID 冲突
export { MountainGodBuff } from '@/domain/buff/scripts/MountainGodBuff'
export { PoisonDebuff } from '@/domain/buff/scripts/PoisonDebuff'
export { BerserkBuff } from '@/domain/buff/scripts/BerserkBuff'
export { HealOverTime } from '@/domain/buff/scripts/HealOverTime'
export { ShieldBuff } from '@/domain/buff/scripts/ShieldBuff'

// 新增buff脚本导出
export { HitReductionDebuff } from '@/domain/buff/scripts/HitReductionDebuff'
export { DodgeUpBuff } from '@/domain/buff/scripts/DodgeUpBuff'
export { SpeedReductionDebuff } from '@/domain/buff/scripts/SpeedReductionDebuff'
export { AttackUpBuff } from '@/domain/buff/scripts/AttackUpBuff'
export { DefenseUpBuff } from '@/domain/buff/scripts/DefenseUpBuff'
export { CritDamageReductionDebuff } from '@/domain/buff/scripts/CritDamageReductionDebuff'
export { StoneSkinBuff } from '@/domain/buff/scripts/StoneSkinBuff'
export { MountainChildBuff } from '@/domain/buff/scripts/MountainChildBuff'
export { StrongPoisonDebuff } from '@/domain/buff/scripts/StrongPoisonDebuff'
export { StunDebuff } from '@/domain/buff/scripts/StunDebuff'

// 导出脚本映射，方便注入
// NOTE: 映射键必须等于脚本类的静态 BUFF_ID——BuffScriptLoader 按 v.BUFF_ID === buffId 精确匹配，
//       键与 BUFF_ID 不一致会导致脚本静默注册失败（此前 4 个键用短名，脚本从未被加载）。
export const buffScripts = {
  buff_mountain_god: () => import('@/domain/buff/scripts/MountainGodBuff'),
  buff_poison: () => import('@/domain/buff/scripts/PoisonDebuff'),
  buff_berserk: () => import('@/domain/buff/scripts/BerserkBuff'),
  heal_over_time: () => import('@/domain/buff/scripts/HealOverTime'),
  buff_shield: () => import('@/domain/buff/scripts/ShieldBuff'),
  // 新增buff脚本映射
  buff_hit_reduction: () =>
    import('@/domain/buff/scripts/HitReductionDebuff'),
  buff_dodge_up: () => import('@/domain/buff/scripts/DodgeUpBuff'),
  buff_speed_reduction: () =>
    import('@/domain/buff/scripts/SpeedReductionDebuff'),
  buff_atk_up: () => import('@/domain/buff/scripts/AttackUpBuff'),
  buff_def_up: () => import('@/domain/buff/scripts/DefenseUpBuff'),
  buff_crit_damage_reduction: () =>
    import('@/domain/buff/scripts/CritDamageReductionDebuff'),
  buff_stone_skin: () => import('@/domain/buff/scripts/StoneSkinBuff'),
  buff_mountain_child: () =>
    import('@/domain/buff/scripts/MountainChildBuff'),
  buff_strong_poison: () =>
    import('@/domain/buff/scripts/StrongPoisonDebuff'),
  buff_stun: () => import('@/domain/buff/scripts/StunDebuff'),
}

export type BuffScriptType = keyof typeof buffScripts
