/**
 * B2 交付闭环服务层单测：数值快照归档/回滚（SnapshotService）+ 数据包 dry-run/
 * overwrite 兜底快照/导出 meta/包 diff（DataPackageService 扩展）。
 *
 * 运行: npx vitest run tests/unit/fengshen-delivery.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE, STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'
import { DataPackageService, type DataPackage } from '@/application/service/DataPackageService'
import { SnapshotService, SNAPSHOT_INDEX_KEY, MAX_SNAPSHOTS, type ValueSnapshot } from '@/application/service/SnapshotService'

/** 按 store 分桶的内存版持久化存储（与 fengshen-data.test.ts 同构） */
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

  /** 测试辅助：整表 JSON 快照（逐字段一致性断言用） */
  dump(store: StorageStoreName): Record<string, unknown> {
    return Object.fromEntries(this.bucket(store))
  }
}

function makeEnv() {
  const storage = new MemoryStorage()
  const integrity = new DataIntegrityService(storage)
  const snapshots = new SnapshotService(storage, integrity)
  const packages = new DataPackageService(storage, integrity, snapshots)
  return { storage, integrity, snapshots, packages }
}

/** 可注入写失败的存储：模拟配额满 / 存储不可用 */
class FlakyStorage extends MemoryStorage {
  failSnapshotIndex = false
  failSetStore: string | null = null

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    if (this.failSnapshotIndex && store === STORAGE_STORE.SNAPSHOTS && key === SNAPSHOT_INDEX_KEY) return false
    if (this.failSetStore && store === this.failSetStore) return false
    return super.set(store, key, value)
  }
}

async function seedVersion(storage: MemoryStorage, version = 1): Promise<void> {
  await storage.set(FENGSHEN_STORE.META, 'dataVersion', { id: 'dataVersion', version, updatedAt: new Date().toISOString() })
}

async function putRow(storage: MemoryStorage, table: StorageStoreName, id: string, row: Record<string, unknown>): Promise<void> {
  await storage.set(table, id, { id, ...row, updatedAt: new Date().toISOString() })
}

let env: ReturnType<typeof makeEnv>
beforeEach(async () => {
  env = makeEnv()
  await seedVersion(env.storage)
})

