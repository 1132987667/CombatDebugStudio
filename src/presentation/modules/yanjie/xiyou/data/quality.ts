/**
 * 稀有度 / 品质 · 统一映射表（方案 4：稀有度与品质体系统一化）
 *
 * NOTE: 数据层一律存数字 rarity（1-5），展示层经本表映射中文。全库唯一映射源：
 *       RARITY_TO_QUALITY（品级）与 AFFIX_QUALITY（词缀品质）为两个正交维度，
 *       避免「凡品」与「凡」等概念混淆；多组件共用品级名/品级色/品级类，集中于此不重复。
 *       QUALITY_COLORS 用全局 --color-* 令牌——弹窗/悬浮等 Teleport 到 body 时 --xy-* 不可用。
 */
import type { XiyouQuality } from './mock'

/** 品级（rarity 1-5 → 凡品/玄品/地品/天品/仙品） */
export const RARITY_TO_QUALITY: Record<number, XiyouQuality> = {
  1: '凡品',
  2: '玄品',
  3: '地品',
  4: '天品',
  5: '仙品',
}

/** 词缀品质（1-5 → 凡/精/超/绝/神，与品级正交的独立维度；词条系统未落地，先声明数据源） */
export const AFFIX_QUALITY: Record<number, string> = {
  1: '凡',
  2: '精',
  3: '超',
  4: '绝',
  5: '神',
}

/** 品级色（对齐 xiyou.scss 的 xy-q--* 映射，用全局令牌） */
export const QUALITY_COLORS: Record<number, string> = {
  1: 'var(--color-text-disabled)',
  2: 'var(--color-success)',
  3: 'var(--color-skill-active)',
  4: 'var(--color-debuff)',
  5: 'var(--color-warning)',
}

/** 品级名（未知品级回退凡品） */
export function qualityOf(rarity: number): XiyouQuality {
  return RARITY_TO_QUALITY[rarity] ?? '凡品'
}

/** 品级色 CSS 值（未知品级回退次要文字色） */
export function qualityColor(rarity: number): string {
  return QUALITY_COLORS[rarity] ?? 'var(--color-text-secondary)'
}

/** 品级 CSS 类（xy-q--凡品 等，对齐 xiyou.scss） */
export function qualityClass(rarity: number): string {
  return `xy-q--${qualityOf(rarity)}`
}

/**
 * 旧版数据迁移：字段含中文品级（quality/tier，历史 seed/导入遗留）→ 数字 rarity。
 * 基于 RARITY_TO_QUALITY 反查，单一映射源。无品级字段/已是数字时原样返回。
 */
export function migrateRarityField(row: Record<string, unknown>): boolean {
  if (typeof row.rarity === 'number') return false
  const legacy = typeof row.quality === 'string' ? row.quality : row.tier
  const rarity = typeof legacy === 'string'
    ? Object.entries(RARITY_TO_QUALITY).find(([, q]) => q === legacy)?.[0]
    : undefined
  if (!rarity) return false
  row.rarity = Number(rarity)
  delete row.quality
  delete row.tier
  return true
}
