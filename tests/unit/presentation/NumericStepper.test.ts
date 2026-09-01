// @vitest-environment happy-dom
/**
 * NumericStepper compact 模式特征测试
 *
 * 重点验证「单档步进 + 浮点尾数消除」：反复点击 +/− 不应产生 0.8600000000000001 之类的
 * 累加误差；同时确认非 compact（多档 steps）行为未被破坏。
 *
 * 运行: npx vitest run tests/unit/presentation/NumericStepper.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import NumericStepper from '@/presentation/components/NumericStepper.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mountStepper(props: Record<string, unknown>, onEmit: (v: number) => void): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(NumericStepper, { ...props, 'onUpdate:modelValue': onEmit }),
  })
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
  host = null
})

describe('NumericStepper compact', () => {
  it('只渲染裸 −/+ 各一个按钮', () => {
    const el = mountStepper({ modelValue: 1, compact: true, step: 0.05, min: 0, max: 9.95 }, () => {})
    const inc = el.querySelectorAll('.ns-btn-inc')
    const dec = el.querySelectorAll('.ns-btn-dec')
    expect(inc.length).toBe(1)
    expect(dec.length).toBe(1)
    expect(inc[0].textContent?.trim()).toBe('+')
    expect(dec[0].textContent?.trim()).toBe('−')
  })

  it('反复点击 +/− 消除浮点累加尾数', () => {
    const emits: number[] = []
    const el = mountStepper({ modelValue: 0.85, compact: true, step: 0.05, min: 0, max: 9.95 }, (v) => emits.push(v))
    const inc = el.querySelector('.ns-btn-inc') as HTMLButtonElement
    const dec = el.querySelector('.ns-btn-dec') as HTMLButtonElement

    inc.click() // 0.85 + 0.05
    inc.click() // + 0.05
    dec.click() // - 0.05

    // 原始浮点：0.85 + 0.05 = 0.9000000000000001；组件应回传干净的两位小数
    expect(emits).toEqual([0.9, 0.95, 0.9])
    for (const v of emits) expect(String(v)).toBe(String(Number(v.toFixed(2))))
  })

  it('非 compact 多档步进仍渲染三档按钮且结果为整数', async () => {
    const emits: number[] = []
    const el = mountStepper({ modelValue: 10, steps: [1, 10, 100], min: 0, max: 9999 }, (v) => emits.push(v))
    const inc = el.querySelectorAll('.ns-btn-inc')
    expect(inc.length).toBe(3)
    ;(inc[0] as HTMLButtonElement).click() // +1
    ;(inc[2] as HTMLButtonElement).click() // +100
    await nextTick()
    expect(emits).toEqual([11, 111])
  })
})
