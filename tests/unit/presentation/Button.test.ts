// @vitest-environment happy-dom
/**
 * Button 组件特征测试
 *
 * 覆盖：默认渲染（secondary/medium/type=button）、variant/size 类绑定、
 *       disabled/loading/active/block 状态、title/aria 经 $attrs 落根、
 *       click emit、@click.stop 修饰符阻止原生冒泡（ParticipantPanel 等依赖此行为）。
 *
 * 运行: npx vitest run tests/unit/presentation/Button.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, h, withModifiers, type App } from 'vue'
import Button from '@/presentation/components/Button.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mount(attrs: Record<string, unknown> = {}, text = '确认'): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(Button, attrs, { default: () => text }),
  })
  app.mount(host)
  return host
}

function rootButton(): HTMLButtonElement {
  const btn = host?.querySelector('button')
  if (!btn) throw new Error('未渲染 <button> 根元素')
  return btn as HTMLButtonElement
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
})

describe('Button 基础渲染', () => {
  it('默认渲染 secondary/medium，type=button，内容入 slot', () => {
    mount({}, '开始战斗')
    const btn = rootButton()
    expect(btn.classList.contains('ui-button')).toBe(true)
    expect(btn.classList.contains('ui-button--secondary')).toBe(true)
    expect(btn.classList.contains('ui-button--medium')).toBe(true)
    expect(btn.type).toBe('button')
    expect(btn.textContent).toBe('开始战斗')
  })

  it('variant / size 绑定对应修饰类', () => {
    mount({ variant: 'primary', size: 'tiny' })
    const btn = rootButton()
    expect(btn.classList.contains('ui-button--primary')).toBe(true)
    expect(btn.classList.contains('ui-button--tiny')).toBe(true)
  })

  it('block 撑满父容器', () => {
    mount({ block: true })
    expect(rootButton().classList.contains('is-block')).toBe(true)
  })

  it('active 选中态', () => {
    mount({ active: true })
    expect(rootButton().classList.contains('is-active')).toBe(true)
  })
})

describe('Button 状态', () => {
  it('disabled 透传原生属性', () => {
    mount({ disabled: true })
    expect(rootButton().disabled).toBe(true)
  })

  it('loading 禁用点击并渲染 spinner', () => {
    mount({ loading: true })
    const btn = rootButton()
    expect(btn.disabled).toBe(true)
    expect(btn.querySelector('.ui-button__spinner')).not.toBeNull()
  })

  it('disabled 不渲染 spinner', () => {
    mount({ disabled: true })
    expect(rootButton().querySelector('.ui-button__spinner')).toBeNull()
  })
})

describe('Button 透传与事件', () => {
  it('title / aria-label 经 $attrs 落到根元素', () => {
    mount({ title: '导出日志', 'aria-label': '导出' })
    const btn = rootButton()
    expect(btn.getAttribute('title')).toBe('导出日志')
    expect(btn.getAttribute('aria-label')).toBe('导出')
  })

  it('点击触发 click emit', () => {
    const spy = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({
      render: () => h(Button, { onClick: spy }),
    })
    app.mount(host)
    rootButton().click()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('@click.stop 修饰符阻止原生事件冒泡到外层', () => {
    const outerSpy = vi.fn()
    const innerSpy = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({
      render: () =>
        h('div', { onClick: outerSpy }, [
          h(Button, { onClick: withModifiers(innerSpy, ['stop']) }),
        ]),
    })
    app.mount(host)
    rootButton().click()
    // 组件事件已触发
    expect(innerSpy).toHaveBeenCalledTimes(1)
    // .stop 已拦截，事件未冒泡到外层 div
    expect(outerSpy).not.toHaveBeenCalled()
  })
})
