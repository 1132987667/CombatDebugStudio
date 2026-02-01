// 导出所有 Buff 脚本
export * from './base/BaseBuffScript'
export * from './base/BuffScriptUtils'

// 单独导出类，避免 BUFF_ID 冲突
export { MountainGodBuff } from './combat/MountainGodBuff'
export { PoisonDebuff } from './combat/PoisonDebuff'
export { BerserkBuff } from './combat/BerserkBuff'
export { HealOverTime } from './support/HealOverTime'
export { ShieldBuff } from './support/ShieldBuff'

// 导出脚本映射，方便注册
export const buffScripts = {
  mountain_god: () => import('./combat/MountainGodBuff'),
  poison: () => import('./combat/PoisonDebuff'),
  berserk: () => import('./combat/BerserkBuff'),
  heal_over_time: () => import('./support/HealOverTime'),
  shield: () => import('./support/ShieldBuff')
}

export type BuffScriptType = keyof typeof buffScripts
