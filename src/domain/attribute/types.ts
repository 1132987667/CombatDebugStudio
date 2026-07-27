/**
 * 文件: types.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 属性系统类型定义与计算核心
 * 描述: 定义属性类型、修饰符、属性值对象、修饰符详情和属性名称常量
 * 版本: 2.0.0 (优化版)
 */

// ========== 类型定义 ==========

/** 修饰符计算类型 */
export const ModifierType = {
  ADDITIVE: 'ADDITIVE',
  MULTIPLICATIVE: 'MULTIPLICATIVE',
  PERCENTAGE: 'PERCENTAGE',
  FINAL: 'FINAL',
} as const
/** 修饰符计算类型 */
export type ModifierType = (typeof ModifierType)[keyof typeof ModifierType]

export const ModifierTypeNames: Record<ModifierType, string> = {
  ADDITIVE: '加法',
  MULTIPLICATIVE: '乘法',
  PERCENTAGE: '百分比',
  FINAL: '最终',
}

/** 修饰符来源类型 */
export const ModifierSourceType = {
  BUFF: 'buff',
  EQUIPMENT: 'equipment',
  SKILL: 'skill',
  TERRAIN: 'terrain',
  FORMATION: 'formation',
  BASE: 'base',
  TALENT: 'talent',
} as const
/** 修饰符来源类型 */
export type ModifierSourceType =
  (typeof ModifierSourceType)[keyof typeof ModifierSourceType]

/** 修饰符来源类型显示名称映射 */
export const ModifierSourceTypeNames: Record<ModifierSourceType, string> = {
  buff: '增益',
  equipment: '装备',
  skill: '技能',
  terrain: '地形',
  formation: '阵型',
  base: '基础',
  talent: '天赋',
}

/** 属性值类型 */
export const AttributeValueType = {
  VALUE: 'value', // 数值
  PERCENT: 'percent', // 百分比
} as const
/** 属性值类型 */
export type AttributeValueType =
  (typeof AttributeValueType)[keyof typeof AttributeValueType]

// ========== 核心接口 ==========

/**
 * 修饰符详情（用于 UI 展示与调试）
 */
export interface Modifier {
  /** 来源标识，如 "buff_attack_up" 或 "装备:铁剑" */
  sourceKey: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 目标属性 */
  attribute: ATTRIBUTE_CODE
  /** 加成原始值 */
  value: number
  /** 加成类型 */
  type: ModifierType
  /** 可选描述文本 */
  description?: string
}

/**
 * 属性计算拆解（用于查看计算过程）
 */
export interface CalculationBreakdown {
  /** 基础值 */
  base: number
  /** 加法修正总和 */
  additive: number
  /** 百分比乘区系数（1 + 百分比总和） */
  percentMultiplier: number
  /** 独立乘区系数 */
  independentMultiplier: number
  /** 最终修正系数 */
  finalMultiplier: number
}

/**
 * 单步计算记录
 */
export interface CalculationStep {
  /** 修饰符模板 ID */
  modifierId: string
  /** 来源名称 */
  sourceName: string
  /** 修饰类型 */
  type: ModifierType
  /** 解析后的实际数值 */
  appliedValue: number
  /** 该步骤执行前的中间结果 */
  previousValue: number
  /** 该步骤执行后的中间结果 */
  intermediateResult: number
}

/**
 * 属性值对象（缓存最终值及来源）
 */
export interface AttributeValue {
  /** 最终计算值（缓存） */
  value: number
  /** 基础值（未加任何修饰符） */
  base: number
  /** 修饰符详情列表（用于调试和 UI） */
  modifiers: Modifier[]
  /** 是否为百分比属性（用于 UI 格式化） */
  isPercentage: boolean
  /** 缓存版本戳，与 ParticipantStats.version 比对 */
  cachedVersion: number
  /** 计算拆解（可选，仅 Debug 开启时记录） */
  breakdown?: CalculationBreakdown
}

// ========== 抽象接口（依赖倒置） ==========

/**
 * 修饰符堆栈接口（抽象 ModifierStack 的核心能力）
 * 用于解耦 BattleParticipantImpl 与具体实现
 */
export interface IModifierStack {
  /** 获取指定属性的原始修饰符列表 */
  getModifiers(attribute?: ATTRIBUTE_CODE): Modifier[]
  /** 获取当前堆栈中修饰符总数 */
  getModifierCount(): number
  /** 添加修饰符 */
  addModifier(
    buffInstanceId: string,
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType,
  ): void
  /** 移除修饰符 */
  removeModifier(buffInstanceId: string): void
  /** 清空所有修饰符 */
  clear(): void
}

