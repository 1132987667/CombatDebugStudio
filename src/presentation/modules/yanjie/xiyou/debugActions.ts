/**
 * debugActions.ts — 演劫台调试动作定义（DebugCavePanel 数据源）
 *
 * 纯数据 + 执行函数注入（工厂模式）：
 * - 动作元数据（id / label / danger / input）为纯数据，便于测试与渲染；
 * - execute 依赖运行时状态（store / saveManager），由工厂函数注入 env 后生成。
 *
 * 架构约束（PRD §10）：
 * - 所有操作经 application 层接口 / Pinia store / SaveManager，不直接触碰 IndexedDB 或 domain 内部；
 * - 本文件不 import 任何 store，仅依赖注入的 env。
 */

import { makeInstance, GEAR_SLOT_LABELS, type GearInstance, type GearSlotKey } from '@/presentation/stores/packStore'
import { applyAffixToParticipant, clearAffixesFromParticipant } from '@/shared/utils/affix'
import { PLAYER_ID } from '@/shared/constants/player'
import type { AffixData, EquipmentAffixData } from '@/domain/fengshen/types'
import equipmentAffixesDataRaw from '@configs/equipment/equipment-affixes.json'
import affixesDataRaw from '@configs/affixes/affixes.json'
import { createPlayerProfile, playerConfig } from './playerProfile'
import {
  dropsForEnemyById,
  xianyuanForEnemyIds,
  rewardForEnemyById,
  MAX_ACTIVE_MATES,
  buildSimAlly,
  buildEnemyRoster,
  equipBonuses,
  schoolTreeCombatBonuses,
} from './battle'
import { runQuickBattle } from '@/application/service/QuickBattleSim'
import { ParticipantSide } from '@/domain/battle/type/types'
import { equippedSkills, grantLevelPoint, grantPillPoint, pureSchoolBonus, schoolsLayers, mates } from './xiyouData'
import { fabaoAttributeBonuses, fabaoDefs, fabaoTier, grantFabao } from './fabao'
import { grantPetMount, petMountAttributeBonuses, petIndividuals, mountIndividuals, individualById, petMountState, persistPetMountState } from './petMount'
import { enhanceCost, enhanceMaxByRarity, enhanceSuccessRate } from './caveLogic'
import { createRng, rngFn } from '@/shared/utils/seeded-rng'
import type { PlayerStoreDebugEnv } from './debugEnv'
import { ALL_ITEM_TYPES_SET } from '@/shared/constants/item-types'
import { RARITY_NAMES, rollQualityFactor } from './quality'

/** 品级 1-5 → select options（单一来源 quality.RARITY_NAMES） */
const RARITY_OPTIONS = Object.entries(RARITY_NAMES).map(([value, label]) => ({ value, label }))

/** 材料类型集合（与 PackPanel 的 material/essence/enhance 分组对齐，供"给予全部N阶材料"按 items.json 全量筛选） */
const MATERIAL_TYPES = ALL_ITEM_TYPES_SET

/** 装备词条库（equipment-affixes.json；类型即 fengshen 词缀表镜像）。NOTE: packStore 制造/洗练词缀池已切 affix-rule.json，与本库为两池——本库仅供词缀注入调试 */
const EQUIP_AFFIXES = equipmentAffixesDataRaw as unknown as EquipmentAffixData[]

/** 敌人词缀库（affixes.json，与封神榜 affixes 表同源；断言为取 affixes 数组的最小视图） */
const AFFIX_LIBRARY = affixesDataRaw as unknown as {
  affixes: AffixData[]
}

/** 下拉选项 */
export interface DebugSelectOption {
  value: string
  label: string
}

/** 动作输入参数描述 */
export interface DebugActionInput {
  /** 输入控件 id（多输入时用于区分；单输入缺省为动作 id） */
  id?: string
  type: 'number' | 'select' | 'text' | 'file'
  /** select 选项（value → label 对）；支持惰性函数（动态列表如背包装备实例；可读当前已填输入值实现联动，如场景→敌人） */
  options?: DebugSelectOption[] | ((values: Record<string, string | number | null>) => DebugSelectOption[])
  placeholder?: string
  /** number 的最小/最大值（可选） */
  min?: number
  max?: number
  /** 是否必须输入（缺省为可选，未输入时 params 传 null） */
  required?: boolean
}

/** 调试动作定义 */
export interface DebugActionDef {
  id: string
  label: string
  /** 是否为危险操作（需二次确认；朱红高亮） */
  danger?: boolean
  /** 输入参数：单个输入控件，或数组（多参数，如「场景 + 次数」）；提供后渲染输入控件 */
  input?: DebugActionInput | DebugActionInput[]
  /** 开关型动作（execute 返回 nextState，面板持久化状态并高亮） */
  toggle?: boolean
  /** 开关型动作初始态（面板挂载时播种 toggleStates；缺省视为关闭） */
  initial?: () => boolean
  /**
   * 执行函数（注入 env 后生成）。
   * - 无输入：params = null
   * - 单输入：params = 该控件提交值
   * - 多输入：params = Record<inputId, value>
   * current 为开关型动作当前状态。
   */
  execute: (
    params?: string | number | File | null | Record<string, string | number | File | null>,
    current?: boolean,
  ) => Promise<DebugActionResult> | DebugActionResult
}

export interface DebugActionResult {
  success: boolean
  message: string
  /** 可选：需要弹窗展示的 JSON 数据 */
  payload?: unknown
  /** 开关型动作：返回新状态（面板据此更新按钮态） */
  nextState?: boolean
}

/** 动作分组 */
export interface DebugGroup {
  id: string
  label: string
  actions: DebugActionDef[]
}

/** 一级分类 */
export interface DebugCategory {
  id: string
  label: string
  groups: DebugGroup[]
}

/** 工厂：由组件注入运行时环境，生成完整分类树 */
export type DebugActionFactory = (env: PlayerStoreDebugEnv) => DebugCategory[]

/** 统一成功结果 */
export function ok(message: string, payload?: unknown): DebugActionResult {
  return { success: true, message, payload }
}

/** 统一失败结果 */
export function fail(message: string, payload?: unknown): DebugActionResult {
  return { success: false, message, payload }
}

/**
 * 制造品质锁定（DebugCavePanel「制造品质锁定」）：设定后 gear_craft 固定产出该品质（1-5），
 * null 表示不锁定（走装备 rarity 的 rollQuality）。模块级共享，生命周期同面板。
 */
let craftQualityLock: number | null = null

/** 获取当前锁定品质（null = 未锁定） */
function getCraftQualityLock(): number | null {
  return craftQualityLock
}

/**
 * 设置玩家等级并重算属性（基础 + 成长 + 加点），返回属性快照。
 * NOTE: 等级变化不重置运行时血/能量——保留当前值，maxHp/maxEnergy 重算后回满血能量，
 *       与 gainExp 升级路径语义一致（升级回满）。
 */
function playerSetLevel(env: PlayerStoreDebugEnv, level: number): Record<string, unknown> {
  const { player } = env
  const next = Math.max(1, Math.floor(level))
  // 与 gainExp 自然升级同口径补发：每级自由属性点 + 技能点（仅升级方向；降级不回收，与游戏语义一致）
  if (next > player.player.level) {
    const delta = next - player.player.level
    player.statPoints.available += delta * (playerConfig.freePointsPerLevel ?? 4)
    for (let i = 0; i < delta; i++) grantLevelPoint()
  }
  const profile = createPlayerProfile({
    level: next,
    exp: player.player.exp,
    stats: { ...player.statPoints },
  })
  Object.assign(player.player, profile)
  return {
    level: player.player.level,
    maxHp: player.player.maxHp,
    maxEnergy: player.player.maxEnergy,
    attackMin: player.player.attackMin,
    attackMax: player.player.attackMax,
    defense: player.player.defense,
    speed: player.player.speed,
  }
}

// ══════════════════════════════════════════════════════════════════
// 第一批：战斗调试（D01）+ 玩家状态（D02）+ 存档调试（D05）
// ══════════════════════════════════════════════════════════════════

