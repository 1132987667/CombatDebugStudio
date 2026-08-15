/**
 * 封神榜数据层测试（M0 单元自检）
 *
 * 覆盖：种子导入幂等、校验服务（范围/唯一性/引用/删除保护）、健康检查、
 * 版本戳递增、操作日志、数据源切换、纯函数（nextEntityId/extractReferenceIds）。
 *
 * 运行: npx vitest run tests/unit/fengshen-data.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { DataPackageService } from '@/application/service/DataPackageService'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import type { IDataSource } from '@/domain/port/IDataSource'
import { extractReferenceIds, REFERENCE_RULES } from '@/domain/fengshen/schema'
import { resolveElementCoefficient } from '@/domain/fengshen/elementMatrix'
import { nextEntityId } from '@/domain/fengshen/types'
import { AffixId } from '@/shared/constants/affix'
import type { ActorData } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig } from '@/domain/skill/types'
import type { SceneData } from '@/shared/types/scene'

/** 按 store 分桶的内存版持久化存储 */
class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private buckets = new Map<string, Map<string, unknown>>()

  private bucket(store: string): Map<string, unknown> {
    let b = this.buckets.get(store)
    if (!b) {
      b = new Map()
      this.buckets.set(store, b)
    }
    return b
  }

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    this.bucket(store).set(key, value)
    return true
  }
  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    return (this.bucket(store).get(key) as T | undefined) ?? null
  }
  async remove(store: StorageStoreName, key: string): Promise<boolean> {
    return this.bucket(store).delete(key)
  }
  async keys(store: StorageStoreName): Promise<string[]> {
    return Array.from(this.bucket(store).keys())
  }
  async clear(store: StorageStoreName): Promise<boolean> {
    this.bucket(store).clear()
    return true
  }
  async keysByField(): Promise<string[]> {
    return []
  }
  async getStats(): Promise<StorageStats | null> {
    return null
  }
}

function makeServices() {
  const storage = new MemoryStorage()
  const api = new GameDataApi(storage)
  const integrity = new DataIntegrityService(storage)
  const write = new FengshenDataService(storage, integrity)
  return { storage, api, integrity, write }
}

const validActor: ActorData = {
  id: 'hero_001',
  name: '测试角色',
  level: 1,
  stats: { maxHealth: 100, attack: 12, defense: 5, speed: 10 },
  skillIds: ['skill_normal_attack'],
  faction: 'fire',
  energyInit: 30,
}

