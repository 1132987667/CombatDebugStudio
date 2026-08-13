/**
 * 斗战西游 · 展示数据聚合层
 * NOTE: 配置数据自 configs/xiyou/*.json 导入（vite 别名 @configs），方便后续调数值；
 *       仅保留运行时状态（玩家/敌人/货币/战斗日志）在此，类型定义亦统一于此。
 */

import caveJson from '@configs/xiyou/cave.json'
import collectJson from '@configs/xiyou/collect.json'
import cultivateJson from '@configs/xiyou/cultivate.json'
import equipJson from '@configs/xiyou/equip.json'
import itemsJson from '@configs/xiyou/items.json'
import mateJson from '@configs/xiyou/mate.json'
import packJson from '@configs/xiyou/pack.json'
import questJson from '@configs/xiyou/quest.json'
import regionsJson from '@configs/xiyou/regions.json'
import scenesJson from '@configs/xiyou/scenes.json'
import schoolsJson from '@configs/xiyou/schools.json'
import { computed, reactive } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import type { Enemy, EnemyDrop } from '@/shared/types/enemy'
import type { ItemEffect } from '@/shared/types/Item'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { XiyouData } from '@/domain/fengshen/types'
import { computeStatBonuses, createPlayerProfile, playerConfig } from './playerProfile'

/** 玩家货币（运行时状态） */
export interface XiyouCurrency {
  copper: number
  silver: number
  jade: number
}

export const currency: XiyouCurrency = { copper: 12880, silver: 36, jade: 520 }

/** 玩家属性快照（运行时状态） */
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

export const player: XiyouPlayer = reactive(createPlayerProfile({ level: 5, exp: 360 }))

/** 角色加点（运行时状态 · 展示态，暂未回灌战斗属性） */
export interface XiyouStatPoints {
  available: number
  strength: number
  vitality: number
  agility: number
  spirit: number
}

export const statPoints: XiyouStatPoints = reactive<XiyouStatPoints>({
  available: 3,
  strength: 0,
  vitality: 0,
  agility: 0,
  spirit: 0,
})

/** 玩家属性值快照（实时计算：player 基础 + 等级成长 + 加点加成；缺省走领域默认值 getAttrDv） */
export const playerAttributes = computed<Partial<Record<ATTRIBUTE_CODE, number>>>(() => {
  const bonus = computeStatBonuses(statPoints)
  return {
    [ATTRIBUTE_CODE.currentHealth]: player.hp,
    [ATTRIBUTE_CODE.maxHealth]: player.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0),
    [ATTRIBUTE_CODE.currentEnergy]: player.energy,
    [ATTRIBUTE_CODE.maxEnergy]: player.maxEnergy + (bonus[ATTRIBUTE_CODE.maxEnergy] ?? 0),
    [ATTRIBUTE_CODE.attack]: player.attackMax + (bonus[ATTRIBUTE_CODE.attack] ?? 0),
    [ATTRIBUTE_CODE.defense]: player.defense + (bonus[ATTRIBUTE_CODE.defense] ?? 0),
    [ATTRIBUTE_CODE.speed]: player.speed + (bonus[ATTRIBUTE_CODE.speed] ?? 0),
    [ATTRIBUTE_CODE.critRate]: player.critRate,
    [ATTRIBUTE_CODE.critDamage]: player.critDamage,
    [ATTRIBUTE_CODE.hit]: player.hitRate,
    [ATTRIBUTE_CODE.dodge]: player.dodgeRate,
    [ATTRIBUTE_CODE.hitValue]: playerConfig.base.hitValue,
    [ATTRIBUTE_CODE.dodgeValue]: playerConfig.base.dodgeValue,
  }
})

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
  { id: 'player', name: '降妖者', level: 5, hp: 350, maxHp: 420, energy: 120, maxEnergy: 150, speed: 15, attack: 18, defense: 8, side: 'player' },
  { id: 'sun', name: '孙小圣', level: 5, hp: 380, maxHp: 430, energy: 110, maxEnergy: 140, speed: 18, attack: 22, defense: 6, side: 'player' },
  { id: 'bajie', name: '八戒', level: 4, hp: 520, maxHp: 560, energy: 70, maxEnergy: 120, speed: 9, attack: 15, defense: 14, side: 'player' },
  { id: 'wujing', name: '悟净', level: 3, hp: 300, maxHp: 360, energy: 130, maxEnergy: 160, speed: 11, attack: 13, defense: 10, side: 'player' },
]