/** 战斗调试（D01） */
function buildBattleCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { battle, pack, player } = env
  return {
    id: 'battle',
    label: '战斗',
    groups: [
      {
        id: 'flow',
        label: '流程控制',
        actions: [
          {
            id: 'battle_win',
            label: '立即胜利',
            execute: async () => ok((await battle.debugEndBattle('ally')) ? '已判定我方胜利' : '结束战斗失败'),
          },
          {
            id: 'battle_lose',
            label: '立即失败',
            execute: async () => ok((await battle.debugEndBattle('enemy')) ? '已判定敌方胜利' : '结束战斗失败'),
          },
          {
            id: 'battle_step',
            label: '单步执行',
            execute: async () => ok((await battle.processSingleTurn()) ? '已执行一个行动' : '执行失败'),
          },
        ],
      },
      {
        id: 'state',
        label: '状态注入',
        actions: [
          {
            id: 'battle_restore',
            label: '满血满能量',
            execute: () => ok(battle.restoreAllAlly() ? '我方全员已恢复' : '战斗未就绪'),
          },
          {
            id: 'battle_kill',
            label: '击杀当前敌人',
            execute: () => {
              const done = battle.killSelectedEnemy()
              return done ? ok('选中敌人已击杀') : fail('未选中敌人或战斗未就绪')
            },
          },
        ],
      },
      {
        id: 'judge',
        label: '判定干预',
        actions: [
          {
            id: 'battle_crit',
            label: '强制暴击',
            toggle: true,
            execute: (_p, on) => {
              battle.setForceCrit(!on)
              return {
                success: true,
                message: !on ? '全员暴击率已置 100（验证暴击公式）' : '已恢复暴击率',
                nextState: !on,
              }
            },
          },
          {
            id: 'battle_dodge',
            label: '强制闪避',
            toggle: true,
            execute: (_p, on) => {
              battle.setForceDodge(!on)
              return { ...(!on ? ok('强制闪避已开启', { next: !on }) : ok('强制闪避已关闭')), nextState: !on }
            },
          },
        ],
      },
      {
        id: 'random',
        label: '随机控制',
        actions: [
          {
            id: 'battle_seed',
            label: '锁定种子',
            input: { type: 'text', placeholder: '如 20260815', required: true },
            execute: (seed) => {
              if (!seed) return fail('请输入种子值')
              battle.setPendingSeed(String(seed))
              return ok(`已锁定种子 ${seed}（下次开始战斗生效）`)
            },
          },
          {
            id: 'battle_seed_random',
            label: '恢复随机',
            execute: () => {
              battle.setPendingSeed(null)
              return ok('已恢复随机种子')
            },
          },
        ],
      },
      {
        id: 'speed',
        label: '战斗速度',
        actions: [
          {
            id: 'battle_speed',
            label: '切换倍速',
            input: {
              type: 'select',
              options: [
                { value: '1', label: '1x' },
                { value: '2', label: '2x' },
                { value: '4', label: '4x' },
                { value: '5', label: '5x' },
              ],
            },
            execute: (speed) => {
              const n = Number(speed ?? 1)
              battle.setBattleSpeed(n)
              return ok(`战斗速度已设为 ${n}x`)
            },
          },
        ],
      },
      {
        id: 'trace',
        label: '伤害取证',
        actions: [
          {
            id: 'battle_trace',
            label: '查看最近伤害分步',
            execute: () => {
              battle.captureDamageTrace()
              const trace = battle.lastDamageTrace
              if (!trace || trace.length === 0) return fail('暂无伤害记录（先执行一次攻击）')
              return ok(`已捕获 ${trace.length} 步伤害计算`, trace)
            },
          },
        ],
      },
      {
        id: 'grind',
        label: '刷关模拟',
        actions: [
          {
            id: 'battle_grind',
            label: '快速击杀敌人 N 次',
            input: [
              {
                id: 'scene',
                type: 'select',
                options: () => env.scenes.map((s) => ({ value: s.id, label: `${s.name}（Lv.${s.levelRange?.[0] ?? '?'}）` })),
                placeholder: '选择场景',
                required: true,
              },
              {
                id: 'enemy',
                type: 'select',
                options: (values) => {
                  const sceneId = values[`battle_grind:scene`] as string | undefined
                  const scene = env.scenes.find((s) => s.id === sceneId)
                  if (!scene) return []
                  const enemies = [
                    ...scene.enemies
                      .filter((e): e is { id: string; name: string; level: number; type?: string } => !!e.id)
                      .map((e) => ({ id: e.id, name: e.name, kind: '普通' as const })),
                    ...(scene.yaotu ? [{ id: scene.yaotu.id, name: scene.yaotu.name, kind: '头目' as const }] : []),
                  ]
                  return enemies.map((e) => ({ value: e.id, label: `${e.name}（${e.kind}）` }))
                },
                placeholder: '选择敌人',
                required: true,
              },
              {
                id: 'count',
                type: 'select',
                options: [
                  { value: '1', label: '1 次' },
                  { value: '5', label: '5 次' },
                  { value: '10', label: '10 次' },
                  { value: '20', label: '20 次' },
                  { value: '50', label: '50 次' },
                ],
                placeholder: '刷关次数',
                required: true,
              },
            ],
            execute: async (params) => {
              const p = params as Record<string, string | number | File | null>
              const enemyId = p.enemy as string
              const n = Number(p.count ?? 10)
              if (!enemyId) return fail('未知敌人')
              const enemyName =
                env.scenes.flatMap((s) => [...s.enemies, ...(s.yaotu ? [s.yaotu] : [])]).find((e) => e.id === enemyId)?.name ??
                enemyId
              let totalExp = 0
              let totalMoney = 0
              let totalXianyuan = 0
              let totalLevel = 0
              const drops = new Map<string, { name: string; quantity: number; times: number }>()
              const levelBefore = player.player.level
              for (let i = 0; i < n; i++) {
                const r = simBattleRewards(env, enemyId)
                totalExp += r.exp
                totalMoney += r.money
                totalXianyuan += r.xianyuan
                // 掉落：仅 roll 所选敌人的掉落（含「掉落率锁定」联动，silent 抑制逐条 toast 刷屏）
                for (const d of r.drops) {
                  const key = d.itemId
                  const cur = drops.get(key) ?? { name: pack.catalogById(d.itemId)?.name ?? d.itemId, quantity: 0, times: 0 }
                  cur.quantity += d.quantity
                  cur.times += 1
                  drops.set(key, cur)
                }
              }
              totalLevel = player.player.level - levelBefore
              const summary = {
                enemy: enemyName,
                battles: n,
                exp: totalExp,
                money: totalMoney,
                xianyuan: totalXianyuan,
                leveled: totalLevel,
                drops: [...drops.values()],
                dropVariety: drops.size,
              }
              return ok(
                `「${enemyName}」×${n}：经验+${totalExp} · 金钱+${totalMoney} · 灵韵+${totalXianyuan} · 升级${totalLevel} · 掉落${drops.size}种`,
                summary,
              )
            },
          },
          {
            id: 'battle_sweep',
            label: '一键实测 · 全场景扫荡',
            input: [
              {
                id: 'mode',
                type: 'select',
                options: [
                  { value: 'fast', label: '快速结算 · 收益实测（经验/金钱/掉落入账）' },
                  { value: 'sim', label: '真实模拟 · 强度实测（无头对局胜率/回合，不入账）' },
                ],
                placeholder: '模拟口径',
              },
              {
                id: 'count',
                type: 'select',
                options: [
                  { value: '1', label: '每场景 1 次' },
                  { value: '5', label: '每场景 5 次' },
                  { value: '10', label: '每场景 10 次' },
                  { value: '20', label: '每场景 20 次' },
                  { value: '50', label: '每场景 50 次' },
                ],
                placeholder: '每场景打怪次数（真实模拟时单场较慢，建议 ≤10）',
                required: true,
              },
              {
                id: 'stats',
                type: 'select',
                options: [
                  { value: 'atk', label: '自动加点 · 全攻击' },
                  { value: 'bracket', label: '自动加点 · 攻击+气血' },
                  { value: 'balanced', label: '自动加点 · 六维均衡' },
                  { value: 'none', label: '不自动加点' },
                ],
                placeholder: '加点方案（扫荡前一次性分完可用点数）',
              },
              {
                id: 'gear',
                type: 'select',
                options: [
                  { value: 'best', label: '自动穿装 · 逐槽位挑背包最优' },
                  { value: 'no', label: '不动装备' },
                ],
                placeholder: '装备策略',
              },
              {
                id: 'mates',
                type: 'select',
                options: [
                  { value: 'best', label: '自动阵容 · 最优伙伴 + 骑乘 + 灵宠伴战' },
                  { value: 'no', label: '不动阵容' },
                ],
                placeholder: '伙伴/坐骑/灵宠策略',
              },
              {
                id: 'scope',
                type: 'select',
                options: [
                  { value: 'all', label: '全部场景' },
                  { value: 'unlocked', label: '仅已解锁场景' },
                ],
                placeholder: '场景范围',
              },
            ],
            execute: async (params) => {
              const p = (params ?? {}) as Record<string, string | number | File | null>
              const n = Math.max(1, Number(p.count ?? 10))
              const targets = p.scope === 'unlocked' ? env.scenes.filter((s) => s.unlocked) : env.scenes
              if (targets.length === 0) return fail('没有可扫荡的场景（请解锁场景或改选「全部场景」）')

              // ── 一键养成准备：加点 → 穿装 → 阵容（与手动路径同改 reactive 状态，两口径共用） ──
              const prep = applyPrep(env, p)
              if (p.mode === 'sim') return runSimSweep(env, targets, n, prep)

              // ── 快速结算口径：每场景 N 战，敌人按场景敌组池（普通+妖徒）轮转覆盖 ──
              const levelBefore = player.player.level
              const rows: {
                id: string
                name: string
                battles: number
                exp: number
                money: number
                xianyuan: number
                leveled: number
                dropVariety: number
                topDrops: string[]
              }[] = []
              let totBattles = 0
              let totExp = 0
              let totMoney = 0
              let totXianyuan = 0
              // 掉落种数全局去重（同物品多场景掉落时 headline 不重复计数）
              const allDropIds = new Set<string>()
              for (const scene of targets) {
                const pool = [...scene.enemies.map((e) => e.id), scene.yaotu?.id].filter((id): id is string => !!id)
                if (pool.length === 0) continue
                const lvBefore = player.player.level
                let exp = 0
                let money = 0
                let xianyuan = 0
                const drops = new Map<string, number>()
                for (let i = 0; i < n; i++) {
                  const r = simBattleRewards(env, pool[i % pool.length]!)
                  exp += r.exp
                  money += r.money
                  xianyuan += r.xianyuan
                  for (const d of r.drops) drops.set(d.itemId, (drops.get(d.itemId) ?? 0) + d.quantity)
                }
                totBattles += n
                totExp += exp
                totMoney += money
                totXianyuan += xianyuan
                for (const id of drops.keys()) allDropIds.add(id)
                rows.push({
                  id: scene.id,
                  name: scene.name,
                  battles: n,
                  exp,
                  money,
                  xianyuan,
                  leveled: player.player.level - lvBefore,
                  dropVariety: drops.size,
                  topDrops: [...drops.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([id, q]) => `${pack.catalogById(id)?.name ?? id}×${q}`),
                })
              }
              const totalLeveled = player.player.level - levelBefore
              // 养成与扫荡状态一次落盘（与 MatePanel 手动上阵后 autoSave 同口径）
              void env.save.autoSave()
              const prepText = prepSummary(prep)
              return ok(
                `实测完成：${rows.length} 场景 ${totBattles} 战 · 经验+${totExp} · 金钱+${totMoney} · 灵韵+${totXianyuan} · 升${totalLeveled} 级 · 掉落 ${allDropIds.size} 种${prepText ? `（${prepText}）` : ''}`,
                { prep, scenes: rows, total: { scenes: rows.length, battles: totBattles, exp: totExp, money: totMoney, xianyuan: totXianyuan, leveled: totalLeveled, dropVariety: allDropIds.size } },
              )
            },
          },
        ],
      },
    ],
  }
}

