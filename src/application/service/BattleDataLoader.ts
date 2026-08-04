/**
 * BattleDataLoader.ts — 引擎数据预载器（封神榜开发计划 §3.4 关键路径）
 *
 * 从 IndexedDB 全量预载敌人/技能/场景到内存缓存，构建 IdbDataSource 并切换
 * GameDataProcessor 引擎数据源，使战斗引擎读到封神榜最新数据。
 * 失败（无数据 / 异常）返回 false，调用方保持 ConfigDataSource 兜底。
 */

import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type { IDataSource } from '@/domain/port/IDataSource'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { SkillConfig } from '@/domain/skill/types'
import type { LineupData } from '@/domain/fengshen/types'

export class BattleDataLoader {
  constructor(private readonly storage: IPersistentStorage) {}

  /** 从 IDB 载入引擎所需数据并切换到 IdbDataSource；失败回退 ConfigDataSource */
  async reload(): Promise<boolean> {
    try {
      const enemies = await this.loadAll<Enemy>(FENGSHEN_STORE.ENEMIES)
      const skills = await this.loadAll<SkillConfig>(FENGSHEN_STORE.SKILLS)
      const scenes = await this.loadAll<SceneData>(FENGSHEN_STORE.SCENES)
      const lineups = await this.loadAll<LineupData>(FENGSHEN_STORE.LINEUPS)
      if (enemies.length === 0 || skills.length === 0) return false

      const source: IDataSource = {
        getEnemies: () => enemies,
        getSkills: () => skills,
        getScenes: () => scenes,
        getLineups: () => lineups,
      }
      GameDataProcessor.setDataSource(source)
      return true
    } catch {
      return false
    }
  }

  private async loadAll<T extends { id: string }>(store: StorageStoreName): Promise<T[]> {
    const keys = await this.storage.keys(store)
    const out: T[] = []
    for (const key of keys) {
      const rec = await this.storage.get<T>(store, key)
      if (rec) out.push(rec)
    }
    return out
  }
}
