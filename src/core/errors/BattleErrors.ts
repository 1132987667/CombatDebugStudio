/**
 * 战斗系统异常定义
 * 提供统一的异常类型和错误码，便于问题定位和异常处理
 */

/**
 * 战斗系统错误码枚举
 */
export enum BattleErrorCode {
  /** 通用错误 */
  UNKNOWN = 'UNKNOWN',
  /** 战斗不存在 */
  BATTLE_NOT_FOUND = 'BATTLE_NOT_FOUND',
  /** 参与者不存在 */
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
  /** 无效的行动 */
  INVALID_ACTION = 'INVALID_ACTION',
  /** 技能不存在 */
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  /** Buff不存在 */
  BUFF_NOT_FOUND = 'BUFF_NOT_FOUND',
  /** 资源不足 */
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  /** 技能冷却中 */
  SKILL_ON_COOLDOWN = 'SKILL_ON_COOLDOWN',
  /** 无效的状态转换 */
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  /** 配置错误 */
  CONFIG_ERROR = 'CONFIG_ERROR',
}

/**
 * 战斗系统基础异常类
 */
export class BattleError extends Error {
  public readonly code: BattleErrorCode
  public readonly recoverable: boolean
  public readonly context: Record<string, unknown>
  public readonly timestamp: number

  constructor(
    message: string,
    code: BattleErrorCode = BattleErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'BattleError'
    this.code = code
    this.recoverable = recoverable
    this.context = context
    this.timestamp = Date.now()

    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * 将错误转换为可序列化的对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    }
  }
}

/**
 * 战斗不存在异常
 */
export class BattleNotFoundError extends BattleError {
  constructor(battleId: string) {
    super(`战斗不存在: ${battleId}`, BattleErrorCode.BATTLE_NOT_FOUND, false, { battleId })
    this.name = 'BattleNotFoundError'
  }
}

/**
 * 参与者不存在异常
 */
export class ParticipantNotFoundError extends BattleError {
  constructor(participantId: string) {
    super(`参与者不存在: ${participantId}`, BattleErrorCode.PARTICIPANT_NOT_FOUND, false, { participantId })
    this.name = 'ParticipantNotFoundError'
  }
}

/**
 * 无效行动异常
 */
export class InvalidActionError extends BattleError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, BattleErrorCode.INVALID_ACTION, true, context)
    this.name = 'InvalidActionError'
  }
}

/**
 * 技能不存在异常
 */
export class SkillNotFoundError extends BattleError {
  constructor(skillId: string) {
    super(`技能不存在: ${skillId}`, BattleErrorCode.SKILL_NOT_FOUND, false, { skillId })
    this.name = 'SkillNotFoundError'
  }
}

/**
 * 资源不足异常
 */
export class InsufficientResourcesError extends BattleError {
  constructor(resourceType: string, required: number, available: number) {
    super(
      `资源不足: 需要${resourceType} ${required}，当前可用 ${available}`,
      BattleErrorCode.INSUFFICIENT_RESOURCES,
      true,
      { resourceType, required, available }
    )
    this.name = 'InsufficientResourcesError'
  }
}

/**
 * 错误处理工具函数
 */
export function isBattleError(error: unknown): error is BattleError {
  return error instanceof BattleError
}

/**
 * 安全执行函数
 * 捕获错误并转换为 BattleError
 */
export function tryCatchBattleError<T>(
  fn: () => T,
  fallback: T,
  errorMessage: string = '操作失败'
): T {
  try {
    return fn()
  } catch (error) {
    if (isBattleError(error)) {
      console.error(`[BattleError] ${error.code}: ${error.message}`)
    } else {
      console.error(`[BattleError] ${errorMessage}:`, error)
    }
    return fallback
  }
}

/**
 * 异步安全执行函数
 */
export async function asyncTryCatch<T>(
  fn: () => Promise<T>,
  fallback: T,
  errorMessage: string = '操作失败'
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isBattleError(error)) {
      console.error(`[BattleError] ${error.code}: ${error.message}`)
    } else {
      console.error(`[BattleError] ${errorMessage}:`, error)
    }
    return fallback
  }
}