describe('种子导入 seedFengshenData', () => {
  it('首次导入写入各表并置 dataVersion 初值，二次调用幂等跳过', async () => {
    const storage = new MemoryStorage()
    const first = await seedFengshenData(storage)
    expect(first.imported).toBe(true)

    const enemyKeys = await storage.keys(FENGSHEN_STORE.ENEMIES)
    const skillKeys = await storage.keys(FENGSHEN_STORE.SKILLS)
    expect(enemyKeys.length).toBeGreaterThan(0)
    expect(skillKeys.length).toBeGreaterThan(0)

    // actors 从 guardian_* 派生 5 个，id 与敌人保持一致
    const actorKeys = await storage.keys(FENGSHEN_STORE.ACTORS)
    expect(actorKeys).toContain('guardian_fire')
    expect(actorKeys).toContain('guardian_gold')

    // 装备独立成表（configs/equipment），材料域不再含装备条目
    const materialKeys = await storage.keys(FENGSHEN_STORE.MATERIALS)
    expect(materialKeys).not.toContain('eq_w001')
    // 装备统一表：新装备（wp_/ar_/ac_）为主键，旧 eq_* 已合并（legacyIds），仅无对应新体系者保留 eq_* ID
    const equipKeys = await storage.keys(FENGSHEN_STORE.EQUIPMENT)
    expect(equipKeys).toContain('wp_t1_light_01')
    expect(equipKeys).not.toContain('eq_w001')
    expect(equipKeys).toContain('eq_c002')

    // 物品主键索引（items 表）：全量注册，新装备（wp_/ar_/ac_）+ 旧装备（eq_）ID 均在内
    const itemKeys = await storage.keys(FENGSHEN_STORE.ITEMS)
    expect(itemKeys).toContain('mat_taomu')
    expect(itemKeys).toContain('wp_t1_light_01')
    expect(itemKeys).toContain('ar_t1_light_01')
    expect(itemKeys).toContain('eq_w001')

    // 装备详情（gears 表）：全量可打造装备 46 件（43 常规 + 3 特殊装备烈焰斩/风灵袍/地灵护符）
    const gearKeys = await storage.keys(FENGSHEN_STORE.GEARS)
    expect(gearKeys).toHaveLength(46)
    expect(gearKeys).toContain('ac_t1_charm_01')

    // 词缀表：69 种种子词缀齐全（妖气 10 + 妖性 14 + 妖道 18 + 妖圣 12 + 天命 7 + 劫数 8）
    const affixKeys = await storage.keys(FENGSHEN_STORE.AFFIXES)
    expect(affixKeys).toHaveLength(69)
    expect(affixKeys).toContain('affix_yao_1_001')
    expect(affixKeys).toContain('affix_yao_1_010')
    expect(affixKeys).toContain('affix_yao_2_014')
    expect(affixKeys).toContain('affix_yao_3_018')
    expect(affixKeys).toContain('affix_yao_4_012')
    expect(affixKeys).toContain('affix_mandate_007')
    expect(affixKeys).toContain('affix_jie_008')

    // 词缀只含属性修正（statModifiers），不带能力效果（能力交给 Buff）；档位含 yao_3 / yao_4 / mandate / jie
    const buff3 = await storage.get<{ statModifiers?: unknown[]; effects?: unknown[] }>(FENGSHEN_STORE.AFFIXES, 'affix_yao_3_001')
    expect(buff3?.statModifiers?.length).toBeGreaterThan(0)
    expect(buff3?.effects).toBeUndefined()
    const buff4 = await storage.get<{ rarity?: number; tier?: string }>(FENGSHEN_STORE.AFFIXES, 'affix_yao_4_001')
    expect(buff4?.rarity).toBe(4)
    expect(buff4?.tier).toBe('yao_4')

    const version = await new GameDataApi(storage).getDataVersion()
    expect(version).toBe(1)

    const second = await seedFengshenData(storage)
    expect(second.imported).toBe(false)
  })

  it('装备合并自洽：craftable 装备有 blueprintId/materials，recipeId 与洞府配方一一对应，legacyIds 记录旧 ID', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)

    // 合并后主键为新体系 ID：竹剑 eq_w001 并入 wp_t1_light_01（legacyIds），旧 ID 不再独立存在于装备表
    const bamboo = await api.getEquipment('wp_t1_light_01')
    expect(bamboo?.craftable).toBe(true)
    expect(bamboo?.blueprintId).toBe('bp_t1_wp')
    expect(bamboo?.recipeId).toBe('forge_wp_t1_light_01')
    expect(bamboo?.legacyIds).toEqual(['eq_w001'])
    expect(bamboo?.materials?.length).toBeGreaterThan(0)

    // 可打造装备都关联图谱，且造不出无材料的
    const all = await api.listEquipment()
    const craftables = all.filter((e) => e.craftable)
    expect(craftables.length).toBeGreaterThan(0)
    for (const c of craftables) {
      expect(c.blueprintId).toBeTruthy()
      expect(c.materials?.length).toBeGreaterThan(0)
      expect(c.tier).toBeTruthy()
      expect(c.cost).toBeGreaterThan(0)
    }
    expect(all.filter((e) => e.recipeId).every((e) => e.craftable)).toBe(true)
  })

  it('种子导入包含西游场景，且全部场景引用的敌人均在库（合并后 scenes 以 xiyou/scenes.json 为权威）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)

    const sceneKeys = await storage.keys(FENGSHEN_STORE.SCENES)
    expect(sceneKeys.length).toBeGreaterThan(0)
    expect(sceneKeys).toContain('scene_1_1')

    // 逐场景校验 enemies/guardian 引用的敌人 id 都在 enemies 表（引用完整性）
    const enemyKeys = await storage.keys(FENGSHEN_STORE.ENEMIES)
    for (const key of sceneKeys) {
      const scene = await storage.get<SceneData>(FENGSHEN_STORE.SCENES, key)
      const sceneEnemyIds = new Set([
        ...(scene!.enemies ?? []).map((e) => e.id),
        ...(scene!.guardian?.id ? [scene!.guardian.id] : []),
      ])
      expect(sceneEnemyIds.size).toBeGreaterThan(0)
      for (const id of sceneEnemyIds) {
        expect(enemyKeys).toContain(id)
      }
    }
  })

  it('种子数据自洽：导入后健康检查无断裂引用', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const report = await new DataIntegrityService(storage).runHealthCheck()
    // NOTE: 材料域补全（42 种）+ buff_silence + effects 并入 buffs 表后，种子数据应完全自洽
    expect(report.issues).toEqual([])
  })
})

