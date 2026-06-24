import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import type { BattleParticipantInitData } from '@/domain/battle/entity/BattleParticipantImpl'
import {
  allyParticipantData,
  allyParticipantData2,
  enemyParticipantData,
  enemyParticipantData2,
} from '../fixtures/participants'

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
