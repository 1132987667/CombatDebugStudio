/**
 * 文件: buff-classification.ts
 * 功能: Buff 分类系统 — 三个正交维度
 *
 * 设计原则（来自用户的看法）：
 *   1. category 不应驱动运行时逻辑。运行时已按配置结构分发（attributes/triggers/aura等）。
 *   2. UI 颜色应由 polarity（正/负/中性）直接决定，而非从 category 优先级链猜测。
 *   3. "类型"应从配置结构自动派生（deriveBuffFacets），而非手动标注。
 *     一个 buff 可以有多个 facet，不需要猜它"主要是哪个"。
 *   4. category 保留为纯元数据/显示标签，直接从 JSON 的 category 字段透传。
 *   5. tags 承担游戏设计分类（dot/poison/debuff 等）。
 *
 * 三个维度的职责：
 *   - polarity  → UI 颜色（positive/negative/neutral）
 *   - category  → 显示标签（从 JSON 透传，纯元数据）
 *   - facets    → 运行时能力（从配置结构自动派生）
 */

import type { ResolvedEffectPlan } from '@/domain/buff/atomic/BuffConfigResolver'

export type BuffDisplayType = 'buff' | 'debuff' | 'control'

// ==================== 维度一：极性（UI 颜色） ====================

export const BUFF_POLARITY = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
} as const
export type BuffPolarity = (typeof BUFF_POLARITY)[keyof typeof BUFF_POLARITY]

// ==================== 维度二：分类标签（纯显示） ====================

export const BUFF_CATEGORY = {
  CONTROL: 'control',
  DOT: 'dot',
  SHIELD: 'shield',
  AURA: 'aura',
  IMMUNITY: 'immunity',
  TRIGGER: 'trigger',
  MODIFIER: 'modifier',
  OTHER: 'other',
} as const
export type BuffCategory = (typeof BUFF_CATEGORY)[keyof typeof BUFF_CATEGORY]

export const BUFF_CATEGORY_LABEL: Record<BuffCategory, string> = {
  [BUFF_CATEGORY.CONTROL]: '控制',
  [BUFF_CATEGORY.DOT]: '持续',
  [BUFF_CATEGORY.SHIELD]: '护盾',
  [BUFF_CATEGORY.AURA]: '光环',
  [BUFF_CATEGORY.IMMUNITY]: '免疫',
  [BUFF_CATEGORY.TRIGGER]: '触发',
  [BUFF_CATEGORY.MODIFIER]: '属性',
  [BUFF_CATEGORY.OTHER]: '其他',
}

// ==================== 维度三：运行时 facet（从配置结构自动派生） ====================

/**
 * 从 buff 配置结构自动派生其运行时 facets。
 * 只看"配置里有什么字段"，不看 category，不看 tags（tags 是游戏设计分类）。
 *
 * 一个 buff 可以有多个 facet：
 *   buff_snake_king_awe_trigger → ['modifier', 'trigger']
 *   buff_commander_aura         → ['aura']
 *   buff_poison                 → ['trigger']（tags 含 dot，但那是游戏设计分类，facet 只看结构）
 */
