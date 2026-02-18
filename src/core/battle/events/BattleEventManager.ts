/**
 * 战斗事件管理器
 * 负责统一管理战斗相关的事件订阅和分发
 */
import { eventBus } from '@/main';
import { BattleSystemEvent } from '@/types/battle';
import type { BattleLogEventData, BattleStateUpdateEventData, BattleEndedEventData } from '@/types/battle-events';
import { useBattleStore } from '@/stores/battleStore';
import { battleLogManager } from '@/utils/logging';

/**
 * 战斗事件管理器类
 */
export class BattleEventManager {
  private battleStore = useBattleStore();

  /**
   * 开始监听战斗事件
   */
  startListening() {
    // 订阅战斗日志事件
    eventBus.on(BattleSystemEvent.BATTLE_LOG, (data: any) => this.handleBattleLogEvent(data));

    // 订阅战斗状态更新事件
    eventBus.on(BattleSystemEvent.BATTLE_STATE_UPDATE, (data: any) => this.handleBattleStateUpdateEvent(data));

    // 订阅战斗结束事件
    eventBus.on(BattleSystemEvent.BATTLE_END, (data: any) => this.handleBattleEndEvent(data));

    // 订阅回合开始事件
    eventBus.on(BattleSystemEvent.TURN_START, (data: any) => this.handleTurnStartEvent(data));

    // 订阅回合结束事件
    eventBus.on(BattleSystemEvent.TURN_END, (data: any) => this.handleTurnEndEvent(data));
  }

  /**
   * 停止监听战斗事件
   */
  stopListening() {
    // 取消订阅所有战斗事件
    eventBus.off(BattleSystemEvent.BATTLE_LOG);
    eventBus.off(BattleSystemEvent.BATTLE_STATE_UPDATE);
    eventBus.off(BattleSystemEvent.BATTLE_END);
    eventBus.off(BattleSystemEvent.TURN_START);
    eventBus.off(BattleSystemEvent.TURN_END);
  }

  /**
   * 处理战斗日志事件
   */
  private handleBattleLogEvent(data: BattleLogEventData) {
    try {
      if (data && data.log) {
        this.battleStore.addBattleLog(data.log);
      }
    } catch (error) {
      battleLogManager.error('处理战斗日志事件时出错:', error);
    }
  }

  /**
   * 处理战斗状态更新事件
   */
  private handleBattleStateUpdateEvent(data: BattleStateUpdateEventData) {
    try {
      if (data) {
        this.battleStore.currentBattleId = data.battleId;
        this.battleStore.turnOrder = data.turnOrder || [];
        // 同步战斗状态到UI
        this.battleStore.setBattleActive(true);
      }
    } catch (error) {
      battleLogManager.error('处理战斗状态更新事件时出错:', error);
    }
  }

  /**
   * 处理战斗结束事件
   */
  private handleBattleEndEvent(data: BattleEndedEventData) {
    try {
      this.battleStore.setBattleActive(false);
      this.battleStore.setAutoPlayMode(false);
      // 记录战斗结束日志
      if (data && data.winner) {
        this.battleStore.addBattleLog({
          turn: '战斗结束',
          source: '系统',
          action: '宣布',
          target: '',
          result: `战斗结束！胜利者: ${data.winner === 'ALLY' ? '我方' : '敌方'}`,
          level: 'system'
        });
      }
    } catch (error) {
      battleLogManager.error('处理战斗结束事件时出错:', error);
    }
  }

  /**
   * 处理回合开始事件
   */
  private handleTurnStartEvent(data: { battleId: string; turn: number; actorId: string }) {
    try {
      if (data && data.actorId) {
        this.battleStore.setCurrentActorId(data.actorId);
        // 记录回合开始日志
        this.battleStore.addBattleLog({
          turn: `回合${data.turn}`,
          source: '系统',
          action: '开始',
          target: '',
          result: `回合${data.turn}开始，当前行动者: ${data.actorId}`,
          level: 'system'
        });
      }
    } catch (error) {
      battleLogManager.error('处理回合开始事件时出错:', error);
    }
  }

  /**
   * 处理回合结束事件
   */
  private handleTurnEndEvent(data: { battleId: string; turn: number }) {
    try {
      if (data) {
        // 回合结束处理
        this.battleStore.addBattleLog({
          turn: `回合${data.turn}`,
          source: '系统',
          action: '结束',
          target: '',
          result: `回合${data.turn}结束`,
          level: 'system'
        });
      }
    } catch (error) {
      battleLogManager.error('处理回合结束事件时出错:', error);
    }
  }
}

// 导出单例实例
export const battleEventManager = new BattleEventManager();
