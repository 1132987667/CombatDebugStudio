/**
 * 封神榜数据表类型（IndexedDB v2 封神榜 store 的领域实体）
 *
 * 表名常量见 `domain/port/IPersistentStorage.ts` 的 FENGSHEN_STORE。
 * 统一约定：所有实体含 `id`（唯一标识）+ 存储层补 `updatedAt`（最近修改时间戳）。
 * 技能/敌人/场景/阵型/材料/Buff 复用现有类型契约，此处仅定义新增域。
 */

import type { SkillConfig } from '@/domain/skill/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { FormationConfig } from '@/shared/types/formation'
import type { Item, ItemEffect } from '@/shared/types/Item'
import type { AffixTier, AffixTarget } from '@/shared/constants/affix'

/** 角色（actors 表）—— 对齐规格说明书 3.1 */
export interface ActorData {
  id: string
  name: string
  level: number
  /** 基础属性：气血、能量、最小/最大攻击、防御、速度、暴击率等（键为 ATTRIBUTE_CODE） */
  stats: Record<string, number>
  /** 成长曲线 ID（引用 growth 表） */
  growth?: string
  /** 可用技能 ID 列表（引用 skills 表） */
  skillIds: string[]
  /** 所属阵营 / 元素（引用 elements 表） */
  faction?: string
  /** 初始能量（默认 30） */
  energyInit?: number
  description?: string
}

/** 装备（equipment 表）—— 对齐规格说明书 3.6。
 * 统一装备定义表：configs/equipment/equipment.json（旧 eq_* 与西游 wp_/ar_/ac_ 已合并为唯一数据源）。
 * 可打造装备含 tier/materials/cost；无法匹配新体系的旧版 eq_* 保留原 ID（craftable 缺省 false）。 */
export interface EquipmentStatEntry {
  attribute: string
  modifierType: 'flat' | 'percent'
  value: number
}
export interface EquipmentMaterialEntry {
  /** 材料物品 ID（引用 items 表） */
  itemId: string
  count: number
}
export interface EquipmentData {
  id: string
  name: string
  slot: 'weapon' | 'armor' | 'helmet' | 'boots' | 'charm' | 'ring'
  /** 子类型（轻型/中型/重型/皮甲/木甲/铠甲/护符/戒指/头盔/冠冕/靴子） */
  subType?: string
  /** 阶位（t1 凡品 ~ t5 仙品） */
  tier?: 't1' | 't2' | 't3' | 't4' | 't5'
  rarity: number
  stats: EquipmentStatEntry[]
  /** 穿戴等级门槛 */
  requiredLevel?: number
  /** 阵营限制（引用 elements 表） */
  factionRestriction?: string
  /** 打造材料（可打造装备才有） */
  materials?: EquipmentMaterialEntry[]
  /** 打造金钱消耗 */
  cost?: number
  /** 是否可打造 */
  craftable?: boolean
  /** 对应洞府配方 ID（引用 cave.json forgeRecipes.id，图谱存在才有） */
  recipeId?: string
  /** 对应图谱物品 ID（引用 items.json 的 bp_* 条目） */
  blueprintId?: string
  /** 旧版 ID（合并前封神榜 equipment 表沿用 ID，供迁移/掉落兼容） */
  legacyIds?: string[]
  /** 获取来源说明 */
  source?: string
  description?: string
}

/** 物品（items 表）—— 全量物品主键索引（configs/xiyou/items.json）。所有掉落表 / 制造表的 itemId 均须在此注册 */
export interface ItemData {
  id: string
  name: string
  /** 功能大类（木材/矿石/丹药/图纸/武器/饰品...，枚举见 schema items 表） */
  type: string
  /** 稀有度（1 普通 ~ 5 仙品） */
  rarity: number
  /** 获取来源 */
  source?: string
  /** 物品描述（材料/丹药等来自原 materials.json 的条目含描述） */
  description?: string
  /** 使用效果（仅消耗品/丹药类） */
  effects?: ItemEffect[]
}

/** 装备制造条目（gears 表）—— 可打造装备子集（craftable），源为 configs/equipment/equipment.json（合并后唯一装备定义） */
export interface GearMaterialEntry {
  /** 材料物品 ID（引用 items 表） */
  itemId: string
  count: number
}
export interface GearData {
  id: string
  name: string
  slot: 'weapon' | 'armor' | 'helmet' | 'boots' | 'charm' | 'ring'
  /** 子类型（轻型/中型/重型/皮甲/木甲/铠甲/护符/戒指/头盔/冠冕/靴子） */
  subType?: string
  /** 阶位（t1 凡品 ~ t5 仙品） */
  tier: 't1' | 't2' | 't3' | 't4' | 't5'
  rarity: number
  requiredLevel?: number
  stats: EquipmentStatEntry[]
  materials: GearMaterialEntry[]
  /** 制造金钱消耗 */
  cost: number
  source?: string
  description?: string
}