export function deriveBuffFacets(config: {
  attributes?: unknown
  triggers?: unknown[]
  aura?: unknown
  shield?: unknown
  controlType?: string
  immunities?: string[]
  /** 数据驱动：从 atomic effects 派生（优先级最高） */
  effectPlan?: ResolvedEffectPlan[]
}): BuffCategory[] {
  const facets: BuffCategory[] = []

  // ★ 优先从 effectPlan 派生（数据驱动方式）
  if (config.effectPlan && config.effectPlan.length > 0) {
    for (const effect of config.effectPlan) {
      switch (effect.type) {
        case 'modifier': facets.push(BUFF_CATEGORY.MODIFIER); break
        case 'dot':      facets.push(BUFF_CATEGORY.DOT); break
        case 'hot':      facets.push(BUFF_CATEGORY.TRIGGER); break  // HOT 归入 trigger 类
        case 'control':  facets.push(BUFF_CATEGORY.CONTROL); break
        case 'shield':   facets.push(BUFF_CATEGORY.SHIELD); break
        case 'trigger':  facets.push(BUFF_CATEGORY.TRIGGER); break
        case 'aura':     facets.push(BUFF_CATEGORY.AURA); break
        case 'immunity': facets.push(BUFF_CATEGORY.IMMUNITY); break
      }
    }
    // 去重
    return [...new Set(facets)]
  }

  // 向后兼容：从旧字段派生
  if (
    config.attributes != null &&
    typeof config.attributes === 'object' &&
    Object.keys(config.attributes).length > 0
  ) {
    facets.push(BUFF_CATEGORY.MODIFIER)
  }

  // 触发器：有 triggers 数组
  if (config.triggers != null && config.triggers.length > 0) {
    facets.push(BUFF_CATEGORY.TRIGGER)
  }

  // 光环：有 aura 配置
  if (config.aura != null) {
    facets.push(BUFF_CATEGORY.AURA)
  }

  // 护盾：有 shield 配置
  if (config.shield != null) {
    facets.push(BUFF_CATEGORY.SHIELD)
  }

  // 控制：有 controlType 且非 NONE
  if (
    config.controlType != null &&
    config.controlType !== '' &&
    config.controlType !== 'none'
  ) {
    facets.push(BUFF_CATEGORY.CONTROL)
  }

  // 免疫：有 immunities 数组
  if (config.immunities != null && config.immunities.length > 0) {
    facets.push(BUFF_CATEGORY.IMMUNITY)
  }

  // 空壳/纯标记型 buff → token
  return facets.length > 0 ? facets : [BUFF_CATEGORY.OTHER]
}

// ==================== classifyBuff 入参/出参 ====================

export interface BuffClassificationInput {
  id?: string
  name?: string
  /** buffs.json 中的 category（纯显示标签，不驱动逻辑） */
  category?: string
  /** 控制类型（BuffConfig.controlType） */
  controlType?: string
  /** 效果标签 */
  tags?: string[]
  /** 光环配置 */
  aura?: unknown
  /** 触发器配置 */
  triggers?: unknown[]
  /** 属性修饰符 */
  attributes?: Record<string, string>
  /** 免疫标签 */
  immunities?: string[]
  /** 是否为减益（遗留字段，被 polarity 取代） */
  isDebuff?: boolean
  /** 极性：直接决定 UI 颜色（取代 isDebuff + category 优先级链的猜测） */
  polarity?: BuffPolarity
}

/**
 * Buff 分类结果
 * 三个维度解耦，各自独立：
 *   - polarity  → UI 颜色（positive/negative/neutral）
 *   - category  → 显示标签（透传 JSON 的 category 字段）
 *   - facets    → 运行时能力（从配置结构自动派生，不猜"主分类"）
 */
export interface BuffClassificationResult {
  /** 分类标签：直接从 JSON config.category 透传（纯显示用） */
  category: BuffCategory
  /** 运行时 facets：从配置结构自动派生，可能多个（['modifier', 'trigger']） */
  facets: BuffCategory[]
  /** 是否为减益（由 polarity 决定） */
  isNegative: boolean
  /** 极性：直接声明 */
  polarity: BuffPolarity
}

// ==================== classifyBuff 核心函数 ====================

/**
 * Buff 分类判定函数 — 三个维度完全解耦
 *
 * 1. facets ← 从配置结构自动派生（不看 category，不看 tags）
 * 2. polarity ← 优先取 config.polarity，回退到 isDebuff，再回退到 category 猜测
 * 3. category ← 透传 JSON 的 config.category 字段（纯显示标签），兜底取 facets[0]
 */