describe('DataIntegrityService 校验', () => {
  it('数值范围约束：等级越界保存失败', async () => {
    const { integrity } = makeServices()
    const result = await integrity.validateOnSave('actors', { ...validActor, level: 200 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('等级'))).toBe(true)
  })

  it('引用完整性：skillIds 引用不存在的技能被拦截', async () => {
    const { integrity } = makeServices()
    const result = await integrity.validateOnSave('actors', { ...validActor, skillIds: ['skill_not_exist'] })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('skill_not_exist'))).toBe(true)
  })

  it('唯一性：同名角色保存失败', async () => {
    const { integrity, write, storage } = makeServices()
    await seedFengshenData(storage)
    await write.save('actors', validActor)
    const result = await integrity.validateOnSave('actors', { ...validActor, id: 'hero_002' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true)
  })

  it('词缀：必填名称 + 档位枚举校验，同名词缀保存失败', async () => {
    const { integrity, write, storage } = makeServices()
    await seedFengshenData(storage)
    // 缺名称被拦截
    const noName = await integrity.validateOnSave('affixes', {
      id: 'affix_test_1',
      tier: 'yao_1',
      target: 'enemy',
      statModifiers: [{ attribute: 'attack', percent: 20 }],
    })
    expect(noName.valid).toBe(false)
    expect(noName.errors.some((e) => e.includes('名称'))).toBe(true)

    // 同名词缀（已存在 affix_yao_1_001 的「蛮力」）被拦截
    const dup = await integrity.validateOnSave('affixes', {
      id: 'affix_test_3',
      name: '蛮力',
      tier: 'yao_1',
      target: 'enemy',
      statModifiers: [],
    })
    expect(dup.valid).toBe(false)
    expect(dup.errors.some((e) => e.includes('重复'))).toBe(true)

    // 合法词缀可保存
    const ok = await write.save('affixes', {
      id: 'affix_test_ok',
      name: '测试蛮力',
      tier: 'yao_1',
      target: 'enemy',
      statModifiers: [{ attribute: 'attack', percent: 20 }],
      description: '测试',
    })
    expect(ok.ok).toBe(true)
  })

  it('删除保护：词缀被敌人引用时无法删除', async () => {
    const { storage } = makeServices()
    await seedFengshenData(storage)
    // 给一个敌人附加词缀引用
    await storage.set(FENGSHEN_STORE.ENEMIES, 'enemy_affix_test', {
      id: 'enemy_affix_test',
      name: '词缀测试敌',
      level: 1,
      stats: {},
      drops: [],
      skills: {},
      affixes: ['affix_yao_1_001'],
      updatedAt: new Date().toISOString(),
    })
    const integrity = new DataIntegrityService(storage)
    const write2 = new FengshenDataService(storage, integrity)
    const result = await write2.remove('affixes', 'affix_yao_1_001')
    expect(result.ok).toBe(false)
    expect(result.errors?.[0]).toContain('被以下数据引用')
  })

  it('删除保护：被预设阵容引用的阵型无法删除', async () => {
    const { storage } = makeServices()
    await seedFengshenData(storage)
    const integrity = new DataIntegrityService(storage)
    const write2 = new FengshenDataService(storage, integrity)

    // lineups 引用了 crane_wing（seed 阵容），删除应被拦截
    const result = await write2.remove('formations', 'crane_wing')
    expect(result.ok).toBe(false)
    expect(result.errors?.[0]).toContain('被以下数据引用')
  })
})

describe('健康检查 runHealthCheck', () => {
  it('构造断裂引用后输出完整报告', async () => {
    const { integrity, storage } = makeServices()
    await seedFengshenData(storage)
    // 造一个引用不存在 Buff 的技能
    await storage.set(FENGSHEN_STORE.SKILLS, 'skill_broken', {
      id: 'skill_broken',
      name: '断裂技能',
      steps: [{ type: 'apply_buff', effectId: 'buff_not_exist' }],
      updatedAt: new Date().toISOString(),
    })
    const report = await integrity.runHealthCheck()
    const hit = report.issues.find((i) => i.sourceId === 'skill_broken' && i.missingId === 'buff_not_exist')
    expect(hit).toBeDefined()
    expect(hit?.targetTable).toBe('buffs')
  })
})

