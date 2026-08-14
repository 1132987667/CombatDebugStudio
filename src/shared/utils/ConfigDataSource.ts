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
import type { LineupData } from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Item } from '@/shared/types/Item'
import { buffsData } from '@/shared/types/buffs-json'
import type { EffectsJsonEntry } from '@/shared/types/effects-json'
import { normalizeBuffEntries } from '@/shared/types/effects-json'
import type { ItemData } from '@/domain/fengshen/types'
import { deriveMaterials } from '@/domain/fengshen/derive-materials'
import itemsDataRaw from '@configs/xiyou/items.json'
import enemiesDataRaw from '@configs/enemies/enemies.json'
import enemiesTestDataRaw from '@configs/enemies/enemies_test.json'
import enemiesXiyouHiddenDataRaw from '@configs/enemies/enemies_xiyou_hidden.json'
import xiyouScenesData from '@configs/xiyou/scenes.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import guardianPassiveSkillsData from '@configs/skills/skill_passive_guardian.json'
import passiveTestSkillsData from '@configs/skills/skill_passive_test.json'
import skillsData from '@configs/skills/skills.json'
import playerXiyouSkillsData from '@configs/skills/skill_player_xiyou.json'
import hiddenBossSkillsData from '@configs/skills/skill_hidden_boss.json'
import effectsDataRaw from '@configs/effects/effects.json'

const enemies = [
  ...(enemiesDataRaw as Enemy[]),
  ...(enemiesTestDataRaw as Enemy[]),
  ...(enemiesXiyouHiddenDataRaw as Enemy[]),
]

const skills = [
  ...skillsData,
  ...passiveSkillsData,
  ...guardianPassiveSkillsData,
  ...passiveTestSkillsData,
  ...(playerXiyouSkillsData as SkillConfig[]),
  ...(hiddenBossSkillsData as SkillConfig[]),
] as SkillConfig[]

/** 兜底 Buff 定义：buffs.json + effects.json 归一化（与 seed 写入 IDB 的混合格式同源） */
const buffs = normalizeBuffEntries([
  ...buffsData,
  ...((effectsDataRaw as { effects: EffectsJsonEntry[] }).effects ?? []),
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
    //       以西游关卡为唯一权威，desc 即 SceneData.background，difficulties/奖励/解锁链随关内置。
    return (xiyouScenesData as unknown as Array<{
      id: string
      name: string
      desc: string
      difficulties: SceneData['difficulties']
      requiredLevel: number
      rewards: SceneData['rewards']
      unlocks?: string
      hiddenBoss?: SceneData['hiddenBoss']
      rewardDrops?: string[]
    }>).map((s) => ({
      id: s.id,
      name: s.name,
      background: s.desc,
      difficulties: s.difficulties,
      requiredLevel: s.requiredLevel,
      rewards: s.rewards,
      ...(s.unlocks !== undefined && { unlocks: s.unlocks }),
      ...(s.hiddenBoss !== undefined && { hiddenBoss: s.hiddenBoss }),
      ...(s.rewardDrops !== undefined && { rewardDrops: s.rewardDrops }),
    }))
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
}
