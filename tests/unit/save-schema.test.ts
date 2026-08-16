/**
 * save-schema.test.ts — 存档数据结构 / 校验 / 迁移（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 初始状态完整性、checksum 附着与篡改检出、必填字段校验、v1.x→v2.0.0 装备槽迁移
 */
import { describe, expect, it } from 'vitest'
import {
  attachChecksum,
  createInitialGameState,
  SAVE_VERSION,
  validateSaveData,
  verifySaveChecksum,
} from '@/shared/utils/save-schema'
import { migrateEquipmentSlots, migrateSave } from '@/shared/utils/save-migrate'

describe('createInitialGameState', () => {
  it('返回完整 v2.0.0 初始档', () => {
    const s = createInitialGameState()
    expect(s.meta.version).toBe(SAVE_VERSION)
    expect(s.player).toMatchObject({ level: 1, exp: 0, hp_max: 100, energy_max: 150, base_atk: [5, 8] })
    expect(s.equipment).toEqual({ weapon: null, armor: null, helmet: null, boots: null, charm: null, ring: null })
    expect(validateSaveData(s).ok).toBe(true)
  })
})

describe('checksum 附着与校验', () => {
  it('attachChecksum 后 verifySaveChecksum 通过', () => {
    const data = attachChecksum(createInitialGameState())
    expect(data.meta.checksum).toBeTruthy()
    expect(verifySaveChecksum(data)).toBe(true)
  })

  it('篡改任意字段后校验失败', () => {
    const data = attachChecksum(createInitialGameState())
    data.player.gold = 999
    expect(verifySaveChecksum(data)).toBe(false)
  })

  it('无 checksum 视为不可校验（旧档）', () => {
    const data = createInitialGameState()
    expect(verifySaveChecksum(data)).toBe(false)
  })
})

describe('validateSaveData', () => {
  it('缺失必填字段时返回具体缺失项', () => {
    const r = validateSaveData({ meta: { version: '2.0.0' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('player')
    const r2 = validateSaveData({ meta: { version: '2.0.0' }, player: {}, progress: {}, inventory: {}, equipment: {} })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toContain('progress.current_scene')
  })

  it('非对象输入直接拒绝', () => {
    expect(validateSaveData(null).ok).toBe(false)
    expect(validateSaveData('x').ok).toBe(false)
  })
})

describe('migrateEquipmentSlots（v1.x → v2.0.0）', () => {
  it('8 槽旧档映射为 6 槽：belt→boots / bracelet→charm / necklace+crown→helmet', () => {
    const out = migrateEquipmentSlots({
      meta: { version: '1.0.0' },
      equipment: {
        weapon: 'wp_old',
        armor: 'ar_old',
        ring: 'ring_old',
        necklace: 'neck_old',
        crown: 'crown_old',
        belt: 'belt_old',
        bracelet: 'brace_old',
      },
    })
    expect(out.meta.version).toBe('2.0.0')
    expect(out.equipment).toEqual({
      weapon: 'wp_old',
      armor: 'ar_old',
      helmet: 'neck_old',
      boots: 'belt_old',
      charm: 'brace_old',
      ring: 'ring_old',
    })
    // crown 未入 helmet 的旧饰品移入背包，防丢失
    expect(out.inventory.equipments['crown_old']).toBe(1)
  })

  it('necklace/crown 均空时 helmet 为 null', () => {
    const out = migrateEquipmentSlots({ equipment: { weapon: 'w' } })
    expect(out.equipment.helmet).toBeNull()
    expect(out.equipment.weapon).toBe('w')
  })

  it('非对象 / 空输入不抛错（静默回退初始档）', () => {
    const out = migrateEquipmentSlots(null)
    expect(out.meta.version).toBe('2.0.0')
    expect(out.player.level).toBe(1)
  })
})

describe('migrateSave 入口', () => {
  it('v2.0.0 不迁移', () => {
    const s = createInitialGameState()
    expect(migrateSave(s)).toBe(s)
  })

  it('无 version 的旧档走迁移链且不抛错', () => {
    const out = migrateSave({ equipment: { belt: 'belt_old' } })
    expect(out.equipment.boots).toBe('belt_old')
  })
})
