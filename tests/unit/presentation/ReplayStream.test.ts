// @vitest-environment happy-dom
/**
 * ReplayStream 事件流行标题测试
 *
 * 背景：真实录制 action_execution 的 summary 是引擎占位"X 执行行动"，事件流此前直接
 *       显示它。改造后 action_execution 行显示"名字 · 技能名"（从调试树节点解析），
 *       原始 summary 保留在 title 悬浮。
 *
 * 验证：demo 存档 action_execution 行显示"火护法 · 普通攻击"，而非占位"执行行动"。
 *
 * 运行: npx vitest run tests/unit/presentation/ReplayStream.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import ReplayStream from '@/presentation/modules/haotian/views/ReplayStream.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'

let app: App | null = null
let host: HTMLElement | null = null

async function mountStream(): Promise<HTMLElement> {
  host = document.createElement('div')
  host.style.height = '600px'
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(ReplayStream) })
  app.use(pinia)
  app.mount(host)
  const store = useHaotianStore()
  await store.loadDemo()
  await new Promise((r) => setTimeout(r, 30))
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
})

describe('ReplayStream 事件流行标题', () => {
  it('action_execution 行显示操作名（名字 · 技能名）而非占位 summary', async () => {
    const root = await mountStream()
    const text = root.textContent ?? ''
    // demo 的 action_execution summary 是"火护法 使用 [普通攻击] → 金护法·连击之心"，
    // 改造后主文本为"火护法 · 普通攻击"（仍包含"普通攻击"关键字）
    expect(text).toContain('火护法 · 普通攻击')
    // 事件流不应出现引擎占位"执行行动"
    expect(text).not.toContain('执行行动')
  })
})