/** 由场景敌人构造敌方阵容（至多 4 个） */
export function buildEnemyParty(sceneEnemies: Array<{ name: string; level: number }>): XiyouCombatant[] {
  return sceneEnemies.slice(0, 4).map((e, i) => ({
    id: `enemy_${i}`,
    name: e.name,
    level: e.level,
    hp: 240 + e.level * 18,
    maxHp: 240 + e.level * 18,
    energy: 80,
    maxEnergy: 140,
    speed: Math.max(6, 12 - i * 2),
    attack: 10 + e.level * 2,
    defense: 3 + e.level,
    side: 'enemy' as const,
  }))
}

/**
 * 敌人掉落表（敌人名 → 掉落条目）
 * NOTE: 数据暂收拢于此常量，后续可下沉 configs/xiyou（如 drops.json）；物品 id 必须存在于 items.json
 */
const XIYOU_DROPS: Record<string, EnemyDrop[]> = {
  花妖: [{ itemId: 'mat_001', quantity: 1, chance: 1 }],
  石精: [{ itemId: 'mat_002', quantity: 1, chance: 0.8 }],
  山魈: [{ itemId: 'mat_003', quantity: 1, chance: 0.5 }],
  虾兵: [{ itemId: 'mat_005', quantity: 1, chance: 1 }],
  蟹将: [{ itemId: 'mat_004', quantity: 1, chance: 0.8 }],
  鱼精: [{ itemId: 'mat_005', quantity: 1, chance: 0.5 }],
  痞猴: [{ itemId: 'mat_001', quantity: 1, chance: 0.6 }],
  货郎精: [{ itemId: 'mat_003', quantity: 1, chance: 0.5 }],
  老狐: [{ itemId: 'mat_004', quantity: 1, chance: 0.4 }],
  礁蟹: [{ itemId: 'mat_005', quantity: 1, chance: 0.6 }],
  小蛟龙: [{ itemId: 'mat_sp_02', quantity: 1, chance: 0.3 }],
}

/** 战斗胜利掉落：聚合场景全部敌人的掉落条目（供 BattleZen 结算入包） */
export function dropsForScene(scene: XiyouScene): EnemyDrop[] {
  const out: EnemyDrop[] = []
  for (const e of scene.enemies) {
    const drops = XIYOU_DROPS[e.name]
    if (drops) out.push(...drops)
  }
  return out
}

/**
 * 将斗战西游阵容转换为战斗引擎参与者（真实参战）
 * NOTE: 经 GameDataProcessor.enemyToParticipant 构造 BattleEntity，消费引擎而非直接 new 领域实现，
 *       与唤灵台演武台同数据源；技能留空（引擎普攻兜底），后续技能接入随 configs/skills 扩展。
 */
export function buildBattleTeams(scene: XiyouScene): { ally: BattleEntity[]; enemy: BattleEntity[] } {
  const toEnemy = (c: XiyouCombatant): Enemy => ({
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
      [ATTRIBUTE_CODE.critRate]: 10,
      [ATTRIBUTE_CODE.critDamage]: 1.5,
    },
    drops: XIYOU_DROPS[c.name] ?? [],
    skills: { small: [], passive: [], ultimate: [] },
  })
  const ally = playerParty.map((c, i) =>
    GameDataProcessor.enemyToParticipant(toEnemy(c), ParticipantSide.ALLY, i),
  )
  const enemy = buildEnemyParty(scene.enemies).map((c, i) =>
    GameDataProcessor.enemyToParticipant(toEnemy(c), ParticipantSide.ENEMY, i),
  )
  return { ally, enemy }
}

/* ══════════════════════════════════════════════════════════════════
   类型定义（组件仅引用类型，数据实体见 configs/xiyou/*.json）
   ══════════════════════════════════════════════════════════════════ */

/** 关卡难度 */
export type XiyouDifficulty = 'easy' | 'normal' | 'hard' | 'hell'

/** 物品品质（凡 / 玄 / 地 / 天 / 仙） */
export type XiyouQuality = '凡品' | '玄品' | '地品' | '天品' | '仙品'

