/**
 * 斗战西游 · 展示数据聚合层
 * NOTE: 配置数据自 configs/xiyou/*.json 导入（vite 别名 @configs），方便后续调数值；
 *       玩家运行时状态（属性/加点/货币）持有在 playerStore，本文件仅保留类型定义与配置数据。
 */

import caveJson from '@configs/xiyou/cave.json'
import collectJson from '@configs/xiyou/collect.json'
import cultivateJson from '@configs/xiyou/cultivate.json'
import enemiesJson from '@configs/enemies/enemies.json'
import enemySkillsJson from '@configs/xiyou/enemy-skills.json'
import equipmentJson from '@configs/equipment/equipment.json'
import equipJson from '@configs/xiyou/equip.json'
import itemsJson from '@configs/xiyou/items.json'
import mateJson from '@configs/xiyou/mate.json'
import packJson from '@configs/xiyou/pack.json'
import questJson from '@configs/xiyou/quest.json'
import regionsJson from '@configs/xiyou/regions.json'
import scenesJson from '@configs/xiyou/scenes.json'
import schoolsJson from '@configs/xiyou/schools.json'
import skillTreeJson from '@configs/xiyou/skill_tree.json.json'
import { reactive } from 'vue'
import { PLAYER_ID } from '@/shared/constants/player'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import type { Enemy, EnemyAffixPool, EnemyDrop, EnemySkills } from '@/shared/types/enemy'
import type { ItemEffect } from '@/shared/types/Item'
import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'
import type { EquipmentData, XiyouData } from '@/domain/fengshen/types'
import { migrateRarityField } from './quality'

/** 玩家货币（运行时状态 · 持有在 playerStore） */
export interface XiyouCurrency {
  copper: number
  silver: number
  jade: number
}

/** 玩家属性快照（运行时状态 · 持有在 playerStore） */
export interface XiyouPlayer {
  level: number
  name: string
  title: string
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  attackMin: number
  attackMax: number
  defense: number
  speed: number
  critRate: number
  critDamage: number
  hitRate: number
  dodgeRate: number
  exp: number
  expNeed: number
}

/** 角色加点（运行时状态 · 持有在 playerStore；展示态，暂未回灌战斗属性） */
export interface XiyouStatPoints {
  available: number
  strength: number
  vitality: number
  agility: number
  spirit: number
}

/**
 * 战斗单位快照（4v4 阵容）
 * NOTE: 我方阵容 = 主角 + 上阵伙伴（至多 4 人）；敌方 = 场景 enemies 至多 4 个
 */
export interface XiyouCombatant {
  id: string
  name: string
  level: number
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  speed: number
  attack: number
  defense: number
  side: 'player' | 'enemy'
  /** 阵亡标记（展示用） */
  down?: boolean
}

/** 我方 4 人阵容（主角 + 3 上阵伙伴，对齐 mate.json active） */
export const playerParty: XiyouCombatant[] = [
  { id: PLAYER_ID, name: '降妖者', level: 5, hp: 350, maxHp: 420, energy: 120, maxEnergy: 150, speed: 15, attack: 18, defense: 8, side: 'player' },
  { id: 'sun', name: '孙小圣', level: 5, hp: 380, maxHp: 430, energy: 110, maxEnergy: 140, speed: 18, attack: 22, defense: 6, side: 'player' },
  { id: 'bajie', name: '八戒', level: 4, hp: 520, maxHp: 560, energy: 70, maxEnergy: 120, speed: 9, attack: 15, defense: 14, side: 'player' },
  { id: 'wujing', name: '悟净', level: 3, hp: 300, maxHp: 360, energy: 130, maxEnergy: 160, speed: 11, attack: 13, defense: 10, side: 'player' },
]

/**
 * 主角实时战斗快照（playerStore.player 派生）
 * NOTE: 战斗主角以此属性为权威（加点/丹药/等级变化反映到战斗），缺省回退 playerParty[0] 的演示值；
 *       伙伴仍取 playerParty 固定出场属性。
 */
export type ProtagonistSnapshot = XiyouCombatant & {
  critRate: number
  critDamage: number
  dodge: number
  damageReduction: number
}

/**
 * 由场景敌人构造敌方阵容（至多 4 个，R22：属性/掉落/技能来自 configs/enemies/enemies.json 按 id 关联）
 * 难度倍率 R19：简单 1 / 普通 1.5 / 困难 2，作用于主要数值属性。
 * 技能按 enemy-skills.json 的 skillType 分桶（与 ConfigDataSource.normalizeEnemy 同口径），
 * passiveSkillIds 归被动、skillType=ultimate 归大招、其余归小技能。
 */
