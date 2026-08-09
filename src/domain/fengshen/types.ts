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
import type { Item } from '@/shared/types/Item'
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

/** 装备（equipment 表）—— 对齐规格说明书 3.6 */
export interface EquipmentStatEntry {
  attribute: string
  modifierType: 'flat' | 'percent'
  value: number
}
export interface EquipmentData {
  id: string
  name: string
  slot: 'weapon' | 'armor' | 'accessory'
  rarity: number
  stats: EquipmentStatEntry[]
  /** 穿戴等级门槛 */
  requiredLevel?: number
  /** 阵营限制（引用 elements 表） */
  factionRestriction?: string
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

/** 掉落组（drops 表）—— 对齐规格说明书 3.9 */
export interface DropEntry {
  itemId: string
  probability: number
}
export interface DropGroupData {
  id: string
  name: string
  entries: DropEntry[]
}

/** 词缀属性修正条目 —— 单个属性按百分比修正 */
export interface AffixStatModifier {
  /** 目标属性代码（ATTRIBUTE_CODE，如 attack/defense/speed/critRate） */
  attribute: string
  /** 修正百分比（20 表示 +20%，-20 表示 -20%） */
  percent: number
}

/** 词缀（affixes 表）—— 敌人/角色的常驻属性标签，按档位对属性做百分比修正。
 * 词缀只做属性修正；能力型效果（吸血/反伤/格挡/中毒等）交给 Buff 系统实现，不与词缀混淆。
 * 减益档位作用于玩家（target=player），增益档位作用于敌人自身（target=enemy）。
 */
export interface AffixData {
  id: string
  name: string
  /** 档位（AffixTier：debuff_1 / buff_1 / buff_2 / buff_3 / buff_4） */
  tier: AffixTier
  /** 作用目标（AffixTarget：player 减益 / enemy 增益） */
  target: AffixTarget
  /** 属性修正列表 */
  statModifiers: AffixStatModifier[]
  /** 稀有度（1 普通 ~ 5 传说，用于 UI 高亮） */
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
  drops: DropGroupData
  affixes: AffixData
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