/** 单场模拟战结算：roll 经验/金钱/灵韵入账 + 掉落入包（silent 抑制逐条 toast 刷屏），返回本场明细 */
function simBattleRewards(
  env: PlayerStoreDebugEnv,
  enemyId: string,
): { exp: number; money: number; xianyuan: number; drops: { itemId: string; quantity: number }[] } {
  const { player, pack } = env
  const roll = (range: [number, number] | undefined): number =>
    range ? Math.round(range[0] + Math.random() * (range[1] - range[0])) : 0
  const reward = rewardForEnemyById(enemyId)
  const exp = roll(reward.exp)
  const money = roll(reward.money)
  if (exp > 0) player.gainExp(exp)
  if (money > 0) player.gainCurrency('money', money)
  let gainedXianyuan = 0
  const xianyuan = xianyuanForEnemyIds([enemyId])
  if (xianyuan > 0) {
    player.gainCurrency('xianyuan', xianyuan)
    gainedXianyuan = xianyuan
  }
  return { exp, money, xianyuan: gainedXianyuan, drops: pack.applyDrops(dropsForEnemyById(enemyId), true) }
}

/** 加点六维 key（与 CharacterPanel STAT_DEFS 同序） */
const STAT_ALLOC_KEYS = ['hp', 'atk', 'def', 'hit', 'dodge', 'speed'] as const
type StatAllocKey = (typeof STAT_ALLOC_KEYS)[number]

/** 按方案分配 N 个自由属性点，返回各维分配数（总和 = N） */
function planStatAllocation(n: number, plan: string): Partial<Record<StatAllocKey, number>> {
  const dist: Partial<Record<StatAllocKey, number>> = {}
  const give = (key: StatAllocKey, cnt: number): void => {
    if (cnt > 0) dist[key] = (dist[key] ?? 0) + cnt
  }
  if (plan === 'atk') {
    give('atk', n)
  } else if (plan === 'bracket') {
    const atk = Math.ceil(n / 2)
    give('atk', atk)
    give('hp', n - atk)
  } else {
    // balanced：六维均分，余数按序补
    let rem = n % STAT_ALLOC_KEYS.length
    for (const key of STAT_ALLOC_KEYS) {
      give(key, Math.floor(n / STAT_ALLOC_KEYS.length) + (rem-- > 0 ? 1 : 0))
    }
  }
  return dist
}

/** 装备实例评分：instanceStats 数值总和（基础×强化×星级 + 词条；调试场景够用） */
function gearScoreOf(env: PlayerStoreDebugEnv, inst: GearInstance): number {
  return env.pack.instanceStats(inst).reduce((sum, s) => sum + Math.abs(s.value), 0)
}

/** 自动穿装：逐槽位从背包未穿戴实例中挑最高分穿上（equipInstance 同槽旧件自动回包），返回穿戴清单 */
function autoEquipBest(env: PlayerStoreDebugEnv): { slot: string; name: string }[] {
  const worn: { slot: string; name: string }[] = []
  for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
    const best = env.pack.gearInstances
      .filter((g) => env.pack.gearById(g.itemId)?.slot === slot)
      .reduce<GearInstance | null>((acc, g) => (acc === null || gearScoreOf(env, g) > gearScoreOf(env, acc) ? g : acc), null)
    if (best && env.pack.equipInstance(best.instanceId)) {
      worn.push({ slot, name: env.pack.gearById(best.itemId)?.name ?? best.itemId })
    }
  }
  return worn
}

/** 伙伴战力分：参战 stats 总和（缺 stats 不可参战 = 0 分垫底） */
function mateScore(m: (typeof mates)[number]): number {
  return m.stats ? m.stats.maxHp + m.stats.attack + m.stats.defense + m.stats.speed : 0
}

/** 自动上阵：按战力分取前 MAX_ACTIVE_MATES 名 active，其余下场；返回上阵名单 */
function autoDeployMates(): string[] {
  const ranked = [...mates].sort((a, b) => mateScore(b) - mateScore(a))
  const active = ranked.slice(0, MAX_ACTIVE_MATES)
  for (const m of mates) m.active = active.includes(m)
  return active.map((m) => m.name)
}

/** 自动骑乘：资质最高的坐骑个体出战（§18 个体体系，伴战光环 + 出战经验；IDB 持久化） */
function autoRideMount(): string | null {
  const best = [...petMountState.mounts].sort((a, b) => b.aptitude - a.aptitude)[0]
  if (!best) return null
  for (const m of petMountState.mounts) m.active = m === best
  void persistPetMountState()
  return individualById(best.individualId)?.name ?? best.individualId
}

/** 灵宠伴战：资质最高的宠物个体出战（同 autoRideMount 口径） */
function autoAccompanyPets(): string | null {
  const best = [...petMountState.pets].sort((a, b) => b.aptitude - a.aptitude)[0]
  if (!best) return null
  for (const p of petMountState.pets) p.active = p === best
  void persistPetMountState()
  return individualById(best.individualId)?.name ?? best.individualId
}

/** 一键养成准备（加点 → 穿装 → 阵容），快速结算与真实模拟两口径共用；返回 prep 报告（未启用的项不含键） */
function applyPrep(env: PlayerStoreDebugEnv, p: Record<string, string | number | File | null>): Record<string, unknown> {
  const { player } = env
  const prep: Record<string, unknown> = {}
  const statPlan = String(p.stats ?? 'none')
  if (statPlan !== 'none' && player.statPoints.available > 0) {
    const dist = planStatAllocation(player.statPoints.available, statPlan)
    for (const [key, cnt] of Object.entries(dist)) {
      player.statPoints[key as StatAllocKey] += cnt ?? 0
      player.statPoints.available -= cnt ?? 0
    }
    prep.stats = { plan: statPlan, allocated: dist }
  }
  if (p.gear === 'best') prep.gear = autoEquipBest(env)
  if (p.mates === 'best') {
    prep.mates = autoDeployMates()
    prep.mount = autoRideMount()
    const petName = autoAccompanyPets()
    if (petName) prep.pets = [petName]
  }
  return prep
}

