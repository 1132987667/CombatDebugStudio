/**
 * 阵容/阵型闭环测试（闭环6）
 *
 * M1：roleId → 参战者解析（先 actors 后 enemies；失配返回 null 供调用方提示），
 *     以及 participant.id（[side]_sourceId_counter）→ 原始 roleId 的保存-加载对称还原。
 * M2：lineup.formationId → BattleManager.setFormations → startBattle 传递 BattleSystem.setFormations。
 *
 * 运行: npx vitest run tests/unit/lineup-roster.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { BattleManager } from '@/domain/battle/BattleManager'
import { BattleService } from '@/application/facade/BattleFacade'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import type { AutoBattleManager } from '@/domain/battle/auto/AutoBattleManager'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'
import type { Emitter } from 'mitt'
import type { BattleEvents } from '@/domain/battle/type/BattleEventType'
import type { FormationConfig } from '@/shared/types/formation'
import type { ActorData } from '@/domain/fengshen/types'

describe('sourceRoleIdOf（participant id → 原始 roleId，保存/加载对称）', () => {
  it('解析 [side]_sourceId_counter 格式', () => {
    expect(GameDataProcessor.sourceRoleIdOf({ id: '[ALLY]_guardian_fire_1' })).toBe('guardian_fire')
    expect(GameDataProcessor.sourceRoleIdOf({ id: '[ENEMY]_enemy_s1_1_a_3' })).toBe('enemy_s1_1_a')
  })
  it('sourceId 以数字结尾也能解析（贪婪匹配最后一段计数器）', () => {
    expect(GameDataProcessor.sourceRoleIdOf({ id: '[ALLY]_hero_2_5' })).toBe('hero_2')
    expect(GameDataProcessor.sourceRoleIdOf({ id: '[ALLY]_enemy_2_10' })).toBe('enemy_2')
  })
  it('纯 roleId 输入原样返回', () => {
    expect(GameDataProcessor.sourceRoleIdOf({ id: 'guardian_fire' })).toBe('guardian_fire')
    expect(GameDataProcessor.sourceRoleIdOf({ id: 'enemy_007' })).toBe('enemy_007')
  })
})

describe('resolveRoleToParticipant（先 actors 后 enemies，失配返回 null）', () => {
  const actors: ActorData[] = [
    { id: 'guardian_fire', name: '火护法', level: 10, stats: { maxHealth: 100, attack: 20 }, skillIds: [] },
  ]

  it('actor id 解析为我方参战者（side/seatIndex 透传）', () => {
    const p = GameDataProcessor.resolveRoleToParticipant('guardian_fire', ParticipantSide.ALLY, 2, actors)
    expect(p).not.toBeNull()
    expect(p!.name).toBe('火护法')
    expect(p!.team).toBe(ParticipantSide.ALLY)
    expect(p!.seatIndex).toBe(2)
  })

  it('enemy id 解析为敌方参战者', () => {
    const p = GameDataProcessor.resolveRoleToParticipant('enemy_s1_1_a', ParticipantSide.ENEMY, 0, [])
    expect(p).not.toBeNull()
    expect(p!.team).toBe(ParticipantSide.ENEMY)
  })

  it('actor 优先于 enemy（同 id 同时存在时命中 actor）', () => {
    const both: ActorData[] = [
      { id: 'guardian_fire', name: '我方火护法', level: 10, stats: {}, skillIds: [] },
    ]
    const p = GameDataProcessor.resolveRoleToParticipant('guardian_fire', ParticipantSide.ALLY, 0, both)
    expect(p!.name).toBe('我方火护法')
  })

  it('既非 actor 又非 enemy 返回 null（调用方负责提示，不再静默跳过）', () => {
    expect(GameDataProcessor.resolveRoleToParticipant('ghost_id', ParticipantSide.ALLY, 0, actors)).toBeNull()
  })
})

/** 最小 mock 装配 BattleManager（构造参数仅作桥接） */
function makeManager(stub: Record<string, unknown>): BattleManager {
  return new BattleManager(
    stub as unknown as BattleSystem,
    {
      getBattleId: () => 'b1',
      setBattleId: vi.fn(),
      getIsBattleActive: () => false,
      syncBattleState: vi.fn(),
      resetState: vi.fn(),
    } as unknown as BattleStateManager,
    { stopAutoBattle: vi.fn() } as unknown as AutoBattleManager,
    { emit: vi.fn() } as unknown as IUIEventPort,
    { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as Emitter<BattleEvents>,
  )
}

const FORMATION: FormationConfig = {
  id: 'crane_wing',
  name: '鹤翼阵',
  description: '前排防御提升，后排速度提升',
  maxSlots: 4,
  slots: [
    { index: 0, row: 'front' },
    { index: 1, row: 'front' },
    { index: 2, row: 'back' },
    { index: 3, row: 'back' },
  ],
  effects: [],
}

function makeStub() {
  return {
    getBattleData: () => ({ participants: new Map() }),
    setFormations: vi.fn(),
    initialize: vi.fn(() => ({ battleId: 'b1' })),
    setBattleState: vi.fn(),
    getAutoBattle: () => false,
  }
}

describe('M2 阵型绑定进入战斗', () => {
  it('BattleService.setFormations 委托 BattleManager', () => {
    const manager = makeManager(makeStub())
    const spy = vi.spyOn(manager, 'setFormations')
    const service = new BattleService(manager)
    service.setFormations(FORMATION, undefined)
    expect(spy).toHaveBeenCalledWith(FORMATION, undefined)
  })

  it('setFormations 的阵型随 startBattle 传递给 BattleSystem（不再恒为 null）', async () => {
    const stub = makeStub()
    const manager = makeManager(stub)
    manager.addCharacterToTeam({ id: 'ally1', enabled: true } as unknown as BattleEntity, ParticipantSide.ALLY)
    manager.addCharacterToTeam({ id: 'enemy1', enabled: true } as unknown as BattleEntity, ParticipantSide.ENEMY)

    manager.setFormations(FORMATION, undefined)
    await manager.startBattle()

    expect(stub.setFormations).toHaveBeenCalledWith(FORMATION, undefined)
  })

  it('敌方阵容的阵型经 enemyFormation 侧传递', async () => {
    const stub = makeStub()
    const manager = makeManager(stub)
    manager.addCharacterToTeam({ id: 'ally1', enabled: true } as unknown as BattleEntity, ParticipantSide.ALLY)
    manager.addCharacterToTeam({ id: 'enemy1', enabled: true } as unknown as BattleEntity, ParticipantSide.ENEMY)

    manager.setFormations(undefined, FORMATION)
    await manager.startBattle()

    expect(stub.setFormations).toHaveBeenCalledWith(undefined, FORMATION)
  })
})
