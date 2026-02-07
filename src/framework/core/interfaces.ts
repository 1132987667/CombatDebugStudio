/**
 * 通用战斗框架 - 核心接口定义
 * 
 * 设计原则：
 * 1. 接口隔离原则 - 每个接口职责单一
 * 2. 依赖倒置原则 - 依赖抽象而非具体实现
 * 3. 开闭原则 - 对扩展开放，对修改关闭
 * 4. 配置驱动 - 支持外部配置和运行时调整
 */

/**
 * 框架配置接口
 */
export interface FrameworkConfig {
  /** 框架版本 */
  version: string;
  /** 调试模式开关 */
  debug: boolean;
  /** 性能监控开关 */
  performanceMonitoring: boolean;
  /** 日志级别 */
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /** 资源限制配置 */
  resourceLimits: {
    maxBattles: number;
    maxParticipants: number;
    maxActionsPerBattle: number;
  };
}

/**
 * 战斗实体基础接口
 */
export interface BattleEntity {
  /** 实体唯一标识 */
  readonly id: string;
  /** 实体名称 */
  readonly name: string;
  /** 实体类型 */
  readonly type: string;
  /** 是否存活 */
  isAlive(): boolean;
  /** 获取当前生命值 */
  getCurrentHealth(): number;
  /** 获取最大生命值 */
  getMaxHealth(): number;
}

/**
 * 战斗参与者接口
 */
export interface BattleParticipant extends BattleEntity {
  /** 能量值 */
  readonly energy: number;
  /** 最大能量值 */
  readonly maxEnergy: number;
  /** 速度值（用于回合顺序计算） */
  readonly speed: number;
  /** 技能列表 */
  readonly skills: Skill[];
  /** 状态效果列表 */
  readonly statusEffects: StatusEffect[];
  /** 属性加成 */
  readonly attributes: BattleAttributes;
}

/**
 * 技能接口
 */
export interface Skill {
  /** 技能ID */
  readonly id: string;
  /** 技能名称 */
  readonly name: string;
  /** 技能类型 */
  readonly type: SkillType;
  /** 技能消耗 */
  readonly cost: SkillCost;
  /** 技能效果 */
  readonly effects: SkillEffect[];
  /** 冷却时间 */
  readonly cooldown: number;
  /** 是否可用 */
  isAvailable(participant: BattleParticipant): boolean;
  /** 执行技能 */
  execute(caster: BattleParticipant, targets: BattleParticipant[]): SkillResult;
}

/**
 * 状态效果接口
 */
export interface StatusEffect {
  /** 效果ID */
  readonly id: string;
  /** 效果名称 */
  readonly name: string;
  /** 效果类型 */
  readonly type: EffectType;
  /** 持续时间 */
  readonly duration: number;
  /** 剩余时间 */
  remainingTurns: number;
  /** 效果应用 */
  apply(target: BattleParticipant): void;
  /** 效果移除 */
  remove(target: BattleParticipant): void;
  /** 每回合效果 */
  onTurnStart(target: BattleParticipant): void;
  /** 回合结束效果 */
  onTurnEnd(target: BattleParticipant): void;
}

/**
 * 战斗动作接口
 */
export interface BattleAction {
  /** 动作ID */
  readonly id: string;
  /** 动作类型 */
  readonly type: ActionType;
  /** 来源参与者ID */
  readonly sourceId: string;
  /** 目标参与者ID */
  readonly targetId: string;
  /** 技能ID（如果是技能动作） */
  readonly skillId?: string;
  /** 时间戳 */
  readonly timestamp: number;
  /** 回合号 */
  readonly turn: number;
  /** 动作结果 */
  readonly result: ActionResult;
}

/**
 * 战斗状态接口
 */
export interface BattleState {
  /** 战斗ID */
  readonly battleId: string;
  /** 参与者映射 */
  readonly participants: Map<string, BattleParticipant>;
  /** 动作历史 */
  readonly actions: BattleAction[];
  /** 回合顺序 */
  readonly turnOrder: string[];
  /** 当前回合 */
  readonly currentTurn: number;
  /** 战斗是否活跃 */
  readonly isActive: boolean;
  /** 开始时间 */
  readonly startTime: number;
  /** 结束时间 */
  readonly endTime?: number;
  /** 胜利者 */
  readonly winner?: string;
}

/**
 * 战斗系统核心接口
 */
export interface IBattleSystem {
  /** 创建战斗 */
  createBattle(config: BattleConfig): BattleState;
  /** 处理回合 */
  processTurn(battleId: string): Promise<void>;
  /** 执行动作 */
  executeAction(action: BattleAction): Promise<BattleAction>;
  /** 获取战斗状态 */
  getBattleState(battleId: string): BattleState | undefined;
  /** 结束战斗 */
  endBattle(battleId: string, winner: string): void;
  /** 获取所有战斗 */
  getAllBattles(): BattleState[];
  /** 获取活跃战斗 */
  getActiveBattles(): BattleState[];
  /** 清理已完成战斗 */
  clearCompletedBattles(): void;
}

