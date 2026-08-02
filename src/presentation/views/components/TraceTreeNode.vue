<!--
 * 文件: TraceTreeNode.vue
 * 功能: 递归树节点组件
 * 描述: 渲染一个 TraceEventNode 节点及其子节点，支持可折叠。
 *       节点行 = 行动序号(由 TraceLogTree 提供) + 角色徽章 + phase 徽章 + summary；
 *       trace 级别行提供"复制"按钮（复制该节点完整 JSON）。
 *       展开后由 TracePayloadViewer 渲染 payload 解读视图（steps 效果链 / key-value 网格）。
-->

<template>
  <div class="trace-node">
    <div class="trace-row" :class="[
      'phase-' + node.phase,
      {
        'is-expandable': hasChildren,
        'is-expanded': expanded,
        'is-trace': node.level === 'trace',
      },
    ]" :tabindex="hasChildren ? 0 : undefined" @click="toggle" @keydown.enter="toggle"
      @keydown.space.prevent="toggle">
      <!-- 展开/折叠箭头（展开时旋转 90°） -->
      <span v-if="hasChildren" class="trace-arrow" :class="{ rotated: expanded }">▶</span>
      <span v-else class="trace-arrow trace-arrow-placeholder"> </span>

      <!-- 角色徽章（ID → 名字映射，不向开发者暴露内部 ID） -->
      <span v-if="actorLabel" class="actor-badge" :title="actorTitle">{{ actorLabel }}</span>

      <!-- phase 徽章 -->
      <span class="phase-badge" :class="'phase-' + node.phase">{{ node.phase }} · {{ phaseLabel(node.phase) }}</span>

      <!-- 摘要 -->
      <span class="trace-summary">{{ node.summary }}</span>

      <!-- 判定徽章：被动触发 ✓/✗、伤害暴击 ★（从 payload 提炼，不藏细节） -->
      <span v-if="verdict" class="verdict-badge" :class="verdict.cls">{{ verdict.text }}</span>

      <!-- 相对上一事件耗时 -->
      <span v-if="elapsedMs !== null" class="elapsed-tag" :title="'相对父事件耗时'">⏱ {{ elapsedMs }}ms</span>

      <!-- trace 级别标记 + 复制（trace 行展示最细粒度数据，提供一键复制） -->
      <span v-if="node.level === 'trace'" class="level-tag">trace</span>
      <button
        v-if="node.level === 'trace'"
        class="copy-btn"
        :title="'复制该条数据 (JSON)'"
        @click.stop="copyNode"
      >{{ copied ? '已复制' : '复制' }}</button>
    </div>

    <!-- payload 解读视图 -->
    <div v-if="expanded && hasPayload" class="trace-payload">
      <TracePayloadViewer :payload="node.payload" />
    </div>

    <!-- 子节点 -->
    <div v-if="expanded && hasChildren" class="trace-children">
      <TraceTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :actor-names="actorNames"
        :parent-timestamp="node.timestamp"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { TracePhase, TracePhaseLabel, type TraceEventNode } from '@/shared/types/trace-event'
import TracePayloadViewer from './TracePayloadViewer.vue'

interface Props {
  node: TraceEventNode
  depth: number
  /** 实体 ID → 角色名 映射（来自 battleStore 投影快照），未映射回退 ID */
  actorNames?: Record<string, string>
  /** 父事件 timestamp（performance.now），用于显示相对耗时 */
  parentTimestamp?: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  actorNames: () => ({}),
  parentTimestamp: undefined,
})

const expanded = ref(props.depth < 1) // 第一层默认展开

const hasChildren = computed(() => !!props.node.children && props.node.children.length > 0)

const hasPayload = computed(() => Object.keys(props.node.payload ?? {}).length > 0)

const toggle = () => {
  if (hasChildren.value) expanded.value = !expanded.value
}

/** phase 显示标签：英文值 + 中文名（未知 phase 回退英文原值） */
const phaseLabel = (p: string): string => TracePhaseLabel[p as TracePhase] ?? p

/** 角色徽章文本：source → target（同名或单方时只显示一个；未映射回退 ID） */
const actorLabel = computed(() => {
  const src = props.node.sourceId ? props.actorNames[props.node.sourceId] : undefined
  const tgt = props.node.targetId ? props.actorNames[props.node.targetId] : undefined
  if (!src && !tgt) return ''
  if (!tgt || tgt === src) return src || tgt
  return `${src || props.node.sourceId} → ${tgt}`
})

const actorTitle = computed(() => {
  const parts = []
  if (props.node.sourceId) parts.push(`来源: ${props.actorNames[props.node.sourceId] ?? props.node.sourceId}`)
  if (props.node.targetId) parts.push(`目标: ${props.actorNames[props.node.targetId] ?? props.node.targetId}`)
  return parts.join(' · ')
})

/** 相对父事件耗时（ms）；根节点无父则不显示 */
const elapsedMs = computed(() => {
  if (props.parentTimestamp === undefined) return null
  const d = props.node.timestamp - props.parentTimestamp
  return d >= 0 ? d.toFixed(2) : null
})

/** 判定徽章：passive 触发/跳过、伤害暴击（payload 提炼，结果显性） */
const verdict = computed<{ text: string; cls: string } | null>(() => {
  const p = props.node.payload
  if (props.node.phase === TracePhase.PASSIVE_TRIGGER) {
    if (p.verdict === 'TRIGGERED') return { text: '✓ 触发', cls: 'ok' }
    if (p.verdict === 'SKIPPED') return { text: '✗ 跳过', cls: 'skip' }
    return null
  }
  if (props.node.phase === TracePhase.DAMAGE_CALCULATION) {
    const crit = p.crit as { triggered?: boolean } | undefined
    if (crit?.triggered) return { text: '★ 暴击', cls: 'crit' }
    return null
  }
  return null
})

