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
