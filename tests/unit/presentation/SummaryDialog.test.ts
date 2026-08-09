// @vitest-environment happy-dom
/**
 * SummaryDialog 战斗摘要测试（问题 1：七层模型只展示一半）
 *
 * 背景：此前 SummaryDialog 只画 L1-L3（toolbar 结果 / 阵营对比 / 单位贡献），
 *       L4 判定健康度 / L5 技能使用 / L6 被动触发 / L7 关键事件只存在于
 *       Markdown 导出，UI 表格缺失。
 *
 * 验证：demo 存档下摘要弹窗渲染全部七层区块。
 *
 * 运行: npx vitest run tests/unit/presentation/SummaryDialog.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import SummaryDialog from '@/presentation/modules/haotian/components/SummaryDialog.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'

let app: App | null = null
let host: HTMLElement | null = null

async function mountDialog(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(SummaryDialog, { open: true }) })
  app.use(pinia)
  app.mount(host)
  const store = useHaotianStore()
  await store.loadDemo()
  await new Promise((r) => setTimeout(r, 30))
  // Dialog 内容 Teleport 到 body，从 body 查内容
  return document.body
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('SummaryDialog 七层模型完整展示', () => {
  it('L4 判定健康度：攻击/命中/暴击/闪避/抵抗 汇总呈现', async () => {
    const root = await mountDialog()
    const text = root.textContent ?? ''
    expect(text).toContain('战斗摘要')
    expect(text).toContain('判定健康度')
    expect(text).toContain('攻击 2') // demo 2 次行动（ev04 / ev10）
    expect(text).toContain('命中')
    expect(text).toContain('暴击')
    expect(text).toContain('闪避')
    expect(text).toContain('抵抗')
  })

  it('L5 技能使用表渲染', async () => {
    const root = await mountDialog()
    const text = root.textContent ?? ''
    expect(text).toContain('技能使用')
    // demo 无 skillName → 归"未标记技能"
    expect(text).toContain('未标记技能')
    expect(text).toContain('占比')
  })

  it('L6 被动触发表渲染', async () => {
    const root = await mountDialog()
    const text = root.textContent ?? ''
    expect(text).toContain('被动触发')
    // demo 复仇怒火触发 1 次
    expect(text).toContain('复仇怒火')
    expect(text).toContain('火护法')
  })

  it('L7 关键事件列表渲染（首杀/击杀/最高单次）', async () => {
    const root = await mountDialog()
    const text = root.textContent ?? ''
    expect(text).toContain('关键事件')
    expect(text).toContain('首杀')
    expect(text).toContain('单次造成')
  })
})
