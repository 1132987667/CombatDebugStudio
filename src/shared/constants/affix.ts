/**
 * affix.ts — 词缀系统常量定义
 *
 * 词缀（Affix）是附加在敌人/角色身上的常驻属性标签：按档位对属性做百分比修正。
 * 词缀只做属性修正；能力型效果（中毒 DOT/护盾/控制/净化等）交给 Buff 系统实现。
 * 词缀由封神榜「词缀」数据表管理（configs/affixes/affixes.json 为种子）。
 *
 * 设计参考《西游斗战》词缀系统 v3.1（《设计稿补充-词缀.md》）。
 *
 * 词缀结构（与设计稿 v3.1 对齐）：
 * - tier（档位）: yao_1~yao_4 增益档作用于敌人，mandate 天命 BOSS 专属，jie 劫数作用于玩家。
 * - target（作用目标）: player（劫数，作用于玩家）/ enemy（增益，作用于敌人自身）。
 * - statModifiers: 属性百分比修正（percent 正值/负值）。
 * - conflict_group: 冲突组（五行单体 wuxing_single / 全抗 wuxing_all），同组互斥。
 */

/** 词缀档位（设计稿 v3.1） */
export const AffixTier = {
  /** 一档·妖气：作用于敌人，+20% 属性（关卡 1-3） */
  YAO_1: 'yao_1',
  /** 二档·妖性：作用于敌人，+40% 属性（关卡 4-6） */
  YAO_2: 'yao_2',
  /** 三档·妖道：作用于敌人，+60% 属性（关卡 7-9） */
  YAO_3: 'yao_3',
  /** 四档·妖圣：作用于敌人，+80% 属性（关卡 10 / 隐藏 BOSS） */
  YAO_4: 'yao_4',
  /** 天命：BOSS 专属，不可随机 */
  MANDATE: 'mandate',
  /** 劫数：作用于玩家，-20% 属性 */
  JIE: 'jie',
} as const
export type AffixTier = (typeof AffixTier)[keyof typeof AffixTier]

/** 词缀作用目标 */
export const AffixTarget = {
  /** 劫数：作用于玩家 */
  PLAYER: 'player',
  /** 增益：作用于敌人自身 */
  ENEMY: 'enemy',
} as const
export type AffixTarget = (typeof AffixTarget)[keyof typeof AffixTarget]

/** 词缀档位显示名 */
export const AffixTierNames: Record<AffixTier, string> = {
  [AffixTier.YAO_1]: '一档·妖气（+20%）',
  [AffixTier.YAO_2]: '二档·妖性（+40%）',
  [AffixTier.YAO_3]: '三档·妖道（+60%）',
  [AffixTier.YAO_4]: '四档·妖圣（+80%）',
  [AffixTier.MANDATE]: '天命（BOSS 专属）',
  [AffixTier.JIE]: '劫数（-20%，作用于玩家）',
}

/** 词缀作用目标显示名 */
export const AffixTargetNames: Record<AffixTarget, string> = {
  [AffixTarget.PLAYER]: '玩家',
  [AffixTarget.ENEMY]: '敌人',
}

