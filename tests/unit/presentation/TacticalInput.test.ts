// @vitest-environment happy-dom
/**
 * TacticalInput 组件特征测试
 *
 * 覆盖：label / required / hint 渲染、icon 插槽、v-model 双向、
 *       number 非法字符过滤、integer 禁小数点、min/max 越界错误提示、
 *       blur clamp 修正、空值回退、disabled。
 *
 * 运行: npx vitest run tests/unit/presentation/TacticalInput.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mount(options: {
  type?: 'text' | 'number'
  integer?: boolean
  min?: number
  max?: number
  label?: string
  required?: boolean
  hint?: string
  disabled?: boolean
  initial?: string | number | null
  placeholder?: string
} = {}) {
  const value = ref<string | number | null>(options.initial ?? '')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(TacticalInput, {
        type: options.type ?? 'text',
        integer: options.integer ?? false,
        min: options.min,
        max: options.max,
        label: options.label,
        required: options.required ?? false,
        hint: options.hint,
        disabled: options.disabled ?? false,
        modelValue: value.value,
        placeholder: options.placeholder,
        'onUpdate:modelValue': (v: string | number | null) => {
          value.value = v
        },
      }),
  })
  app.mount(host)
  return { value, root: host }
}

function inputEl(root: HTMLElement): HTMLInputElement {
  const el = root.querySelector('input')
  if (!el) throw new Error('input 未渲染')
  return el
}

function setInputValue(el: HTMLInputElement, v: string): void {
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
})

describe('TacticalInput', () => {
  it('渲染 label / required / hint', () => {
    const { root } = mount({ label: '攻击力', required: true, hint: '基础数值' })
    expect(root.textContent).toContain('攻击力')
    expect(root.textContent).toContain('*')
    expect(root.textContent).toContain('基础数值')
    expect(inputEl(root).getAttribute('aria-label')).toBe('攻击力')
  })

  it('渲染 icon 插槽', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    const value = ref('')
    app = createApp({
      render: () =>
        h(TacticalInput, { modelValue: value.value, 'onUpdate:modelValue': (v: string | number | null) => { value.value = v } }, {
          icon: () => h('svg', { class: 'test-icon' }),
        }),
    })
    app.mount(host)
    expect(host!.querySelector('.t-input__icon .test-icon')).not.toBeNull()
  })

  it('text 模式正常双向绑定', () => {
    const { value, root } = mount({ initial: 'hello' })
    expect(inputEl(root).value).toBe('hello')
    setInputValue(inputEl(root), 'world')
    expect(value.value).toBe('world')
  })

  it('number 模式过滤非法字符', () => {
    const { value, root } = mount({ type: 'number' })
    setInputValue(inputEl(root), '12a3')
    expect(value.value).toBe(123)
    expect(inputEl(root).value).toBe('123')
  })

  it('number 模式过滤重复小数点', () => {
    const { value, root } = mount({ type: 'number' })
    setInputValue(inputEl(root), '1.2.3')
    expect(value.value).toBe(1.23)
    expect(inputEl(root).value).toBe('1.23')
    // 非法字符输入被剔除
    setInputValue(inputEl(root), '1.2a')
    expect(value.value).toBe(1.2)
    expect(inputEl(root).value).toBe('1.2')
  })

  it('integer 模式禁止小数点', () => {
    const { value, root } = mount({ type: 'number', integer: true })
    setInputValue(inputEl(root), '3.14')
    expect(value.value).toBe(314)
    expect(inputEl(root).value).toBe('314')
  })

  it('min/max 越界实时错误提示', async () => {
    const { value, root } = mount({ type: 'number', min: 1, max: 10 })
    setInputValue(inputEl(root), '15')
    await nextTick()
    expect(value.value).toBe(15)
    expect(root.textContent).toContain('需在 1 ~ 10 之间')
    expect(inputEl(root).getAttribute('aria-invalid')).toBe('true')
    // 合法值清除错误
    setInputValue(inputEl(root), '5')
    await nextTick()
    expect(root.textContent).not.toContain('需在 1 ~ 10 之间')
  })

  it('blur 时 clamp 到 [min, max] 并修正值', async () => {
    const { value, root } = mount({ type: 'number', min: 0, max: 10, initial: '' })
    setInputValue(inputEl(root), '99')
    inputEl(root).dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()
    expect(value.value).toBe(10)
    expect(inputEl(root).value).toBe('10')
    // 低于 min 同样 clamp
    setInputValue(inputEl(root), '-5')
    inputEl(root).dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()
    expect(value.value).toBe(0)
  })

  it('number 空值回退 null，text 空值回退空串', () => {
    const n = mount({ type: 'number', initial: 5 })
    setInputValue(inputEl(n.root), '')
    expect(n.value.value).toBeNull()

    const t = mount({ type: 'text', initial: 'x' })
    setInputValue(inputEl(t.root), '')
    expect(t.value.value).toBe('')
  })

  it('disabled 时输入被禁用', () => {
    const { root } = mount({ disabled: true, label: '只读' })
    expect(inputEl(root).disabled).toBe(true)
  })

  it('placeholder 透传', () => {
    const { root } = mount({ placeholder: '输入名称' })
    expect(inputEl(root).getAttribute('placeholder')).toBe('输入名称')
  })
})