describe('SnapshotService 快照归档与回滚', () => {
  it('create：指定表集归档为 id→实体 拷贝，meta 轻量索引不含表数据', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: '参数一', value: 15 })
    const { snapshot, pruned } = await env.snapshots.create('平衡版A', ['params'])
    expect(pruned).toEqual([])
    expect(snapshot.id).toMatch(/^snap_\d+/)
    expect(snapshot.label).toBe('平衡版A')
    expect(snapshot.dataVersion).toBe(1)
    expect(snapshot.tables.params.p1).toMatchObject({ value: 15 })
    expect(snapshot.tables.params.p1.updatedAt).toBeTruthy()

    const list = await env.snapshots.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: snapshot.id, label: '平衡版A', rowCount: 1, tables: ['params'] })
    // 索引行不能携带表数据（列表页轻量渲染的前提）
    expect((list[0] as unknown as Record<string, unknown>).tables).toEqual(['params'])
    expect((list[0] as unknown as ValueSnapshot).tables?.params).toBeUndefined()
  })

  it('create：缺省表集 = 数值体系 4 表（params/attributes/growth/elements）', async () => {
    const { snapshot } = await env.snapshots.create('默认域')
    expect(Object.keys(snapshot.tables).sort()).toEqual(['attributes', 'elements', 'growth', 'params'])
  })

  it('保留最近 20 份，溢出删除最旧并带回 pruned 列表', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i++) {
      await env.snapshots.create(`快照${i}`, ['params'])
    }
    const list = await env.snapshots.list()
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[0].label).toBe(`快照${MAX_SNAPSHOTS + 1}`) // 最新在前
    expect(list[list.length - 1].label).toBe('快照2') // 快照0/1 已被修剪
    const { pruned } = await env.snapshots.create('再一份', ['params'])
    expect(pruned.map((p) => p.label)).toEqual(['快照2'])
    expect(await env.snapshots.get(pruned[0].id)).toBeNull()
  })

  it('remove：数据与索引同时清除', async () => {
    const { snapshot } = await env.snapshots.create('待删', ['params'])
    expect(await env.snapshots.remove(snapshot.id)).toBe(true)
    expect(await env.snapshots.get(snapshot.id)).toBeNull()
    expect(await env.snapshots.list()).toHaveLength(0)
  })

  it('diffWithCurrent：改 / 加 / 删行后三类齐全', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 100 })
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p2', { name: 'p2', value: 1 })
    const { snapshot } = await env.snapshots.create('基线', ['params'])

    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 130 })
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p3', { name: 'p3', value: 9 })
    await env.storage.remove(FENGSHEN_STORE.PARAMS, 'p2')

    const diff = await env.snapshots.diffWithCurrent(snapshot.id)
    expect(diff.added).toEqual([{ table: 'params', id: 'p3' }])
    expect(diff.removed).toEqual([{ table: 'params', id: 'p2' }])
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0]).toMatchObject({ id: 'p1', field: 'value', before: 100, after: 130 })
    expect(diff.changed[0]?.deltaPercent).toBeCloseTo(30, 10)
  })

  it('回滚后各表与快照逐字段一致（含 updatedAt），快照后新增行被清除', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })
    await putRow(env.storage, FENGSHEN_STORE.ATTRIBUTES, 'atk', { name: '攻击', sapMultiplier: 2 })
    const { snapshot } = await env.snapshots.create('回滚目标', ['params', 'attributes'])

    // 快照后：改值、新增、删除各来一笔
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 999 })
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p_new', { name: '新参数', value: 5 })
    await env.storage.remove(FENGSHEN_STORE.ATTRIBUTES, 'atk')

    await env.snapshots.rollback(snapshot.id)

    // 验收口径：回滚后各表与快照逐字段一致
    expect(env.storage.dump(FENGSHEN_STORE.PARAMS)).toEqual(snapshot.tables.params)
    expect(env.storage.dump(FENGSHEN_STORE.ATTRIBUTES)).toEqual(snapshot.tables.attributes)
  })

  it('回滚递增 dataVersion 并写 op=rollback 操作日志', async () => {
    const { snapshot } = await env.snapshots.create('回滚日志', ['params'])
    const { version } = await env.snapshots.rollback(snapshot.id)
    expect(version).toBe(2)
    const logs = Object.values(env.storage.dump(FENGSHEN_STORE.META)) as Array<{ op?: string; entityId?: string }>
    expect(logs.some((l) => l.op === 'rollback' && l.entityId === 'params')).toBe(true)
  })

  it('回滚不存在的快照抛错', async () => {
    await expect(env.snapshots.rollback('snap_missing')).rejects.toThrow(/不存在/)
    await expect(env.snapshots.diffWithCurrent('snap_missing')).rejects.toThrow(/不存在/)
  })

  it('回滚后健康检查带回断裂引用（对齐导入行为）', async () => {
    // 库内预置断裂引用：actors 引用不存在的技能；回滚本身不修复也不放大它
    await env.storage.set(FENGSHEN_STORE.ACTORS, 'hero_broken', {
      id: 'hero_broken',
      name: '断链角色',
      skillIds: ['skill_nope'],
      updatedAt: new Date().toISOString(),
    })
    const { snapshot } = await env.snapshots.create('基线', ['params'])
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })

    const result = await env.snapshots.rollback(snapshot.id)
    expect(result.issues).toBeDefined()
    expect(result.issues!.length).toBeGreaterThan(0)
    expect(result.issues!.some((i) => i.sourceId === 'hero_broken' && i.missingId === 'skill_nope')).toBe(true)
  })
})

describe('SnapshotService 写失败处置（FlakyStorage）', () => {
  it('创建快照时索引写失败：抛错且不静默丢失索引', async () => {
    const storage = new FlakyStorage()
    storage.failSnapshotIndex = true
    const snapshots = new SnapshotService(storage, new DataIntegrityService(storage))
    await expect(snapshots.create('会失败', ['params'])).rejects.toThrow(/索引更新失败/)
  })

  it('回滚时行写入失败：抛错提示内容可能不完整', async () => {
    const storage = new FlakyStorage()
    const snapshots = new SnapshotService(storage, new DataIntegrityService(storage))
    await storage.set(FENGSHEN_STORE.META, 'dataVersion', { id: 'dataVersion', version: 1, updatedAt: new Date().toISOString() })
    await putRow(storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })
    const { snapshot } = await snapshots.create('目标', ['params'])

    // rollback 会 clear 后整表写回：写回阶段命中失败开关
    storage.failSetStore = FENGSHEN_STORE.PARAMS
    await expect(snapshots.rollback(snapshot.id)).rejects.toThrow(/可能不完整/)
  })
})

