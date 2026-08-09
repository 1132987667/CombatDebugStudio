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
  DropGroupData,
  ElementsData,
  EquipmentData,
  GrowthCurveData,
  LineupData,
} from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig } from '@/domain/skill/types'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import { buffsData } from '@/shared/types/buffs-json'
import type { EffectsJsonEntry } from '@/shared/types/effects-json'
import formationsDataRaw from '@configs/formations/formations.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import materialsDataRaw from '@configs/materials/materials.json'
import equipmentDataRaw from '@configs/equipment/equipment.json'
import dropsDataRaw from '@configs/drops/drops.json'
import effectsDataRaw from '@configs/effects/effects.json'
import affixesDataRaw from '@configs/affixes/affixes.json'

// NOTE: v8 — 斗战西游完善：12 核心 buff（xiyou_*）+ 玩家 3 流派技能（skill_player_xiyou）+ 
//       10 隐藏 BOSS（enemies_xiyou_hidden + skill_hidden_boss）+ 场景解锁链/地形效果/隐藏BOSS位。
//       升级版本号让已 seed 的浏览器重导最新 configs。
export const SEED_FLAG_ID = 'cds:fengshen-seed-v8'

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
      [FENGSHEN_STORE.MATERIALS, materialsDataRaw],
      [FENGSHEN_STORE.EQUIPMENT, equipmentDataRaw as EquipmentData[]],
      [FENGSHEN_STORE.ACTORS, deriveActors(enemies)],
      [FENGSHEN_STORE.GROWTH, buildGrowth()],
      [FENGSHEN_STORE.DROPS, dropsDataRaw as DropGroupData[]],
      [FENGSHEN_STORE.AFFIXES, affixesDataRaw as AffixData[]],
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
