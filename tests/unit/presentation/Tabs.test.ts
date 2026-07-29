// @vitest-environment jsdom
/**
 * Tabs 组件特征测试
 *
 * 覆盖：渲染、ARIA 语义、点击/键盘交互、禁用跳过、徽章、
 *       面板保活/销毁、非法 modelValue 回退、指示条。
 *
 * 运行: npx vitest run tests/unit/presentation/Tabs.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
// NOTE: 此 import 同时验证了 F1 的修复 —— 类型从独立 <script> 块导出
import Tabs, { type TabItem } from '@/presentation/components/Tabs.vue'

const TABS: TabItem[] = [
  { id: 'a', label: '页签A', count: 3 },
  { id: 'b', label: '页签B' },
  { id: 'c', label: '页签C', disabled: true },
  { id: 'd', label: '页签D', count: 0 },
]

let app: App | null = null
let host: HTMLElement | null = null

function mount(options: {
  tabs?: TabItem[]
  initial?: string
  destroyInactive?: boolean
  equalWidth?: boolean
  size?: 'md' | 'sm'
} = {}) {
  const active = ref(options.initial ?? 'a')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(
        Tabs,
        {
          tabs: options.tabs ?? TABS,
          modelValue: active.value,
          destroyInactive: options.destroyInactive ?? false,
          equalWidth: options.equalWidth ?? false,
          size: options.size ?? 'md',
          'onUpdate:modelValue': (v: string) => {
            active.value = v
          },
        },
        {
          a: () => h('div', { class: 'panel-a' }, '内容A'),
          b: () => h('div', { class: 'panel-b' }, '内容B'),
          d: () => h('div', { class: 'panel-d' }, '内容D'),
        },
      ),
  })
  app.mount(host)
  return { active, root: host }
}

function getTabs(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll('[role="tab"]')) as HTMLElement[]
}

function pressKey(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
  host = null
})

describe('Tabs 渲染与 ARIA', () => {
  it('渲染全部页签文本与 role=tab', () => {
    const { root } = mount()
    const tabs = getTabs(root)
    expect(tabs.length).toBe(4)
    expect(tabs[0].textContent).toContain('页签A')
    expect(root.querySelector('[role="tablist"]')).not.toBeNull()
  })

  it('激活页签 aria-selected=true 且 tabindex=0，其余 -1；aria-controls 关联面板', () => {
    const { root } = mount()
    const tabs = getTabs(root)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')
    const panelId = tabs[0].getAttribute('aria-controls')!
    const panel = root.querySelector(`#${panelId}`)!
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('role')).toBe('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
  })

  it('徽章：count 定义即显示（含 0），未定义不显示', () => {
    const { root } = mount()
    const badges = root.querySelectorAll('.tabs-badge')
    expect(badges.length).toBe(2)
    expect(badges[0].textContent).toBe('3')
    expect(badges[1].textContent).toBe('0')
  })

  it('size/equalWidth 反映为根节点 class', () => {
    const { root } = mount({ size: 'sm', equalWidth: true })
    expect(root.querySelector('.tabs-root--sm')).not.toBeNull()
    expect(root.querySelector('.tabs-root--equal')).not.toBeNull()
  })
})

describe('Tabs 交互', () => {
  it('点击页签触发 v-model 更新', async () => {
    const { root, active } = mount()
    getTabs(root)[1].click()
    await nextTick()
    expect(active.value).toBe('b')
  })

  it('禁用页签点击无效', async () => {
    const { root, active } = mount()
    getTabs(root)[2].click()
    await nextTick()
    expect(active.value).toBe('a')
  })

  it('ArrowRight 跳过禁用页签', async () => {
    const { root, active } = mount({ initial: 'b' })
    await nextTick()
    pressKey(getTabs(root)[1], 'ArrowRight')
    await nextTick()
    expect(active.value).toBe('d') // c 被跳过
  })

  it('ArrowRight 在末尾循环回首个', async () => {
    const { root, active } = mount({ initial: 'd' })
    await nextTick()
    pressKey(getTabs(root)[3], 'ArrowRight')
    await nextTick()
    expect(active.value).toBe('a')
  })

  it('Home/End 跳转首尾可用页签', async () => {
    const { root, active } = mount({ initial: 'b' })
    await nextTick()
    pressKey(getTabs(root)[1], 'End')
    await nextTick()
    expect(active.value).toBe('d')
    pressKey(getTabs(root)[3], 'Home')
    await nextTick()
    expect(active.value).toBe('a')
  })

  it('非法 modelValue 回退到首个可用页签', () => {
    const { root } = mount({ initial: 'nonexistent' })
    const tabs = getTabs(root)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })
})

describe('Tabs 面板', () => {
  it('默认保活：非激活面板挂载但隐藏，点击激活后内容可见', async () => {
    const { root } = mount()
    const panelB = root.querySelector('.panel-b') as HTMLElement
    expect(panelB).not.toBeNull()
    getTabs(root)[1].click()
    await nextTick()
    expect(panelB.textContent).toBe('内容B')
  })

  it('destroyInactive：非激活面板不挂载', () => {
    const { root } = mount({ destroyInactive: true })
    expect(root.querySelector('.panel-b')).toBeNull()
    expect(root.querySelector('.panel-a')).not.toBeNull()
  })
})

describe('Tabs 指示条', () => {
  it('激活页签存在时指示条可见（jsdom 布局为 0，断言存在性）', async () => {
    const { root } = mount()
    await nextTick()
    await nextTick() // onMounted 内的 nextTick(updateIndicator)
    const indicator = root.querySelector('.tabs-indicator') as HTMLElement
    expect(indicator).not.toBeNull()
    expect(indicator.style.opacity).toBe('1')
  })
})
