// @vitest-environment happy-dom
/**
 * EntityDetailPanel 组件特征测试
 *
 * 覆盖：只读渲染 schema 全部字段（label + 值）、数组格式化、Map 键值对展示、
 *       空值回退（—）、标题取 name/id、引用字段优先中文（含嵌套对象内的引用键）。
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

/** actors 引用字段 schema（REFERENCE_RULES 声明 actors.skillIds/growth/faction） */
const refSchema: TableSchema = {
  table: 'actors',
  label: '角色',
  columns: ['id', 'name', 'skillIds', 'growth', 'faction'],
  fields: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'skillIds', label: '可用技能', type: 'multi' },
    { key: 'growth', label: '成长曲线', type: 'select' },
    { key: 'faction', label: '阵营元素', type: 'select' },
  ],
}

/** lineups 引用字段 schema（roles[].roleId 跨 ['actors','enemies']） */
const lineupSchema: TableSchema = {
  table: 'lineups',
  label: '预设阵容',
  columns: ['id', 'name', 'roles'],
  fields: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'roles', label: '角色编组', type: 'array' },
  ],
}

function mount(
  entity: Record<string, unknown>,
  schemaOverride?: TableSchema,
  refIndex?: Record<string, string>,
  references?: Array<{ sourceTable: string; ids: string[] }>,
): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(EntityDetailPanel, { schema: schemaOverride ?? schema, entity, refIndex, references }),
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

  it('对象数组元素渲染为键值对（不再整体 JSON 化，提升可读性）', () => {
    const root = mount({ id: 'h1', name: '甲', skillIds: [{ id: 'x', name: '技能X' }] })
    expect(root.textContent).toContain('技能X')
    expect(root.textContent).toContain('x')
  })
})

describe('EntityDetailPanel 引用字段优先中文', () => {
  it('顶层引用字段（skillIds/growth/faction）显示中文名，title 保留原始 id', () => {
    const root = mount(
      { id: 'h1', name: '甲', skillIds: ['skill_a'], growth: 'growth_balanced', faction: 'fire' },
      refSchema,
      { skill_a: '花粉迷雾', growth_balanced: '均衡型', fire: '火' },
    )
    expect(root.textContent).toContain('花粉迷雾')
    expect(root.textContent).toContain('均衡型')
    expect(root.textContent).toContain('火')
    const spans = Array.from(root.querySelectorAll('span'))
    const growthSpan = spans.find((s) => s.textContent === '均衡型')
    expect(growthSpan?.getAttribute('title')).toContain('growth_balanced')
  })

  it('无字典时引用字段回退原始 id（向后兼容）', () => {
    const root = mount(
      { id: 'h1', name: '甲', skillIds: ['skill_a'], growth: 'growth_balanced' },
      refSchema,
    )
    expect(root.textContent).toContain('skill_a')
    expect(root.textContent).toContain('growth_balanced')
  })

  it('数组元素对象内的引用键翻译（roles[].roleId 跨 actors+enemies）', () => {
    const root = mount(
      {
        id: 'l1',
        name: '五行试炼阵',
        roles: [
          { seatIndex: 0, roleId: 'guardian_fire' },
          { seatIndex: 1, roleId: 'enemy_007' },
        ],
      },
      lineupSchema,
      { guardian_fire: '火护法', enemy_007: '花妖王' },
    )
    expect(root.textContent).toContain('火护法')
    expect(root.textContent).toContain('花妖王')
    expect(root.textContent).not.toContain('guardian_fire')
  })

  it('被引用区域 id 列表翻译为中文名，title 保留原始 id（未命中回退 id）', () => {
    const root = mount(
      { id: 'mat_x', name: '桃木' },
      schema,
      { boss_hidden_003: '镇山神兽·岩', enemy_006: '成年山魈' },
      [{ sourceTable: 'enemies', ids: ['boss_hidden_003', 'enemy_006', 'enemy_022', 'enemy_076', 'enemy_079'] }],
    )
    expect(root.textContent).toContain('被引用（5 处）')
    expect(root.textContent).toContain('镇山神兽·岩')
    expect(root.textContent).toContain('成年山魈')
    // 未命中字典的敌人回退原始 id，不丢失引用信息
    expect(root.textContent).toContain('enemy_022')
    expect(root.textContent).toContain('enemy_076')
    expect(root.textContent).toContain('enemy_079')
    expect(root.textContent).not.toContain('enemy_006')
    // 原始 id 保留在 title 悬浮
    const idsSpan = Array.from(root.querySelectorAll('span')).find((s) => s.textContent === '镇山神兽·岩、成年山魈、enemy_022、enemy_076、enemy_079')
    expect(idsSpan?.getAttribute('title')).toContain('boss_hidden_003')
  })

  it('被引用区装备详情（gears）来源：装备名渲染为可悬浮 tag，显示名称而非编号', () => {
    const root = mount(
      { id: 'mat_x', name: '幽影木' },
      schema,
      { hf_t4_war_01: '毒牙战符', jz_t4_power_01: '毒牙戒', wp_t4_light_01: '幽影刃' },
      [{ sourceTable: 'gears', ids: ['hf_t4_war_01', 'jz_t4_power_01', 'wp_t4_light_01'] }],
    )
    expect(root.textContent).toContain('毒牙战符')
    expect(root.textContent).toContain('毒牙戒')
    expect(root.textContent).toContain('幽影刃')
    expect(root.textContent).not.toContain('hf_t4_war_01')
    // 每个装备是独立可悬浮 tag，title 保留原始 id
    const tags = Array.from(root.querySelectorAll('.fs-ref-gear'))
    expect(tags.length).toBe(3)
    expect(tags[0]?.getAttribute('title')).toContain('hf_t4_war_01')
  })
})
