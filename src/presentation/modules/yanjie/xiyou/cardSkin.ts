/**
 * 卡片视觉皮肤（调试面板「样式」分类切换，当前消费方：xy-beast-card 伴灵卡）
 *
 * NOTE: 皮肤只改视觉层（边框/底纹/hover），不动 DOM 结构与布局——任何沿用
 *       「品质描边 + 上浮外圈」范式的卡片加一行皮肤类即可接入。
 *       选中即全局生效并持久化 localStorage（刷新保持，方便调试对比后定稿）。
 */
import { ref } from 'vue'

export const CARD_SKINS = [
  { id: 'classic', label: '经典 · 底纹', desc: '品质描边 + 双点底纹 + 悬浮外圈（现状）' },
  { id: 'ink', label: '水墨 · 竖章', desc: '纸面无框 + 品质竖条，悬停竖条延展' },
  { id: 'gilt', label: '鎏金 · 流光', desc: '品质微光细边，悬停流光扫过' },
  { id: 'jade', label: '玉牌 · 双环', desc: '圆角双线框，悬停玉色柔光' },
  { id: 'seal', label: '印版 · 硬影', desc: '直角版画风，悬停品质硬投影' },
] as const

export type CardSkinId = (typeof CARD_SKINS)[number]['id']

const STORAGE_KEY = 'xy-card-skin'

function restoreSkin(): CardSkinId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as CardSkinId | null
    if (saved && CARD_SKINS.some((s) => s.id === saved)) return saved
  } catch {
    // localStorage 不可用时回退经典
  }
  return 'classic'
}

const skin = ref<CardSkinId>(restoreSkin())

export function cardSkin(): CardSkinId {
  return skin.value
}

export function setCardSkin(id: CardSkinId): void {
  skin.value = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 持久化失败内存态仍可用
  }
}

/** 当前皮肤类名（classic 为默认态不加类；挂在卡片根元素上） */
export function cardSkinClass(): string {
  return skin.value === 'classic' ? '' : `xy-skin--${skin.value}`
}
