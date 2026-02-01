export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LoggerConfig {
  level: LogLevel
  prefix: string
  enableColors: boolean
}

class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level || 'INFO',
      prefix: config.prefix || 'BuffSystem',
      enableColors: config.enableColors ?? true
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    return levels.indexOf(level) >= levels.indexOf(this.config.level)
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    let formatted = `[${timestamp}] [${this.config.prefix}] [${level}] ${message}`

    if (data) {
      formatted += `\n${JSON.stringify(data, null, 2)}`
    }

    return formatted
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return

    const formatted = this.formatMessage(level, message, data)

    switch (level) {
      case 'DEBUG':
        console.debug(formatted)
        break
      case 'INFO':
        console.info(formatted)
        break
      case 'WARN':
        console.warn(formatted)
        break
      case 'ERROR':
        console.error(formatted)
        break
      default:
        console.log(formatted)
        break
    }
  }

  public debug(message: string, data?: any): void {
    this.log('DEBUG', message, data)
  }

  public info(message: string, data?: any): void {
    this.log('INFO', message, data)
  }

  public warn(message: string, data?: any): void {
    this.log('WARN', message, data)
  }

  public error(message: string, data?: any): void {
    this.log('ERROR', message, data)
  }

  public setLevel(level: LogLevel): void {
    this.config.level = level
  }

  public setPrefix(prefix: string): void {
    this.config.prefix = prefix
  }
}

export const logger = new Logger()
export { Logger }