/**
 * 修饰符提供者接口（核心抽象）
 * 用于解耦 BattleParticipantImpl 与 BuffSystem 的直接依赖
 */
export interface IModifierProvider {
  /**
   * 获取参与者的修饰符堆栈
   * @param participantId 参与者ID
   * @returns 修饰符堆栈实例，不存在则返回 null
   */
  getModifierStack(participantId: string): IModifierStack | null

  /**
   * 获取修饰符来源显示名称
   * @param sourceId 来源ID（如 buffInstanceId）
   */
  getSourceName(sourceId: string): string | null

  /**
   * 获取修饰符来源类型
   * @param sourceId 来源ID
   */
  getSourceType(sourceId: string): ModifierSourceType

  /** 是否处于调试模式 */
  isDebugMode(): boolean
}

/** 所有属性的值对象映射（键为属性代码，值为属性值对象） */
export type AttributeValues = Record<ATTRIBUTE_CODE, AttributeValue>

// ========== 属性代码常量 ==========

/** 属性代码常量（用于类型提示） */
export const ATTRIBUTE_CODE = {
  currentHealth: 'currentHealth',
  maxHealth: 'maxHealth',
  attack: 'attack',
  minAttack: 'minAttack',
  maxAttack: 'maxAttack',
  defense: 'defense',
  speed: 'speed',
  critRate: 'critRate',
  critDamage: 'critDamage',
  // 伤害减免细分
  damageReduction: 'damageReduction', // 免伤率
  normalAtkDmgReduction: 'normalAtkDmgReduction', // 普通攻击伤害减免
  skillDmgReduction: 'skillDmgReduction', // 技能伤害减免
  critDmgTakenReduction: 'critDmgTakenReduction', // 受到暴击伤害减免

  // 再生属性
  hpRegenPercent: 'hpRegenPercent', // 每回合恢复最大气血百分比
  // 预留
  hpRegenFlat: 'hpRegenFlat', // 每回合恢复固定气血

  currentEnergy: 'currentEnergy',
  maxEnergy: 'maxEnergy',
  healthBonus: 'healthBonus',
  attackBonus: 'attackBonus',
  defenseBonus: 'defenseBonus',
  speedBonus: 'speedBonus',

  // ========== 元素属性 ==========
  // ========== 五行属性 ==========
  waterAtk: 'waterAtk', // 水属性攻击力
  fireAtk: 'fireAtk', // 火属性攻击力
  // 预留五行攻击
  metalAtk: 'metalAtk', // 金属性攻击力
  woodAtk: 'woodAtk', // 木属性攻击力
  earthAtk: 'earthAtk', // 土属性攻击力
  waterRes: 'waterRes', // 水属性抗性
  fireRes: 'fireRes', // 火属性抗性
  metalRes: 'metalRes', // 金属性抗性
  woodRes: 'woodRes', // 木属性抗性
  earthRes: 'earthRes', // 土属性抗性

  // ========== 特殊战斗属性 ==========
  dodge: 'dodge', // 闪避率
  hit: 'hit', // 命中率
  controlSuccessRate: 'controlSuccessRate', // 控制技能成功率
  controlDurationReduction: 'controlDurationReduction', // 受控制时间减免
  damageTakenIncrease: 'damageTakenIncrease', // 受到的伤害增加（易伤）
  damageBoost: 'damageBoost', // 伤害提升/伤害加成

  // ========== 抗性 ==========
  poisonRes: 'poisonRes', // 毒素抗性

  // ========== 反弹/反伤（预留） ==========
  reflectDamagePercent: 'reflectDamagePercent', // 反弹伤害比例

  // ========== 伤害类型减免 ==========
  physicalDmgReduction: 'physicalDmgReduction', // 物理伤害减免
  magicalDmgReduction: 'magicalDmgReduction', // 魔法伤害减免

  // ========== 特殊伤害加成 ==========
  fireSkillDmgBonus: 'fireSkillDmgBonus', // 火属性技能伤害加成
  physicalSkillDmgBonus: 'physicalSkillDmgBonus', // 物理技能伤害加成
  damageToDemon: 'damageToDemon', // 对妖魔鬼怪伤害加成
  damageToLowHp: 'damageToLowHp', // 对低气血值目标伤害加成

  // ========== 护盾属性 ==========
  shield: 'shield', // 当前护盾值
} as const