export function buildEnemyTeam(scene: XiyouScene): BattleEntity[] {
  const mult = DIFFICULTY_MULT[scene.difficulty] ?? 1
  const rows = scene.enemies
    .map((e) => (e.id ? enemyById.get(e.id) : undefined))
    .filter((r): r is EnemyRow => !!r)
    .slice(0, 4)
  return rows.map((row, i) => {
    const st = row.stats ?? {}
    const s = (v?: number): number => Math.round((v ?? 0) * mult)
    const enemy: Enemy = {
      id: row.id,
      name: row.name,
      level: row.level,
      stats: {
        [ATTRIBUTE_CODE.currentHealth]: s(st.maxHealth),
        [ATTRIBUTE_CODE.maxHealth]: s(st.maxHealth),
        [ATTRIBUTE_CODE.currentEnergy]: s(st.maxEnergy ?? 150),
        [ATTRIBUTE_CODE.maxEnergy]: s(st.maxEnergy ?? 150),
        [ATTRIBUTE_CODE.attack]: s(st.attack),
        [ATTRIBUTE_CODE.defense]: s(st.defense),
        [ATTRIBUTE_CODE.speed]: s(st.speed),
        [ATTRIBUTE_CODE.critRate]: st.critRate ?? 5,
        [ATTRIBUTE_CODE.critDamage]: (st.critDamage ?? 120) / 100,
        [ATTRIBUTE_CODE.hit]: st.hit ?? 10,
        [ATTRIBUTE_CODE.dodge]: st.dodge ?? 2,
      },
      drops: dropsFromRow(row),
      skills: skillsOfRow(row),
      // NOTE: 词缀池数据贯通（W12）：enemyToParticipant 已消费 affixPool 自动应用词缀（GameDataProcessor 内部按
      //       数据源 affixes 表解析池并注入），此处透传 affixPool 即完成「敌人词缀配置 → 战斗生效」闭环。
      affixPool: row.affixPool,
    }
    return GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, i)
  })
}

/** 敌人技能按 skillType 分桶（enemy-skills.json 权威；未知技能忽略，引擎普攻兜底） */
function skillsOfRow(row: EnemyRow): { small: string[]; passive: string[]; ultimate: string[] } {
  const small: string[] = []
  const passive: string[] = [...(row.passiveSkillIds ?? [])]
  const ultimate: string[] = []
  for (const id of row.skillIds ?? []) {
    const t = enemySkillTypeById.get(id)
    if (t === 'ultimate') ultimate.push(id)
    else if (t === 'passive') passive.push(id)
    else small.push(id)
  }
  return { small, passive, ultimate }
}

/** 敌人掉落/奖励行（configs/enemies/enemies.json，与 scenes 敌人按 id 关联） */
interface EnemyDropRow {
  itemId: string
  probability: number
  quantity?: number
}

interface EnemyRow {
  id: string
  name: string
  level: number
  type?: string
  stats?: Partial<Record<ATTRIBUTE_CODE, number>>
  drops?: EnemyDropRow[]
  gold?: [number, number]
  exp?: [number, number]
  skillIds?: string[]
  passiveSkillIds?: string[]
  affixPool?: EnemyAffixPool
}

/** 敌人配置索引（id → 行；id 与 scenes.json 敌人 id 一一对应，封神榜健康检查保证零断裂） */
const enemyRows = enemiesJson as unknown as EnemyRow[]
const enemyById = new Map<string, EnemyRow>(enemyRows.map((r) => [r.id, r]))

/** 敌人技能 → 类型索引（enemy-skills.json skillType；与 ConfigDataSource.normalizeEnemy 同口径） */
const enemySkillTypeById = new Map<string, string>(
  (enemySkillsJson as unknown as Array<{ id: string; skillType?: string }>)
    .map((s) => [s.id, s.skillType ?? 'small'] as const),
)

/** 场景难度 → 敌人属性倍率（R19：简单 1 / 普通 1.5 / 困难 2） */
export const DIFFICULTY_MULT: Record<XiyouDifficulty, number> = {
  easy: 1,
  normal: 1.5,
  hard: 2,
}

function dropsFromRow(row: EnemyRow): EnemyDrop[] {
  return (row.drops ?? []).map((d) => ({
    itemId: d.itemId,
    quantity: d.quantity ?? 1,
    chance: d.probability,
  }))
}

/** 战斗胜利掉落：聚合场景全部敌人的掉落条目 + 场景掉落表材料（configs/enemies/enemies.json 与 scenes.json 权威，供 BattleZen 结算入包） */
export function dropsForScene(scene: XiyouScene): EnemyDrop[] {
  const out: EnemyDrop[] = []
  for (const e of scene.enemies) {
    const row = e.id ? enemyById.get(e.id) : undefined
    if (row) out.push(...dropsFromRow(row))
  }
  // NOTE: 场景掉落表 materials（scenes.json drops.materials）为关卡必掉材料，补并入包；
  //       否则该字段不参与任何结算，章节材料（beike/songmu 等）永远无法获得
  for (const m of scene.drops?.materials ?? []) {
    out.push({ itemId: m, quantity: 1, chance: 1 })
  }
  return out
}

/** 单个敌人掉落条目（按敌人 id，供 BattleZen 头部按敌人展示掉落概率，缺省无掉落） */
export function dropsForEnemyById(enemyId: string): EnemyDrop[] {
  const row = enemyById.get(enemyId)
  return row ? dropsFromRow(row) : []
}

/** 单个敌人掉落条目（按敌人名，兼容旧调用；enemy 名在 enemies.json 唯一） */
export function dropsForEnemy(name: string): EnemyDrop[] {
  const row = enemyRows.find((r) => r.name === name)
  return row ? dropsFromRow(row) : []
}

/** 场景金币/经验奖励区间（per-enemy gold/exp 区间加和；供战前预览与结算入账） */
export function rewardForScene(scene: XiyouScene): { gold: [number, number]; exp: [number, number] } {
  let g0 = 0
  let g1 = 0
  let e0 = 0
  let e1 = 0
  for (const en of scene.enemies) {
    const row = en.id ? enemyById.get(en.id) : undefined
    if (row?.gold) {
      g0 += row.gold[0]
      g1 += row.gold[1]
    }
    if (row?.exp) {
      e0 += row.exp[0]
      e1 += row.exp[1]
    }
  }
  return { gold: [g0, g1], exp: [e0, e1] }
}

