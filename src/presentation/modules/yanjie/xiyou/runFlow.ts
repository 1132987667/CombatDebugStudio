/**
 * 斗战西游 · 关卡推进编排（玩法主循环设计.md §三.2/§九）
 * NOTE: 纯逻辑模块（无 Vue/引擎依赖）——节点序列构造、节奏常量、缓回时长计算，
 *       供 BattleZen 状态机消费；配套断言见 tests/unit/runflow.test.ts。
 * HACK: 场数表硬编码自《完整项目说明.md》§24（关卡一/二 1 场、三 2 场、四 3 场、五 4 场、
 *       妖魁关 4 场），以 scene id 序号解析。天花板：关卡结构扩展（如精英支线）时此映射
 *       需配置化（scenes.json 增加 waves 字段），当前 30 关静态数据下先硬编码。
 */

import type { XiyouScene } from './types'

/** 单场战斗节点（敌方编成 + 妖气增幅） */
export interface RunNode {
  /** 0 起始序号 */
  index: number
  total: number
  /** 关底场（妖徒/妖魁率队，胜利触发通关结算与星级评定） */
  isBoss: boolean
  /** 本场敌方单位 id（enemies.json / bosses.json 权威） */
  enemyIds: string[]
  /** 妖气增幅：敌方战斗属性倍率（气血/攻击/防御/速度），关底满档 */
  amp: number
}

/** 循环节奏基准（玩法主循环设计.md §九.1，进封神榜调参前的代码基准） */
export const RUN_TIMING = {
  /** 推进过渡固定 3 秒（含敌情横幅演出，结束自动开战） */
  ADVANCE_MS: 3000,
  /** 结算期缓回：每秒回复 10% 最大气血 */
  REGEN_HP_RATIO_PER_SEC: 0.1,
  /** 结算期缓回：能量每秒 +5 */
  REGEN_ENERGY_PER_SEC: 5,
  /** 缓回上限 10 秒（空血起算） */
  MAX_SETTLE_SEC: 10,
  /** 大结算展示 5 秒后自动重开本关（全自动循环） */
  FINISH_SHOW_MS: 5000,
} as const

/**
 * 按场景 id 解析 §24 场数表。
 * id 约定：scene_R_1~5 = 普通关卡一~五，scene_R_boss = 妖魁关。
 */
export function sceneNodeCount(scene: XiyouScene): number {
  const seq = scene.id.split('_')[2]
  if (seq === 'boss') return 4
  switch (seq) {
    case '1':
    case '2':
      return 1
    case '3':
      return 2
    case '4':
      return 3
    case '5':
      return 4
    default:
      return 1
  }
}

/**
 * 构造关卡节点序列。
 * - 普通关：普通场编成 = 本场景敌组池（amp 按 1+0.15×(k-1) 递增）；关底 = 敌组池 + 妖徒（满档增幅）。
 *   单场关（关卡一/二）= 敌组池 + 妖徒合编一场（与历史行为一致）。
 * - 妖魁关：普通场借同区域 scene_R_5 敌组垫场（amp 递增）；第 3 场区域妖魁前哨战；关底 = 场景 BOSS（权威数值，不再增幅）。
 */
/** 区域 → 妖魁关前哨小 BOSS（boss_minor，§3.8 章节末分层：妖魁前哨 → 妖王关底） */
const MINOR_BOSS_BY_REGION: Record<string, string> = {
  region_1: 'boss_minor_taoyao',
  region_2: 'boss_minor_liuyao',
  region_3: 'boss_minor_yanjing',
  region_4: 'boss_minor_zhuyao',
  region_5: 'boss_minor_panseng',
}

export function buildRunNodes(scene: XiyouScene, allScenes: XiyouScene[]): RunNode[] {
  const total = sceneNodeCount(scene)
  const pool = scene.enemies.map((e) => e.id).filter((id): id is string => !!id)
  const yaotuId = scene.yaotu?.id
  const bossSeq = scene.id.endsWith('_boss')
  const nodes: RunNode[] = []

  const pushBoss = (index: number, ids: string[], amp: number): void => {
    nodes.push({ index, total, isBoss: true, enemyIds: ids, amp })
  }

  if (bossSeq) {
    // 妖魁关：同区域 scene_R_5 敌组垫普通场；第 3 场区域妖魁前哨战；关底场景 BOSS（权威数值，不增幅）
    // NOTE: regionId（region_R）→ 场景 id（scene_R_5）需换前缀；直接拼接 `region_R_5` 永不命中
    const elite = allScenes.find((s) => s.id === `scene_${scene.regionId.slice('region_'.length)}_5`)
    const elitePool = (elite?.enemies ?? []).map((e) => e.id).filter((id): id is string => !!id)
    for (let k = 0; k < total - 2; k++) {
      nodes.push({
        index: k,
        total,
        isBoss: false,
        enemyIds: elitePool.slice(0, 3),
        amp: ampAt(k),
      })
    }
    // 妖魁前哨战：区域小 BOSS（boss_minor）率队，权威数值不增幅（amp=1）
    const minorId = MINOR_BOSS_BY_REGION[scene.regionId]
    nodes.push({
      index: total - 2,
      total,
      isBoss: false,
      enemyIds: minorId ? [minorId, ...elitePool.slice(0, 3)] : elitePool.slice(0, 3),
      amp: 1,
    })
    // 场景 BOSS 压阵（§24 关底 4v4）：场景 BOSS + 同区域敌组随从凑满一队（amp=1）
    const escorts = elitePool.slice(0, Math.max(0, 4 - pool.length))
    pushBoss(total - 1, [...pool, ...escorts], 1)
    return nodes
  }

  if (total <= 1 || !yaotuId) {
    // 单场关：整关合编一场（敌组 + 妖徒），历史行为
    pushBoss(0, yaotuId ? [...pool, yaotuId] : pool, 1)
    return nodes
  }

  for (let k = 0; k < total - 1; k++) {
    nodes.push({ index: k, total, isBoss: false, enemyIds: pool.slice(0, 3), amp: ampAt(k) })
  }
  pushBoss(total - 1, [...pool, yaotuId], ampAt(total - 1))
  return nodes
}

/** 妖气增幅：第 k 场（0 起）= 1 + 0.15×k */
export function ampAt(k: number): number {
  return Math.round((1 + 0.15 * k) * 100) / 100
}

/**
 * 结算期缓回时长（秒）：气血缺口 ÷ 10%/秒，上限 10 秒。
 * @param minHpRatio 全员最低气血比例（0~1）
 */
export function settleSeconds(minHpRatio: number): number {
  const need = 1 - Math.min(1, Math.max(0, minHpRatio))
  return Math.min(RUN_TIMING.MAX_SETTLE_SEC, Math.ceil(need / RUN_TIMING.REGEN_HP_RATIO_PER_SEC))
}

/** 星级评定（§七.1）：★1 通关 / ★2 全员存活 / ★3 关底战 4 回合内结束 */
export function clearStars(aliveCount: number, allyCount: number, bossTurns: number): number {
  if (aliveCount < allyCount) return 1
  return bossTurns <= 4 ? 3 : 2
}