/** 阵营元素（elements 表）—— 单文档整体存储，固定 id：'elements' */
export interface ElementDef {
  id: string
  name: string
}
export interface ElementMatrixRow {
  attackerId: string
  defenderId: string
  coefficient: number
}
export interface ElementsData {
  id: 'elements'
  elements: ElementDef[]
  matrix: ElementMatrixRow[]
  /** 无克制关系时的默认系数（通常 1.0） */
  defaultCoefficient: number
}

/** 成长曲线（growth 表）—— 对齐规格说明书 3.8 */
export interface GrowthPerLevel {
  [attribute: string]: number
}
export interface GrowthExpEntry {
  level: number
  expRequired: number
}
export interface GrowthCurveData {
  id: string
  name: string
  perLevel: GrowthPerLevel
  expTable?: GrowthExpEntry[]
}

/** 词缀属性修正条目 —— 单个属性按百分比修正 */
export interface AffixStatModifier {
  /** 目标属性代码（ATTRIBUTE_CODE，如 attack/defense/speed/critRate） */
  attribute: string
  /** 修正百分比（20 表示 +20%，-20 表示 -20%） */
  percent: number
  /** 修正类型：缺省 PERCENTAGE（相对乘区）；对 base=0 的比率/加成型属性用 ADDITIVE（百分点） */
  type?: 'PERCENTAGE' | 'ADDITIVE'
}

/** 词缀（affixes 表）—— 敌人/角色的常驻属性标签，按档位对属性做百分比修正。
 * 词缀只做属性修正；能力型效果（吸血/反伤/格挡/中毒等）交给 Buff 系统实现，不与词缀混淆。
 * 劫数档位作用于玩家（target=player），增益档位作用于敌人自身（target=enemy）。
 * 字段对齐设计稿 v3.1：conflict_group（同组不共存）/ drop_hint（掉落倾向 UI 提示）。
 */
export interface AffixData {
  id: string
  name: string
  /** 档位（AffixTier：yao_1 / yao_2 / yao_3 / yao_4 / mandate / jie） */
  tier: AffixTier
  /** 作用目标（AffixTarget：player 劫数 / enemy 增益） */
  target: AffixTarget
  /** 允许的作用角色类型枚举（与 target 同步，供引用完整性审计契约） */
  allowed?: AffixTarget[]
  /** 属性修正列表 */
  statModifiers: AffixStatModifier[]
  /** 冲突组（同组词缀不共存；五行单体 wuxing_single / 全抗 wuxing_all） */
  conflict_group?: string
  /** 稀有度（1 普通 ~ 5 传说，用于 UI 高亮） */
  rarity?: number
  description?: string
  /** 掉落倾向提示（用于 UI 展示） */
  drop_hint?: string
}

/** 词缀库配置文件结构（configs/affixes/affixes.json，设计稿 v3.1 §12.1） */
export interface AffixLibraryData {
  affix_library_version: string
  updated_at: string
  affixes: AffixData[]
  /** 天命词缀与 BOSS 的绑定关系（boss_id → affix_id） */
  mandate_bindings: Array<{ boss_id: string; affix_id: string }>
  /** 冲突规则（conflict_group 数量上限与互斥关系） */
  conflict_rules: Array<{ group: string; max_count: number; exclusive_with?: string }>
  /** 五行抗性钳制上限（默认 80，保留 20% 克制穿透） */
  wuxing_res_cap: number
}

/** 装备词条数值区间 [min,max]（掉落/洗炼在该区间内随机） */
export interface EquipmentAffixValueRange {
  min: number
  max: number
}

/** 装备词条（equipment_affixes 表）—— 独立于封神榜敌人词缀（affixes 表，设计稿「词缀不与玩家装备词条混用」）。
 * 词条属性映射 attributes.json 现有属性代码；applicableSlots 用 slotKey 表达部位约束
 * （'*' 通配全部位 / 'weapon' 部位级 / 'weapon:轻型' 部位+子类型），装备生成词条时只能从对应 slot/subType 池抽取。 */
export interface EquipmentAffixData {
  id: string
  name: string
  /** 属性代码（必须存在于 attributes.json，由 DataIntegrityService 强校验） */
  attribute: string
  /** 修正类型（flat 固定值 / percent 百分比，对齐 EquipmentStatEntry.modifierType） */
  modifierType: 'flat' | 'percent'
  /** 数值区间，策划配置词条时必填 */
  valueRange: EquipmentAffixValueRange
  /** 适用部位 slotKey 数组 */
  applicableSlots: string[]
  /** 流派绑定（schools.json name，可选；缺省为通用词条） */
  school?: string
  /** 抽池权重（0 = 不参与随机） */
  weight: number
  /** 稀有度（1 普通 ~ 5 仙品，用于 UI 高亮） */
  rarity?: number
  description?: string
}

/** 预设阵容（lineups 表）—— 对齐 configs/lineups/lineups.json 结构。
 * 阵容本身不标阵营（我方/敌方由使用场景决定：场景引用按敌方展开，唤灵台布阵按角色类型归队）。
 */
