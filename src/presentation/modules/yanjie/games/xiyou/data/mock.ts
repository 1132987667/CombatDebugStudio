/**
 * 斗战西游 · 展示数据聚合层
 * NOTE: 配置数据自 configs/xiyou/*.json 导入（vite 别名 @configs），方便后续调数值；
 *       仅保留运行时状态（玩家/敌人/货币/战斗日志）在此，类型定义亦统一于此。
 */

import caveJson from '@configs/xiyou/cave.json'
import collectJson from '@configs/xiyou/collect.json'
import cultivateJson from '@configs/xiyou/cultivate.json'
import equipJson from '@configs/xiyou/equip.json'
import mateJson from '@configs/xiyou/mate.json'
import packJson from '@configs/xiyou/pack.json'
import questJson from '@configs/xiyou/quest.json'
import regionsJson from '@configs/xiyou/regions.json'
import scenesJson from '@configs/xiyou/scenes.json'
import schoolsJson from '@configs/xiyou/schools.json'

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
  exp: number
  expNeed: number
}

export const player: XiyouPlayer = {
  level: 5,
  name: '降妖者',
  hp: 350,
  maxHp: 420,
  energy: 120,
  maxEnergy: 150,
  attackMin: 12,
  attackMax: 20,
  defense: 8,
  speed: 15,
  critRate: 7.5,
  critDamage: 125,
  exp: 360,
  expNeed: 1500,
}

/** 当前场景敌人快照（运行时状态） */
export interface XiyouEnemy {
  name: string
  level: number
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
}

export const enemy: XiyouEnemy = {
  name: '花妖',
  level: 1,
  hp: 280,
  maxHp: 320,
  energy: 90,
  maxEnergy: 150,
}

/** 战斗心经日志条目（运行时状态） */
export interface XiyouLog {
  round: number
  text: string
  emphasis?: boolean
}

export const battleLogs: XiyouLog[] = [
  { round: 1, text: '你使用「破甲斩」，造成 58 点伤害' },
  { round: 1, text: '花妖使用「藤蔓缠绕」，造成 12 点伤害' },
  { round: 2, text: '你触发「迅捷连击」，追加攻击造成 29 点伤害' },
  { round: 2, text: '花妖气血归零，战斗结束！', emphasis: true },
  { round: 2, text: '获得经验 30 点 | 获得物品 桃木×2' },
  { round: 2, text: '升级！当前等级 5 → 气血+10 攻击+1-2 防御+1 速度+1', emphasis: true },
]

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
}

/** 乾坤袋物品（背包子系统） */
export interface XiyouItem {
  name: string
  count: number
  rarity: '普通' | '稀有' | '珍品' | '仙品'
  desc: string
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
   ══════════════════════════════════════════════════════════════════ */

export const regions: XiyouRegion[] = regionsJson as unknown as XiyouRegion[]
export const scenes: XiyouScene[] = scenesJson as unknown as XiyouScene[]
export const schools: XiyouSchool[] = schoolsJson as unknown as XiyouSchool[]

export const materials: XiyouItem[] = packJson.materials as unknown as XiyouItem[]
export const equipment: XiyouItem[] = packJson.equipment as unknown as XiyouItem[]
export const pills: XiyouItem[] = packJson.pills as unknown as XiyouItem[]
export const consumables: XiyouItem[] = packJson.consumables as unknown as XiyouItem[]
export const shopGoods: XiyouShopGood[] = packJson.shopGoods as unknown as XiyouShopGood[]
export const storageCells: XiyouStorageCell[] = packJson.storageCells as unknown as XiyouStorageCell[]

export const realms: XiyouRealm[] = cultivateJson.realms as unknown as XiyouRealm[]
export const martialArts: XiyouMartial[] = cultivateJson.martialArts as unknown as XiyouMartial[]
export const meridians: XiyouMeridian[] = cultivateJson.meridians as unknown as XiyouMeridian[]
export const dharmas: XiyouDharma[] = cultivateJson.dharmas as unknown as XiyouDharma[]

export const gearSlots: XiyouGearSlot[] = equipJson.gearSlots as unknown as XiyouGearSlot[]
export const treasures: XiyouTreasure[] = equipJson.treasures as unknown as XiyouTreasure[]
export const mounts: XiyouMount[] = equipJson.mounts as unknown as XiyouMount[]

export const mates: XiyouMate[] = mateJson.mates as unknown as XiyouMate[]
export const pets: XiyouPet[] = mateJson.pets as unknown as XiyouPet[]
export const affinities: XiyouAffinity[] = mateJson.affinities as unknown as XiyouAffinity[]

export const codexChapters: XiyouCodexChapter[] = collectJson.codexChapters as unknown as XiyouCodexChapter[]
export const achievements: XiyouAchievement[] = collectJson.achievements as unknown as XiyouAchievement[]
export const titles: XiyouTitle[] = collectJson.titles as unknown as XiyouTitle[]

export const quests: XiyouQuest[] = questJson.quests as unknown as XiyouQuest[]
export const checkinDays: XiyouCheckinDay[] = questJson.checkinDays as unknown as XiyouCheckinDay[]
export const events: XiyouEvent[] = questJson.events as unknown as XiyouEvent[]

export const alchemyRecipes: XiyouRecipe[] = caveJson.alchemyRecipes as unknown as XiyouRecipe[]
export const forgeRecipes: XiyouRecipe[] = caveJson.forgeRecipes as unknown as XiyouRecipe[]
export const retreats: XiyouRetreat[] = caveJson.retreats as unknown as XiyouRetreat[]
export const crops: XiyouCrop[] = caveJson.crops as unknown as XiyouCrop[]
export const crafts: XiyouCraft[] = caveJson.crafts as unknown as XiyouCraft[]
