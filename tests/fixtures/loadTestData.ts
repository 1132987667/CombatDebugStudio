/**
 * 测试数据加载器 — 从真实 JSON 配置加载数据
 *
 * 替代各测试文件中内联的 Mock 数据，确保测试与真实配置同步。
 * 所有数据为运行时只读快照，测试不应修改。
 */
import { buffsData, type BuffJsonEntry } from '@/shared/types/buffs-json'
import type { SkillConfig } from '@/domain/skill/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

// ───── Buff 配置 ─────

/** 按 ID 查找 Buff 配置 */
export function getBuffConfig(id: string): BuffJsonEntry | undefined {
  return buffsData.find((b) => b.id === id)
}

/** 获取所有 Buff 配置 */
export function getAllBuffConfigs(): readonly BuffJsonEntry[] {
  return buffsData
}

/** 按分类筛选 Buff 配置 */
export function getBuffConfigsByCategory(category: string): BuffJsonEntry[] {
  return buffsData.filter((b) => b.category === category)
}

// ───── 技能配置 ─────

/** 按 ID 查找技能配置 */
export function getSkillConfig(id: string): SkillConfig | undefined {
  return GameDataProcessor.getSkillsData().find((s) => s.id === id)
}

/** 获取所有主动技能配置 */
export function getActiveSkills(): SkillConfig[] {
  return GameDataProcessor.getSkillsData().filter(
    (s) => s.skillType !== 'passive',
  )
}

/** 获取所有被动技能配置 */
export function getPassiveSkills(): SkillConfig[] {
  return GameDataProcessor.getSkillsData().filter(
    (s) => s.skillType === 'passive',
  )
}

// ───── 敌人配置 ─────

import type { Enemy } from '@/shared/types/enemy'
import enemiesDataRaw from '@configs/enemies/enemies.json'
import enemiesTestDataRaw from '@configs/enemies/enemies_test.json'

// 与 GameDataProcessor 保持同一合并口径：正式敌人 + 测试敌人
const enemiesData = [
  ...(enemiesDataRaw as Enemy[]),
  ...(enemiesTestDataRaw as Enemy[]),
] as Enemy[]

/** 按 ID 查找敌人配置 */
export function getEnemyConfig(id: string): Enemy | undefined {
  return enemiesData.find((e) => e.id === id) as Enemy | undefined
}

/** 获取所有敌人配置 */
export function getAllEnemyConfigs(): Enemy[] {
  return enemiesData as Enemy[]
}
