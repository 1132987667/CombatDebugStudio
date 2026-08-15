/**
 * IDataSource.ts — 战斗引擎数据源端口（封神榜开发计划 §3.4）
 *
 * 引擎为同步架构，读取由 GameDataProcessor 出口提供；该出口的数据来源可切换：
 * - ConfigDataSource：静态 import configs（种子来源，兜底）；
 * - IdbDataSource：启动时由 BattleDataLoader 从 IndexedDB 预载的内存缓存（运行期权威源）。
 */

import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { SkillConfig } from '@/domain/skill/types'
import type { LineupData } from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Item } from '@/shared/types/Item'
import type { ExpTableConfig, EnemyRewardTableConfig, LevelDiffBonusConfig } from '@/domain/fengshen/types'

export interface IDataSource {
  getEnemies(): Enemy[]
  getSkills(): SkillConfig[]
  getScenes(): SceneData[]
  /** 预设阵容（lineups 表）；我方阵容引用的角色暂以 IDB 数据为准，configs 兜底为空 */
  getLineups(): LineupData[]
  /** Buff 定义（统一 BuffJsonEntry 格式；数据源侧完成 effects 条目归一化） */
  getBuffs(): BuffJsonEntry[]
  /** 材料（materials 表，图鉴等消费方读取） */
  getMaterials(): Item[]

  // ===== 经验与金钱（params 域结构化表；数据源不存在时返回 null，引擎回退默认值） =====
  getExpTable(): ExpTableConfig | null
  getEnemyRewardTable(): EnemyRewardTableConfig | null
  getLevelDiffBonus(): LevelDiffBonusConfig | null
}
