<template>
  <div class="ht-cmd">
    <div class="ht-mode-switch" role="tablist" aria-label="双工作台切换">
      <button type="button" role="tab" title="回放系统：按时间戳播放，StateDelta 快照跳转（快捷键 1）"
        :aria-selected="store.mode === 'replay'" :class="{ on: store.mode === 'replay' }" @click="store.setMode('replay')">
        回放系统 <span class="k">1</span>
      </button>
      <button type="button" role="tab" title="调试系统：时间线树 / 卡片流 / RNG 凭证，按因果链消费（快捷键 2）"
        :aria-selected="store.mode === 'debug'" :class="{ on: store.mode === 'debug' }" @click="store.setMode('debug')">
        调试系统 <span class="k">2</span>
      </button>
    </div>

    <div class="ht-cmd-spacer"></div>

    <Button title="查看昊天镜快捷键" :active="hintOpen" @click="toggleHint()">快捷键</Button>
    <Button title="查看事件阶段图例（颜色与图标含义）" :active="legendOpen" @click="toggleLegend()">图例</Button>

    <div v-if="hintOpen" class="ht-hint-pop">
      <div class="ht-hint-title">昊天镜快捷键</div>
      <div class="ht-hint-grid">
        <div v-for="h in hintRows" :key="h.keys" class="ht-hint-row">
          <span class="ht-hint-keys">{{ h.keys }}</span>
          <span class="ht-hint-desc">{{ h.desc }}</span>
        </div>
      </div>
    </div>

    <div v-if="legendOpen" class="ht-hint-pop ht-legend-pop">
      <div class="ht-hint-title">事件阶段图例</div>
      <div class="ht-legend-grid">
        <div v-for="row in legendRows" :key="row.cls" class="ht-legend-row">
          <span class="ht-legend-ico" :class="'ht-' + row.cls">{{ row.icon }}</span>
          <span class="ht-legend-label">{{ row.label }}</span>
          <span v-if="row.debugOnly" class="ht-legend-dbg">调试</span>
        </div>
      </div>
    </div>

    <!-- 加载：数据源 / 战斗记录（记录直接列在下拉中，展开自动刷新） -->
    <div class="ht-cmd-group">
      <TacticalSelect :model-value="pickVal" size="md" searchable :options="combinedOptions"
        placeholder="选择战斗记录"
        title="数据源：演示存档 / 压测合成 / 实时战斗；下方列出唤灵台保存的词牌名战斗记录"
        @visible-change="onPickOpen" @update:model-value="onPick" />
    </div>

    <!-- 分析：断点 / 对比 / 摘要 / 书签 -->
    <div class="ht-cmd-group">
      <Button :active="store.bpArmed" title="配置条件断点（伤害/级别/随机值/单位），播放命中自动暂停定位" @click="store.bpOpen = true">断点</Button>
      <Button title="与另一份存档逐链路对比差异（分支 diff：生成示例分支 / 从战斗记录选 / 载入 JSON）" @click="store.diffOpen = true">分支对比</Button>
      <Button title="战斗摘要：回合数/胜方/每单位输出/承伤/暴击/闪避/抵抗/Buff/击杀，支持 Markdown 与 CSV 导出" @click="store.sumOpen = true">摘要</Button>
      <Button :active="store.bookmarkOpen" title="书签列表（快捷键 K）：收藏事件的快速跳转" @click="store.toggleBookmarkPanel()">
        书签{{ store.bookmarkCount ? ` · ${store.bookmarkCount}` : '' }}
      </Button>
    </div>

    <!-- 运维：记录管理 / 导入 / 导出 / 会话 / 深链 -->
    <div class="ht-cmd-group">
      <Button title="管理 IndexedDB 中已保存的战斗记录（查看 / 刷新 / 删除）" @click="recMgrOpen = true">记录管理</Button>
      <Button title="导入统一存档 JSON（唤灵台战报「导出 JSON」的完整存档，回放/调试双工作台可用）"
        @click="archiveInput?.click()">导入存档</Button>
      <Button variant="energy" title="导出统一存档 JSON（一份文件，回放与调试两种能力）" @click="store.exportArchive()">导出存档</Button>
      <Button :active="opsOpen" title="导出/导入调试会话、复制事件定位链接" @click="opsOpen = !opsOpen">会话 ▾</Button>
      <div v-if="opsOpen" class="ht-ops-pop">
        <button type="button" class="ht-ops-item" title="导出调试会话：模式 + 书签 + 断点 + 过滤，一键复现调试现场" @click="store.exportSession()">
          导出调试会话
        </button>
        <button type="button" class="ht-ops-item" title="导入调试会话 JSON 文件" @click="sessionInput?.click()">
          导入调试会话…
        </button>
        <button type="button" class="ht-ops-item" title="复制当前模式与事件定位链接（#m=&e=）" @click="store.copyDeepLink()">
          复制深链
        </button>
      </div>
    </div>

    <input ref="archiveInput" type="file" accept="application/json" hidden @change="onArchiveFile" />
    <input ref="sessionInput" type="file" accept="application/json" hidden @change="onSessionFile" />
    <BreakpointDialog v-model:open="store.bpOpen" />
    <DiffDialog v-model:open="store.diffOpen" />
    <SummaryDialog v-model:open="store.sumOpen" />
    <RecordManagerDialog v-model="recMgrOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import type { TracePhase } from '@/shared/types/trace-event'
