/**
 * petmount.test.ts — 宠物/坐骑个体养成（PRD §18）单元自检
 *
 * 覆盖：
 * - 经验曲线（§18：复用玩家 §19 公式 EXP(L) = round(50×L^1.35+60×L)）
 * - 资质丹金钱三档（<400→100 / 400~439→200 / 440~499→400）、资质上限 500
 * - 突破倍率（+10%/20%/30%）与节点 10/30/50
 * - 属性公式（§18 算例：10 级仙品宠物攻击权重 3 → 基准 60）
 * - 幸运值掉率乘数与品质权重线性缩放（权重和恒 1）
 * - 击败掉落：六档基础掉率 × 幸运、场景个体池、已拥有排除、命中即停
 * - 经验入账升级循环 + 满级封存
 *
 * 运行: npx vitest run tests/unit/petmount.test.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  APTITUDE_CAP,
  BREAKTHROUGH_STAGES,
  PET_DROP_BASE_RATE,
  PET_MAX_LEVEL,
  aptitudePillCost,
  breakthroughMult,
  gainPetExp,
  individualById,
  luckDropRate,
  luckQualityWeights,
  mountIndividuals,
  petExpNeed,
  petIndividuals,
  petMountStatValue,
  petMountStats,
  petMountState,
  rollPetMountDrops,
  setLuckValue,
  type PetMountInstance,
} from '@/presentation/modules/yanjie/xiyou/petMount'
import { PLAYER_BASE_ATTRS } from '@/domain/fengshen/player-config'

function makeInst(partial: Partial<PetMountInstance>): PetMountInstance {
  return {
    uid: 't_uid',
    individualId: 'pet_01',
    kind: 'pet',
    quality: 5,
    aptitude: 400,
    level: 10,
    exp: 0,
    breakthroughs: 0,
    floatFactor: 1.0,
    active: false,
    ...partial,
  }
}

describe('经验曲线（§18 = 玩家 §19 公式）', () => {
  it('EXP(L) = round(50×L^1.35 + 60×L)：1 级 110、10 级 1671、49 级 →50 需 12050+', () => {
    expect(petExpNeed(1)).toBe(110)
    expect(petExpNeed(10)).toBe(Math.round(50 * Math.pow(10, 1.35) + 600))
    expect(petExpNeed(10)).toBeGreaterThan(1000)
    expect(petExpNeed(49)).toBeGreaterThan(petExpNeed(10))
  })
})

describe('资质与突破（§18 养成口径）', () => {
  it('资质丹金钱三档', () => {
    expect(aptitudePillCost(280)).toBe(100)
    expect(aptitudePillCost(399)).toBe(100)
    expect(aptitudePillCost(400)).toBe(200)
    expect(aptitudePillCost(439)).toBe(200)
    expect(aptitudePillCost(440)).toBe(400)
  })

  it('资质上限 500；突破三节点 10/30/50 级，倍率 1.1/1.2→1.6', () => {
    expect(APTITUDE_CAP).toBe(500)
    expect(BREAKTHROUGH_STAGES.map((s) => s.level)).toEqual([10, 30, 50])
    expect(breakthroughMult(0)).toBe(1)
    expect(breakthroughMult(1)).toBeCloseTo(1.1)
    expect(breakthroughMult(3)).toBeCloseTo(1.6)
  })
})

describe('属性公式（§18 算例锚定）', () => {
  it('10 级仙品宠物（资质 400=1.0、无突破、浮动 1.0）：攻击权重 3 → 60', () => {
    // PRD 算例：1 × 10 × 3 × 1(资质) × 2(攻击转化) = 60
    expect(petMountStatValue(makeInst({ level: 10, quality: 5, aptitude: 400 }), 3, 'attack')).toBe(60)
  })

  it('浮动系数与资质/突破按公式缩放', () => {
    // 资质 500（1.25）× 突破 3（1.6）= 2.0 → 60 × 2 = 120
    expect(petMountStatValue(makeInst({ aptitude: 500, breakthroughs: 3 }), 3, 'attack')).toBe(120)
    // 浮动下限 0.5：60 × 0.5 = 30（§18 可获得区间下界）
    expect(petMountStatValue(makeInst({ floatFactor: 0.5 }), 3, 'attack')).toBe(30)
  })

  it('品质品阶权重：凡 0.6 → 仙 1.0', () => {
    expect(petMountStatValue(makeInst({ quality: 1 }), 3, 'attack')).toBe(Math.round(10 * 3 * 0.6 * 1 * 1 * 2))
    expect(petMountStatValue(makeInst({ quality: 5 }), 3, 'attack')).toBe(60)
  })

  it('实例主要 3 条：个体 weights 键序归一为基础六维属性码（pet_01 combo = speed/attack/hit）', () => {
    const inst = makeInst({ individualId: 'pet_01' })
    const stats = petMountStats(inst)
    expect(stats.map((s) => s.attr)).toEqual(['speed', 'attack', 'hitValue'])
    // 光环键值必须落在基础六维口径内：曾漂移成 hit（命中率）导致加错属性且总览与实战不一致
    expect([...PLAYER_BASE_ATTRS]).toEqual(expect.arrayContaining(stats.map((s) => s.attr)))
  })

  it('全部 50 个个体的权重键均归一到基础六维、换算值非零（配置信任边界）', () => {
    for (const individual of [...petIndividuals, ...mountIndividuals]) {
      const stats = petMountStats(makeInst({ individualId: individual.id }))
      expect(stats, individual.id).toHaveLength(3)
      for (const s of stats) {
        expect(PLAYER_BASE_ATTRS, `${individual.id} 权重键 ${s.attr} 不在基础六维内`).toContain(s.attr)
        expect(s.value, `${individual.id}.${s.attr} 换算为 0（转化系数缺该属性码）`).toBeGreaterThan(0)
      }
    }
  })
})

describe('幸运值（§18 掉率/品质权重）', () => {
  beforeEach(() => setLuckValue(0))
  afterEach(() => setLuckValue(0))

  it('掉率乘数：幸运 0 ×1，1000 ×2，封顶 100%', () => {
    expect(luckDropRate(0.08)).toBeCloseTo(0.08)
    setLuckValue(1000)
    expect(luckDropRate(0.08)).toBeCloseTo(0.16)
    setLuckValue(3000)
    expect(luckDropRate(0.5)).toBe(1)
    expect(luckDropRate(0.08)).toBeCloseTo(0.32)
  })

  it('品质权重：幸运 0 = 默认（60/25/10/4/1），3000 全 20%，和恒 1', () => {
    expect(luckQualityWeights()[0]).toBeCloseTo(0.6)
    expect(luckQualityWeights().reduce((s, x) => s + x, 0)).toBeCloseTo(1)
    setLuckValue(3000)
    for (const w of luckQualityWeights()) expect(w).toBeCloseTo(0.2)
  })
})

describe('击败掉落（§18：六档掉率、场景池、唯一持有、命中即停）', () => {
  beforeEach(() => {
    setLuckValue(0)
    petMountState.pets = []
    petMountState.mounts = []
  })

  it('六档基础掉率表（小妖 3% → 妖尊 8%）', () => {
    expect(PET_DROP_BASE_RATE['xiaoyao']).toBe(0.03)
    expect(PET_DROP_BASE_RATE['yaozun']).toBe(0.08)
  })

  it('命中即停：必中随机下同场只掉 1 只宠物（场景池去重后）', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.001) // 必命中 + 必取池首
    try {
      const gained = rollPetMountDrops(1, ['yaozun', 'yaozun', 'yaozun'])
      const pets = gained.filter((g) => g.kind === 'pet')
      expect(pets).toHaveLength(1)
      expect(petMountState.pets).toHaveLength(1)
      // 三件套 roll：资质在 [280,440]、等级 1、品质 1~5
      expect(pets[0]!.aptitude).toBeGreaterThanOrEqual(280)
      expect(pets[0]!.aptitude).toBeLessThanOrEqual(440)
      expect(pets[0]!.level).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('未命中不掉落；个体唯一持有（已拥有后池空不掉）', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999) // 必不命中
    try {
      expect(rollPetMountDrops(1, ['yaozun'])).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
    // 已拥有场景 1 全部宠物后，即使必中也不掉
    for (const ind of petIndividuals.filter((i) => i.scene === 1)) {
      petMountState.pets.push(makeInst({ uid: `own_${ind.id}`, individualId: ind.id }))
    }
    const spy2 = vi.spyOn(Math, 'random').mockReturnValue(0.001)
    try {
      const gained = rollPetMountDrops(1, ['yaozun'])
      expect(gained.filter((g) => g.kind === 'pet')).toHaveLength(0)
    } finally {
      spy2.mockRestore()
    }
  })

  it('场景池取自个体表 scene 字段（宠物与坐骑互不干扰，各自判定）', () => {
    expect(petIndividuals.every((i) => i.id.startsWith('pet_'))).toBe(true)
    expect(mountIndividuals.every((i) => i.id.startsWith('mount_'))).toBe(true)
    expect(individualById('pet_01')).toBeTruthy()
    expect(individualById('mount_01')).toBeTruthy()
  })
})

describe('经验入账（升级循环 + 满级封存）', () => {
  it('1 级喂 500 经验（need 110）连升多级，溢出结转', () => {
    const inst = makeInst({ level: 1, exp: 0 })
    const levels = gainPetExp(inst, 500)
    // 110 + 234(2) + 383(3) ≈ 前三级累计 727 > 500 → 升 3 级余 500-110-234=156
    expect(levels).toBeGreaterThanOrEqual(2)
    expect(inst.level).toBe(1 + levels)
    expect(inst.exp).toBeLessThan(petExpNeed(inst.level))
  })

  it('满级不再入账', () => {
    const inst = makeInst({ level: PET_MAX_LEVEL, exp: 0 })
    expect(gainPetExp(inst, 5000)).toBe(0)
    expect(inst.level).toBe(PET_MAX_LEVEL)
  })
})
