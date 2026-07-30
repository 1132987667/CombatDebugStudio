import type { IBattleLogManager } from '@/domain/port/IBattleLogManager'

/**
 * 日志器静态提供者
 *
 * 领域层文件通过 LoggerProvider.logger 获取 IBattleLogManager 实例，
 * 避免每文件重复依赖注入或直接 import 基础设施层。
 *
 * 由 DI 容器在初始化时设置 logger 实例：
 *   LoggerProvider.setLogger(battleLogManager)
 *
 * ponytail: 静态服务定位器模式。对于 20+ 个领域文件都需要日志的场景，
 * 比逐个改构造函数注入更实用。如需完整 DI，可后续逐步迁移。
 *
 * 安全边界: 仅在 DI 容器初始化后使用，否则 getter 抛 Error。
 */
export class LoggerProvider {
  private static _logger: IBattleLogManager | undefined

  /** 注入日志器实例（DI 容器初始化时调用） */
  static setLogger(logger: IBattleLogManager): void {
    LoggerProvider._logger = logger
  }

  /** 获取日志器实例（未初始化时抛错） */
  static get logger(): IBattleLogManager {
    if (!LoggerProvider._logger) {
      throw new Error(
        '[LoggerProvider] logger 未初始化 — 请确保 DI 容器在调用前已设置 LoggerProvider.setLogger(battleLogManager)',
      )
    }
    return LoggerProvider._logger
  }

  /** @deprecated 请使用 setLogger() */
  static set logger(logger: IBattleLogManager) {
    LoggerProvider.setLogger(logger)
  }
}
