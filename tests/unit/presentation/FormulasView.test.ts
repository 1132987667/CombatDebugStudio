// @vitest-environment happy-dom
/**
 * FormulasView 渲染特征测试
 *
 * 页面为「公式参考为主 + 引擎实例演算 + 只读属性字典」。因浏览器指针在本环境不可用，
 * 用 createApp 直接挂载组件，断言渲染出的 DOM 覆盖三大板块与关键数值（引擎真值 raw 896 / final 738）。
 *
 * 运行: npx vitest run tests/unit/presentation/FormulasView.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import FormulasView from '@/presentation/modules/fengshen/views/FormulasView.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mountView(): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(FormulasView) })
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
  host = null
})

describe('FormulasView', () => {
  it('渲染分层公式的引擎阶段与对齐标记', () => {
    const el = mountView()
    const text = el.textContent || ''
    for (const zone of ['判定层', '基础 + 额外', '暴击乘区', '来源方加成', '目标方减免', '阵营克制', '阈值保底']) {
      expect(text).toContain(zone)
    }
    // 一致 / 待补 两种对齐标记都在
    expect(text).toContain('一致')
    expect(text).toContain('待补')
    // L4 说明文案
    expect(text).toContain('最终攻击')
  })

  it('实例演算展示引擎真值：raw 896 / final 738，并列出逐击步骤', () => {
    const el = mountView()
    const text = el.textContent || ''
    expect(text).toContain('实例演算')
    expect(text).toContain('896')
    expect(text).toContain('738')
    // 步骤表出现变换环节名
    for (const step of ['damageBoost', 'defense', 'skillDmgReduction', 'dmgTakenIncrease']) {
      expect(text).toContain(step)
    }
  })

  it('只读属性字典按核心分组渲染 64 项', () => {
    const el = mountView()
    const details = el.querySelector('details')
    expect(details).not.toBeNull()
    details!.setAttribute('open', '')
    const dictText = details!.textContent || ''
    for (const grp of ['基础数值', '输出转化', '生存对抗', '状态机制', '机制节奏']) {
      expect(dictText).toContain(grp)
    }
    // 抽查 PRD 权威名与 code
    expect(dictText).toContain('气血')
    expect(dictText).toContain('攻击系数')
    expect(dictText).toContain('attackCoefficient')
    // 运行时/归档项不应出现在核心字典（护盾值归运行时、不在此 64 组内）
    expect(dictText).not.toContain('护盾值')
    expect(dictText).not.toContain('最大能量')
  })
})
