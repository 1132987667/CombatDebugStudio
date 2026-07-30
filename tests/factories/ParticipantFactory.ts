import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import type { BattleParticipantInitData } from '@/domain/battle/entity/BattleParticipantImpl'
import {
  allyParticipantData,
  allyParticipantData2,
  enemyParticipantData,
  enemyParticipantData2,
  createTestParticipantsFromConfig,
} from '@tests/fixtures/participants'

export function createAllyParticipant(overrides?: Partial<BattleParticipantInitData>): BattleParticipantImpl {
  return new BattleParticipantImpl({ ...allyParticipantData, ...overrides })
}

export function createAllyParticipant2(overrides?: Partial<BattleParticipantInitData>): BattleParticipantImpl {
  return new BattleParticipantImpl({ ...allyParticipantData2, ...overrides })
}

export function createEnemyParticipant(overrides?: Partial<BattleParticipantInitData>): BattleParticipantImpl {
  return new BattleParticipantImpl({ ...enemyParticipantData, ...overrides })
}

export function createEnemyParticipant2(overrides?: Partial<BattleParticipantInitData>): BattleParticipantImpl {
  return new BattleParticipantImpl({ ...enemyParticipantData2, ...overrides })
}

export function createTestBattleParticipants() {
  return {
    allies: [createAllyParticipant(), createAllyParticipant2()],
    enemies: [createEnemyParticipant(), createEnemyParticipant2()],
  }
}

// ═══════════════════════════════════════════════
//  基于真实 JSON 配置的工厂函数（新增）
// ═══════════════════════════════════════════════

/**
 * 从真实敌人配置创建对战参与者（替代 createTestBattleParticipants）。
 * 默认阵容：guardian_fire vs guardian_gold。
 */
export function createBattleParticipantsFromConfig(
  allyIds?: string[],
  enemyIds?: string[],
) {
  return createTestParticipantsFromConfig(allyIds, enemyIds)
}
