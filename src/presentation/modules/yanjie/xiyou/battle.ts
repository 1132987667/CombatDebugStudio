/**
 * 斗战西游 · 战斗桥接层
 * NOTE: 配置数据自 configs 导入（vite 别名 @configs），经 GameDataProcessor 构造战斗引擎
 *       参与者（BattleEntity），与唤灵台演武台同数据源；玩家运行时状态持有在 playerStore。
 */

import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import { SkillType } from '@/domain/skill/types'
import type { ActorData, EquipmentStatEntry } from '@/domain/fengshen/types'
import type { EnemyRole } from '@/domain/fengshen/role-grades'
import { PLAYER_ID } from '@/shared/constants/player'
import type { Enemy, EnemyAffixPool, EnemyDrop, EnemySkills } from '@/shared/types/enemy'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import enemiesJson from '@configs/enemies/enemies.json'
import enemySkillsJson from '@configs/xiyou/enemy-skills.json'
import type { ProtagonistSnapshot, XiyouCombatant, XiyouMate, XiyouScene } from './types'
import { equippedSkills, mates, nodeValueAtRank, pureSchoolBonus, schools, schoolsLayers, skillNodeMap } from './xiyouData'
import { fabaoEquippedRank, fabaoReleaseSkillIds } from './fabao'
import type { RunNode } from './runFlow'

/** 主角占位（编队 i=0 会被 protagonist 快照覆盖；缺省时回退此演示值） */
export const playerParty: XiyouCombatant[] = [
  { id: PLAYER_ID, name: '降妖者', level: 5, hp: 350, maxHp: 420, energy: 120, maxEnergy: 150, speed: 15, attack: 18, defense: 8, side: 'player' },
]

/** 上阵伙伴上限（主角 + 3 = 4v4） */
export const MAX_ACTIVE_MATES = 3

/** 伙伴参战属性：mate.json Lv.1 基准 stats × 等级成长系数（每级 +15%） */
export function mateToCombatant(m: XiyouMate, slot: number): XiyouCombatant | null {
  if (!m.stats || m.level <= 0) return null
  const factor = 1 + (m.level - 1) * 0.15
  const scaled = (v: number) => Math.round(v * factor)
  const maxHp = scaled(m.stats.maxHp)
  return {
    id: `${PLAYER_ID}_mate_${slot}`,
    name: m.name,
    level: m.level,
    hp: maxHp,
    maxHp,
    energy: 0,
    maxEnergy: 100,
    speed: scaled(m.stats.speed),
    attack: scaled(m.stats.attack),
    defense: scaled(m.stats.defense),
    side: 'player',
  }
}

/** 我方出战阵容（4v4）：主角 + 至多 3 名上阵伙伴（mate.json active 且已激活） */
export function buildPlayerParty(): XiyouCombatant[] {
  const partners = mates
    .filter((m) => m.active && m.stats && m.level > 0)
    .slice(0, MAX_ACTIVE_MATES)
    .map((m, i) => mateToCombatant(m, i + 1))
    .filter((c): c is XiyouCombatant => c !== null)
  return [playerParty[0], ...partners]
}

/**
 * 场景敌人的 Enemy 形状编成（未转领域参与者）。
 * 无头模拟（QuickBattleSim 直收 Enemy 形状）与 buildEnemyTeam 共用，保证两口径编成一致。
 */
