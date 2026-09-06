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
import type { Item, ItemEffect, EquipmentSlot } from '@/shared/types/Item'
import type { AffixTier, AffixTarget } from '@/shared/constants/affix'

/** 装备槽位类型（8 类标准槽位：武器/衣甲/头盔/靴子/护符/护手/法宝/神器） */
export type EquipmentSlotType = EquipmentSlot

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
  slot: EquipmentSlotType
  /** 子类型（轻型/中型/重型/皮甲/木甲/铠甲/护符/护手/头盔/冠冕/靴子） */
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
  /** 实际价值（铜钱口径；出售价 / 坊市购买价 = 价值 × 全局系数） */
  value?: number
  /** 获取来源 */
  source?: string
  /** 物品描述（材料/丹药等来自原 materials.json 的条目含描述） */
  description?: string
  /** 用途（从 description 中拆分的独立字段，如「强化一阶武器，每级提升攻击力5%」） */
  usage?: string
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
  slot: EquipmentSlotType
  /** 子类型（轻型/中型/重型/皮甲/木甲/铠甲/护符/护手/头盔/冠冕/靴子） */
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
  data?: ExpTableConfig | EnemyRewardTableConfig | LevelDiffBonusConfig | EconomyRatiosConfig
    | PlayerGrowthConfig | SystemBudgetConfig | EquipFormulaConfig | AffixRuleConfig
  description?: string
  updatedAt: string
}

/** 属性层级（对齐 §3.4 属性定义表） */
export type AttributeValueTier = 'L1' | 'L2' | 'L3' | 'L4'

/** 属性定义（attributes 表）—— 对齐 HTML「属性定义」模块，从 attributes.json 迁移 + 补策划维度字段。
 * sapMultiplier: SAP 价值倍数（12 气血 / 2 攻 / 2 防 / 2 命中 / 2 闪避 / 2 速度）。
 * valueTier: 属性层级（L1 基础 / L2 百分比 / L3 独立乘 / L4 最终乘）。
 * systems: 归属系统（等级/装备/流派/宠物/坐骑/法宝/神器）。 */
export interface AttributeDef {
  id: string
  name: string
  code: string
  isPercentage: boolean
  /** SAP 价值倍数（基础值换算） */
  sapMultiplier: number
  /** 属性层级 */
  valueTier: AttributeValueTier
  /** 归属系统（等级/装备/流派/宠物/坐骑/法宝/神器） */
  systems: string[]
  /** 分组标签（来自权威字典 attribute-dictionary：核心=基础数值/输出转化/生存对抗/状态机制/机制节奏；归档=五行元素/战斗上下文/…） */
  category?: string
  /** 是否属于 64 项「数值体系」核心字典（false = 归档/运行时，数值视图不展示） */
  numeric?: boolean
  /** 是否运行时状态（currentHealth 等，不参与配置） */
  isRuntimeState?: boolean
  description?: string
}

/** 玩家基础属性六维（对齐 attributes.json code：命中/闪避取"值"，对应 1 SAP = 12气血 = 2攻 = 2防 = 2命中 = 2闪避 = 2速度） */
export type PlayerBaseAttrCode = 'maxHealth' | 'attack' | 'defense' | 'hitValue' | 'dodgeValue' | 'speed'

/** 玩家成长配置（params 域，key=player_config）—— 对齐 PRD §19 / SAP 六维模型，策划数值体系闭环起点。
 * 每级固定成长合计 = 12 属性点（24/12 + 8/2 + 4/2 + 3/2 + 3/2 + 2/2 = 12）；每级自由点 4；
 * 满级总量 = (12 + 4) × 50 + 丹药 100 = 900。 */
