import { ref, computed } from 'vue';
import type { IBattleSystem } from '@/core/battle/interfaces';
import { BattleStateManager } from '@/core/battle/state/BattleStateManager';
import { getBattleLogManager } from '@/core/battle/logs/BattleLogManager';

/**
 * 自动战斗管理器
 * 负责自动战斗的控制、状态管理和错误处理
 */
export class AutoBattleManager {
  private battleSystem: IBattleSystem;
  private battleStateManager: BattleStateManager;
  private battleLogManager = getBattleLogManager();
  private isAutoPlaying = ref(false);
  private isPaused = ref(true);
  private battleSpeed = ref(1);
  private battleId = ref<string | null>(null);
  private autoBattleTaskId: symbol | null = null;

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   */
  constructor(battleSystem: IBattleSystem, battleStateManager: BattleStateManager) {
    this.battleSystem = battleSystem;
    this.battleStateManager = battleStateManager;
  }

  /**
   * 获取是否自动播放
   */
  getIsAutoPlaying() {
    return this.isAutoPlaying;
  }

  /**
   * 获取是否暂停
   */
  getIsPaused() {
    return this.isPaused;
  }

  /**
   * 获取战斗速度
   */
  getBattleSpeed() {
    return this.battleSpeed;
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    this.battleId.value = battleId;
  }

  /**
   * 开始自动战斗
   */
  async startAutoBattle() {
    if (!this.battleId.value) {
      this.battleLogManager.addSystemLog('请先创建战斗');
      return;
    }

    try {
      this.isAutoPlaying.value = true;
      this.isPaused.value = false;

      // 启动自动战斗
      this.battleSystem.startAutoBattle();

      // 设置战斗速度
      this.battleSystem.setBattleSpeed(this.battleId.value, this.battleSpeed.value);

      this.battleLogManager.addSystemLog('开始自动战斗');

      // 同步战斗状态
      this.battleStateManager.syncBattleState();
    } catch (error) {
      console.error('开始自动战斗时出错:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.battleLogManager.addErrorLog(`开始自动战斗时出错: ${errorMsg}`);
      this.isAutoPlaying.value = false;
      this.isPaused.value = true;
    }
  }

  /**
   * 停止自动战斗
   */
  async stopAutoBattle() {
    if (!this.battleId.value) {
      return;
    }

    try {
      // 停止自动战斗
      this.battleSystem.stopAutoBattle(this.battleId.value);

      this.isAutoPlaying.value = false;
      this.isPaused.value = true;

      this.battleLogManager.addSystemLog('停止自动战斗');
    } catch (error) {
      console.error('停止自动战斗时出错:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.battleLogManager.addErrorLog(`停止自动战斗时出错: ${errorMsg}`);
    }
  }

  /**
   * 切换自动战斗状态
   */
  async toggleAutoPlay() {
    if (this.isAutoPlaying.value) {
      await this.stopAutoBattle();
    } else {
      await this.startAutoBattle();
    }
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    if (this.isAutoPlaying.value) {
      // 如果正在自动播放，先停止自动播放
      this.stopAutoBattle();
    }
    this.isPaused.value = !this.isPaused.value;
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  setSpeed(speed: number) {
    this.battleSpeed.value = speed;

    // 如果正在自动播放，更新战斗引擎的速度设置
    if (this.isAutoPlaying.value && this.battleId.value) {
      try {
        this.battleSystem.setBattleSpeed(this.battleId.value, speed);
        this.battleLogManager.addSystemLog(`战斗速度已调整为: ${speed}倍`);
      } catch (error) {
        console.error('设置战斗速度时出错:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.battleLogManager.addErrorLog(`设置战斗速度时出错: ${errorMsg}`);
      }
    }
  }

  /**
   * 执行单个回合
   */
  async executeSingleTurn() {
    if (!this.battleId.value) {
      this.battleLogManager.addSystemLog('请先开始战斗');
      return;
    }

    try {
      this.isPaused.value = false;

      // 执行战斗回合
      await this.battleSystem.processTurn(this.battleId.value);

      // 同步战斗状态
      this.battleStateManager.syncBattleState();

      // 同步战斗日志
      const battleState = this.battleSystem.getBattleState(this.battleId.value);
      if (battleState) {
        await this.battleLogManager.syncBattleLogs(battleState);
      }

      this.isPaused.value = true;
    } catch (error) {
      console.error('执行回合时出错:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.battleLogManager.addErrorLog(`执行回合时出错: ${errorMsg}`);
      this.isPaused.value = true;
    }
  }

  /**
   * 重置自动战斗状态
   */
  resetState() {
    this.isAutoPlaying.value = false;
    this.isPaused.value = true;
    this.battleSpeed.value = 1;
    if (this.autoBattleTaskId) {
      // 清理任务
      this.autoBattleTaskId = null;
    }
  }
}
