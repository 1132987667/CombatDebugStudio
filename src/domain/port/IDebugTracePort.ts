/**
 * 文件: IDebugTracePort.ts
 * 功能: 调试追踪端口接口（领域层唯一调试日志发射接口）
 * 描述: 领域运行时状态的结构化投影（见 documents/需求文档/调试日志改造.md v2 §4.4/§7）。
 *       发射点先查 isEnabled 再构建 payload（热路径零开销）；emit 永不抛异常。
 *       错误/警告不属于 TracePhase 体系，走 IBattleLogManager 错误通道（§4.6）。
 */

import type {
  TraceEvent,
  TracePhase,
  TraceScope,
  TraceScopeMeta,
} from '@/shared/types/trace-event'

export interface IDebugTracePort {
  /**
   * 发射一条结构化追踪事件，返回事件 id（供后续子事件挂 parentId）
   * 实现方保证：永不抛异常（调试日志的失败绝不能中断战斗）
   */
  emit(event: TraceEvent): string

  /**
   * 该 phase 是否开启追踪
   * 发射点先查开关再构建 payload（未开启时零序列化、零分配）
   */
  isEnabled(phase: TracePhase): boolean

  /**
   * 开启一个因果链作用域（一次行动的根，文档 §4.5）
   * 同一因果链上的所有事件共享 correlationId，树的嵌套由 parentId 表达
   */
  beginScope(
    correlationId: string,
    phase: TracePhase,
    meta?: TraceScopeMeta,
    parentId?: string,
  ): TraceScope
}
