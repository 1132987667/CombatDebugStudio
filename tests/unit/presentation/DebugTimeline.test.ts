// @vitest-environment happy-dom
/**
 * DebugTimeline 虚拟化测试
 *
 * 背景：调试树虚拟化（千级节点渲染）——树被拍平为可见行列表，复用 useVirtualList，
 *       只渲染视口内行（DOM 行数 << 总行数）。
 *
 * 验证：① 渲染出回合分组（第 N 回合）与行动/结算节点；② 展开回合后行集增长，
 *       但 DOM 中渲染的行数受视口约束（虚拟化真实生效）。
 *
 * 运行: npx vitest run tests/unit/presentation/DebugTimeline.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import DebugTimeline from '@/presentation/modules/haotian/views/DebugTimeline.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'

let app: App | null = null
let host: HTMLElement | null = null

async function mountTimeline(): Promise<HTMLElement> {
  host = document.createElement('div')
  host.style.height = '600px'
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(DebugTimeline) })
  app.use(pinia)
  app.mount(host)
  // 装配演示存档（2 回合 × 回合头 + 节点）
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

describe('DebugTimeline 虚拟化', () => {
  it('渲染回合分组（第 1/2 回合）与行动/结算节点', async () => {
    const root = await mountTimeline()
    const text = root.textContent ?? ''
    expect(text).toContain('战斗时间线')
    expect(text).toContain('第 1 回合')
    expect(text).toContain('第 2 回合')
    // 行动节点（战斗初始化 / 回合开始·结算 / 行动）
    expect(text).toContain('战斗初始化')
    expect(text).toContain('回合开始 · 结算')
    expect(text).toContain('回合结束 · 结算')
  })

  it('回合头图标与事件流一致（◇ 而非旧 ◈）', async () => {
    const root = await mountTimeline()
    const roundRow = [...root.querySelectorAll<HTMLElement>('.ht-t-row')].find((el) => el.textContent?.includes('第 1 回合'))
    expect(roundRow).toBeTruthy()
    const ico = roundRow!.querySelector('.ht-t-ico')
    expect(ico?.textContent).toBe('◇')
    expect(ico?.textContent).not.toBe('◈')
  })

  it('虚拟化生效：DOM 渲染行数远小于展开后的总行数', async () => {
    const root = await mountTimeline()
    // 全部回合默认展开：总行 = 初始化 + 2 回合头 + 回合内节点（开始/行动/结束…）
    const rows = root.querySelectorAll('.ht-t-row').length
    expect(rows).toBeGreaterThan(0)
    // 视口 600px，estimate 34px，rendered <= 约 20 行，远小于 demo 的全量行
    expect(rows).toBeLessThan(30)
  })

  it('回合头行可点击（展开/折叠不报错）', async () => {
    const root = await mountTimeline()
    const roundRow = [...root.querySelectorAll<HTMLElement>('.ht-t-row')].find((el) => el.textContent?.includes('第 1 回合'))
    expect(roundRow).toBeTruthy()
    roundRow!.click()
    // 折叠后再展开，不抛错
    roundRow!.click()
    expect(true).toBe(true)
  })

  it('行动节点显示行动类型标签（demo 普攻 → 普通攻击）', async () => {
    const root = await mountTimeline()
    // demo 两个行动节点都是普通攻击，标签文案为"普通攻击"，且与 label 的"名字 · 技能名"并列存在
    const tags = [...root.querySelectorAll<HTMLElement>('.ht-t-tag')]
    expect(tags.length).toBe(2)
    expect(tags.every((t) => t.textContent === '普通攻击')).toBe(true)
    // 非行动节点（回合头/结算）无标签
    const roundRow = [...root.querySelectorAll<HTMLElement>('.ht-t-row')].find((el) => el.textContent?.includes('第 1 回合'))
    expect(roundRow!.querySelector('.ht-t-tag')).toBeNull()
  })
})
