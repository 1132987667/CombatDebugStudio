/**
 * 测试全局初始化
 *
 * 在 vitest 启动时执行，确保所有测试环境中的全局依赖就绪。
 */

import { vi } from 'vitest'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

// LoggerProvider 初始化：领域层多处通过 LoggerProvider.logger 记录日志，
// 测试环境不初始化会导致 TypeError: Cannot read properties of undefined (reading 'addDebugLog')
LoggerProvider.logger = {
  addDebugLog: vi.fn(),
  addSystemLog: vi.fn(),
  addBattleLog: vi.fn(),
  addActionLog: vi.fn(),
  clearLogs: vi.fn(),
  syncBattleLogs: vi.fn(),
  getSystemLogs: () => [],
  getBattleLogs: () => [],
  getActionLogs: () => [],
  getStateLogs: () => [],
  addStateLog: vi.fn(),
  getLogs: () => [],
  setCurrentBattleId: vi.fn(),
  getCurrentBattleId: () => 'test-battle',
  setBattleId: vi.fn(),
} as any