export function classifyBuff(
  config: BuffClassificationInput | undefined | null,
): BuffClassificationResult {
  if (!config) {
    return {
      category: BUFF_CATEGORY.OTHER,
      facets: [],
      polarity: BUFF_POLARITY.NEUTRAL,
      isNegative: false,
    }
  }

  // 1. 自动派生 facets（从配置结构，不看 category，不看 tags）
  const facets = deriveBuffFacets(config)

  // 2. 确定极性：polarity → isDebuff → category 猜测（三级回退）
  let polarity: BuffPolarity
  if (config.polarity) {
    polarity = config.polarity
  } else if (config.isDebuff !== undefined) {
    polarity = config.isDebuff ? BUFF_POLARITY.NEGATIVE : BUFF_POLARITY.POSITIVE
  } else {
    polarity = guessPolarity(config.category ?? null, facets)
  }

  // 3. 显示标签：透传 JSON 的 category，兜底取 facets[0]
  const category = asBuffCategory(config.category) ?? (facets.length > 0 ? facets[0] : BUFF_CATEGORY.OTHER)

  return { category, facets, polarity, isNegative: polarity === BUFF_POLARITY.NEGATIVE }
}

/** 安全地将字符串转为 BuffCategory（仅透传有效值，无效返回 undefined） */
function asBuffCategory(raw: string | undefined | null): BuffCategory | undefined {
  if (!raw) return undefined
  for (const val of Object.values(BUFF_CATEGORY)) {
    if (val === raw) return val
  }
  return undefined
}

/** 兜底猜极性（仅当 polarity/isDebuff 都未提供时使用） */
function guessPolarity(
  rawCategory: string | null,
  facets: BuffCategory[],
): BuffPolarity {
  // 从 facets 判
  if (facets.includes(BUFF_CATEGORY.CONTROL)) return BUFF_POLARITY.NEGATIVE
  if (facets.includes(BUFF_CATEGORY.IMMUNITY)) return BUFF_POLARITY.POSITIVE
  if (facets.includes(BUFF_CATEGORY.AURA)) return BUFF_POLARITY.POSITIVE
  if (facets.includes(BUFF_CATEGORY.SHIELD)) return BUFF_POLARITY.POSITIVE

  // 从 rawCategory 判（仅当 facets 判断无法决定时）
  if (rawCategory === 'control' || rawCategory === 'dot') return BUFF_POLARITY.NEGATIVE
  if (rawCategory === 'shield' || rawCategory === 'aura' || rawCategory === 'immunity') return BUFF_POLARITY.POSITIVE

  return BUFF_POLARITY.NEUTRAL
}

// ==================== 日志/显示工具函数 ====================

/**
 * 获取 Buff 的日志 CSS 类名
 * 根据 facet + polarity 决定：
 *   - 有 control facet → 'log-control'
 *   - negative → 'log-debuff'
 *   - positive → 'log-buff'
 */
export function getBuffLogClass(
  classification: BuffClassificationResult,
): string {
  if (classification.facets.includes(BUFF_CATEGORY.CONTROL)) return 'log-control'
  if (classification.isNegative) return 'log-debuff'
  return 'log-buff'
}

/**
 * 获取 Buff 的类型徽章文本（用于 Tooltip 卡片）
 *
 * 规则：
 *   - 有多个 facet → 全部展示，用 + 连接（如 "修饰符+触发"）
 *   - 单个 facet → 展示 facet 的中文名
 *   - 控制类 facet → 加前缀"控制 ·"
 */
export function getBuffCategoryBadge(
  classification: BuffClassificationResult,
): string {
  const { facets } = classification

  if (facets.length === 1) {
    const label = BUFF_CATEGORY_LABEL[facets[0]]
    // 控制类额外标注
    if (facets.includes(BUFF_CATEGORY.CONTROL)) {
      return `控制 · ${label}`
    }
    return label
  }

  // 多个 facet → 全部展示
  return facets.map((f) => BUFF_CATEGORY_LABEL[f]).join('+')
}
