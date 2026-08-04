/**
 * 文件: useVirtualList.ts
 * 功能: 通用虚拟列表（动态高度测量 + 视口窗口化渲染）
 * 描述: 昊天镜事件流 / 行动卡片共用同一套虚拟化逻辑。
 *       容器 display:none（模块 tab 未激活 / 模式未切换）时测量高度恒为 0，
 *       隐藏期测量直接忽略，待容器可见后由 remeasure() 显式重测。
 */

import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'

export interface UseVirtualListOptions<T extends { id: string }> {
  items: () => T[]
  /** 未测量项的预估高度 */
  estimate?: number
  gap?: number
  padding?: number
  /** remeasure 遍历的行元素选择器 */
  rowQuery?: string
  /** 行元素上的 id 属性名（measure / remeasure 匹配） */
  attr?: string
}

export interface UseVirtualListReturn<T extends { id: string }> {
  scrollRef: Ref<HTMLElement | null>
  onScroll: () => void
  updateView: () => void
  remeasure: () => void
  resetScroll: () => void
  measure: (id: string, el: HTMLElement | null) => void
  offsetOf: (id: string) => number
  totalHeight: ComputedRef<number>
  visible: ComputedRef<T[]>
}

export function useVirtualList<T extends { id: string }>(
  opts: UseVirtualListOptions<T>,
): UseVirtualListReturn<T> {
  const { items, estimate = 48, gap = 8, padding = 8, rowQuery = '.ht-vitem', attr = 'data-vid' } = opts
  const scrollRef = ref<HTMLElement | null>(null)
  const heights = new Map<string, number>()
  const layoutTick = ref(0)
  const scrollTop = ref(0)
  const viewH = ref(400)
  let layoutRaf = 0

  function updateView(): void {
    if (scrollRef.value) viewH.value = scrollRef.value.clientHeight || 400
  }

  function onScroll(): void {
    if (scrollRef.value) scrollTop.value = scrollRef.value.scrollTop
  }

  /** 高度测量（隐藏期 offsetHeight 恒 0，直接忽略，避免写坏缓存） */
  function measure(id: string, el: HTMLElement | null): void {
    if (!el) return
    const h = el.offsetHeight
    if (h <= 0) return
    if (heights.get(id) !== h) {
      heights.set(id, h)
      if (!layoutRaf) {
        layoutRaf = requestAnimationFrame(() => {
          layoutRaf = 0
          layoutTick.value++
        })
      }
    }
  }

  /** 容器从隐藏变为可见后重测已渲染项，修正隐藏期缺失 / 错误的高度缓存 */
  function remeasure(): void {
    nextTick(() => {
      const box = scrollRef.value
      if (!box || !box.offsetParent) return
      box.querySelectorAll<HTMLElement>(rowQuery).forEach((el) => {
        const id = el.getAttribute(attr)
        if (id) measure(id, el)
      })
    })
  }

  function resetScroll(): void {
    scrollTop.value = 0
    if (scrollRef.value) scrollRef.value.scrollTop = 0
    nextTick(updateView)
  }

  function offsetOf(id: string): number {
    void layoutTick.value
    let y = padding
    for (const it of items()) {
      if (it.id === id) return y
      y += (heights.get(it.id) ?? estimate) + gap
    }
    return y
  }

  const totalHeight = computed(() => {
    void layoutTick.value
    let y = padding
    for (const it of items()) y += (heights.get(it.id) ?? estimate) + gap
    return y + padding
  })

  const visible = computed(() => {
    void layoutTick.value
    const st = scrollTop.value
    const vh = viewH.value
    const out: T[] = []
    let y = padding
    for (const it of items()) {
      const h = heights.get(it.id) ?? estimate
      if (y + h >= st - 240 && y <= st + vh + 240) out.push(it)
      y += h + gap
    }
    return out
  })

  return { scrollRef, onScroll, updateView, remeasure, resetScroll, measure, offsetOf, totalHeight, visible }
}
