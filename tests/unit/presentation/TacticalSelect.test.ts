// @vitest-environment happy-dom
/**
 * TacticalSelect 组件特征测试
 *
 * 覆盖：modelValue 类型容错（undefined 兜底为 null 不触发 prop 类型检查警告）、
 *       null/空串显示 placeholder、合法值渲染选中项。
 *
 * 背景：modelValue 声明为 string | number | null（编译后 required: true），
 *       父组件绑定若意外为 undefined（如 reactive 动态键缺失）会触发
 *       "Invalid prop: type check failed ... got Undefined" 警告；
 *       withDefaults 默认值 null 让 Vue 在 resolve 阶段把 undefined 替换为 null 后通过校验。
 *
 * 运行: npx vitest run tests/unit/presentation/TacticalSelect.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mount(modelValue: unknown, placeholder = '请选择'): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(TacticalSelect, {
        modelValue: modelValue as string | number | null,
        options: [
          { value: 'a', label: '选项A' },
          { value: 2, label: '选项B' },
        ],
        placeholder,
      }),
  })
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
})

describe('TacticalSelect modelValue 类型容错', () => {
  it('传 undefined 不触发 prop 类型检查警告，显示 placeholder', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = mount(undefined)
    expect(warn).not.toHaveBeenCalled()
    expect(root.textContent).toContain('请选择')
    warn.mockRestore()
  })

  it('传 null 显示 placeholder', () => {
    const root = mount(null)
    expect(root.textContent).toContain('请选择')
  })

  it('传空串显示 placeholder（空值 = 未选择）', () => {
    const root = mount('')
    expect(root.textContent).toContain('请选择')
  })

  it('传合法值渲染选中项 label', () => {
    expect(mount('a').textContent).toContain('选项A')
    expect(mount(2).textContent).toContain('选项B')
  })
})
