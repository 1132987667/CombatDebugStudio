/**
 * 封神榜 · 经验与金钱管理功能域测试
 *
 * 覆盖：
 * - 纯函数：等级差条件匹配 / 规则匹配与钳制 / 升级经验查询 / 敌人奖励插值 / 结算计算
 * - seed：params 域三条结构化种子（exp_table / enemy_reward_table / level_diff_bonus）导入
 * - API：GameDataApi 查询三表
 * - 数据源：BattleDataLoader 预载后 IDataSource 出口
 * - 校验：DataIntegrityService 保存拦截非法结构（expRequired 非正 / 缺档 / 倍率越界 / 缺同级规则）
 *
 * 运行: npx vitest run tests/unit/fengshen-exp-reward.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { BattleDataLoader } from '@/application/service/BattleDataLoader'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import { initializeContainer } from '@/infrastructure/di/Container'
import type { EnemyRewardTableConfig, ExpTableConfig, LevelDiffBonusConfig } from '@/domain/fengshen/types'
import {
  calcEnemyReward,
  calcLevelDiffMultiplier,
  getExpRequired,
  interpolateEnemyReward,
  matchLevelDiffCondition,
  matchLevelDiffMultiplier,
  matchLevelDiffRule,
} from '@/domain/fengshen/exp-reward'

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
}

beforeAll(() => {
  initializeContainer()
})

// ── 种子数据源（与 seed.ts buildXxx 同构，独立于导入流程的静态快照） ──

const sampleExpTable: ExpTableConfig = {
  id: 'exp_table',
  maxLevel: 30,
  entries: Array.from({ length: 30 }, (_, i) => {
    const lv = i + 1
    return { level: lv, expRequired: lv <= 10 ? 300 * lv : 600 * lv }
  }),
  formulaHint: '1-10级：300×等级；11-30级：600×等级',
}

const sampleEnemyReward: EnemyRewardTableConfig = {
  id: 'enemy_reward_table',
  roleMultiplier: { normal: 1.0, major_boss: 3.0 },
  entries: [
    { enemyLevel: 1, baseExp: 10, goldMin: 3, goldMax: 5 },
    { enemyLevel: 10, baseExp: 100, goldMin: 30, goldMax: 50 },
    { enemyLevel: 20, baseExp: 200, goldMin: 60, goldMax: 100 },
  ],
  interpolation: 'linear',
}

const sampleLevelDiff: LevelDiffBonusConfig = {
  id: 'level_diff_bonus',
  rules: [
    { id: 'r_lo', label: '碾压', condition: { diff: '<= -5' }, expMultiplier: 0.1, goldMultiplier: 0.5 },
    { id: 'r_even', label: '同级', condition: { diff: 0 }, expMultiplier: 1.0, goldMultiplier: 1.0 },
    { id: 'r_hi', label: '极限', condition: { diff: '>= 6' }, expMultiplier: 2.0, goldMultiplier: 1.5 },
  ],
  fallbackMultiplier: 1.0,
  clampRange: { min: 0.1, max: 3.0 },
}

describe('等级差条件匹配（condition 解析）', () => {
  it('精确相等 number', () => {
    expect(matchLevelDiffCondition(0, 0)).toBe(true)
    expect(matchLevelDiffCondition(0, 1)).toBe(false)
  })

  it('闭区间数组 [min, max]', () => {
    expect(matchLevelDiffCondition([-4, -3], -3)).toBe(true)
    expect(matchLevelDiffCondition([-4, -3], -2)).toBe(false)
  })

  it('半开区间字符串 <= / >=', () => {
    expect(matchLevelDiffCondition('<= -5', -5)).toBe(true)
    expect(matchLevelDiffCondition('<= -5', -4)).toBe(false)
    expect(matchLevelDiffCondition('>= 6', 6)).toBe(true)
    expect(matchLevelDiffCondition('>= 6', 5)).toBe(false)
  })
})

describe('等级差规则匹配（文档 §8 V-EXP-03/08）', () => {
  it('按数组顺序匹配第一条命中规则', () => {
    expect(matchLevelDiffMultiplier(sampleLevelDiff, -6).expMult).toBe(0.1)
    expect(matchLevelDiffMultiplier(sampleLevelDiff, 0).expMult).toBe(1.0)
    expect(matchLevelDiffMultiplier(sampleLevelDiff, 7).expMult).toBe(2.0)
  })

  it('无命中使用 fallbackMultiplier', () => {
    expect(matchLevelDiffMultiplier(sampleLevelDiff, -3).expMult).toBe(1.0)
    expect(matchLevelDiffMultiplier(sampleLevelDiff, 3).expMult).toBe(1.0)
  })

  it('calcLevelDiffMultiplier 钳制到 clampRange', () => {
    const clamped = calcLevelDiffMultiplier(sampleLevelDiff, -6)
    expect(clamped.expMult).toBe(0.1)
    expect(clamped.goldMult).toBe(0.5)
  })

  it('matchLevelDiffRule 返回命中规则本身（UI 模拟验算）', () => {
    expect(matchLevelDiffRule(sampleLevelDiff, 0)?.id).toBe('r_even')
    expect(matchLevelDiffRule(sampleLevelDiff, 9)?.id).toBe('r_hi')
    expect(matchLevelDiffRule(sampleLevelDiff, 3)).toBeUndefined()
  })
})

describe('升级经验表查询（文档 §8 V-EXP-05/06）', () => {
  it('按等级精确查询升级所需经验', () => {
    expect(getExpRequired(sampleExpTable, 1)).toBe(300)
    expect(getExpRequired(sampleExpTable, 10)).toBe(3000)
    expect(getExpRequired(sampleExpTable, 11)).toBe(6600)
    expect(getExpRequired(sampleExpTable, 30)).toBe(18000)
  })

  it('满级（无档位）返回 null', () => {
    expect(getExpRequired(sampleExpTable, 31)).toBeNull()
  })
})

describe('敌人奖励插值与结算（文档 §2.2 运行时取值规则）', () => {
  it('精确匹配档位', () => {
    const r = interpolateEnemyReward(sampleEnemyReward, 1)
    expect(r).toEqual({ baseExp: 10, goldMin: 3, goldMax: 5 })
  })

  it('linear 线性插值（10~20 中间档 15）', () => {
    const r = interpolateEnemyReward(sampleEnemyReward, 15)
    expect(r.baseExp).toBe(150)
    expect(r.goldMin).toBe(45)
    expect(r.goldMax).toBe(75)
  })

  it('nearest 最近档', () => {
    const nearest: EnemyRewardTableConfig = { ...sampleEnemyReward, interpolation: 'nearest' }
    expect(interpolateEnemyReward(nearest, 15).baseExp).toBe(100) // 距 10 更近
    expect(interpolateEnemyReward(nearest, 16).baseExp).toBe(200) // 距 20 更近
  })

  it('超出档位范围取最近档（不插值外推）', () => {
    expect(interpolateEnemyReward(sampleEnemyReward, 0).baseExp).toBe(10)
    expect(interpolateEnemyReward(sampleEnemyReward, 99).baseExp).toBe(200)
  })

  it('calcEnemyReward 应用角色倍率并取整钳制', () => {
    const r = calcEnemyReward(sampleEnemyReward, 10, 'normal')
    expect(r.exp).toBe(100) // normal 倍率 1.0
    const boss = calcEnemyReward(sampleEnemyReward, 10, 'major_boss')
    expect(boss.exp).toBe(300) // 100 × 3.0
    expect(boss.goldMinFinal).toBe(90) // 30 × 3.0
    expect(boss.goldMaxFinal).toBe(150) // 50 × 3.0
  })

  it('未知角色倍率回退 1.0', () => {
    const r = calcEnemyReward(sampleEnemyReward, 10, 'no_such')
    expect(r.exp).toBe(100)
  })
})

describe('seed：params 域三条结构化种子', () => {
  it('导入后 exp_table / enemy_reward_table / level_diff_bonus 存在且结构完整', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)

    const et = await api.getExpTable()
    expect(et?.maxLevel).toBe(50)
    expect(et?.entries.length).toBe(50)

    const er = await api.getEnemyRewardTable()
    expect(er?.entries.length).toBeGreaterThanOrEqual(7)
    expect(er?.roleMultiplier).toHaveProperty('hidden_boss')
    expect(er?.roleMultiplier).toHaveProperty('major_boss')
    expect(er?.roleMultiplier).toHaveProperty('elite')
    expect(er?.roleMultiplier).not.toHaveProperty('final_boss')
    expect(er?.interpolation).toBe('linear')

    const ld = await api.getLevelDiffBonus()
    expect(ld?.rules.length).toBe(7)
    expect(ld?.fallbackMultiplier).toBe(1.0)
  })
})

describe('BattleDataLoader 预载后数据源出口', () => {
  it('IDB 编辑经验表后 reload 数据源出口反映', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)

    const et = await api.getExpTable()
    et!.entries[0].expRequired = 999
    const write = new FengshenDataService(storage, new DataIntegrityService(storage))
    await write.save('params', { id: 'exp_table', name: '玩家升级经验表', data: et } as never)

    const ok = await new BattleDataLoader(storage).reload()
    expect(ok).toBe(true)
    const fromSource = GameDataProcessor.getExpTable?.()
    expect(fromSource?.entries.find((e) => e.level === 1)?.expRequired).toBe(999)
  })
})

describe('ConfigDataSource 兜底', () => {
  it('三表无 configs 兜底数据，返回 null', () => {
    const src = new ConfigDataSource()
    expect(src.getExpTable()).toBeNull()
    expect(src.getEnemyRewardTable()).toBeNull()
    expect(src.getLevelDiffBonus()).toBeNull()
  })
})

describe('DataIntegrityService 保存校验（文档 §6.1）', () => {
  async function makeWrite() {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const integrity = new DataIntegrityService(storage)
    const write = new FengshenDataService(storage, integrity)
    return { storage, integrity, write }
  }

  it('exp_table：expRequired 非正整数被拦截', async () => {
    const { write } = await makeWrite()
    const r = await write.save('params', {
      id: 'exp_table',
      name: '玩家升级经验表',
      data: { id: 'exp_table', maxLevel: 3, entries: [{ level: 1, expRequired: -5 }] },
    })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.includes('正整数'))).toBe(true)
  })

  it('exp_table：等级缺档被拦截', async () => {
    const { write } = await makeWrite()
    const r = await write.save('params', {
      id: 'exp_table',
      name: '玩家升级经验表',
      data: { id: 'exp_table', maxLevel: 3, entries: [{ level: 1, expRequired: 300 }] },
    })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.includes('缺失'))).toBe(true)
  })

  it('enemy_reward_table：goldMin > goldMax 被拦截', async () => {
    const { write } = await makeWrite()
    const r = await write.save('params', {
      id: 'enemy_reward_table',
      name: '敌人经验与金钱基准表',
      data: { id: 'enemy_reward_table', entries: [{ enemyLevel: 1, baseExp: 10, goldMin: 50, goldMax: 30 }], roleMultiplier: { normal: 1 } },
    })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.includes('下限'))).toBe(true)
  })

  it('level_diff_bonus：缺少同级（diff=0）规则被拦截', async () => {
    const { write } = await makeWrite()
    const r = await write.save('params', {
      id: 'level_diff_bonus',
      name: '等级差经验加成规则',
      data: {
        id: 'level_diff_bonus',
        rules: [{ id: 'r', label: '越级', condition: { diff: [1, 3] }, expMultiplier: 1.2, goldMultiplier: 1.0 }],
        fallbackMultiplier: 1,
        clampRange: { min: 0.1, max: 3 },
      },
    })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.includes('同级'))).toBe(true)
  })

  it('level_diff_bonus：倍率越界被拦截', async () => {
    const { write } = await makeWrite()
    const r = await write.save('params', {
      id: 'level_diff_bonus',
      name: '等级差经验加成规则',
      data: {
        id: 'level_diff_bonus',
        rules: [
          { id: 'r0', label: '同级', condition: { diff: 0 }, expMultiplier: 100, goldMultiplier: 1.0 },
        ],
        fallbackMultiplier: 1,
        clampRange: { min: 0.1, max: 3 },
      },
    })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.includes('倍率'))).toBe(true)
  })

  it('合法数据保存成功', async () => {
    const { write, storage } = await makeWrite()
    const r = await write.save('params', {
      id: 'level_diff_bonus',
      name: '等级差经验加成规则',
      data: sampleLevelDiff,
    })
    expect(r.ok).toBe(true)
    const saved = await storage.get<{ data?: unknown }>(FENGSHEN_STORE.PARAMS, 'level_diff_bonus')
    expect(saved?.data).toBeDefined()
  })
})

describe('健康检查集成（文档 §6.2）', () => {
  it('种子数据三表通过检查，无虚假告警', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const integrity = new DataIntegrityService(storage)
    const report = await integrity.runHealthCheck()
    const expGoldIssues = report.issues.filter(
      (i) => i.sourceTable === 'params' && ['exp_table', 'enemy_reward_table', 'level_diff_bonus'].includes(i.sourceId),
    )
    expect(expGoldIssues).toEqual([])
  })

  it('破坏 level_diff_bonus（删除同级规则）后健康检查报错', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const integrity = new DataIntegrityService(storage)

    const ld = await new GameDataApi(storage).getLevelDiffBonus()
    ld!.rules = ld!.rules.filter((r) => !(typeof r.condition.diff === 'number' && r.condition.diff === 0))
    // 直接写入存储（绕过保存校验，模拟历史坏数据）
    await storage.set(FENGSHEN_STORE.PARAMS, 'level_diff_bonus', { id: 'level_diff_bonus', name: '等级差经验加成规则', data: ld })

    const report = await integrity.runHealthCheck()
    const hit = report.issues.find((i) => i.sourceId === 'level_diff_bonus')
    expect(hit).toBeDefined()
    expect(hit?.missingId).toContain('同级')
  })
})
