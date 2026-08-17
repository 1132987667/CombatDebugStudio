/**
 * 斗战西游 · 战斗桥接层
 * NOTE: 配置数据自 configs 导入（vite 别名 @configs），经 GameDataProcessor 构造战斗引擎
 *       参与者（BattleEntity），与唤灵台演武台同数据源；玩家运行时状态持有在 playerStore。
 */

import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import { SkillType } from '@/domain/skill/types'
import type { EquipmentData } from '@/domain/fengshen/types'
import { PLAYER_ID } from '@/shared/constants/player'
import type { Enemy, EnemyAffixPool, EnemyDrop, EnemySkills } from '@/shared/types/enemy'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import enemiesJson from '@configs/enemies/enemies.json'
import bossesJson from '@configs/xiyou/bosses.json'
import enemySkillsJson from '@configs/xiyou/enemy-skills.json'
import type { ProtagonistSnapshot, XiyouCombatant, XiyouScene } from './types'
import { equippedSkills, pureSchoolBonus, schools, skillNodeMap } from './xiyouData'

/** 我方初始阵容：仅主角一人（孙小圣/八戒/悟净等伙伴在 mate.json 队友表，初始不上阵） */
export const playerParty: XiyouCombatant[] = [
  { id: PLAYER_ID, name: '降妖者', level: 5, hp: 350, maxHp: 420, energy: 120, maxEnergy: 150, speed: 15, attack: 18, defense: 8, side: 'player' },
]

/**
 * 由场景敌人构造敌方阵容（至多 4 个，R22：属性/掉落/技能来自 configs/enemies/enemies.json 按 id 关联）
 * 妖徒（yaotu）参战：scenes.json yaotu.id 关联 enemies.json 完整定义，追加在普通敌人之后。
 * 技能按 enemy-skills.json 的 skillType 分桶（与 ConfigDataSource.normalizeEnemy 同口径），
 * passiveSkillIds 归被动、skillType=ultimate 归大招、其余归小技能。
 */