describe('DataPackageService dry-run 预演', () => {
  const makePkg = (rows: Array<Record<string, unknown>>): DataPackage => ({
    meta: { dataVersion: 9, exportedAt: new Date().toISOString(), tables: ['params'], count: rows.length },
    params: rows,
  })

  it('merge-keep-existing：已存在进 skip，新 id 进 add', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })
    const report = await env.packages.dryRunImport(
      makePkg([
        { id: 'p1', name: 'p1', value: 50 },
        { id: 'p2', name: 'p2', value: 2 },
      ]),
      'merge-keep-existing',
    )
    expect(report.add).toEqual([{ table: 'params', id: 'p2', name: 'p2' }])
    expect(report.skip).toEqual([{ table: 'params', id: 'p1', name: 'p1' }])
    expect(report.overwrite).toEqual([])
    expect(report.removed).toEqual([])
    expect(report.invalid).toBe(0)
  })

  it('merge-package-wins：已存在进 overwrite 且附字段级 diff（updatedAt 不参与）', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1, note: '旧' })
    const report = await env.packages.dryRunImport(
      makePkg([{ id: 'p1', name: 'p1', value: 8, note: '新', updatedAt: '包时间' }]),
      'merge-package-wins',
    )
    expect(report.overwrite).toHaveLength(1)
    const fields = report.overwrite[0].fieldDiffs?.map((d) => d.key).sort()
    expect(fields).toEqual(['note', 'value'])
    const valueDiff = report.overwrite[0].fieldDiffs?.find((d) => d.key === 'value')
    expect(valueDiff).toMatchObject({ before: '1', after: '8' })
  })

  it('overwrite：包未携带的现有行进 removed（被清表点名）', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p_only_db', { name: '孤儿', value: 2 })
    const report = await env.packages.dryRunImport(makePkg([{ id: 'p1', name: 'p1', value: 7 }]), 'overwrite')
    // overwrite 策略下同 id 以包为准覆盖（不算 removed），包外行才 removed
    expect(report.overwrite).toEqual([expect.objectContaining({ table: 'params', id: 'p1' })])
    expect(report.removed).toEqual([{ table: 'params', id: 'p_only_db', name: '孤儿' }])
  })

  it('无合法 id 的行计入 invalid，不进任何清单', async () => {
    const report = await env.packages.dryRunImport(makePkg([{ name: '坏行' }, { id: '', name: '空id' }]), 'merge-keep-existing')
    expect(report.invalid).toBe(2)
    expect(report.add).toHaveLength(0)
  })

  it('diffPackages 只认白名单表键，畸形 __proto__ 键不生效也不污染原型', async () => {
    // 模拟包文件里 __proto__ 落为 own property（JSON.parse 语义）
    const evil = JSON.parse(
      `{"meta":{"dataVersion":1,"exportedAt":"","tables":["params","__proto__"],"count":1},` +
        `"params":[{"id":"p1","value":1,"updatedAt":"x"}],"__proto__":[{"id":"injected"}]}`,
    ) as DataPackage
    const diff = await env.packages.diffPackages(evil, evil)
    expect(diff.added).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
    // Object.prototype 未被污染
    expect(({} as Record<string, unknown>).injected).toBeUndefined()
  })

  it('导入结果分列 invalidCount：无 id 行不再混入 skippedCount', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: 'p1', value: 1 })
    const pkg: DataPackage = {
      meta: { dataVersion: 9, exportedAt: new Date().toISOString(), tables: ['params'], count: 3 },
      params: [
        { id: 'p1', name: 'p1', value: 2 }, // keep-existing 命中 → skippedCount
        { id: 'p2', name: 'p2', value: 3 }, // 新增
        { name: '坏行' }, // invalid
      ],
    }
    const result = await env.packages.importPackage(pkg, 'merge-keep-existing')
    expect(result.ok).toBe(true)
    expect(result.importedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.invalidCount).toBe(1)
  })
})

