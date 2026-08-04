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
 * - elements/growth/drops/params 为新建种子；
 * - meta 写 dataVersion（初值 1）+ 种子标记。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type {
  ActorData,
  BattleParamData,
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
import effectsDataRaw from '@configs/effects/effects.json'

export const SEED_FLAG_ID = 'cds:fengshen-seed-v2'

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

/** 从 materials 剥离装备条目，并补全 slot/stats/requiredLevel */
function splitMaterials(): { materials: unknown[]; equipment: EquipmentData[] } {
  const materials: unknown[] = []
  const equipment: EquipmentData[] = []
  for (const raw of materialsDataRaw as Array<Record<string, unknown>>) {
    if (raw.type === 'equipment') {
      const id = String(raw.id)
      const statsRaw = (raw.stats ?? {}) as Record<string, number>
      equipment.push({
        id,
        name: String(raw.name),
        slot: String(raw.slot) as EquipmentData['slot'],
        rarity: Number(raw.rarity ?? 1),
        stats: Object.entries(statsRaw).map(([attribute, value]) => ({
          attribute,
          modifierType: 'flat',
          value: Number(value),
        })),
        requiredLevel: 1,
        description: String(raw.description ?? ''),
      })
    } else {
      materials.push(raw)
    }
  }
  return { materials, equipment }
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
      perLevel: { maxHealth: 60, minAttack: 8, maxAttack: 8, defense: 4, speed: 2 },
      expTable: [
        { level: 2, expRequired: 120 },
        { level: 3, expRequired: 260 },
        { level: 4, expRequired: 420 },
      ],
    },
    {
      id: 'growth_attack',
      name: '攻击型',
      perLevel: { maxHealth: 45, minAttack: 12, maxAttack: 12, defense: 2, speed: 3 },
      expTable: [
        { level: 2, expRequired: 140 },
        { level: 3, expRequired: 300 },
      ],
    },
    {
      id: 'growth_defense',
      name: '防御型',
      perLevel: { maxHealth: 90, minAttack: 4, maxAttack: 4, defense: 10, speed: 1 },
      expTable: [
        { level: 2, expRequired: 110 },
        { level: 3, expRequired: 240 },
      ],
    },
    {
      id: 'growth_speed',
      name: '速度型',
      perLevel: { maxHealth: 50, minAttack: 6, maxAttack: 6, defense: 3, speed: 5 },
      expTable: [
        { level: 2, expRequired: 130 },
        { level: 3, expRequired: 280 },
      ],
    },
  ]
}

function buildDrops(): DropGroupData[] {
  return [
    {
      id: 'drop_flora',
      name: '花草系掉落',
      entries: [
        { itemId: 'mat_001', probability: 80 },
        { itemId: 'mat_003', probability: 60 },
      ],
    },
    {
      id: 'drop_boss',
      name: '首领掉落',
      entries: [
        { itemId: 'mat_004', probability: 30 },
        { itemId: 'elix_003', probability: 50 },
      ],
    },
  ]
}

function buildParams(): BattleParamData[] {
  return [
    { id: 'damage_multiplier', name: '伤害倍率', value: 1.0, range: { min: 0.1, max: 5.0 }, description: '全局伤害修正' },
    { id: 'crit_chance', name: '暴击概率', value: 10, range: { min: 0, max: 100 }, description: '基础暴击率（%）' },
    { id: 'max_buffs_per_character', name: 'Buff 上限', value: 20, range: { min: 1, max: 99 }, description: '单角色最大 Buff 数' },
    { id: 'default_cooldown', name: '默认冷却', value: 2, range: { min: 0, max: 20 }, description: '未指定冷却时的兜底' },
    { id: 'stack_multiplier', name: '叠加衰减', value: 0.8, range: { min: 0.1, max: 1.0 }, description: 'Buff 叠加效果衰减系数' },
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
    const { materials, equipment } = splitMaterials()

    const tables: Array<[StorageStoreName, readonly unknown[]]> = [
      [FENGSHEN_STORE.ENEMIES, enemies],
      [FENGSHEN_STORE.SKILLS, skills],
      [FENGSHEN_STORE.SCENES, config.getScenes()],
      [FENGSHEN_STORE.BUFFS, buffsWithEffects],
      [FENGSHEN_STORE.FORMATIONS, formationsDataRaw],
      [FENGSHEN_STORE.LINEUPS, lineupsDataRaw as LineupData[]],
      [FENGSHEN_STORE.MATERIALS, materials],
      [FENGSHEN_STORE.EQUIPMENT, equipment],
      [FENGSHEN_STORE.ACTORS, deriveActors(enemies)],
      [FENGSHEN_STORE.GROWTH, buildGrowth()],
      [FENGSHEN_STORE.DROPS, buildDrops()],
      [FENGSHEN_STORE.PARAMS, buildParams()],
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