/**
 * 装备加成 → 主角最终属性增量
 * NOTE: flat 直接相加；percent 按 buildBattleTeams 实际使用的主角基础属性（protagonist 或 playerParty[0]）
 *       计算绝对增量，保证 flat 与 percent 的基准与战斗主角同源。
 * @param protagonist 主角实时战斗快照（playerStore.player 派生），缺省回退 playerParty[0] 演示值
 */
export function equipBonuses(
  stats: EquipmentData['stats'],
  protagonist: ProtagonistSnapshot = { ...playerParty[0], critRate: 0, critDamage: 1.5, dodge: 0, damageReduction: 0 },
): Partial<Record<string, number>> {
  const base = protagonist
  const flat: Record<string, number> = {}
  const percent: Record<string, number> = {}
  for (const s of stats) {
    if (s.modifierType === 'flat') flat[s.attribute] = (flat[s.attribute] ?? 0) + s.value
    else percent[s.attribute] = (percent[s.attribute] ?? 0) + s.value
  }
  const baseByAttr: Record<string, number> = {
    [ATTRIBUTE_CODE.attack]: base.attack,
    [ATTRIBUTE_CODE.defense]: base.defense,
    [ATTRIBUTE_CODE.speed]: base.speed,
    [ATTRIBUTE_CODE.maxHealth]: base.maxHp,
    [ATTRIBUTE_CODE.critRate]: base.critRate,
  }
  const out: Record<string, number> = { ...flat }
  for (const [attr, pct] of Object.entries(percent)) {
    // NOTE: isPercentage 属性（critRate/dodge/damageReduction 等）value 即百分点，直接相加
    //       （与 schoolAttributeBonuses 同语义）；数值属性按基础值相对缩放。
    //       否则 dodge/damageReduction 不在 baseByAttr 且基值常为 0，相对缩放恒算 0 而失效。
    if (getAttrMeta(attr as ATTRIBUTE_CODE)?.isPercentage) {
      out[attr] = (out[attr] ?? 0) + pct
    } else {
      out[attr] = (out[attr] ?? 0) + Math.round((baseByAttr[attr] ?? 0) * (pct / 100))
    }
  }
  return out
}

/**
 * 主角已学技能（当前选中流派中 learned 节点的 skillId，按类型分桶注入战斗）
 * NOTE: 节点 skillId 已在挂载时映射为 configs/skills 实际 id；未学/未选中流派返回空桶。
 */
export function learnedPlayerSkills(): EnemySkills {
  const school = schools.find((s) => s.selected)
  const out: EnemySkills = { small: [], passive: [], ultimate: [] }
  if (!school) return out
  for (const n of school.nodes) {
    if (!n.learned || !n.skillId) continue
    if (n.type === 'passive') out.passive!.push(n.skillId)
    else if (n.type === 'ultimate') out.ultimate!.push(n.skillId)
    else if (n.type === 'skill') out.small!.push(n.skillId)
  }
  return out
}

/**
 * 流派属性加成（纯流派加成 + 已点亮 attribute/enhance 节点 effect）→ 主角属性增量
 * NOTE: 仅注入属性系统已定义（AttributeMetaMap）的属性；不存在的属性（如 tenacity/armorPen
 *       skill_tree 设计层）跳过，避免引擎不识别的属性码。percentage 数值属性按基础值换算，
 *       与 equipBonuses 的 flat/percent 归一逻辑一致。
 * @param base 主角基础属性（attack/defense/speed/maxHp），供 percentage 效果换算绝对增量
 */
export function schoolAttributeBonuses(base: {
  attack: number
  defense: number
  speed: number
  maxHp: number
}): Partial<Record<string, number>> {
  const out: Record<string, number> = {}
  const school = schools.find((s) => s.selected)
  if (!school) return out
  const isKnown = (code: string): boolean => !!getAttrMeta(code as ATTRIBUTE_CODE)
  const addPct = (code: string, value: number): void => {
    const meta = getAttrMeta(code as ATTRIBUTE_CODE)
    if (!meta) return
    // 百分比属性（critRate/comboRate 等）value 即百分点，直接相加；数值属性按基础值换算
    if (meta.isPercentage) out[code] = (out[code] ?? 0) + value
    else {
      const b = { attack: base.attack, defense: base.defense, speed: base.speed, maxHealth: base.maxHp }[code] ?? 0
      out[code] = (out[code] ?? 0) + Math.round(b * (value / 100))
    }
  }
  // 纯流派加成（pureBonus：如 comboRate +10 / critRate +10 / blockRate +10）
  if (school.pureBonus) addPct(school.pureBonus.attribute, school.pureBonus.value)
  // 已点亮 attribute/enhance 节点 effect
  for (const n of school.nodes) {
    if (!n.learned || !n.effect) continue
    const e = n.effect
    if (e.calc === 'additive') {
      if (isKnown(e.attribute)) out[e.attribute] = (out[e.attribute] ?? 0) + e.value
    } else {
      addPct(e.attribute, e.value)
    }
    // 复合效果（extra）同规则累加
    if (e.extra) {
      if (e.extra.calc === 'additive') {
        if (isKnown(e.extra.attribute)) out[e.extra.attribute] = (out[e.extra.attribute] ?? 0) + e.extra.value
      } else {
        addPct(e.extra.attribute, e.extra.value)
      }
    }
  }
  return out
}

