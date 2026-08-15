// @vitest-environment happy-dom
/**
 * PackPanel 左右双栏互斥测试
 *
 * 覆盖：左边为主——左可自由切换任意页签；右被左占用的页签禁用（不可抢左）；
 *       左切到右当前页签时右自动让位到下一个可用页签。
 *
 * 运行: npx vitest run tests/unit/presentation/PackPanel.test.ts
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'

const { __mem, __storage } = vi.hoisted(() => {
  const mem = new Map<string, Map<string, unknown>>()
  return {
    __mem: mem,
    __storage: {
      async get(store: string, key: string): Promise<unknown> {
        return mem.get(store)?.get(key) ?? null
      },
      async set(store: string, key: string, value: unknown): Promise<boolean> {
        if (!mem.has(store)) mem.set(store, new Map())
        mem.get(store)!.set(key, value)
        return true
      },
    },
  }
})

vi.mock('@/infrastructure/adapters/storage', () => ({ persistentStorage: __storage }))

vi.mock('@/presentation/components/Dialog.vue', () => ({
  default: { props: ['modelValue', 'title', 'width'], template: '<div class="stub-dialog" />' },
}))
vi.mock('@/presentation/components/ConfirmDialog.vue', () => ({
  default: { props: ['modelValue', 'title', 'message', 'confirmText', 'danger'], template: '<div class="stub-confirm" />' },
}))
vi.mock('@/presentation/components/EmptyState.vue', () => ({
  default: { template: '<div class="stub-empty" />' },
}))
vi.mock('@/presentation/modules/yanjie/xiyou/components/PackItemDetail.vue', () => ({
  default: { props: ['itemId', 'count'], template: '<div class="stub-detail" />' },
}))
vi.mock('@/presentation/modules/yanjie/xiyou/components/PackItemCard.vue', () => ({
  default: { props: ['item', 'count', 'selected'], template: '<div class="stub-card" />' },
}))

import PackPanel from '@/presentation/modules/yanjie/xiyou/components/PackPanel.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mountPackPanel(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(PackPanel) })
  app.use(pinia)
  app.mount(host)
  return new Promise((r) => setTimeout(() => r(host!), 30))
}

function paneTabs(root: HTMLElement, paneIdx: number): HTMLElement[] {
  const panes = root.querySelectorAll('.xy-pack-pane')
  const pane = panes[paneIdx] as HTMLElement
  return Array.from(pane.querySelectorAll('[role="tab"]')) as HTMLElement[]
}

function selectedOf(root: HTMLElement, paneIdx: number): string {
  const tabs = paneTabs(root, paneIdx)
  const idx = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')
  return tabs[idx]?.textContent ?? ''
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
  __mem.clear()
})

beforeEach(() => {
  localStorage.clear()
})

describe('PackPanel 左右双栏（左边为主）', () => {
  it('初始：左背包/右仓库，右的背包被左占用而禁用，左的仓库可用（左自由）', async () => {
    const root = await mountPackPanel()
    const left = paneTabs(root, 0)
    const right = paneTabs(root, 1)

    // 左占背包 → 右的背包禁用（右不能抢左）
    expect(right[0].textContent).toContain('背包')
    expect(right[0].hasAttribute('disabled')).toBe(true)
    // 左自由：左的仓库可用（不会被右的仓库占用而禁用）
    expect(left[1].hasAttribute('disabled')).toBe(false)
    // 坊市两侧均可
    expect(left[2].hasAttribute('disabled')).toBe(false)
    expect(right[2].hasAttribute('disabled')).toBe(false)
  })

  it('左切到仓库（与右冲突）→ 右自动让位到下一个可用页签', async () => {
    const root = await mountPackPanel()
    const left = paneTabs(root, 0)

    left[1].click() // 左切仓库，右已在仓库 → 右让位
    await nextTick()

    // 左在仓库，右让位到背包
    expect(selectedOf(root, 0)).toContain('仓库')
    expect(selectedOf(root, 1)).toContain('背包')
    // 右的仓库被左占用 → 禁用
    expect(paneTabs(root, 1)[1].hasAttribute('disabled')).toBe(true)
    // 左不再占背包 → 右背包激活可用
    expect(paneTabs(root, 1)[0].hasAttribute('disabled')).toBe(false)
  })

  it('左切到坊市（不与右冲突）→ 右不动，仅右的坊市禁用', async () => {
    const root = await mountPackPanel()
    const left = paneTabs(root, 0)
    const right = paneTabs(root, 1)

    left[2].click() // 左切坊市，右在仓库，不冲突
    await nextTick()

    expect(selectedOf(root, 0)).toContain('坊市')
    expect(selectedOf(root, 1)).toContain('仓库')
    // 左占坊市 → 右的坊市禁用；右的仓库仍激活
    expect(right[2].hasAttribute('disabled')).toBe(true)
    expect(right[1].getAttribute('aria-selected')).toBe('true')
  })

  it('右点击被左占用的页签无效（右不能抢左）', async () => {
    const root = await mountPackPanel()
    const right = paneTabs(root, 1)

    right[0].click() // 右试图切背包（被左占用）
    await nextTick()

    expect(selectedOf(root, 1)).toContain('仓库')
    expect(selectedOf(root, 0)).toContain('背包')
  })
})
