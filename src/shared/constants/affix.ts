/**
 * affix.ts — 词缀系统常量定义
 *
 * 词缀（Affix）是附加在敌人/角色身上的常驻属性标签：按档位对属性做百分比修正。
 * 词缀只做属性修正；能力型效果（吸血/反伤/格挡/中毒等）交给 Buff 系统实现。
 * 词缀由封神榜「词缀」数据表管理。
 *
 * 设计参考《懒人修仙传》等放置修仙游戏的词缀风格：修仙命名 + 多属性维度
 * （命中/闪避/暴伤/气血/能量/吸血/反伤/格挡）。
 *
 * 词缀结构：
 * - tier（档位）: 减益一档作用于玩家，增益一至四档作用于敌人，随难度递增修正比例。
 * - target（作用目标）: player（减益，作用于玩家）/ enemy（增益，作用于敌人自身）。
 * - statModifiers: 属性百分比修正。
 */

/** 词缀档位 */
export const AffixTier = {
  /** 减益一档：作用于玩家，-20% 属性 */
  DEBUFF_1: 'debuff_1',
  /** 增益一档：作用于敌人，+20% 属性 */
  BUFF_1: 'buff_1',
  /** 增益二档：作用于敌人，+40% 属性 */
  BUFF_2: 'buff_2',
  /** 增益三档：作用于敌人，+60% 属性 */
  BUFF_3: 'buff_3',
  /** 增益四档：作用于敌人，+80% 属性（传说品质） */
  BUFF_4: 'buff_4',
} as const
export type AffixTier = (typeof AffixTier)[keyof typeof AffixTier]

/** 词缀作用目标 */
export const AffixTarget = {
  /** 减益：作用于玩家 */
  PLAYER: 'player',
  /** 增益：作用于敌人自身 */
  ENEMY: 'enemy',
} as const
export type AffixTarget = (typeof AffixTarget)[keyof typeof AffixTarget]

/** 词缀档位显示名 */
export const AffixTierNames: Record<AffixTier, string> = {
  [AffixTier.DEBUFF_1]: '减益一档（-20%）',
  [AffixTier.BUFF_1]: '增益一档（+20%）',
  [AffixTier.BUFF_2]: '增益二档（+40%）',
  [AffixTier.BUFF_3]: '增益三档（+60%）',
  [AffixTier.BUFF_4]: '增益四档（+80%）',
}

/** 词缀作用目标显示名 */
export const AffixTargetNames: Record<AffixTarget, string> = {
  [AffixTarget.PLAYER]: '玩家',
  [AffixTarget.ENEMY]: '敌人',
}

/** 词缀 ID 常量（与 configs/affixes/affixes.json 保持一致） */
export const AffixId = {
  // ── 减益一档（作用于玩家，-20%）：摄魂/蚀骨/缚足/乱神/夺魄/凌虚/摧元/绝脉 ──
  DEBUFF_ATTACK_DOWN: 'affix_debuff_attack',
  DEBUFF_DEFENSE_DOWN: 'affix_debuff_defense',
  DEBUFF_SPEED_DOWN: 'affix_debuff_speed',
  DEBUFF_CRIT_DOWN: 'affix_debuff_crit',
  DEBUFF_HIT_DOWN: 'affix_debuff_hit',
  DEBUFF_DODGE_DOWN: 'affix_debuff_dodge',
  DEBUFF_HEALTH_DOWN: 'affix_debuff_health',
  DEBUFF_REGEN_DOWN: 'affix_debuff_regen',
  // ── 增益一档（作用于敌人，+20%）：蛮力/铁躯/疾影/凶威/罗刹/灵虚/玄龟/回春 ──
  BUFF_ATTACK_UP: 'affix_buff_attack',
  BUFF_DEFENSE_UP: 'affix_buff_defense',
  BUFF_SPEED_UP: 'affix_buff_speed',
  BUFF_CRIT_UP: 'affix_buff_crit',
  BUFF_HIT_UP: 'affix_buff_hit',
  BUFF_DODGE_UP: 'affix_buff_dodge',
  BUFF_HEALTH_UP: 'affix_buff_health',
  BUFF_REGEN_UP: 'affix_buff_regen',
  // ── 增益二档（作用于敌人，+40%）：破军/金刚/神行/天煞/魔瞳/不灭/怒涛/破法/斩草/连山/背水/倒打 ──
  BUFF2_ATTACK: 'affix_buff2_attack',
  BUFF2_DEFENSE: 'affix_buff2_defense',
  BUFF2_SPEED: 'affix_buff2_speed',
  BUFF2_CRIT_DMG: 'affix_buff2_critdmg',
  BUFF2_ENERGY: 'affix_buff2_energy',
  BUFF2_DODGE: 'affix_buff2_dodge',
  BUFF2_BOOST: 'affix_buff2_boost',
  BUFF2_TRUE: 'affix_buff2_true',
  BUFF2_LOWHP: 'affix_buff2_lowhp',
  BUFF2_COMBO: 'affix_buff2_combo',
  BUFF2_COUNTER: 'affix_buff2_counter',
  BUFF2_REFLECT: 'affix_buff2_reflect',
  // ── 增益三档（作用于敌人，+60%）：灭世/混元/追电/焚天/噬魂/冥河/金钟/甘露/困仙/镇岳/离火/坎水/青木/金精/坤元 ──
  BUFF3_ATTACK: 'affix_buff3_attack',
  BUFF3_DEFENSE: 'affix_buff3_defense',
  BUFF3_SPEED: 'affix_buff3_speed',
  BUFF3_CRIT: 'affix_buff3_crit',
  BUFF3_REGEN: 'affix_buff3_regen',
  BUFF3_LIFESTEAL: 'affix_buff3_lifesteal',
  BUFF3_REDUCE: 'affix_buff3_reduce',
  BUFF3_HEAL: 'affix_buff3_heal',
  BUFF3_CONTROL: 'affix_buff3_control',
  BUFF3_STUN: 'affix_buff3_stun',
  BUFF3_FIRE: 'affix_buff3_fire',
  BUFF3_WATER: 'affix_buff3_water',
  BUFF3_WOOD: 'affix_buff3_wood',
  BUFF3_METAL: 'affix_buff3_metal',
  BUFF3_EARTH: 'affix_buff3_earth',
  // ── 增益四档（作用于敌人，+80%，传说）：太虚/混沌/九幽/紫霄/玄黄/星辰/万劫/天罗/镜反/诛仙/缚神/不朽 ──
  BUFF4_ATTACK: 'affix_buff4_attack',
  BUFF4_DEFENSE: 'affix_buff4_defense',
  BUFF4_SPEED: 'affix_buff4_speed',
  BUFF4_CRIT_DMG: 'affix_buff4_critdmg',
  BUFF4_REDUCE: 'affix_buff4_reduce',
  BUFF4_HEALTH: 'affix_buff4_health',
  BUFF4_COMBO: 'affix_buff4_combo',
  BUFF4_COUNTER: 'affix_buff4_counter',
  BUFF4_REFLECT: 'affix_buff4_reflect',
  BUFF4_TRUE: 'affix_buff4_true',
  BUFF4_CONTROL: 'affix_buff4_control',
  BUFF4_HEAL: 'affix_buff4_heal',
} as const
export type AffixId = (typeof AffixId)[keyof typeof AffixId]
