/**
 * 斗战西游 · 类型定义（组件仅引用类型，数据实体见 configs/xiyou/*.json）
 */

import type { ItemEffect } from '@/shared/types/Item'

/** 玩家货币（运行时状态 · 持有在 playerStore） */
export interface XiyouCurrency {
  copper: number // 铜币
  silver: number // 银币
  jade: number // 金币
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

/**
 * 主角实时战斗快照（playerStore.player 派生）
 * NOTE: 战斗主角以此属性为权威（加点/丹药/等级变化反映到战斗），缺省回退 playerParty[0] 的演示值。
 */
export type ProtagonistSnapshot = XiyouCombatant & {
  critRate: number
  critDamage: number
  dodge: number
  damageReduction: number
}

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
  /** 所属流派 id（linghou / jinxing / panshi，纯流派判定用） */
  schoolId: string
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

/** 流派技能点（v3.0：全局 60 点 = 等级 50 + 悟道丹 10，跨流派共享）
 *  earned 累计获得（等级点 + 丹药点），spent 已分配，available = earned - spent */
export interface XiyouSkillPoints {
  /** 硬上限（60），UI 展示用 */
  max: number
  /** 已分配点数（洗点消耗与节点点亮共用） */
  spent: number
  /** 累计获得技能点（等级 50 上限 + 悟道丹 10 上限，合计 60） */
  earned: number
  /** 已服用悟道丹次数（全存档上限 10） */
  totalPillsUsed: number
}

/** 出战技能装备槽（v3.0：被动 2 / 小技能 2 / 大招 1，存节点 id 而非技能配置 id） */
export interface XiyouEquippedSkills {
  passive: string[]
  small: string[]
  ultimate: string | null
}

// ════════════════════════════════════════════════════════════
// schools.json 天赋树（v4.0：10 层 × 5 流派，Canvas 渲染）
// ════════════════════════════════════════════════════════════

/** 天赋树流派 id（schools.json schools 字段的 key，string 以支持未来扩展） */
export type SchoolsSchoolId = string

/** 天赋树节点类型（schools.json nodes.type） */
export type SchoolsNodeType = 'attribute' | 'learn' | 'special'

/** 天赋树节点（schools.json 层内节点，运行时附加位置/状态信息） */
export interface SchoolsNode {
  /** 唯一 id：layer_index（自动计算） */
  id: string
  /** 所属流派 */
  school: SchoolsSchoolId
  /** 节点类型 */
  type: SchoolsNodeType
  /** 节点名称 */
  name: string
  /** 属性 code（attribute/special 节点） */
  code?: string
  /** 消耗点数 [每级消耗, 每级消耗] 或 [单次消耗] */
  cost: number[] | null
  /** 属性值 [基础值, 满级值] 或 [固定值] */
  value: number[] | null
  /** 后缀（如 "%"） */
  suffix: string
  /** 描述模板 */
  description: string
  /** learn 节点：技能类型（被动/小技能/大技能） */
  skillKind?: string
  /** 运行时：所属层号（1-based） */
  layer: number
  /** 运行时：层内序号（0-based，用于水平定位） */
  index: number
  /** 运行时：已解锁 */
  learned: boolean
  /** 运行时：Canvas 布局坐标（像素） */
  x: number
  y: number
}

/** 天赋树层（schools.json layers 数组项） */
export interface SchoolsLayer {
  /** 层号（1-based，底部为 1） */
  layer: number
  /** 解锁该层所需累计点数 */
  pointsRequired: number
  /** 该层所有节点 */
  nodes: SchoolsNode[]
}

/** 天赋树流派定义（schools.json schools 字段） */
export interface SchoolsSchoolDef {
  id: SchoolsSchoolId
  /** 中文名 */
  name: string
}

/** 天赋树节点原始结构（schools.json JSON 层面，不含运行时字段） */
export type SchoolsNodeRaw = Omit<SchoolsNode, 'id' | 'layer' | 'index' | 'learned' | 'x' | 'y'>

/** 天赋树层原始结构（schools.json JSON 层面，不含运行时字段） */
export interface SchoolsLayerRaw {
  layer: number
  pointsRequired: number
  nodes: SchoolsNodeRaw[]
}

// ════════════════════════════════════════════════════════════

/** 区域（章节）· 对应一张大地图 */
export interface XiyouRegion {
  id: string
  name: string
  sub: string
  /** 等级范围（configs/xiyou/regions.json） */
  levelRange?: [number, number]
}

/** 场景（关卡）卡片
 * NOTE: 25 关平铺结构（configs/xiyou/scenes.json）：内联 enemies + 解锁链 */
export interface XiyouScene {
  id: string
  regionId: string
  name: string
  /** 等级范围（configs/xiyou/scenes.json） */
  levelRange?: [number, number]
  desc: string
  enemies: Array<{ id?: string; name: string; level: number; type?: string }>
  /** 守护者（本关妖徒 · configs/xiyou/scenes.json 内联，id 关联 enemies.json 完整定义） */
  yaotu?: { id: string; name: string; level: number } | null
  /** 掉落配置（材料 / 金币区间 / 经验区间） */
  drops?: { materials?: string[]; gold?: [number, number]; exp?: [number, number] }
  /** 剧情钩子（configs/xiyou/scenes.json narrativeHook） */
  narrativeHook?: string
  unlocked: boolean
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
  /** 实际价值（单位：铜钱口径）；>0 即可出售，出售价/坊市购买价由价值 × 全局系数派生 */
  value?: number
  source?: string
  description?: string
  /** 使用效果（仅丹药/符箓类，来自 items.json effects） */
  effects?: ItemEffect[]
}

/** 坊市商品（商店子系统）。有 itemId 的商品价格 = 物品实际价值 × 购买系数（params 域 economy_ratios），
 *  无 itemId（如引路香、跨货币单位商品）保留 price 手写兜底价 */
export interface XiyouShopGood {
  name: string
  type: '杂货' | '材料' | '丹药' | '装备'
  /** 关联物品（items.json 主键）；存在时价格由 价值×购买系数 派生，price 仅兜底 */
  itemId?: string
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

/** 成就（成就子系统） */
export interface XiyouAchievement {
  name: string
  desc: string
  progress: number
  target: number
  reward: string
  done: boolean
}


/** 任务（任务子系统） */
export interface XiyouQuest {
  type: '主线' | '日常'
  name: string
  desc: string
  progress: number
  target: number
  reward: string
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

/** 药园可种植作物（configs/xiyou/cave.json gardenCrops） */
export interface XiyouGardenCrop {
  /** 作物物品 id（items.json 注册；种植与产出共用该 id） */
  id: string
  name: string
  /** 单次收获产出数量 */
  yield: number
  /** 收获后冷却时长（秒） */
  cooldown: number
}

/** 技艺（百艺子系统） */
export interface XiyouCraft {
  name: string
  level: number
  maxLevel: number
  progress: number
  effect: string
}
