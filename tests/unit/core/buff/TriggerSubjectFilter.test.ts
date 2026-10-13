/**
 * Buff 触发器「事件主体过滤」测试（P0-2 修复）
 *
 * 契约：触发事件按 phase 广播到所有监听器（与持有者无关），触发器只在持有者是
 * 事件主体时执行——回合/行动类主体在 sourceId（per-participant 广播，缺过滤时
 * "回合开始回复 5%" 在 N 人局放大 N 倍）；结算类主体在 targetId（sourceId 是
 * 交互对方或空，按 sourceId 过滤会让反伤打到攻击者自己）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { ControlType, StackRule } from '@/domain/buff/types'
import type { BuffConfig } from '@/domain/buff/types'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import { LogLevel } from '@/shared/types/battle-log'
import { createMockLogManager } from '@tests/mocks/MockLogger'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

const mockLogger = createMockLogManager()

function createBuffConfig(overrides?: Partial<BuffConfig>): BuffConfig {
  return {
    id: 'spy_buff',
    name: 'Spy Buff',
    description: '',
    duration: -1,
    maxStacks: 1,
    cooldown: 0,
    stackRule: StackRule.LIMITED,
    controlType: ControlType.NONE,
    ...overrides,
  }
}

/** 从 mockEventBus.on 的注册记录里取指定 phase 最近一次注册的回调 */
function getRegisteredCallback(phase: string): (ctx: unknown) => void {
  const calls = mockEventBus.on.mock.calls.filter((c) => c[0] === phase)
  expect(calls.length, `phase=${phase} 应有已注册的监听器`).toBeGreaterThan(0)
  return calls[calls.length - 1][1]
}

describe('Buff 触发器事件主体过滤（P0-2）', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem
  const scriptCalls: Array<{ sourceId: string; targetId?: string }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    scriptCalls.length = 0
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    // addBuff 要求 buff 先在 registry 注册（脚本或 JSON 配置），最小脚本即可——
    // 触发器注册独立于执行路径
    registry.registerScript('spy_buff', {
      onApply: () => {},
      onRemove: () => {},
      onUpdate: () => {},
      onRefresh: () => {},
    })
    buffSystem.registerTriggerScript('spy_subject_script', (ctx) => {
      scriptCalls.push({ sourceId: ctx.sourceId, targetId: ctx.targetId })
    })
  })

  it('turn_start（source 侧）：持有者是回合主体才触发，他人回合不触发', () => {
    buffSystem.addBuff('holder_1', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.TURN_START, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('turn_start')

    // 他人回合开始（广播到达但不该触发）
    cb({ phase: 'turn_start', sourceId: 'other_unit', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)

    // 持有者自己的回合开始
    cb({ phase: 'turn_start', sourceId: 'holder_1', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
    expect(scriptCalls[0].sourceId).toBe('holder_1')
  })

  it('turn_end（source 侧）：同 turn_start 语义', () => {
    buffSystem.addBuff('holder_2', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.TURN_END, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('turn_end')

    cb({ phase: 'turn_end', sourceId: 'someone_else', currentTurn: 2 })
    expect(scriptCalls).toHaveLength(0)
    cb({ phase: 'turn_end', sourceId: 'holder_2', currentTurn: 2 })
    expect(scriptCalls).toHaveLength(1)
  })

  it('damage_taken（target 侧）：持有者受伤才触发，攻击者持有时不触发（防反伤自伤回归）', () => {
    buffSystem.addBuff('victim_1', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.DAMAGE_TAKEN, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('damage_taken')

    // 他人受伤：即使攻击者是持有者也不触发（sourceId 是交互对方）
    cb({ phase: 'damage_taken', sourceId: 'victim_1', targetId: 'other_victim', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)

    // 他人受伤、来源为空（DOT/触发器伤害）
    cb({ phase: 'damage_taken', sourceId: '', targetId: 'other_victim', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)

    // 持有者受伤（攻击者为空 = 无来源伤害）
    cb({ phase: 'damage_taken', sourceId: '', targetId: 'victim_1', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
    expect(scriptCalls[0].targetId).toBe('victim_1')
  })

  it('heal_received（target 侧）：持有者被治疗才触发', () => {
    buffSystem.addBuff('healed_1', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.HEAL_RECEIVED, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('heal_received')

    cb({ phase: 'heal_received', sourceId: '', targetId: 'someone_else', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)
    cb({ phase: 'heal_received', sourceId: '', targetId: 'healed_1', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
  })

  it('ally_damage_taken（target 侧）：事件逐队友发射，只有被点名的队友触发', () => {
    buffSystem.addBuff('ally_a', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.ALLY_DAMAGE_TAKEN, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('ally_damage_taken')

    cb({ phase: 'ally_damage_taken', sourceId: '', targetId: 'ally_b', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)
    cb({ phase: 'ally_damage_taken', sourceId: '', targetId: 'ally_a', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
  })

  it('battle_start（source 侧）：逐 participant 广播，只有主体本人触发', () => {
    buffSystem.addBuff('starter_1', 'spy_buff', {
      ...createBuffConfig(),
      triggers: [
        { phase: BattleTriggerPhase.BATTLE_START, scriptId: 'spy_subject_script' },
      ],
    }, 1)
    const cb = getRegisteredCallback('battle_start')

    cb({ phase: 'battle_start', sourceId: 'starter_2', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(0)
    cb({ phase: 'battle_start', sourceId: 'starter_1', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
  })

  it('condition 条件表达式暂不支持：注册时显式 WARN，不阻断注册', () => {
    buffSystem.addBuff('cond_holder', 'spy_buff', {
      ...createBuffConfig({ id: 'spy_buff' }),
      triggers: [
        {
          phase: BattleTriggerPhase.TURN_START,
          scriptId: 'spy_subject_script',
          condition: "self.hp_ratio < 0.5",
        },
      ],
    }, 1)
    // WARN 落日志（静默忽略会误导配置者以为条件生效）
    expect(mockLogger.addDebugLog).toHaveBeenCalledWith(
      expect.stringContaining('condition'),
      expect.objectContaining({ level: LogLevel.WARN }),
    )
    // 条件未生效但触发器本身照常注册（主体过滤后可触发）
    const cb = getRegisteredCallback('turn_start')
    cb({ phase: 'turn_start', sourceId: 'cond_holder', currentTurn: 1 })
    expect(scriptCalls).toHaveLength(1)
  })
})
