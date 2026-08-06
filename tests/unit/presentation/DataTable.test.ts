// @vitest-environment happy-dom
/**
 * DataTable 组件特征测试（"优先中文"方向）
 *
 * 覆盖：引用列（refTable）正文显示中文名、title 悬浮保留原始英文 id、
 *       引用数组列（skillIds）中文名列表、无字典时回退原 id。
 *
 * 运行: npx vitest run tests/unit/presentation/DataTable.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import DataTable from '@/presentation/modules/fengshen/components/DataTable.vue'

let app: App | null = null
let host: HTMLElement | null = null

function mount(schema: TableSchema, rows: Record<string, unknown>[], refIndex?: Record<string, string>): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(DataTable, {
        schema,
        rows,
        selectedIds: [],
        refIndex,
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

const lineupSchema: TableSchema = {
  table: 'lineups',
  label: '预设阵容',
  columns: ['id', 'name', 'formationId'],
  fields: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'formationId', label: '绑定阵型', type: 'select', refTable: 'formations' },
  ],
}

describe('DataTable 引用列中文', () => {
  it('refTable 单值列：正文显示中文名，title 悬浮保留原始英文 id', () => {
    const root = mount(
      lineupSchema,
      [{ id: 'lineup_001', name: '五行试炼阵', formationId: 'crane_wing' }],
      { crane_wing: '鹤翼阵' },
    )
    expect(root.textContent).toContain('鹤翼阵')
    const cell = Array.from(root.querySelectorAll('td')).find(
      (td) => td.textContent?.trim() === '鹤翼阵',
    )
    expect(cell?.getAttribute('title')).toContain('crane_wing')
  })

  it('无字典时回退原 id（向后兼容，调试语义不丢）', () => {
    const root = mount(lineupSchema, [{ id: 'lineup_001', name: '五行试炼阵', formationId: 'crane_wing' }])
    expect(root.textContent).toContain('crane_wing')
  })

  it('refTable 数组列（skillIds）：正文中文名列表，title 保留原始 id 串', () => {
    const schema: TableSchema = {
      table: 'actors',
      label: '角色',
      columns: ['id', 'name', 'skillIds'],
      fields: [
        { key: 'name', label: '名称', type: 'text' },
        { key: 'skillIds', label: '可用技能', type: 'multi', refTable: 'skills' },
      ],
    }
    const root = mount(
      schema,
      [{ id: 'hero_001', name: '火护法', skillIds: ['skill_a', 'skill_b'] }],
      { skill_a: '花粉迷雾', skill_b: '青藤缠绕' },
    )
    expect(root.textContent).toContain('花粉迷雾')
    expect(root.textContent).toContain('青藤缠绕')
    const cell = Array.from(root.querySelectorAll('td')).find(
      (td) => td.textContent?.includes('花粉迷雾'),
    )
    expect(cell?.getAttribute('title')).toContain('skill_a')
    expect(cell?.getAttribute('title')).toContain('skill_b')
  })
})
