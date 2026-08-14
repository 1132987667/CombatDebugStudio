/**
 * seed.ts — 封神榜种子数据导入（封神榜开发计划 §3.2）
 *
 * 首次启动将 configs/ JSON 写入 IndexedDB 封神榜 store，幂等（标记 `cds:fengshen-seed-v2`）。
 * configs 仅作种子源，运行期以 IndexedDB 为唯一权威。
 *
 * 种子内容：
 * - skills/buffs/enemies/scenes/formations/lineups 直接落表；
 * - materials 剥离 3 件装备（weapon/armor/accessory）至独立 equipment 域并补全字段；
 * - actors 从 guardian_* 敌人派生（id 保持一致，供预设阵容 roleId 引用）；
 * - elements/growth/drops 为新建种子；
 * - meta 写 dataVersion（初值 1）+ 种子标记。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type {
  ActorData,
  AffixData,
  BattleParamData,
  DropGroupData,
  ElementsData,
  EquipmentAffixData,
  EquipmentData,
  GearData,
  GrowthCurveData,
  ItemData,
  LineupData,
  XiyouData,
} from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig } from '@/domain/skill/types'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import { deriveMaterials } from '@/domain/fengshen/derive-materials'
import { buffsData } from '@/shared/types/buffs-json'
import type { EffectsJsonEntry } from '@/shared/types/effects-json'
import formationsDataRaw from '@configs/formations/formations.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import equipmentDataRaw from '@configs/equipment/equipment.json'
import equipmentAffixesDataRaw from '@configs/equipment/equipment-affixes.json'
import dropsDataRaw from '@configs/drops/drops.json'
import effectsDataRaw from '@configs/effects/effects.json'
import affixesDataRaw from '@configs/affixes/affixes.json'
import xiyouRegionsJson from '@configs/xiyou/regions.json'
import xiyouScenesJson from '@configs/xiyou/scenes.json'
import xiyouSchoolsJson from '@configs/xiyou/schools.json'
import xiyouPackJson from '@configs/xiyou/pack.json'
import xiyouCultivateJson from '@configs/xiyou/cultivate.json'
import xiyouEquipJson from '@configs/xiyou/equip.json'
import xiyouMateJson from '@configs/xiyou/mate.json'
import xiyouCollectJson from '@configs/xiyou/collect.json'
import xiyouQuestJson from '@configs/xiyou/quest.json'
import xiyouCaveJson from '@configs/xiyou/cave.json'
import itemsDataRaw from '@configs/xiyou/items.json'

// NOTE: v13 — 新增装备词条库 equipment_affixes（独立于敌人词缀 affixes，词条属性映射 attributes.json、
//       部位约束 slotKey 强校验，供装备随机词条掉落/洗炼/重铸按部位抽池）。
// NOTE: v14 — cave.json 配方材料结构化：锻造配方（forgeRecipes）不再内联 materials，经 equipmentId 引用装备 JSON 权威材料；
//       forgeRecipes 补全为全部 43 件可打造装备（原仅 5 件，闭环完整）。
//       升级版本号让已 seed 的浏览器重导最新 configs。
export const SEED_FLAG_ID = 'cds:fengshen-seed-v14'

/** buffs 域统一管理 buff 定义 + effect 定义（规格说明书 3.3）——技能 steps.effectId 可引用两者 */
const buffsWithEffects = [
  ...buffsData,
  ...((effectsDataRaw as { effects: EffectsJsonEntry[] }).effects ?? []),
]

export interface SeedResult {
  imported: boolean
  reason: string
}

const nowIso = () => new Date().toISOString()

/** guardian_* 敌人派生角色：id 保持一致，faction 由 id 后缀映射，技能合并 small/passive/ultimate */
function deriveActors(enemies: Enemy[]): ActorData[] {
  const factionMap: Record<string, string> = {
    guardian_fire: 'fire',
    guardian_water: 'water',
    guardian_wood: 'wood',
    guardian_earth: 'earth',
    guardian_gold: 'metal',
  }
  return enemies
    .filter((e) => e.id.startsWith('guardian_'))
    .map((e) => {
      const stats: Record<string, number> = { ...e.stats }
      delete stats.currentHealth
      if (stats.maxHealth === undefined && e.stats.currentHealth) {
        stats.maxHealth = e.stats.currentHealth
      }
      return {
        id: e.id,
        name: e.name,
        level: e.level,
        stats,
        growth: 'growth_balanced',
        skillIds: [...(e.skills?.small ?? []), ...(e.skills?.passive ?? []), ...(e.skills?.ultimate ?? [])],
        faction: factionMap[e.id],
        energyInit: 30,
        description: `由敌人「${e.name}」派生，作为可操作角色模板。`,
      }
    })
}

