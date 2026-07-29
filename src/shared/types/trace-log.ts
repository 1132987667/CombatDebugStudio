/**
 * 文件: trace-log.ts
 * 功能: 技术调试日志类型定义
 * 描述: 定义 TraceLogEntry 接口，用于记录完整的伤害计算链路、
 *       Buff 变更、属性重算等开发调试信息。
 *       对应设计文档中的"底层：技术调试日志 (DEBUG/TRACE)"。
 * 版本: 1.0.0
 */

import type { LogEntry } from './battle-log'
import { LogType } from './battle-log'

/**
 * 技术调试日志条目
 * 扩展自 LogEntry，用于记录带父子关系的树状计算链路。
 * TRACE 级别使用 children 构建树，DEBUG 级别仅有摘要行。
 */
export interface TraceLogEntry extends LogEntry {
  /** 计算链唯一标识 */
  traceId: string
  /** 父 trace ID（用于构建树状嵌套，根节点为空） */
  parentTraceId?: string
  /** 计算步骤名，如 'BaseDamage', 'DefenseReduction', 'CritCheck' */
  stepName: string
  /** 步骤的计算值（数值结果） */
  stepValue: number
  /** 步骤的可读描述，如 '基础伤害: 100 (MIN=80, MAX=120, roll=100)' */
  description: string
  /** 缩进层级（0=根节点），用于 UI 展示时的缩进控制 */
  indentLevel: number
  /** 子步骤列表（仅在构建树时填充，持久化时展平为独立条目） */
  children?: TraceLogEntry[]

  /** 此步骤前的累计伤害（效果链 before→after 展示） */
  before?: number
  /** 此步骤后的累计伤害（与 stepValue 一致，结构化冗余以方便 UI 直接读取） */
  after?: number
  /** 来源类型：'system' | 'buff' | 'skill' | 'passive' | 'base' */
  sourceType?: string
}

/**
 * 创建空的 TraceLogEntry
 */
export function createTraceLogEntry(
  traceId: string,
  parentTraceId: string | undefined,
  stepName: string,
  stepValue: number,
  description: string,
  indentLevel: number,
): TraceLogEntry {
  return {
    index: -1,
    type: LogType.DEBUG,
    traceId,
    parentTraceId,
    stepName,
    stepValue,
    description,
    indentLevel,
    message: description,
  }
}
