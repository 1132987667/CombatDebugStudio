import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BattleLogEntry, BattleLogCategory, BattleLogLevel } from '@/types/battle-log'
import type { BattleSystemAction, BattleState } from '@/types/battle'
import { BattleLogFormatter, battleLogManager } from '@/utils/logging'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import { PARTICIPANT_SIDE } from '@/types/battle'

interface LogFilters {
  showAllyActions: boolean
  showEnemyActions: boolean
  showSystemMessages: boolean
  showDamage: boolean
  showHealing: boolean
  showBuffs: boolean
}

let hasBoundBattleLogListener = false

export const useBattleLogStore = defineStore('battleLog', () => {
  const logs = ref<BattleLogEntry[]>([])
  const processedActionIds = ref<Set<string>>(new Set())
  const filters = ref<LogFilters>({
    showAllyActions: true,
    showEnemyActions: true,
    showSystemMessages: true,
    showDamage: true,
    showHealing: true,
    showBuffs: true
  })

  const getLogs = computed(() => logs.value)

  const filteredLogs = computed(() => {
    return logs.value.filter(log => {
      const category = log.category

      if (category === 'system' && !filters.value.showSystemMessages) {
        return false
      }
      if (category === 'action' && log.source !== '系统' && !log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.value.showAllyActions) {
        return false
      }
      if (category === 'action' && log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.value.showEnemyActions) {
        return false
      }
      if (!filters.value.showDamage && category === 'damage') {
        return false
      }
      if (!filters.value.showHealing && category === 'heal') {
        return false
      }
      if (!filters.value.showBuffs && category === 'status') {
        return false
      }
      return true
    })
  })

  const logCount = computed(() => logs.value.length)

  function syncLogsFromManager() {
    logs.value = battleLogManager.getAllLogs()
  }

  function ensureLogBinding() {
    if (hasBoundBattleLogListener) {
      return
    }

    battleLogManager.addListener((nextLogs) => {
      logs.value = [...nextLogs]
    })

    hasBoundBattleLogListener = true
  }

  function addLog(log: BattleLogEntry) {
    battleLogManager.addLog(
      String(log.turn),
      log.source,
      log.action,
      log.target,
      log.result,
      log.category,
      log.level,
      log.htmlResult,
    )
  }

  function addSystemLog(message: string) {
    battleLogManager.addSystemLog(message, 'info')
  }

  function addErrorLog(message: string) {
    battleLogManager.addErrorLog(message)
  }

  function addWarningLog(message: string) {
    battleLogManager.addSystemBattleLog(message, 'warning')
  }

  function addDebugLog(message: string) {
    battleLogManager.addSystemBattleLog(message, 'debug')
  }

  function addSystemBattleLog(message: string, level: BattleLogLevel = 'info') {
    battleLogManager.addSystemBattleLog(message, level)
  }

  function addActionLog(source: string, action: string, target: string, result: string) {
    battleLogManager.addActionLog(source, action, target, result, 'info')
  }

  function clearLogs() {
    battleLogManager.clearLogs()
    logs.value = []
    processedActionIds.value.clear()
  }

  function updateFilters(newFilters: Partial<LogFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  async function parseBattleAction(action: BattleSystemAction, battleState: BattleState): Promise<{ log: BattleLogEntry | null; shouldDisplay: boolean }> {
    if (processedActionIds.value.has(action.id)) {
      return { log: null, shouldDisplay: false }
    }
    processedActionIds.value.add(action.id)

    let sourceName = action.sourceId
    let targetName = action.targetId

    if (action.sourceId === 'system') {
      sourceName = '系统'
    } else {
      const sourceParticipant = battleState.participants.get(action.sourceId)
      if (sourceParticipant) {
        sourceName = sourceParticipant.name
      }
    }

    if (action.targetId === 'system') {
      targetName = ''
    } else {
      const targetParticipant = battleState.participants.get(action.targetId)
      if (targetParticipant) {
        targetName = targetParticipant.name
      }
    }

    const sourceIsAlly = !action.sourceId.includes(PARTICIPANT_SIDE.ENEMY) && action.sourceId !== 'system'
    const targetIsAlly = action.targetId && !action.targetId.includes(PARTICIPANT_SIDE.ENEMY) && action.targetId !== 'system'

    const turn = action.turn || 1
    const options = {
      turn,
      source: sourceName,
      target: targetName,
      damage: action.damage,
      heal: action.heal,
      skillName: await getSkillName(action.skillId) || '',
      damageType: '物理',
      sourceIsAlly,
      targetIsAlly
    }

    let actionType: 'normal_attack' | 'battle_start' | 'battle_end' | 'heal_skill' | 'skill_attack' = 'normal_attack'
    let logCategory: BattleLogCategory = 'action'

    if (action.sourceId === 'system') {
      if (action.effects?.some(e => e.description.includes('战斗开始'))) {
        actionType = 'battle_start'
        logCategory = 'system'
        const match = action.effects[0].description.match(/参战角色: (\d+) 人，参战敌人: (\d+) 人/)
        if (match) {
          options.source = match[1]
          options.target = match[2]
        }
      } else if (action.effects?.some(e => e.description.includes('战斗结束'))) {
        actionType = 'battle_end'
        logCategory = 'system'
        const match = action.effects[0].description.match(/胜利者: (.+)/)
        if (match) {
          options.source = match[1] === '角色方' ? '我方' : '敌方'
        }
      }
    } else if (action.type === 'skill') {
      if (action.heal && action.heal > 0) {
        actionType = 'heal_skill'
      } else if (action.damage && action.damage > 0) {
        actionType = 'skill_attack'
      }
    }

    const formattedLog = BattleLogFormatter.createBattleLogHTML(actionType, options, logCategory)

    const fullLog: BattleLogEntry = {
      turn: formattedLog.turn,
      source: sourceName,
      action: '对',
      target: targetName,
      result: formattedLog.htmlResult || '',
      level: formattedLog.level,
      category: formattedLog.category,
      htmlResult: formattedLog.htmlResult
    }

    const shouldDisplay = shouldDisplayLog(fullLog)

    return { log: fullLog, shouldDisplay }
  }

  function shouldDisplayLog(log: BattleLogEntry): boolean {
    const category = log.category

    const isLogExists = logs.value.some(
      (existingLog) =>
        existingLog.turn === log.turn &&
        existingLog.htmlResult === log.htmlResult
    )

    if (isLogExists) {
      return false
    }

    if (category === 'system' && !filters.value.showSystemMessages) {
      return false
    }

    if (category === 'action' && log.source !== '系统' && !log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.value.showAllyActions) {
      return false
    }

    if (category === 'action' && log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.value.showEnemyActions) {
      return false
    }

    if (!filters.value.showDamage && category === 'damage') {
      return false
    }

    if (!filters.value.showHealing && category === 'heal') {
      return false
    }

    if (!filters.value.showBuffs && category === 'status') {
      return false
    }

    return true
  }

  async function syncBattleLogs(battleState: BattleState) {
    const sortedActions = [...battleState.actions].sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp
      }
      const turnA = a.turn || 0
      const turnB = b.turn || 0
      if (turnA !== turnB) {
        return turnA - turnB
      }
      return a.id.localeCompare(b.id)
    })

    for (const action of sortedActions) {
      const { log, shouldDisplay } = await parseBattleAction(action, battleState)

      if (!shouldDisplay || !log) {
        continue
      }

      addLog({
        turn: log.turn,
        source: log.source,
        action: log.action,
        target: log.target,
        result: log.result || '',
        level: log.level,
        category: log.category,
        htmlResult: log.htmlResult
      })
    }
  }

  async function getSkillName(skillId: string | undefined): Promise<string> {
    if (!skillId) return ''
    const skill = GameDataProcessor.findSkillById(skillId)
    if (skill?.name) {
      return skill.name
    }
    return '未知技能'
  }

  ensureLogBinding()
  syncLogsFromManager()

  return {
    logs,
    filters,
    getLogs,
    filteredLogs,
    logCount,
    addLog,
    addSystemLog,
    addErrorLog,
    addWarningLog,
    addDebugLog,
    addSystemBattleLog,
    addActionLog,
    clearLogs,
    updateFilters,
    parseBattleAction,
    syncBattleLogs
  }
})
