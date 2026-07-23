// 导出所�?Buff 脚本
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

// 守护�?buff 脚本
export {
  RevengeRageBuff,
  ArmorBreakBuff,
  FirmShieldBuff,
  StaticReboundBuff,
  FirstStrikeBuff,
  ChargeBurstBuff,
  ElementSlowBuff,
  DespairAuraBuff,
  HealBreezeBuff,
  EyeForEyeBuff,
  RevengeFuryBuff,
  ParalyzeBuff,
  SacrificeRageBuff,
  BerserkerBuff,
  WindThunderBuff,
  RandomTauntBuff,
  BackwaterArmorBuff,
  SwiftWindBuff,
} from '@/domain/buff/scripts/GuardianBuffs'

// 导出脚本映射，方便注�?
export const buffScripts = {
  mountain_god: () => import('@/domain/buff/scripts/MountainGodBuff'),
  poison: () => import('@/domain/buff/scripts/PoisonDebuff'),
  berserk: () => import('@/domain/buff/scripts/BerserkBuff'),
  heal_over_time: () => import('@/domain/buff/scripts/HealOverTime'),
  shield: () => import('@/domain/buff/scripts/ShieldBuff'),
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
  // 守护�?buff 脚本
  guardian_buff_revenge_rage: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_armor_break: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_firm_shield: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_static_rebound: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_first_strike: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_charge_burst: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_element_slow: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_despair_aura: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_heal_breeze: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_eye_for_eye: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_revenge_fury: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_paralyze: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_sacrifice_rage: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_berserker: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_wind_thunder: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_random_taunt: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_backwater_armor: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
  guardian_buff_swift_wind: () =>
    import('@/domain/buff/scripts/GuardianBuffs'),
}

export type BuffScriptType = keyof typeof buffScripts
