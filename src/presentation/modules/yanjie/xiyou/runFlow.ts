/**
 * 斗战西游 · 关卡推进编排（玩法主循环设计.md §三.2/§九）
 * NOTE: 纯逻辑模块（无 Vue/引擎依赖）——节点序列构造、节奏常量、缓回时长计算，
 *       供 BattleZen 状态机消费；配套断言见 tests/unit/runflow.test.ts。
 * HACK: 场数表与席位表（sceneNodeCount / enemySlotCount）均按 scene id 序号硬编码解析，
 *       数据源分别是《完整项目说明.md》§24 与《玩法主循环设计.md》§三.4。天花板：关卡结构
 *       扩展（如精英支线、按区域定制节奏）时两张表需一并配置化（scenes.json 增加 waves 字段），
 *       当前 33 关静态数据下先硬编码。
 */

import type { XiyouScene } from './types'

/** 单场战斗节点（敌方编成 + 妖气增幅） */
export interface RunNode {
  /** 0 起始序号 */
  index: number
  total: number
  /** 关底场（妖徒/妖魁率队，胜利触发通关结算与星级评定） */
  isBoss: boolean
  /** 本场敌方单位 id（enemies.json 权威）；同 id 可重复 = 同种怪多个个体，结算按此逐席计酬 */
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
  /** 结算期缓回：法力每秒 +5 */
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

/** 敌方席位上限（对齐我方 主角 + 3 伙伴 = 4v4 顶格档） */
export const MAX_ENEMY_SLOTS = 4

/**
 * 每场敌方席位数（大场景内小场景序号阶梯）：关卡一 2 / 关卡二 3 / 关卡三~五与妖魁关 4。
 * 制造"入关时零星小妖 → 关内妖群渐聚"的爬坡手感；场数与妖气增幅另两条递增轴不变。
 * NOTE: 阶梯只作用于编号区域（region_R）——迷踪秘境/最终决战地的场景池子本身即定编阵容
 *       （enemies 内含小 BOSS、无妖徒），套阶梯会把它们压成 2 个敌人。
 */
export function enemySlotCount(scene: XiyouScene): number {
  if (!/^region_\d+$/.test(scene.regionId)) return MAX_ENEMY_SLOTS
  switch (scene.id.split('_')[2]) {
    case '1':
      return 2
    case '2':
      return 3
    default:
      return MAX_ENEMY_SLOTS
  }
}

/**
 * 从敌组池取 n 个小怪席位；池子不足 n 时同种怪重复出场（如「花妖幼芽 ×2」）。
 * 席位制由此恒成立：enemyIds.length ≤ MAX_ENEMY_SLOTS，编成与结算同源、不脱钩。
 */
function fillSlots(pool: string[], n: number): string[] {
  if (pool.length === 0 || n <= 0) return []
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]!)
}

/**
 * 构造关卡节点序列（每场编成按 enemySlotCount 席位阶梯）。
 * - 普通关：普通场 = 本场景敌组池凑满席位（amp 按 1+0.15×k 递增）；关底 = 席位-1 个小怪 + 妖徒压轴（满档增幅）。
 *   单场关（关卡一/二）= 同一套席位规则的合编一场。
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
  const slots = enemySlotCount(scene)
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
        enemyIds: fillSlots(elitePool, slots),
        amp: ampAt(k),
      })
    }
    // 妖魁前哨战：区域小 BOSS（boss_minor）率队占 1 席，其余席位由敌组凑满；权威数值不增幅（amp=1）
    const minorId = MINOR_BOSS_BY_REGION[scene.regionId]
    nodes.push({
      index: total - 2,
      total,
      isBoss: false,
      enemyIds: minorId ? [minorId, ...fillSlots(elitePool, slots - 1)] : fillSlots(elitePool, slots),
      amp: 1,
    })
    // 场景 BOSS 压阵：BOSS 自身的敌人条目先占席，剩余席位由同区域敌组随从凑满（amp=1）
    pushBoss(total - 1, [...pool, ...fillSlots(elitePool, Math.max(0, slots - pool.length))], 1)
    return nodes
  }

  if (total <= 1 || !yaotuId) {
    // 单场关：整关合编一场（妖徒压轴占末席），历史行为
    pushBoss(0, yaotuId ? [...fillSlots(pool, slots - 1), yaotuId] : fillSlots(pool, slots), 1)
    return nodes
  }

  for (let k = 0; k < total - 1; k++) {
    nodes.push({ index: k, total, isBoss: false, enemyIds: fillSlots(pool, slots), amp: ampAt(k) })
  }
  pushBoss(total - 1, [...fillSlots(pool, slots - 1), yaotuId], ampAt(total - 1))
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
