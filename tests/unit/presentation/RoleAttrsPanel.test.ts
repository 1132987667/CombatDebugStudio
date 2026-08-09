// @vitest-environment happy-dom
/**
 * RoleAttrsPanel 角色属性面板测试
 *
 * 功能：检视面板第二栏——目标角色 / 行动角色 两个 tab，展示初始属性快照。
 * 验证：默认目标 tab 显示被攻击者属性；切行动 tab 显示攻击者；无事件/无属性降级文案。
 *
 * 运行: npx vitest run tests/unit/presentation/RoleAttrsPanel.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import RoleAttrsPanel from '@/presentation/modules/haotian/views/RoleAttrsPanel.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'

let app: App | null = null
let host: HTMLElement | null = null

async function mountPanel(eventId?: string): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(RoleAttrsPanel) })
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
})

describe('RoleAttrsPanel 角色属性面板', () => {
  it('默认目标 tab：显示被攻击角色（targetId）属性', async () => {
    const root = await mountPanel('ev05') // 火护法(u1) → 金护法(u2)
    expect(root.querySelector('.ht-attrs-name')?.textContent).toBe('金护法')
    const text = root.textContent ?? ''
    expect(text).toContain('攻击力')
    expect(text).toContain('58')
  })

  it('切到行动 tab：显示攻击角色（sourceId）属性', async () => {
    const root = await mountPanel('ev05')
    const tabs = root.querySelectorAll('.tabs-tab')
    expect(tabs.length).toBe(2)
    ;(tabs[1] as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(root.querySelector('.ht-attrs-name')?.textContent).toBe('火护法')
    expect(root.textContent ?? '').toContain('65')
  })

  it('特殊属性（连击率/真实伤害率）在 demo 存档中正常显示', async () => {
    const root = await mountPanel('ev05')
    // 目标 tab：金护法 有 真实伤害率 20%
    const text = root.textContent ?? ''
    expect(text).toContain('真实伤害率')
    expect(text).toContain('20%')
    // 切到行动 tab：火护法 有 连击率 35%
    const tabs = root.querySelectorAll('.tabs-tab')
    ;(tabs[1] as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(root.textContent ?? '').toContain('连击率')
    expect(root.textContent ?? '').toContain('35%')
  })

  it('无选中事件：显示引导空态', async () => {
    const root = await mountPanel()
    expect(root.textContent ?? '').toContain('选中事件以查看')
  })

  it('无 sourceId/targetId 的事件：对应 tab 显示降级文案', async () => {
    const root = await mountPanel('ev02') // turn_flow 无 source/target
    expect(root.textContent ?? '').toContain('该事件无目标角色')
  })

  it('回放推进到 attribute_recalc 之后：面板属性反映当前时刻而非开战快照（问题 6）', async () => {
    const root = await mountPanel('ev14') // u1 属性重算 ATK 65 → 72（timestamp 2440）
    const store = useHaotianStore()
    store.seekTo(2500) // 推进到 ev14 之后
    await new Promise((r) => setTimeout(r, 20))
    const tabs = root.querySelectorAll('.tabs-tab')
    ;(tabs[1] as HTMLButtonElement).click() // 行动 tab（ev14 无 targetId）
    await new Promise((r) => setTimeout(r, 20))
    expect(root.querySelector('.ht-attrs-name')?.textContent).toBe('火护法')
    expect(root.textContent ?? '').toContain('72')
  })
})
