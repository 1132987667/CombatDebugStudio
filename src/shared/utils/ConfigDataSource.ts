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
import enemiesDataRaw from '@configs/enemies/enemies.json'
import enemiesTestDataRaw from '@configs/enemies/enemies_test.json'
import enemiesXiyouHiddenDataRaw from '@configs/enemies/enemies_xiyou_hidden.json'
import scenesData from '@configs/scenes/scenes.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import guardianPassiveSkillsData from '@configs/skills/skill_passive_guardian.json'
import passiveTestSkillsData from '@configs/skills/skill_passive_test.json'
import skillsData from '@configs/skills/skills.json'
import playerXiyouSkillsData from '@configs/skills/skill_player_xiyou.json'
import hiddenBossSkillsData from '@configs/skills/skill_hidden_boss.json'

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

export class ConfigDataSource implements IDataSource {
  getEnemies(): Enemy[] {
    return enemies
  }

  getSkills(): SkillConfig[] {
    return skills
  }

  getScenes(): SceneData[] {
    return scenesData as SceneData[]
  }

  getLineups(): LineupData[] {
    return lineupsDataRaw as LineupData[]
  }
}
