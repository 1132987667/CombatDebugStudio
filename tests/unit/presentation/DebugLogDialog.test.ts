// @vitest-environment happy-dom
/**
 * DebugLogDialog 实时流视图特征测试（文档 §7 P2）
 *
 * 覆盖：实时流 tab 渲染 TraceEvent 流、文本过滤、phase 过滤（level/battleId 同机制，由 phase 用例代表）。
 * 运行: npx vitest run tests/unit/presentation/DebugLogDialog.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import DebugLogDialog from '@/presentation/views/components/DebugLogDialog.vue'
import {
  createTraceEvent,
  TracePhase,
  type TraceEvent,
} from '@/shared/types/trace-event'

function makeEvent(
  id: string,
  phase: TracePhase,
  summary: string,
  extra: Partial<TraceEvent> = {},
): TraceEvent {
  return createTraceEvent({ id, correlationId: `corr_${id}`, phase, summary, ...extra })
}

const THREE_EVENTS: TraceEvent[] = [
  makeEvent('e1', TracePhase.DAMAGE_CALCULATION, '伤害计算 剑士→史莱姆 100→85'),
  makeEvent('e2', TracePhase.AI_DECISION, 'AI决策 剑士 选择【烈焰斩】', { battleId: 'b1' }),
  makeEvent('e3', TracePhase.BUFF_LIFECYCLE, '施加【先发制人】→ 剑士', { battleId: 'b2' }),
]

let app: App | null = null
let host: HTMLElement | null = null

function mount(traceEvents: TraceEvent[] = THREE_EVENTS) {
  const open = ref(true)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(DebugLogDialog, {
        modelValue: open.value,
        logs: [],
        traceEvents,
        'onUpdate:modelValue': (v: boolean) => {
          open.value = v
        },
      }),
  })
  app.mount(host)
}

function unmount() {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
}

/** 切换到"实时流"tab（Dialog 内容 Teleport 到 body） */
async function switchToStreamTab() {
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('button.tabs-tab')).find(
    (b) => b.textContent?.includes('实时流'),
  )
  expect(tab, '实时流 tab 按钮应存在').toBeTruthy()
  tab!.click()
  await nextTick()
}

beforeEach(() => mount())
afterEach(() => unmount())

describe('DebugLogDialog 实时流视图', () => {
  it('渲染 TraceEvent 流（每条一个 stream-item）', async () => {
    await switchToStreamTab()
    expect(document.querySelectorAll('.stream-item')).toHaveLength(3)
  })

  it('文本过滤：关键词命中 summary 时只保留匹配行', async () => {
    await switchToStreamTab()

    const input = document.querySelector<HTMLInputElement>('input.filter-input')
    expect(input).toBeTruthy()
    input!.value = '伤害'
    input!.dispatchEvent(new Event('input'))
    await nextTick()

    expect(document.querySelectorAll('.stream-item')).toHaveLength(1)
    expect(document.querySelector('.stream-summary')?.textContent).toContain('伤害计算')
  })

  it('phase 过滤：选择 ai_decision 后只保留 AI 决策行', async () => {
    await switchToStreamTab()

    const selects = document.querySelectorAll<HTMLSelectElement>('select.filter-select')
    // 顺序：level / phase / battleId
    expect(selects.length).toBeGreaterThanOrEqual(2)
    selects[1].value = TracePhase.AI_DECISION
    selects[1].dispatchEvent(new Event('change'))
    await nextTick()

    const items = document.querySelectorAll('.stream-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('AI决策')
  })

  it('battleId 过滤：选择 b1 后只保留该战斗的事件', async () => {
    await switchToStreamTab()

    const selects = document.querySelectorAll<HTMLSelectElement>('select.filter-select')
    selects[2].value = 'b1'
    selects[2].dispatchEvent(new Event('change'))
    await nextTick()

    const items = document.querySelectorAll('.stream-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('AI决策')
  })

  it('导出 JSON 按钮存在（TraceEvent[] 全量导出，验收故事 D）', async () => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.dialog-download'))
    expect(buttons.some((b) => b.textContent?.includes('导出 JSON'))).toBe(true)
  })
})