export function buildEnemyRoster(scene: XiyouScene, node?: RunNode): Enemy[] {
  const ids = node ? node.enemyIds : [...scene.enemies.map((e) => e.id), scene.yaotu?.id]
  const rows = ids
    .map((id) => (id ? (enemyById.get(id) ?? null) : null))
    .filter((r): r is EnemyRow => !!r)
  const amp = node?.amp ?? 1
  return rows.slice(0, 4).map((row) => {
    const st = row.stats ?? {}
    const s = (v?: number): number => Math.round(v ?? 0)
    // NOTE: 妖气增幅只缩放战斗数值（气血/攻击/防御/速度），命中率/闪避/暴击等百分比类不缩放
    const scaled = (v?: number): number => Math.round((v ?? 0) * amp)
    return {
      id: row.id,
      name: row.name,
      level: row.level,
      stats: {
        [ATTRIBUTE_CODE.currentHealth]: scaled(st.maxHealth),
        [ATTRIBUTE_CODE.maxHealth]: scaled(st.maxHealth),
        [ATTRIBUTE_CODE.currentEnergy]: s(st.maxEnergy ?? 150),
        [ATTRIBUTE_CODE.maxEnergy]: s(st.maxEnergy ?? 150),
        [ATTRIBUTE_CODE.attack]: scaled(st.attack),
        [ATTRIBUTE_CODE.defense]: scaled(st.defense),
        [ATTRIBUTE_CODE.speed]: scaled(st.speed),
        [ATTRIBUTE_CODE.critRate]: st.critRate ?? 5,
        [ATTRIBUTE_CODE.critDamage]: st.critDamage ?? 120,
        [ATTRIBUTE_CODE.hit]: st.hit ?? 10,
        [ATTRIBUTE_CODE.dodge]: st.dodge ?? 2,
      },
      drops: dropsFromRow(row),
      skills: skillsOfRow(row),
      // NOTE: 词缀池数据贯通（W12）：enemyToParticipant 已消费 affixPool 自动应用词缀（GameDataProcessor 内部按
      //       数据源 affixes 表解析池并注入），此处透传 affixPool 即完成「敌人词缀配置 → 战斗生效」闭环。
      affixPool: row.affixPool,
    }
  })
}

/**
 * 由场景敌人构造敌方阵容（至多 4 个，R22：属性/掉落/技能来自 configs/enemies/enemies.json 按 id 关联）
 * 妖徒（yaotu）参战：scenes.json yaotu.id 关联 enemies.json 完整定义，追加在普通敌人之后。
 * 技能按 enemy-skills.json 的 skillType 分桶（与 ConfigDataSource.normalizeEnemy 同口径），
 * passiveSkillIds 归被动、skillType=ultimate 归大招、其余归小技能。
 * @param node 关卡推进节点（runFlow.ts）：传入时按节点编成与妖气增幅构造；缺省 = 整场景合编一场（历史行为）
 */
export function buildEnemyTeam(scene: XiyouScene, node?: RunNode): BattleEntity[] {
  return buildEnemyRoster(scene, node).map((enemy, i) => GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, i))
}

