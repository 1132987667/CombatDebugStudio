import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BattleLogEntry } from '@/types/battle-log'
import type { BattleSystemAction, BattleState } from '@/types/battle'
import { BattleLogFormatter } from '@/utils/logging'
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

const MAX_LOG_COUNT = 100

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
      if (log.level === 'info' && !filters.value.showSystemMessages) {
        return false
      }
      if (log.level === PARTICIPANT_SIDE.ALLY && !filters.value.showAllyActions) {
        return false
      }
      if (log.level === PARTICIPANT_SIDE.ENEMY && !filters.value.showEnemyActions) {
        return false
      }
      const resultLower = (log.result || '').toLowerCase()
      if (!filters.value.showDamage && resultLower.includes('伤害')) {
        return false
      }
      if (!filters.value.showHealing && resultLower.includes('治疗')) {
        return false
      }
      if (!filters.value.showBuffs && (resultLower.includes('增益') || resultLower.includes('减益'))) {
        return false
      }
      return true
    })
  })

  const logCount = computed(() => logs.value.length)

  function addLog(log: BattleLogEntry) {
    logs.value.push(log)
    if (logs.value.length > MAX_LOG_COUNT) {
      logs.value.shift()
    }
  }

  function addSystemLog(message: string) {
    addLog({
      turn: 0,
      source: '系统',
      action: '消息',
      target: '',
      result: message,
      level: 'info',
      htmlResult: message
    })
  }

  function addErrorLog(message: string) {
    addLog({
      turn: 0,
      source: '系统',
      action: '错误',
      target: '',
      result: message,
      level: 'error',
      htmlResult: message
    })
  }

  function addWarningLog(message: string) {
    addLog({
      turn: 0,
      source: '系统',
      action: '警告',
      target: '',
      result: message,
      level: 'warning',
      htmlResult: message
    })
  }

  function addDebugLog(message: string) {
    addLog({
      turn: 0,
      source: '系统',
      action: '调试',
      target: '',
      result: message,
      level: 'debug',
      htmlResult: message
    })
  }

  function addSystemBattleLog(message: string, level: string = 'info') {
    addLog({
      turn: 0,
      source: '系统',
      action: '战斗',
      target: '',
      result: message,
      level: level,
      htmlResult: message
    })
  }

  function addActionLog(source: string, action: string, target: string, result: string) {
    addLog({
      turn: 0,
      source,
      action,
      target,
      result,
      level: 'action',
      htmlResult: result
    })
  }

  function clearLogs() {
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

    let actionType = 'normal_attack'
    let logLevel: string = action.sourceId.includes(PARTICIPANT_SIDE.ENEMY) ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY

    if (action.sourceId === 'system') {
      if (action.effects?.some(e => e.description.includes('战斗开始'))) {
        actionType = 'battle_start'
        logLevel = 'info'
        const match = action.effects[0].description.match(/参战角色: (\d+) 人，参战敌人: (\d+) 人/)
        if (match) {
          options.source = match[1]
          options.target = match[2]
        }
      } else if (action.effects?.some(e => e.description.includes('战斗结束'))) {
        actionType = 'battle_end'
        logLevel = 'info'
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

    const formattedLog = BattleLogFormatter.createBattleLogHTML(actionType, options, logLevel)

    const fullLog: BattleLogEntry = {
      turn: formattedLog.turn,
      source: sourceName,
      action: '对',
      target: targetName,
      result: formattedLog.htmlResult || '',
      level: formattedLog.level,
      htmlResult: formattedLog.htmlResult
    }

    const shouldDisplay = shouldDisplayLog(fullLog)

    return { log: fullLog, shouldDisplay }
  }

  function shouldDisplayLog(log: BattleLogEntry): boolean {
    const isLogExists = logs.value.some(
      (existingLog) =>
        existingLog.turn === log.turn &&
        existingLog.htmlResult === log.htmlResult
    )

    if (isLogExists) {
      return false
    }

    if (log.level === 'info' && !filters.value.showSystemMessages) {
      return false
    }

    if (log.level === PARTICIPANT_SIDE.ALLY && !filters.value.showAllyActions) {
      return false
    }

    if (log.level === PARTICIPANT_SIDE.ENEMY && !filters.value.showEnemyActions) {
      return false
    }

    const resultLower = (log.result || '').toLowerCase()
    if (!filters.value.showDamage && resultLower.includes('伤害')) {
      return false
    }

    if (!filters.value.showHealing && resultLower.includes('治疗')) {
      return false
    }

    if (!filters.value.showBuffs && (resultLower.includes('增益') || resultLower.includes('减益'))) {
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