import { formatTimestamp } from '@/shared/utils/format'
import BreakpointDialog from '../components/BreakpointDialog.vue'
import Button from '@/presentation/components/Button.vue'
import DiffDialog from '../components/DiffDialog.vue'
import RecordManagerDialog from '../components/RecordManagerDialog.vue'
import SummaryDialog from '../components/SummaryDialog.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { useHaotianStore, type HaotianSourceKey } from '../stores/haotianStore'

const store = useHaotianStore()

const pickVal = ref<string | number>('')
const hintOpen = ref(false)
const legendOpen = ref(false)
const opsOpen = ref(false)
const sessionInput = ref<HTMLInputElement | null>(null)
const archiveInput = ref<HTMLInputElement | null>(null)
const recMgrOpen = ref(false)

/** 快捷键 / 图例弹层互斥，避免同侧两个 popover 叠放 */
function toggleHint(): void {
  hintOpen.value = !hintOpen.value
  if (hintOpen.value) legendOpen.value = false
}
function toggleLegend(): void {
  legendOpen.value = !legendOpen.value
  if (legendOpen.value) hintOpen.value = false
}

const LEGEND_ORDER: TracePhase[] = [
  'battle_lifecycle',
  'turn_flow',
  'action_execution',
  'damage_calculation',
  'heal_calculation',
  'buff_lifecycle',
  'buff_trigger',
  'passive_trigger',
  'ai_decision',
  'attribute_recalc',
  'config_load',
  'config_validation',
]

const legendRows = computed(() =>
  LEGEND_ORDER.map((p) => ({
    cls: PHASE_META[p].cls,
    icon: PHASE_META[p].icon,
    label: PHASE_META[p].label,
    debugOnly: !!PHASE_META[p].debugOnly,
  })),
)

/** 快捷键帮助表（与 useHaotianHotkeys 键位一致） */
const hintRows: Array<{ keys: string; desc: string }> = [
  { keys: '1 / 2', desc: '切换回放 / 调试工作台' },
  { keys: '空格', desc: '回放：播放/暂停 · 调试：下一事件' },
  { keys: '← / →', desc: '上一 / 下一事件' },
  { keys: '[ / ]', desc: '链内上一 / 下一事件（同一次行动）' },
  { keys: '↑ / ↓', desc: '调试卡片导航' },
  { keys: 'F', desc: '播放时跟随事件流' },
  { keys: 'B', desc: '断点配置' },
  { keys: 'S', desc: '战斗摘要' },
  { keys: 'D', desc: '分支对比' },
  { keys: 'K', desc: '书签面板' },
  { keys: 'Esc', desc: '关闭诊断面板' },
]

/** 快捷键帮助面板开关跨会话记忆（常开可作为速查卡） */
const HINT_KEY = 'haotian.hint-open.v1'
try {
  hintOpen.value = localStorage.getItem(HINT_KEY) === '1'
} catch {
  /* 读取失败静默 */
}
watch(hintOpen, (v) => {
  try {
    localStorage.setItem(HINT_KEY, v ? '1' : '0')
  } catch {
    /* 写入失败静默 */
  }
})

const resolveBattleSystem = (): BattleSystem => container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

/** 数据源 + 已保存战斗记录合并下拉：记录分组展示，展开时自动刷新 */
const combinedOptions = computed<TSelectOption[]>(() => [
  { value: 'demo', label: '演示存档', group: '数据源' },
  { value: 'recordings', label: '战斗记录', group: '数据源' },
  { value: 'stress', label: '压测 · 2000+ 事件', group: '数据源' },
  { value: 'live', label: '实时战斗', group: '数据源' },
  ...store.recordings.map((r) => ({
    value: r.saveKey,
    label: r.name,
    hint: `${formatTimestamp(r.startTime)} · ${r.eventCount} 事件`,
    group: '已保存的战斗记录',
  })),
])

/** 数据源或记录选中分发：数据源类型走 store.setSourceKey，记录 saveKey 直接加载 */
function onPick(v: string | number | null): void {
  const key = String(v ?? '')
  if (!key) return
  pickVal.value = key
  if (key === 'demo' || key === 'recordings' || key === 'stress' || key === 'live') {
    store.setSourceKey(key as HaotianSourceKey)
  } else {
    void store.loadRecording(resolveBattleSystem(), key)
  }
}

/** 下拉展开时刷新记录列表：唤灵台刚保存的记录切回昊天镜即可见 */
function onPickOpen(open: boolean): void {
  if (open) void store.refreshRecordings(resolveBattleSystem())
}

/** 下拉回显：store 状态（空态 CTA 加载 / 记录加载 / 记录管理删除）变化同步到选中项 */
watch(
  () => [store.sourceKey, store.curRecordKey] as const,
  ([sk, key]) => {
    if (sk === 'recordings' && key) pickVal.value = key
    else if (sk === 'recordings' || sk === 'demo' || sk === 'stress' || sk === 'live') pickVal.value = sk
    else pickVal.value = ''
  },
)

// 实时流收尾（battle_end）后保留最终存档，用户可继续回放；切换档案源即触发 stopLive

async function onSessionFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await store.importSession(file)
  input.value = ''
}

async function onArchiveFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await store.loadArchiveFile(file)
  input.value = ''
}
</script>