export interface PlayerGrowthConfig {
  id: 'player_config'
  /** 最高等级 */
  maxLevel: number
  /** 经验公式（仅展示 + fillExpFromFormula 解析；'round(50 × L^1.35 + 60 × L)'） */
  expFormula: string
  /** 1 级基础属性 */
  base: Record<PlayerBaseAttrCode, number>
  /** 每级固定成长（合计 12 属性点，按 SAP 转化率折算） */
  growth: Record<PlayerBaseAttrCode, number>
  /** 每级自由属性点 */
  freePointsPerLevel: number
  /** 1 属性点 → 各属性数值（SAP 定义：12/2/2/2/2/2） */
  conversion: Record<PlayerBaseAttrCode, number>
  /** 丹药带来的额外属性点（计入等级总属性点） */
  pillBonusPoints: number
  /** 满级总属性点目标值（固定+自由+丹药），用于总量校验；默认 900 */
  expectedTotalSap?: number
  /** 仅预览用当前等级（不参与存储语义） */
  currentLevel?: number
}

/** 养成系统预算权重条目（对齐 §2.3 策划新表，随策划调整只改 JSON） */
export interface SystemBudgetEntry {
  system: 'level' | 'equipment' | 'school' | 'pet' | 'mount' | 'talent' | 'artifact' | 'relic'
  label: string
  /** 等级域总属性点（900 = 800 成长 + 100 丹药） */
  totalSap?: number
  /** 预算权重（等级 120 / 装备 240 / 其余 60） */
  weight: number
  note?: string
}

/** 养成系统预算（params 域，key=system_budget） */
export interface SystemBudgetConfig {
  id: 'system_budget'
  systems: SystemBudgetEntry[]
}

/** 装备品阶权重区间（对齐 PRD §21 品阶表） */
export interface EquipTierWeight { min: number; max: number }

/** 装备数值公式模板（params 域，key=equip_formula）—— §3.7 策划公式存档，随策划调整只改 JSON。
 * 单位基数 = baseSap ÷ slotCount ÷ weightPerSlot ÷ maxLevel = 900/6/3/50 = 1；
 * 属性值 = 单位基数 × 装备等级 × 属性权重 × 品阶权重 × 属性转化系数，浮动 floatRange。 */
