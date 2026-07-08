/**
 ** 文件: BattleState.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗聚合工厂
 ** 描述: 提供 createDefaultBattleData 工厂函数，组装包含 ID、回合、参与者等的规范化 BattleData 聚合对象
 **/
import type { BattleData, BattleState, BattleEntity, ParticipantSide } from '@/domain/battle/types'
import { BattleStatus, RoundStatus, PARTICIPANT_SIDE } from '@/domain/battle/types'
import type { SkillManager } from '@/domain/skill/SkillManager'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export function createDefaultBattleData(
  battleId: string,
  skillManager: SkillManager,
): BattleData {
  return {
    battleId,
    participants: new Map<string, BattleEntity>(),
    actions: [],
    turnOrder: [],
    currentTurn: 0,
    currentRound: 1,
    maxTurns: 100,
    startTime: Date.now(),
    winner: undefined,
    aiInstances: new Map(),
    autoBattle: false,
    battleSpeed: 1,
    battleState: BattleStatus.CREATED,
    roundState: RoundStatus.NONE,
    skillManager,
  }
}

export function convertToBattleState(battleData: BattleData): BattleState {
  return {
    battleId: battleData.battleId,
    participants: new Map(battleData.participants),
    actions: [...battleData.actions],
    turnOrder: [...battleData.turnOrder],
    currentTurn: battleData.currentTurn,
    currentRound: battleData.currentRound || 1,
    battleState: battleData.battleState!,
    startTime: battleData.startTime,
    endTime: battleData.endTime,
    winner: battleData.winner,
  }
}

export interface BattleEndCheckResult {
  shouldEnd: boolean
  winner?: ParticipantSide
}

export function checkBattleEndCondition(
  participants: Map<string, BattleEntity>,
  currentRound: number,
  maxTurns: number,
): BattleEndCheckResult {
  const aliveCharacters = Array.from(participants.values()).filter(
    (p) => p.team === PARTICIPANT_SIDE.ALLY && p.isAlive(),
  )
  const aliveEnemies = Array.from(participants.values()).filter(
    (p) => p.team === PARTICIPANT_SIDE.ENEMY && p.isAlive(),
  )

  if (aliveCharacters.length === 0) {
    return { shouldEnd: true, winner: PARTICIPANT_SIDE.ENEMY }
  }
  if (aliveEnemies.length === 0) {
    return { shouldEnd: true, winner: PARTICIPANT_SIDE.ALLY }
  }
  if (currentRound >= maxTurns) {
    const charactersHealth = aliveCharacters.reduce(
      (sum, p) => sum + p.getAttribute(ATTRIBUTE_CODE.currentHealth) / p.getAttribute(ATTRIBUTE_CODE.maxHealth), 0,
    )
    const enemiesHealth = aliveEnemies.reduce(
      (sum, p) => sum + p.getAttribute(ATTRIBUTE_CODE.currentHealth) / p.getAttribute(ATTRIBUTE_CODE.maxHealth), 0,
    )
    const winner = charactersHealth >= enemiesHealth
      ? PARTICIPANT_SIDE.ALLY
      : PARTICIPANT_SIDE.ENEMY
    return { shouldEnd: true, winner }
  }

  return { shouldEnd: false }
}

export function isBattleActive(status: string): boolean {
  return status === BattleStatus.ACTIVE
}

export function isBattlePaused(status: string): boolean {
  return status === BattleStatus.PAUSED
}

export function isBattleEnded(status: string): boolean {
  return status === BattleStatus.ENDED
}
