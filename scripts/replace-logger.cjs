/**
 * Batch replace battleLogManager with LoggerProvider.logger in domain files.
 * Uses fs with UTF-8 encoding to avoid PowerShell encoding corruption.
 */
const fs = require('fs')
const path = require('path')

const domainRoot = path.join(__dirname, '..', 'src', 'domain')

const files = [
  'buff/BuffErrorBoundary.ts',
  'buff/scripts/base/BaseBuffScript.ts',
  'buff/BuffScriptRegistry.ts',
  'battle/BattleManager.ts',
  'battle/BattleSystem.ts',
  'battle/ai/BattleAI.ts',
  'battle/auto/AutoBattleManager.ts',
  'battle/events/BattleEventManager.ts',
  'battle/intervention/InterventionManager.ts',
  'battle/logs/BuffTraceLogger.ts',
  'battle/logs/TraceDamageLogger.ts',
  'battle/replay/BattleReplayManager.ts',
  'battle/replay/ReplayEngine.ts',
  'battle/service/BattleExecutor.ts',
  'battle/service/BattleRecorder.ts',
  'battle/service/BattleRuleManager.ts',
  'skill/DamageCalculator.ts',
  'skill/HealCalculator.ts',
  'skill/PassiveSkillManager.ts',
  'skill/SkillExecutor.ts',
  'skill/SkillManager.ts',
]

const LOGGER_IMPORT = `import { LoggerProvider } from '@/domain/port/LoggerProvider'`

let modified = 0
for (const rel of files) {
  const fullPath = path.join(domainRoot, rel)
  let content = fs.readFileSync(fullPath, 'utf-8')

  // Replace battleLogManager.xxx → LoggerProvider.logger.xxx
  const newContent = content.replace(/battleLogManager\./g, 'LoggerProvider.logger.')

  if (newContent === content) continue // no changes

  // Fix imports:
  let result = newContent

  // Pattern 1: import { battleLogManager, LogLevel } from '...'
  result = result.replace(
    /import \{ battleLogManager, (LogLevel) \} from ['"]@\/infrastructure\/adapters\/logging['"]/g,
    "import { $1 } from '@/infrastructure/adapters/logging'"
  )
  // Pattern 2: import { battleLogManager } from '.../logging'
  result = result.replace(
    /import \{ battleLogManager \} from ['"]@\/infrastructure\/adapters\/logging['"]\s*\n?/g,
    ''
  )
  // Pattern 3: import { battleLogManager } from '.../logging/BattleLogManager'
  result = result.replace(
    /import \{ battleLogManager \} from ['"]@\/infrastructure\/adapters\/logging\/BattleLogManager['"]\s*\n?/g,
    ''
  )

  // Add LoggerProvider import (find the last import line and insert after)
  if (!result.includes("from '@/domain/port/LoggerProvider'")) {
    const importLines = result.match(/^import .+$/gm)
    if (importLines && importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1]
      result = result.replace(lastImport, lastImport + '\n' + LOGGER_IMPORT)
    } else {
      result = LOGGER_IMPORT + '\n' + result
    }
  }

  fs.writeFileSync(fullPath, result, 'utf-8')
  modified++
  console.log(`✅ ${rel}`)
}

console.log(`\nTotal files modified: ${modified}`)
