/**
 * 技能步骤类型中文显示名称
 */
export const STEP_TYPE_DISPLAY_NAMES: Record<string, string> = {
  deal_damage: '造成伤害',
  heal: '治疗目标',
  apply_buff: '施加增益',
  modify_attribute: '属性变化',
  aura: '光环效果',
  remove_buff: '移除增益',
  remove_debuff: '移除减益',
  cleanse: '净化',
  dispel: '驱散',
  stun: '眩晕',
  silence: '沉默',
  knockback: '击退',
  pull: '拉扯',
  teleport: '传送',
  summon: '召唤',
  transform: '变身',
  shield: '护盾',
  reflect: '反射',
  drain: '吸取',
  revive: '复活',
  custom: '自定义效果',
}

/**
 * 根据步骤类型获取中文显示名称
 * @param stepType - 步骤类型值
 * @returns 中文名称，未知类型返回 '未知'
 */
export function getStepTypeDisplayName(stepType?: string): string {
  return STEP_TYPE_DISPLAY_NAMES[stepType ?? ''] || '未知'
}