/** 敌人技能按 skillType 分桶（enemy-skills.json 权威；未知技能忽略，引擎普攻兜底） */
function skillsOfRow(row: EnemyRow): { small: string[]; passive: string[]; ultimate: string[] } {
  const small: string[] = []
  const passive: string[] = [...(row.passiveSkillIds ?? [])]
  const ultimate: string[] = []
  for (const id of row.skillIds ?? []) {
    const t = enemySkillTypeById.get(id)
    if (t === SkillType.ULTIMATE) ultimate.push(id)
    else if (t === SkillType.PASSIVE) passive.push(id)
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
  faction?: string
  /** 敌人品阶（EnemyRole 六档，单一来源见 @/domain/fengshen/role-grades） */
  role?: EnemyRole
  stats?: Partial<Record<ATTRIBUTE_CODE, number>>
  drops?: EnemyDropRow[]
  money?: [number, number]
  exp?: [number, number]
  skillIds?: string[]
  passiveSkillIds?: string[]
  affixPool?: EnemyAffixPool
  sceneId?: string
  description?: string
  phases?: Array<{ threshold: number; trigger: string; buffId?: string }>
}

/** 敌人配置索引（id → 行；id 与 scenes.json 敌人 id 一一对应，封神榜健康检查保证零断裂）
 * NOTE: 5 大场景 BOSS（boss_major_*）已并入 enemies.json（引擎结构静态条目，数值冻结）。 */
const enemyRows = enemiesJson as unknown as EnemyRow[]
const enemyById = new Map<string, EnemyRow>(enemyRows.map((r) => [r.id, r]))

/** 敌人技能 → 类型索引（enemy-skills.json skillType；与 ConfigDataSource.normalizeEnemy 同口径） */
const enemySkillTypeById = new Map<string, string>(
  (enemySkillsJson as unknown as Array<{ id: string; skillType?: string }>)
    .map((s) => [s.id, s.skillType ?? 'small'] as const),
)

function dropsFromRow(row: EnemyRow): EnemyDrop[] {
  return (row.drops ?? []).map((d) => ({
    itemId: d.itemId,
    quantity: d.quantity ?? 1,
    chance: d.probability,
  }))
}

/** 敌情横幅用敌方简报（推进演出展示名称/等级/是否关底） */
export interface EnemyBrief {
  id: string
  name: string
  level: number
  isBoss: boolean
}

export function enemyBriefById(id: string): EnemyBrief {
  const row = enemyById.get(id)
  return { id, name: row?.name ?? id, level: row?.level ?? 0, isBoss: id.startsWith('boss_') }
}

/** 单个敌人金钱/经验奖励区间（按敌人 id，供单敌击杀结算；缺省无奖励） */
export function rewardForEnemyById(enemyId: string): { money: [number, number]; exp: [number, number] } {
  const row = enemyById.get(enemyId)
  return {
    money: row?.money ?? [0, 0],
    exp: row?.exp ?? [0, 0],
  }
}

/** 按敌方 id 列表聚合掉落条目（多场推进的逐场结算口径；materials 为关卡必掉，随关底场入包） */
export function dropsForEnemyIds(enemyIds: string[], materials?: string[]): EnemyDrop[] {
  const out: EnemyDrop[] = []
  for (const id of enemyIds) {
    const row = enemyById.get(id)
    if (row) out.push(...dropsFromRow(row))
  }
  for (const m of materials ?? []) {
    out.push({ itemId: m, quantity: 1, chance: 1 })
  }
  return out
}

/** 按敌方 id 列表聚合金钱/经验区间（多场推进的逐场结算口径） */
export function rewardForEnemyIds(enemyIds: string[]): { money: [number, number]; exp: [number, number] } {
  let g0 = 0
  let g1 = 0
  let e0 = 0
  let e1 = 0
  for (const id of enemyIds) {
    const row = enemyById.get(id)
    if (row?.money) {
      g0 += row.money[0]
      g1 += row.money[1]
    }
    if (row?.exp) {
      e0 += row.exp[0]
      e1 += row.exp[1]
    }
  }
  return { money: [g0, g1], exp: [e0, e1] }
}

/** 敌人分级 → 战胜灵韵（六档：小妖 2 / 妖兵 10 / 妖徒 20 / 妖魁 30 / 妖王 50 / 妖尊 150；
 *  权威口径《完整项目说明.md》附录A §10.1；键域挂 EnemyRole，新增档位漏配即编译错） */
const ROLE_XIANYUAN: Record<EnemyRole, number> = {
  xiaoyao: 2,
  yaobing: 10,
  yaotu: 20,
  yaokui: 30,
  yaowang: 50,
  yaozun: 150,
}

/** 按敌方 id 列表聚合战斗胜利灵韵（药园催熟资源；多场推进的逐场结算口径） */
export function xianyuanForEnemyIds(enemyIds: string[]): number {
  let sum = 0
  for (const id of enemyIds) {
    const row = enemyById.get(id)
    sum += row && row.role ? ROLE_XIANYUAN[row.role] : 0
  }
  return sum
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

/**
 * BOSS 首杀一次性奖励（enemyId → 物品清单）：装备本体以 equipment.json source「首杀掉落」为口径，
 * 破境耀星石·下按 §21「场景 BOSS 首杀奖励」。
 * NOTE: 不进敌人常规 drops（首杀后重复刷取会通胀神兵/图纸），发放挂在场景首杀（markSceneCleared），
 *       关底节点中 id 命中本表的敌人逐项必掉。
 */
export const FIRST_KILL_REWARDS: Record<string, string[]> = {
  boss_major_huayaowang: ['wp_sb01', 'star_up_low'],
  boss_major_hebo: ['ar_sb02', 'star_up_low'],
  boss_major_shanshen: ['hd_sb03', 'star_up_low'],
  boss_major_miwu: ['jz_sb04', 'star_up_low'],
  boss_major_rulai: ['star_up_low'],
}

/** 首杀奖励转为必掉掉落形态（quantity=1 / chance=1；供入包与结算展示共用） */
export function firstKillRewardDrops(enemyIds: string[]): EnemyDrop[] {
  const out: EnemyDrop[] = []
  for (const id of enemyIds) {
    for (const itemId of FIRST_KILL_REWARDS[id] ?? []) {
      out.push({ itemId, quantity: 1, chance: 1 })
    }
  }
  return out
}

/**
 * 装备加成 → 主角最终属性增量
 * NOTE: flat 直接相加；percent 按 buildBattleTeams 实际使用的主角基础属性（protagonist 或 playerParty[0]）
 *       计算绝对增量，保证 flat 与 percent 的基准与战斗主角同源。
 * @param protagonist 主角实时战斗快照（playerStore.player 派生），缺省回退 playerParty[0] 演示值
 */
export function equipBonuses(
  stats: EquipmentStatEntry[],
  // NOTE: 引擎按百分数消费 critDamage（DamageCalculator /100 折算倍率），默认值同用百分数语义
  protagonist: ProtagonistSnapshot = { ...playerParty[0], critRate: 0, critDamage: 150, dodge: 0, damageReduction: 0 },
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
 * 主角出战技能（equipped 槽位中的节点 → 技能配置 id 分桶注入战斗）
 * NOTE: 战斗中实际生效技能 = 装备槽选出的技能（需求 §2.3.2），非全部已解锁；
 *       节点 skillId 已在挂载时映射为 configs/skills 实际 id；未装备返回空桶（普攻兜底）。
 */
export function equippedPlayerSkills(): EnemySkills {
  const out: EnemySkills = { small: [], passive: [], ultimate: [] }
  // 组合被动：映射值为逗号分隔的多条配置 id，逐个展开注入
  const expand = (skillId: string): string[] =>
    skillId.split(',').map((s) => s.trim()).filter(Boolean)
  // 天赋树（schools.json layers）学习格：点亮即解锁，skillIds 逐条展开注入
  for (const layer of schoolsLayers) {
    for (const node of layer.nodes) {
      if (!node.learned || !node.skillIds?.length) continue
      const bucket = node.skillKind === '被动' ? out.passive! : node.skillKind === '小技能' ? out.small! : out.ultimate!
      for (const skillId of node.skillIds) bucket.push(...expand(skillId))
    }
  }
  for (const id of equippedSkills.passive) {
    const skillId = skillNodeMap.get(id)?.skillId
    if (skillId) out.passive!.push(...expand(skillId))
  }
  for (const id of equippedSkills.small) {
    const skillId = skillNodeMap.get(id)?.skillId
    if (skillId) out.small!.push(...expand(skillId))
  }
  if (equippedSkills.ultimate) {
    const skillId = skillNodeMap.get(equippedSkills.ultimate)?.skillId
    if (skillId) out.ultimate!.push(...expand(skillId))
  }
  return out
}

/**
 * 流派属性加成（已点亮 attribute/enhance 节点效果 + 纯流派加成）→ 主角属性增量
 * NOTE: 跨流派累加全部已点亮属性节点（v3.0 允许跨流派加点）；纯流派加成由
 *       cultivateStore.recalcPureBonus 判定的 equipped 全同流派决定（非"所选流派"）。
 *       仅注入属性系统已定义（AttributeMetaMap）的属性；不存在的属性（如 tenacity/armorPen
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
  // 纯流派加成（equipped 技能全同流派时生效：如 comboRate +10 / critRate +10 / damageReduction +10）
  const pureSchool = pureSchoolBonus.value
  if (pureSchool) {
    const bonus = schools.find((s) => s.id === pureSchool)?.pureBonus
    if (bonus) addPct(bonus.attribute, bonus.value)
  }
  // 全部已点亮 attribute/enhance 节点 effect（跨流派累加）
  for (const s of schools) {
    for (const n of s.nodes) {
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
  }
  return out
}

/**
 * 流派树（schools.json layers）已投属性节点增量（跨流派累加，供面板与战斗注入）
 * NOTE: 节点 code 即属性码直接累加——绝对值节点（suffix 空）加绝对值，百分比/率节点（suffix %）
 *       value 即百分点；仅注入属性系统已定义（AttributeMetaMap）的属性码。
 *       此前属性节点点亮后无任何结算消费方（点而无效），此函数为统一出口。
 */
export function schoolTreeBonuses(): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const layer of schoolsLayers) {
    for (const node of layer.nodes) {
      if (node.type !== 'attribute' || node.ranks <= 0 || !node.code) continue
      if (!getAttrMeta(node.code as ATTRIBUTE_CODE)) continue
      out[node.code] = (out[node.code] ?? 0) + nodeValueAtRank(node, node.ranks)
    }
  }
  return out
}

/** 主角快照（battleSnapshot）已承载的属性键：经 protagonist 生效，战斗注入时排除避免双算 */
const SNAPSHOT_ATTR_KEYS = new Set<string>([
  ATTRIBUTE_CODE.maxHealth,
  ATTRIBUTE_CODE.attack,
  ATTRIBUTE_CODE.defense,
  ATTRIBUTE_CODE.speed,
  ATTRIBUTE_CODE.critRate,
  ATTRIBUTE_CODE.critDamage,
  ATTRIBUTE_CODE.dodge,
  ATTRIBUTE_CODE.damageReduction,
])

/** 流派树增量中需经 allyBonuses 注入战斗的子集（快照已承载键除外） */
export function schoolTreeCombatBonuses(): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const [code, val] of Object.entries(schoolTreeBonuses())) {
    if (!val || SNAPSHOT_ATTR_KEYS.has(code)) continue
    out[code] = val
  }
  return out
}

