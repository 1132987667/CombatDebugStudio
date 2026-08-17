/**
 * 稀有度 / 品质 · 统一映射表（方案 4：稀有度与品质体系统一化）
 *
 * NOTE: 数据层一律存数字 rarity（1-5）与 quality（1-5），展示层经本表映射中文。全库唯一映射源：
 *       RARITY_NAMES（品级名）与 QUALITY_NAMES（品质名）为两个正交维度，
 *       避免「凡品」与「凡」等概念混淆；多组件共用品级名/品级色/品级类，集中于此不重复。
 *       QUALITY_COLORS 用全局 --color-* 令牌——弹窗/悬浮等 Teleport 到 body 时 --xy-* 不可用。
 *
 * 装备品质（QUALITY_NAMES，设计稿《设计稿补充-装备V2》§5）：
 *       品质决定基础属性系数（凡 80%-90% … 神 141%-150%，本表取区间中值）与随机词条数量
 *       （凡 1 / 精 2 / 超 3 / 绝 4 / 神 5，见 affixCountByQuality）。制造/掉落时按装备阶位
 *       roll 品质（rollQuality），天品阶位固定绝品、仙品阶位固定神品。
 */
import type { XiyouQuality } from './types'

/** 品级名（rarity 1-5 → 凡品/玄品/地品/天品/仙品） */
export const RARITY_NAMES: Record<number, XiyouQuality> = {
  1: '凡品',
  2: '玄品',
  3: '地品',
  4: '天品',
  5: '仙品',
}


/** 品质名（quality 1-5 → 凡/精/超/绝/神，与品级正交的独立维度；制造/掉落时按装备阶位 roll） */
export const QUALITY_NAMES: Record<number, string> = {
  1: '凡',
  2: '精',
  3: '超',
  4: '绝',
  5: '神',
}

/** 品质 → 基础属性系数区间（设计稿 §5：凡 80-90% / 精 91-105% / 超 106-120% / 绝 121-140% / 神 141-150%） */
export const QUALITY_FACTOR_RANGE: Record<number, { min: number; max: number }> = {
  1: { min: 0.8, max: 0.9 },
  2: { min: 0.91, max: 1.05 },
  3: { min: 1.06, max: 1.2 },
  4: { min: 1.21, max: 1.4 },
  5: { min: 1.41, max: 1.5 },
}

/** 品质 → 基础属性系数（区间中值，供旧档/未锁定实例兜底；新制造实例用 rollQualityFactor 锁存） */
export const QUALITY_FACTOR: Record<number, number> = {
  1: 0.85, // 凡：80%-90% 中值
  2: 0.98, // 精：91%-105% 中值
  3: 1.13, // 超：106%-120% 中值
  4: 1.305, // 绝：121%-140% 中值
  5: 1.455, // 神：141%-150% 中值
}

/** 品质名（未知品质回退凡） */
export function qualityName(quality: number): string {
  return QUALITY_NAMES[quality] ?? '凡'
}

/** 装备品质色（1-5 → --eq-q-*，独立于品阶的 QUALITY_COLORS/--rarity-*） */
export const EQUIP_QUALITY_COLORS: Record<number, string> = {
  1: 'var(--eq-q-1)',
  2: 'var(--eq-q-2)',
  3: 'var(--eq-q-3)',
  4: 'var(--eq-q-4)',
  5: 'var(--eq-q-5)',
}

/** 品质色 CSS 值（未知品质回退次要文字色） */
export function equipQualityColor(quality: number): string {
  return EQUIP_QUALITY_COLORS[quality] ?? 'var(--color-text-secondary)'
}

/** 品质 CSS 类（xy-eq-q--1..5，独立于品阶的 xy-q--N） */
export function equipQualityClass(quality: number): string {
  return `xy-eq-q--${quality}`
}

/** 品质系数（未知品质回退凡品 0.85） */
export function qualityFactorOf(quality: number): number {
  return QUALITY_FACTOR[quality] ?? 0.85
}

