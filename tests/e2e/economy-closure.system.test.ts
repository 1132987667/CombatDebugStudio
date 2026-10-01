// @vitest-environment happy-dom
/**
 * 经济域系统审计（系统行为审计 · 经济域）
 *
 * 把 check-craft-loop 的"引用存在性"升级为"获取路径可达性"：
 * 引用存在但只能从过期/未部署敌人掉落，玩家依然永远做不出这件装备——
 * 断链只有跑完「场景解锁链 → 敌人可达集 → 掉落收入 → 图纸/材料/直落」闭环才暴露。
 *
 * 账本口径（与运行时一致）：
 * - 解锁权威 = packStore.blueprintUnlocked（t1 免图谱 / 其余需背包持有图纸），
 *   图纸唯一收入 = 敌人掉落（enemies.json drops，probability>0）
 * - 敌人可达 = 场景解锁链不动点（seed：scene_1_1 初始解锁 + 各门派 schoolUnlock 场景）
 * - 材料收入 = 可达敌人掉落 ∪ 场景通关材料 ∪ 园圃作物（同 id 产出）
 * - 装备收入 = 可达敌人直落 ∪ 降妖塔逐层首通直落（生产源 towerFloorEquipId，批次①）
 * - 计划件免检 = deployBatch:'planned'（入口机制未实现，登记在封神榜投放台账；
 *   免检≠免账，必须带 source 说明入口设计）
 *
 * 运行: npx vitest run tests/e2e/economy-closure.system.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TOWER_MAX_FLOOR, towerFloorEquipId } from '@/presentation/modules/yanjie/xiyou/tower'

function loadArr<T>(path: string): T[] {
  const j = JSON.parse(readFileSync(path, 'utf8'))
  if (Array.isArray(j)) return j as T[]
  const found = Object.values(j).find((v) => Array.isArray(v))
  if (!found) throw new Error(`${path} 未找到数组主体`)
  return found as T[]
}

interface SceneCfg {
  id: string
  regionId: string
  enemies?: Array<{ id: string; level?: number }>
  yaotu?: { id: string; level?: number }
  drops?: { materials?: string[]; gold?: [number, number]; exp?: [number, number] }
  unlockCondition?: { type: string; sceneId: string | null } | null
}
interface EnemyCfg {
  id: string
  drops?: Array<{ itemId: string; probability?: number; quantity?: number }>
}
interface EquipCfg {
  id: string
  tier?: string
  craftable?: boolean
  blueprintId?: string
  cost?: number
  materials?: Array<{ itemId: string; count: number }>
  legacyIds?: string[]
  source?: string
  deployBatch?: 'planned'
}

const scenes = loadArr<SceneCfg>('configs/xiyou/scenes.json')
const regions = loadArr<{ id: string; schoolUnlock?: { sceneId?: string } }>('configs/xiyou/regions.json')
const enemies = loadArr<EnemyCfg>('configs/enemies/enemies.json')
const equipment = loadArr<EquipCfg>('configs/equipment/equipment.json')
const cave = JSON.parse(readFileSync('configs/xiyou/cave.json', 'utf8'))

/** 场景解锁不动点：初始解锁（scene_1_1，unlockCondition.sceneId=null）+ 门派起点 */
function reachableSceneIds(): Set<string> {
  const seeds = new Set<string>(['scene_1_1'])
  for (const r of regions) if (r.schoolUnlock?.sceneId) seeds.add(r.schoolUnlock.sceneId)
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const reach = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const s of scenes) {
      if (reach.has(s.id)) continue
      const cond = s.unlockCondition
      const ok = seeds.has(s.id)
        || !cond
        || cond.sceneId === null || cond.sceneId === undefined
        || reach.has(cond.sceneId)
      if (ok && byId.has(s.id)) {
        reach.add(s.id)
        grew = true
      }
    }
  }
  return reach
}

const REACH_SCENES = reachableSceneIds()

/** 可达敌人 id（场景普通敌人 + 妖头） */
const REACH_ENEMY_IDS = new Set<string>(
  scenes
    .filter((s) => REACH_SCENES.has(s.id))
    .flatMap((s) => [...(s.enemies ?? []).map((e) => e.id), ...(s.yaotu ? [s.yaotu.id] : [])]),
)

const ENEMY_BY_ID = new Map(enemies.map((e) => [e.id, e]))

