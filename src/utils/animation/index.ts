/**
 * 文件：animation.ts
 * 功能：动画系统统一导出
 * 描述：提供动画系统的完整 API 导出
 */

// 策略层
export {
  AnimationStrategy,
  AnimationContext,
  BaseAnimationStrategy,
  NoopAnimationStrategy,
} from './AnimationStrategy'

// GSAP 引擎适配层
export {
  BaseGsapStrategy,
  MoveStrategy,
  FadeStrategy,
  ScaleStrategy,
  ShakeStrategy,
  FloatingTextStrategy,
  SequenceStrategy,
  ParallelStrategy,
  GsapAnimationConfig,
} from './GsapAnimationEngine'

// 编排层
export {
  AnimationOrchestrator,
  AnimationSequence,
  AnimationTask,
  OrchestratorConfig,
  AnimationSequenceBuilder,
} from './AnimationOrchestrator'

// 资源管理层
export {
  AnimationElementManager,
  PoolConfig,
  PooledElement,
  animationElementManager,
} from './AnimationElementManager'

// 具体策略实现（待创建）
// export { AttackAnimationStrategy } from './strategies/AttackAnimationStrategy'
// export { HitAnimationStrategy } from './strategies/HitAnimationStrategy'
// export { BuffAnimationStrategy } from './strategies/BuffAnimationStrategy'
// export { DeathAnimationStrategy } from './strategies/DeathAnimationStrategy'
