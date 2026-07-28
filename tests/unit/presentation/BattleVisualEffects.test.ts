// @vitest-environment happy-dom
/**
 * BattleVisualEffects.vue 特征测试
 *
 * 定位：锁住 VFX 层与领域层固定预算模型的时序契约，不追求覆盖率。
 * 这些测试必须先在原代码上全绿（特征锁定），重构后依然全绿（值恒等证明）。
 *
 * 约束：
 * - 不新增依赖（无 @vue/test-utils），createApp + 包装组件挂载
 * - 组件用 useDebugStore → 需 createPinia
 * - jsdom 不支持 Element.animate（WAAPI），打桩
 * - P0 时序用例只依赖 setTimeout（fake timers）；光弹飞行（rAF）打桩为 no-op
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, ref, nextTick } from 'vue'
import { createPinia } from 'pinia'
import BattleVisualEffects from '@/presentation/components/BattleVisualEffects.vue'
import { getActionBudget } from '@/shared/constants/animation-timing'

// ============ 挂载辅助（无 @vue/test-utils） ============
function mountVfx() {
  const vfxRef = ref<any>(null)
  const host = document.createElement('div')
  document.body.appendChild(host)
  // NOTE: 使用 ref callback 而非 Ref 对象传参，兼容 Vue 3.2.x（h() 未自动解包 Ref）
  const app = createApp({
    render: () => h(BattleVisualEffects, { ref: (el: any) => { vfxRef.value = el } }),
  })
  app.use(createPinia())
  app.mount(host)
  return {
    vfx: vfxRef.value,
    root: document.getElementById('visual-effects-root')!,
    unmount: () => { app.unmount(); host.remove() },
  }
}

/** 假卡片：mock getBoundingClientRect；挂在 body 上，isConnected 天然为 true */
const fakeCards: HTMLElement[] = []
function fakeCard(x: number, y: number): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  fakeCards.push(el)
  el.getBoundingClientRect = () =>
    ({ left: x - 50, top: y - 50, width: 100, height: 100, right: x + 50, bottom: y + 50 }) as DOMRect
  return el
}

const count = (root: HTMLElement, sel: string) => root.querySelectorAll(sel).length

let vfx: any
let root: HTMLElement
let unmount: () => void

beforeEach(() => {
  // jsdom 不支持 WAAPI，打桩（粒子 spark.animate / flash.animate）
  ;(Element.prototype as any).animate = vi.fn(() => ({ finished: Promise.resolve() }))
  // 光弹飞行由 rAF 驱动；打桩为 no-op，只测"创建时机"不测"运动轨迹"
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.useFakeTimers()

  const m = mountVfx()
  vfx = m.vfx
  root = m.root
  unmount = m.unmount
  vfx.registerCard('attacker', fakeCard(100, 300))
  vfx.registerCard('target', fakeCard(500, 300))
})

afterEach(() => {
  unmount()
  // 清理 fakeCard 产生的残余 DOM 元素
  fakeCards.forEach(el => el.remove())
  fakeCards.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================================
// P0 时序契约 —— 锁定固定预算模型（1x budget = 1200ms）
// ============================================================
describe('P0 时序契约（锁定固定预算模型）', () => {
  const budget = getActionBudget(1) // 1200

  it('showSkillName：技能名在 budget×0.5+50 = 650ms 移除', async () => {
    vfx.showSkillName('attacker', 'target', '烈焰冲击', 'left', budget)
    await nextTick()
    expect(count(root, '.skill-name')).toBe(1)
    vi.advanceTimersByTime(budget * 0.5 + 49)
    await nextTick()
    expect(count(root, '.skill-name')).toBe(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(count(root, '.skill-name')).toBe(0)
  })

  it('showImpact：命中在 budget×0.35 = 420ms 移除（默认 slash 无粒子）', async () => {
    vfx.showImpact('target', 'fire', budget)
    await nextTick()
    expect(count(root, '.impact')).toBe(1)
    vi.advanceTimersByTime(budget * 0.35 - 1)
    await nextTick()
    expect(count(root, '.impact')).toBe(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(count(root, '.impact')).toBe(0)
  })

  it('showDamageNum：1x 时走 1400ms 下限（420 < 1400）', async () => {
    vfx.showDamageNum('target', 100, false, budget)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(1)
    vi.advanceTimersByTime(1399)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(0)
  })

  it('showDamageNum：高倍预算走比例（budget=4800 → 1680 > 1400）', async () => {
    const b = 4800
    vfx.showDamageNum('target', 100, false, b)
    await nextTick()
    vi.advanceTimersByTime(b * 0.35 - 1) // 1679
    await nextTick()
    expect(count(root, '.floating-num')).toBe(1)
    vi.advanceTimersByTime(1)            // 1680
    await nextTick()
    expect(count(root, '.floating-num')).toBe(0)
  })

  it('showHealNum：治疗数字下限 1600ms', async () => {
    vfx.showHealNum('target', 50, budget)
    await nextTick()
    vi.advanceTimersByTime(1599)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(0)
  })

  it('showHealAura：+200ms 第二层，两层分别在 600/800ms 移除', async () => {
    vfx.showHealAura('target', budget)
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(1)          // 第一层
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(2)          // 第二层
    vi.advanceTimersByTime(budget * 0.5 - 200 - 1)     // → 599ms
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(2)
    vi.advanceTimersByTime(1)                          // → 600ms，第一层移除
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(1)
    vi.advanceTimersByTime(200 - 1)                    // → 799ms
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(1)
    vi.advanceTimersByTime(1)                          // → 800ms，第二层移除
    await nextTick()
    expect(count(root, '.heal-aura')).toBe(0)
  })

  it('playFlightSequence：技能名即时，光弹在 budget×0.2 = 240ms 创建', async () => {
    vfx.playFlightSequence('attacker', 'target', '烈焰冲击', 'left', 'fire', budget)
    await nextTick()
    expect(count(root, '.skill-name')).toBe(1)
    expect(count(root, '.projectile')).toBe(0)         // 光弹未出发
    vi.advanceTimersByTime(budget * 0.2 - 1)
    await nextTick()
    expect(count(root, '.projectile')).toBe(0)
    vi.advanceTimersByTime(1)                          // → 240ms
    await nextTick()
    expect(count(root, '.projectile')).toBe(1)         // 光弹创建
  })
})

// ============================================================
// P1 边界安全
// ============================================================
describe('P1 边界安全', () => {
  it('未注册卡片：静默返回，不生成元素，不抛异常', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => vfx.showImpact('nonexistent', 'fire', 1200)).not.toThrow()
    expect(() => vfx.showDamageNum('nonexistent', 100, false, 1200)).not.toThrow()
    expect(() => vfx.showSkillName('nonexistent', 'target', 'X', 'left', 1200)).not.toThrow()
    await nextTick()
    expect(count(root, '.impact')).toBe(0)
    expect(count(root, '.floating-num')).toBe(0)
    expect(count(root, '.skill-name')).toBe(0)
    warn.mockRestore()
  })

  it('卸载后：残留定时器被清理，推进时间不抛异常', async () => {
    vfx.showDamageNum('target', 100, false, 1200)
    await nextTick()
    expect(count(root, '.floating-num')).toBe(1)
    unmount()
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
  })
})
