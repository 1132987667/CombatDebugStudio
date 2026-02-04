import { Container } from '../di/Container';
import { 
  IBattleSystem, 
  ITurnManager, 
  IActionExecutor, 
  IParticipantManager, 
  IAISystem,
  BATTLE_SYSTEM_TOKEN,
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  PARTICIPANT_MANAGER_TOKEN,
  AI_SYSTEM_TOKEN
} from './interfaces';
import { GameBattleSystem } from '../BattleSystem';
import { TurnManager } from './TurnManager';
import { ActionExecutor } from './ActionExecutor';
import { ParticipantManager } from './ParticipantManager';
import { AISystem } from './AISystem';

export class BattleSystemFactory {
  private static container = Container.getInstance();

  public static initialize(): void {
    // 注册核心服务
    this.container.register<ITurnManager>(TURN_MANAGER_TOKEN.toString(), new TurnManager());
    this.container.register<IActionExecutor>(ACTION_EXECUTOR_TOKEN.toString(), new ActionExecutor());
    this.container.register<IParticipantManager>(PARTICIPANT_MANAGER_TOKEN.toString(), new ParticipantManager());
    this.container.register<IAISystem>(AI_SYSTEM_TOKEN.toString(), new AISystem());
    
    // 注册战斗系统（使用工厂模式避免单例）
    this.container.registerFactory<IBattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
      () => new GameBattleSystem(),
      false // 非单例模式
    );
  }

  public static createBattleSystem(): IBattleSystem {
    return this.container.resolve<IBattleSystem>(BATTLE_SYSTEM_TOKEN.toString());
  }

  public static getTurnManager(): ITurnManager {
    return this.container.resolve<ITurnManager>(TURN_MANAGER_TOKEN.toString());
  }

  public static getActionExecutor(): IActionExecutor {
    return this.container.resolve<IActionExecutor>(ACTION_EXECUTOR_TOKEN.toString());
  }

  public static getParticipantManager(): IParticipantManager {
    return this.container.resolve<IParticipantManager>(PARTICIPANT_MANAGER_TOKEN.toString());
  }

  public static getAISystem(): IAISystem {
    return this.container.resolve<IAISystem>(AI_SYSTEM_TOKEN.toString());
  }

  public static reset(): void {
    // 重置容器（用于测试）
    this.container = Container.getInstance();
    // 清空所有服务
    // 注意：实际实现中需要更复杂的重置逻辑
  }
}