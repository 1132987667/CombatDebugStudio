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
  getModifiers(attribute?: AttributeCodes): Modifier[]
  /** 计算属性最终值 */
  calculate(attribute: AttributeCodes, baseValue: number): number
  /** 获取当前堆栈中修饰符总数 */
  getModifierCount(): number
  /** 添加修饰符 */
  addModifier(
    buffInstanceId: string,
    attribute: AttributeCodes,
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

// ========== 属性代码常量 ==========

/** 属性代码常量（用于类型提示） */
export const AttributeCodes = {
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
  hpRegenPercent: 'hpRegenPercent', // 每回合恢复最大生命百分比
  hpRegenFlat: 'hpRegenFlat', // 每回合恢复固定生命

  energy: 'energy',
  maxEnergy: 'maxEnergy',
  healthBonus: 'healthBonus',
  attackBonus: 'attackBonus',
  defenseBonus: 'defenseBonus',
  speedBonus: 'speedBonus',

  // ========== 元素属性 ==========
  // ========== 五行属性攻击力 ==========
  metalAtk: 'metalAtk', // 金属性攻击力
  woodAtk: 'woodAtk', // 木属性攻击力
  waterAtk: 'waterAtk', // 水属性攻击力
  fireAtk: 'fireAtk', // 火属性攻击力
  earthAtk: 'earthAtk', // 土属性攻击力
  // ========== 五行属性抗性 ==========
  metalRes: 'metalRes', // 金属性抗性
  woodRes: 'woodRes', // 木属性抗性
  waterRes: 'waterRes', // 水属性抗性
  fireRes: 'fireRes', // 火属性抗性
  earthRes: 'earthRes', // 土属性抗性

  // ========== 特殊战斗属性 ==========
  dodge: 'dodge', // 闪避率
  hit: 'hit', // 命中率
  controlSuccessRate: 'controlSuccessRate', // 控制技能成功率
  controlDurationReduction: 'controlDurationReduction', // 受控制时间减免
  damageTakenIncrease: 'damageTakenIncrease', // 受到的伤害增加（易伤）

  // ========== 反弹/反伤 ==========
  reflectDamagePercent: 'reflectDamagePercent', // 反弹伤害比例

  // ========== 抗性 ==========
  poisonRes: 'poisonRes', // 毒素抗性
} as const

export type AttributeCodes =
  (typeof AttributeCodes)[keyof typeof AttributeCodes]

/** 属性代码显示名称映射 */
export const AttributeCodeNames: Record<AttributeCodes, string> = {
  // ========== 基础属性 ==========
  currentHealth: '当前生命值',
  maxHealth: '最大生命值',
  attack: '攻击力',
  minAttack: '最小攻击力',
  maxAttack: '最大攻击力',
  defense: '防御力',
  speed: '速度',
  critRate: '暴击率',
  critDamage: '暴击伤害',
  energy: '能量',
  maxEnergy: '最大能量',

  // ========== 伤害减免细分 ==========
  damageReduction: '免伤率',
  normalAtkDmgReduction: '普攻伤害减免',
  skillDmgReduction: '技能伤害减免',
  critDmgTakenReduction: '暴击承伤减免',

  // ========== 再生属性 ==========
  hpRegenPercent: '生命回复(%)',
  hpRegenFlat: '生命回复(固定)',

  // ========== 属性加成 ==========
  healthBonus: '生命值加成',
  attackBonus: '攻击力加成',
  defenseBonus: '防御力加成',
  speedBonus: '速度加成',

  // ========== 五行属性攻击力 ==========
  metalAtk: '金属性攻击',
  woodAtk: '木属性攻击',
  waterAtk: '水属性攻击',
  fireAtk: '火属性攻击',
  earthAtk: '土属性攻击',

  // ========== 五行属性抗性 ==========
  metalRes: '金属性抗性',
  woodRes: '木属性抗性',
  waterRes: '水属性抗性',
  fireRes: '火属性抗性',
  earthRes: '土属性抗性',

  // ========== 特殊战斗属性 ==========
  dodge: '闪避率',
  hit: '命中率',
  controlSuccessRate: '控制成功率',
  controlDurationReduction: '受控时间减免',
  damageTakenIncrease: '易伤系数',

  // ========== 反弹/反伤 ==========
  reflectDamagePercent: '伤害反弹比例',

  // ========== 抗性 ==========
  poisonRes: '毒素抗性',
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
    speed: 'speed',
    attack: 'attack',
    defense: 'defense',
    health: 'maxHealth',
    hp: 'maxHealth',
    maxhp: 'maxHealth',
    max_health: 'maxHealth',
    energy: 'energy',
    maxenergy: 'maxEnergy',
    minattack: 'minAttack',
    maxattack: 'maxAttack',
    critrate: 'critRate',
    critdamage: 'critDamage',
    crit_rate: 'critRate',
    crit_damage: 'critDamage',
    currenthealth: 'currentHealth',
    current_health: 'currentHealth',

    // ========== 加成属性 ==========
    hpbonus: 'healthBonus',
    atkbonus: 'attackBonus',
    defbonus: 'defenseBonus',
    spdbonus: 'speedBonus',
    hp_bonus: 'healthBonus',
    atk_bonus: 'attackBonus',
    def_bonus: 'defenseBonus',
    spd_bonus: 'speedBonus',
    healthbonus: 'healthBonus',
    attackbonus: 'attackBonus',
    defensebonus: 'defenseBonus',
    speedbonus: 'speedBonus',

    // ========== 伤害减免 ==========
    dmgreduction: 'damageReduction',
    damage_reduction: 'damageReduction',
    damagereduction: 'damageReduction',
    normalatkdmgreduction: 'normalAtkDmgReduction',
    skilldmgreduction: 'skillDmgReduction',
    critdmgtakenreduction: 'critDmgTakenReduction',

    // ========== 再生属性 ==========
    hpregenpercent: 'hpRegenPercent',
    hpregenflat: 'hpRegenFlat',
    hp_regen_percent: 'hpRegenPercent',
    hp_regen_flat: 'hpRegenFlat',

    // ========== 五行属性 - 攻击力（英文别名） ==========
    metalatk: 'metalAtk',
    metal_attack: 'metalAtk',
    metal_dmg: 'metalAtk',
    metal_damage: 'metalAtk',
    woodatk: 'woodAtk',
    wood_attack: 'woodAtk',
    wood_dmg: 'woodAtk',
    wood_damage: 'woodAtk',
    wateratk: 'waterAtk',
    water_attack: 'waterAtk',
    water_dmg: 'waterAtk',
    water_damage: 'waterAtk',
    fireatk: 'fireAtk',
    fire_attack: 'fireAtk',
    fire_dmg: 'fireAtk',
    fire_damage: 'fireAtk',
    earthatk: 'earthAtk',
    earth_attack: 'earthAtk',
    earth_dmg: 'earthAtk',
    earth_damage: 'earthAtk',

    // ========== 五行属性 - 抗性（英文别名） ==========
    metalres: 'metalRes',
    metal_resist: 'metalRes',
    metal_resistance: 'metalRes',
    woodres: 'woodRes',
    wood_resist: 'woodRes',
    wood_resistance: 'woodRes',
    waterres: 'waterRes',
    water_resist: 'waterRes',
    water_resistance: 'waterRes',
    fireres: 'fireRes',
    fire_resist: 'fireRes',
    fire_resistance: 'fireRes',
    earthres: 'earthRes',
    earth_resist: 'earthRes',
    earth_resistance: 'earthRes',

    // ========== 五行属性 - 中文拼音别名（攻击） ==========
    jin: 'metalAtk',
    jinatk: 'metalAtk',
    jin_attack: 'metalAtk',
    mu: 'woodAtk',
    muatk: 'woodAtk',
    mu_attack: 'woodAtk',
    shui: 'waterAtk',
    shuiatk: 'waterAtk',
    shui_attack: 'waterAtk',
    huo: 'fireAtk',
    huoatk: 'fireAtk',
    huo_attack: 'fireAtk',
    tu: 'earthAtk',
    tuatk: 'earthAtk',
    tu_attack: 'earthAtk',

    // ========== 五行属性 - 中文拼音别名（抗性） ==========
    jinres: 'metalRes',
    jin_res: 'metalRes',
    mures: 'woodRes',
    mu_res: 'woodRes',
    shuires: 'waterRes',
    shui_res: 'waterRes',
    huores: 'fireRes',
    huo_res: 'fireRes',
    tures: 'earthRes',
    tu_res: 'earthRes',

    // ========== 特殊战斗属性 ==========
    dodge: 'dodge',
    hit: 'hit',
    hitrate: 'hit',
    hit_rate: 'hit',
    controlsuccessrate: 'controlSuccessRate',
    control_success_rate: 'controlSuccessRate',
    controldurationreduction: 'controlDurationReduction',
    control_duration_reduction: 'controlDurationReduction',
    damagetakenincrease: 'damageTakenIncrease',
    damage_taken_increase: 'damageTakenIncrease',
    vulnerability: 'damageTakenIncrease', // 易伤别名

    // ========== 反弹/反伤 ==========
    reflectdamagepercent: 'reflectDamagePercent',
    reflect_damage_percent: 'reflectDamagePercent',
    reflect_dmg: 'reflectDamagePercent',
    counterattack: 'reflectDamagePercent', // 反伤别名

    // ========== 抗性 ==========
    poisonres: 'poisonRes',
    poison_res: 'poisonRes',
    poison_resist: 'poisonRes',
    poison_resistance: 'poisonRes',
  }

  // 优先精确匹配映射表
  if (map[lower]) {
    return map[lower]
  }

  // 兜底：转为 camelCase 格式
  return attribute.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
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
 * 请使用 createAttributeValue 以获得更灵活的配置
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