/**
 * 将斗战西游阵容转换为战斗引擎参与者（真实参战）
 * NOTE: 经 GameDataProcessor.enemyToParticipant 构造 BattleEntity，消费引擎而非直接 new 领域实现，
 *       与唤灵台演武台同数据源；技能留空（引擎普攻兜底），后续技能接入随 configs/skills 扩展。
 * @param allyBonuses 主角属性加成（已穿戴装备 stats，flat/percent 归一到最终数值），缺省无加成
 * @param protagonist 主角实时战斗快照（playerStore.player 派生），缺省回退 playerParty[0] 演示值
 */
export function buildBattleTeams(
  scene: XiyouScene,
  allyBonuses?: Partial<Record<string, number>>,
  protagonist?: ProtagonistSnapshot,
): { ally: BattleEntity[]; enemy: BattleEntity[] } {
  const toEnemy = (c: XiyouCombatant & { critRate?: number; critDamage?: number; hitRate?: number; dodge?: number; damageReduction?: number }, player: boolean): Enemy => ({
    id: c.id,
    name: c.name,
    level: c.level,
    stats: {
      [ATTRIBUTE_CODE.currentHealth]: c.maxHp,
      [ATTRIBUTE_CODE.maxHealth]: c.maxHp,
      [ATTRIBUTE_CODE.currentEnergy]: c.maxEnergy,
      [ATTRIBUTE_CODE.maxEnergy]: c.maxEnergy,
      [ATTRIBUTE_CODE.attack]: c.attack,
      [ATTRIBUTE_CODE.defense]: c.defense,
      [ATTRIBUTE_CODE.speed]: c.speed,
      [ATTRIBUTE_CODE.critRate]: c.critRate ?? 10,
      [ATTRIBUTE_CODE.critDamage]: c.critDamage ?? 1.5,
      [ATTRIBUTE_CODE.hit]: c.hitRate ?? 90,
      [ATTRIBUTE_CODE.dodge]: c.dodge ?? 0,
      [ATTRIBUTE_CODE.damageReduction]: c.damageReduction ?? 0,
    },
    drops: dropsForEnemy(c.name),
    // NOTE: 主角注入流派已学技能（skill_tree 点亮节点映射后的技能）；伙伴为固定空技能（引擎普攻兜底）
    skills: player ? learnedPlayerSkills() : { small: [], passive: [], ultimate: [] },
  })
  // NOTE: 主角属性以 protagonist（playerStore 派生）为权威，伙伴为固定出场属性；装备加成仅作用于主角
  const ally = playerParty.map((c, i) => {
    const src = i === 0 && protagonist ? { ...c, ...protagonist } : c
    if (i !== 0 || !allyBonuses) return GameDataProcessor.enemyToParticipant(toEnemy(src, i === 0), ParticipantSide.ALLY, i)
    const enemy = toEnemy(src, i === 0)
    // NOTE: 合并装备/流派全部加成属性到主角 stats（原为白名单 5 项，遗漏 dodge/damageReduction 等）
    const boostedStats: Enemy['stats'] = { ...enemy.stats }
    for (const [attr, bonus] of Object.entries(allyBonuses ?? {})) {
      if (!bonus) continue
      boostedStats[attr as ATTRIBUTE_CODE] = (boostedStats[attr as ATTRIBUTE_CODE] ?? 0) + bonus
    }
    const boosted: Enemy = { ...enemy, stats: boostedStats }
    return GameDataProcessor.enemyToParticipant(boosted, ParticipantSide.ALLY, i)
  })
  const enemy = buildEnemyTeam(scene)
  return { ally, enemy }
}

/**
 * 通关标记：解锁本关并解锁 unlockCondition.sceneId 指向它的后续关卡（V08 难度递进）。
 * NOTE: clear_boss 前置（boss_major_*）当前无对应 BOSS 场景，保持锁定；平铺链内按顺序解锁。
 */
export function markSceneCleared(sceneId: string): void {
  const target = scenes.find((s) => s.id === sceneId)
  if (target) target.unlocked = true
  for (const s of scenes) {
    if (s.unlockCondition?.sceneId === sceneId) s.unlocked = true
  }
}

/* ══════════════════════════════════════════════════════════════════
   类型定义（组件仅引用类型，数据实体见 configs/xiyou/*.json）
   ══════════════════════════════════════════════════════════════════ */

/** 关卡难度 */
export type XiyouDifficulty = 'easy' | 'normal' | 'hard'

/** 物品品质（凡 / 玄 / 地 / 天 / 仙） */
export type XiyouQuality = '凡品' | '玄品' | '地品' | '天品' | '仙品'

/** 技能树节点类型（v3.0） */
export type XiyouNodeType = 'attribute' | 'passive' | 'skill' | 'ultimate' | 'enhance'

/** 技能树节点效果（skill_tree.json 节点 effect：属性节点提供，供属性注入） */
export interface XiyouSkillNodeEffect {
  attribute: string
  value: number
  calc: 'percentage' | 'additive'
  /** 复合效果（skill_tree 部分节点 extra，当前仅取主效果注入） */
  extra?: XiyouSkillNodeEffect
}

/** 技能树节点（v3.0：3 分支 × 4 层，逐层点亮，消耗技能点） */
export interface XiyouSkillNode {
  id: string
  branch: string
  tier: 1 | 2 | 3 | 4
  name: string
  type: XiyouNodeType
  /** 点亮消耗技能点（1-5） */
  points: number
  /** 战斗中能量消耗（属性/被动/强化为 0） */
  energyCost: number
  desc: string
  /** 运行时：已点亮（configs 未含 · 展示态） */
  learned?: boolean
  /** 属性效果（attribute/enhance 节点，供角色属性注入；无则为 undefined） */
  effect?: XiyouSkillNodeEffect
  /** 实际技能配置 id（skill_tree skillId 映射到 configs/skills 后的 id；无技能为 undefined） */
  skillId?: string
}

