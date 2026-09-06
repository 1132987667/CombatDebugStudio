/**
 * ConfigDataSource.ts — 静态 configs 数据源（IDataSource 兜底实现）
 *
 * 迁移自 GameDataProcessor 原有的构建时静态 import 逻辑；
 * 数据源唯一权威在 IndexedDB，本实现仅在种子导入 / 无 IDB 环境下兜底。
 */

import type { IDataSource } from '@/domain/port/IDataSource'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { SkillConfig } from '@/domain/skill/types'
import type { LineupData, AffixData, AffixLibraryData, EconomyRatiosConfig } from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Item } from '@/shared/types/Item'
import type { ExpTableConfig, EnemyRewardTableConfig, LevelDiffBonusConfig } from '@/domain/fengshen/types'
import { buffsData } from '@/shared/types/buffs-json'
import type { EffectsJsonEntry } from '@/shared/types/effects-json'
import { normalizeBuffEntries } from '@/shared/types/effects-json'
import type { ItemData } from '@/domain/fengshen/types'
import { deriveMaterials } from '@/domain/fengshen/derive-materials'
import itemsDataRaw from '@configs/xiyou/items.json'
import enemiesDataRaw from '@configs/enemies/enemies.json'
import bossesJson from '@configs/xiyou/bosses.json'
import enemiesTestDataRaw from '@configs/enemies/enemies_test.json'
import enemiesXiyouHiddenDataRaw from '@configs/enemies/enemies_xiyou_hidden.json'
import enemiesOldDataRaw from '@configs/enemies/enemies-old.json'
import enemySkillsData from '@configs/xiyou/enemy-skills.json'
import enemyBuffsData from '@configs/xiyou/enemy-buffs.json'
import xiyouScenesData from '@configs/xiyou/scenes.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import yaotuPassiveSkillsData from '@configs/skills/skill_passive_yaotu.json'
import passiveTestSkillsData from '@configs/skills/skill_passive_test.json'
import passiveSchoolSkillsData from '@configs/skills/skill_passive_schools.json'
import skillsData from '@configs/skills/skills.json'
import playerXiyouSkillsData from '@configs/skills/skill_player_xiyou.json'
import hiddenBossSkillsData from '@configs/skills/skill_yaozun.json'
import effectsDataRaw from '@configs/effects/effects.json'
import affixLibraryDataRaw from '@configs/affixes/affixes.json'

/** 新结构敌人条目（enemies.json：skillIds/passiveSkillIds/drops.probability） */
interface RawEnemyEntry {
  id: string
  name: string
  level: number
  stats: Record<string, number>
  skillIds?: string[]
  passiveSkillIds?: string[]
  drops?: Array<{ itemId: string; probability?: number }>
  [key: string]: unknown
}

/** 归一化新结构敌人到 Enemy 标准结构：技能按 enemy-skills.json 的 skillType 分桶，掉落 probability→chance */
function normalizeEnemy(raw: RawEnemyEntry, skillTypeById: ReadonlyMap<string, string>): Enemy {
  const passive = [...(raw.passiveSkillIds ?? [])]
  const small: string[] = []
  const ultimate: string[] = []
  for (const id of raw.skillIds ?? []) {
    const t = skillTypeById.get(id)
    if (t === 'ultimate') ultimate.push(id)
    else if (t === 'passive') passive.push(id)
    else small.push(id)
  }
  return {
    ...raw,
    drops: (raw.drops ?? []).map((d) => ({ itemId: d.itemId, quantity: 1, chance: d.probability ?? 1 })),
    skills: { small, passive, ultimate },
  } as unknown as Enemy
}

const skillTypeById = new Map(
  (enemySkillsData as Array<{ id: string; skillType?: string }>).map((s) => [s.id, s.skillType ?? 'small']),
)

/** bosses.json 重型 BOSS 条目（设计稿结构：内联文本技能 / 对象掉落 / 缺角色字段） */
interface BossRow {
  id?: string
  name?: string
  level?: number
  type?: string
  stats?: Record<string, number>
  affixPool?: { buffTier?: number }
  drops?: { guaranteed?: string[]; rare?: string[] }
}

