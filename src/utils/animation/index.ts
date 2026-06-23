/**
 * @deprecated 请使用 '@/infrastructure/animation' 替代。此文件将在 Phase 8 中删除。
 */
export {
  AnimationStrategy,
  AnimationContext,
  BaseAnimationStrategy,
  NoopAnimationStrategy,
} from '@/infrastructure/animation/AnimationStrategy'

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
} from '@/infrastructure/animation/GsapAnimationEngine'

export {
  AnimationOrchestrator,
  AnimationSequence,
  AnimationTask,
  OrchestratorConfig,
  AnimationSequenceBuilder,
} from '@/infrastructure/animation/AnimationOrchestrator'

export {
  AnimationElementManager,
  PoolConfig,
  PooledElement,
  animationElementManager,
} from '@/infrastructure/animation/AnimationElementManager'