/** 流派技能点（v3.0：全局 40 点，跨流派共享） */
export interface XiyouSkillPoints {
  max: number
  spent: number
}

/** 区域（章节）· 对应一张大地图 */
export interface XiyouRegion {
  id: string
  name: string
  sub: string
  /** 等级范围（configs/xiyou/regions.json） */
  levelRange?: [number, number]
}

/** 场景（关卡）卡片
 * NOTE: 25 关平铺结构（configs/xiyou/scenes.json）：单值 difficulty + 内联 enemies + 解锁链 */
export interface XiyouScene {
  id: string
  regionId: string
  name: string
  /** 等级范围（configs/xiyou/scenes.json） */
  levelRange?: [number, number]
  desc: string
  enemies: Array<{ id?: string; name: string; level: number; type?: string }>
  /** 守护者（本关精英 · configs/xiyou/scenes.json 内联） */
  guardian?: { name: string; level: number } | null
  /** 掉落配置（材料 / 金币区间 / 经验区间） */
  drops?: { materials?: string[]; gold?: [number, number]; exp?: [number, number] }
  /** 剧情钩子（configs/xiyou/scenes.json narrativeHook） */
  narrativeHook?: string
  unlocked: boolean
  difficulty: XiyouDifficulty
  stars: number
  maxStars: number
  /** 解锁条件（无前置 sceneId 为 null 时默认解锁） */
  unlockCondition?: { type: 'clear_scene' | 'clear_boss'; sceneId: string | null }
}

/** 流派（对应修行「流派」子系统 · v3.0 技能树） */
export interface XiyouSchool {
  id: string
  name: string
  motto: string
  branches: string[]
  nodes: XiyouSkillNode[]
  selected?: boolean
  /** 纯流派加成（schools.json pureBonus：所选流派全员生效的属性加成） */
  pureBonus?: { attribute: string; value: number; desc?: string }
}

/** 乾坤袋物品（背包子系统 · 数据源 pack.json） */
export interface XiyouItem {
  name: string
  count: number
  /** 稀有度（数字，pack.json 实际 1-4；展示层经 quality.ts 映射中文品级） */
  rarity: number
  desc: string
}

/** 物品目录条目（items.json 主键索引 · 行囊默认全量展示） */
export interface XiyouCatalogItem {
  id: string
  name: string
  type: string
  rarity: number
  source?: string
  description?: string
  /** 使用效果（仅丹药/符箓/晶球类，来自 items.json effects） */
  effects?: ItemEffect[]
}

/** 坊市商品（商店子系统） */
export interface XiyouShopGood {
  name: string
  type: '杂货' | '材料' | '丹药' | '装备'
  price: number
  unit: '铜钱' | '银两' | '灵石'
  stock: number
  tag?: string
}

/** 仓库格子（仓库子系统） */
export interface XiyouStorageCell {
  name: string
  count: number
  locked: boolean
}

/** 境界（修为子系统） */
export interface XiyouRealm {
  name: string
  level: number
  bonus: string
  progress: number
  unlocked: boolean
  desc: string
  /** 突破需求（configs 补充字段，IDB 旧数据可能缺失） */
  levelReq?: number
  materialName?: string
  materialCount?: number
}

/** 功法（功法子系统） */
export interface XiyouMartial {
  name: string
  rarity: number
  level: number
  maxLevel: number
  slot: string
  effect: string
  equipped: boolean
}

/** 经脉穴位（经脉子系统） */
export interface XiyouMeridianNode {
  name: string
  level: number
  maxLevel: number
  breakthrough: boolean
  effect: string
}

export interface XiyouMeridian {
  name: string
  nodes: XiyouMeridianNode[]
}

/** 神通（神通子系统） */
export interface XiyouDharma {
  name: string
  type: '攻击' | '防御' | '辅助' | '身法'
  level: number
  maxLevel: number
  effect: string
  equipped: boolean
}

/** 法宝（法宝子系统） */
export interface XiyouTreasure {
  name: string
  rarity: number
  level: number
  maxLevel: number
  progress: number
  skill: string
  active: boolean
}

/** 坐骑（坐骑子系统） */
export interface XiyouMount {
  name: string
  rarity: number
  level: number
  aptitude: number
  speed: number
  skill: string
  active: boolean
}

/** 伙伴卡（伙伴子系统） */
export interface XiyouMate {
  name: string
  role: string
  rarity: number
  level: number
  stars: number
  active: boolean
  desc: string
}

/** 灵宠（灵宠子系统） */
export interface XiyouPet {
  name: string
  rarity: number
  growth: number
  level: number
  skill: string
  active: boolean
}

/** 缘分（缘分子系统） */
export interface XiyouAffinity {
  name: string
  members: string[]
  bonus: string
  progress: number
  activated: boolean
}

/** 图鉴条目（图鉴子系统） */
export interface XiyouCodexEntry {
  name: string
  level: number
  captured: boolean
}

export interface XiyouCodexChapter {
  name: string
  entries: XiyouCodexEntry[]
}

/** 成就（成就子系统） */
export interface XiyouAchievement {
  name: string
  desc: string
  progress: number
  target: number
  reward: string
  done: boolean
}

/** 称号（称号子系统） */
export interface XiyouTitle {
  name: string
  bonus: string
  desc: string
  owned: boolean
  equipped: boolean
}