function buildElements(): ElementsData {
  return {
    id: 'elements',
    elements: [
      { id: 'fire', name: '火' },
      { id: 'water', name: '水' },
      { id: 'wood', name: '木' },
      { id: 'earth', name: '土' },
      { id: 'metal', name: '金' },
    ],
    matrix: [
      { attackerId: 'fire', defenderId: 'wood', coefficient: 1.2 },
      { attackerId: 'water', defenderId: 'fire', coefficient: 1.2 },
      { attackerId: 'wood', defenderId: 'earth', coefficient: 1.2 },
      { attackerId: 'earth', defenderId: 'water', coefficient: 1.2 },
      { attackerId: 'metal', defenderId: 'wood', coefficient: 1.2 },
    ],
    defaultCoefficient: 1.0,
  }
}

/** 战斗规则参数种子（对齐 BattleRuleManager 默认配置数值，引擎经 BattleDataLoader 消费） */
function buildParams(): BattleParamData[] {
  return [
    { id: 'energy_gain_per_turn', name: '每回合能量回复', value: 15, range: { min: 0, max: 200 }, description: '战斗规则·每回合自动回复能量（combat.energyGainPerTurn）', updatedAt: nowIso() },
    { id: 'energy_gain_on_hit', name: '受击能量获取', value: 12, range: { min: 0, max: 100 }, description: '战斗规则·受到攻击获得能量（combat.energyGainOnHit）', updatedAt: nowIso() },
    { id: 'min_damage', name: '最小伤害', value: 1, range: { min: 1, max: 9999 }, description: '战斗规则·单次攻击最低伤害（combat.minDamage）', updatedAt: nowIso() },
    { id: 'max_damage', name: '最大伤害', value: 9999, range: { min: 1, max: 99999 }, description: '战斗规则·单次攻击最高伤害（combat.maxDamage）', updatedAt: nowIso() },
    { id: 'max_turns', name: '最大回合数', value: 99, range: { min: 1, max: 999 }, description: '战斗规则·固定回合上限（turnSystem.maxTurns）', updatedAt: nowIso() },
  ]
}

/** 西游数据种子：configs/xiyou/*.json 单文档导入（演劫台经封神榜读取，需求说明 §5.1 方案 B） */
function buildXiyou(): XiyouData[] {
  const now = nowIso()
  return [
    { id: 'regions', name: '区域', description: '西游·章节大地图', data: xiyouRegionsJson, updatedAt: now },
    { id: 'scenes', name: '场景', description: '西游·关卡卡片', data: xiyouScenesJson, updatedAt: now },
    { id: 'schools', name: '流派', description: '西游·三流派技能', data: xiyouSchoolsJson, updatedAt: now },
    { id: 'pack', name: '背包', description: '西游·乾坤袋/坊市/仓库', data: xiyouPackJson, updatedAt: now },
    { id: 'cultivate', name: '养成', description: '西游·境界/功法/经脉/神通', data: xiyouCultivateJson, updatedAt: now },
    { id: 'equip', name: '装备', description: '西游·装备槽/法宝/坐骑', data: xiyouEquipJson, updatedAt: now },
    { id: 'mate', name: '伙伴', description: '西游·伙伴/灵宠/缘分', data: xiyouMateJson, updatedAt: now },
    { id: 'collect', name: '图鉴', description: '西游·图鉴/成就/称号', data: xiyouCollectJson, updatedAt: now },
    { id: 'quest', name: '任务', description: '西游·任务/签到/活动', data: xiyouQuestJson, updatedAt: now },
    { id: 'cave', name: '洞府', description: '西游·炼丹/炼器/闭关/药园/百艺', data: xiyouCaveJson, updatedAt: now },
  ]
}

