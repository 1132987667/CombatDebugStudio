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

let app: App | null = null
let host: HTMLElement | null = null

async function mountInspector(eventId: string): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(Inspector) })
  app.use(pinia)
  app.mount(host)
  const store = useHaotianStore()
  await store.loadDemo()
  store.selectEvent(eventId)
  await new Promise((r) => setTimeout(r, 20))
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
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
})