/** 任务（任务子系统） */
export interface XiyouQuest {
  type: '主线' | '日常' | '周常'
  name: string
  desc: string
  progress: number
  target: number
  reward: string
}

/** 签到（签到子系统） */
export interface XiyouCheckinDay {
  day: number
  reward: string
  state: 'done' | 'today' | 'future'
}

/** 活动（活动子系统） */
export interface XiyouEvent {
  name: string
  time: string
  desc: string
  reward: string
  status: '进行中' | '预告' | '已结束'
}

/** 配方材料（结构化：itemId + count，引用 items 表；锻造配方材料经 equipmentId 引用装备 JSON，权威在 equipment.json） */
export interface XiyouRecipeMaterial {
  itemId: string
  count: number
}

/** 炼丹 / 炼器丹方（炼丹 · 炼器子系统） */
export interface XiyouRecipe {
  id?: string
  equipmentId?: string
  blueprintId?: string
  name: string
  level: number
  /** 材料消耗（炼丹配方内联；锻造配方由 equipmentId 指向的装备定义提供） */
  materials?: XiyouRecipeMaterial[]
  effect: string
  count: number
}

/** 闭关（闭关子系统） */
export interface XiyouRetreat {
  name: string
  time: string
  desc: string
  reward: string
}

/** 药园（药园子系统） */
export interface XiyouCrop {
  name: string
  growth: number
  time: string
  reward: string
  status: '已成熟' | '生长中' | '空置'
}

/** 技艺（百艺子系统） */
export interface XiyouCraft {
  name: string
  level: number
  maxLevel: number
  progress: number
  effect: string
}

/* ══════════════════════════════════════════════════════════════════
   配置数据（实体见 configs/xiyou/ 下 JSON 文件）
   说明：reactive 初始化自 configs（同步兜底，组件渲染不依赖异步）；
         loadXiyouData() 从封神榜 IDB 读取西游数据并原地更新（需求说明 §5.1 方案 B）。
   ══════════════════════════════════════════════════════════════════ */

export const regions: XiyouRegion[] = reactive<XiyouRegion[]>(regionsJson as unknown as XiyouRegion[])
export const scenes: XiyouScene[] = reactive<XiyouScene[]>(scenesJson as unknown as XiyouScene[])

/**
 * 技能树原始节点（skill_tree.json.json 结构）
 * NOTE: skill_tree 的 skillId 为「设计层 id」（skill_lh_gale_step 等），与 configs/skills 实际配置 id
 *       （skill_xiyou_swift_step 等）命名体系不同，需经 SKILL_TREE_ID_MAP 映射后再注入战斗。
 */
interface XiyouSkillTreeRawNode {
  id: string
  name: string
  schoolId: string
  branch: string
  layer: number
  type: string
  cost: number
  effect?: { attribute: string; value: number; calc: string; extra?: { attribute: string; value: number; calc: string } } | null
  description: string
  skillId: string | null
  buffId: string | null
}

/** skill_tree 节点 type → XiyouNodeType（small_skill 归一为 skill） */
const SKILL_TREE_TYPE_MAP: Record<string, XiyouNodeType> = {
  attribute: 'attribute',
  passive: 'passive',
  small_skill: 'skill',
  ultimate: 'ultimate',
  enhance: 'enhance',
}

/** skill_tree 设计层 skillId → configs/skills 实际配置 id（无对应技能配置的节点不映射，注入时跳过） */
const SKILL_TREE_ID_MAP: Record<string, string> = {
  // 灵猴道
  passive_lh_combo: 'skill_xiyou_swift_combo',
  skill_lh_gale_step: 'skill_xiyou_swift_step',
  skill_lh_dance: 'skill_xiyou_whirlwind',
  skill_lh_clone_slash: 'skill_xiyou_shadow_slash',
  skill_lh_shadow_ult: 'skill_xiyou_thousand_shadow',
  // 金行道
  passive_jx_precision: 'skill_xiyou_deadly_aim',
  skill_jx_weakpoint: 'skill_xiyou_weak_point',
  skill_jx_armor_break: 'skill_xiyou_armor_pierce',
  skill_jx_charge: 'skill_xiyou_gathering_strike',
  skill_jx_tiangang_ult: 'skill_xiyou_heaven_destroy',
  // 磐石道
  passive_ps_block: 'skill_xiyou_stone_unshakable',
  skill_ps_iron_wall: 'skill_xiyou_iron_wall',
  skill_ps_quake: 'skill_xiyou_earthquake',
  skill_ps_mountain_ult: 'skill_xiyou_mountain_crush',
  skill_ps_diamond_ult: 'skill_xiyou_diamond_body',
}

/** 技能树能量消耗（skill_tree 节点未带，取映射后技能配置的 energyCost；非技能节点为 0） */
const SKILL_ENERGY_COST: Record<string, number> = {
  skill_xiyou_swift_step: 50,
  skill_xiyou_whirlwind: 50,
  skill_xiyou_shadow_slash: 50,
  skill_xiyou_thousand_shadow: 150,
  skill_xiyou_weak_point: 50,
  skill_xiyou_armor_pierce: 50,
  skill_xiyou_gathering_strike: 50,
  skill_xiyou_heaven_destroy: 150,
  skill_xiyou_iron_wall: 50,
  skill_xiyou_earthquake: 50,
  skill_xiyou_mountain_crush: 150,
  skill_xiyou_diamond_body: 150,
}