/** 把 bosses.json 的 major BOSS 条目转成引擎 Enemy（技能引用 enemy-skills.json 现有可执行定义；数值以 bosses.json 为准） */
function bossToEnemy(b: BossRow): Enemy | null {
  if (!b.id || b.type !== 'major') return null
  const name = b.id.replace('boss_major_', '')
  const guaranteed = b.drops?.guaranteed ?? []
  const rare = b.drops?.rare ?? []
  return {
    id: b.id,
    name: b.name ?? b.id,
    level: b.level ?? 1,
    stats: {
      ...(b.stats ?? {}),
      hit: b.stats?.hit ?? 30,
      dodge: b.stats?.dodge ?? 15,
      maxEnergy: b.stats?.maxEnergy ?? 150,
      energyInit: b.stats?.energyInit ?? 25,
    },
    skills: {
      small: [`skill_boss_major_${name}_s1`, `skill_boss_major_${name}_s2`],
      passive: [`passive_boss_major_${name}_p1`],
      ultimate: [`skill_boss_major_${name}_ult`],
    },
    drops: [
      ...guaranteed.map((itemId) => ({ itemId, quantity: 1, chance: 1 })),
      ...rare.map((itemId) => ({ itemId, quantity: 1, chance: 0.3 })),
    ],
    affixPool: { buffTier: b.affixPool?.buffTier ?? 1, count: 1 },
  }
}

// NOTE: 旧敌人体系（enemy_001 系 / yaotu_* 五行护法）归档于 enemies-old.json，
//       seed 的 deriveActors 依赖 yaotu_* 派生 actors、lineups 引用旧敌人 id，故兜底数据源一并加载。
// NOTE: 5 大场景 BOSS 定义收敛到 bosses.json（权威），此处并入供封神榜敌人表/健康检查一致性。
const enemies = [
  ...(enemiesDataRaw as unknown as RawEnemyEntry[]).map((e) => normalizeEnemy(e, skillTypeById)),
  ...(bossesJson as unknown as BossRow[]).map(bossToEnemy).filter((e): e is Enemy => !!e),
  ...(enemiesTestDataRaw as Enemy[]),
  ...(enemiesXiyouHiddenDataRaw as Enemy[]),
  ...(enemiesOldDataRaw as Enemy[]),
]

const skills = [
  ...skillsData,
  ...passiveSkillsData,
  ...yaotuPassiveSkillsData,
  ...passiveTestSkillsData,
  ...passiveSchoolSkillsData,
  ...(playerXiyouSkillsData as SkillConfig[]),
  ...(hiddenBossSkillsData as SkillConfig[]),
  ...(enemySkillsData as SkillConfig[]),
] as SkillConfig[]

/** 兜底 Buff 定义：buffs.json + effects.json + enemy-buffs.json 归一化（与 seed 写入 IDB 的混合格式同源） */
const buffs = normalizeBuffEntries([
  ...buffsData,
  ...((effectsDataRaw as { effects: EffectsJsonEntry[] }).effects ?? []),
  ...(enemyBuffsData as BuffJsonEntry[]),
])

/** 材料域兜底数据：从物品主键索引（items 表）派生（materials.json 已合并入 items.json） */
const materials = deriveMaterials((itemsDataRaw as { items: ItemData[] }).items)

export class ConfigDataSource implements IDataSource {
  getEnemies(): Enemy[] {
    return enemies
  }

  getSkills(): SkillConfig[] {
    return skills
  }

  getScenes(): SceneData[] {
    // NOTE: 场景数据已合并至 xiyou/scenes.json（L4 合并 scenes.json 与 xiyou/scenes.json）：
    //       以西游关卡为唯一权威。新结构为 25 关平铺（enemies + yaotu），
    //       SceneData 已对齐该结构，此处直接透传。
    return xiyouScenesData as unknown as SceneData[]
  }

  getLineups(): LineupData[] {
    return lineupsDataRaw as LineupData[]
  }

  getBuffs(): BuffJsonEntry[] {
    return buffs
  }

  getMaterials(): Item[] {
    return materials
  }

  getAffixes(): AffixData[] {
    return (affixLibraryDataRaw as AffixLibraryData).affixes
  }

  // NOTE: 经验/金钱三表以 IDB params 域为权威，configs 无兜底数据（引擎无 IDB 时按默认规则运行）
  getExpTable(): ExpTableConfig | null {
    return null
  }

  getEnemyRewardTable(): EnemyRewardTableConfig | null {
    return null
  }

  getLevelDiffBonus(): LevelDiffBonusConfig | null {
    return null
  }

  getEconomyRatios(): EconomyRatiosConfig | null {
    return null
  }
}
