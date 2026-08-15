/**
 * unified-migrate.test.ts — 统一存档版本迁移测试（L2：旧档导入迁移，非仅报错）
 * 覆盖：v1.0.0 RecordedBattle 识别 → fromRecordedBattle 映射；UnifiedArchive 补版本；非法结构返回 null
 */
import { describe, it, expect } from 'vitest'
import { isLegacyRecordedBattle, migrateUnifiedArchive } from '@/domain/battle/replay/unified/unified-migrate'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import { validateUnified } from '@/domain/battle/replay/unified/unified-validator'

describe('unified-migrate：统一存档版本迁移', () => {
  it('识别 v1.0.0 RecordedBattle 形态（traceEvents 且无 unified events）', () => {
    const legacy = {
      battleId: 'b1',
      replayId: 'r1',
      version: '1.0.0',
      randomSeed: '42',
      traceEvents: [{ id: 't1' }],
      initialState: { participants: [] },
    }
    expect(isLegacyRecordedBattle(legacy)).toBe(true)
    expect(isLegacyRecordedBattle(createDemoArchive())).toBe(false)
  })

  it('UnifiedArchive 旧版本号迁移后 version 为当前版本且结构不变', () => {
    const demo = createDemoArchive()
    const old = { ...demo, version: '1.0.0' } as unknown as Record<string, unknown>
    const migrated = migrateUnifiedArchive(old)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe('2.0.0')
    expect(migrated!.events).toHaveLength(demo.events.length)
    // 迁移后通过校验（不再报版本号异常）
    const v = validateUnified(migrated!)
    expect(v.errors.some((e) => e.includes('版本号'))).toBe(false)
  })

  it('非法结构返回 null（调用方提示格式不合法）', () => {
    expect(migrateUnifiedArchive(null)).toBeNull()
    expect(migrateUnifiedArchive({ foo: 1 })).toBeNull()
    expect(migrateUnifiedArchive({ events: [] })).toBeNull()
    expect(migrateUnifiedArchive({ events: [{ id: 'e1' }] })).toBeNull() // 缺 initialState
    expect(migrateUnifiedArchive({ initialState: { participants: [] } })).toBeNull() // 缺 events
  })
})
