// @vitest-environment happy-dom
/**
 * EntityTooltip 悬浮卡固定（pin）状态机测试
 *
 * 覆盖：Alt 固定/再按解除、Esc 解除、点击外部解除并 hide、
 *       固定后宿主 visible=false 不消失（核心需求：鼠标移开物品仍可移入面板查看）、
 *       固定期间快照不跟随宿主 data 切换、按住 Alt 自动重复不翻转、
 *       未固定原行为（移开即消失）、延迟隐藏与「移回触发元素」的竞态。
 *
 * 宿主模拟：shallowReactive props + setProps（重新 mount 会丢组件内 pinned 状态，不可用）。
 *
 * 运行: npx vitest run tests/unit/presentation/EntityTooltip.test.ts
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, h, nextTick, shallowReactive, type App } from 'vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'

let app: App | null = null
let host: HTMLElement | null = null
let reactiveProps: Record<string, unknown> | null = null
let onHide: ReturnType<typeof vi.fn>

function item(name: string): TooltipData {
  return {
    name,
    description: `${name}的描述`,
    badge: '装备',
    details: [{ label: '品质', value: '凡品' }],
  }
}

async function mount(visible: boolean, data: TooltipData): Promise<void> {
  onHide = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  reactiveProps = shallowReactive({ visible, data, onHide })
  app = createApp({ render: () => h(EntityTooltip, reactiveProps!) })
  app.mount(host)
  await flush()
}

/** 模拟宿主更新 props（mouseenter/leave 切 visible、滑到别的物品换 data） */
async function setProps(visible: boolean, data?: TooltipData): Promise<void> {
  Object.assign(reactiveProps!, data ? { visible, data } : { visible })
  await flush()
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  reactiveProps = null
})

function tooltipEl(): HTMLElement | null {
  return document.body.querySelector('.entity-tooltip')
}

function pressKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', init))
}

/**
 * 穿过两次 nextTick + 一个真实宏任务：tooltip-fade 的 leave 过渡由 Vue
 * whenTransitionEnds 的 setTimeout 兜底收尾（happy-dom 无真实 CSS transition），
 * 只 await microtask 元素不会从 body 移除，会污染后续用例。
 */
const flush = async (): Promise<void> => {
  await nextTick()
  await nextTick()
  await new Promise((r) => setTimeout(r, 20))
}

describe('EntityTooltip 固定状态机', () => {
  it('悬浮显示：渲染内容 + 常驻固定提示', async () => {
    await mount(true, item('试炼木剑'))
    const el = tooltipEl()
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('试炼木剑')
    expect(el!.textContent).toContain('按 Alt 固定面板')
    expect(el!.classList.contains('is-pinned')).toBe(false)
  })

  it('未固定：宿主 visible 置 false 即消失（原行为不回归）', async () => {
    await mount(true, item('试炼木剑'))
    await setProps(false)
    expect(tooltipEl()).toBeNull()
  })

  it('Alt 固定：is-pinned + 提示切换为解除说明', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    const el = tooltipEl()
    expect(el).not.toBeNull()
    expect(el!.classList.contains('is-pinned')).toBe(true)
    expect(el!.textContent).toContain('已固定 · Alt 解除 / Esc 关闭')
  })

  it('固定后宿主 visible=false：面板不消失且内容保持（核心需求）', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    await setProps(false) // 模拟鼠标移开物品
    const el = tooltipEl()
    expect(el).not.toBeNull()
    expect(el!.classList.contains('is-pinned')).toBe(true)
    expect(el!.textContent).toContain('寒铁剑')
  })

  it('固定期间切换宿主 data：显示快照内容，不跟随新悬浮', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    await setProps(true, item('太虚·燃魂冠')) // 鼠标滑到另一个物品
    const el = tooltipEl()
    expect(el!.textContent).toContain('寒铁剑')
    expect(el!.textContent).not.toContain('太虚·燃魂冠')
  })

  it('固定后再按 Alt：解除；宿主不可见时面板随之消失', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    await setProps(false)
    pressKey({ key: 'Alt' })
    await flush()
    expect(tooltipEl()).toBeNull()
  })

  it('Esc 解除：面板消失且不 emit hide（鼠标仍在物品上，回到普通悬浮）', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    pressKey({ key: 'Escape' })
    await flush()
    expect(tooltipEl()).not.toBeNull() // 宿主 visible 仍 true，解除后回到普通悬浮
    expect(tooltipEl()!.classList.contains('is-pinned')).toBe(false)
    expect(onHide).not.toHaveBeenCalled()
  })

  it('Esc 解除且宿主不可见：面板消失', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    await setProps(false)
    pressKey({ key: 'Escape' })
    await flush()
    expect(tooltipEl()).toBeNull()
  })

  it('点击面板外部：解除固定并 emit hide（宿主响应后消失）', async () => {
    await mount(true, item('寒铁剑'))
    // 真实宿主的 @hide 处理就是置 visible=false（如 PackItemCard @hide="tooltipVisible = false"）
    reactiveProps!.onHide = vi.fn(() => Object.assign(reactiveProps!, { visible: false }))
    pressKey({ key: 'Alt' })
    await flush()
    window.dispatchEvent(new MouseEvent('mousedown'))
    await flush()
    expect(tooltipEl()).toBeNull()
    expect(reactiveProps!.onHide).toHaveBeenCalled()
  })

  it('点击面板内部：不解除不关闭（可移入滚动查看）', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    tooltipEl()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
    const el = tooltipEl()
    expect(el).not.toBeNull()
    expect(el!.classList.contains('is-pinned')).toBe(true)
    expect(onHide).not.toHaveBeenCalled()
  })

  it('按住 Alt（keydown 自动重复）不翻转固定状态', async () => {
    await mount(true, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    expect(tooltipEl()!.classList.contains('is-pinned')).toBe(true)
    // 按住不放的自动重复 keydown 被过滤：不会 pin→unpin 抖动
    pressKey({ key: 'Alt', repeat: true })
    await flush()
    expect(tooltipEl()!.classList.contains('is-pinned')).toBe(true)
  })

  it('未固定时按 Alt 不凭空弹出面板', async () => {
    await mount(false, item('寒铁剑'))
    pressKey({ key: 'Alt' })
    await flush()
    expect(tooltipEl()).toBeNull()
  })

  it('延迟隐藏竞态：面板移出后宿主仍 visible（鼠标已移回触发元素）则不 emit hide', async () => {
    await mount(true, item('寒铁剑'))
    vi.useFakeTimers()
    try {
      tooltipEl()!.dispatchEvent(new MouseEvent('mouseleave'))
      vi.advanceTimersByTime(250)
      expect(onHide).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('延迟隐藏：面板移出且触发元素已不可见时按 200ms 延迟 emit hide', async () => {
    await mount(true, item('寒铁剑'))
    vi.useFakeTimers()
    try {
      tooltipEl()!.dispatchEvent(new MouseEvent('mouseleave'))
      // 鼠标同时离开了物品（宿主延迟关闭模式）
      Object.assign(reactiveProps!, { visible: false })
      await nextTick()
      vi.advanceTimersByTime(250)
      expect(onHide).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
