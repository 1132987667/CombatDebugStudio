/**
 * BuffSystemStackEdges.test.ts — Buff 叠加/免疫/驱散边界回归（T4）
 *
 * 先对现有用例去重：三种 stackRule 主干、unknown→''、父子级联、过期移除、
 * 永久不过期、refreshBuff、stackRule 值域 均已由
 * BuffSystem.test / BuffSystemLifecycle / BuffStackRuleBoundary 覆盖。
 * 本文件只做增量：
 *   LIMITED 满层刷新分支（BuffSystem.ts:603+ 满层路径，含 _stacks 同步）
 *   INDEPENDENT 达上限拒绝 / maxStacks:0 不被 falsy 回退吞掉
 *   免疫三通道（controlType / buffId 去前缀 / tags）与 blockedByTag 施加阻挡
 *   removeDispellableBuffs 只清显式 dispellable===true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { StackRule, ControlType } from '@/domain/buff/types'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }

const t4Limited = {
  id: 't4_limited',
  name: 'T4 叠层',
  description: '',
  duration: 3,
  maxStacks: 2,
  stackRule: 'limited',
  polarity: 'positive',
  effects: [
    { type: 'modifier', params: { attributes: { attack: { value: 5, type: 'FLAT' } }, perStack: true } },
  ],
} as unknown as BuffJsonEntry

const t4Indep = {
  id: 't4_indep',
  name: 'T4 独立',
  description: '',
  duration: 3,
  maxStacks: 2,
  stackRule: 'independent',
  polarity: 'positive',
  effects: [
    { type: 'modifier', params: { attributes: { attack: { value: 1, type: 'FLAT' } } } },
  ],
} as unknown as BuffJsonEntry

const t4IndepZero = { ...t4Indep, id: 't4_indep0', maxStacks: 0 }
const t4Carrier = {
  id: 't4_carrier',
  name: 'T4 标记携带者',
  description: '',
  duration: 3,
  maxStacks: 1,
  stackRule: 'independent',
  polarity: 'positive',
  tags: ['no_fengsuo'],
  effects: [
    { type: 'modifier', params: { attributes: { attack: { value: 1, type: 'FLAT' } } } },
  ],
} as unknown as BuffJsonEntry

describe('BuffSystem 叠加/免疫/驱散边界', () => {
  let buffSystem: BuffSystem

  beforeEach(() => {
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger
    const registry = new BuffScriptRegistry()
    registry.loadBuffConfigsFromArray([t4Limited, t4Indep, t4IndepZero, t4Carrier])
    buffSystem = new BuffSystem(registry, mockEventBus as never, mockLogger)
  })

  describe('LIMITED 满层分支', () => {
    it('满层时施加：层数不再涨、持续时间刷新、返回同一实例 id、_stacks 同步为 maxStacks', () => {
      const id1 = buffSystem.addBuff('c1', 't4_limited', {}, 1)
      const id2 = buffSystem.addBuff('c1', 't4_limited', {}, 2)
      expect(id2).toBe(id1)
      expect(buffSystem.getBuffInstanceById(id1)?.currentStacks).toBe(2)

      // 先走一回合让剩余回合衰减
      buffSystem.updatePerTurn('c1', 3)
      const before = buffSystem.getBuffInstanceById(id1)!.remainingTurns

      const id3 = buffSystem.addBuff('c1', 't4_limited', {}, 4)
      const inst = buffSystem.getBuffInstanceById(id3)!
      expect(id3).toBe(id1)
      expect(inst.currentStacks).toBe(2) // 不超上限
      expect(inst.remainingTurns).toBe(3) // 刷新回 duration
      expect(inst.remainingTurns).toBeGreaterThan(before)
      // 修饰符原语读取的层数变量与满层一致
      expect(inst.context.variables.get('_stacks')).toBe(2)
    })
  })

  describe('INDEPENDENT 上限语义', () => {
    it('达 maxStacks 后返回空串且实例数不变', () => {
      expect(buffSystem.addBuff('c1', 't4_indep', {}, 1)).toBeTruthy()
      expect(buffSystem.addBuff('c1', 't4_indep', {}, 2)).toBeTruthy()
      expect(buffSystem.addBuff('c1', 't4_indep', {}, 3)).toBe('')
      expect(buffSystem.getBuffInstances('c1')).toHaveLength(2)
    })

    it('maxStacks:0 不被 falsy 回退误当成缺省（?? 语义），可持续叠实例', () => {
      expect(buffSystem.addBuff('c1', 't4_indep0', {}, 1)).toBeTruthy()
      expect(buffSystem.addBuff('c1', 't4_indep0', {}, 2)).toBeTruthy()
      expect(buffSystem.addBuff('c1', 't4_indep0', {}, 3)).toBeTruthy()
    })
  })

  describe('免疫三通道（addBuff 返回空串）', () => {
    it('按去 buff_ 前缀的 id 免疫', () => {
      buffSystem.registerSingleImmunity('c1', 'yishang')
      expect(buffSystem.addBuff('c1', 'buff_yishang', {}, 1)).toBe('')
      // 未免疫角色照样能上
      expect(buffSystem.addBuff('c2', 'buff_yishang', {}, 1)).toBeTruthy()
    })

    it('按 buff tags 免疫', () => {
      buffSystem.registerSingleImmunity('c1', 'burn')
      expect(buffSystem.addBuff('c1', 'buff_burn', {}, 1)).toBe('')
    })

    it('按 controlType 免疫（marker buff 也走同一检查）', () => {
      buffSystem.registerSingleImmunity('c1', 'stun')
      const marker = {
        id: 't4_stun',
        executionMode: 'marker',
        duration: 1,
        controlType: ControlType.STUN,
      }
      expect(buffSystem.addBuff('c1', 't4_stun', marker, 1)).toBe('')
      expect(buffSystem.addBuff('c2', 't4_stun', { ...marker }, 1)).toBeTruthy()
    })
  })

  it('blockedByTag：目标身上存在携带该 tag 的 buff 时拒绝施加', () => {
    // 先上标记携带者，再叠风锁（buff_fengsuo.blockedByTag = no_fengsuo）
    expect(buffSystem.addBuff('c1', 't4_carrier', {}, 1)).toBeTruthy()
    expect(buffSystem.addBuff('c1', 'buff_fengsuo', {}, 1)).toBe('')
    // 无携带者的角色正常受风锁
    expect(buffSystem.addBuff('c2', 'buff_fengsuo', {}, 1)).toBeTruthy()
  })

  describe('removeDispellableBuffs 只清显式 dispellable === true', () => {
    // 回归锁定（2026-09-22 修复）：addBuff 合并链此前不读 jsonConfig.dispellable，
    // buffs.json 声明（如 buff_yishang:true）在主路径不生效；现三源合并
    // 调用方 > 脚本默认 > JSON，本组用例锁两侧语义。
    it('true 被清、false 与未声明保留', () => {
      buffSystem.addBuff('c1', 'buff_yishang', { dispellable: true }, 1)
      buffSystem.addBuff('c1', 'buff_fenghen', { dispellable: false }, 1)
      buffSystem.addBuff('c1', 't4_limited', {}, 1) // 未声明 dispellable
      buffSystem.addBuff('c1', 't4_limited', {}, 1) // 叠满 2 层，仍是 1 实例

      const removed = buffSystem.removeDispellableBuffs('c1')

      expect(removed).toBe(1)
      const ids = buffSystem.getBuffInstances('c1').map((i) => i.buffId)
      expect(ids).not.toContain('buff_yishang')
      expect(ids).toContain('buff_fenghen')
      expect(ids).toContain('t4_limited')
    })

    it('JSON 声明 dispellable:true 即被驱散；调用方显式 false 可覆盖', () => {
      buffSystem.addBuff('c1', 'buff_yishang', {}, 1) // json 声明 dispellable:true
      expect(buffSystem.removeDispellableBuffs('c1')).toBe(1)

      buffSystem.addBuff('c2', 'buff_yishang', { dispellable: false }, 1)
      expect(buffSystem.removeDispellableBuffs('c2')).toBe(0)
    })
  })
})
