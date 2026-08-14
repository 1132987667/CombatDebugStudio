/**
 * 行囊/物品展示 · 品阶工具（凡/玄/地/天/仙）
 *
 * NOTE: 品阶名与品阶色多组件共用（卡片/tooltip/详情弹窗/快捷栏），集中于此避免重复。
 *       QUALITY_COLORS 用全局 --color-* 令牌——弹窗/悬浮等 Teleport 到 body 时 --xy-* 不可用。
 */

/** 品阶名（rarity 1-5 → 凡品/玄品/地品/天品/仙品，索引 0 留空） */
export const QUALITY = ['', '凡品', '玄品', '地品', '天品', '仙品']

/** 品阶色（对齐 xiyou.scss 的 xy-q--* 映射，用全局令牌） */
export const QUALITY_COLORS: Record<number, string> = {
  1: 'var(--color-text-disabled)',
  2: 'var(--color-success)',
  3: 'var(--color-skill-active)',
  4: 'var(--color-debuff)',
  5: 'var(--color-warning)',
}

export function qualityOf(rarity: number): string {
  return QUALITY[rarity] ?? '凡品'
}

/** 品阶色 CSS 值（未知品阶回退次要文字色） */
export function qualityColor(rarity: number): string {
  return QUALITY_COLORS[rarity] ?? 'var(--color-text-secondary)'
}