describe('DataPackageService 导入导出', () => {
  it('完整导出含全部数据表；导出→清空→导入可还原', async () => {
    const src = new MemoryStorage()
    await seedFengshenData(src)
    const pkgService = new DataPackageService(src, new DataIntegrityService(src))

    const pkg = await pkgService.exportPackage()
    expect(pkg.meta.count).toBeGreaterThan(0)
    expect(pkg.meta.tables).toContain('actors')
    expect(Array.isArray(pkg.actors)).toBe(true)

    // 还原到全新 storage：覆盖导入
    const dst = new MemoryStorage()
    const dstIntegrity = new DataIntegrityService(dst)
    const result = await new DataPackageService(dst, dstIntegrity).importPackage(pkg, 'overwrite')
    expect(result.ok).toBe(true)
    expect(result.importedCount).toBe(pkg.meta.count)

    const srcApi = new GameDataApi(src)
    const dstApi = new GameDataApi(dst)
    expect(await dstApi.getDataVersion()).toBe(await srcApi.getDataVersion())
    const actorsSrc = await srcApi.listByTable('actors', { limit: 1000 })
    const actorsDst = await dstApi.listByTable('actors', { limit: 1000 })
    expect(actorsDst.map((a) => (a as { id: string }).id).sort()).toEqual(
      actorsSrc.map((a) => (a as { id: string }).id).sort(),
    )
  })

  it('增量合并（保留现有）：冲突 ID 跳过，不覆盖已有', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const pkg = await new DataPackageService(storage, new DataIntegrityService(storage)).exportPackage(['actors'])

    // 修改一条 actor 后再导入同一包：merge-keep-existing 应保留修改
    const api = new GameDataApi(storage)
    const write = new FengshenDataService(storage, new DataIntegrityService(storage))
    await write.save('actors', { id: 'guardian_fire', name: '火护法·已修改', level: 10, stats: {}, skillIds: [] })

    const pkgService = new DataPackageService(storage, new DataIntegrityService(storage))
    const result = await pkgService.importPackage(pkg, 'merge-keep-existing')
    expect(result.importedCount).toBe(0) // 全部冲突跳过
    expect(result.skippedCount).toBeGreaterThan(0)

    const actor = await api.getActorById('guardian_fire')
    expect(actor?.name).toBe('火护法·已修改')
  })

  it('导入非法数据包被拒绝', async () => {
    const storage = new MemoryStorage()
    const result = await new DataPackageService(storage, new DataIntegrityService(storage)).importPackage(
      { meta: {} } as never,
      'overwrite',
    )
    expect(result.ok).toBe(false)
    expect(result.errors?.[0]).toContain('meta.tables')
  })

  it('导入成功触发 onDataChanged 回调（与常规写操作同机制）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const service = new DataPackageService(storage, new DataIntegrityService(storage))
    let notified: number | null = null
    service.onDataChanged = (v) => {
      notified = v
    }
    const before = await new GameDataApi(storage).getDataVersion()
    const pkg = await service.exportPackage(['actors'])
    const result = await service.importPackage(pkg, 'overwrite')
    expect(result.ok).toBe(true)
    expect(notified).toBe(before + 1)
  })
})

describe('FengshenDataService 版本戳与操作日志', () => {
  it('保存递增 dataVersion 并写入操作日志，onDataChanged 回调触发', async () => {
    const { write, api, storage } = makeServices()
    await seedFengshenData(storage)
    let notified: number | null = null
    write.onDataChanged = (v) => {
      notified = v
    }
    const before = await api.getDataVersion()
    const result = await write.save('actors', validActor)
    expect(result.ok).toBe(true)
    expect(await api.getDataVersion()).toBe(before + 1)
    expect(notified).toBe(before + 1)

    const logs = await api.listOperationLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].op).toBe('create')
    expect(logs[0].table).toBe('actors')
    expect(logs[0].entityId).toBe('hero_001')
  })

  it('写失败（set 返回 false，如 QuotaExceeded）返回 ok:false 且不递增版本（L1：不误报已保存）', async () => {
    const { storage, write } = makeServices()
    await seedFengshenData(storage)
    // 注入失败：set 一律返回 false
    const orig = storage.set.bind(storage)
    storage.set = async () => false
    try {
      const before = await storage.get(FENGSHEN_STORE.META, 'dataVersion')
      const result = await write.save('actors', validActor)
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toContain('写入失败')
      // 版本未递增（save 失败不 bumpVersion）
      const after = await storage.get(FENGSHEN_STORE.META, 'dataVersion')
      expect(after).toEqual(before)
    } finally {
      storage.set = orig
    }
  })

  it('删除失败（remove 返回 false）返回 ok:false（L1）', async () => {
    const { storage, write } = makeServices()
    await seedFengshenData(storage)
    const orig = storage.remove.bind(storage)
    storage.remove = async () => false
    try {
      const result = await write.remove('actors', 'hero_001')
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toContain('删除失败')
    } finally {
      storage.remove = orig
    }
  })
})

