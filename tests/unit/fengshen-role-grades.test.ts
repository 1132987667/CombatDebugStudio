/**
 * 品阶单一来源一致性测试（AGENTS.md：非琐碎逻辑必须留可运行检查）
 *
 * 六档品阶码（xiaoyao/yaobing/yaotu/yaokui/yaowang/yaozun）同时被
 * enemies.json、schema 枚举/筛选、倍率表消费；历史别名 normal/elite 已废弃。
 * 本测试锁住四处一致，防止再次漂移。
 *
 * 运行: npx vitest run tests/unit/fengshen-role-grades.test.ts
 */
import { describe, it, expect } from 'vitest'
import { ENEMY_ROLES, ENEMY_ROLE_LABELS, ENEMY_ROLE_MULTIPLIERS } from '@/domain/fengshen/role-grades'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import enemiesJson from '@configs/enemies/enemies.json'

describe('role-grades 单一来源', () => {
  it('六档品阶码与权威顺序固定', () => {
    expect([...ENEMY_ROLES]).toEqual(['xiaoyao', 'yaobing', 'yaotu', 'yaokui', 'yaowang', 'yaozun'])
  })

  it('每档品阶都有中文名', () => {
    expect(ENEMY_ROLE_LABELS).toEqual({
      xiaoyao: '小妖',
      yaobing: '妖兵',
      yaotu: '妖徒',
      yaokui: '妖魁',
      yaowang: '妖王',
      yaozun: '妖尊',
    })
  })

  it('官方倍率：小妖 1.0 / 妖兵 1.1 / 妖徒 1.2 / 妖魁 1.3 / 妖王 1.4 / 妖尊 1.5（线性档）', () => {
    expect(ENEMY_ROLE_MULTIPLIERS).toEqual({
      xiaoyao: 1.0,
      yaobing: 1.1,
      yaotu: 1.2,
      yaokui: 1.3,
      yaowang: 1.4,
      yaozun: 1.5,
    })
  })
})

describe('消费方一致性', () => {
  it('enemies.json 有 role 的条目全部落在六档内（历史别名 normal/elite 已灭绝；旧体系沙盒基准无 role 冻结数值，不在此约束内）', () => {
    const enemies = enemiesJson as Array<{ role?: string }>
    expect(enemies.length).toBeGreaterThan(0)
    const bad = enemies.filter((e) => e.role !== undefined && !(ENEMY_ROLES as readonly string[]).includes(e.role))
    expect(bad.map((e) => `${(e as { name?: string }).name}: ${e.role}`)).toEqual([])
  })

  it('schema 的 enemies 枚举/标签/筛选与单一来源一致', () => {
    const schema = TABLE_SCHEMAS.enemies
    const roleField = schema.fields.find((f) => f.key === 'role')
    expect(roleField?.enum).toEqual([...ENEMY_ROLES])
    expect(roleField?.valueLabel).toEqual({ ...ENEMY_ROLE_LABELS })
    const roleFilter = schema.filters.find((f) => f.key === 'role')
    expect(roleFilter?.options).toEqual([...ENEMY_ROLES])
    expect(roleFilter?.labelMap).toEqual({ ...ENEMY_ROLE_LABELS })
  })
})
