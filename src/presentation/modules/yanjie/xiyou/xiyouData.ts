/**
 * 斗战西游 · 配置数据聚合层
 * NOTE: 配置数据自 configs/xiyou/*.json 导入（vite 别名 @configs），方便后续调数值；
 *       玩家运行时状态（属性/加点/货币）持有在 playerStore，本文件仅保留类型定义与配置数据。
 *       reactive 初始化自 configs（同步兜底，组件渲染不依赖异步）；
 *       loadXiyouData() 从封神榜 IDB 读取西游数据并原地更新（需求说明 §5.1 方案 B）。
 */

import caveJson from '@configs/xiyou/cave.json'
import collectJson from '@configs/xiyou/collect.json'
import cultivateJson from '@configs/xiyou/cultivate.json'
import equipmentJson from '@configs/equipment/equipment.json'
import equipJson from '@configs/xiyou/equip.json'
import itemsJson from '@configs/xiyou/items.json'
import mateJson from '@configs/xiyou/mate.json'
import packJson from '@configs/xiyou/pack.json'
import questJson from '@configs/xiyou/quest.json'
import regionsJson from '@configs/xiyou/regions.json'
import scenesJson from '@configs/xiyou/scenes.json'
import schoolsJson from '@configs/xiyou/schools.json'
import skillTreeJson from '@configs/xiyou/skill_tree.json'
import { reactive, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { EquipmentData, XiyouData } from '@/domain/fengshen/types'
import { migrateRarityField } from './quality'
import type {
  XiyouAchievement,
  XiyouCatalogItem,
  XiyouCraft,
  XiyouCrop,
  XiyouEvent,
  XiyouGardenCrop,
  XiyouItem,
  XiyouMartial,
  XiyouMate,
  XiyouMeridian,
  XiyouMount,
  XiyouNodeType,
  XiyouPet,
  XiyouQuest,
  XiyouRecipe,
  XiyouRegion,
  XiyouRetreat,
  XiyouScene,
  XiyouSchool,
  XiyouShopGood,
  XiyouSkillNode,
  XiyouSkillNodeEffect,
  XiyouSkillPoints,
  XiyouEquippedSkills,
  XiyouStorageCell,
  XiyouTreasure,
} from './types'

export const regions: XiyouRegion[] = reactive<XiyouRegion[]>(regionsJson as unknown as XiyouRegion[])
export const scenes: XiyouScene[] = reactive<XiyouScene[]>(scenesJson as unknown as XiyouScene[])

/**
 * 技能树原始节点（skill_tree.json 结构）
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
    schoolId: raw.schoolId,
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

/** 由 skill_tree.json 构建全部技能树节点（按 schoolId 挂到 schools.nodes，configs 兜底数据源） */
const SKILL_TREE_RAW = (skillTreeJson as { nodes?: XiyouSkillTreeRawNode[] }).nodes ?? []

// NOTE: schools.json 为对象包裹（{ schools: [...] }，与 cultivate/equip/mate 等一致），
//       需取内层数组——直接 cast 会让 schools 变成非数组对象，.find 等数组方法崩溃。
export const schools: XiyouSchool[] = reactive<XiyouSchool[]>(
  ((schoolsJson as unknown as { schools: XiyouSchool[] }).schools ?? []).map((s) => ({
    ...s,
    nodes: SKILL_TREE_RAW.filter((n) => n.schoolId === s.id).map(toSkillNode),
  })),
)

/** 流派技能点（v3.0：全局 60 点 = 等级 50 + 悟道丹 10，跨流派共享）
 *  NOTE: earned 初始为初始等级-1（playerConfig.initialLevel=5 → 已获得 4 点），升级/悟道丹累加 */
export const skillPoints: XiyouSkillPoints = reactive<XiyouSkillPoints>({
  max: 60,
  spent: 0,
  earned: 4,
  totalPillsUsed: 0,
})

/** 出战技能装备槽（v3.0：被动 2 / 小技能 2 / 大招 1，存节点 id，非技能配置 id） */
export const equippedSkills: XiyouEquippedSkills = reactive<XiyouEquippedSkills>({
  passive: [],
  small: [],
  ultimate: null,
})

/** 纯流派加成判定结果（equipped 技能全部来自同一流派时为其 id，否则 null；由 cultivateStore.recalcPureBonus 维护） */
export const pureSchoolBonus = ref<string | null>(null)

/** 全流派节点索引（id → 节点；skill_tree 构建后一次性建立，syncSchools 覆盖后重建） */
export const skillNodeMap: Map<string, XiyouSkillNode> = new Map()

/** 重建节点索引（初始构建 / syncSchools 覆盖后调用，保证索引指向当前节点对象） */
export function rebuildSkillNodeMap(): void {
  skillNodeMap.clear()
  for (const s of schools) {
    for (const n of s.nodes) skillNodeMap.set(n.id, n)
  }
}
rebuildSkillNodeMap()

/** 等级点数上限（等级 50） */
export const LEVEL_POINT_LIMIT = 50
/** 悟道丹点数上限（10 颗） */
export const PILL_POINT_LIMIT = 10

/** 当前可用技能点（earned - spent，>=0 兜底） */
export function availableSkillPoints(): number {
  return Math.max(0, skillPoints.earned - skillPoints.spent)
}

/** 升级获得技能点：每级 +1，等级点（earned - totalPillsUsed）上限 50 */
export function grantLevelPoint(): void {
  if (skillPoints.earned - skillPoints.totalPillsUsed >= LEVEL_POINT_LIMIT) return
  skillPoints.earned = Math.min(skillPoints.earned + 1, skillPoints.max)
}

/** 服用悟道丹获得技能点：+1 且 totalPillsUsed+1，全存档最多 PILL_POINT_LIMIT 颗 */
export function grantPillPoint(): boolean {
  if (skillPoints.totalPillsUsed >= PILL_POINT_LIMIT) return false
  if (skillPoints.earned >= skillPoints.max) return false
  skillPoints.earned += 1
  skillPoints.totalPillsUsed += 1
  return true
}

/** 纯流派判定（纯函数）：已装备技能节点全部来自同一流派 → 返回流派 id；否则 null */
export function calcPureSchool(equipped: XiyouEquippedSkills): string | null {
  const ids = [...equipped.passive, ...equipped.small, ...(equipped.ultimate ? [equipped.ultimate] : [])]
  if (ids.length === 0) return null
  const schoolsOf = new Set(ids.map((id) => skillNodeMap.get(id)?.schoolId).filter((v): v is string => !!v))
  return schoolsOf.size === 1 ? [...schoolsOf][0] : null
}

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

export const materials: XiyouItem[] = reactive<XiyouItem[]>(packJson.materials as unknown as XiyouItem[])
export const equipment: XiyouItem[] = reactive<XiyouItem[]>(packJson.equipment as unknown as XiyouItem[])
export const pills: XiyouItem[] = reactive<XiyouItem[]>(packJson.pills as unknown as XiyouItem[])
export const consumables: XiyouItem[] = reactive<XiyouItem[]>(packJson.consumables as unknown as XiyouItem[])
export const shopGoods: XiyouShopGood[] = reactive<XiyouShopGood[]>(packJson.shopGoods as unknown as XiyouShopGood[])
export const storageCells: XiyouStorageCell[] = reactive<XiyouStorageCell[]>(packJson.storageCells as unknown as XiyouStorageCell[])
export const packItems: XiyouCatalogItem[] = itemsJson.items as unknown as XiyouCatalogItem[]

export const martialArts: XiyouMartial[] = reactive<XiyouMartial[]>(cultivateJson.martialArts as unknown as XiyouMartial[])
export const meridians: XiyouMeridian[] = reactive<XiyouMeridian[]>(cultivateJson.meridians as unknown as XiyouMeridian[])

export const treasures: XiyouTreasure[] = reactive<XiyouTreasure[]>(equipJson.treasures as unknown as XiyouTreasure[])
export const mounts: XiyouMount[] = reactive<XiyouMount[]>(equipJson.mounts as unknown as XiyouMount[])

export const mates: XiyouMate[] = reactive<XiyouMate[]>(mateJson.mates as unknown as XiyouMate[])
export const pets: XiyouPet[] = reactive<XiyouPet[]>(mateJson.pets as unknown as XiyouPet[])

export const achievements: XiyouAchievement[] = reactive<XiyouAchievement[]>(collectJson.achievements as unknown as XiyouAchievement[])

export const quests: XiyouQuest[] = reactive<XiyouQuest[]>(questJson.quests as unknown as XiyouQuest[])
export const events: XiyouEvent[] = reactive<XiyouEvent[]>(questJson.events as unknown as XiyouEvent[])

/** 装备定义目录（configs/equipment/equipment.json 唯一数据源 · 锻造配方按 equipmentId 引用其材料） */
export const equipmentCatalog: EquipmentData[] = equipmentJson as unknown as EquipmentData[]

export const alchemyRecipes: XiyouRecipe[] = reactive<XiyouRecipe[]>(caveJson.alchemyRecipes as unknown as XiyouRecipe[])
export const forgeRecipes: XiyouRecipe[] = reactive<XiyouRecipe[]>(caveJson.forgeRecipes as unknown as XiyouRecipe[])
export const talismanRecipes: XiyouRecipe[] = reactive<XiyouRecipe[]>(caveJson.talismanRecipes as unknown as XiyouRecipe[])
export const gardenCrops: XiyouGardenCrop[] = reactive<XiyouGardenCrop[]>(caveJson.gardenCrops as unknown as XiyouGardenCrop[])
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
  // 节点对象已被替换，重建索引避免 skillNodeMap 指向旧对象（解锁/装备状态不同步）
  rebuildSkillNodeMap()
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
  aIn(martialArts, 'cultivate', 'martialArts')
  migrateRarity(martialArts)
  aIn(meridians, 'cultivate', 'meridians')
  aIn(treasures, 'equip', 'treasures')
  migrateRarity(treasures)
  aIn(mounts, 'equip', 'mounts')
  migrateRarity(mounts)
  aIn(mates, 'mate', 'mates')
  migrateRarity(mates)
  aIn(pets, 'mate', 'pets')
  migrateRarity(pets)
  aIn(achievements, 'collect', 'achievements')
  aIn(quests, 'quest', 'quests')
  aIn(events, 'quest', 'events')
  aIn(alchemyRecipes, 'cave', 'alchemyRecipes')
  aIn(forgeRecipes, 'cave', 'forgeRecipes')
  aIn(talismanRecipes, 'cave', 'talismanRecipes')
  aIn(gardenCrops, 'cave', 'gardenCrops')
  aIn(retreats, 'cave', 'retreats')
  aIn(crops, 'cave', 'crops')
  aIn(crafts, 'cave', 'crafts')
}