/**
 * 回合管理器接口
 */
export interface ITurnManager {
  /** 计算回合顺序 */
  calculateTurnOrder(participants: BattleParticipant[]): string[];
  /** 获取当前回合 */
  getCurrentTurn(battleId: string): number;
  /** 推进回合 */
  advanceTurn(battleId: string): void;
  /** 获取当前行动者 */
  getCurrentActor(battleId: string): BattleParticipant | undefined;
}

/**
 * AI系统接口
 */
export interface IAISystem {
  /** 创建AI实例 */
  createAIInstance(participant: BattleParticipant): BattleAI;
  /** 做出决策 */
  makeDecision(battleState: BattleState, participant: BattleParticipant): BattleAction;
  /** 选择目标 */
  selectTarget(battleState: BattleState, participant: BattleParticipant): string;
  /** 判断是否使用技能 */
  shouldUseSkill(participant: BattleParticipant): boolean;
}

/**
 * 配置管理器接口
 */
export interface IConfigManager {
  /** 加载配置 */
  loadConfig<T>(key: string): T | undefined;
  /** 保存配置 */
  saveConfig<T>(key: string, config: T): void;
  /** 监听配置变化 */
  onConfigChange<T>(key: string, callback: (newConfig: T) => void): void;
  /** 获取所有配置 */
  getAllConfigs(): Record<string, any>;
}

/**
 * 插件管理器接口
 */
export interface IPluginManager {
  /** 注册插件 */
  registerPlugin(plugin: Plugin): void;
  /** 卸载插件 */
  unregisterPlugin(pluginId: string): void;
  /** 获取插件 */
  getPlugin(pluginId: string): Plugin | undefined;
  /** 获取所有插件 */
  getAllPlugins(): Plugin[];
  /** 初始化插件 */
  initializePlugins(): Promise<void>;
}

/**
 * 插件接口
 */
export interface Plugin {
  /** 插件ID */
  readonly id: string;
  /** 插件名称 */
  readonly name: string;
  /** 插件版本 */
  readonly version: string;
  /** 插件描述 */
  readonly description: string;
  /** 初始化插件 */
  initialize(config: any): Promise<void>;
  /** 销毁插件 */
  destroy(): Promise<void>;
  /** 获取插件配置 */
  getConfig(): any;
}

/**
 * 事件系统接口
 */
export interface IEventSystem {
  /** 注册事件监听器 */
  on(event: string, listener: EventListener): void;
  /** 取消事件监听器 */
  off(event: string, listener: EventListener): void;
  /** 触发事件 */
  emit(event: string, data?: any): void;
  /** 一次性事件监听器 */
  once(event: string, listener: EventListener): void;
}

/**
 * 类型定义
 */
export type SkillType = 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate';
export type EffectType = 'buff' | 'debuff' | 'control' | 'damage_over_time' | 'heal_over_time';
export type ActionType = 'skill' | 'attack' | 'defend' | 'item' | 'flee';

export interface SkillCost {
  energy?: number;
  health?: number;
  cooldown?: number;
}

export interface SkillEffect {
  type: EffectType;
  value: number;
  duration?: number;
  target: 'self' | 'enemy' | 'ally' | 'all';
}

export interface BattleAttributes {
  attack: number;
  defense: number;
  speed: number;
  criticalChance: number;
  criticalDamage: number;
  dodgeChance: number;
}

export interface ActionResult {
  success: boolean;
  damage?: number;
  heal?: number;
  critical?: boolean;
  dodge?: boolean;
  effects?: StatusEffect[];
  message?: string;
}

export interface BattleConfig {
  participants: BattleParticipant[];
  rules?: BattleRules;
  environment?: BattleEnvironment;
}

export interface BattleRules {
  maxTurns?: number;
  allowFlee?: boolean;
  enableCritical?: boolean;
  enableDodge?: boolean;
  turnOrder?: 'speed' | 'random' | 'fixed';
}

export interface BattleEnvironment {
  terrain?: string;
  weather?: string;
  timeOfDay?: string;
}

export type EventListener = (data?: any) => void;

export interface BattleAI {
  participant: BattleParticipant;
  makeDecision(battleState: BattleState): BattleAction;
}

export interface SkillResult {
  success: boolean;
  actions: BattleAction[];
  effects: StatusEffect[];
}

/**
 * 依赖注入令牌
 */
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem');
export const TURN_MANAGER_TOKEN = Symbol('TurnManager');
export const AI_SYSTEM_TOKEN = Symbol('AISystem');
export const CONFIG_MANAGER_TOKEN = Symbol('ConfigManager');
export const PLUGIN_MANAGER_TOKEN = Symbol('PluginManager');
export const EVENT_SYSTEM_TOKEN = Symbol('EventSystem');