/** 西游战斗单位（含主角快照扩展字段）→ Enemy 形状（ATTRIBUTE_CODE stats）。无头模拟与 buildBattleTeams 共用同一映射，保证口径一致 */
function xiyouToEnemy(
  c: XiyouCombatant & { critRate?: number; critDamage?: number; hitRate?: number; dodge?: number; damageReduction?: number },
  player: boolean,
): Enemy {
  return {
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
      [ATTRIBUTE_CODE.critDamage]: c.critDamage ?? 150,
      [ATTRIBUTE_CODE.hit]: c.hitRate ?? 90,
      [ATTRIBUTE_CODE.dodge]: c.dodge ?? 0,
      [ATTRIBUTE_CODE.damageReduction]: c.damageReduction ?? 0,
    },
    drops: dropsForEnemy(c.name),
    // NOTE: 主角注入装备槽选出的技能（equipped 节点映射后的技能）+ 法宝/神器被动（充能/释放）；伙伴为固定空技能（引擎普攻兜底）
    skills: player ? withFabaoSkills(equippedPlayerSkills()) : { small: [], passive: [], ultimate: [] },
  }
}

/** 主角技能三桶并入法宝/神器被动（充能/释放/联动；未出战法宝时原样返回） */
function withFabaoSkills(skills: EnemySkills): EnemySkills {
  const ids = fabaoReleaseSkillIds()
  if (ids.length === 0) return skills
  return { ...skills, passive: [...(skills.passive ?? []), ...ids] }
}