export type ATTRIBUTE_CODE =
  (typeof ATTRIBUTE_CODE)[keyof typeof ATTRIBUTE_CODE]

// ========== 属性计算核心 ==========

/**
 * 根据修饰符类型计算最终值
 *
 * @deprecated 使用 ParticipantStats.recalcAttribute 替代。
 * 该函数使用 decimal 单位（0.2 = 20%），而 ParticipantStats 使用 percentage-point 单位（20 = 20%），
 * 两者 PERCENTAGE 值域不同，混用会导致灾难性结果。
 *
 * @param base 基础值
 * @param modifiers 修饰符详情列表（PERCENTAGE 类型的 value 为小数，如 0.2 表示 +20%）
 * @returns 最终值及计算拆解
 */
export function calculateFinalValue(
  base: number,
  modifiers: Modifier[],
): { value: number; breakdown: CalculationBreakdown } {
  let additive = 0
  let percentSum = 0
  let independentMultiplier = 1
  let finalMultiplier = 1

  for (const mod of modifiers) {
    switch (mod.type) {
      case ModifierType.ADDITIVE:
        additive += mod.value
        break
      case ModifierType.PERCENTAGE:
        percentSum += mod.value
        break
      case ModifierType.MULTIPLICATIVE:
        independentMultiplier *= 1 + mod.value
        break
      case ModifierType.FINAL:
        finalMultiplier *= 1 + mod.value
        break
      default:
        // 防御性编程：如果传入无效类型，静默忽略
        console.warn(
          `[calculateFinalValue] 未知修饰符类型: ${(mod as Modifier).type}`,
        )
    }
  }

  const percentMultiplier = 1 + percentSum
  const afterPercent = base * percentMultiplier + additive
  const afterIndependent = afterPercent * independentMultiplier
  const finalValue = afterIndependent * finalMultiplier

  return {
    value: finalValue,
    breakdown: {
      base,
      additive,
      percentMultiplier,
      independentMultiplier,
      finalMultiplier,
    },
  }
}

// ========== 属性元数据 ==========

/**
 * 属性元数据（用于 UI 展示）
 */
export interface AttributeMeta {
  code: ATTRIBUTE_CODE
  name: string
  displayName: string
  description: string
  range: string
  impact: string
  iconPath?: string
  isPercentage: boolean
  defaultValue?: number
  /** 运行时状态属性（血量、能量），不由公式重算，由 setAttributeValue 单独维护 */
  isRuntimeState?: boolean
}

