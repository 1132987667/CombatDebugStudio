import { vi } from 'vitest'

export const MockLogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const

export class MockLogger {
  logs: Array<{ level: string; message: string; context?: unknown }> = []

  addDebugLog(message: string, context?: unknown): void {
    this.logs.push({ level: MockLogLevel.DEBUG, message, context })
  }

  addSystemLog(entry: { message: string; level?: string; context?: unknown }): void {
    this.logs.push({ level: entry.level ?? MockLogLevel.INFO, message: entry.message, context: entry.context })
  }

  clear(): void {
    this.logs = []
  }
}

export const mockLogger = new MockLogger()

/**
 * 与 IBattleLogManager 接口对齐的共享 mock 工厂。
 * 写入方法（add 前缀、set 前缀、clear 前缀、importLogs）为 vi.fn()，
 * 读取方法（get 前缀、exportLogs）返回空值。
 * 需要捕获调用或 mock 返回值时，通过 overrides 传入对应 vi.fn()。
 * 用法：LoggerProvider.logger = createMockLogManager()
 */
export function createMockLogManager(
  overrides: Partial<import('@/domain/port/IBattleLogManager').IBattleLogManager> = {},
): import('@/domain/port/IBattleLogManager').IBattleLogManager {
  return {
    addDebugLog: vi.fn(),
    addSystemLog: vi.fn(),
    addBattleLog: vi.fn(),
    addActionLog: vi.fn(),
    addItemLog: vi.fn(),
    clearLogs: vi.fn(),
    getSystemLogs: () => [],
    getDebugLogs: () => [],
    getAllLogs: () => [],
    getFilteredLogs: () => [],
    getFilters: () => ({ battle: true, system: true, item: true, action: true, debug: true }),
    updateFilters: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    setAutoCleanup: vi.fn(),
    setMuted: vi.fn(),
    syncBattleLogs: vi.fn(),
    beginBufferSubLogs: vi.fn(),
    flushBufferedSubLogs: vi.fn(),
    exportLogs: () => '',
    importLogs: vi.fn(),
    ...overrides,
  }
}