/** 原始 skill_tree 节点 → XiyouSkillNode（映射字段 + 保留 effect/skillId 供注入） */
function toSkillNode(raw: XiyouSkillTreeRawNode): XiyouSkillNode {
  const mappedSkillId = raw.skillId ? SKILL_TREE_ID_MAP[raw.skillId] : undefined
  return {
    id: raw.id,
    branch: raw.branch,
    tier: raw.layer as 1 | 2 | 3 | 4,
    name: raw.name,
    type: SKILL_TREE_TYPE_MAP[raw.type] ?? 'attribute',
    points: raw.cost,
    energyCost: mappedSkillId ? (SKILL_ENERGY_COST[mappedSkillId] ?? 0) : 0,
    desc: raw.description,
    effect: raw.effect
      ? {
          attribute: raw.effect.attribute,
          value: raw.effect.value,
          calc: raw.effect.calc as XiyouSkillNodeEffect['calc'],
          ...(raw.effect.extra
            ? {
                extra: {
                  attribute: raw.effect.extra.attribute,
                  value: raw.effect.extra.value,
                  calc: raw.effect.extra.calc as XiyouSkillNodeEffect['calc'],
                },
              }
            : {}),
        }
      : undefined,
    skillId: mappedSkillId,
  }
}

/** 由 skill_tree.json.json 构建全部技能树节点（按 schoolId 挂到 schools.nodes，configs 兜底数据源） */
const SKILL_TREE_RAW = (skillTreeJson as { nodes?: XiyouSkillTreeRawNode[] }).nodes ?? []

// NOTE: schools.json 为对象包裹（{ schools: [...] }，与 cultivate/equip/mate 等一致），
//       需取内层数组——直接 cast 会让 schools 变成非数组对象，.find 等数组方法崩溃。
export const schools: XiyouSchool[] = reactive<XiyouSchool[]>(
  ((schoolsJson as unknown as { schools: XiyouSchool[] }).schools ?? []).map((s) => ({
    ...s,
    nodes: SKILL_TREE_RAW.filter((n) => n.schoolId === s.id).map(toSkillNode),
  })),
)

/** 流派技能点（v3.0：全局 40 点，跨流派共享；等级 30 + 悟道丹 10） */
export const skillPoints: XiyouSkillPoints = reactive<XiyouSkillPoints>({ max: 40, spent: 0 })

/**
 * 关卡解锁派生：无前置条件（unlockCondition.sceneId 为 null）的场景默认解锁。
 * NOTE: configs/IDB 中 unlocked 字段可能全为 false（seed 静态快照），解锁状态以「解锁链」推导而非数据字段，
 *       这样 scene_1_1 天然解锁；通关解锁链（clear_scene 前置）后续接入进度存储后再补。
 */
export function syncSceneUnlocks(): void {
  for (const s of scenes) {
    if (!s.unlockCondition?.sceneId) s.unlocked = true
  }
}
syncSceneUnlocks()

export const materials: XiyouItem[] = reactive<XiyouItem[]>(packJson.materials as unknown as XiyouItem[])
export const equipment: XiyouItem[] = reactive<XiyouItem[]>(packJson.equipment as unknown as XiyouItem[])
export const pills: XiyouItem[] = reactive<XiyouItem[]>(packJson.pills as unknown as XiyouItem[])
export const consumables: XiyouItem[] = reactive<XiyouItem[]>(packJson.consumables as unknown as XiyouItem[])
export const shopGoods: XiyouShopGood[] = reactive<XiyouShopGood[]>(packJson.shopGoods as unknown as XiyouShopGood[])
export const storageCells: XiyouStorageCell[] = reactive<XiyouStorageCell[]>(packJson.storageCells as unknown as XiyouStorageCell[])
export const packItems: XiyouCatalogItem[] = itemsJson.items as unknown as XiyouCatalogItem[]

export const realms: XiyouRealm[] = reactive<XiyouRealm[]>(cultivateJson.realms as unknown as XiyouRealm[])
export const martialArts: XiyouMartial[] = reactive<XiyouMartial[]>(cultivateJson.martialArts as unknown as XiyouMartial[])
export const meridians: XiyouMeridian[] = reactive<XiyouMeridian[]>(cultivateJson.meridians as unknown as XiyouMeridian[])
export const dharmas: XiyouDharma[] = reactive<XiyouDharma[]>(cultivateJson.dharmas as unknown as XiyouDharma[])

export const treasures: XiyouTreasure[] = reactive<XiyouTreasure[]>(equipJson.treasures as unknown as XiyouTreasure[])
export const mounts: XiyouMount[] = reactive<XiyouMount[]>(equipJson.mounts as unknown as XiyouMount[])

export const mates: XiyouMate[] = reactive<XiyouMate[]>(mateJson.mates as unknown as XiyouMate[])
export const pets: XiyouPet[] = reactive<XiyouPet[]>(mateJson.pets as unknown as XiyouPet[])
export const affinities: XiyouAffinity[] = reactive<XiyouAffinity[]>(mateJson.affinities as unknown as XiyouAffinity[])

export const codexChapters: XiyouCodexChapter[] = reactive<XiyouCodexChapter[]>(collectJson.codexChapters as unknown as XiyouCodexChapter[])
export const achievements: XiyouAchievement[] = reactive<XiyouAchievement[]>(collectJson.achievements as unknown as XiyouAchievement[])
export const titles: XiyouTitle[] = reactive<XiyouTitle[]>(collectJson.titles as unknown as XiyouTitle[])