export function buildEnemyTeam(scene: XiyouScene): BattleEntity[] {
  const rowOf = (id?: string): EnemyRow | null => (id ? (enemyById.get(id) ?? null) : null)
  const rows: EnemyRow[] = scene.enemies
    .map((e) => rowOf(e.id))
    .filter((r): r is EnemyRow => !!r)
  const yaotuRow = scene.yaotu ? rowOf(scene.yaotu.id) : null
  if (yaotuRow) rows.push(yaotuRow)
  return rows.slice(0, 4).map((row, i) => {
    const st = row.stats ?? {}
    const s = (v?: number): number => Math.round(v ?? 0)
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
  stats?: Partial<Record<ATTRIBUTE_CODE, number>>
  drops?: EnemyDropRow[]
  gold?: [number, number]
  exp?: [number, number]
  skillIds?: string[]
  passiveSkillIds?: string[]
  affixPool?: EnemyAffixPool
  sceneId?: string
  description?: string
  phases?: Array<{ threshold: number; trigger: string; buffId?: string }>
}

/** 敌人配置索引（id → 行；id 与 scenes.json 敌人 id 一一对应，封神榜健康检查保证零断裂）
 * NOTE: 5 大场景 BOSS（boss_major_*）定义收敛到 bosses.json（权威），运行时经 bossToRow 转换合并进索引。 */
const enemyRows = enemiesJson as unknown as EnemyRow[]
const enemyById = new Map<string, EnemyRow>(enemyRows.map((r) => [r.id, r]))

/** bosses.json 重型 BOSS 条目（设计稿结构：内联文本技能 / 对象掉落 / 缺角色字段） */
interface BossRow {
  id?: string
  name?: string
  level?: number
  type?: string
  enemyType?: string
  faction?: string
  stats?: Partial<Record<ATTRIBUTE_CODE, number>>
  skills?: Array<{ id?: string }>
  passive?: { id?: string }
  ultimate?: { id?: string }
  affixPool?: EnemyAffixPool
  drops?: { guaranteed?: string[]; rare?: string[]; gold?: [number, number]; exp?: [number, number] }
  phases?: Array<{ threshold: number; trigger: string }>
  unlockCondition?: { sceneId?: string }
  description?: string
  narrative?: unknown
}

/** 把 bosses.json 的 major BOSS 条目转为引擎 EnemyRow（数值以 bosses.json 为准；技能引用 enemy-skills.json 现有可执行定义） */
function bossToRow(b: BossRow): EnemyRow | null {
  if (!b.id || b.type !== 'major') return null
  const name = b.id.replace('boss_major_', '')
  const guaranteed = b.drops?.guaranteed ?? []
  const rare = b.drops?.rare ?? []
  return {
    id: b.id,
    name: b.name ?? b.id,
    level: b.level ?? 1,
    type: b.enemyType ?? 'old_blood',
    faction: b.faction,
    role: 'yaokui',
    stats: {
      ...(b.stats ?? {}),
      hit: b.stats?.hit ?? 30,
      dodge: b.stats?.dodge ?? 15,
      maxEnergy: b.stats?.maxEnergy ?? 150,
      energyInit: b.stats?.energyInit ?? 25,
    },
    skillIds: [`skill_boss_major_${name}_s1`, `skill_boss_major_${name}_s2`, `skill_boss_major_${name}_ult`],
    passiveSkillIds: [`passive_boss_major_${name}_p1`],
    affixPool: { buffTier: b.affixPool?.buffTier ?? 1, count: 1 },
    drops: [
      ...guaranteed.map((id) => ({ itemId: id, probability: 1 })),
      ...rare.map((id) => ({ itemId: id, probability: 0.3 })),
    ],
    gold: b.drops?.gold,
    exp: b.drops?.exp,
    sceneId: b.unlockCondition?.sceneId,
    description: b.description,
    phases: (b.phases ?? []).map((p, i) => ({
      ...p,
      buffId: i === 0 ? 'buff_boss_major_phase2_atk' : 'buff_boss_major_phase3_berserk',
    })),
  }
}

// NOTE: 收敛 —— 5 大场景 BOSS 定义来自 bosses.json（权威），覆盖 enemies.json 同名索引（该处已删除）
for (const b of bossesJson as unknown as BossRow[]) {
  const row = bossToRow(b)
  if (row) enemyById.set(row.id, row)
}

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

/** 战斗胜利掉落：聚合场景全部敌人的掉落条目 + 场景掉落表材料（configs/enemies/enemies.json 与 scenes.json 权威，供 BattleZen 结算入包） */
export function dropsForScene(scene: XiyouScene): EnemyDrop[] {
  const out: EnemyDrop[] = []
  for (const e of scene.enemies) {
    const row = e.id ? enemyById.get(e.id) : undefined
    if (row) out.push(...dropsFromRow(row))
  }
  // 妖徒掉落并入（yaotu 已参战，胜利结算应含其掉落）
  if (scene.yaotu) {
    const row = enemyById.get(scene.yaotu.id)
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

/** 单个敌人金币/经验奖励区间（按敌人 id，供单敌击杀结算；缺省无奖励） */
export function rewardForEnemyById(enemyId: string): { gold: [number, number]; exp: [number, number] } {
  const row = enemyById.get(enemyId)
  return {
    gold: row?.gold ?? [0, 0],
    exp: row?.exp ?? [0, 0],
  }
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
  // 妖徒奖励并入（yaotu 已参战，结算与预览一致）
  if (scene.yaotu) {
    const row = enemyById.get(scene.yaotu.id)
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
 * 主角出战技能（equipped 槽位中的节点 → 技能配置 id 分桶注入战斗）
 * NOTE: 战斗中实际生效技能 = 装备槽选出的技能（需求 §2.3.2），非全部已解锁；
 *       节点 skillId 已在挂载时映射为 configs/skills 实际 id；未装备返回空桶（普攻兜底）。
 */
export function equippedPlayerSkills(): EnemySkills {
  const out: EnemySkills = { small: [], passive: [], ultimate: [] }
  for (const id of equippedSkills.passive) {
    const skillId = skillNodeMap.get(id)?.skillId
    if (skillId) out.passive!.push(skillId)
  }
  for (const id of equippedSkills.small) {
    const skillId = skillNodeMap.get(id)?.skillId
    if (skillId) out.small!.push(skillId)
  }
  if (equippedSkills.ultimate) {
    const skillId = skillNodeMap.get(equippedSkills.ultimate)?.skillId
    if (skillId) out.ultimate!.push(skillId)
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
    // NOTE: 主角注入装备槽选出的技能（equipped 节点映射后的技能）；伙伴为固定空技能（引擎普攻兜底）
    skills: player ? equippedPlayerSkills() : { small: [], passive: [], ultimate: [] },
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
