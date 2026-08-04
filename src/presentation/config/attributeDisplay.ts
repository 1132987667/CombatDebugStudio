/**
 * 文件: attributeDisplay.ts
 * 功能: 属性展示配置（UI 层）
 * 描述: 定义属性的展示层级和分组，用于调试面板的折叠/过滤/分组渲染。
 *       与领域层 AttributeMeta 分离，避免领域层依赖 UI 概念。
 */

/**
 * 展示层级
 * core        — 始终展示（攻击、防御等）
 * advanced    — 折叠/进阶（暴击承伤减免等）
 * situational — 情境高亮（五行抗性、特殊伤害加成）
 * hidden      — 独立 UI 处理（血量、能量、护盾）
 */
export type DisplayTier = 'core' | 'advanced' | 'situational' | 'hidden'

/** 分组标签 */
export type DisplayGroup = 'defense' | 'offense' | 'elemental' | 'control' | 'utility'

/** 属性展示配置 */
export interface AttributeDisplayConfig {
  displayTier: DisplayTier
  group: DisplayGroup
}

/**
 * 属性展示配置映射表
 * ponytail: 与 AttributeMetaMap 一一对应，仅含 UI 相关的 displayTier/group 字段
 */
export const ATTRIBUTE_DISPLAY_CONFIG: Record<string, AttributeDisplayConfig> = {
  currentHealth:               { displayTier: 'hidden',      group: 'defense' },
  maxHealth:                   { displayTier: 'core',        group: 'defense' },
  attack:                      { displayTier: 'core',        group: 'offense' },
  defense:                     { displayTier: 'core',        group: 'defense' },
  speed:                       { displayTier: 'core',        group: 'utility' },
  critRate:                    { displayTier: 'core',        group: 'offense' },
  critDamage:                  { displayTier: 'core',        group: 'offense' },
  currentEnergy:               { displayTier: 'hidden',      group: 'utility' },
  maxEnergy:                   { displayTier: 'core',        group: 'utility' },
  damageReduction:             { displayTier: 'core',        group: 'defense' },
  normalAtkDmgReduction:       { displayTier: 'advanced',    group: 'defense' },
  skillDmgReduction:           { displayTier: 'advanced',    group: 'defense' },
  critDmgTakenReduction:       { displayTier: 'advanced',    group: 'defense' },
  hpRegenPercent:              { displayTier: 'advanced',    group: 'utility' },
  healthBonus:                 { displayTier: 'core',        group: 'defense' },
  attackBonus:                 { displayTier: 'core',        group: 'offense' },
  defenseBonus:                { displayTier: 'core',        group: 'defense' },
  speedBonus:                  { displayTier: 'core',        group: 'utility' },
  waterAtk:                    { displayTier: 'advanced',    group: 'elemental' },
  fireAtk:                     { displayTier: 'advanced',    group: 'elemental' },
  metalRes:                    { displayTier: 'situational', group: 'elemental' },
  woodRes:                     { displayTier: 'situational', group: 'elemental' },
  waterRes:                    { displayTier: 'situational', group: 'elemental' },
  fireRes:                     { displayTier: 'situational', group: 'elemental' },
  earthRes:                    { displayTier: 'situational', group: 'elemental' },
  dodge:                       { displayTier: 'core',        group: 'defense' },
  hit:                         { displayTier: 'core',        group: 'offense' },
  controlSuccessRate:          { displayTier: 'advanced',    group: 'control' },
  controlDurationReduction:    { displayTier: 'advanced',    group: 'control' },
  damageTakenIncrease:         { displayTier: 'advanced',    group: 'defense' },
  damageBoost:                 { displayTier: 'advanced',    group: 'offense' },
  poisonRes:                   { displayTier: 'situational', group: 'control' },
  fireSkillDmgBonus:           { displayTier: 'situational', group: 'offense' },
  physicalSkillDmgBonus:       { displayTier: 'situational', group: 'offense' },
  damageToDemon:               { displayTier: 'situational', group: 'offense' },
  damageToLowHp:               { displayTier: 'situational', group: 'offense' },
  shield:                      { displayTier: 'hidden',      group: 'utility' },
}

/**
 * 获取属性展示配置
 * @param code 属性代码
 * @returns 展示配置，未知属性返回 advanced/utility 默认值
 */
export function getAttributeDisplayConfig(code: string): AttributeDisplayConfig {
  return ATTRIBUTE_DISPLAY_CONFIG[code] ?? { displayTier: 'advanced', group: 'utility' }
}