function buildGrowth(): GrowthCurveData[] {
  return [
    {
      id: 'growth_balanced',
      name: '均衡型',
      perLevel: { maxHealth: 60, attack: 8, defense: 4, speed: 2 },
      expTable: [
        { level: 2, expRequired: 120 },
        { level: 3, expRequired: 260 },
        { level: 4, expRequired: 420 },
      ],
    },
    {
      id: 'growth_attack',
      name: '攻击型',
      perLevel: { maxHealth: 45, attack: 12, defense: 2, speed: 3 },
      expTable: [
        { level: 2, expRequired: 140 },
        { level: 3, expRequired: 300 },
      ],
    },
    {
      id: 'growth_defense',
      name: '防御型',
      perLevel: { maxHealth: 90, attack: 4, defense: 10, speed: 1 },
      expTable: [
        { level: 2, expRequired: 110 },
        { level: 3, expRequired: 240 },
      ],
    },
    {
      id: 'growth_speed',
      name: '速度型',
      perLevel: { maxHealth: 50, attack: 6, defense: 3, speed: 5 },
      expTable: [
        { level: 2, expRequired: 130 },
        { level: 3, expRequired: 280 },
      ],
    },
  ]
}

/**
 * 执行种子导入（幂等）。
 * 底层 storage 不可用时（如无 IndexedDB 环境）由调用方容错，此处不预检。
 */
export async function seedFengshenData(storage: IPersistentStorage): Promise<SeedResult> {
  try {
    const flag = await storage.get<{ id: string; appliedAt: string }>(FENGSHEN_STORE.META, SEED_FLAG_ID)
    if (flag) {
      return { imported: false, reason: 'already-seeded' }
    }

    const config = new ConfigDataSource()
    const enemies = config.getEnemies()
    const skills = config.getSkills() as SkillConfig[]

    const tables: Array<[StorageStoreName, readonly unknown[]]> = [
      [FENGSHEN_STORE.ENEMIES, enemies],
      [FENGSHEN_STORE.SKILLS, skills],
      [FENGSHEN_STORE.SCENES, config.getScenes()],
      [FENGSHEN_STORE.BUFFS, buffsWithEffects],
      [FENGSHEN_STORE.FORMATIONS, formationsDataRaw],
      [FENGSHEN_STORE.LINEUPS, lineupsDataRaw as LineupData[]],
      [FENGSHEN_STORE.MATERIALS, deriveMaterials((itemsDataRaw as { items: ItemData[] }).items)],
      [FENGSHEN_STORE.EQUIPMENT, equipmentDataRaw as EquipmentData[]],
      [FENGSHEN_STORE.ACTORS, deriveActors(enemies)],
      [FENGSHEN_STORE.GROWTH, buildGrowth()],
      [FENGSHEN_STORE.DROPS, dropsDataRaw as DropGroupData[]],
      [FENGSHEN_STORE.AFFIXES, affixesDataRaw as AffixData[]],
      [FENGSHEN_STORE.EQUIPMENT_AFFIXES, equipmentAffixesDataRaw as EquipmentAffixData[]],
      [FENGSHEN_STORE.PARAMS, buildParams()],
      [FENGSHEN_STORE.XIYOU, buildXiyou()],
      [FENGSHEN_STORE.ITEMS, (itemsDataRaw as { items: ItemData[] }).items],
      [FENGSHEN_STORE.GEARS, (equipmentDataRaw as EquipmentData[]).filter((e) => e.craftable) as GearData[]],
    ]

    for (const [store, rows] of tables) {
      for (const row of rows) {
        const entity = row as { id: string }
        if (!entity || typeof entity.id !== 'string' || !entity.id) continue
        await storage.set(store, entity.id, { ...(row as object), updatedAt: nowIso() })
      }
    }

    // elements 单文档
    await storage.set(FENGSHEN_STORE.ELEMENTS, 'elements', { ...buildElements(), updatedAt: nowIso() })

    // meta：dataVersion 初值 1 + 种子标记
    await storage.set(FENGSHEN_STORE.META, 'dataVersion', { id: 'dataVersion', version: 1, updatedAt: nowIso() })
    await storage.set(FENGSHEN_STORE.META, SEED_FLAG_ID, { id: SEED_FLAG_ID, appliedAt: nowIso() })

    return { imported: true, reason: 'seeded' }
  } catch {
    return { imported: false, reason: 'seed-failed' }
  }
}