/** 制造时在品质区间内 roll 一个具体系数（保留到 3 位小数；设计稿 §5 区间随机） */
export function rollQualityFactor(quality: number, rng: () => number = Math.random): number {
  const r = QUALITY_FACTOR_RANGE[quality] ?? QUALITY_FACTOR_RANGE[1]
  const v = r.min + rng() * (r.max - r.min)
  return Math.round(v * 1000) / 1000
}

/** 词条数量按品质（设计稿：凡 1 / 精 2 / 超 3 / 绝 4 / 神 5） */
export function affixCountByQuality(quality: number): number {
  if (quality >= 5) return 5
  if (quality >= 4) return 4
  if (quality >= 3) return 3
  if (quality >= 2) return 2
  return 1
}

/** 品质权重表（rarity 1-3 → 凡/精/超 权重；阶位越高越高品质概率） */
const QUALITY_WEIGHTS_BY_RARITY: Record<number, number[]> = {
  1: [70, 25, 5],
  2: [30, 50, 20],
  3: [10, 50, 40],
}

/** 制造/掉落品质 roll：天品（rarity 4）固定绝、仙品（rarity 5）固定神；凡/玄/地品按阶位加权随机 1-3 */
export function rollQuality(rarity: number, rng: () => number = Math.random): number {
  if (rarity >= 5) return 5
  if (rarity >= 4) return 4
  const weights = QUALITY_WEIGHTS_BY_RARITY[rarity] ?? QUALITY_WEIGHTS_BY_RARITY[1]
  const total = weights.reduce((s, w) => s + w, 0)
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll < 0) return i + 1
  }
  return 1
}

/** 品级色（对齐 tokens.scss 的 --rarity-* 令牌，用全局令牌） */
export const QUALITY_COLORS: Record<number, string> = {
  1: 'var(--rarity-1)',
  2: 'var(--rarity-2)',
  3: 'var(--rarity-3)',
  4: 'var(--rarity-4)',
  5: 'var(--rarity-5)',
}

/** 品级名（未知品级回退凡品） */
export function qualityOf(rarity: number): XiyouQuality {
  return RARITY_NAMES[rarity] ?? '凡品'
}

/** 品级色 CSS 值（未知品级回退次要文字色） */
export function qualityColor(rarity: number): string {
  return QUALITY_COLORS[rarity] ?? 'var(--color-text-secondary)'
}

/**
 * 品级 CSS 类（xy-q--1..5，数字后缀规范化）
 * NOTE: 类名不再拼接中文品级（xy-q--凡品），改用英文数字后缀，对齐 _shared.scss 的 .rarity-N 惯例；
 *       色值映射在 xiyou.scss 的 .xy-q--* 全局类中。
 */
export function qualityClass(rarity: number): string {
  return `xy-q--${rarity}`
}

/** 品级名 → 品级 CSS 类（供按中文品级映射的场景，如洞府/碎片视图） */
export function qualityClassOf(quality: XiyouQuality): string {
  const suffix = Object.entries(RARITY_NAMES).find(([, q]) => q === quality)?.[0]
  return `xy-q--${suffix ?? '1'}`
}

/**
 * 旧版数据迁移：字段含中文品级（quality/tier，历史 seed/导入遗留）→ 数字 rarity。
 * 基于 RARITY_NAMES 反查，单一映射源。无品级字段/已是数字时原样返回。
 */
export function migrateRarityField(row: Record<string, unknown>): boolean {
  if (typeof row.rarity === 'number') return false
  const legacy = typeof row.quality === 'string' ? row.quality : row.tier
  const rarity = typeof legacy === 'string'
    ? Object.entries(RARITY_NAMES).find(([, q]) => q === legacy)?.[0]
    : undefined
  if (!rarity) return false
  row.rarity = Number(rarity)
  delete row.quality
  delete row.tier
  return true
}
