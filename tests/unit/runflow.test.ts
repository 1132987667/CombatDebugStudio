/**
 * 文件: runflow.test.ts
 * 功能: 关卡推进编排单元测试（玩法主循环设计.md §三.2/§三.4/§六.2.1/§七.1）
 *       覆盖：节点序列构造（单场关/多场关/妖魁关）、敌方席位阶梯、妖气增幅递增、
 *       缓回时长计算（10%/秒、上限 10 秒）、星级评定规则。
 */
import { describe, it, expect } from 'vitest'
import { ampAt, buildRunNodes, clearStars, enemySlotCount, sceneNodeCount, settleSeconds, MAX_ENEMY_SLOTS, RUN_TIMING } from '@/presentation/modules/yanjie/xiyou/runFlow'
import type { XiyouScene } from '@/presentation/modules/yanjie/xiyou/types'
import scenesJson from '@configs/xiyou/scenes.json'

function makeScene(id: string, enemyIds: string[], yaotuId?: string): XiyouScene {
  return {
    id,
    regionId: 'region_' + id.split('_')[1], // 真实形态：scene_R_* → region_R；scene_maze_* → region_maze
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

describe('enemySlotCount（§三.4 席位阶梯）', () => {
  it('关卡一 2 / 关卡二 3 / 关卡三~五与妖魁关 4', () => {
    expect(enemySlotCount(makeScene('scene_1_1', ['a']))).toBe(2)
    expect(enemySlotCount(makeScene('scene_1_2', ['a']))).toBe(3)
    expect(enemySlotCount(makeScene('scene_1_3', ['a']))).toBe(4)
    expect(enemySlotCount(makeScene('scene_1_4', ['a']))).toBe(4)
    expect(enemySlotCount(makeScene('scene_1_5', ['a']))).toBe(4)
    expect(enemySlotCount(makeScene('scene_1_boss', ['boss_x']))).toBe(4)
  })

  it('迷踪秘境不参与阶梯（池子即定编阵容，含小 BOSS、无妖徒）', () => {
    expect(enemySlotCount(makeScene('scene_maze_1', ['a', 'b', 'c', 'd']))).toBe(MAX_ENEMY_SLOTS)
  })
})

describe('buildRunNodes（节点序列构造）', () => {
  it('单场关（关卡一）：席位 2 = 1 小怪 + 妖徒压轴，无增幅', () => {
    const scene = makeScene('scene_1_1', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].isBoss).toBe(true)
    expect(nodes[0].enemyIds).toEqual(['e1', 'yaotu_a'])
    expect(nodes[0].amp).toBe(1)
  })

  it('单场关（关卡二）：席位 3 = 2 小怪 + 妖徒压轴', () => {
    const scene = makeScene('scene_1_2', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes[0].enemyIds).toEqual(['e1', 'e2', 'yaotu_a'])
  })

  it('敌组池不足席位时同种怪重复出场凑满（关卡三 4 席 = 3 小怪循环）', () => {
    const scene = makeScene('scene_1_3', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes[0].enemyIds).toEqual(['e1', 'e2', 'e3', 'e1'])
  })

  it('多场关（关卡五 4 场）：前 3 场普通满席位（增幅递增），末场妖徒压轴占 1 席满档增幅', () => {
    const scene = makeScene('scene_1_5', ['e1', 'e2', 'e3'], 'yaotu_a')
    const nodes = buildRunNodes(scene, [scene])
    expect(nodes).toHaveLength(4)
    expect(nodes.map((n) => n.isBoss)).toEqual([false, false, false, true])
    expect(nodes[0].enemyIds).toEqual(['e1', 'e2', 'e3', 'e1'])
    expect(nodes.map((n) => n.amp)).toEqual([1, 1.15, 1.3, 1.45])
    expect(nodes[3].enemyIds).toEqual(['e1', 'e2', 'e3', 'yaotu_a'])
  })

  it('妖魁关：普通场借同区域 scene_R_5 敌组凑满席位，关底妖魁率队不加增幅', () => {
    const elite = makeScene('scene_2_5', ['w1', 'w2', 'w3'], 'yaotu_b')
    const bossScene = makeScene('scene_2_boss', ['boss_major_x'])
    const nodes = buildRunNodes(bossScene, [elite, bossScene])
    expect(nodes).toHaveLength(4)
    expect(nodes[0].enemyIds).toEqual(['w1', 'w2', 'w3', 'w1'])
    // 妖魁前哨战：region_2 映射 boss_minor_liuyao 率队占 1 席，权威数值不增幅
    expect(nodes[2].enemyIds).toEqual(['boss_minor_liuyao', 'w1', 'w2', 'w3'])
    expect(nodes[2].amp).toBe(1)
    expect(nodes[3].isBoss).toBe(true)
    expect(nodes[3].enemyIds).toEqual(['boss_major_x', 'w1', 'w2', 'w3'])
    expect(nodes[3].amp).toBe(1)
  })

  it('全 33 关不变量：每场 1~4 席（编成不被 buildEnemyRoster 截断），有妖徒的关底妖徒必在场', () => {
    const all = (scenesJson as Array<{ id: string; enemies: Array<{ id?: string }>; yaotu?: { id?: string } | null }>).map(
      (s) => makeScene(s.id, (s.enemies ?? []).map((e) => e.id ?? ''), s.yaotu?.id),
    )
    expect(all.length).toBe(33)
    for (const scene of all) {
      const nodes = buildRunNodes(scene, all)
      // NOTE: 无妖徒的普通场景（秘境三关）走「合编一场」，§24 场数表对其不生效——
      //       秘境的分场编成规则未定（4 条敌人含小 BOSS，哪只压哪场没有口径），故此处只锁定现状
      const expectedNodes = scene.yaotu || scene.id.endsWith('_boss') ? sceneNodeCount(scene) : 1
      expect(nodes.length, scene.id).toBe(expectedNodes)
      for (const node of nodes) {
        expect(node.enemyIds.length, `${scene.id} #${node.index}`).toBeLessThanOrEqual(MAX_ENEMY_SLOTS)
        expect(node.enemyIds.length, `${scene.id} #${node.index}`).toBeGreaterThan(0)
        if (node.isBoss && scene.yaotu?.id) {
          expect(node.enemyIds, `${scene.id} 关底守护者缺席`).toContain(scene.yaotu.id)
        }
      }
    }
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
