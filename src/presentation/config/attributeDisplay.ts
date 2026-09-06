/**
 * 文件: attributeDisplay.ts
 * 功能: 属性展示配置（UI 层）
 * 描述: 定义属性的展示层级和分组，用于调试面板的折叠/过滤/分组渲染。
 *       与领域层 AttributeMeta 分离，避免领域层依赖 UI 概念。
 *       分组轴是「属性族」而非计算层：同一属性的加成/系数/最终值与其衍生
 *       归入同组（如 attackBonus/attackCoefficient/finalAttack 均归 offense），
 *       玩家可在面板中看到一条完整的属性链。
 */

/**
 * 展示层级
 * core        — 始终展示（攻击、防御等）
 * advanced    — 折叠/进阶（暴击承伤减免等）
 * situational — 情境高亮（特殊伤害加成、毒抗等）
 * hidden      — 独立 UI 处理（血量、能量、护盾）
 */
export type DisplayTier = 'core' | 'advanced' | 'situational' | 'hidden'

/**
 * 分组标签（属性族）
 * vitality  生命/生存（气血衍生、回复、护盾）
 * offense   攻击（攻击衍生、伤害提升、破甲易伤）
 * defense   防御（防御衍生、减伤承伤、反弹）
 * speed     速度
 * crit      暴击（暴击率/伤害/抵抗）
 * accuracy  命中闪避（含效果命中）
 * mechanic  机制（连击/反击/真伤/溅射）
 * control   控制（成功率/豁免/免疫）
 * elemental 元素（五行攻抗；五行暂不启用期间整体 hidden）
 * support   辅助（吸血、治疗）
 * energy    能量/资源（初始能量、冷却、获取效率）
 * utility   兜底（未归类属性）
 */
export type DisplayGroup =
  | 'vitality'
  | 'offense'
  | 'defense'
  | 'speed'
  | 'crit'
  | 'accuracy'
  | 'mechanic'
  | 'control'
  | 'elemental'
  | 'support'
  | 'energy'
  | 'utility'

/** 属性展示配置 */
export interface AttributeDisplayConfig {
  displayTier: DisplayTier
  group: DisplayGroup
}

/**
 * 属性展示配置映射表（全量 98 项显式配置；未列出的新属性走 getAttributeDisplayConfig 兜底）
 *
 * NOTE: situational 属性的 group 被 useSituationalAttributes.isContextRelevant 消费做上下文
 *       匹配（elemental/offense/control 分支），调整这些项的 group 前必须同步该匹配逻辑。
 */
