export enum BattleErrorCode {
  UNKNOWN = 'UNKNOWN',
  BATTLE_NOT_FOUND = 'BATTLE_NOT_FOUND',
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
  INVALID_ACTION = 'INVALID_ACTION',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  BUFF_NOT_FOUND = 'BUFF_NOT_FOUND',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  SKILL_ON_COOLDOWN = 'SKILL_ON_COOLDOWN',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

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
    if ('captureStackTrace' in Error) {
      (Error as any).captureStackTrace(this, this.constructor)
    }
  }

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

export class BattleNotFoundError extends BattleError {
  constructor(battleId: string) {
    super(`Battle not found: ${battleId}`, BattleErrorCode.BATTLE_NOT_FOUND, false, { battleId })
    this.name = 'BattleNotFoundError'
  }
}

export class ParticipantNotFoundError extends BattleError {
  constructor(participantId: string) {
    super(`Participant not found: ${participantId}`, BattleErrorCode.PARTICIPANT_NOT_FOUND, false, { participantId })
    this.name = 'ParticipantNotFoundError'
  }
}

export class InvalidActionError extends BattleError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, BattleErrorCode.INVALID_ACTION, true, context)
    this.name = 'InvalidActionError'
  }
}

export class SkillNotFoundError extends BattleError {
  constructor(skillId: string) {
    super(`Skill not found: ${skillId}`, BattleErrorCode.SKILL_NOT_FOUND, false, { skillId })
    this.name = 'SkillNotFoundError'
  }
}

export class InsufficientResourcesError extends BattleError {
  constructor(resourceType: string, required: number, available: number) {
    super(
      `Insufficient resources: need ${resourceType} ${required}, available ${available}`,
      BattleErrorCode.INSUFFICIENT_RESOURCES,
      true,
      { resourceType, required, available }
    )
    this.name = 'InsufficientResourcesError'
  }
}

export function isBattleError(error: unknown): error is BattleError {
  return error instanceof BattleError
}

export function tryCatchBattleError<T>(
  fn: () => T,
  fallback: T,
  errorMessage: string = 'Operation failed'
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

export async function asyncTryCatch<T>(
  fn: () => Promise<T>,
  fallback: T,
  errorMessage: string = 'Operation failed'
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