export const quests: XiyouQuest[] = reactive<XiyouQuest[]>(questJson.quests as unknown as XiyouQuest[])
export const checkinDays: XiyouCheckinDay[] = reactive<XiyouCheckinDay[]>(questJson.checkinDays as unknown as XiyouCheckinDay[])
export const events: XiyouEvent[] = reactive<XiyouEvent[]>(questJson.events as unknown as XiyouEvent[])

/** 装备定义目录（configs/equipment/equipment.json 唯一数据源 · 锻造配方按 equipmentId 引用其材料） */
export const equipmentCatalog: EquipmentData[] = equipmentJson as unknown as EquipmentData[]

export const alchemyRecipes: XiyouRecipe[] = reactive<XiyouRecipe[]>(caveJson.alchemyRecipes as unknown as XiyouRecipe[])
export const forgeRecipes: XiyouRecipe[] = reactive<XiyouRecipe[]>(caveJson.forgeRecipes as unknown as XiyouRecipe[])
export const retreats: XiyouRetreat[] = reactive<XiyouRetreat[]>(caveJson.retreats as unknown as XiyouRetreat[])
export const crops: XiyouCrop[] = reactive<XiyouCrop[]>(caveJson.crops as unknown as XiyouCrop[])
export const crafts: XiyouCraft[] = reactive<XiyouCraft[]>(caveJson.crafts as unknown as XiyouCraft[])

/** 原地替换 reactive 数组内容（触发响应式更新） */
function syncArray(target: unknown[], src: unknown): void {
  if (!Array.isArray(src)) return
  target.splice(0, target.length, ...src)
}

/**
 * IDB schools 数据覆盖：schools.json 不含 nodes，覆盖后重新挂 skill_tree 节点，
 * 并保留旧的 learned/selected 状态（防存档恢复前闪烁）。
 */
function syncSchools(src: unknown[]): void {
  const prev = new Map(schools.map((s) => [s.id, s]))
  const next = (src as XiyouSchool[]).map((s) => {
    const before = prev.get(s.id)
    return {
      ...s,
      // 保留旧的 selected 状态（IDB schools 数据不含 selected，防存档恢复前闪烁）
      selected: before?.selected ?? s.selected,
      nodes: SKILL_TREE_RAW.filter((n) => n.schoolId === s.id).map((raw) => {
        const node = toSkillNode(raw)
        node.learned = before?.nodes.find((p) => p.id === node.id)?.learned ?? false
        return node
      }),
    }
  })
  schools.splice(0, schools.length, ...next)
}

/** 从封神榜 IDB 载入西游配置（需求说明 §5.1 方案 B）：成功原地更新 reactive 导出；失败/无数据保持 configs 兜底 */
export async function loadXiyouData(): Promise<boolean> {
  try {
    const api = container.resolve<GameDataApi>('GameDataApi')
    const rows = await api.listXiyouData()
    if (rows.length === 0) return false
    const map = new Map(rows.map((r: XiyouData) => [r.id, r.data as Record<string, unknown>]))
    applyXiyou(map)
    syncSceneUnlocks()
    return true
  } catch {
    return false
  }
}

function migrateRarity(rows: unknown[]): void {
  for (const row of rows) {
    if (row && typeof row === 'object') migrateRarityField(row as Record<string, unknown>)
  }
}

function applyXiyou(map: Map<string, Record<string, unknown>>): void {
  const arr = (key: string): unknown[] | null => {
    const v = map.get(key)
    return Array.isArray(v) ? (v as unknown[]) : null
  }
  const obj = (key: string): Record<string, unknown> | null => map.get(key) ?? null
  const a = (target: unknown[], key: string): void => {
    const src = arr(key)
    if (src) syncArray(target, src)
  }
  const aIn = (target: unknown[], key: string, field: string): void => {
    const o = obj(key)
    if (o) syncArray(target, o[field])
  }

  a(regions, 'regions')
  a(scenes, 'scenes')
  // NOTE: schools 覆盖需重挂 skill_tree nodes 并保留 learned/selected（见 syncSchools）
  const schoolSrc = arr('schools')
  if (schoolSrc) syncSchools(schoolSrc)
  aIn(materials, 'pack', 'materials')
  aIn(equipment, 'pack', 'equipment')
  aIn(pills, 'pack', 'pills')
  aIn(consumables, 'pack', 'consumables')
  aIn(shopGoods, 'pack', 'shopGoods')
  aIn(storageCells, 'pack', 'storageCells')
  aIn(realms, 'cultivate', 'realms')
  aIn(martialArts, 'cultivate', 'martialArts')
  migrateRarity(martialArts)
  aIn(meridians, 'cultivate', 'meridians')
  aIn(dharmas, 'cultivate', 'dharmas')
  aIn(treasures, 'equip', 'treasures')
  migrateRarity(treasures)
  aIn(mounts, 'equip', 'mounts')
  migrateRarity(mounts)
  aIn(mates, 'mate', 'mates')
  migrateRarity(mates)
  aIn(pets, 'mate', 'pets')
  migrateRarity(pets)
  aIn(affinities, 'mate', 'affinities')
  aIn(codexChapters, 'collect', 'codexChapters')
  aIn(achievements, 'collect', 'achievements')
  aIn(titles, 'collect', 'titles')
  aIn(quests, 'quest', 'quests')
  aIn(checkinDays, 'quest', 'checkinDays')
  aIn(events, 'quest', 'events')
  aIn(alchemyRecipes, 'cave', 'alchemyRecipes')
  aIn(forgeRecipes, 'cave', 'forgeRecipes')
  aIn(retreats, 'cave', 'retreats')
  aIn(crops, 'cave', 'crops')
  aIn(crafts, 'cave', 'crafts')
}
