/**
 * 文件: runflow.test.ts
 * 功能: 关卡推进编排单元测试（玩法主循环设计.md §三.2/§六.2.1/§七.1）
 *       覆盖：节点序列构造（单场关/多场关/妖魁关）、妖气增幅递增、
 *       缓回时长计算（10%/秒、上限 10 秒）、星级评定规则。
 */
import { describe, it, expect } from 'vitest'
import { ampAt, buildRunNodes, clearStars, sceneNodeCount, settleSeconds, RUN_TIMING } from '@/presentation/modules/yanjie/xiyou/runFlow'
import type { XiyouScene } from '@/presentation/modules/yanjie/xiyou/types'

function makeScene(id: string, enemyIds: string[], yaotuId?: string): XiyouScene {
  return {
    id,
    regionId: id.split('_').slice(0, 2).join('_'),
    name: id,
    desc: '',
    enemies: enemyIds.map((eid) => ({ id: eid, name: eid, level: 1 })),
    yaotu: yaotuId ? { id: yaotuId, name: yaotuId, level: 2 } : null,
    unlocked: true,
    stars: 0,
    maxStars: 3,
  }
}

describe('sceneNodeCount（§24 场数表）', () => {
  it('关卡一/二 = 1 场，三 = 2，四 = 3，五 = 4，妖魁关 = 4', () => {
    expect(sceneNodeCount(makeScene('scene_1_1', ['a']))).toBe(1)
    expect(sceneNodeCount(makeScene('scene_1_2', ['a']))).toBe(1)
    expect(sceneNodeCount(makeScene('scene_1_3', ['a']))).toBe(2)
    expect(sceneNodeCount(makeScene('scene_1_4', ['a']))).toBe(3)
    expect(sceneNodeCount(makeScene('scene_1_5', ['a']))).toBe(4)
    expect(sceneNodeCount(makeScene('scene_1_boss', ['boss_x']))).toBe(4)
  })
})

describe('buildRunNodes（节点序列构造）', () => {
  it('单场关：敌组 + 妖徒合编一场，无增幅', () => {
    const scene = makeScene('scene_1_1', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].isBoss).toBe(true)
    expect(nodes[0].enemyIds).toEqual(['e1', 'e2', 'e3', 'yaotu_a'])
    expect(nodes[0].amp).toBe(1)
  })

  it('多场关（关卡五 4 场）：前 3 场普通（增幅递增），末场妖徒压轴满档增幅', () => {
    const scene = makeScene('scene_1_5', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes).toHaveLength(4)
    expect(nodes.map((n) => n.isBoss)).toEqual([false, false, false, true])
    expect(nodes[0].enemyIds).toEqual(['e1', 'e2', 'e3'])
    expect(nodes.map((n) => n.amp)).toEqual([1, 1.15, 1.3, 1.45])
    expect(nodes[3].enemyIds).toEqual(['e1', 'e2', 'e3', 'yaotu_a'])
  })

  it('妖魁关：普通场借同区域 scene_R_5 敌组垫场，关底妖魁不加增幅', () => {
    const elite = makeScene('scene_2_5', ['w1', 'w2', 'w3'], 'yaotu_b')
    const bossScene = makeScene('scene_2_boss', ['boss_major_x'])
    const nodes = buildRunNodes(bossScene, [elite, bossScene])
    expect(nodes).toHaveLength(4)
    expect(nodes[0].enemyIds).toEqual(['w1', 'w2', 'w3'])
    expect(nodes[2].amp).toBeCloseTo(1.3)
    expect(nodes[3].isBoss).toBe(true)
    expect(nodes[3].enemyIds).toEqual(['boss_major_x'])
    expect(nodes[3].amp).toBe(1)
  })
})

describe('妖气增幅曲线', () => {
  it('第 k 场 = 1 + 0.15k', () => {
    expect(ampAt(0)).toBe(1)
    expect(ampAt(1)).toBeCloseTo(1.15)
    expect(ampAt(3)).toBeCloseTo(1.45)
  })
})

describe('settleSeconds（结算期缓回 §六.2.1）', () => {
  it('满血 0 秒、半血 5 秒、空血 10 秒封顶', () => {
    expect(settleSeconds(1)).toBe(0)
    expect(settleSeconds(0.5)).toBe(5)
    expect(settleSeconds(0.2)).toBe(8)
    expect(settleSeconds(0)).toBe(RUN_TIMING.MAX_SETTLE_SEC)
    expect(settleSeconds(0)).toBe(10)
  })

  it('比例越界（负值/超 1）夹取到 [0,1]', () => {
    expect(settleSeconds(-1)).toBe(RUN_TIMING.MAX_SETTLE_SEC)
    expect(settleSeconds(2)).toBe(0)
  })
})

describe('clearStars（星级评定 §七.1）', () => {
  it('有死亡 = 1 星；全员存活且关底 4 回合内 = 3 星；存活但超时 = 2 星', () => {
    expect(clearStars(0, 1, 3)).toBe(1)
    expect(clearStars(1, 4, 9)).toBe(1)
    expect(clearStars(4, 4, 4)).toBe(3)
    expect(clearStars(4, 4, 5)).toBe(2)
    expect(clearStars(4, 4, 20)).toBe(2)
  })
})
