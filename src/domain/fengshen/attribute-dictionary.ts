import type { AttributeValueTier } from './types'

/**
 * 单一权威属性字典 —— 对齐《斗战西游》PRD §9 完整属性列表。
 *
 * 定位：属性的「策划维度元数据」（层级 / 权威显示名 / 分组 / 是否进入 64 项数值体系）唯一来源。
 * attributes.json 仍是 code / isPercentage / defaultValue / description 的底层注册表（引擎只认它），
 * 本字典不复制那些字段，只补充「层级」等 PRD 权威信息，供封神榜各视图统一消费。
 *
 * 覆盖全部 98 个 code：64 项核心（numeric=true）+ 31 项归档（numeric=false）+ 3 项运行时。
 * 归档 ≠ 删除：引擎/配置仍引用这些 code（如 maxEnergy 引用 82 处），仅从「数值体系」视图排除，
 * 并作为「扩展预留」写入 documents/新需求/完整项目说明.md。
 */

/** 分组标签：核心五组 + 归档/运行时若干组 */
export type AttributeCategory =
  | '基础数值'
  | '输出转化'
  | '生存对抗'
  | '状态机制'
  | '机制节奏'
  | '运行时'
  | '五行元素'
  | '战斗上下文'
  | '条件增伤'
  | '技能机制'
  | '状态修正'
  | '重复投放'

export interface AttributeDictEntry {
  code: string
  /** PRD 权威显示名（覆盖 attributes.json 的 name） */
  name: string
  /** 真实层级（修复 seed 曾硬编码 L1 的假分层） */
  tier: AttributeValueTier
  category: AttributeCategory
  /** 是否进入 64 项「数值体系」核心字典 */
  numeric: boolean
  /** 归档原因 / 备注（numeric=false 时说明去向） */
  note?: string
}

/** 核心分组顺序（视图按此排列） */
export const CORE_CATEGORY_ORDER: AttributeCategory[] = [
  '基础数值',
  '输出转化',
  '生存对抗',
  '状态机制',
  '机制节奏',
]

const core = (
  code: string,
  name: string,
  tier: AttributeValueTier,
  category: AttributeCategory,
): AttributeDictEntry => ({ code, name, tier, category, numeric: true })

const archived = (
  code: string,
  name: string,
  tier: AttributeValueTier,
  category: AttributeCategory,
  note: string,
): AttributeDictEntry => ({ code, name, tier, category, numeric: false, note })