describe('DataPackageService overwrite 兜底快照与导出 meta', () => {
  it('overwrite 导入前自动创建兜底快照，内容 = 导入前的库状态', async () => {
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p1', { name: '导入前', value: 1 })
    await putRow(env.storage, FENGSHEN_STORE.PARAMS, 'p2', { name: '将被清', value: 2 })
    const pkg: DataPackage = {
      meta: { dataVersion: 9, exportedAt: new Date().toISOString(), tables: ['params'], count: 1 },
      params: [{ id: 'p1', name: '包内', value: 100 }],
    }
    const result = await env.packages.importPackage(pkg, 'overwrite')
    expect(result.ok).toBe(true)
    expect(result.backupSnapshotId).toMatch(/^snap_/)

    const backup = await env.snapshots.get(result.backupSnapshotId!) as ValueSnapshot
    expect(backup).not.toBeNull()
    expect(backup.tables.params.p1).toMatchObject({ value: 1 })
    expect(backup.tables.params.p2).toBeTruthy() // 包外行也在快照里
    // 导入后的库已被覆盖
    expect(await env.storage.get<Record<string, unknown>>(FENGSHEN_STORE.PARAMS, 'p2')).toBeNull()
  })

  it('未注入 SnapshotService 时 overwrite 保持旧行为（不兜底不阻断）', async () => {
    const legacy = new DataPackageService(env.storage, new DataIntegrityService(env.storage))
    const pkg: DataPackage = {
      meta: { dataVersion: 9, exportedAt: new Date().toISOString(), tables: ['params'], count: 1 },
      params: [{ id: 'p1', name: '包内', value: 100 }],
    }
    const result = await legacy.importPackage(pkg, 'overwrite')
    expect(result.ok).toBe(true)
    expect(result.backupSnapshotId).toBeUndefined()
  })

  it('exportPackage：导出人 / 用途 / 目标消费方落 meta', async () => {
    const pkg = await env.packages.exportPackage(['params'], {
      exportedBy: '策划甲',
      purpose: '9.29 平衡调整备份',
      consumer: '数值组',
    })
    expect(pkg.meta.exportedBy).toBe('策划甲')
    expect(pkg.meta.purpose).toBe('9.29 平衡调整备份')
    expect(pkg.meta.consumer).toBe('数值组')
    expect(pkg.meta.tables).toEqual(['params'])
  })

  it('diffPackages：新增 / 删除 / 字段变更三色', async () => {
    const a: DataPackage = {
      meta: { dataVersion: 1, exportedAt: '', tables: ['params'], count: 2 },
      params: [
        { id: 'p1', value: 10, updatedAt: 'x' },
        { id: 'p2', value: 20, updatedAt: 'x' },
      ],
    }
    const b: DataPackage = {
      meta: { dataVersion: 2, exportedAt: '', tables: ['params'], count: 2 },
      params: [
        { id: 'p1', value: 15, updatedAt: 'y' }, // 变更
        { id: 'p3', value: 30, updatedAt: 'y' }, // 新增
      ],
    }
    const diff = await env.packages.diffPackages(a, b)
    expect(diff.added).toEqual([{ table: 'params', id: 'p3' }])
    expect(diff.removed).toEqual([{ table: 'params', id: 'p2' }])
    expect(diff.changed).toEqual([expect.objectContaining({ id: 'p1', field: 'value', before: 10, after: 15 })])
    expect(diff.changed[0]?.deltaPercent).toBeCloseTo(50, 10)
  })

  it('战斗数据快照 buildSnapshot 仍写入 snapshots store（回放链路回归点）', async () => {
    const snap = await env.packages.buildSnapshot('battle_1')
    expect(snap).not.toBeNull()
    const stored = await env.storage.get<{ battleId: string }>(STORAGE_STORE.SNAPSHOTS, snap!.key)
    expect(stored?.battleId).toBe('battle_1')
  })
})
