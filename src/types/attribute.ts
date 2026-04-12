/**
 * 文件: attribute.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 属性系统类型定义与计算核心
 * 描述: 定义属性类型、修饰符、属性值对象、修饰符详情和属性名称常量
 * 版本: 2.0.0 (优化版)
 */

// ========== 类型定义 ==========

/** 修饰符计算类型（严格联合类型） */
export type ModifierType =
  | 'ADDITIVE' // 加法修正
  | 'MULTIPLICATIVE' // 独立乘区
  | 'PERCENTAGE' // 百分比修正
  | 'FINAL' // 最终修正

/** 修饰符来源类型 */
export type ModifierSourceType =
  | 'buff' // 增益
  | 'equipment' // 装备
  | 'skill' // 技能
  | 'terrain' // 地形
  | 'formation' // 阵型
  | 'base' // 基础值
  | 'talent' // 天赋

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
 * 原始修饰符实例（与 Buff 系统关联）
 */
export interface Modifier {
  /** Buff 实例唯一标识 */
  buffInstanceId: string
  /** 目标属性 */
  attribute: AttributeCodes
  /** 修饰数值 */
  value: number
  /** 修饰类型 */
  type: ModifierType
}

/**
 * 修饰符配置（用于创建 Buff/装备等）
 */
export interface ModifierConfig {
  attribute: AttributeCodes
  value: number
  type: ModifierType
  /** 持续时间（回合数） */
  duration?: number
  /** 最大可叠加层数 */
  maxStacks?: number
}

/**
 * 修饰符详情（用于 UI 展示与调试）
 */
export interface ModifierDetail {
  /** 来源标识，如 "buff_attack_up" 或 "装备:铁剑" */
  source: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 加成原始值 */
  value: number
  /** 加成类型 */
  type: ModifierType
  /** 可选描述文本 */
  description?: string
}

/**
 * 属性计算拆解（仅在调试模式填充）
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
 * 属性值对象（缓存最终值及来源）
 */
export interface AttributeValue {
  /** 最终计算值（缓存） */
  value: number
  /** 基础值（未加任何修饰符） */
  base: number
  /** 修饰符详情列表（用于调试和 UI） */
  modifiers: ModifierDetail[]
  /** 是否为百分比属性（用于 UI 格式化） */
  isPercentage: boolean
  /** 是否需要重新计算（脏标记） */
  dirty: boolean
  /** 计算拆解（可选，仅 Debug 开启时记录） */
  breakdown?: CalculationBreakdown
  /** 最近一次计算的详细追踪数据（可选，用于调试面板） */
  trace?: AttributeComputeResult
}

/**
 * 属性计算追踪结果（从 AttributeEngine 导入类型）
 * 注意：此类型定义用于类型提示，实际类型来自 AttributeEngine
 */
export interface AttributeComputeResult {
  /** 最终计算值 */
  finalValue: number
  /** 基础值 */
  baseValue: number
  /** 所有步骤记录（按计算顺序） */
  steps: Array<{
    modifierId: string
    sourceName: string
    type: ModifierType
    appliedValue: number
    previousValue: number
    intermediateResult: number
  }>
  /** 按来源分组的贡献值（便于 UI 展示） */
  sourceContributions: Array<{
    sourceId: string
    sourceName: string
    sourceType?: string
    contribution: number
  }>
  /** 计算拆解 */
  breakdown: {
    additive: number
    percentMultiplier: number
    independentMultiplier: number
    finalMultiplier: number
  }
}

/**
 * 修饰符计算结果
 */
export interface ModifierResult {
  baseValue: number
  finalValue: number
  modifiers: Modifier[]
  breakdown: {
    additive: number
    multiplicative: number
    percentage: number
  }
}

// ========== 抽象接口（依赖倒置） ==========

/**
 * 修饰符堆栈接口（抽象 ModifierStack 的核心能力）
 * 用于解耦 BattleParticipantImpl 与具体实现
 */
