/**
 * 自动播放功能测试脚本
 * 用于验证自动战斗功能是否正常工作
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameBattleSystem } from '../src/core/BattleSystem';
import type { ParticipantInfo } from '@/types/battle';

describe('自动播放功能测试', () => {
  let battleSystem: GameBattleSystem;
  let mockParticipants: ParticipantInfo[];

  beforeEach(() => {
    battleSystem = GameBattleSystem.getInstance();
    mockParticipants = [
      {
        id: 'char1',
        name: '测试角色',
        type: 'character',
        currentHealth: 100,
        maxEnergy: 100
      },
      {
        id: 'enemy1',
        name: '测试敌人',
        type: 'enemy',
        currentHealth: 80,
        maxEnergy: 80
      }
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('startAutoBattle', () => {
    it('应该成功开始自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true);
    });

    it('应该拒绝不存在的战斗ID', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      battleSystem.startAutoBattle('non-existent-battle', 1);
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(battleSystem.isAutoBattleActive('non-existent-battle')).toBe(false);
    });

    it('应该拒绝已开始的自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      const consoleSpy = vi.spyOn(console, 'warn');
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.startAutoBattle(battleState.battleId, 2);
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('应该能够重新启动已停止的自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.stopAutoBattle(battleState.battleId);
      battleSystem.startAutoBattle(battleState.battleId, 2);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true);
    });
  });

  describe('stopAutoBattle', () => {
    it('应该成功停止自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.stopAutoBattle(battleState.battleId);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
    });

    it('应该能够停止不存在的战斗而不报错', () => {
      expect(() => {
        battleSystem.stopAutoBattle('non-existent-battle');
      }).not.toThrow();
    });

    it('应该能够停止已停止的战斗而不报错', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.stopAutoBattle(battleState.battleId);
      battleSystem.stopAutoBattle(battleState.battleId);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
    });
  });

  describe('isAutoBattleActive', () => {
    it('应该正确返回自动战斗状态', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true);
      
      battleSystem.stopAutoBattle(battleState.battleId);
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
    });

    it('应该对不存在的战斗返回false', () => {
      expect(battleSystem.isAutoBattleActive('non-existent-battle')).toBe(false);
    });
  });

  describe('setAutoBattleSpeed', () => {
    it('应该能够设置自动战斗速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      const consoleSpy = vi.spyOn(console, 'info');
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.setAutoBattleSpeed(battleState.battleId, 2);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('速度从 1x 更新为: 2x')
      );
    });

    it('应该拒绝不存在的战斗ID', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      battleSystem.setAutoBattleSpeed('non-existent-battle', 2);
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('应该能够更新未开始战斗的速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      expect(() => {
        battleSystem.setAutoBattleSpeed(battleState.battleId, 2);
      }).not.toThrow();
    });

    it('应该能够实时更新正在进行的战斗速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.setAutoBattleSpeed(battleState.battleId, 5);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true);
    });
  });

  describe('自动战斗循环', () => {
    it('应该能够执行多个回合', async () => {
      vi.useFakeTimers();
      
      const battleState = battleSystem.createBattle(mockParticipants);
      const processTurnSpy = vi.spyOn(battleSystem as any, 'processTurnInternal');
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      
      vi.advanceTimersByTime(2000);
      
      expect(processTurnSpy).toHaveBeenCalled();
      
      vi.useRealTimers();
    });

    it('应该在战斗结束时自动停止', async () => {
      vi.useFakeTimers();
      
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      
      battleSystem.endBattle(battleState.battleId, 'character');
      
      vi.advanceTimersByTime(1000);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
      
      vi.useRealTimers();
    });

    it('应该能够处理错误并停止', async () => {
      vi.useFakeTimers();
      
      const battleState = battleSystem.createBattle(mockParticipants);
      const consoleSpy = vi.spyOn(console, 'error');
      
      vi.spyOn(battleSystem as any, 'processTurnInternal').mockRejectedValue(
        new Error('测试错误')
      );
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      
      vi.advanceTimersByTime(1000);
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('状态管理', () => {
    it('应该正确清理已停止的战斗状态', () => {
      const battleState = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battleState.battleId, 1);
      battleSystem.stopAutoBattle(battleState.battleId);
      
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false);
    });

    it('应该能够同时管理多个战斗', () => {
      const battle1 = battleSystem.createBattle(mockParticipants);
      const battle2 = battleSystem.createBattle(mockParticipants);
      
      battleSystem.startAutoBattle(battle1.battleId, 1);
      battleSystem.startAutoBattle(battle2.battleId, 2);
      
      expect(battleSystem.isAutoBattleActive(battle1.battleId)).toBe(true);
      expect(battleSystem.isAutoBattleActive(battle2.battleId)).toBe(true);
      
      battleSystem.stopAutoBattle(battle1.battleId);
      
      expect(battleSystem.isAutoBattleActive(battle1.battleId)).toBe(false);
      expect(battleSystem.isAutoBattleActive(battle2.battleId)).toBe(true);
    });
  });
});