/** prep 报告 → 消息摘要（如「加点7点 · 穿装4件 · 上阵3伙伴 · 骑乘照夜」） */
function prepSummary(prep: Record<string, unknown>): string {
  return [
    prep.stats ? `加点${Object.values((prep.stats as { allocated: Record<string, number> }).allocated).reduce((a, b) => a + b, 0)}点` : null,
    Array.isArray(prep.gear) ? `穿装${(prep.gear as { name: string }[]).length}件` : null,
    prep.mates ? `上阵${(prep.mates as string[]).length}伙伴` : null,
    prep.mount ? `骑乘${prep.mount as string}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** 模拟场景行（winRate/avgRounds 仅统计成功执行场次；全被拒时 winRate = null，与「全败 0%」区分） */
interface SimSceneRow {
  id: string
  name: string
  battles: number
  wins: number
  winRate: number | null
  avgRounds: number | null
  avgSurvivors: number | null
}

/**
 * 一键实测 · 真实模拟口径：逐场景 N 场无头真实对局（我方 = 主角+上阵伙伴，敌方 = 场景敌人合编）。
 * NOTE: 每场满血独立模拟（无跨场血量继承/结算缓回），纯读侧强度实测——不入账经验/金钱/掉落；
 *       引擎对局进行中时 runQuickBattle 拒绝，该场不计入胜率分母，失败计入报告 failures 而非中断。
 */
async function runSimSweep(
  env: PlayerStoreDebugEnv,
  targets: PlayerStoreDebugEnv['scenes'],
  n: number,
  prep: Record<string, unknown>,
): Promise<DebugActionResult> {
  const { player, pack } = env
  const protagonist = player.battleSnapshot
  // 与 BattleZen.initBattle 同口径：装备 + 流派树加成只作用于主角
  const allyBonuses = { ...equipBonuses(pack.equippedStats(), protagonist), ...schoolTreeCombatBonuses(), ...fabaoAttributeBonuses(), ...petMountAttributeBonuses() }
  // 我方编成与场景无关，构造一次全场景复用（prep 已定妆：加点/穿装/阵容不再变化）
  const allyActors = buildSimAlly(allyBonuses, protagonist)
  const rows: SimSceneRow[] = []
  let launched = 0
  let executed = 0
  let totWins = 0
  let totRounds = 0
  let totDecided = 0
  let totSurv = 0
  let totSurvSamples = 0
  const failures = new Map<string, number>()
    for (const scene of targets) {
      const enemyEnemies = buildEnemyRoster(scene)
      if (enemyEnemies.length === 0) continue
      let wins = 0
    let executedScene = 0
    let rounds = 0
    let decided = 0
    let surv = 0
    let survSamples = 0
    for (let i = 0; i < n; i++) {
      const r = await runQuickBattle({ allyActors, enemyEnemies })
      launched++
      if (!r.ok) {
        const reason = r.reason ?? 'unknown'
        failures.set(reason, (failures.get(reason) ?? 0) + 1)
        continue
      }
      executed++
      executedScene++
      if (r.winner === ParticipantSide.ALLY) {
        wins++
        totWins++
      }
      if (r.winner !== null) {
        rounds += r.rounds
        decided++
        totRounds += r.rounds
        totDecided++
      }
      const allyTeam = r.summary?.teams.find((t) => t.side === ParticipantSide.ALLY)
      if (allyTeam) {
        surv += allyTeam.survivors
        survSamples++
        totSurv += allyTeam.survivors
        totSurvSamples++
      }
    }
    rows.push({
      id: scene.id,
      name: scene.name,
      battles: n,
      wins,
      winRate: executedScene > 0 ? Math.round((wins / executedScene) * 100) : null,
      avgRounds: decided > 0 ? Math.round((rounds / decided) * 10) / 10 : null,
      avgSurvivors: survSamples > 0 ? Math.round((surv / survSamples) * 10) / 10 : null,
    })
  }
  const failedCount = launched - executed
  // prep 副作用（加点/穿装/阵容）在模拟前已生效：无论成败都落盘，fail 时也带 prep 报告防状态丢失感知
  void env.save.autoSave()
  if (rows.length === 0) return fail('没有可模拟的敌方编成（场景敌表为空或敌人 id 失效）', { prep })
  if (launched > 0 && executed === 0) {
    const first = [...failures.entries()].map(([reason, count]) => `${reason}×${count}`).join('、')
    return fail(`模拟未能启动：${first}`, { prep, failures: [...failures.entries()].map(([reason, count]) => ({ reason, count })) })
  }
  const totalWinRate = executed > 0 ? Math.round((totWins / executed) * 100) : null
  const totalAvgRounds = totDecided > 0 ? Math.round((totRounds / totDecided) * 10) / 10 : null
  const totalAvgSurvivors = totSurvSamples > 0 ? Math.round((totSurv / totSurvSamples) * 10) / 10 : null
  const notCleared = rows.filter((r) => r.winRate !== null && r.winRate < 100)
  const failureText = failedCount > 0 ? ` · 未启动 ${failedCount} 场` : ''
  const prepText = prepSummary(prep)
  return ok(
    `模拟完成：${rows.length} 场景 ${launched} 战 · 我方胜率 ${totalWinRate === null ? '-' : `${totalWinRate}%`} · 平均 ${totalAvgRounds ?? '-'} 回合 · 未全胜场景 ${notCleared.length}${notCleared.length > 0 ? `（${notCleared.slice(0, 3).map((r) => r.name).join('、')}）` : ''}${failureText}${prepText ? `（${prepText}）` : ''}`,
    {
      mode: 'sim',
      prep,
      scenes: rows,
      total: {
        scenes: rows.length,
        battles: launched,
        executed,
        wins: totWins,
        winRate: totalWinRate,
        avgRounds: totalAvgRounds,
        avgSurvivors: totalAvgSurvivors,
        failures: [...failures.entries()].map(([reason, count]) => ({ reason, count })),
      },
    },
  )
}

/** 玩家状态调试（D02） */
function buildPlayerCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { player } = env
  const p = player.player
  return {
    id: PLAYER_ID,
    label: '状态',
    groups: [
      {
        id: 'level',
        label: '等级',
        actions: [
          {
            id: 'player_level_1',
            label: '等级 +1',
            execute: () => ok(`等级 ${p.level} → ${p.level + 1}`, playerSetLevel(env, p.level + 1)),
          },
          {
            id: 'player_level_10',
            label: '等级 +10',
            execute: () => ok(`等级 ${p.level} → ${p.level + 10}`, playerSetLevel(env, p.level + 10)),
          },
          {
            id: 'player_level_set',
            label: '设为指定等级',
            input: { type: 'number', min: 1, max: 200, required: true },
            execute: (lv) => ok(`等级已设为 ${lv}`, playerSetLevel(env, Number(lv))),
          },
        ],
      },
      {
        id: 'economy',
        label: '金钱',
        actions: [
          {
            id: 'player_gold_1000',
            label: '金钱 +1000',
            execute: () => {
              player.gainCurrency('money', 1000)
              return ok(`金钱 +1000（当前 ${player.currency.money}）`)
            },
          },
          {
            id: 'player_gold_10000',
            label: '金钱 +10000',
            execute: () => {
              player.gainCurrency('money', 10000)
              return ok(`金钱 +10000（当前 ${player.currency.money}）`)
            },
          },
          {
            id: 'player_gold_zero',
            label: '金钱清零',
            execute: () => {
              player.currency.money = 0
              return ok('金钱已清零')
            },
          },
        ],
      },
      {
        id: 'exp',
        label: '经验',
        actions: [
          {
            id: 'player_exp_500',
            label: '经验 +500',
            execute: () => {
              player.gainExp(500)
              return ok(`经验 +500（当前 ${p.exp}/${p.expNeed}）`)
            },
          },
          {
            id: 'player_exp_critical',
            label: '经验设为升级临界',
            execute: () => {
              // 封顶等级 expNeed 为 Infinity：不设 Infinity，保持当前值并提示
              if (!Number.isFinite(p.expNeed)) return fail('当前等级已封顶，无升级临界')
              p.exp = Math.max(0, p.expNeed - 1)
              return ok(`经验已设为升级临界（${p.exp}/${p.expNeed}）`)
            },
          },
        ],
      },
      {
        id: 'growth',
        label: '成长曲线',
        actions: [
          {
            id: 'player_hp_100',
            label: 'HP 上限 +100',
            execute: () => {
              p.maxHp += 100
              return ok(`气血上限 +100（当前 ${p.maxHp}）`)
            },
          },
          {
            id: 'player_energy_150',
            label: '能量上限设为 150',
            execute: () => {
              p.maxEnergy = 150
              return ok(`能量上限已设为 150`)
            },
          },
          {
            id: 'player_energy_200',
            label: '能量上限设为 200',
            execute: () => {
              p.maxEnergy = 200
              return ok(`能量上限已设为 200`)
            },
          },
          {
            id: 'player_atk_10',
            label: '基础攻击 +10',
            execute: () => {
              p.attackMin += 10
              p.attackMax += 10
              return ok(`攻击 +10（当前 ${p.attackMin}-${p.attackMax}）`)
            },
          },
          {
            id: 'player_atk_50',
            label: '基础攻击 +50',
            execute: () => {
              p.attackMin += 50
              p.attackMax += 50
              return ok(`攻击 +50（当前 ${p.attackMin}-${p.attackMax}）`)
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'player_reset',
            label: '重置为初始状态',
            danger: true,
            execute: () => {
              Object.assign(p, createPlayerProfile({ level: 1, exp: 0, stats: { available: 4, hp: 0, atk: 0, def: 0, hit: 0, dodge: 0, speed: 0 } }))
              player.statPoints.available = 4
              player.statPoints.hp = 0
              player.statPoints.atk = 0
              player.statPoints.def = 0
              player.statPoints.hit = 0
              player.statPoints.dodge = 0
              player.statPoints.speed = 0
              player.currency.money = 0
              player.currency.xianyuan = 100 // 对齐 playerStore 初始灵韵
              return ok('玩家已重置为初始状态')
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'player_view',
            label: '查看完整属性面板',
            execute: () => {
              const payload = {
                level: p.level,
                exp: p.exp,
                expNeed: p.expNeed,
                hp: p.hp,
                maxHp: p.maxHp,
                energy: p.energy,
                maxEnergy: p.maxEnergy,
                attackMin: p.attackMin,
                attackMax: p.attackMax,
                defense: p.defense,
                speed: p.speed,
                critRate: p.critRate,
                critDamage: p.critDamage,
                hitRate: p.hitRate,
                dodgeRate: p.dodgeRate,
                currency: { ...player.currency },
                statPoints: { ...player.statPoints },
                playerAttributes: player.playerAttributes,
              }
              return ok('玩家属性快照', payload)
            },
          },
        ],
      },
    ],
  }
}

/** 存档调试（D05） */
function buildSaveCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { save } = env
  return {
    id: 'save',
    label: '存档',
    groups: [
      {
        id: 'basic',
        label: '基础操作',
        actions: [
          {
            id: 'save_manual',
            label: '手动保存',
            execute: async () => {
              const ok_ = await save.save('manual')
              return ok_ ? ok('已写入主档') : fail('保存失败')
            },
          },
          {
            id: 'save_load',
            label: '手动加载',
            execute: async () => {
              const r = await save.load()
              return r.ok ? ok(r.message ?? '已从磁盘加载', { source: r.source }) : fail(r.message ?? '加载失败')
            },
          },
          {
            id: 'save_export',
            label: '导出 JSON',
            execute: async () => {
              await save.exportSave()
              return ok('已触发 JSON 下载')
            },
          },
          {
            id: 'save_import',
            label: '导入 JSON',
            input: { type: 'file', required: true },
            execute: async (file) => {
              if (!(file instanceof File)) return fail('未选择文件')
              const r = await save.importSave(file)
              if (!r.ok) return fail(r.message ?? '导入失败')
              // 配置指纹漂移警告拼入结果：调试动作导档时同样需要感知数据版本不一致
              return ok(r.warning ? `${r.message ?? '导入成功'}；${r.warning}` : r.message ?? '导入成功')
            },
          },
        ],
      },
      {
        id: 'migrate',
        label: '迁移与容错',
        actions: [
          {
            id: 'save_legacy',
            label: '模拟旧版存档(v1.x)',
            execute: async () => {
              await save.debugWriteLegacy()
              const r = await save.load()
              return r.ok ? ok(`已写入 v1.x 旧档并触发迁移（${r.message ?? '成功'}）`, { source: r.source }) : fail('迁移失败')
            },
          },
          {
            id: 'save_corrupt',
            label: '模拟损坏存档',
            execute: async () => {
              await save.debugWriteCorrupt()
              const r = await save.load()
              return r.ok ? ok(`已写入损坏档并验证降级（${r.message ?? '成功'}）`, { source: r.source }) : fail('降级失败')
            },
          },
          {
            id: 'save_compare',
            label: '存档对比（内存 vs 磁盘）',
            execute: async () => {
              const cmp = await save.debugCompare()
              return ok(
                cmp.changed ? `检测到 ${cmp.diffs.length} 处差异：${cmp.diffs.join('、')}` : '内存与磁盘一致',
                { changed: cmp.changed, diffs: cmp.diffs, memory: cmp.memory, disk: cmp.disk },
              )
            },
          },
        ],
      },
      {
        id: 'diag',
        label: '诊断',
        actions: [
          {
            id: 'save_raw',
            label: '查看存档原始数据',
            execute: async () => {
              const raw = await save.debugReadRaw()
              return raw ? ok('IndexedDB 主档原始 JSON', raw) : fail('磁盘无主档')
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'save_clear',
            label: '清空存档',
            danger: true,
            execute: async () => {
              await save.debugClearAll()
              return ok('已删除全部存档键（主档 + 自动备份）')
            },
          },
        ],
      },
    ],
  }
}

// ══════════════════════════════════════════════════════════════════
// 第二批：装备调试（D03）+ 行囊调试（D04）+ 场景进度调试（D06）
// ══════════════════════════════════════════════════════════════════

/** 装备调试（D03）：装备操作作用于「背包中第一件未穿戴实例」，详情 JSON 展示操作对象 */
function buildGearCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { pack } = env
  const gearOptions = () =>
    pack.gearInstances.map((g) => ({ value: g.instanceId, label: `${pack.gearById(g.itemId)?.name ?? g.itemId} +${g.enhance}` }))

  /** 装备品质（equipment.json rarity，供词缀 roll 的 quality 参数） */
  const rarityOf = (itemId: string): number => pack.gearById(itemId)?.rarity ?? 1
  /** 生成装备实例（品质按稀有度 roll / 制造锁定；品质系数同打造/掉落口径在区间内 roll，不取中值） */
  const newInstance = (itemId: string): GearInstance => {
    const quality = getCraftQualityLock() ?? rarityOf(itemId)
    return makeInstance(itemId, pack.rollAffixes(itemId, quality), 0, quality, rollQualityFactor(quality))
  }

  return {
    id: 'gear',
    label: '装备',
    groups: [
      {
        id: 'fabao',
        label: '法宝给予',
        actions: [
          {
            id: 'fabao_give',
            label: '给予指定法宝/神器',
            input: {
              type: 'select',
              options: () => fabaoDefs.map((d) => ({ value: d.id, label: `${d.kind === 'fabao' ? '法宝' : '神器'}·${d.name}` })),
              required: true,
            },
            execute: (defId) => {
              const def = fabaoDefs.find((d) => d.id === String(defId))
              if (!def) return fail('未知法宝 ID')
              const inst = grantFabao(def.id, 1)
              return inst ? ok(`已给予 ${def.kind === 'fabao' ? '法宝' : '神器'}「${def.name}」（凡品）`) : fail('发放失败')
            },
          },
          {
            id: 'fabao_material',
            label: '给予灵尘/器灵×20',
            execute: () => {
              pack.addItem('spirit_dust', 20)
              pack.addItem('spirit_core', 20)
              return ok('已给予 灵尘×20、器灵×20')
            },
          },
        ],
      },
      {
        id: 'petmount',
        label: '宠物/坐骑给予',
        actions: [
          {
            id: 'pet_give',
            label: '给予指定个体',
            input: {
              type: 'select',
              options: () =>
                [...petIndividuals, ...mountIndividuals].map((i) => ({
                  value: i.id,
                  label: `${i.id.startsWith('pet_') ? '灵宠' : '坐骑'}·${i.name}`,
                })),
              required: true,
            },
            execute: (id) => {
              const inst = grantPetMount(String(id))
              return inst
                ? ok(`已获得个体「${individualById(inst.individualId)?.name ?? inst.individualId}」（资质 ${inst.aptitude}）`)
                : fail('发放失败（未知个体或已拥有——个体唯一持有）')
            },
          },
          {
            id: 'pet_material',
            label: '给予宠物养成材料×10',
            execute: () => {
              pack.addItem('pet_exp_pill', 10)
              pack.addItem('pet_aptitude_pill', 10)
              pack.addItem('pet_break_pill_1', 10)
              pack.addItem('pet_break_pill_2', 10)
              pack.addItem('pet_break_pill_3', 10)
              return ok('已给予 宠物经验丹/资质丹/突破丹壹贰叁 各×10')
            },
          },
        ],
      },
      {
        id: 'give',
        label: '装备给予',
        actions: [
          {
            id: 'gear_give',
            label: '给予指定装备',
            input: {
              type: 'select',
              options: () => env.equipmentCatalog.map((e) => ({ value: e.id, label: e.name })),
              placeholder: '选择装备',
              required: true,
            },
            execute: (itemId) => {
              const id = String(itemId)
              if (!pack.gearById(id)) return fail('未知装备 ID')
              pack.addItem(id, 1)
              return ok(`已给予「${pack.gearById(id)?.name ?? id}」入背包`)
            },
          },
          {
            id: 'gear_give_all',
            label: '给予全槽位装备',
            input: {
              type: 'select',
              options: RARITY_OPTIONS,
            },
            execute: (rarity) => {
              const r = Number(rarity ?? 1)
              // NOTE: 全槽位 = GEAR_SLOT_LABELS（8 槽枚举；equipment.json 现有 6 槽数据，artifact/relic 无装备自动跳过）
              const given: string[] = []
              for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
                const pick = env.equipmentCatalog.find((e) => e.slot === slot && e.rarity === r)
                if (pick) {
                  pack.addItem(pick.id, 1)
                  given.push(pick.name)
                }
              }
              return ok(`全槽位已给予${given.length}件：${given.join('、')}`, given)
            },
          },
          {
            id: 'gear_give_starter',
            label: '发放新手装备套',
            execute: () => {
              const given: string[] = []
              for (const it of env.starter.items()) {
                const def = pack.gearById(it.itemId)
                if (!def) continue
                pack.addItem(it.itemId, it.count)
                given.push(def.name)
              }
              return given.length ? ok(`新手套装已发放 ${given.length} 件：${given.join('、')}`, given) : fail('新手套装清单为空')
            },
          },
          {
            id: 'gear_starter_toggle',
            label: '新档自动生成新手套',
            toggle: true,
            initial: () => env.starter.enabled(),
            execute: async (_p, on) => {
              const next = !on
              if (!(await env.starter.setEnabled(next))) return fail('写入 pack 配置失败（IDB 不可用或 pack 文档缺失）')
              return {
                success: true,
                message: next
                  ? '已启用：新游戏自动生成新手装备套'
                  : '已禁用：新游戏不再自动生成（可用「发放新手装备套」补发）',
                nextState: next,
              }
            },
          },
        ],
      },
      {
        id: 'operate',
        label: '装备操作（作用于背包首件实例）',
        actions: [
          {
            id: 'gear_enhance',
            label: '强化 +1',
            input: {
              type: 'select',
              options: gearOptions,
              placeholder: '选择背包实例',
              required: true,
            },
            execute: (instId) => {
              const inst = pack.gearInstances.find((g) => g.instanceId === instId)
              if (!inst) return fail('未找到该装备实例')
              // 与正规强化路径同口径：按品阶封顶（enhanceMaxByRarity），不产生超限非法实例
              const max = enhanceMaxByRarity(pack.gearById(inst.itemId)?.rarity ?? 1)
              if (inst.enhance >= max) return fail(`已达强化上限 +${max}`)
              inst.enhance = Math.min(inst.enhance + 1, max)
              void pack.flush()
              return ok(`「${pack.gearById(inst.itemId)?.name ?? inst.itemId}」强化 +${inst.enhance}（上限 +${max}）`)
            },
          },
          {
            id: 'gear_enhance_5',
            label: '强化 +5',
            input: {
              type: 'select',
              options: gearOptions,
              placeholder: '选择背包实例',
              required: true,
            },
            execute: (instId) => {
              const inst = pack.gearInstances.find((g) => g.instanceId === instId)
              if (!inst) return fail('未找到该装备实例')
              const max = enhanceMaxByRarity(pack.gearById(inst.itemId)?.rarity ?? 1)
              if (inst.enhance >= max) return fail(`已达强化上限 +${max}`)
              inst.enhance = Math.min(inst.enhance + 5, max)
              void pack.flush()
              return ok(`「${pack.gearById(inst.itemId)?.name ?? inst.itemId}」强化 +${inst.enhance}（上限 +${max}）`)
            },
          },
          {
            id: 'gear_reroll',
            label: '词缀重roll',
            input: {
              type: 'select',
              options: gearOptions,
              placeholder: '选择背包实例',
              required: true,
            },
            execute: (instId) => {
              const inst = pack.gearInstances.find((g) => g.instanceId === instId)
              if (!inst) return fail('未找到该装备实例')
              // NOTE: 用实例品质 inst.quality（而非装备阶位 rarityOf）——制造品质锁定后两者可不同，
              //       重roll应保持实例词缀数量语义（affixCountByQuality）
              inst.affixes = pack.rollAffixes(inst.itemId, inst.quality)
              void pack.flush()
              return ok(`「${pack.gearById(inst.itemId)?.name ?? inst.itemId}」词缀已重roll`, inst.affixes)
            },
          },
          {
            id: 'gear_affix_inject',
            label: '指定词缀注入',
            input: [
              {
                id: 'inst',
                type: 'select',
                options: gearOptions,
                placeholder: '选择装备实例',
                required: true,
              },
              {
                id: 'affix',
                type: 'select',
                options: () => EQUIP_AFFIXES.map((a) => ({ value: a.id, label: `${a.name}（${a.attribute} ${a.modifierType === 'percent' ? '%' : '固定'}）` })),
                placeholder: '选择词条',
                required: true,
              },
            ],
            execute: (params) => {
              const p = params as Record<string, string | number | File | null>
              const affix = EQUIP_AFFIXES.find((a) => a.id === p.affix)
              if (!affix) return fail('未知词条')
              const inst = pack.gearInstances.find((g) => g.instanceId === p.inst)
              if (!inst) return fail('未找到该装备实例')
              const gear = pack.gearById(inst.itemId)
              // 同 id 词缀不重复注入（避免同词条叠加）
              if (inst.affixes.some((a) => a.id === affix.id)) return fail('该词缀已在装备上')
              // 数值取 valueRange 中值（调试注入固定值，便于验证效果）
              const value = Math.round((affix.valueRange.min + affix.valueRange.max) / 2)
              inst.affixes.push({
                id: affix.id,
                attribute: affix.attribute,
                modifierType: affix.modifierType,
                value,
              })
              void pack.flush()
              // applicableSlots 可能为复合格式（如 'glove:护手' / 'weapon:轻型'），按 : 前缀匹配槽位
              const slotFit = gear
                ? affix.applicableSlots.some((s) => s.split(':')[0] === gear.slot)
                : true
              return ok(
                `已注入「${affix.name}」到「${gear?.name ?? inst.itemId}」${gear ? `（槽位 ${gear.slot}${slotFit ? '' : '，警告：不适用于该槽位'}）` : ''}`,
                inst.affixes,
              )
            },
          },
        ],
      },
      {
        id: 'craft',
        label: '制造调试',
        actions: [
          {
            id: 'gear_craft',
            label: '制造指定配方',
            input: {
              type: 'select',
              options: () => env.forgeRecipes.map((r) => ({ value: r.id, label: env.equipmentCatalog.find((g) => g.id === r.equipmentId)?.name ?? r.equipmentId })),
              placeholder: '选择配方',
              required: true,
            },
            execute: (recipeId) => {
              const r = env.forgeRecipes.find((x) => x.id === recipeId || x.equipmentId === recipeId)
              const equipmentId = r?.equipmentId ?? String(recipeId)
              if (!pack.gearById(equipmentId)) return fail('配方未对应可用装备')
              const inst = newInstance(equipmentId)
              pack.gearInstances.push(inst)
              void pack.flush()
              return ok(`已直接制造「${pack.gearById(equipmentId)?.name ?? equipmentId}」（跳过材料检查）`, inst)
            },
          },
          {
            id: 'gear_craft_quality',
            label: '制造品质锁定',
            input: {
              type: 'select',
              options: [{ value: '', label: '不锁定（按稀有度随机）' }, ...RARITY_OPTIONS],
              placeholder: '选择锁定品质',
            },
            execute: (q) => {
              craftQualityLock = q === '' || q === null ? null : Number(q)
              return ok(craftQualityLock === null ? '制造品质锁定已解除' : `制造品质已锁定为 ${craftQualityLock} 品`)
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'gear_clear',
            label: '清空全部装备',
            danger: true,
            execute: () => {
              pack.gearInstances = []
              for (const slot of Object.keys(pack.equipped) as Array<keyof typeof pack.equipped>) {
                delete pack.equipped[slot]
              }
              void pack.flush()
              return ok('已清空全部装备实例与穿戴槽位')
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'gear_view',
            label: '查看背包装备实例',
            execute: () => {
              const payload = pack.gearInstances.map((g) => ({
                instanceId: g.instanceId,
                itemId: g.itemId,
                name: pack.gearById(g.itemId)?.name ?? g.itemId,
                enhance: g.enhance,
                affixes: g.affixes,
              }))
              return payload.length > 0 ? ok(`背包 ${payload.length} 件装备实例`, payload) : fail('背包无装备实例')
            },
          },
        ],
      },
    ],
  }
}

/** 行囊调试（D04） */
function buildPackCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { pack } = env
  // NOTE: 下拉与"给予全部N阶材料"同源（items.json 全量）——避免 pack.json 初始表仅 13 种时
  //       指定材料选不到全量材料（与用户反馈"全部二阶只有一种"同根因）
  const matOptions = () =>
    env.items
      .filter((it) => MATERIAL_TYPES.has(it.type))
      .map((it) => ({ value: it.name, label: it.name }))
  const pillOptions = () =>
    env.items
      .filter((it) => it.type === '丹药' || it.type === '永久丹药')
      .map((it) => ({ value: it.name, label: it.name }))
  /** name → itemId（caveLogic 同源） */
  const idByName = (name: string): string | null => {
    const it = env.items.find((x) => x.name === name)
    return it?.id ?? null
  }

  return {
    id: 'pack',
    label: '行囊',
    groups: [
      {
        id: 'material',
        label: '材料',
        actions: [
          {
            id: 'pack_mat_99',
            label: '给予指定材料 x99',
            input: {
              type: 'select',
              options: matOptions,
              placeholder: '选择材料',
              required: true,
            },
            execute: (name) => {
              const id = idByName(String(name))
              if (!id) return fail('未找到该材料')
              pack.addItem(id, 99)
              return ok(`「${name}」×99 已入背包`)
            },
          },
          {
            id: 'pack_mat_all_t1',
            label: '给予全部一阶材料',
            execute: () => {
              let n = 0
              for (const it of env.items) {
                if (it.rarity === 1 && MATERIAL_TYPES.has(it.type)) {
                  pack.addItem(it.id, 99)
                  n++
                }
              }
              return ok(`已给予 ${n} 种一阶材料各 99`)
            },
          },
          {
            id: 'pack_mat_all_t2',
            label: '给予全部二阶材料',
            execute: () => {
              let n = 0
              for (const it of env.items) {
                if (it.rarity === 2 && MATERIAL_TYPES.has(it.type)) {
                  pack.addItem(it.id, 99)
                  n++
                }
              }
              return ok(`已给予 ${n} 种二阶材料各 99`)
            },
          },
        ],
      },
      {
        id: 'pill',
        label: '丹药',
        actions: [
          {
            id: 'pack_pill_10',
            label: '给予指定丹药 x10',
            input: {
              type: 'select',
              options: pillOptions,
              placeholder: '选择丹药',
              required: true,
            },
            execute: (name) => {
              const id = idByName(String(name))
              if (!id) return fail('未找到该丹药')
              pack.addItem(id, 10)
              return ok(`「${name}」×10 已入背包`)
            },
          },
        ],
      },
      {
        id: 'enh_stone',
        label: '强化',
        actions: [
          {
            id: 'pack_enh_stone',
            label: '给予强化石 ×50',
            execute: () => {
              pack.addItem('enh_stone', 50)
              return ok('「强化石」×50 已入背包', [{ id: 'enh_stone', name: '强化石' }])
            },
          },
          {
            id: 'enhance_sim',
            label: '强化批量模拟（纯采样，不改状态）',
            input: [
              { id: 'current', type: 'number', placeholder: '当前强化等级 0~14（默认 0）' },
              {
                id: 'rarity',
                type: 'select',
                options: [
                  { value: '1', label: '凡品（+3）' },
                  { value: '2', label: '玄品（+6）' },
                  { value: '3', label: '地品（+9）' },
                  { value: '4', label: '天品（+12）' },
                  { value: '5', label: '仙品（+15）' },
                ],
                placeholder: '品阶',
              },
              { id: 'target', type: 'number', placeholder: '目标等级（默认该品阶上限）' },
              {
                id: 'count',
                type: 'select',
                options: [
                  { value: '100', label: '100 轮' },
                  { value: '1000', label: '1000 轮' },
                  { value: '10000', label: '10000 轮' },
                ],
                placeholder: '模拟轮数',
              },
              { id: 'seed', type: 'text', placeholder: '随机种子（留空随机）' },
            ],
            execute: (params) => {
              const p = params as Record<string, string | number | File | null>
              const current = Math.max(0, Math.min(14, Math.floor(Number(p.current ?? 0) || 0)))
              const rarity = Math.max(1, Math.min(5, Number(p.rarity ?? 1) || 1))
              const maxL = Math.min(
                Math.max(current + 1, Math.floor(Number(p.target ?? 99) || 99)),
                enhanceMaxByRarity(rarity),
              )
              if (current >= maxL) return fail(`当前等级已到该品阶上限 +${enhanceMaxByRarity(rarity)}`)
              const rounds = Math.max(1, Math.min(100000, Number(p.count ?? 1000) || 1000))
              const rng = rngFn(createRng(p.seed ? String(p.seed).trim() : Date.now() ^ Math.floor(Math.random() * 0x7fffffff)))

              let triesAll = 0
              let costAll = 0
              let pityAll = 0
              let successAll = 0
              let done = 0
              const byLevel = new Map<number, { tries: number; cost: number; okCnt: number; failCnt: number }>()
              for (let r = 0; r < rounds; r++) {
                let enhance = current
                let failStreak = 0
                // 保底语义（enhanceSuccessRate 内含 +10×连败）：失败 6 次后成功率钳到 100%，每级至多 7 次必成，循环必终止
                while (enhance < maxL) {
                  const at = enhance
                  const rate = enhanceSuccessRate(at, failStreak) / 100
                  const cost = enhanceCost(at, rarity)
                  triesAll++
                  costAll += cost
                  const stat = byLevel.get(at) ?? { tries: 0, cost: 0, okCnt: 0, failCnt: 0 }
                  stat.tries++
                  stat.cost += cost
                  if (rng() < rate) {
                    stat.okCnt++
                    enhance++
                    successAll++
                    if (failStreak >= 6) pityAll++
                    failStreak = 0
                  } else {
                    stat.failCnt++
                    failStreak++
                  }
                  byLevel.set(at, stat)
                }
                if (enhance >= maxL) done++
              }
              const rarityLabel = ['凡', '玄', '地', '天', '仙'][rarity - 1] ?? String(rarity)
              const avgTries = Math.round((triesAll / rounds) * 10) / 10
              const avgCost = Math.round(costAll / rounds)
              const successRate = triesAll ? Math.round((successAll / triesAll) * 1000) / 10 : 0
              const reachRate = Math.round((done / rounds) * 1000) / 10
              return ok(
                `+${current}→+${maxL}（${rarityLabel}品）×${rounds} 轮：平均 ${avgTries} 次尝试 · 每轮花费 ${avgCost} 金 · 实测成功率 ${successRate}% · 保底触发 ${pityAll} 次 · 达成率 ${reachRate}%`,
                {
                  from: current,
                  to: maxL,
                  rounds,
                  avgTries,
                  avgCost,
                  successRate,
                  pity: pityAll,
                  reachRate,
                  byLevel: [...byLevel.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([level, s]) => ({
                      // level = 目标强化等级 L（当前 enhance + 1，与公式口径一致）
                      level: level + 1,
                      avgTries: Math.round((s.tries / rounds) * 100) / 100,
                      avgCost: Math.round(s.cost / rounds),
                      successRate: s.tries ? Math.round((s.okCnt / s.tries) * 1000) / 10 : 0,
                    })),
                },
              )
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'pack_clear',
            label: '清空背包',
            danger: true,
            execute: () => {
              pack.inventory = {}
              pack.gearInstances = []
              void pack.flush()
              return ok('背包已清空（材料/装备实例归零）')
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'pack_snapshot',
            label: '查看背包快照',
            execute: () => {
              const snapshot = {
                inventory: { ...pack.inventory },
                storage: pack.storage.map((s) => ({ itemId: s.itemId, count: s.count })),
                gearCount: pack.gearInstances.length,
                owned: pack.ownedItems.length,
              }
              return ok(`背包 ${Object.keys(pack.inventory).length} 种物品 + ${pack.gearInstances.length} 件装备`, snapshot)
            },
          },
        ],
      },
    ],
  }
}

/** 场景进度调试（D06） */
function buildSceneCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { scenes } = env
  return {
    id: 'scene',
    label: '场景',
    groups: [
      {
        id: 'unlock',
        label: '解锁',
        actions: [
          {
            id: 'scene_unlock_all',
            label: '解锁全部场景',
            execute: () => {
              let n = 0
              for (const s of scenes) {
                if (!s.unlocked) {
                  s.unlocked = true
                  n++
                }
              }
              return ok(`已解锁 ${n} 个场景（当前 ${scenes.filter((s) => s.unlocked).length}/${scenes.length}）`)
            },
          },
          {
            id: 'scene_jump',
            label: '跳转到指定场景',
            input: {
              type: 'select',
              options: () => scenes.map((s) => ({ value: s.id, label: `${s.name}（Lv.${s.levelRange?.[0] ?? '?'}）` })),
              placeholder: '选择场景',
              required: true,
            },
            execute: (id) => {
              const s = scenes.find((x) => x.id === id)
              if (!s) return fail('未知场景')
              s.unlocked = true
              return ok(`已跳转「${s.name}」（标记解锁；实际切换由路引完成）`)
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'scene_reset',
            label: '重置进度',
            danger: true,
            execute: () => {
              for (const s of scenes) {
                s.unlocked = !s.unlockCondition?.sceneId
                s.stars = 0
              }
              const first = scenes.find((s) => s.unlocked)
              return ok(`进度已重置，保留关卡「${first?.name ?? ''}」解锁`)
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'scene_snapshot',
            label: '查看进度快照',
            execute: () => {
              const payload = scenes.map((s) => ({
                id: s.id,
                name: s.name,
                unlocked: s.unlocked,
                stars: s.stars,
              }))
              return ok(`进度快照（${payload.length} 关）`, payload)
            },
          },
        ],
      },
    ],
  }
}

// ══════════════════════════════════════════════════════════════════
// 第三批：修行调试（D07）+ 任务调试（D08）+ 经济词缀调试（D09）
// ══════════════════════════════════════════════════════════════════

/** 修行调试（D07） */
function buildCultivateCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { schools, player, skillPoints } = env
  return {
    id: 'cultivate',
    label: '修行',
    groups: [
      {
        id: 'school',
        label: '流派',
        actions: [
          {
            id: 'cult_school_view',
            label: '查看流派列表',
            execute: () => {
              const payload = schools.map((s) => ({ id: s.id, name: s.name, nodes: s.nodes.length }))
              return ok(`流派列表（${payload.length} 支）`, payload)
            },
          },
        ],
      },
      {
        id: 'skill',
        label: '技能树',
        actions: [
          {
            id: 'cult_skill_5',
            label: '技能点 +5',
            execute: () => {
              const sp = skillPoints
              if (!sp) return fail('技能点系统未就绪')
              sp.spent = Math.max(0, sp.spent - 5)
              return ok(`技能点 +5（可用 ${Math.max(0, sp.earned - sp.spent)}/${sp.max}）`)
            },
          },
          {
            id: 'cult_skill_pill',
            label: '悟道丹 +1 技能点',
            execute: () => {
              if (!grantPillPoint()) return fail('悟道丹已服满 10 颗')
              return ok(`悟道丹 +1（已用 ${skillPoints.totalPillsUsed}/10）`)
            },
          },
          {
            id: 'cult_skill_reset',
            label: '重置技能树',
            danger: true,
            execute: () => {
              const sp = skillPoints
              if (!sp) return fail('技能点系统未就绪')
              sp.spent = 0
              equippedSkills.passive = []
              equippedSkills.small = []
              equippedSkills.ultimate = null
              pureSchoolBonus.value = null
              for (const s of schools) {
                for (const n of s.nodes ?? []) n.learned = false
              }
              // 流派树（schools.json）同步清空
              for (const l of schoolsLayers) {
                for (const n of l.nodes) n.ranks = 0
              }
              return ok('技能树已重置（全部节点未点亮，装备槽已清空）')
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'cult_modifier_view',
            label: '查看属性加成明细',
            execute: () => {
              const payload = {
                player: {
                  level: player.player.level,
                  attackMin: player.player.attackMin,
                  attackMax: player.player.attackMax,
                  defense: player.player.defense,
                  speed: player.player.speed,
                  maxHp: player.player.maxHp,
                  maxEnergy: player.player.maxEnergy,
                },
                statPoints: { ...player.statPoints },
                playerAttributes: player.playerAttributes,
              }
              return ok('属性加成明细（玩家基础 + 加点）', payload)
            },
          },
        ],
      },
    ],
  }
}

/** 任务调试（D08） */
function buildQuestCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { quests } = env
  return {
    id: 'quest',
    label: '任务',
    groups: [
      {
        id: 'progress',
        label: '任务进度',
        actions: [
          {
            id: 'quest_complete_all',
            label: '完成全部任务',
            execute: () => {
              let n = 0
              for (const q of quests) {
                if (q.progress < q.target) {
                  q.progress = q.target
                  n++
                }
              }
              return ok(`已完成 ${n} 个任务（共 ${quests.length} 个）`)
            },
          },
          {
            id: 'quest_reset',
            label: '重置任务进度',
            danger: true,
            execute: () => {
              for (const q of quests) q.progress = 0
              return ok('任务进度已全部重置')
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'quest_view',
            label: '查看任务状态',
            execute: () => {
              const payload = quests.map((q) => ({ type: q.type, name: q.name, progress: q.progress, target: q.target, reward: q.reward }))
              return ok(`任务状态（${payload.length} 个）`, payload)
            },
          },
        ],
      },
    ],
  }
}

/** 经济词缀调试（D09） */
function buildEconomyCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { player, pack, battle } = env
  /** 敌方词缀下拉（target=enemy 的增益词缀） */
  const enemyAffixOptions = () =>
    AFFIX_LIBRARY.affixes
      .filter((a) => a.target === 'enemy')
      .map((a) => ({ value: a.id, label: `${a.name}（${a.description ?? a.id}）` }))
  /** 指定敌方词缀注入当前战斗全部敌人（先清旧词缀再注入，避免累积） */
  const injectEnemyAffix = (affixId: string): { ok: boolean; applied: string[]; message: string } => {
    const affix = AFFIX_LIBRARY.affixes.find((a) => a.id === affixId)
    if (!affix) return { ok: false, applied: [], message: '未知词缀' }
    const enemies = battle.enemyTeam
    if (enemies.length === 0) return { ok: false, applied: [], message: '当前无敌方参战（先开始战斗）' }
    const applied: string[] = []
    for (const e of enemies) {
      clearAffixesFromParticipant(e)
      if (applyAffixToParticipant(e, affix)) applied.push(e.name)
    }
    battle.syncTeams()
    return { ok: applied.length > 0, applied, message: `已向 ${applied.length}/${enemies.length} 名敌人注入「${affix.name}」` }
  }

  return {
    id: 'economy',
    label: '经济',
    groups: [
      {
        id: 'money',
        label: '货币',
        actions: [
          {
            id: 'econ_gold_set',
            label: '金钱设为指定值',
            input: { type: 'number', min: 0, max: 999999, placeholder: '目标金钱数', required: true },
            execute: (v) => {
              player.currency.money = Number(v)
              return ok(`金钱已设为 ${v}`)
            },
          },
          {
            id: 'econ_mat_x2',
            label: '背包倍增 x2',
            execute: () => {
              for (const [id, count] of Object.entries(pack.inventory)) {
                pack.inventory[id] = count * 2
              }
              void pack.flush()
              return ok(`全部背包物品数量翻倍（共 ${Object.keys(pack.inventory).length} 种）`)
            },
          },
          {
            id: 'econ_mat_x10',
            label: '背包倍增 x10',
            execute: () => {
              for (const [id, count] of Object.entries(pack.inventory)) {
                pack.inventory[id] = count * 10
              }
              void pack.flush()
              return ok(`全部材料数量 ×10（共 ${Object.keys(pack.inventory).length} 种）`)
            },
          },
        ],
      },
      {
        id: 'diagnose',
        label: '诊断',
        actions: [
          {
            id: 'econ_view',
            label: '查看经济状态',
            execute: () => {
              const payload = {
                currency: { ...player.currency },
                inventoryCount: Object.keys(pack.inventory).length,
                materials: { ...pack.inventory },
              }
              return ok('经济状态快照', payload)
            },
          },
        ],
      },
      {
        id: 'drop',
        label: '掉落',
        actions: [
          {
            id: 'econ_force_drop',
            label: '掉落率锁定 100%',
            toggle: true,
            execute: (_p, on) => {
              pack.setDebugForceDrops(!on)
              return { success: true, message: !on ? '掉落率已锁定 100%（验证掉落表完整性）' : '掉落率已恢复随机', nextState: !on }
            },
          },
        ],
      },
      {
        id: 'affix',
        label: '敌人词缀',
        actions: [
          {
            id: 'econ_enemy_affix',
            label: '注入敌人词缀',
            input: {
              type: 'select',
              options: enemyAffixOptions,
              placeholder: '选择敌人词缀',
              required: true,
            },
            execute: (affixId) => {
              const r = injectEnemyAffix(String(affixId))
              return r.ok ? ok(r.message, r.applied) : fail(r.message)
            },
          },
          {
            id: 'econ_enemy_affix_clear',
            label: '清除敌人词缀',
            execute: () => {
              const enemies = battle.enemyTeam
              if (enemies.length === 0) return fail('当前无敌方参战（先开始战斗）')
              let cleared = 0
              for (const e of enemies) {
                if (clearAffixesFromParticipant(e)) cleared++
              }
              battle.syncTeams()
              return cleared > 0 ? ok(`已清除 ${cleared}/${enemies.length} 名敌人的词缀`) : ok('敌人身上无词缀')
            },
          },
        ],
      },
    ],
  }
}

// ══════════════════════════════════════════════════════════════════
// 第四批：系统诊断（D10）
// ══════════════════════════════════════════════════════════════════

/** 系统诊断（D10） */
function buildDiagCategory(env: PlayerStoreDebugEnv): DebugCategory {
  const { diag, battle, player, pack } = env

  /** 性能快照：FPS 采样 + 内存（performance.memory 非标准，尽力而为）+ DOM 节点数 */
  const perfSnapshot = (): { fps: number | null; memoryMb: number | null; domNodes: number } => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return {
      fps: null,
      memoryMb: mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null,
      domNodes: document.querySelectorAll('*').length,
    }
  }

  return {
    id: 'diag',
    label: '诊断',
    groups: [
      {
        id: 'integrity',
        label: '数据完整性',
        actions: [
          {
            id: 'diag_integrity',
            label: '数据完整性检查',
            execute: async () => {
              const report = await diag.healthCheck()
              if (report.issues.length === 0) {
                return ok(`健康检查通过（扫描 ${report.scannedRules} 规则 / ${report.checkedEntities} 实体，无断裂引用）`, report)
              }
              return fail(`发现 ${report.issues.length} 处引用断裂`, report)
            },
          },
          {
            id: 'diag_dataversion',
            label: '查看 dataVersion',
            execute: async () => {
              const v = await diag.dataVersion()
              return ok(`封神榜数据版本：${v}`)
            },
          },
          {
            id: 'diag_reload',
            label: '配置数据热重载',
            execute: async () => {
              const ok_ = await diag.reloadXiyou()
              return ok_ ? ok('已重新从 IDB 加载西游配置') : fail('无封神榜数据，保持 configs 兜底')
            },
          },
        ],
      },
      {
        id: 'perf',
        label: '性能',
        actions: [
          {
            id: 'diag_perf',
            label: '性能快照',
            execute: () => {
              const snap = perfSnapshot()
              return ok(`DOM 节点 ${snap.domNodes} 个${snap.memoryMb !== null ? ` · 堆内存 ${snap.memoryMb}MB` : ''}`, snap)
            },
          },
        ],
      },
      {
        id: 'snapshot',
        label: '状态快照',
        actions: [
          {
            id: 'diag_state',
            label: '全系统状态快照',
            execute: () => {
              const payload = {
                player: { ...player.player, currency: { ...player.currency }, statPoints: { ...player.statPoints } },
                pack: {
                  inventory: { ...pack.inventory },
                  gearCount: pack.gearInstances.length,
                  equipped: { ...pack.equipped },
                  storage: pack.storage.map((s) => ({ itemId: s.itemId, count: s.count })),
                },
                battle: {
                  active: battle.isBattleActive,
                  turn: battle.currentTurn,
                  seed: battle.pendingSeed,
                },
              }
              return ok('全系统状态快照', payload)
            },
          },
        ],
      },
      {
        id: 'danger',
        label: '危险操作',
        actions: [
          {
            id: 'diag_reset',
            label: '重置全部状态（新游戏）',
            danger: true,
            execute: async () => {
              await env.save.reset()
              return ok('已重置全部状态为新游戏')
            },
          },
        ],
      },
    ],
  }
}

/**
 * 默认动作工厂：注入运行时环境，生成当前实现的全部分类。
 * 各批次功能以独立 buildXxxCategory 组织，未实现的分类不返回（面板不渲染空分类）。
 */
export function createDebugCategories(env: PlayerStoreDebugEnv): DebugCategory[] {
  return [
    buildBattleCategory(env),
    buildPlayerCategory(env),
    buildGearCategory(env),
    buildPackCategory(env),
    buildSaveCategory(env),
    buildSceneCategory(env),
    buildCultivateCategory(env),
    buildQuestCategory(env),
    buildEconomyCategory(env),
    buildDiagCategory(env),
  ]
}