/** Enemy 形状 → ActorData 外壳（QuickBattleSim 我方入参）：stats 同口径复用，技能三桶平铺为 skillIds */
function enemyToActor(e: Enemy): ActorData {
  return {
    id: e.id,
    name: e.name,
    level: e.level,
    stats: e.stats,
    skillIds: [...(e.skills.small ?? []), ...(e.skills.passive ?? []), ...(e.skills.ultimate ?? [])],
  }
}

/** 主角属性加成累加（装备 equipBonuses + 流派 schoolTreeCombatBonuses 的合并结果，只作用于主角）。全键合并（含 dodge/damageReduction 等百分比属性），不做白名单 */
function applyAllyBonuses(enemy: Enemy, allyBonuses: Partial<Record<string, number>>): Enemy {
  const boostedStats: Enemy['stats'] = { ...enemy.stats }
  for (const [attr, bonus] of Object.entries(allyBonuses)) {
    if (!bonus) continue
    boostedStats[attr as ATTRIBUTE_CODE] = (boostedStats[attr as ATTRIBUTE_CODE] ?? 0) + bonus
  }
  return { ...enemy, stats: boostedStats }
}

/**
 * 构造无头模拟（QuickBattleSim）的我方编成：主角 + 上阵伙伴（与 buildBattleTeams 同口径，
 * 装备/流派加成只作用于主角）。我方编成与场景无关——批量扫荡多场景时构造一次复用；
 * 敌方随场景用 buildEnemyRoster(scene) 取。
 * TODO(P2): 当前为整场景合编单场口径；整关节点制（buildRunNodes 连打 + 结算缓回 + 星级评定）需要跨场
 *           血量继承，超过无头模拟「独立满血单场」的能力时再来扩展。
 */