/** 属性元数据映射表（键为属性代码，与 ATTRIBUTE_CODE 完全同步） */
export const AttributeMetaMap: Record<ATTRIBUTE_CODE, AttributeMeta> = {
  // ========== 基础属性 ==========
  currentHealth: {
    code: 'currentHealth',
    name: '当前气血值',
    displayName: '当前气血值',
    description: '角色当前气血值',
    range: '0-最大值',
    impact: '直接影响角色生存能力，为0时角色死亡',
    isPercentage: false,
    isRuntimeState: true,
  },
  maxHealth: {
    code: 'maxHealth',
    name: '最大气血值',
    displayName: '最大气血值',
    description: '最大气血值上限',
    range: '1-99999',
    impact: '决定角色的气血值上限，影响生存能力',
    isPercentage: false,
  },
  attack: {
    code: 'attack',
    name: '攻击力',
    displayName: '攻击力',
    description: '角色基础攻击力（最小和最大攻击的平均值）',
    range: '1-9999',
    impact: '直接影响伤害输出，是计算最终伤害的基础',
    isPercentage: false,
  },
  minAttack: {
    code: 'minAttack',
    name: '最小攻击力',
    displayName: '最小攻击力',
    description: '角色最小攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出下限',
    isPercentage: false,
  },
  maxAttack: {
    code: 'maxAttack',
    name: '最大攻击力',
    displayName: '最大攻击力',
    description: '角色最大攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出上限',
    isPercentage: false,
  },
  defense: {
    code: 'defense',
    name: '防御力',
    displayName: '防御力',
    description: '角色抵抗伤害的能力',
    range: '0-9999',
    impact: '减少受到的伤害，值越高减伤越多',
    isPercentage: false,
  },
  speed: {
    code: 'speed',
    name: '速度',
    displayName: '速度',
    description: '角色行动顺序的决定因素',
    range: '1-9999',
    impact: '速度越高，行动顺序越靠前，回合内行动次数可能增加',
    isPercentage: false,
  },
  critRate: {
    code: 'critRate',
    name: '暴击率',
    displayName: '暴击率',
    description: '攻击产生暴击的概率',
    range: '0-100%',
    impact: '提高暴击触发几率，增加伤害爆发能力，默认为10%',
    isPercentage: true,
    defaultValue: 10,
  },
  critDamage: {
    code: 'critDamage',
    name: '暴击伤害',
    displayName: '暴击伤害',
    description: '暴击时的伤害倍率',
    range: '100-500%',
    impact: '暴击时造成的额外伤害，值越高暴击伤害越高，默认125%',
    isPercentage: true,
    defaultValue: 125,
  },

  // ========== 能量属性 ==========
  currentEnergy: {
    code: 'currentEnergy',
    name: '当前能量',
    displayName: '当前能量',
    description: '角色当前能量值',
    range: '0-200',
    impact: '用于施放技能，影响技能释放频率，初始值为30',
    isPercentage: false,
    defaultValue: 30,
    isRuntimeState: true,
  },
  maxEnergy: {
    code: 'maxEnergy',
    name: '最大能量',
    displayName: '最大能量',
    description: '最大能量上限',
    range: '200',
    impact: '决定能量上限，通常固定为200',
    isPercentage: false,
    defaultValue: 200,
  },

  // ========== 伤害减免细分 ==========
  damageReduction: {
    code: 'damageReduction',
    name: '免伤率',
    displayName: '免伤率',
    description: '受到伤害的通用减免比例',
    range: '0-100%',
    impact: '减少受到的所有类型伤害',
    isPercentage: true,
  },
  normalAtkDmgReduction: {
    code: 'normalAtkDmgReduction',
    name: '普攻伤害减免',
    displayName: '普攻伤害减免',
    description: '仅对普通攻击有效的伤害减免',
    range: '0-100%',
    impact: '专门减少普通攻击造成的伤害',
    isPercentage: true,
  },
  skillDmgReduction: {
    code: 'skillDmgReduction',
    name: '技能伤害减免',
    displayName: '技能伤害减免',
    description: '仅对技能攻击有效的伤害减免',
    range: '0-100%',
    impact: '专门减少技能攻击造成的伤害',
    isPercentage: true,
  },
  critDmgTakenReduction: {
    code: 'critDmgTakenReduction',
    name: '暴击承伤减免',
    displayName: '暴击承伤减免',
    description: '受到暴击时的额外伤害减免',
    range: '0-100%',
    impact: '减少暴击时受到的额外伤害，提高抗暴能力',
    isPercentage: true,
  },

  // ========== 再生属性 ==========
  hpRegenPercent: {
    code: 'hpRegenPercent',
    name: '气血回复(%)',
    displayName: '百分比气血回复',
    description: '每回合恢复最大气血的百分比',
    range: '0-50%',
    impact: '按最大气血值百分比回复气血，适合高血量角色',
    isPercentage: true,
  },
  // 预留
  hpRegenFlat: {
    code: 'hpRegenFlat',
    name: '气血回复(固定)',
    displayName: '固定气血回复',
    description: '每回合恢复固定的气血值',
    range: '0-9999',
    impact: '每回合回复固定数值的气血值',
    isPercentage: false,
  },

  // ========== 属性加成 ==========
  healthBonus: {
    code: 'healthBonus',
    name: '气血值加成',
    displayName: '气血值加成',
    description: '基于基础气血值的加成百分比',
    range: '0-500%',
    impact: '按百分比提高最大气血值上限',
    isPercentage: true,
  },
  attackBonus: {
    code: 'attackBonus',
    name: '攻击力加成',
    displayName: '攻击力加成',
    description: '基于基础攻击力的加成百分比',
    range: '0-500%',
    impact: '按百分比提高攻击力',
    isPercentage: true,
  },
  defenseBonus: {
    code: 'defenseBonus',
    name: '防御力加成',
    displayName: '防御力加成',
    description: '基于基础防御力的加成百分比',
    range: '0-500%',
    impact: '按百分比提高防御力',
    isPercentage: true,
  },
  speedBonus: {
    code: 'speedBonus',
    name: '速度加成',
    displayName: '速度加成',
    description: '基于基础速度的加成百分比',
    range: '0-500%',
    impact: '按百分比提高速度',
    isPercentage: true,
  },

  // ========== 五行属性 ==========
  waterAtk: {
    code: 'waterAtk',
    name: '水属性攻击',
    displayName: '水属性攻击力',
    description: '水元素属性攻击力',
    range: '0-9999',
    impact: '对火属性敌人造成额外伤害',
    isPercentage: false,
  },
  fireAtk: {
    code: 'fireAtk',
    name: '火属性攻击',
    displayName: '火属性攻击力',
    description: '火元素属性攻击力',
    range: '0-9999',
    impact: '对金属性敌人造成额外伤害',
    isPercentage: false,
  },
  // 预留五行攻击
  metalAtk: {
    code: 'metalAtk',
    name: '金属性攻击',
    displayName: '金属性攻击力',
    description: '金元素属性攻击力',
    range: '0-9999',
    impact: '对木属性敌人造成额外伤害',
    isPercentage: false,
  },
  woodAtk: {
    code: 'woodAtk',
    name: '木属性攻击',
    displayName: '木属性攻击力',
    description: '木元素属性攻击力',
    range: '0-9999',
    impact: '对土属性敌人造成额外伤害',
    isPercentage: false,
  },
  earthAtk: {
    code: 'earthAtk',
    name: '土属性攻击',
    displayName: '土属性攻击力',
    description: '土元素属性攻击力',
    range: '0-9999',
    impact: '对水属性敌人造成额外伤害',
    isPercentage: false,
  },

  // ========== 五行属性 ==========
  metalRes: {
    code: 'metalRes',
    name: '金属性抗性',
    displayName: '金属性抗性',
    description: '对金元素攻击的抗性',
    range: '0-100%',
    impact: '减少受到的金属性伤害',
    isPercentage: true,
  },
  woodRes: {
    code: 'woodRes',
    name: '木属性抗性',
    displayName: '木属性抗性',
    description: '对木元素攻击的抗性',
    range: '0-100%',
    impact: '减少受到的木属性伤害',
    isPercentage: true,
  },
  waterRes: {
    code: 'waterRes',
    name: '水属性抗性',
    displayName: '水属性抗性',
    description: '对水元素攻击的抗性',
    range: '0-100%',
    impact: '减少受到的水属性伤害',
    isPercentage: true,
  },
  fireRes: {
    code: 'fireRes',
    name: '火属性抗性',
    displayName: '火属性抗性',
    description: '对火元素攻击的抗性',
    range: '0-100%',
    impact: '减少受到的火属性伤害',
    isPercentage: true,
  },
  earthRes: {
    code: 'earthRes',
    name: '土属性抗性',
    displayName: '土属性抗性',
    description: '对土元素攻击的抗性',
    range: '0-100%',
    impact: '减少受到的土属性伤害',
    isPercentage: true,
  },

  // ========== 特殊战斗属性 ==========
  dodge: {
    code: 'dodge',
    name: '闪避率',
    displayName: '闪避率',
    description: '完全躲避攻击的概率',
    range: '0-75%',
    impact: '有概率完全避免受到伤害',
    isPercentage: true,
    defaultValue: 10,
  },
  hit: {
    code: 'hit',
    name: '命中率',
    displayName: '命中率',
    description: '攻击命中目标的概率',
    range: '0-100%',
    impact: '提高攻击命中率，对抗敌方闪避',
    isPercentage: true,
    defaultValue: 90,
  },
  controlSuccessRate: {
    code: 'controlSuccessRate',
    name: '控制成功率',
    displayName: '控制技能成功率',
    description: '控制类技能（眩晕、沉默等）的成功率',
    range: '0-100%',
    impact: '提高控制效果施加成功的概率',
    isPercentage: true,
  },
  controlDurationReduction: {
    code: 'controlDurationReduction',
    name: '控制时间减免',
    displayName: '受控制时间减免',
    description: '减少被控制状态影响的持续时间',
    range: '0-100%',
    impact: '降低被眩晕、沉默等控制的持续时间',
    isPercentage: true,
  },
  damageTakenIncrease: {
    code: 'damageTakenIncrease',
    name: '易伤',
    displayName: '受到伤害增加',
    description: '受到的所有伤害增加的比例（易伤状态）',
    range: '0-200%',
    impact: '增加受到的伤害，通常由debuff引起',
    isPercentage: true,
  },
  damageBoost: {
    code: 'damageBoost',
    name: '伤害提升',
    displayName: '伤害提升',
    description: '造成伤害的通用加成比例',
    range: '0-200%',
    impact: '提高造成的所有类型伤害',
    isPercentage: true,
  },

  // ========== 特殊抗性 ==========
  poisonRes: {
    code: 'poisonRes',
    name: '毒素抗性',
    displayName: '毒素抗性',
    description: '对毒素效果的抵抗力',
    range: '0-100%',
    impact: '减少中毒效果的持续时间和伤害',
    isPercentage: true,
  },

  // ========== 伤害类型减免 ==========
  physicalDmgReduction: {
    code: 'physicalDmgReduction',
    name: '物理伤害减免',
    displayName: '物理伤害减免',
    description: '对物理类型伤害的减免比例',
    range: '0-100%',
    impact: '减少受到的物理属性伤害',
    isPercentage: true,
  },
  magicalDmgReduction: {
    code: 'magicalDmgReduction',
    name: '魔法伤害减免',
    displayName: '魔法伤害减免',
    description: '对魔法类型伤害的减免比例',
    range: '0-100%',
    impact: '减少受到的魔法属性伤害',
    isPercentage: true,
  },

  // ========== 特殊伤害加成 ==========
  fireSkillDmgBonus: {
    code: 'fireSkillDmgBonus',
    name: '火系技能伤害加成',
    displayName: '火系技能伤害加成',
    description: '火属性技能造成的额外伤害百分比',
    range: '0-200%',
    impact: '提高火属性技能的伤害输出',
    isPercentage: true,
  },
  physicalSkillDmgBonus: {
    code: 'physicalSkillDmgBonus',
    name: '物理技能伤害加成',
    displayName: '物理技能伤害加成',
    description: '物理技能造成的额外伤害百分比',
    range: '0-200%',
    impact: '提高物理技能的伤害输出',
    isPercentage: true,
  },
  damageToDemon: {
    code: 'damageToDemon',
    name: '对妖伤害加成',
    displayName: '对妖魔鬼怪伤害加成',
    description: '对妖魔鬼怪类敌人造成的额外伤害百分比',
    range: '0-200%',
    impact: '提高对妖魔鬼怪类敌人的伤害',
    isPercentage: true,
  },
  damageToLowHp: {
    code: 'damageToLowHp',
    name: '对低血量伤害加成',
    displayName: '对低血量目标伤害加成',
    description: '对气血值低于一定比例的目标造成的额外伤害百分比',
    range: '0-200%',
    impact: '提高对低血量目标的伤害输出',
    isPercentage: true,
  },

  // ========== 护盾属性 ==========
  shield: {
    code: 'shield',
    name: '护盾值',
    displayName: '护盾值',
    description: '当前护盾值，受到伤害时优先消耗护盾',
    range: '0-99999',
    impact: '吸收受到的伤害，护盾归零后开始消耗气血值',
    isPercentage: false,
    isRuntimeState: true,
  },
  // 预留
  reflectDamagePercent: {
    code: 'reflectDamagePercent',
    name: '伤害反弹',
    displayName: '反弹伤害比例',
    description: '将受到的伤害按比例反弹给攻击者',
    range: '0-100%',
    impact: '受到伤害时反弹部分伤害给攻击者',
    isPercentage: true,
  },
}

/** 从元数据派生的属性显示名称映射 */
export const AttributeCodeNames: Record<ATTRIBUTE_CODE, string> =
  Object.fromEntries(
    Object.entries(AttributeMetaMap).map(([key, meta]) => [
      key,
      meta.displayName,
    ]),
  ) as Record<ATTRIBUTE_CODE, string>

/**
 * 根据属性编码获取属性元数据
 */
export function getAttrMeta(
  code: ATTRIBUTE_CODE,
): AttributeMeta | undefined {
  return AttributeMetaMap[code]
}

/**
 * 根据属性编码获取属性默认值
 * @param code 属性编码
 * @returns 默认值，未定义时返回 0
 */
export function getAttrDv(code: ATTRIBUTE_CODE): number {
  return AttributeMetaMap[code]?.defaultValue ?? 0
}

/**
 * 根据属性名称获取属性编码
 */
export function getAttributeCodeByName(name: string): string | undefined {
  return Object.entries(AttributeMetaMap).find(
    ([_, meta]) => meta.name === name,
  )?.[0]
}