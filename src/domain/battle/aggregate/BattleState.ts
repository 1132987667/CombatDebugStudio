/**
 ** 文件: BattleState.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗聚合工厂
 ** 描述: 提供 createDefaultBattleData 工厂函数，组装包含 ID、回合、参与者等的规范化 BattleData 聚合对象
 **/
import type { BattleData, BattleState } from '@/domain/battle/type/types'
import { BattleStatus, RoundStatus, BATTLE_CONSTANTS } from '@/domain/battle/type/types'
import type { SkillManager } from '@/domain/skill/SkillManager'

export function createDefaultBattleData(
  battleId: string,
  skillManager: SkillManager,
): BattleData {
  return {
    battleId,
    participants: new Map(), // ponytail: 类型由 BattleData 接口推断
    actions: [],
    turnOrder: [],
    currentTurn: 0,
    maxTurns: BATTLE_CONSTANTS.DEFAULT_MAX_TURNS,
    startTime: Date.now(),
    winner: undefined,
    aiInstances: new Map(),
    autoBattle: false,
    battleSpeed: 1,
    battleState: BattleStatus.CREATED,
    roundState: RoundStatus.NONE,
    skillManager,
    quickMode: false,
    headless: false,
  }
}

export function convertToBattleState(battleData: BattleData): BattleState {
  return {
    battleId: battleData.battleId,
    participants: new Map(battleData.participants),
    actions: [...battleData.actions],
    turnOrder: [...battleData.turnOrder],
    currentTurn: battleData.currentTurn,
    battleState: battleData.battleState!,
    startTime: battleData.startTime,
    endTime: battleData.endTime,
    winner: battleData.winner,
  }
}