export interface EquipFormulaConfig {
  id: 'equip_formula'
  baseSap: number
  slotCount: number
  /** 每部位权重和（核心 2 + 附加 1 = 3） */
  weightPerSlot: number
  maxLevel: number
  coreWeight: number
  affixWeight: number
  /** 浮动范围（0.5 ~ 1.1，即 50%~110%） */
  floatRange: { min: number; max: number }
  tierWeight: Record<string, EquipTierWeight>
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
  /** 敌人角色倍率（键对齐 enemies.json role 品阶：normal/elite/yaotu/yaowang/yaozun） */
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

/** 坊市经济系数（params 域，key=economy_ratios）—— 物品实际价值 → 买卖价换算（百分比口径） */
export interface EconomyRatiosConfig {
  id: string
  name?: string
  description?: string
  /** 购买系数（百分比）：坊市购买价 = 物品实际价值 × buyPercent / 100（200 = 200%） */
  buyPercent: number
  /** 出售系数（百分比）：出售价 = 物品实际价值 × sellPercent / 100（56 = 56%） */
  sellPercent: number
}

/** 装备词条投放规则（params 域，key=affix_rule）—— 定义各装备部位/子类型允许投放的属性组池 */
export interface AffixRuleConfig {
  id: 'affix_rule'
  description?: string
  /** 部位固定属性（slot → 该部位必然提供的主属性 code） */
  fixed_attributes: Record<string, string>
  /** 子类型核心属性词条系数（sub_type id → 核心属性 code + 词条系数；剑=攻击90% → { attribute, ratio }） */
  core_affix_ratio: Record<string, { attribute: string; ratio: number }>
  /** 子类型主要属性池（sub_type id → 第 1 条固定属性 + 第 2 条随机池）。
   *  random_pool 元素可为属性组码（如 `ALL-MEC`，整组展开取一）或单个属性码（如 `comboRate`）；
   *  解析时先查 attribute_groups 命中即按组展开，否则视为单属性。主要属性不含基础六维（PRD §21）。 */
  main_affix_pool?: Record<string, { fixed: string; random_pool: string[] }>
  /** 装备品阶权重（凡品/玄品/地品/天品/仙品 → [min, max]，对齐 PRD §21） */
  tier_weight: Record<string, { min: number; max: number }>
  /** 词条数值曲线（来源系统 → 属性组数值区间；属性组 = 一组属性 code + 下限/上限 {base, perLevel, full}）。
   *  base=1 级基础值，perLevel=每级成长，full=满级值（策划给表，满级约 50 级）。 */
  affix_value_curve: Record<string, Array<{
    attributes: string[]
    min: { base: number; perLevel: number; full: number }
    max: { base: number; perLevel: number; full: number }
  }>>
  attribute_groups: Record<string, {
    label: string
    side: 'ATK' | 'DEF'
    tier: string
    attributes: string[]
    names: string[]
  }>
  sub_type_groups: Record<string, {
    label: string
    sub_types: Array<{ id: string; name: string }>
  }>
  slot_side: Record<string, 'ATK' | 'DEF'>
  affix_rows: Array<{
    row: number
    name: string
    pool: Record<string, string[]>
  }>
  forbidden: Array<{
    slot: string
    slotLabel: string
    /** 限定子类型（缺省 = 整个部位生效）；存 sub_type_groups 里的中文名 */
    subType?: string
    subTypeLabel?: string
    attributes: string[]
    attributeLabels: string[]
  }>
  /** 宠物与坐骑投放规则（8.16 口径：个体驱动 + 品质门槛 1~5），缺省视为未配置 */
  pet_mount_rules?: PetMountRulesConfig
}

/** 宠物与坐骑投放行——词条位 + 品质门槛（PRD《完整项目说明》§宠物与坐骑系统，2026-09-06 裁定表） */
export interface PetMountRuleRow {
  id: string
  /** 宠物侧（ATK）行名，如 ATK-L1 */
  nameAtk: string
  /** 坐骑侧（DEF）行名，如 DEF-L1 */
  nameDef: string
  /** 品质 ≥ minQuality 才投放本行（品质 1~5） */
  minQuality: number
  /** 本行可抽属性池（属性组码，经 attribute_groups 展开）；main/trait 行缺省 */
  pool?: Record<'ATK' | 'DEF', string[]>
}

export interface PetMountRulesConfig {
  max_level: number
  /** 浮动区间（50%~110%），与装备同值但独立配置，改数互不牵连 */
  float_range: { min: number; max: number }
  /** 六维公式：单位基数 = base_sap ÷ system_count ÷ total_weight ÷ max_level（900/2/9/50 = 1） */
  formula: { base_sap: number; system_count: number; total_weight: number; main_weight_sum: number }
  /** 资质倍率 = 资质 ÷ base（400 → 1.0，cap 500 → 1.25）；捕捉范围 [min, max]，最高 cap */
  aptitude: { min: number; max: number; cap: number; base: number }
  /** 第 n 次突破需等级 level，倍率累计 1 + Σbonus（3 次共 1.6 倍） */
  breakthroughs: Array<{ level: number; bonus: number }>
  rows: PetMountRuleRow[]
}

/** 宠物/坐骑个体（configs/pets/pets.json、configs/mounts/mounts.json）—— 主要 3 条权重分布 + 特性文本 */
export interface PetMountIndividual {
  id: string
  name: string
  /** 获取场景编号（管理用，不参与反推） */
  scene: number
  /** 个体分类（如 combo，管理用） */
  category: string
  /** 主要 3 条基础属性权重（和应为 7）：宠物 attack/hit/speed，坐骑 defense/dodge/maxHealth */
  weights: Record<string, number>
  /** 特性文本（品质 3 起投放的独立被动，不参与数值反推） */
  trait: string
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
  attributes: AttributeDef
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