/** itemId → 收入来源描述（可达敌人掉落 probability>0 / 场景材料 / 园圃） */
function buildIncome(): Map<string, string[]> {
  const inc = new Map<string, string[]>()
  const add = (id: string, src: string) => {
    if (!id) return
    const a = inc.get(id) ?? []
    a.push(src)
    inc.set(id, a)
  }
  for (const eid of REACH_ENEMY_IDS) {
    for (const d of ENEMY_BY_ID.get(eid)?.drops ?? []) {
      if ((d.probability ?? 1) > 0) add(d.itemId, `enemy:${eid}`)
    }
  }
  for (const s of scenes.filter((x) => REACH_SCENES.has(x.id))) {
    for (const m of s.drops?.materials ?? []) add(typeof m === 'string' ? m : (m as { itemId: string }).itemId, `scene:${s.id}`)
  }
  for (const c of (cave.gardenCrops ?? [])) add(c.id, `crop:${c.id}`)
  // 降妖塔逐层首通直落装备（生产源映射，批次①；非敌落通路）
  for (let f = 1; f <= TOWER_MAX_FLOOR; f++) {
    const eq = towerFloorEquipId(f)
    if (eq) add(eq, `tower:first-clear-${f}`)
  }
  return inc
}
const INCOME = buildIncome()

describe('经济域审计：获取路径可达性闭环', () => {
  it('场景解锁链全覆盖：47 场景自初始/门派种子起全部可达', () => {
    expect(REACH_SCENES.size, '存在解锁链覆盖不到的场景').toBe(scenes.length)
  })

  it('图纸可达：每件可造装备（t1 免检外）的 blueprintId 必须有可达敌人以正概率掉落', () => {
    const violations: string[] = []
    for (const x of equipment) {
      if (!x.craftable || x.tier === 't1' || !x.blueprintId) continue
      if (Array.isArray(x.legacyIds) && x.legacyIds.length) continue
      const src = INCOME.get(x.blueprintId)
      if (!src) {
        const liveDroppers = enemies
          .filter((e) => (e.drops ?? []).some((d) => d.itemId === x.blueprintId && (d.probability ?? 1) > 0))
          .map((e) => e.id)
        violations.push(
          `${x.id}(${x.tier}) 需图纸 ${x.blueprintId}，可达掉落源=0；` +
          `全库掉落者=${liveDroppers.join(',') || '无'}${liveDroppers.length ? '（均不在已解锁场景）' : ''}`,
        )
      }
    }
    expect(violations, `图纸断链（玩家永远造不出这些装备）:\n${violations.join('\n')}`).toEqual([])
  })

  it('直落可达：非打造装备必须能从可达敌人掉落或降妖塔首通直落获得（计划件免检但强制登记）', () => {
    const violations: string[] = []
    const undocumented: string[] = []
    for (const x of equipment) {
      if (x.craftable) continue
      if (Array.isArray(x.legacyIds) && x.legacyIds.length) continue
      if (x.deployBatch === 'planned') {
        // 免检不等于没账：计划件必须写清入口设计（source），防止死装备混进免检名单
        if (!x.source?.trim()) undocumented.push(x.id)
        continue
      }
      if (INCOME.has(x.id)) continue
      const all = enemies
        .filter((e) => (e.drops ?? []).some((d) => d.itemId === x.id && (d.probability ?? 1) > 0))
        .map((e) => `${e.id}${REACH_ENEMY_IDS.has(e.id) ? '' : '(不可达)'}`)
      violations.push(`${x.id} 无打造路径且${all.length ? `掉落者全部不可达: ${all.join(',')}` : '无任何敌人掉落（全库零引用）'}`)
    }
    expect(undocumented, `计划件未登记入口设计:\n${undocumented.join('\n')}`).toEqual([])
    expect(violations, `死装备（图鉴可见但无获取途径）:\n${violations.join('\n')}`).toEqual([])
  })

  it('无断崖：打造配方引用的每种材料都有正收入来源', () => {
    const violations: string[] = []
    for (const x of equipment) {
      if (!x.craftable) continue
      for (const m of x.materials ?? []) {
        if (!INCOME.has(m.itemId)) violations.push(`${x.id} 需要材料 ${m.itemId}×${m.count}，无任何可达来源`)
      }
    }
    expect(violations, `材料断崖（该阶段无法推进）:\n${violations.join('\n')}`).toEqual([])
  })

  it('无通胀倒挂：可造装备平均 cost 随阶位严格递增', () => {
    const tierAvg = new Map<string, number>()
    for (const t of ['t1', 't2', 't3', 't4', 't5']) {
      const xs = equipment.filter((x) => x.craftable && x.tier === t)
      expect(xs.length, `${t} 无可造装备`).toBeGreaterThan(0)
      tierAvg.set(t, xs.reduce((s, x) => s + (x.cost ?? 0), 0) / xs.length)
    }
    const order = ['t1', 't2', 't3', 't4', 't5']
    for (let i = 1; i < order.length; i++) {
      const prev = tierAvg.get(order[i - 1])!
      const cur = tierAvg.get(order[i])!
      expect(cur, `平均成本倒挂：${order[i]}(${cur.toFixed(0)}) ≤ ${order[i - 1]}(${prev.toFixed(0)})`).toBeGreaterThan(prev)
    }
  })
})
