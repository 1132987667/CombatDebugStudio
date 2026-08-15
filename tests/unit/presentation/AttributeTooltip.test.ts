// @vitest-environment happy-dom
/**
 * AttributeTooltip 悬浮计算过程测试
 *
 * 覆盖：四层分组层合计（基础/加成/独立/最终）、分步计算过程（基础值 → 各乘区 → 中间结果）、
 *       空修饰符回退。用真实组件挂载，验证悬浮展示内容。
 *
 * 运行: npx vitest run tests/unit/presentation/AttributeTooltip.test.ts
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, h, type App } from 'vue'
import AttributeTooltip from '@/presentation/components/AttributeTooltip.vue'
import type { Modifier } from '@/domain/attribute/types'
import { ModifierType, ModifierSourceType, AttributeValueType } from '@/domain/attribute/types'

let app: App | null = null
let host: HTMLElement | null = null

function mount(props: Record<string, unknown>): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(AttributeTooltip, props) })
  app.mount(host)
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
})

function mod(partial: Partial<Modifier>): Modifier {
  return {
    sourceKey: 'test',
    sourceType: ModifierSourceType.BUFF,
    attribute: 'attack',
    value: 0,
    type: ModifierType.ADDITIVE,
    ...partial,
  }
}

describe('AttributeTooltip 悬浮计算过程', () => {
  it('攻击属性：四层分组层合计 + 分步计算链路（5 × 1.25 = 6.25）', () => {
    mount({
      visible: true,
      title: '攻击力',
      attributeCode: 'attack',
      modifiers: [
        mod({ sourceKey: 'base', value: 5, sourceType: ModifierSourceType.BASE }),
        mod({ sourceKey: 'test_atk_up', value: 10, type: ModifierType.PERCENTAGE, description: '鼓舞' }),
        mod({ sourceKey: 'aura', value: 15, type: ModifierType.PERCENTAGE, description: '光环' }),
      ],
      finalValue: 6.25,
      valueType: AttributeValueType.VALUE,
    })
    const html = document.body.innerHTML
    // 计算过程区块与分步步骤
    expect(html).toContain('计算过程')
    expect(html).toContain('基础值')
    expect(html).toContain('属性加成')
    // 分步中间结果：5 → 6.25（×1.25）
    expect(html).toContain('6.25')
    expect(html).toContain('1.25')
    // 四层分组层合计：属性加成层 +25%
    expect(html).toContain('+25%')
    // 最终值
    expect(html).toContain('6.25')
  })

  it('空修饰符：兜底显示基础值（= 最终值），无空态与多余分隔线', () => {
    mount({
      visible: true,
      title: '攻击力',
      modifiers: [],
      finalValue: 50,
      valueType: AttributeValueType.VALUE,
    })
    const html = document.body.innerHTML
    expect(html).toContain('基础值')
    expect(html).toContain('50')
    expect(html).not.toContain('无详细来源信息')
    expect(html).not.toContain('无详细计算信息')
  })

  it('省略可选 prop（modifiers/valueType 等）不触发 Missing required 警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount({ visible: false, title: '' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
