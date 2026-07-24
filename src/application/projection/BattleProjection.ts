/**
 * BattleProjection.ts — 投影层调度器
 *
 * 职责：
 * 1. 注册参与者并注入脏回调（setDirtyCallback）
 * 2. 收集一帧内所有 dirty 的参与者
 * 3. 用 queueMicrotask 批处理，一帧最多投影一次
 * 4. 调用 participantToSnapshot 外部映射器生成快照
 * 5. 将快照写入 Store 的响应式状态
 *
 * 设计原则：
 * - 投影层是领域层和表现层之间的桥梁，不修改任何一方的代码
 * - 领域层通过 setDirtyCallback 接受一个"变更通知"回调，不知道谁在监听
 * - microtask 批处理保证一回合内多次变更只触发一次重渲染
 */

import { participantToSnapshot } from '@/application/projection/participantMapper'
import type { UIParticipantSnapshot } from '@/shared/types/projection'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'

/**
 * Store 层需要暴露的接口
 */
export interface ParticipantStore {
  participants: Map<string, UIParticipantSnapshot>
}

/**
 * 可脏标记的实体接口
 * 实现了 setDirtyCallback 的实体可以通知投影层自身变更
 */
interface DirtyObservable {
  setDirtyCallback(cb: () => void): void
}

function isDirtyObservable(entity: BattleEntity): entity is BattleEntity & DirtyObservable {
  return typeof (entity as any).setDirtyCallback === 'function'
}

export class BattleProjection {
  /** 脏标记集合 — 一帧内待投影的参与者 ID */
  private dirtyIds = new Set<string>()
  /** 是否已调度 microtask flush */
  private scheduled = false
  /** 注册的参与者 { id → entity } */
  private entities = new Map<string, BattleEntity>()
  /** 缓存版本号，用于跳过无变化写入 */
  private lastVersions = new Map<string, number>()

  constructor(
    private store: ParticipantStore,
    private buffSystem: BuffSystem,
  ) {}

  /**
   * 注册参与者，通过 setDirtyCallback 注入变更通知
   */
  register(entity: BattleEntity): void {
    const id = entity.id
    this.entities.set(id, entity)

    // 注入脏回调 — 领域实体属性变更后调用 markDirty
    if (isDirtyObservable(entity)) {
      const projection = this
      entity.setDirtyCallback(() => projection.markDirty(id))
    }
  }

  /**
   * 批量注册参与者
   */
  registerAll(entities: BattleEntity[]): void {
    for (const entity of entities) {
      this.register(entity)
    }
  }

  /**
   * 移除参与者
   */
  unregister(id: string): void {
    this.entities.delete(id)
    this.dirtyIds.delete(id)
    this.lastVersions.delete(id)
  }

  /**
   * 清空所有注册
   */
  clear(): void {
    this.entities.clear()
    this.dirtyIds.clear()
    this.lastVersions.clear()
    this.scheduled = false
  }

  /**
   * 标记参与者为脏（被领域实体回调调用）
   */
  markDirty(id: string): void {
    this.dirtyIds.add(id)
    this.scheduleFlush()
  }

  /**
   * 全量投影所有已注册参与者
   */
  flushAll(): void {
    for (const id of this.entities.keys()) {
      this.dirtyIds.add(id)
    }
    this.flush()
  }

  /**
   * microtask 批处理调度
   */
  private scheduleFlush(): void {
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.flush()
    })
  }

  /**
   * 执行投影：对每个脏参与者拍照 → 写入 Store
   */
  private flush(): void {
    const toProcess = [...this.dirtyIds]
    this.dirtyIds.clear()

    for (const id of toProcess) {
      try {
        const entity = this.entities.get(id)
        if (!entity) continue

        // 版本检查：跳过无变化写入
        if (entity.statsVersion === this.lastVersions.get(id)) continue
        this.lastVersions.set(id, entity.statsVersion)
        const snap = participantToSnapshot(entity, this.buffSystem)
        if (this.store.participants.has(id)) {
          // 就地更新，保持 reactive 对象引用不变
          Object.assign(this.store.participants.get(id)!, snap)
        } else {
          // 首次：reactive Map 的 set() 自动将对象转为响应式
          this.store.participants.set(id, snap)
        }
      } catch (err) {
        console.error(`[BattleProjection] flush 失败 (id=${id}):`, err)
      }
    }
  }
}
