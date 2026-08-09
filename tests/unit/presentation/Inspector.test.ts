// @vitest-environment happy-dom
/**
 * Inspector 检视器头部测试
 *
 * 背景：action_execution 事件的 summary 是引擎占位"X 执行行动"，检视器头部此前直接
 *       显示它 + 事件 ID + 关联编码（无用信息堆砌）。改造后主标题显示"名字 · 技能名"
 *       （从调试树节点解析），事件 ID / 因果链 / 占位 summary 退到悬浮提示。
 *
 * 验证：选中 action_execution 事件后，主标题为"火护法 · 普通攻击"，不出现事件 ID 占位。
 *
 * 运行: npx vitest run tests/unit/presentation/Inspector.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import Inspector from '@/presentation/modules/haotian/views/Inspector.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'

let app: App | null = null
let host: HTMLElement | null = null

async function mountInspector(eventId?: string, props: Record<string, unknown> = {}): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(Inspector, props) })
  app.use(pinia)
  app.mount(host)
  const store = useHaotianStore()
  await store.loadDemo()
  if (eventId) store.selectEvent(eventId)
  await new Promise((r) => setTimeout(r, 20))
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
  localStorage.removeItem('haotian.insp-sections.v1')
})

describe('Inspector 检视器头部', () => {
  it('action_execution 事件主标题显示操作名（名字 · 技能名）', async () => {
    const root = await mountInspector('ev04') // 火护法 普通攻击
    const main = root.querySelector('.ht-insp-main')
    expect(main?.textContent).toBe('火护法 · 普通攻击')
  })

  it('事件 ID / 关联编码不再作为可见头部信息（退到 title 悬浮）', async () => {
    const root = await mountInspector('ev04')
    const text = root.textContent ?? ''
    // 头部不应直接显示事件 ID 与关联编码
    expect(text).not.toContain('事件 ev04')
    expect(text).not.toContain('关联 corr_1_1')
  })

  it('伤害计算事件：主标题显示阶段标签，summary 移至次级行不重复', async () => {
    const root = await mountInspector('ev05') // 第 1 段 · 暴击 113 伤害
    const main = root.querySelector('.ht-insp-main')
    expect(main?.textContent).toBe('伤害计算')
    // 主标题不再重复 summary；summary 完整落在次级行
    expect(main?.textContent).not.toContain('第 1 段')
    expect(root.querySelector('.ht-insp-corr')?.textContent).toBe('第 1 段 · 暴击 113 伤害')
  })

  it('显式传入 event prop 时优先显示该事件，真实录制"伤害计算 "前缀被剥离', async () => {
    const fake: UnifiedEvent = {
      id: 'x1', phase: 'damage_calculation', correlationId: 'c', timestamp: 100,
      payload: { result: 57, steps: [] },
      summary: '伤害计算 金刚护法将领→佛门叛徒侍从 最终伤害 57',
    }
    const root = await mountInspector('ev04', { event: fake }) // 同时 store 选中 ev04，prop 应覆盖
    expect(root.querySelector('.ht-insp-main')?.textContent).toBe('伤害计算')
    expect(root.querySelector('.ht-insp-corr')?.textContent).toBe('金刚护法将领→佛门叛徒侍从 最终伤害 57')
  })

  it('载荷字段：普攻 skillType=undefined 不渲染，category 显示中文文本', async () => {
    // 普通攻击路径无技能对象，TraceDamageLogger 发射的 payload.skillType 为 undefined；
    // category 是 'physical' 原始值，应显示为"物理"而非英文 key/值。
    localStorage.setItem('haotian.insp-sections.v1', JSON.stringify({ kv: true }))
    const fake: UnifiedEvent = {
      id: 'd1', phase: 'damage_calculation', correlationId: 'c', timestamp: 100,
      payload: { skillName: '普通攻击', skillType: undefined, category: 'physical', result: 24 },
      summary: '伤害计算 火护法→金护法 最终伤害 24',
    }
    const root = await mountInspector('ev04', { event: fake })
    const text = root.textContent ?? ''
    expect(text).toContain('伤害类型')
    expect(text).toContain('物理')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('技能类型')
    expect(text).not.toContain('skillType')
  })

  it('载荷字段：actionType / energyCost 使用中文标签，actionType 枚举值译成中文', async () => {
    localStorage.setItem('haotian.insp-sections.v1', JSON.stringify({ kv: true }))
    const fake: UnifiedEvent = {
      id: 'a1', phase: 'action_execution', correlationId: 'c', timestamp: 100,
      payload: { actionType: 'skill', energyCost: 50, controlMode: 'ai' },
      summary: '火护法 使用 [烈焰斩] → 金护法',
    }
    const root = await mountInspector('ev04', { event: fake })
    const text = root.textContent ?? ''
    expect(text).toContain('行动类型')
    expect(text).toContain('技能')
    expect(text).toContain('能量消耗')
    expect(text).toContain('50')
    // 原始英文键名 / 枚举值不再直接裸露
    expect(text).not.toContain('actionType')
    expect(text).not.toContain('energyCost')
  })
})