describe('数据源切换（GameDataProcessor）', () => {
  beforeEach(() => {
    // 恢复默认数据源，避免测试间污染
    GameDataProcessor.setDataSource(new ConfigDataSource())
  })

  it('setDataSource 后 getEnemiesData 返回新源数据', () => {
    const fakeEnemy: Enemy = {
      id: 'enemy_fake',
      name: '假敌人',
      level: 1,
      stats: {},
      drops: [],
      skills: {},
    }
    const source: IDataSource = {
      getEnemies: () => [fakeEnemy],
      getSkills: () => [] as SkillConfig[],
      getScenes: () => [] as SceneData[],
      getLineups: () => [],
      getAffixes: () => [],
    }
    GameDataProcessor.setDataSource(source)
    expect(GameDataProcessor.findEnemyById('enemy_fake')?.name).toBe('假敌人')
    expect(GameDataProcessor.findEnemyById('enemy_not_exist')).toBeUndefined()
  })

  it('lineupToEnemies 按 seatIndex 排序展开敌人参战者，查不到的站位跳过', () => {
    const source: IDataSource = {
      getEnemies: () => [
        {
          id: 'enemy_a',
          name: '敌人A',
          level: 5,
          stats: { currentHealth: 100, attack: 11, defense: 3, speed: 8 },
          drops: [],
          skills: { small: ['skill_normal_attack'] },
        } as Enemy,
      ],
      getSkills: () => [] as SkillConfig[],
      getScenes: () => [] as SceneData[],
      getLineups: () => [],
      getAffixes: () => [],
    }
    GameDataProcessor.setDataSource(source)
    const lineup = {
      id: 'lineup_t',
      name: '测试阵容',
      formationId: 'crane_wing',
      roles: [
        { seatIndex: 1, roleId: 'enemy_missing' },
        { seatIndex: 0, roleId: 'enemy_a' },
      ],
    }
    const participants = GameDataProcessor.lineupToEnemies(lineup)
    expect(participants).toHaveLength(1)
    expect(participants[0].seatIndex).toBe(0)
  })

  it('findLineupById 命中数据源阵容', () => {
    const source: IDataSource = {
      getEnemies: () => [],
      getSkills: () => [] as SkillConfig[],
      getScenes: () => [] as SceneData[],
      getLineups: () => [
        { id: 'lineup_1', name: '阵容1', formationId: 'f1', roles: [] },
      ],
      getAffixes: () => [],
    }
    GameDataProcessor.setDataSource(source)
    expect(GameDataProcessor.findLineupById('lineup_1')?.name).toBe('阵容1')
    expect(GameDataProcessor.findLineupById('lineup_missing')).toBeUndefined()
  })
})

