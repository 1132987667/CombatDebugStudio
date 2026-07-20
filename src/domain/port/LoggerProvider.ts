import type { IBattleLogManager } from '@/domain/port/IBattleLogManager'

/**
 * 日志器静态提供者
 *
 * 领域层文件通过 LoggerProvider.logger 获取 IBattleLogManager 实例，
 * 避免每文件重复依赖注入或直接 import 基础设施层。
 *
 * 由 DI 容器在初始化时设置 logger 实例：
 *   LoggerProvider.logger = battleLogManager
 *
 * ponytail: 静态服务定位器模式。对于 20+ 个领域文件都需要日志的场景，
 * 比逐个改构造函数注入更实用。如需完整 DI，可后续逐步迁移。
 */
export class LoggerProvider {
  static logger: IBattleLogManager
}