export const ATTRIBUTE_DISPLAY_CONFIG: Record<string, AttributeDisplayConfig> = {
  // ── hidden：运行时资源，独立 UI 处理 ──
  currentHealth:               { displayTier: 'hidden',      group: 'vitality' },
  currentEnergy:               { displayTier: 'hidden',      group: 'energy' },
  shield:                      { displayTier: 'hidden',      group: 'vitality' },

  // ── core：基础速览层 ──
  maxHealth:                   { displayTier: 'core',        group: 'vitality' },
  attack:                      { displayTier: 'core',        group: 'offense' },
  defense:                     { displayTier: 'core',        group: 'defense' },
  speed:                       { displayTier: 'core',        group: 'speed' },
  critRate:                    { displayTier: 'core',        group: 'crit' },
  critDamage:                  { displayTier: 'core',        group: 'crit' },
  maxEnergy:                   { displayTier: 'core',        group: 'energy' },
  damageReduction:             { displayTier: 'core',        group: 'defense' },
  hitValue:                    { displayTier: 'core',        group: 'accuracy' },
  dodgeValue:                  { displayTier: 'core',        group: 'accuracy' },

  // ── 生命族 ──
  healthBonus:                 { displayTier: 'advanced',    group: 'vitality' },
  healthCoefficient:           { displayTier: 'advanced',    group: 'vitality' },
  hpRegenPercent:              { displayTier: 'advanced',    group: 'vitality' },
  hpRegenFlat:                 { displayTier: 'advanced',    group: 'vitality' },
  shieldBonus:                 { displayTier: 'advanced',    group: 'vitality' },
  shieldReduction:             { displayTier: 'advanced',    group: 'vitality' },

  // ── 攻击族 ──
  attackBonus:                 { displayTier: 'advanced',    group: 'offense' },
  attackCoefficient:           { displayTier: 'advanced',    group: 'offense' },
  finalAttack:                 { displayTier: 'advanced',    group: 'offense' },
  normalAtkBonus:              { displayTier: 'advanced',    group: 'offense' },
  skillBonus:                  { displayTier: 'advanced',    group: 'offense' },
  damageBoost:                 { displayTier: 'advanced',    group: 'offense' },
  damageDealt:                 { displayTier: 'advanced',    group: 'offense' },
  damageCoefficient:           { displayTier: 'advanced',    group: 'offense' },
  finalDamageBoost:            { displayTier: 'advanced',    group: 'offense' },
  demonDamage:                 { displayTier: 'advanced',    group: 'offense' },
  armorBreak:                  { displayTier: 'advanced',    group: 'offense' },
  vulnerability:               { displayTier: 'advanced',    group: 'offense' },

  // ── 防御族 ──
  defenseBonus:                { displayTier: 'advanced',    group: 'defense' },
  defenseCoefficient:          { displayTier: 'advanced',    group: 'defense' },
  finalDefense:                { displayTier: 'advanced',    group: 'defense' },
  damageTaken:                 { displayTier: 'advanced',    group: 'defense' },
  damageTakenIncrease:         { displayTier: 'advanced',    group: 'defense' },
  normalAtkDmgReduction:       { displayTier: 'advanced',    group: 'defense' },
  skillDmgReduction:           { displayTier: 'advanced',    group: 'defense' },
  critDmgTakenReduction:       { displayTier: 'advanced',    group: 'defense' },
  critDamageTaken:             { displayTier: 'advanced',    group: 'defense' },
  damageReductionCoefficient:  { displayTier: 'advanced',    group: 'defense' },
  finalDamageReduction:        { displayTier: 'advanced',    group: 'defense' },
  reflectDamagePercent:        { displayTier: 'advanced',    group: 'defense' },
  reflectBonus:                { displayTier: 'advanced',    group: 'defense' },
  reflectReduction:            { displayTier: 'advanced',    group: 'defense' },

  // ── 速度族 ──
  speedBonus:                  { displayTier: 'advanced',    group: 'speed' },
  speedCoefficient:            { displayTier: 'advanced',    group: 'speed' },

  // ── 暴击族 ──
  critResist:                  { displayTier: 'advanced',    group: 'crit' },

  // ── 命中闪避族 ──
  hit:                         { displayTier: 'advanced',    group: 'accuracy' },
  hitBonus:                    { displayTier: 'advanced',    group: 'accuracy' },
  hitCoefficient:              { displayTier: 'advanced',    group: 'accuracy' },
  dodge:                       { displayTier: 'advanced',    group: 'accuracy' },
  dodgeBonus:                  { displayTier: 'advanced',    group: 'accuracy' },
  dodgeCoefficient:            { displayTier: 'advanced',    group: 'accuracy' },
  effectHit:                   { displayTier: 'advanced',    group: 'accuracy' },

  // ── 机制族（连击/反击/真伤/溅射） ──
  comboRate:                   { displayTier: 'advanced',    group: 'mechanic' },
  comboDamageCoefficient:      { displayTier: 'advanced',    group: 'mechanic' },
  counterRate:                 { displayTier: 'advanced',    group: 'mechanic' },
  counterDamageBonus:          { displayTier: 'advanced',    group: 'mechanic' },
  counterDamageCoefficient:    { displayTier: 'advanced',    group: 'mechanic' },
  trueDamageRate:              { displayTier: 'advanced',    group: 'mechanic' },
  trueDamageCoefficient:       { displayTier: 'advanced',    group: 'mechanic' },
  trueDamageResist:            { displayTier: 'advanced',    group: 'mechanic' },
  splash:                      { displayTier: 'advanced',    group: 'mechanic' },

  // ── 控制族 ──
  controlSuccessRate:          { displayTier: 'advanced',    group: 'control' },
  controlDurationReduction:    { displayTier: 'advanced',    group: 'control' },
  controlImmunity:             { displayTier: 'advanced',    group: 'control' },
  webSuccessRate:              { displayTier: 'advanced',    group: 'control' },
  debuffImmunityRate:          { displayTier: 'advanced',    group: 'control' },
  burnDuration:                { displayTier: 'advanced',    group: 'control' },

  // ── 元素族 ──
  // NOTE: 五行系统暂不启用（《完整项目说明.md》附注裁定，完整设计保留在《五行系统.md》），
  //       对应属性一律 hidden 不显示。不可删除条目走 fallback——fallback 是 advanced，
  //       删了反而会重新显示。启用五行时改回 advanced（攻/伤）与 situational（抗性）。
  waterAtk:                    { displayTier: 'hidden',      group: 'elemental' },
  fireAtk:                     { displayTier: 'hidden',      group: 'elemental' },
  metalAtk:                    { displayTier: 'hidden',      group: 'elemental' },
  woodAtk:                     { displayTier: 'hidden',      group: 'elemental' },
  earthAtk:                    { displayTier: 'hidden',      group: 'elemental' },
  fireDamage:                  { displayTier: 'hidden',      group: 'elemental' },
  fireDamageTaken:             { displayTier: 'hidden',      group: 'elemental' },
  waterDamageTaken:            { displayTier: 'hidden',      group: 'elemental' },
  lightningDamageTaken:        { displayTier: 'hidden',      group: 'elemental' },
  metalRes:                    { displayTier: 'hidden',      group: 'elemental' },
  woodRes:                     { displayTier: 'hidden',      group: 'elemental' },
  waterRes:                    { displayTier: 'hidden',      group: 'elemental' },
  fireRes:                     { displayTier: 'hidden',      group: 'elemental' },
  earthRes:                    { displayTier: 'hidden',      group: 'elemental' },

  // ── 辅助族（吸血/治疗） ──
  lifestealRate:               { displayTier: 'advanced',    group: 'support' },
  lifestealBonus:              { displayTier: 'advanced',    group: 'support' },
  lifestealReduction:          { displayTier: 'advanced',    group: 'support' },
  healBonus:                   { displayTier: 'advanced',    group: 'support' },
  healReduction:               { displayTier: 'advanced',    group: 'support' },
  healReceived:                { displayTier: 'advanced',    group: 'support' },

  // ── 能量/资源族 ──
  energyInit:                  { displayTier: 'advanced',    group: 'energy' },
  energyGainEfficiency:        { displayTier: 'advanced',    group: 'energy' },
  skillCooldown:               { displayTier: 'advanced',    group: 'energy' },

  // ── situational：情境高亮（group 被 useSituationalAttributes 消费，勿随意调整） ──
  poisonRes:                   { displayTier: 'situational', group: 'control' },
  // NOTE: 火系技能伤害加成随五行暂不启用（《完整项目说明.md》附注），启用时改回 situational
  fireSkillDmgBonus:           { displayTier: 'hidden',      group: 'offense' },
  physicalSkillDmgBonus:       { displayTier: 'situational', group: 'offense' },
  damageToDemon:               { displayTier: 'situational', group: 'offense' },
  damageToLowHp:               { displayTier: 'situational', group: 'offense' },
}

/**
 * 获取属性展示配置
 * @param code 属性代码
 * @returns 展示配置，未知属性返回 advanced/utility 默认值
 */
export function getAttributeDisplayConfig(code: string): AttributeDisplayConfig {
  return ATTRIBUTE_DISPLAY_CONFIG[code] ?? { displayTier: 'advanced', group: 'utility' }
}