export interface IModifierStack {
  /** 获取指定属性的原始修饰符列表 */
  getModifiers(attribute: AttributeCodes): Modifier[]
  /** 计算属性最终值 */
  calculate(attribute: AttributeCodes, baseValue: number): number
  /** 获取当前堆栈中修饰符总数 */
  getModifierCount(): number
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

// ========== 属性代码常量 ==========

/** 属性代码常量（用于类型提示） */
export const AttributeCodes = {
  HP: 'HP',
  MAX_HP: 'MAX_HP',
  ATK: 'ATK',
  MIN_ATK: 'MIN_ATK',
  MAX_ATK: 'MAX_ATK',
  DEF: 'DEF',
  SPD: 'SPD',
  CRIT_RATE: 'CRIT_RATE',
  CRIT_DMG: 'CRIT_DMG',
  // 伤害减免细分
  DMG_REDUCTION: 'DMG_REDUCTION', // 免伤率
  NORMAL_ATK_DMG_REDUCTION: 'NORMAL_ATK_DMG_REDUCTION', // 普通攻击伤害减免
  SKILL_DMG_REDUCTION: 'SKILL_DMG_REDUCTION', // 技能伤害减免
  CRIT_DMG_TAKEN_REDUCTION: 'CRIT_DMG_TAKEN_REDUCTION', // 受到暴击伤害减免

  // 再生属性
  HP_REGEN_PERCENT: 'HP_REGEN_PERCENT', // 每回合恢复最大生命百分比
  HP_REGEN_FLAT: 'HP_REGEN_FLAT', // 每回合恢复固定生命

  ENERGY: 'ENERGY',
  MAX_ENERGY: 'MAX_ENERGY',
  HP_BONUS: 'HP_BONUS',
  ATK_BONUS: 'ATK_BONUS',
  DEF_BONUS: 'DEF_BONUS',
  SPD_BONUS: 'SPD_BONUS',

  // ========== 元素属性 ==========
  // ========== 五行属性攻击力 ==========
  METAL_ATK: 'METAL_ATK', // 金属性攻击力
  WOOD_ATK: 'WOOD_ATK', // 木属性攻击力
  WATER_ATK: 'WATER_ATK', // 水属性攻击力
  FIRE_ATK: 'FIRE_ATK', // 火属性攻击力
  EARTH_ATK: 'EARTH_ATK', // 土属性攻击力
  // ========== 五行属性抗性 ==========
  METAL_RES: 'METAL_RES', // 金属性抗性
  WOOD_RES: 'WOOD_RES', // 木属性抗性
  WATER_RES: 'WATER_RES', // 水属性抗性
  FIRE_RES: 'FIRE_RES', // 火属性抗性
  EARTH_RES: 'EARTH_RES', // 土属性抗性

  // ========== 特殊战斗属性 ==========
  DODGE: 'DODGE', // 闪避率
  HIT: 'HIT', // 命中率
  CONTROL_SUCCESS_RATE: 'CONTROL_SUCCESS_RATE', // 控制技能成功率
  CONTROL_DURATION_REDUCTION: 'CONTROL_DURATION_REDUCTION', // 受控制时间减免
  DAMAGE_TAKEN_INCREASE: 'DAMAGE_TAKEN_INCREASE', // 受到的伤害增加（易伤）

  // ========== 反弹/反伤 ==========
  REFLECT_DAMAGE_PERCENT: 'REFLECT_DAMAGE_PERCENT', // 反弹伤害比例

  // ========== 抗性 ==========
  POISON_RES: 'POISON_RES', // 毒素抗性
} as const

export type AttributeCodes =
  (typeof AttributeCodes)[keyof typeof AttributeCodes]

/** 属性代码显示名称映射 */
export const AttributeCodeNames: Record<AttributeCodes, string> = {
  // ========== 基础属性 ==========
  HP: '生命值',
  MAX_HP: '最大生命值',
  ATK: '攻击力',
  MIN_ATK: '最小攻击力',
  MAX_ATK: '最大攻击力',
  DEF: '防御力',
  SPD: '速度',
  CRIT_RATE: '暴击率',
  CRIT_DMG: '暴击伤害',
  ENERGY: '能量',
  MAX_ENERGY: '最大能量',

  // ========== 伤害减免细分 ==========
  DMG_REDUCTION: '免伤率',
  NORMAL_ATK_DMG_REDUCTION: '普攻伤害减免',
  SKILL_DMG_REDUCTION: '技能伤害减免',
  CRIT_DMG_TAKEN_REDUCTION: '暴击承伤减免',

  // ========== 再生属性 ==========
  HP_REGEN_PERCENT: '生命回复(%)',
  HP_REGEN_FLAT: '生命回复(固定)',

  // ========== 属性加成 ==========
  HP_BONUS: '生命值加成',
  ATK_BONUS: '攻击力加成',
  DEF_BONUS: '防御力加成',
  SPD_BONUS: '速度加成',

  // ========== 五行属性攻击力 ==========
  METAL_ATK: '金属性攻击',
  WOOD_ATK: '木属性攻击',
  WATER_ATK: '水属性攻击',
  FIRE_ATK: '火属性攻击',
  EARTH_ATK: '土属性攻击',

  // ========== 五行属性抗性 ==========
  METAL_RES: '金属性抗性',
  WOOD_RES: '木属性抗性',
  WATER_RES: '水属性抗性',
  FIRE_RES: '火属性抗性',
  EARTH_RES: '土属性抗性',

  // ========== 特殊战斗属性 ==========
  DODGE: '闪避率',
  HIT: '命中率',
  CONTROL_SUCCESS_RATE: '控制成功率',
  CONTROL_DURATION_REDUCTION: '受控时间减免',
  DAMAGE_TAKEN_INCREASE: '易伤系数',

  // ========== 反弹/反伤 ==========
  REFLECT_DAMAGE_PERCENT: '伤害反弹比例',

  // ========== 抗性 ==========
  POISON_RES: '毒素抗性',
}

// ========== 辅助函数 ==========

/**
 * 标准化属性名称（将不同格式转换为内部统一格式）
 * @param attribute 属性名称（如 'speed', 'attack', 'hpBonus', 'metal_atk'）
 * @returns 标准化后的属性代码
 */
export function normalizeAttributeCode(attribute: string): string {
  if (!attribute) return attribute
  const lower = attribute.trim().toLowerCase()

  const map: Record<string, string> = {
    // ========== 基础属性 ==========
    speed: 'SPD',
    attack: 'ATK',
    defense: 'DEF',
    health: 'HP',
    hp: 'HP',
    maxhp: 'MAX_HP',
    max_health: 'MAX_HP',
    energy: 'ENERGY',
    maxenergy: 'MAX_ENERGY',
    minattack: 'MIN_ATK',
    maxattack: 'MAX_ATK',
    critrate: 'CRIT_RATE',
    critdamage: 'CRIT_DMG',
    crit_rate: 'CRIT_RATE',
    crit_damage: 'CRIT_DMG',

    // ========== 加成属性 ==========
    hpbonus: 'HP_BONUS',
    atkbonus: 'ATK_BONUS',
    defbonus: 'DEF_BONUS',
    spdbonus: 'SPD_BONUS',
    hp_bonus: 'HP_BONUS',
    atk_bonus: 'ATK_BONUS',
    def_bonus: 'DEF_BONUS',
    spd_bonus: 'SPD_BONUS',

    // ========== 伤害减免 ==========
    dmgreduction: 'DMG_REDUCTION',
    damage_reduction: 'DMG_REDUCTION',
    normalatkdmgreduction: 'NORMAL_ATK_DMG_REDUCTION',
    skilldmgreduction: 'SKILL_DMG_REDUCTION',
    critdmgtakenreduction: 'CRIT_DMG_TAKEN_REDUCTION',

    // ========== 再生属性 ==========
    hpregenpercent: 'HP_REGEN_PERCENT',
    hpregenflat: 'HP_REGEN_FLAT',
    hp_regen_percent: 'HP_REGEN_PERCENT',
    hp_regen_flat: 'HP_REGEN_FLAT',

    // ========== 五行属性 - 攻击力（英文别名） ==========
    metalatk: 'METAL_ATK',
    metal_attack: 'METAL_ATK',
    metal_dmg: 'METAL_ATK',
    metal_damage: 'METAL_ATK',
    woodatk: 'WOOD_ATK',
    wood_attack: 'WOOD_ATK',
    wood_dmg: 'WOOD_ATK',
    wood_damage: 'WOOD_ATK',
    wateratk: 'WATER_ATK',
    water_attack: 'WATER_ATK',
    water_dmg: 'WATER_ATK',
    water_damage: 'WATER_ATK',
    fireatk: 'FIRE_ATK',
    fire_attack: 'FIRE_ATK',
    fire_dmg: 'FIRE_ATK',
    fire_damage: 'FIRE_ATK',
    earthatk: 'EARTH_ATK',
    earth_attack: 'EARTH_ATK',
    earth_dmg: 'EARTH_ATK',
    earth_damage: 'EARTH_ATK',

    // ========== 五行属性 - 抗性（英文别名） ==========
    metalres: 'METAL_RES',
    metal_resist: 'METAL_RES',
    metal_resistance: 'METAL_RES',
    woodres: 'WOOD_RES',
    wood_resist: 'WOOD_RES',
    wood_resistance: 'WOOD_RES',
    waterres: 'WATER_RES',
    water_resist: 'WATER_RES',
    water_resistance: 'WATER_RES',
    fireres: 'FIRE_RES',
    fire_resist: 'FIRE_RES',
    fire_resistance: 'FIRE_RES',
    earthres: 'EARTH_RES',
    earth_resist: 'EARTH_RES',
    earth_resistance: 'EARTH_RES',

    // ========== 五行属性 - 中文拼音别名（攻击） ==========
    jin: 'METAL_ATK',
    jinatk: 'METAL_ATK',
    jin_attack: 'METAL_ATK',
    mu: 'WOOD_ATK',
    muatk: 'WOOD_ATK',
    mu_attack: 'WOOD_ATK',
    shui: 'WATER_ATK',
    shuiatk: 'WATER_ATK',
    shui_attack: 'WATER_ATK',
    huo: 'FIRE_ATK',
    huoatk: 'FIRE_ATK',
    huo_attack: 'FIRE_ATK',
    tu: 'EARTH_ATK',
    tuatk: 'EARTH_ATK',
    tu_attack: 'EARTH_ATK',

    // ========== 五行属性 - 中文拼音别名（抗性） ==========
    jinres: 'METAL_RES',
    jin_res: 'METAL_RES',
    mures: 'WOOD_RES',
    mu_res: 'WOOD_RES',
    shuires: 'WATER_RES',
    shui_res: 'WATER_RES',
    huores: 'FIRE_RES',
    huo_res: 'FIRE_RES',
    tures: 'EARTH_RES',
    tu_res: 'EARTH_RES',

    // ========== 特殊战斗属性 ==========
    dodge: 'DODGE',
    hit: 'HIT',
    hitrate: 'HIT',
    hit_rate: 'HIT',
    controlsuccessrate: 'CONTROL_SUCCESS_RATE',
    control_success_rate: 'CONTROL_SUCCESS_RATE',
    controldurationreduction: 'CONTROL_DURATION_REDUCTION',
    control_duration_reduction: 'CONTROL_DURATION_REDUCTION',
    damagetakenincrease: 'DAMAGE_TAKEN_INCREASE',
    damage_taken_increase: 'DAMAGE_TAKEN_INCREASE',
    vulnerability: 'DAMAGE_TAKEN_INCREASE', // 易伤别名

    // ========== 反弹/反伤 ==========
    reflectdamagepercent: 'REFLECT_DAMAGE_PERCENT',
    reflect_damage_percent: 'REFLECT_DAMAGE_PERCENT',
    reflect_dmg: 'REFLECT_DAMAGE_PERCENT',
    counterattack: 'REFLECT_DAMAGE_PERCENT', // 反伤别名

    // ========== 抗性 ==========
    poisonres: 'POISON_RES',
    poison_res: 'POISON_RES',
    poison_resist: 'POISON_RES',
    poison_resistance: 'POISON_RES',
  }

  // 优先精确匹配映射表
  if (map[lower]) {
    return map[lower]
  }

  // 兜底：转大写并移除非法字符（兼容配置文件中可能的格式）
  return attribute.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}

// ========== 工厂函数 ==========

/**
 * 创建 AttributeValue 对象（推荐使用此工厂）
 * @param base 基础值（必填）
 * @param value 最终计算值（初次创建时通常与 base 相同）
 * @param options 可选配置项
 */
export function createAttributeValue(
  base: number,
  value: number,
  options?: Partial<{
    modifiers: ModifierDetail[]
    isPercentage: boolean
    dirty: boolean
    breakdown: CalculationBreakdown
  }>,
): AttributeValue {
  return {
    base,
    value,
    modifiers: options?.modifiers ?? [],
    isPercentage: options?.isPercentage ?? false,
    dirty: options?.dirty ?? true, // 新建属性默认标记为脏，需首次计算
    breakdown: options?.breakdown,
  }
}

/**
 * 创建基础 AttributeValue（仅提供 base，value 与 base 相同）
 * @deprecated 请使用 createAttributeValue 以获得更灵活的配置
 */
export function createBaseAttributeValue(
  base: number,
  isPercentage: boolean = false,
): AttributeValue {
  return createAttributeValue(base, base, { isPercentage, dirty: false })
}

// ========== 属性计算核心 ==========

/**
 * 根据修饰符类型计算最终值
 * @param base 基础值
 * @param modifiers 修饰符详情列表
 * @returns 最终值及计算拆解
 */
export function calculateFinalValue(
  base: number,
  modifiers: ModifierDetail[],
): { value: number; breakdown: CalculationBreakdown } {
  let additive = 0
  let percentSum = 0
  let independentMultiplier = 1
  let finalMultiplier = 1

  for (const mod of modifiers) {
    switch (mod.type) {
      case 'ADDITIVE':
        additive += mod.value
        break
      case 'PERCENTAGE':
        percentSum += mod.value
        break
      case 'MULTIPLICATIVE':
        independentMultiplier *= 1 + mod.value
        break
      case 'FINAL':
        finalMultiplier *= 1 + mod.value
        break
      default:
        // 防御性编程：如果传入无效类型，静默忽略
        console.warn(
          `[calculateFinalValue] 未知修饰符类型: ${(mod as any).type}`,
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
  code: string
  name: string
  displayName: string
  description: string
  range: string
  impact: string
  iconPath?: string
  isPercentage: boolean
}

/** 属性元数据映射表 */
export const AttributeMetaMap: Record<string, AttributeMeta> = {
  level: {
    code: 'level',
    name: '等级',
    displayName: '等级',
    description: '角色的等级',
    range: '1-99',
    impact: '影响角色基础属性值和技能解锁',
    isPercentage: false,
  },
  name: {
    code: 'name',
    name: '名称',
    displayName: '名称',
    description: '角色的名字',
    range: '-',
    impact: '用于识别和区分不同角色',
    isPercentage: false,
  },
  currentEnergy: {
    code: 'currentEnergy',
    name: '能量',
    displayName: '能量',
    description: '角色当前能量值',
    range: '0-100',
    impact: '用于施放技能，影响技能释放频率，初始值为25',
    isPercentage: false,
  },
  currentHp: {
    code: 'currentHp',
    name: '气血',
    displayName: '生命值',
    description: '角色当前生命值',
    range: '0-最大值',
    impact: '直接影响角色生存能力，为0时角色死亡',
    isPercentage: false,
  },
  minAttack: {
    code: 'minAttack',
    name: '最小攻击',
    displayName: '最小攻击力',
    description: '角色最小攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出下限',
    isPercentage: false,
  },
  maxAttack: {
    code: 'maxAttack',
    name: '最大攻击',
    displayName: '最大攻击力',
    description: '角色最大攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出上限',
    isPercentage: false,
  },
  defense: {
    code: 'defense',
    name: '防御',
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
  },
  critDamage: {
    code: 'critDamage',
    name: '暴击伤害',
    displayName: '暴击伤害',
    description: '暴击时的伤害倍率',
    range: '100-500%',
    impact: '暴击时造成的额外伤害，值越高暴击伤害越高，默认125%',
    isPercentage: true,
  },
  damageReduction: {
    code: 'damageReduction',
    name: '免伤率',
    displayName: '免伤率',
    description: '受到伤害的减免比例',
    range: '0-100%',
    impact: '减少受到的所有伤害',
    isPercentage: true,
  },
  healthBonus: {
    code: 'healthBonus',
    name: '气血加成',
    displayName: '生命值加成',
    description: '气血加成百分比',
    range: '0-500%',
    impact: '提高角色气血上限，增强生存能力',
    isPercentage: true,
  },
  attackBonus: {
    code: 'attackBonus',
    name: '攻击加成',
    displayName: '攻击力加成',
    description: '攻击加成百分比',
    range: '0-500%',
    impact: '提高角色攻击力，增强伤害输出',
    isPercentage: true,
  },
  defenseBonus: {
    code: 'defenseBonus',
    name: '防御加成',
    displayName: '防御力加成',
    description: '防御加成百分比',
    range: '0-500%',
    impact: '提高角色防御力，增强生存能力',
    isPercentage: true,
  },
  speedBonus: {
    code: 'speedBonus',
    name: '速度加成',
    displayName: '速度加成',
    description: '速度加成百分比',
    range: '0-500%',
    impact: '提高角色速度，增强行动能力',
    isPercentage: true,
  },
  HP: {
    code: 'HP',
    name: '生命值',
    displayName: '生命值',
    description: '当前生命值',
    range: '0-最大值',
    impact: '直接影响角色生存能力，为0时角色死亡',
    isPercentage: false,
  },
  MAX_HP: {
    code: 'MAX_HP',
    name: '最大生命值',
    displayName: '最大生命值',
    description: '最大生命值上限',
    range: '1-99999',
    impact: '决定角色的生命值上限',
    isPercentage: false,
  },
  ATK: {
    code: 'ATK',
    name: '攻击力',
    displayName: '攻击力',
    description: '攻击力',
    range: '1-9999',
    impact: '直接影响伤害输出',
    isPercentage: false,
  },
  MIN_ATK: {
    code: 'MIN_ATK',
    name: '最小攻击力',
    displayName: '最小攻击力',
    description: '最小攻击力',
    range: '1-9999',
    impact: '直接影响伤害输出下限',
    isPercentage: false,
  },
  MAX_ATK: {
    code: 'MAX_ATK',
    name: '最大攻击力',
    displayName: '最大攻击力',
    description: '最大攻击力',
    range: '1-9999',
    impact: '直接影响伤害输出上限',
    isPercentage: false,
  },
  DEF: {
    code: 'DEF',
    name: '防御力',
    displayName: '防御力',
    description: '防御力',
    range: '0-9999',
    impact: '减少受到的伤害',
    isPercentage: false,
  },
  SPD: {
    code: 'SPD',
    name: '速度',
    displayName: '速度',
    description: '速度值',
    range: '1-9999',
    impact: '决定行动顺序',
    isPercentage: false,
  },
  CRIT_RATE: {
    code: 'CRIT_RATE',
    name: '暴击率',
    displayName: '暴击率',
    description: '暴击率',
    range: '0-100%',
    impact: '提高暴击触发几率',
    isPercentage: true,
  },
  CRIT_DMG: {
    code: 'CRIT_DMG',
    name: '暴击伤害',
    displayName: '暴击伤害',
    description: '暴击伤害加成',
    range: '100-500%',
    impact: '暴击时造成的额外伤害',
    isPercentage: true,
  },
  DMG_REDUCTION: {
    code: 'DMG_REDUCTION',
    name: '免伤率',
    displayName: '免伤率',
    description: '伤害减免比例',
    range: '0-100%',
    impact: '减少受到的所有伤害',
    isPercentage: true,
  },
  ENERGY: {
    code: 'ENERGY',
    name: '能量',
    displayName: '能量',
    description: '当前能量值',
    range: '0-100',
    impact: '用于施放技能',
    isPercentage: false,
  },
  MAX_ENERGY: {
    code: 'MAX_ENERGY',
    name: '最大能量值',
    displayName: '最大能量值',
    description: '最大能量上限',
    range: '100',
    impact: '决定能量上限',
    isPercentage: false,
  },
  HP_BONUS: {
    code: 'HP_BONUS',
    name: '生命值加成',
    displayName: '生命值加成',
    description: '生命值加成',
    range: '0-500%',
    impact: '提高角色生命值上限',
    isPercentage: true,
  },
  ATK_BONUS: {
    code: 'ATK_BONUS',
    name: '攻击力加成',
    displayName: '攻击力加成',
    description: '攻击力加成',
    range: '0-500%',
    impact: '提高角色攻击力',
    isPercentage: true,
  },
  DEF_BONUS: {
    code: 'DEF_BONUS',
    name: '防御力加成',
    displayName: '防御力加成',
    description: '防御力加成',
    range: '0-500%',
    impact: '提高角色防御力',
    isPercentage: true,
  },
  SPD_BONUS: {
    code: 'SPD_BONUS',
    name: '速度加成',
    displayName: '速度加成',
    description: '速度加成',
    range: '0-500%',
    impact: '提高角色速度',
    isPercentage: true,
  },
}

/**
 * 根据属性编码获取属性元数据
 */
export function getAttributeMeta(code: string): AttributeMeta | undefined {
  return AttributeMetaMap[code]
}

/**
 * 根据属性名称获取属性编码
 */
export function getAttributeCodeByName(name: string): string | undefined {
  return Object.entries(AttributeMetaMap).find(
    ([_, meta]) => meta.name === name,
  )?.[0]
}
