/**
 * 数值域系统审计（系统行为审计 · 数值域）
 *
 * 两类检查对号入座：
 * 1. 配置层（静态·跨文件）：全 configs/ 概率字段值域审计——引擎消费侧
 *    nextRandom 恒为 [0,1)，配置声明 >1 即量纲误用（0~100 写进了 0~1 字段，
 *    表现为恒触发/恒掉落的静默失衡）；敌人 stats vs attributes.json 的
 *    range 声明（跨层编码约定单源，防 0~1 / 0~100 口径漂移）。
 * 2. 行为层（蒙特卡洛·固定种子）：声明的 critRate 走完引擎全链路
 *    （属性合成 → DamageCalculator 判定 → 录制 → 战报投影）后，实测触发率
 *    必须落在声明值的统计区间内；边界语义 0=合法零（不得回退默认值 10）、
 *    100=恒触发、缺省=回退 attributes.json defaultValue。
 *
 * 运行: npx vitest run tests/e2e/probability-audit.system.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { getEnemyConfig, getAllEnemyConfigs } from '@tests/fixtures/loadTestData'
import type { Enemy } from '@/shared/types/enemy'
import { participantFromEnemy, simFullBattle } from '@tests/fixtures/headlessSim'

// ═══════════════ 配置层：概率字段值域审计 ═══════════════

/**
 * 引擎按 nextRandom∈[0,1) 消费的字段名（PassiveSkillManager/BuffSystem 同一口径）。
 * NOTE: 'chance' 刻意不入表——同名双量纲：控制步骤 parameters.chance 按 0~100 消费
 *       （SkillExecutor chance ?? 100），归一化掉落 chance 按 0~1 消费，
 *       单 key 无法统一审计；掉落的显式概率契约改在原始 enemies.json 上检查。
 */
const ENGINE_01_PROB_KEYS = new Set(['probability', 'triggerProbability'])

function walkJson(node: unknown, path: string, hits: Array<{ key: string; value: number; at: string }>): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkJson(v, `${path}[${i}]`, hits))
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (ENGINE_01_PROB_KEYS.has(k) && typeof v === 'number') {
        hits.push({ key: k, value: v, at: path })
      }
      walkJson(v, `${path}.${k}`, hits)
    }
  }
}

function allConfigFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.json')) out.push(p)
    }
  }
  walk('configs')
  return out
}