export function buildSimAlly(allyBonuses?: Partial<Record<string, number>>, protagonist?: ProtagonistSnapshot): ActorData[] {
  return buildPlayerParty().map((c, i) => {
    const src = i === 0 && protagonist ? { ...c, ...protagonist } : c
    const enemy = i === 0 && allyBonuses ? applyAllyBonuses(xiyouToEnemy(src, true), allyBonuses) : xiyouToEnemy(src, i === 0)
    return enemyToActor(enemy)
  })
}

/**
 * 将斗战西游阵容转换为战斗引擎参与者（真实参战）
 * NOTE: 经 GameDataProcessor.enemyToParticipant 构造 BattleEntity，消费引擎而非直接 new 领域实现，
 *       与唤灵台演武台同数据源；技能留空（引擎普攻兜底），后续技能接入随 configs/skills 扩展。
 * @param allyBonuses 主角属性加成（已穿戴装备 stats，flat/percent 归一到最终数值），缺省无加成
 * @param protagonist 主角实时战斗快照（playerStore 派生），缺省回退 playerParty[0] 演示值
 * @param node 关卡推进节点（runFlow.ts）：传入时敌方按节点编成 + 妖气增幅；缺省 = 整场景合编一场
 */
export function buildBattleTeams(
  scene: XiyouScene,
  allyBonuses?: Partial<Record<string, number>>,
  protagonist?: ProtagonistSnapshot,
  node?: RunNode,
): { ally: BattleEntity[]; enemy: BattleEntity[] } {
  // NOTE: 主角属性以 protagonist（playerStore 派生）为权威，伙伴为 mate.json 出战属性；装备加成仅作用于主角
  const ally = buildPlayerParty().map((c, i) => {
    const src = i === 0 && protagonist ? { ...c, ...protagonist } : c
    const enemy = i === 0 && allyBonuses ? applyAllyBonuses(xiyouToEnemy(src, true), allyBonuses) : xiyouToEnemy(src, i === 0)
    const participant = GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ALLY, i)
    if (i === 0) participant.fabaoRankMult = fabaoEquippedRank()
    return participant
  })
  const enemy = buildEnemyTeam(scene, node)
  return { ally, enemy }
}
