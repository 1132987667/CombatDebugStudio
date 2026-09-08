// @vitest-environment happy-dom
/**
 * DataTable 组件特征测试（"优先中文"方向 + 分组渲染）
 *
 * 覆盖：引用列（refTable）正文显示中文名、title 悬浮保留原始英文 id、
 *       引用数组列（skillIds）中文名列表、无字典时回退原 id；
 *       分组渲染（groupBy/groupMeta）：组头展示与排序、分组列隐藏、折叠交互、edit-group 事件、
 *       悬空键组回退原始键值排尾、空组不渲染头行。
 *
 * 运行: npx vitest run tests/unit/presentation/DataTable.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import DataTable from '@/presentation/modules/fengshen/components/DataTable.vue'

let app: App | null = null
let host: HTMLElement | null = null

interface DataTableMountOpts {
  groupBy?: string
  groupMeta?: Record<string, { label: string; hint?: string }>
  onEditGroup?: (key: string) => void
}

function mount(
  schema: TableSchema,
  rows: Record<string, unknown>[],
  refIndex?: Record<string, string>,
  opts: DataTableMountOpts = {},
): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(DataTable, {
        schema,
        rows,
        selectedIds: [],
        refIndex,
        groupBy: opts.groupBy,
        groupMeta: opts.groupMeta,
        onEditGroup: opts.onEditGroup,
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

describe('DataTable 分组渲染（区域→场景）', () => {
  const sceneSchema: TableSchema = {
    table: 'scenes',
    label: '场景',
    columns: ['name', 'regionId'],
    fields: [
      { key: 'name', label: '名称', type: 'text' },
      { key: 'regionId', label: '区域', type: 'select', refTable: 'regions' },
    ],
  }
  const sceneRows = [
    { id: 'scene_1_1', name: '桃林小径', regionId: 'region_1' },
    { id: 'scene_1_2', name: '落英坡', regionId: 'region_1' },
    { id: 'scene_2_1', name: '古渡口', regionId: 'region_2' },
    { id: 'scene_x', name: '悬空场景', regionId: 'region_9' },
  ]
  const regionMeta = {
    region_1: { label: '落桃原', hint: '桃林初劫 · Lv.1-10' },
    region_2: { label: '断柳渡', hint: '古渡沉魂 · Lv.11-20' },
  }

  it('组头按 groupMeta 键序展示 label/hint/行数，分组列（regionId）不再渲染', () => {
    const root = mount(sceneSchema, sceneRows, undefined, { groupBy: 'regionId', groupMeta: regionMeta })
    const heads = Array.from(root.querySelectorAll('.fs-group-row')).map((tr) => tr.textContent ?? '')
    expect(heads).toHaveLength(3) // region_1 / region_2 / 悬空 region_9
    expect(heads[0]).toContain('落桃原')
    expect(heads[0]).toContain('桃林初劫 · Lv.1-10')
    expect(heads[0]).toContain('2 条')
    expect(heads[1]).toContain('断柳渡')
    // 分组列本身不再出现在表头/正文
    expect(root.querySelectorAll('thead th')).toHaveLength(1 + 1 + 1) // 全选 + name + 操作
    expect(root.textContent).not.toContain('区域')
  })

  it('悬空键组回退原始键值（region_9）排尾，无行组不渲染头行', () => {
    const root = mount(sceneSchema, sceneRows, undefined, {
      groupBy: 'regionId',
      groupMeta: { ...regionMeta, region_empty: { label: '空区域' } },
    })
    const heads = Array.from(root.querySelectorAll('.fs-group-row')).map((tr) => tr.textContent ?? '')
    expect(heads).toHaveLength(3)
    expect(heads[2]).toContain('region_9')
    expect(root.textContent).not.toContain('空区域')
  })

  it('点击组头折叠该组行，再点展开；点组头「编辑」发 edit-group 且不触发折叠', async () => {
    const got: string[] = []
    const root = mount(sceneSchema, sceneRows, undefined, {
      groupBy: 'regionId',
      groupMeta: regionMeta,
      onEditGroup: (key) => got.push(key),
    })
    expect(root.querySelectorAll('tbody tr')).toHaveLength(4 + 3) // 4 行 + 3 组头
    const firstHead = root.querySelector('.fs-group-row') as HTMLTableRowElement
    firstHead.click()
    await nextTick()
    // 折叠后 region_1 组的 2 行消失
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2 + 3)
    firstHead.click()
    await nextTick()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(4 + 3)
    const editBtn = firstHead.querySelector('.fs-group-edit') as HTMLButtonElement
    editBtn.click()
    await nextTick()
    expect(got).toEqual(['region_1'])
  })
})
