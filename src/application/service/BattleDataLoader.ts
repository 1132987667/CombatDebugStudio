/**
 * BattleDataLoader.ts — 引擎数据预载器（封神榜开发计划 §3.4 关键路径）
 *
 * 从 IndexedDB 全量预载敌人/技能/场景/阵容/Buff/材料到内存缓存，构建 IdbDataSource 并切换
 * GameDataProcessor 引擎数据源，使战斗引擎读到封神榜最新数据。
 * Buff 定义同时注入 BuffScriptRegistry（引擎 Buff 效果配置层），消除静态双轨。
 * 失败（无数据 / 异常）返回 false，调用方保持 ConfigDataSource 兜底。
 */

import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type { IDataSource } from '@/domain/port/IDataSource'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { SkillConfig } from '@/domain/skill/types'
import type { LineupData, AffixData } from '@/domain/fengshen/types'
import type { Item } from '@/shared/types/Item'
import { normalizeBuffEntries } from '@/shared/types/effects-json'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleRuleManager, type BattleRulesConfig } from '@/domain/battle/service/BattleRuleManager'
import { BATTLE_RULE_MANAGER_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleParamData, EnemyRewardTableConfig, ExpTableConfig, LevelDiffBonusConfig, EconomyRatiosConfig } from '@/domain/fengshen/types'
import { container } from '@/infrastructure/di/Container'

/** 引擎规则参数路径映射：params 表 id → BattleRulesConfig 路径（规格说明书 §3.10 收拢引擎调参） */
const PARAM_RULE_PATHS: Record<string, { section: 'combat' | 'turnSystem'; key: string }> = {
  energy_gain_per_turn: { section: 'combat', key: 'energyGainPerTurn' },
  energy_gain_on_hit: { section: 'combat', key: 'energyGainOnHit' },
  min_damage: { section: 'combat', key: 'minDamage' },
  max_damage: { section: 'combat', key: 'maxDamage' },
  max_turns: { section: 'turnSystem', key: 'maxTurns' },
}

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

      // NOTE: buffs 表为混合格式（buffs.json + effects.json 原始条目），数据源侧归一化为 BuffJsonEntry
      const buffs = normalizeBuffEntries(await this.loadAll<{ id: string }>(FENGSHEN_STORE.BUFFS))
      const materials = await this.loadAll<Item>(FENGSHEN_STORE.MATERIALS)
      // 词缀库（affixes 表）：enemyToParticipant 按敌人 affixPool 自动应用词缀的运行时权威源
      const affixes = await this.loadAll<AffixData>(FENGSHEN_STORE.AFFIXES)

      // NOTE: params 表混合简单数字参数（BattleRuleManager 消费）与结构化经验/金钱表（按 id 提取）
      const params = await this.loadAll<BattleParamData>(FENGSHEN_STORE.PARAMS)
      const expTable = params.find((p) => p.id === 'exp_table')?.data as ExpTableConfig | undefined ?? null
      const enemyRewardTable = params.find((p) => p.id === 'enemy_reward_table')?.data as EnemyRewardTableConfig | undefined ?? null
      const levelDiffBonus = params.find((p) => p.id === 'level_diff_bonus')?.data as LevelDiffBonusConfig | undefined ?? null
      const economyRatios = params.find((p) => p.id === 'economy_ratios')?.data as EconomyRatiosConfig | undefined ?? null

      const source: IDataSource = {
        getEnemies: () => enemies,
        getSkills: () => skills,
        getScenes: () => scenes,
        getLineups: () => lineups,
        getBuffs: () => buffs,
        getMaterials: () => materials,
        getAffixes: () => affixes,
        getExpTable: () => expTable,
        getEnemyRewardTable: () => enemyRewardTable,
        getLevelDiffBonus: () => levelDiffBonus,
        getEconomyRatios: () => economyRatios,
      }
      GameDataProcessor.setDataSource(source)

      // 封神榜 buffs 表 → BuffScriptRegistry 配置层，战斗内 Buff 效果定义随之更新
      if (buffs.length > 0) {
        const registry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
        registry.replaceBuffConfigsFromArray(buffs)
      }

      // 封神榜 params 表 → BattleRuleManager 战斗规则默认值（封神榜改参数 → reload → 引擎生效）
      this.applyParams(params)
      return true
    } catch {
      return false
    }
  }

  /** 将 params 表已识别的参数应用到 BattleRuleManager（updateConfig 深度合并，未映射的 id 忽略） */
  private applyParams(params: BattleParamData[]): void {
    if (params.length === 0) return
    const combat: Record<string, number> = {}
    const turnSystem: Record<string, number> = {}
    for (const p of params) {
      const rule = PARAM_RULE_PATHS[p.id]
      if (!rule || typeof p.value !== 'number') continue
      if (rule.section === 'combat') combat[rule.key] = p.value
      else turnSystem[rule.key] = p.value
    }
    const ruleManager = container.resolve<BattleRuleManager>(BATTLE_RULE_MANAGER_TOKEN.toString())
    const cfg = ruleManager.getConfig()
    if (Object.keys(combat).length > 0) {
      cfg.rules.combat = { ...cfg.rules.combat, ...combat } as BattleRulesConfig['rules']['combat']
    }
    if (Object.keys(turnSystem).length > 0) {
      cfg.rules.turnSystem = { ...cfg.rules.turnSystem, ...turnSystem } as BattleRulesConfig['rules']['turnSystem']
    }
    ruleManager.updateConfig(cfg)
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