/** 词缀 ID 常量（与 configs/affixes/affixes.json 保持一致） */
export const AffixId = {
  // ── 一档·妖气（敌人，+20%）：蛮力/铁躯/疾影/凶威/罗刹/灵虚/玄龟/回春/蓄锐/凝息 ──
  YAO1_ATTACK: 'affix_yao_1_001',
  YAO1_DEFENSE: 'affix_yao_1_002',
  YAO1_SPEED: 'affix_yao_1_003',
  YAO1_CRIT_RATE: 'affix_yao_1_004',
  YAO1_HIT: 'affix_yao_1_005',
  YAO1_DODGE: 'affix_yao_1_006',
  YAO1_MAX_HEALTH: 'affix_yao_1_007',
  YAO1_HP_REGEN: 'affix_yao_1_008',
  YAO1_MAX_ENERGY: 'affix_yao_1_009',
  YAO1_ENERGY_INIT: 'affix_yao_1_010',
  // ── 二档·妖性（敌人，+40%）：噬血/猎杀/连山/背水/倒打/蛮力·烈/铁躯·烈/疾影·烈/凶威·烈/玄龟·烈/回春·烈/金钟·初/困仙·初/甘露·初 ──
  YAO2_LIFESTEAL: 'affix_yao_2_001',
  YAO2_DMG_LOW_HP: 'affix_yao_2_002',
  YAO2_COMBO: 'affix_yao_2_003',
  YAO2_COUNTER: 'affix_yao_2_004',
  YAO2_REFLECT: 'affix_yao_2_005',
  YAO2_ATTACK: 'affix_yao_2_006',
  YAO2_DEFENSE: 'affix_yao_2_007',
  YAO2_SPEED: 'affix_yao_2_008',
  YAO2_CRIT_RATE: 'affix_yao_2_009',
  YAO2_MAX_HEALTH: 'affix_yao_2_010',
  YAO2_HP_REGEN: 'affix_yao_2_011',
  YAO2_DMG_REDUCTION: 'affix_yao_2_012',
  YAO2_CONTROL_SUCCESS: 'affix_yao_2_013',
  YAO2_HEAL_RECEIVED: 'affix_yao_2_014',
  // ── 三档·妖道（敌人，+60%）：天罚/不动/瞬影/焚天/噬魂/冥河/灭世/金钟/甘露/困仙/火灵护体/水灵护体/金灵护体/木灵护体/土灵护体/五行轮转/混元归一/星辰·初 ──
  YAO3_ATTACK: 'affix_yao_3_001',
  YAO3_DEFENSE: 'affix_yao_3_002',
  YAO3_SPEED: 'affix_yao_3_003',
  YAO3_CRIT_RATE: 'affix_yao_3_004',
  YAO3_HP_REGEN: 'affix_yao_3_005',
  YAO3_LIFESTEAL: 'affix_yao_3_006',
  YAO3_DMG_BOOST: 'affix_yao_3_007',
  YAO3_DMG_REDUCTION: 'affix_yao_3_008',
  YAO3_HEAL_RECEIVED: 'affix_yao_3_009',
  YAO3_CONTROL_SUCCESS: 'affix_yao_3_010',
  YAO3_FIRE_RES: 'affix_yao_3_011',
  YAO3_WATER_RES: 'affix_yao_3_012',
  YAO3_METAL_RES: 'affix_yao_3_013',
  YAO3_WOOD_RES: 'affix_yao_3_014',
  YAO3_EARTH_RES: 'affix_yao_3_015',
  YAO3_WUXING_ALL: 'affix_yao_3_016',
  YAO3_HUNYUAN: 'affix_yao_3_017',
  YAO3_MAX_HEALTH: 'affix_yao_3_018',
  // ── 四档·妖圣（敌人，+80%，传说）：太虚/混沌/九幽/紫霄/玄黄/星辰/万劫/天罗/镜反/诛仙/缚神/不朽 ──
  YAO4_ATTACK: 'affix_yao_4_001',
  YAO4_DEFENSE: 'affix_yao_4_002',
  YAO4_SPEED: 'affix_yao_4_003',
  YAO4_CRIT_DMG: 'affix_yao_4_004',
  YAO4_DMG_REDUCTION: 'affix_yao_4_005',
  YAO4_MAX_HEALTH: 'affix_yao_4_006',
  YAO4_COMBO: 'affix_yao_4_007',
  YAO4_COUNTER: 'affix_yao_4_008',
  YAO4_REFLECT: 'affix_yao_4_009',
  YAO4_TRUE_DMG: 'affix_yao_4_010',
  YAO4_CONTROL_SUCCESS: 'affix_yao_4_011',
  YAO4_HEAL_RECEIVED: 'affix_yao_4_012',
  // ── 天命（BOSS 专属）：混世魔威/万毒归宗/大鹏展翅/六耳通灵/花妖王·灵根/河伯·沧浪/山神·岩坚 ──
  MANDATE_NIUMO: 'affix_mandate_001',
  MANDATE_XIEZI: 'affix_mandate_002',
  MANDATE_DAPENG: 'affix_mandate_003',
  MANDATE_LIUER: 'affix_mandate_004',
  MANDATE_HUAYAO: 'affix_mandate_005',
  MANDATE_HEBO: 'affix_mandate_006',
  MANDATE_SHANSHEN: 'affix_mandate_007',
  // ── 劫数（玩家，-20%）：破军/蚀骨/缚足/噬心/夺魄/凌虚/摧元/绝脉 ──
  JIE_ATTACK: 'affix_jie_001',
  JIE_DEFENSE: 'affix_jie_002',
  JIE_SPEED: 'affix_jie_003',
  JIE_CRIT_RATE: 'affix_jie_004',
  JIE_HIT: 'affix_jie_005',
  JIE_DODGE: 'affix_jie_006',
  JIE_MAX_HEALTH: 'affix_jie_007',
  JIE_HP_REGEN: 'affix_jie_008',
} as const
export type AffixId = (typeof AffixId)[keyof typeof AffixId]

/** 词缀品阶显示名（rarity 1-5 → 凡/精/超/绝/神；与 _cards.scss 的 affix-qN 类对齐） */
export const AffixRarityNames: Record<number, string> = {
  1: '凡',
  2: '精',
  3: '超',
  4: '绝',
  5: '神',
}

/** 词缀品阶色（CSS 值；统一引用 tokens.scss 的 --rarity-* 令牌，与品质色同源） */
export const AFFIX_RARITY_COLORS: Record<number, string> = {
  1: 'var(--rarity-1)',
  2: 'var(--rarity-2)',
  3: 'var(--rarity-3)',
  4: 'var(--rarity-4)',
  5: 'var(--rarity-5)',
}

/** 词缀品阶名（未知品级回退「凡」） */
export function affixRarityName(rarity: number): string {
  return AffixRarityNames[rarity] ?? '凡'
}
