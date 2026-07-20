/**
 * 战斗日志管理器端口接口
 *
 * 领域层通过此端口记录战斗日志，基础设施层提供具体实现。
 * 替代领域层对 battleLogManager 基础设施单例的直接依赖。
 */
export interface IBattleLogManager {
  /**
   * 添加调试日志
   * @param message 日志文本
   * @param options 可选参数（如日志级别）
   */
  addDebugLog(message: string, options?: Record<string, unknown>): void

  /**
   * 添加系统日志
   * @param params 日志参数（具体类型由实现层定义）
   */
  addSystemLog(params: any): void

  /**
   * 添加战斗日志
   * @param params 日志参数（具体类型由实现层定义）
   */
  addBattleLog(params: any): void

  /**
   * 添加行为日志
   * @param params 日志参数（具体类型由实现层定义）
   */
  addActionLog(params: any): void

  /** 清除所有日志 */
  clearLogs(): void

  /**
   * 获取系统日志
   * @returns 系统日志条目列表
   */
  getSystemLogs(): unknown[]

  /**
   * 同步战斗日志到存储
   * @param battleState 可选战斗状态快照
   */
  syncBattleLogs(battleState?: unknown): void | Promise<void>
}
