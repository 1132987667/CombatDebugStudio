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

export interface IDataSource {
  getEnemies(): Enemy[]
  getSkills(): SkillConfig[]
  getScenes(): SceneData[]
  /** 预设阵容（lineups 表）；我方阵容引用的角色暂以 IDB 数据为准，configs 兜底为空 */
  getLineups(): LineupData[]
}
