// @vitest-environment happy-dom
/**
 * EntityDetailPanel 组件特征测试
 *
 * 覆盖：只读渲染 schema 全部字段（label + 值）、数组格式化、Map 键值对展示、
 *       空值回退（—）、标题取 name/id。
 *
 * 运行: npx vitest run tests/unit/presentation/EntityDetailPanel.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import EntityDetailPanel from '@/presentation/modules/fengshen/components/EntityDetailPanel.vue'

let app: App | null = null
let host: HTMLElement | null = null

const schema: TableSchema = {
  table: 'actors',
  label: '角色',
  columns: ['id', 'name', 'level', 'skillIds', 'stats'],
  fields: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'level', label: '等级', type: 'number' },
    { key: 'skillIds', label: '技能', type: 'array' },
    { key: 'stats', label: '属性', type: 'map' },
    { key: 'note', label: '备注', type: 'text' },
  ],
}

function mount(entity: Record<string, unknown>): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(EntityDetailPanel, { schema, entity }),
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

describe('EntityDetailPanel 只读详情', () => {
  it('渲染标题（取 name）与全部字段 label/值', () => {
    const root = mount({ id: 'hero_001', name: '测试角色', level: 10 })
    expect(root.textContent).toContain('hero_001')
    expect(root.textContent).toContain('测试角色')
    expect(root.textContent).toContain('名称')
    expect(root.textContent).toContain('等级')
    expect(root.textContent).toContain('10')
  })

  it('数组字段逐项列出', () => {
    const root = mount({ id: 'h1', name: '甲', skillIds: ['skill_a', 'skill_b'] })
    expect(root.textContent).toContain('skill_a')
    expect(root.textContent).toContain('skill_b')
  })

  it('stats 属性面板：label 用元数据 displayName，百分比属性追加 %', () => {
    const root = mount({ id: 'h1', name: '甲', stats: { maxHealth: 100, attack: 5, critRate: 20 } })
    expect(root.textContent).toContain('最大气血值')
    expect(root.textContent).toContain('100')
    expect(root.textContent).toContain('攻击力')
    expect(root.textContent).toContain('5')
    expect(root.textContent).toContain('暴击率')
    expect(root.textContent).toContain('20%')
  })

  it('空值显示 —', () => {
    const root = mount({ id: 'h1', name: '甲', note: '' })
    expect(root.textContent).toContain('—')
  })

  it('对象数组元素格式化为 JSON', () => {
    const root = mount({ id: 'h1', name: '甲', skillIds: [{ id: 'x', name: '技能X' }] })
    expect(root.textContent).toContain('{"id":"x","name":"技能X"}')
  })
})