/** 复制该节点完整数据（含子节点）到剪贴板，成功后短暂反馈"已复制" */
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

const copyNode = async () => {
  const text = JSON.stringify(props.node, null, 2)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 兜底：非安全上下文（非 localhost 的 http）下 Clipboard API 不可用
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<style scoped lang="scss">
/* ═══ phase → RGB 分量映射（行色条 + 徽章共用，保证色彩一致） ═══
   计算类用饱和语义色；流程/配置类归蓝灰中性组，克制不彩虹 */
$phase-rgbs: (
  'damage_calculation': var(--rgb-danger),
  'heal_calculation': var(--rgb-success),
  'buff_lifecycle': var(--rgb-energy),
  'buff_trigger': var(--rgb-energy),
  'passive_trigger': var(--rgb-debuff),
  'ai_decision': var(--rgb-warning),
  'action_execution': var(--rgb-skill-active),
  'battle_lifecycle': var(--rgb-skill-active),
  'turn_flow': var(--rgb-shield),
  'attribute_recalc': var(--rgb-skill-active),
  'config_load': var(--rgb-neutral),
  'config_validation': var(--rgb-neutral),
);

.trace-node {
  user-select: none;
}

/* ═══ 行 ═══ */
.trace-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px var(--space-2);
  min-height: 28px;
  border-left: 3px solid transparent; /* phase 色条锚点 */
  border-radius: var(--radius-md);
  cursor: default;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:hover {
    background: var(--color-bg-hover);

    .trace-arrow {
      color: var(--color-text-secondary);
    }
  }

  &.is-expandable {
    cursor: pointer;
  }

  /* 键盘可达：焦点环 */
  &:focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: -2px;
  }

  /* phase 色条 + 徽章配色 */
  @each $phase, $rgb in $phase-rgbs {
    &.phase-#{$phase} {
      border-left-color: rgb($rgb);

      .phase-badge {
        color: rgb($rgb);
        background: rgba($rgb, 0.12);
        border-color: rgba($rgb, 0.35);
      }
    }
  }

  /* trace 行：细节行整体降级（色条/徽章/摘要），hover 仅轻微恢复 */
  &.is-trace {
    border-left-color: var(--color-border-default);

    .phase-badge {
      color: var(--color-text-tertiary);
      background: var(--color-bg-tertiary);
      border-color: var(--color-border-default);
    }

    .trace-summary {
      color: var(--color-text-tertiary);
    }

    &:hover {
      background: var(--color-bg-hover);

      .trace-summary {
        color: var(--color-text-secondary);
      }
    }
  }
}

/* ═══ 箭头 ═══ */
.trace-arrow {
  display: inline-block;
  width: 14px;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  text-align: center;
  font-size: 0.65em;
  transition:
    transform var(--transition-fast),
    color var(--transition-fast);

  &.rotated {
    transform: rotate(90deg);
  }
}

.trace-arrow-placeholder {
  visibility: hidden;
}

/* ═══ 角色徽章：中性灰胶囊（ID → 名字映射，不暴露内部 ID） ═══ */
.actor-badge {
  font-size: var(--font-size-xs);
  line-height: 1.5;
  padding: 0 7px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  white-space: nowrap;
  max-width: 12em;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ═══ phase 徽章（暗底胶囊：同色文字 + 半透明底 + 细边框） ═══ */
.phase-badge {
  font-size: var(--font-size-xs);
  line-height: 1.5;
  padding: 0 7px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

/* ═══ 摘要 ═══ */
.trace-summary {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  flex: 1;
  min-width: 8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ═══ 判定徽章（✓/★，结果显性） ═══ */
.verdict-badge {
  font-size: var(--font-size-xs);
  line-height: 1.5;
  padding: 0 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  white-space: nowrap;

  &.ok {
    color: var(--color-success);
    background: rgba(var(--rgb-success), 0.12);
    border: 1px solid rgba(var(--rgb-success), 0.35);
  }

  &.skip {
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
  }

  &.crit {
    color: var(--color-warning);
    background: rgba(var(--rgb-warning), 0.12);
    border: 1px solid rgba(var(--rgb-warning), 0.35);
  }
}

/* ═══ 相对耗时 ═══ */
.elapsed-tag {
  font-size: var(--font-size-xxs);
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  flex-shrink: 0;
  opacity: 0.8;
  white-space: nowrap;
}

/* ═══ trace 级别标签 ═══ */
.level-tag {
  font-size: var(--font-size-xxs);
  line-height: 1.7;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-tertiary);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* ═══ 复制按钮：低调胶囊，hover 浮现 info 色 ═══ */
.copy-btn {
  background: transparent;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-full);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xxs);
  line-height: 1.7;
  padding: 0 7px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);

  &:hover {
    color: var(--color-info);
    border-color: rgba(var(--rgb-info), var(--alpha-border));
    background: rgba(var(--rgb-info), var(--alpha-tint));
  }
}

/* ═══ 子节点：左缘虚线引导树层级，缩进对齐父行内容起点 ═══ */
.trace-children {
  margin-left: 24px;
  padding-left: 8px;
  border-left: 1px dashed var(--color-border-tertiary);
}

/* ═══ payload 解读视图容器（渲染委托 TracePayloadViewer） ═══ */
.trace-payload {
  margin: 4px 0 4px 24px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
}
</style>