/** 技能卡片 */
export interface XiyouSkill {
  name: string
  type: 'passive' | 'skill' | 'ultimate'
  cost: number
  desc: string
  /** 技能树加点（运行时字段，configs 未含 · 展示态） */
  tier?: 1 | 2 | 3
  levelReq?: number
  currentPoints?: number
  maxPoints?: number
}

/** 区域（章节）· 对应一张大地图 */
export interface XiyouRegion {
  id: string
  name: string
  sub: string
  viewBox: string
  route: string
  decors: Array<{ d: string; kind: 'mountain' | 'cloud' | 'water' | 'fire' | 'tower' | 'wave' }>
}

/** 场景（关卡）卡片 */
export interface XiyouScene {
  id: string
  regionId: string
  name: string
  range: string
  desc: string
  enemies: Array<{ name: string; level: number }>
  unlocked: boolean
  difficulty: XiyouDifficulty
  stars: number
  maxStars: number
  pos: { x: number; y: number }
}

/** 流派（对应修行「流派」子系统） */
export interface XiyouSchool {
  id: string
  name: string
  motto: string
  skills: XiyouSkill[]
  selected?: boolean
  /** 技能点（运行时字段，configs 未含 · 展示态） */
  totalPoints?: number
  maxPoints?: number
}

/** 乾坤袋物品（背包子系统） */
export interface XiyouItem {
  name: string
  count: number
  rarity: '普通' | '稀有' | '珍品' | '仙品'
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
  quality: XiyouQuality
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

/** 装备槽位（装备子系统） */
export interface XiyouGearSlot {
  slot: string
  item: string
  quality: XiyouQuality
  enhance: number
  maxEnhance: number
  star: number
  effect: string
  equipped: boolean
}

/** 法宝（法宝子系统） */
export interface XiyouTreasure {
  name: string
  tier: XiyouQuality
  level: number
  maxLevel: number
  progress: number
  skill: string
  active: boolean
}

/** 坐骑（坐骑子系统） */
export interface XiyouMount {
  name: string
  quality: XiyouQuality
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
  quality: XiyouQuality
  level: number
  stars: number
  active: boolean
  desc: string
}

/** 灵宠（灵宠子系统） */
export interface XiyouPet {
  name: string
  quality: XiyouQuality
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

/** 炼丹 / 炼器丹方（炼丹 · 炼器子系统） */
export interface XiyouRecipe {
  name: string
  level: number
  materials: string
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
export const schools: XiyouSchool[] = reactive<XiyouSchool[]>(schoolsJson as unknown as XiyouSchool[])

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

export const gearSlots: XiyouGearSlot[] = reactive<XiyouGearSlot[]>(equipJson.gearSlots as unknown as XiyouGearSlot[])
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

/** 从封神榜 IDB 载入西游配置（需求说明 §5.1 方案 B）：成功原地更新 reactive 导出；失败/无数据保持 configs 兜底 */
export async function loadXiyouData(): Promise<boolean> {
  try {
    const api = container.resolve<GameDataApi>('GameDataApi')
    const rows = await api.listXiyouData()
    if (rows.length === 0) return false
    const map = new Map(rows.map((r: XiyouData) => [r.id, r.data as Record<string, unknown>]))
    applyXiyou(map)
    return true
  } catch {
    return false
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
  a(schools, 'schools')
  aIn(materials, 'pack', 'materials')
  aIn(equipment, 'pack', 'equipment')
  aIn(pills, 'pack', 'pills')
  aIn(consumables, 'pack', 'consumables')
  aIn(shopGoods, 'pack', 'shopGoods')
  aIn(storageCells, 'pack', 'storageCells')
  aIn(realms, 'cultivate', 'realms')
  aIn(martialArts, 'cultivate', 'martialArts')
  aIn(meridians, 'cultivate', 'meridians')
  aIn(dharmas, 'cultivate', 'dharmas')
  aIn(gearSlots, 'equip', 'gearSlots')
  aIn(treasures, 'equip', 'treasures')
  aIn(mounts, 'equip', 'mounts')
  aIn(mates, 'mate', 'mates')
  aIn(pets, 'mate', 'pets')
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