describe('数值域审计：配置概率字段值域（0~1 引擎口径单源）', () => {
  it('configs/ 全库 probability/triggerProbability 字段 ∈ [0,1]', () => {
    const violations: string[] = []
    let total = 0
    for (const file of allConfigFiles()) {
      let data: unknown
      try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
      const hits: Array<{ key: string; value: number; at: string }> = []
      walkJson(data, file, hits)
      total += hits.length
      for (const h of hits) {
        if (h.value < 0 || h.value > 1) {
          violations.push(`${h.at}.${h.key} = ${h.value}`)
        }
      }
    }
    // 扫描必须真的扫到字段才算跑过（防路径漂移导致空集恒绿）
    expect(total, '未扫描到任何概率字段——配置路径可能已变更').toBeGreaterThan(50)
    expect(
      violations,
      `概率字段超出引擎 [0,1) 消费口径（>1 会被当成恒触发/恒掉落）:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('enemies.json 原始掉落条目全部显式声明 probability ∈ [0,1]（缺省=必掉是隐式契约，禁止扩散）', () => {
    // 审计钉在原始配置层：normalizeEnemy 会把 probability 改名 chance 并做 ?? 1 回退，
    // 在归一化产物上查"缺失"是假阳性
    const raw = JSON.parse(readFileSync('configs/enemies/enemies.json', 'utf8'))
    const list = Array.isArray(raw) ? raw : Object.values(raw).find((v) => Array.isArray(v))
    const violations: string[] = []
    let total = 0
    for (const e of list as Array<{ id: string; drops?: Array<{ itemId: string; probability?: number }> }>) {
      for (const d of e.drops ?? []) {
        total++
        if (d.probability === undefined) violations.push(`${e.id} → ${d.itemId}（缺 probability，将被静默视为必掉）`)
        else if (d.probability < 0 || d.probability > 1) violations.push(`${e.id} → ${d.itemId} probability=${d.probability}`)
      }
    }
    expect(total, '未扫描到掉落条目').toBeGreaterThan(500)
    expect(violations, `掉落概率契约违例:\n${violations.join('\n')}`).toEqual([])
  })

  it('敌人 stats 值落在 attributes.json range 声明区间内（跨层量纲单源）', () => {
    const attrs = JSON.parse(readFileSync('configs/attributes/attributes.json', 'utf8'))
    const attrList = Array.isArray(attrs) ? attrs : Object.values(attrs).find((v) => Array.isArray(v))
    const ranges = new Map<string, [number, number]>()
    for (const a of attrList as Array<{ code: string; range?: string }>) {
      const m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%?$/.exec(String(a.range ?? '').trim())
      if (m) ranges.set(a.code, [Number(m[1]), Number(m[2])])
    }
    expect(ranges.size, 'attributes.json 未解析出任何数值 range 声明').toBeGreaterThan(10)

    const violations: string[] = []
    for (const e of getEnemyConfigsList()) {
      for (const [code, value] of Object.entries(e.stats ?? {})) {
        if (typeof value !== 'number') continue
        // noAttack 训练靶的 attack=0 合法（Enemy.noAttack 字段注释：AI 回合直接跳过行动），
        // 攻击下限 1 只约束可行动单位
        if (e.noAttack === true && code === ATTRIBUTE_CODE.attack && value === 0) continue
        const bound = ranges.get(code)
        if (bound && (value < bound[0] || value > bound[1])) {
          violations.push(`${e.id}.${code} = ${value}，声明区间 ${bound[0]}~${bound[1]}`)
        }
      }
    }
    expect(violations, `敌人属性越界:\n${violations.join('\n')}`).toEqual([])
  })
})

function getEnemyConfigsList(): Enemy[] {
  // 与冒烟/归一化同口径的全量名册
  return getAllEnemyConfigs()
}

// ═══════════════ 行为层：critRate 蒙特卡洛（固定种子，可复现） ═══════════════

const DUMMY_TANK: Enemy['id'] = 'test_dummy_high'
const ATTACKER: Enemy['id'] = 'yaotu_fire'
const SEEDS = ['mc-1', 'mc-2', 'mc-3', 'mc-4', 'mc-5', 'mc-6', 'mc-7', 'mc-8']

/**
 * 跑一批固定种子对局，聚合战报判定层：crits/hits。
 * 木桩 maxHealth 放大到 5000 保证对局打满（每局 ≈99 次判定），noAttack 保证
 * 判定全部来自我方携带声明 critRate 的单位——实测率与声明值可直接对账。
 */
async function measureCrit(
  attackerStats: Partial<Record<ATTRIBUTE_CODE, number>>,
  seeds: string[],
): Promise<{ crits: number; hits: number }> {
  let crits = 0
  let hits = 0
  const base = getEnemyConfig(ATTACKER)!
  const attacker: Enemy = { ...base, stats: { ...base.stats, ...attackerStats } }
  for (const seed of seeds) {
    const dummy = getEnemyConfig(DUMMY_TANK)!
    const tank: Enemy = { ...dummy, stats: { ...dummy.stats, [ATTRIBUTE_CODE.maxHealth]: 5000 } }
    const r = await simFullBattle(
      [GameDataProcessor.enemyToParticipant(attacker, ParticipantSide.ALLY, 0)],
      [GameDataProcessor.enemyToParticipant(tank, ParticipantSide.ENEMY, 0)],
      seed,
    )
    expect(r.summary, `种子 ${seed} 无战报（未终局？）`).toBeDefined()
    crits += r.summary!.judgment.crits
    hits += r.summary!.judgment.hits
  }
  return { crits, hits }
}

/** 二项分布 99.7% 置信半宽（百分点），N 不足时自适应放宽，防统计假阳性 */
function band(pct: number, n: number): number {
  const sd = Math.sqrt((pct / 100) * (1 - pct / 100) / Math.max(1, n)) * 100
  return Math.max(4, 3.5 * sd + 1)
}

describe('数值域审计：critRate 全链路实测率 vs 声明值', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  it('声明 25%：实测触发率落在 25 ± 统计区间（引擎链路量纲正确）', async () => {
    const { crits, hits } = await measureCrit({ [ATTRIBUTE_CODE.critRate]: 25 }, SEEDS)
    expect(hits, '样本不足（木桩战未产生判定）').toBeGreaterThanOrEqual(200)
    const measured = (crits / hits) * 100
    expect(
      Math.abs(measured - 25),
      `声明 25% 实测 ${measured.toFixed(2)}%（N=${hits}）——超出统计区间即口径漂移或判定链路旁路`,
    ).toBeLessThanOrEqual(band(25, hits))
  }, 120_000)

  it('声明 0%：恒不暴击（0 是合法业务值，禁止被默认值 10 吞掉）', async () => {
    const { crits, hits } = await measureCrit({ [ATTRIBUTE_CODE.critRate]: 0 }, ['zero-1', 'zero-2', 'zero-3'])
    expect(hits).toBeGreaterThan(50)
    expect(crits, `critRate=0 实测 ${crits} 次暴击/${hits} 判定——0 被回退链吞掉`).toBe(0)
  }, 60_000)

  it('声明 100%：恒暴击（全值域右端点语义完整）', async () => {
    const { crits, hits } = await measureCrit({ [ATTRIBUTE_CODE.critRate]: 100 }, ['full-1', 'full-2'])
    expect(hits).toBeGreaterThan(30)
    expect(crits, `critRate=100 实测 ${crits}/${hits} 未全暴击`).toBe(hits)
  }, 60_000)

  it('缺省不声明：回退 attributes.json defaultValue=10（?? 回退链生效）', async () => {
    // yaotu_fire 原配置未写 critRate——直接沿用配置即缺省场景
    const base = getEnemyConfig(ATTACKER)!
    expect(base.stats[ATTRIBUTE_CODE.critRate], '前置失效：yaotu_fire 现配置已含 critRate，本用例需换载体').toBeUndefined()
    const { crits, hits } = await measureCrit({}, SEEDS.slice(0, 5))
    expect(hits).toBeGreaterThanOrEqual(100)
    const measured = (crits / hits) * 100
    expect(
      Math.abs(measured - 10),
      `缺省 critRate 实测 ${measured.toFixed(2)}%，设计默认值 10（N=${hits}）`,
    ).toBeLessThanOrEqual(band(10, hits))
  }, 120_000)
})