export const ATTRIBUTE_DICTIONARY: AttributeDictEntry[] = [
  // ===== 运行时（3）：血条/能量条/护盾条，不进数值体系 =====
  archived('currentHealth', '当前气血', 'L1', '运行时', '运行时状态：单位当前生命值'),
  archived('currentEnergy', '当前能量', 'L1', '运行时', '运行时状态：单位当前能量'),
  archived('shield', '护盾值', 'L1', '运行时', '运行时状态：当前护盾条；可投放形态见「护盾加成%」'),

  // ===== A 基础数值（20） =====
  core('maxHealth', '气血', 'L1', '基础数值'),
  core('attack', '攻击', 'L1', '基础数值'),
  core('defense', '防御', 'L1', '基础数值'),
  core('hitValue', '命中', 'L1', '基础数值'),
  core('dodgeValue', '闪避', 'L1', '基础数值'),
  core('speed', '速度', 'L1', '基础数值'),
  core('healthBonus', '气血加成', 'L2', '基础数值'),
  core('attackBonus', '攻击加成', 'L2', '基础数值'),
  core('defenseBonus', '防御加成', 'L2', '基础数值'),
  core('hitBonus', '命中加成', 'L2', '基础数值'),
  core('dodgeBonus', '闪避加成', 'L2', '基础数值'),
  core('speedBonus', '速度加成', 'L2', '基础数值'),
  core('healthCoefficient', '气血系数', 'L3', '基础数值'),
  core('attackCoefficient', '攻击系数', 'L3', '基础数值'),
  core('defenseCoefficient', '防御系数', 'L3', '基础数值'),
  core('hitCoefficient', '命中系数', 'L3', '基础数值'),
  core('dodgeCoefficient', '闪避系数', 'L3', '基础数值'),
  core('speedCoefficient', '速度系数', 'L3', '基础数值'),
  core('finalAttack', '最终攻击', 'L4', '基础数值'),
  core('finalDefense', '最终防御', 'L4', '基础数值'),

  // ===== B 输出转化（13） =====
  core('critRate', '暴击率', 'L1', '输出转化'),
  core('critDamage', '暴击伤害', 'L1', '输出转化'),
  core('comboRate', '连击率', 'L1', '输出转化'),
  core('counterRate', '反击率', 'L1', '输出转化'),
  core('trueDamageRate', '真伤率', 'L1', '输出转化'),
  core('damageBoost', '伤害加成', 'L2', '输出转化'),
  core('normalAtkBonus', '普攻加成', 'L2', '输出转化'),
  core('skillBonus', '技能加成', 'L2', '输出转化'),
  core('damageCoefficient', '伤害系数', 'L3', '输出转化'),
  core('comboDamageCoefficient', '连击伤害系数', 'L3', '输出转化'),
  core('counterDamageCoefficient', '反击伤害系数', 'L3', '输出转化'),
  core('trueDamageCoefficient', '真伤系数', 'L3', '输出转化'),
  core('finalDamageBoost', '最终伤害提升', 'L4', '输出转化'),

  // ===== C 生存对抗（15，护盾单列为运行时条） =====
  core('damageReduction', '免伤率', 'L1', '生存对抗'),
  core('reflectDamagePercent', '伤害反弹', 'L1', '生存对抗'),
  core('hpRegenPercent', '气血回复(%)', 'L1', '生存对抗'),
  core('hpRegenFlat', '气血回复(固定)', 'L1', '生存对抗'),
  core('hit', '命中率', 'L2', '生存对抗'),
  core('dodge', '闪避率', 'L2', '生存对抗'),
  core('critResist', '暴击抵抗', 'L2', '生存对抗'),
  core('critDmgTakenReduction', '暴伤减免', 'L2', '生存对抗'),
  core('trueDamageResist', '真伤抗性', 'L2', '生存对抗'),
  core('normalAtkDmgReduction', '普攻抵抗', 'L2', '生存对抗'),
  core('skillDmgReduction', '技能抵抗', 'L2', '生存对抗'),
  core('controlImmunity', '控制豁免', 'L2', '生存对抗'),
  core('debuffImmunityRate', '效果抵抗', 'L2', '生存对抗'),
  core('damageReductionCoefficient', '免伤系数', 'L3', '生存对抗'),
  core('finalDamageReduction', '最终伤害减免', 'L4', '生存对抗'),

  // ===== H 状态机制（10，投放到敌我身上的状态修正对） =====
  core('armorBreak', '破甲%', 'L1', '状态机制'),
  core('vulnerability', '易伤%', 'L1', '状态机制'),
  core('shieldReduction', '护盾削减%', 'L1', '状态机制'),
  core('healReduction', '治疗削减%', 'L1', '状态机制'),
  core('lifestealReduction', '吸血削减%', 'L1', '状态机制'),
  core('reflectReduction', '反伤削减%', 'L1', '状态机制'),
  core('shieldBonus', '护盾加成%', 'L2', '状态机制'),
  core('healBonus', '治疗强度加成%', 'L2', '状态机制'),
  core('lifestealBonus', '吸血效果加成%', 'L2', '状态机制'),
  core('reflectBonus', '伤害反弹加成%', 'L2', '状态机制'),

  // ===== F 机制节奏（6） =====
  core('lifestealRate', '吸血率', 'L1', '机制节奏'),
  core('splash', '溅射', 'L1', '机制节奏'),
  core('controlSuccessRate', '控制命中', 'L1', '机制节奏'),
  core('energyInit', '初始能量', 'L2', '机制节奏'),
  core('energyGainEfficiency', '能量获取效率', 'L2', '机制节奏'),
  core('effectHit', '效果命中', 'L2', '机制节奏'),

  // ===== 归档：五行元素（PRD 明确「五行系统暂不启用」） =====
  archived('waterAtk', '水属性攻击', 'L1', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('fireAtk', '火属性攻击', 'L1', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('metalAtk', '金属性攻击', 'L1', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('woodAtk', '木属性攻击', 'L1', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('earthAtk', '土属性攻击', 'L1', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('metalRes', '金属性抗性', 'L2', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('woodRes', '木属性抗性', 'L2', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('waterRes', '水属性抗性', 'L2', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('fireRes', '火属性抗性', 'L2', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('earthRes', '土属性抗性', 'L2', '五行元素', 'PRD：五行系统暂不启用，扩展预留'),
  archived('fireDamage', '火属性伤害', 'L1', '五行元素', '用户剔除：并入五行，暂不启用'),
  archived('fireDamageTaken', '受到火属性伤害', 'L2', '五行元素', '用户剔除：并入五行，暂不启用'),
  archived('waterDamageTaken', '受到水属性伤害', 'L2', '五行元素', '用户剔除：并入五行，暂不启用'),
  archived('lightningDamageTaken', '受到雷属性伤害', 'L2', '五行元素', '用户剔除：并入五行，暂不启用'),

  // ===== 归档：战斗上下文（技能链公式输入，非投放属性） =====
  archived('damageDealt', '造成伤害', 'L1', '战斗上下文', '上下文值：本次攻击造成伤害，供技能链读取'),
  archived('damageTaken', '受到伤害', 'L1', '战斗上下文', '上下文值：本次受到伤害，供技能链读取'),

  // ===== 归档：条件增伤 =====
  archived('damageToDemon', '对妖魔伤害加成%', 'L2', '条件增伤', '待确认→归档：条件性增伤，扩展预留'),
  archived('damageToLowHp', '对低血量伤害加成%', 'L2', '条件增伤', '待确认→归档：条件性增伤，扩展预留'),
  archived('demonDamage', '对魔伤害', 'L1', '条件增伤', '用户剔除：条件性增伤，扩展预留'),

  // ===== 归档：技能机制 =====
  archived('skillCooldown', '技能冷却', 'L1', '技能机制', '用户剔除：冷却非六维成长轴，扩展预留'),
  archived('burnDuration', '灼烧持续时间', 'L1', '技能机制', '待确认→归档：技能专属，扩展预留'),
  archived('webSuccessRate', '蛛网成功率', 'L1', '技能机制', '待确认→归档：技能专属，扩展预留'),
  archived('maxEnergy', '最大能量', 'L1', '技能机制', '用户剔除：能量上限固定，引擎强引用(82处)，仅移出数值视图'),

  // ===== 归档：状态修正 / 边缘输出 / 重复投放 =====
  archived('controlDurationReduction', '受控时间减免', 'L2', '状态修正', '用户剔除：控制对抗细节，扩展预留'),
  archived('critDamageTaken', '受到暴击伤害', 'L2', '状态修正', '用户剔除：与暴伤减免重叠，扩展预留'),
  archived('healReceived', '受到治疗加成', 'L2', '状态修正', '边缘项：与削减对成对补全，扩展预留'),
  archived('poisonRes', '毒素抗性', 'L2', '状态修正', '待确认→归档：DOT 专属抗性，扩展预留'),
  archived('fireSkillDmgBonus', '火系技能伤害加成', 'L2', '条件增伤', '用户剔除：属性技能加成，随五行暂不启用'),
  archived('physicalSkillDmgBonus', '物理技能伤害加成', 'L2', '条件增伤', '用户剔除：伤害大类技能加成，扩展预留'),
  archived('counterDamageBonus', '反击伤害加成', 'L2', '输出转化', '用户剔除：与反击伤害系数重叠，扩展预留'),
  archived('damageTakenIncrease', '受到伤害增加', 'L1', '重复投放', '用户剔除：与易伤(vulnerability)重复'),
]

const DICT_BY_CODE = new Map<string, AttributeDictEntry>(
  ATTRIBUTE_DICTIONARY.map((e) => [e.code, e]),
)

/** 按 code 查字典条目；未登记的 code 返回 undefined（seed 会给出保守兜底） */
export function getAttributeDict(code: string): AttributeDictEntry | undefined {
  return DICT_BY_CODE.get(code)
}

/** 64 项核心数值属性 */
export function getCoreAttributes(): AttributeDictEntry[] {
  return ATTRIBUTE_DICTIONARY.filter((e) => e.numeric)
}

/** 分组归档属性（供「扩展预留」导出/展示） */
export function getArchivedAttributes(): AttributeDictEntry[] {
  return ATTRIBUTE_DICTIONARY.filter((e) => !e.numeric)
}