export interface LineupRole {
  seatIndex: number
  roleId: string
}
export interface LineupData {
  id: string
  name: string
  description?: string
  /** 绑定阵型 ID（引用 formations 表） */
  formationId: string
  roles: LineupRole[]
  tags?: string[]
}

/** meta 表：全局数据版本号（单文档，固定 id：'dataVersion'） */
export interface MetaDataVersion {
  id: 'dataVersion'
  version: number
  updatedAt: string
}

/** meta 表：操作日志条目（每写操作一条） */
export type OperationKind = 'create' | 'update' | 'delete' | 'import'
export interface OperationLogEntry {
  id: string
  op: OperationKind
  table: string
  entityId: string
  entityName?: string
  timestamp: string
  detail?: string
  updatedAt: string
}

/** 战斗规则参数（params 表）—— 可调参数收拢为数据，供引擎 BattleRuleManager 消费（规格说明书 §3.10）。
 * 简单数字参数用 value（引擎数值调参）；经验/金钱结构化参数（exp_table 等）用 data，二者互斥。 */
export interface BattleParamData {
  id: string
  name: string
  value?: number
  range?: { min: number; max: number }
  /** 结构化参数数据（经验/金钱表，value 为 undefined 时使用） */
  data?: ExpTableConfig | EnemyRewardTableConfig | LevelDiffBonusConfig
  description?: string
  updatedAt: string
}

/** 玩家升级经验表（params 域，key=exp_table）—— 每个等级升至下一级所需经验 */
export interface ExpTableEntry {
  level: number
  expRequired: number
  /** 备注（仅管理用，不参与计算） */
  note?: string
}
export interface ExpTableConfig {
  id: string
  name?: string
  description?: string
  /** 玩家等级上限 */
  maxLevel: number
  entries: ExpTableEntry[]
  /** 公式提示（辅助编定，非运行时字段） */
  formulaHint?: string
}

/** 敌人经验与金钱基准表（params 域，key=enemy_reward_table）—— 按敌人等级定义基础经验与金钱区间 */
export interface EnemyRewardEntry {
  enemyLevel: number
  baseExp: number
  goldMin: number
  goldMax: number
  note?: string
}
export type RewardInterpolation = 'linear' | 'nearest'
export interface EnemyRewardTableConfig {
  id: string
  name?: string
  description?: string
  baseExpFormula?: string
  baseGoldFormula?: string
  /** 敌人角色倍率（键对齐 enemies.json role 品阶：normal/elite/guardian/minor_boss/major_boss/hidden_boss） */
  roleMultiplier: Record<string, number>
  entries: EnemyRewardEntry[]
  /** 未列出等级的插值方式：linear（线性插值）/ nearest（取最近档） */
  interpolation: RewardInterpolation
}

/** 等级差条件：0=精确相等 / [min,max]=闭区间 / "<= -5" 或 ">= 6"=半开区间 */
export type LevelDiffCondition = number | [number, number] | string
export interface LevelDiffRule {
  id: string
  label?: string
  condition: { diff: LevelDiffCondition }
  expMultiplier: number
  goldMultiplier: number
  description?: string
  note?: string
}
export interface LevelDiffBonusConfig {
  id: string
  name?: string
  description?: string
  /** 按数组顺序匹配，先匹配先生效 */
  rules: LevelDiffRule[]
  /** 无规则匹配时的兜底倍率 */
  fallbackMultiplier: number
  /** 最终倍率钳制范围 */
  clampRange: { min: number; max: number }
}

/** 西游数据域（xiyou 表）—— configs/xiyou/*.json 单文档种子，供演劫台经封神榜读取（需求说明 §5.1 方案 B） */
export interface XiyouData {
  id: string
  name: string
  description?: string
  /** 原始配置 JSON（数组或对象，演劫台侧按结构 cast 消费） */
  data: unknown
  updatedAt: string
}

/** 封神榜全表映射（表名 → 实体类型），供校验/API/界面按表取类型 */
export interface FengshenTables {
  actors: ActorData
  skills: SkillConfig
  buffs: BuffJsonEntry
  enemies: Enemy
  scenes: SceneData
  formations: FormationConfig
  lineups: LineupData
  materials: Item
  equipment: EquipmentData
  elements: ElementsData
  growth: GrowthCurveData
  affixes: AffixData
  equipment_affixes: EquipmentAffixData
  params: BattleParamData
  xiyou: XiyouData
  items: ItemData
  gears: GearData
}
export type FengshenTableName = keyof FengshenTables

/**
 * 生成下一个实体 ID：前缀 + 自增（不足 3 位补零）。
 * 现有 ID 不满足前缀规则的（如 boss_001 归入 enemies 前缀）会被忽略计数，不冲突。
 */
export function nextEntityId(existingIds: readonly string[], prefix: string): string {
  let max = 0
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}
