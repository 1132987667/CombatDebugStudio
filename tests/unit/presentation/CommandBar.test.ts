// @vitest-environment happy-dom
/**
 * CommandBar 数据源下拉渲染测试
 *
 * 背景：唤灵台保存战斗记录成功（如「如梦令051」），但用户展开顶部数据源下拉看不到记录。
 *       修复后数据源下拉直接列出所有已保存记录（分组「已保存的战斗记录」），展开自动刷新。
 *
 * 验证：mock 容器返回保存记录 → 展开下拉 → 面板渲染出词牌名记录项。
 *
 * 运行: npx vitest run tests/unit/presentation/CommandBar.test.ts
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

const { mockBs, mockContainer } = vi.hoisted(() => {
  const mockBs = {
    getSavedBattleRecordingsList: async () => ['battle_recording_b1_1700000000000'],
    loadBattleRecording: async (k: string) => ({
      battleId: 'b1',
      name: '如梦令051',
      startTime: Date.now(),
      saveKey: k,
      traceEvents: [],
      events: [],
    }),
    deleteBattleRecording: async () => true,
  }
  const mockContainer = {
    resolve: (key: string): unknown => {
      if (key === 'Symbol(BattleSystem)') return mockBs
      throw new Error(`unmocked container key: ${key}`)
    },
  }
  return { mockBs, mockContainer }
})

vi.mock('@/infrastructure/di/Container', () => ({ container: mockContainer }))

vi.mock('@/presentation/modules/haotian/components/BreakpointDialog.vue', () => ({
  default: { props: ['open'], template: '<div class="stub-bp" />' },
}))
vi.mock('@/presentation/modules/haotian/components/DiffDialog.vue', () => ({
  default: { props: ['open'], template: '<div class="stub-diff" />' },
}))
vi.mock('@/presentation/modules/haotian/components/SummaryDialog.vue', () => ({
  default: { props: ['open'], template: '<div class="stub-sum" />' },
}))
vi.mock('@/presentation/modules/haotian/components/RecordManagerDialog.vue', () => ({
  default: { props: ['modelValue'], template: '<div class="stub-rm" />' },
}))

import CommandBar from '@/presentation/modules/haotian/views/CommandBar.vue'

let app: App | null = null
let host: HTMLElement | null = null

async function mountCommandBar(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(CommandBar) })
  app.use(pinia)
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
})

beforeEach(() => {
  localStorage.clear()
})

describe('CommandBar 数据源下拉', () => {
  it('展开下拉后渲染出已保存的战斗记录（如梦令051）', async () => {
    const root = await mountCommandBar()

    // 展开数据源下拉 → 触发 visible-change → refreshRecordings
    const trigger = root.querySelector('.t-select__trigger') as HTMLElement
    expect(trigger).toBeTruthy()
    trigger.click()

    // 等待 refreshRecordings 异步 + 面板渲染（Teleport 到 body）
    await new Promise((r) => setTimeout(r, 80))

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('如梦令051')
    expect(bodyText).toContain('已保存的战斗记录')
  })

  it('未保存任何记录时展开下拉不渲染记录分组', async () => {
    mockBs.getSavedBattleRecordingsList = async () => []
    const root = await mountCommandBar()

    const trigger = root.querySelector('.t-select__trigger') as HTMLElement
    trigger.click()
    await new Promise((r) => setTimeout(r, 80))

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toContain('已保存的战斗记录')
  })
})
