/**
 * ConfigDataSource.ts — 静态 configs 数据源（IDataSource 兜底实现）
 *
 * 迁移自 GameDataProcessor 原有的构建时静态 import 逻辑；
 * 数据源唯一权威在 IndexedDB，本实现仅在种子导入 / 无 IDB 环境下兜底。
 */

import type { IDataSource } from '@/domain/port/IDataSource'
import type { Enemy, EnemyStats } from '@/shared/types/enemy'
import type { EnemyRole } from '@/domain/fengshen/role-grades'
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
import enemySkillsData from '@configs/xiyou/enemy-skills.json'
import enemyBuffsData from '@configs/xiyou/enemy-buffs.json'
import xiyouScenesData from '@configs/xiyou/scenes.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import yaotuPassiveSkillsData from '@configs/skills/skill_passive_yaotu.json'
import passiveTestSkillsData from '@configs/skills/skill_passive_test.json'
import passiveSchoolSkillsData from '@configs/skills/skill_passive_schools.json'
import schoolActiveSkillsData from '@configs/skills/skills_school_lianzhan.json'
import skillsData from '@configs/skills/skills.json'
import playerXiyouSkillsData from '@configs/skills/skill_player_xiyou.json'
import xiyouMinorBossSkillsData from '@configs/skills/skill_boss_minor_xiyou.json'
import effectsDataRaw from '@configs/effects/effects.json'
import affixLibraryDataRaw from '@configs/affixes/affixes.json'

/** 新结构敌人条目（enemies.json：skillIds/passiveSkillIds/drops.probability） */
export interface RawEnemyEntry {
  id: string
  name: string
  level: number
  stats: EnemyStats
  skillIds?: string[]
  passiveSkillIds?: string[]
  drops?: Array<{ itemId: string; quantity?: number; probability?: number }>
  // HACK: enemies.json 尚有 role/faction/type 等未入 Enemy 接口的原始字段，
  //       normalizeEnemy 经展开带入运行时（索引签名兜底）；接口收敛前保持开放键
  [key: string]: unknown
}

/** 归一化新结构敌人到 Enemy 标准结构：技能按 enemy-skills.json 的 skillType 分桶，掉落 probability→chance（测试夹具 loadTestData 共用） */
export function normalizeEnemy(raw: RawEnemyEntry, skillTypeById: ReadonlyMap<string, string>): Enemy {
  const passive = [...(raw.passiveSkillIds ?? [])]
  const small: string[] = []
  const ultimate: string[] = []
  for (const id of raw.skillIds ?? []) {
    const t = skillTypeById.get(id)
    if (t === 'ultimate') ultimate.push(id)
    else if (t === 'passive') passive.push(id)
    else small.push(id)
  }
  // NOTE: ...raw 保留 role/faction 等原始字段（Enemy 之外的扩展经 RawEnemyEntry 索引签名声明），
  //       覆写 drops/skills 后结构即 Enemy，双断言只为剥掉索引签名
  return {
    ...raw,
    drops: (raw.drops ?? []).map((d) => ({ itemId: d.itemId, quantity: d.quantity ?? 1, chance: d.probability ?? 1 })),
    skills: { small, passive, ultimate },
  } as unknown as Enemy
}

// NOTE: 技能类型分桶查表需覆盖全部技能文件（专用被动/学派/玩家/妖魁/enemy-skills），
//       漏源会把 passive/ultimate 错分进 small 桶
export const skillTypeById = new Map(
  [
    ...skillsData,
    ...passiveSkillsData,
    ...yaotuPassiveSkillsData,
    ...passiveTestSkillsData,
    ...passiveSchoolSkillsData,
    ...schoolActiveSkillsData,
    ...playerXiyouSkillsData,
    ...xiyouMinorBossSkillsData,
    ...enemySkillsData,
  ].map((s) => [s.id, (s as { skillType?: string }).skillType ?? 'small']),
)

// NOTE: 旧体系敌人（enemy_0NN 系 / yaotu_* 五行护法 / boss_0NN 章节守护者）已并入 enemies.json：
//       yaotu_* 是 ACTORS 派生与 TTK 断言的我方基准、唤灵台默认阵容与战斗预设引用其余 15 只，
//       数值冻结不加 role（重算跳过）；零引用的 75 只归档 configs/expired/enemies-old-expired.json。
const enemies = [
  ...(enemiesDataRaw as unknown as RawEnemyEntry[]).map((e) => normalizeEnemy(e, skillTypeById)),
]

const skills = [
  ...skillsData,
  ...passiveSkillsData,
  ...yaotuPassiveSkillsData,
  ...passiveTestSkillsData,
  ...passiveSchoolSkillsData,
  ...schoolActiveSkillsData,
  ...(playerXiyouSkillsData as SkillConfig[]),
  ...(xiyouMinorBossSkillsData as SkillConfig[]),
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