describe('纯函数', () => {
  it('nextEntityId 前缀自增并补零', () => {
    expect(nextEntityId(['hero_001', 'hero_002'], 'hero_')).toBe('hero_003')
    expect(nextEntityId([], 'hero_')).toBe('hero_001')
    expect(nextEntityId(['boss_001'], 'hero_')).toBe('hero_001')
  })

  it('resolveElementCoefficient：命中克制矩阵取系数，无匹配/缺阵营取默认值', () => {
    const matrix = {
      matrix: [{ attackerId: 'fire', defenderId: 'wood', coefficient: 1.2 }],
      defaultCoefficient: 1.0,
    }
    expect(resolveElementCoefficient(matrix, 'fire', 'wood')).toBe(1.2)
    expect(resolveElementCoefficient(matrix, 'fire', 'earth')).toBe(1.0)
    expect(resolveElementCoefficient(matrix, undefined, 'wood')).toBe(1.0)
    expect(resolveElementCoefficient(undefined, 'fire', 'wood')).toBe(1.0)
  })

  it('resolveElementCoefficient：faction 缺失时不受 defaultCoefficient 影响（恒 1.0）', () => {
    const matrix = {
      matrix: [],
      defaultCoefficient: 1.2,
    }
    // 无阵营的实体不应被全局默认系数缩放
    expect(resolveElementCoefficient(matrix, undefined, 'wood')).toBe(1.0)
    expect(resolveElementCoefficient(matrix, 'fire', undefined)).toBe(1.0)
    expect(resolveElementCoefficient(matrix, undefined, undefined)).toBe(1.0)
    // 双方都有阵营但矩阵无匹配 → 用 defaultCoefficient
    expect(resolveElementCoefficient(matrix, 'fire', 'wood')).toBe(1.2)
  })

  it('extractReferenceIds 支持数组遍历与顶层数组', () => {
    expect(extractReferenceIds({ skillIds: ['a', 'b'] }, 'skillIds')).toEqual(['a', 'b'])
    expect(
      extractReferenceIds({ steps: [{ effectId: 'x' }, { effectId: 'y' }] }, 'steps[].effectId'),
    ).toEqual(['x', 'y'])
    expect(extractReferenceIds({ enemies: [{ id: 'e1' }, { id: 'e2' }] }, 'enemies[].id')).toEqual(['e1', 'e2'])
    expect(extractReferenceIds({ foo: undefined }, 'foo')).toEqual([])
  })

  it('REFERENCE_RULES 覆盖规格说明书要求的引用关系', () => {
    const keys = REFERENCE_RULES.map((r) => `${r.sourceTable}.${r.path}`)
    expect(keys).toContain('actors.skillIds')
    expect(keys).toContain('skills.steps[].effectId')
    expect(keys).toContain('scenes.enemies[].id')
    expect(keys).toContain('scenes.guardian.id')
    expect(keys).toContain('scenes.unlockCondition.sceneId')
    expect(keys).toContain('lineups.formationId')
    expect(keys).toContain('lineups.roles[].roleId')
    expect(keys).toContain('enemies.drops[].itemId')
    expect(keys).toContain('enemies.affixes')
    expect(keys).toContain('equipment.factionRestriction')
    expect(keys).toContain('actors.growth')
  })

  it('词缀数据与 AffixId 常量一一对应（防漂移）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const dataIds = (await api.listByTable<{ id: string }>('affixes', { limit: 1000 })).map((a) => a.id)
    const constIds = Object.values(AffixId)
    expect(new Set(dataIds)).toEqual(new Set(constIds))
    expect(dataIds.length).toBe(constIds.length)
  })
})

describe('GameDataApi.listByTable id 排序', () => {
  it('按 id 升序返回（数字感知：actors_002 < actors_010 < actors_100）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    // 覆盖写入乱序 id 记录（seed 已有若干 actor，追加高低位）
    await storage.set(FENGSHEN_STORE.ACTORS, 'hero_010', { ...validActor, id: 'hero_010', name: '甲' })
    await storage.set(FENGSHEN_STORE.ACTORS, 'hero_100', { ...validActor, id: 'hero_100', name: '乙' })
    await storage.set(FENGSHEN_STORE.ACTORS, 'hero_002', { ...validActor, id: 'hero_002', name: '丙' })

    const rows = await new GameDataApi(storage).listByTable<{ id: string }>('actors')
    const nums = rows.map((r) => Number(r.id.match(/(\d+)$/)?.[1] ?? 0))
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
  })

  it('无数字后缀 id（seed 常见，如 growth_* / guardian_*）按字典序排列', async () => {
    const storage = new MemoryStorage()
    // 按乱序写入四条 growth（与 seed 写入顺序相反），列表应呈现字典序
    await storage.set(FENGSHEN_STORE.GROWTH, 'growth_speed', { id: 'growth_speed', name: '速度' })
    await storage.set(FENGSHEN_STORE.GROWTH, 'growth_balanced', { id: 'growth_balanced', name: '均衡' })
    await storage.set(FENGSHEN_STORE.GROWTH, 'growth_defense', { id: 'growth_defense', name: '防御' })
    await storage.set(FENGSHEN_STORE.GROWTH, 'growth_attack', { id: 'growth_attack', name: '攻击' })

    const rows = await new GameDataApi(storage).listByTable<{ id: string }>('growth')
    expect(rows.map((r) => r.id)).toEqual([
      'growth_attack',
      'growth_balanced',
      'growth_defense',
      'growth_speed',
    ])
  })

  it('无数字后缀的 id（如 elements 固定 id）与数值 id 共存时不报错', async () => {
    const storage = new MemoryStorage()
    await storage.set(FENGSHEN_STORE.ELEMENTS, 'elements', { id: 'elements', name: '元素矩阵', matrix: [] })
    const rows = await new GameDataApi(storage).listByTable<{ id: string }>('elements')
    expect(rows.map((r) => r.id)).toEqual(['elements'])
  })
})
