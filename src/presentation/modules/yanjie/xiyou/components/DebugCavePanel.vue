<template>
  <!-- 右缘停靠调试面板：v-show 保活，不拦截主区域点击（pointer-events 穿透） -->
  <div v-show="modelValue" class="xy-debug" role="dialog" aria-label="调试控制面板">
    <header class="xy-debug__head">
      <h2 class="xy-debug__title">调试面板 <span class="xy-debug__sub">演劫台</span></h2>
      <button type="button" class="xy-debug__close" aria-label="关闭调试面板" @click="emit('update:modelValue', false)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div class="xy-debug__cats" role="tablist" aria-label="调试分类">
      <button v-for="cat in categories" :key="cat.id" type="button" role="tab"
        class="xy-debug__cat xy-ink-hover" :class="{ active: activeCat === cat.id }"
        :aria-selected="activeCat === cat.id" @click="activeCat = cat.id">
        {{ cat.label }}
      </button>
    </div>

    <!-- 操作区 -->
    <div class="xy-debug__body">
      <template v-for="cat in categories" :key="cat.id">
        <section v-if="activeCat === cat.id" class="xy-debug__groups">
          <div v-for="group in cat.groups" :key="group.id" class="xy-debug__group">
            <h4 class="xy-debug__group-title">{{ group.label }}</h4>
            <div class="xy-debug__group-body">
              <div v-for="act in group.actions" :key="act.id" class="xy-debug__action">
                <!-- 带输入参数的动作：输入控件 + 执行按钮 -->
                <template v-if="act.input">
                  <div v-for="input in inputsOf(act)" :key="input.id"
                    class="xy-debug__action-input" :class="{ 'xy-debug__action-input--file': input.type === 'file' }">
                    <TacticalSelect
                      v-if="input.type === 'select'"
                      v-model="inputValues[valueKey(act, input)]"
                      :options="resolveOptions(input)"
                      :placeholder="input.placeholder ?? '请选择'"
                      size="sm"
                    />
                    <TacticalInput
                      v-else-if="input.type === 'number'"
                      v-model="inputValues[valueKey(act, input)]"
                      type="number"
                      :min="input.min"
                      :max="input.max"
                      :placeholder="input.placeholder"
                      size="sm"
                    />
                    <TacticalInput
                      v-else-if="input.type === 'text'"
                      v-model="inputValues[valueKey(act, input)]"
                      type="text"
                      :placeholder="input.placeholder"
                      size="sm"
                    />
                    <template v-else-if="input.type === 'file'">
                      <input :ref="(el) => setFileInput(act, input, el)" :data-action-id="`${act.id}:${input.id}`" type="file" accept=".json,application/json"
                        class="xy-debug__file" @change="onFileChange(act, input, $event)" />
                      <button type="button" class="xy-debug__btn xy-debug__btn--file" @click="triggerFile(act, input)">
                        {{ fileNames[valueKey(act, input)] || '选择 JSON 文件' }}
                      </button>
                    </template>
                  </div>
                  <button v-if="!hasFileInput(act)" type="button"
                    class="xy-debug__btn" :class="{ 'xy-debug__btn--danger': act.danger }"
                    @click="runAction(act, collectParams(act))">
                    {{ act.label }}
                  </button>
                </template>

                <!-- 开关型动作 -->
                <button v-else type="button" class="xy-debug__btn"
                  :class="{
                    'xy-debug__btn--danger': act.danger,
                    'xy-debug__btn--on': act.toggle && toggleStates[act.id],
                  }"
                  @click="onActionClick(act)">
                  <span v-if="act.toggle" class="xy-debug__toggle" aria-hidden="true"></span>
                  {{ act.label }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- 底部：执行反馈选项（操作日志已并入战斗心经全局日志，经 battleLogManager 展示） -->
    <footer class="xy-debug__log">
      <div class="xy-debug__options">
        <ToggleSwitch v-model="detailEnabled" label="执行后弹出数据详情" :accent-color="'var(--xy-seal)'" />
      </div>
    </footer>

    <!-- 危险操作二次确认 -->
    <ConfirmDialog v-model="confirmOpen" :title="confirmTitle" :message="confirmMessage" confirm-text="确认执行" danger
      @confirm="onConfirm" />

    <!-- JSON 数据展示弹窗（只读） -->
    <Dialog v-model="detailOpen" title="调试数据" width="min(640px, 90vw)" height="70vh" content-class="xy-debug__detail">
      <pre class="xy-debug__json">{{ detailJson }}</pre>
      <template #footer>
        <Button size="small" @click="copyDetail">复制 JSON</Button>
        <Button size="small" variant="secondary" @click="detailOpen = false">关闭</Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import Dialog from '@/presentation/components/Dialog.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'
import ToggleSwitch from '@/presentation/components/ToggleSwitch.vue'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { LogLevel } from '@/shared/types/battle-log'
import type { GameDataApi } from '@/application/service/GameDataApi'
import type { DataIntegrityService } from '@/application/service/DataIntegrityService'
import { container } from '@/infrastructure/di/Container'
import { createDebugCategories, type DebugActionDef, type DebugActionInput, type DebugActionResult, type DebugCategory } from '../data/debugActions'
import type { PlayerStoreDebugEnv } from '../data/debugEnv'
import { alchemyRecipes, equipmentCatalog, forgeRecipes, loadXiyouData, packItems, quests, realms, scenes, schools, shopGoods, skillPoints } from '../data/mock'
import { saveManager } from '../data/save-bridge'

interface Props {
  /** 面板是否可见（v-show 保活） */
  modelValue: boolean
}

const props = withDefaults(defineProps<Props>(), { modelValue: false })

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
}>()

// ════════════ 运行时环境装配 ════════════
const battle = useBattleStore()
const player = usePlayerStore()
const pack = usePackStore()
const notification = useNotificationStore()

/** 系统诊断端口：经 DI 容器 resolve application 层服务（数据完整性 / dataVersion / 配置热重载） */
function makeDiagPort(): PlayerStoreDebugEnv['diag'] {
  const integrity = () => container.resolve<DataIntegrityService>('DataIntegrityService')
  const gameDataApi = () => container.resolve<GameDataApi>('GameDataApi')
  return {
    healthCheck: async () => {
      const r = await integrity().runHealthCheck()
      return { scannedRules: r.scannedRules, checkedEntities: r.checkedEntities, issues: r.issues }
    },
    dataVersion: async () => gameDataApi().getDataVersion(),
    reloadXiyou: async () => loadXiyouData(),
  }
}

const env: PlayerStoreDebugEnv = {
  battle,
  player,
  pack,
  save: saveManager,
  diag: makeDiagPort(),
  scenes,
  quests,
  realms,
  schools,
  skillPoints,
  items: packItems,
  shopGoods,
  equipmentCatalog,
  forgeRecipes,
  alchemyRecipes,
  toast: (message, type) => notification.toast(message, type),
}

const categories = computed<DebugCategory[]>(() => createDebugCategories(env))

// ════════════ 面板状态 ════════════
const activeCat = ref(categories.value[0]?.id ?? 'battle')

/** 执行后是否弹出 JSON 数据详情弹窗（默认不弹，避免刷关类动作打扰） */
const detailEnabled = ref(false)

/** 输入参数暂存（按 action id） */
const inputValues = reactive<Record<string, string | number | null>>({})

/** 开关型动作状态 */
const toggleStates = reactive<Record<string, boolean>>({})

/** 文件型动作：隐藏 input 触发 + 文件名显示 */
const fileInputRefs = reactive<Record<string, HTMLInputElement | null>>({})
const fileNames = reactive<Record<string, string>>({})

/** 单个动作的输入控件列表（input 数组或单输入统一为数组） */
function inputsOf(act: DebugActionDef): DebugActionInput[] {
  if (!act.input) return []
  return Array.isArray(act.input) ? act.input : [act.input]
}

/** 输入控件在面板状态中的键（多输入用 `${actId}:${inputId}` 区分） */
function valueKey(act: DebugActionDef, input: DebugActionInput): string {
  return input.id ? `${act.id}:${input.id}` : act.id
}

/** 动作是否含 file 型输入（file 动作的按钮由文件选择器触发，不渲染执行按钮） */
function hasFileInput(act: DebugActionDef): boolean {
  return inputsOf(act).some((i) => i.type === 'file')
}

/** 收集多输入参数：单输入返回裸值，多输入返回 Record */
function collectParams(act: DebugActionDef): string | number | null | Record<string, string | number | File | null> {
  const inputs = inputsOf(act)
  if (inputs.length === 1 && !inputs[0].id) return inputValues[valueKey(act, inputs[0])] ?? null
  const out: Record<string, string | number | File | null> = {}
  for (const input of inputs) {
    const key = input.id ?? act.id
    const v = inputValues[valueKey(act, input)]
    out[key] = v === '' || v === null || v === undefined ? null : v
  }
  return out
}

function setFileInput(act: DebugActionDef, input: DebugActionInput, el: unknown): void {
  fileInputRefs[valueKey(act, input)] = el as HTMLInputElement | null
}

/** 解析 select 选项（支持惰性函数，动态列表每次渲染求值） */
function resolveOptions(input: DebugActionInput): Array<{ value: string; label: string }> {
  const opts = input.options
  if (typeof opts === 'function') return opts()
  return opts ?? []
}

// ════════════ 执行分发 ════════════
const confirmOpen = ref(false)
const confirmAction = ref<DebugActionDef | null>(null)
const confirmTitle = ref('')
const confirmMessage = ref('')

/** 带输入的动作：点击按钮直接执行（参数在 inputValues 中）；file 动作由 onFileChange 传 File */
async function runAction(act: DebugActionDef, param: string | number | File | Record<string, string | number | File | null> | null): Promise<void> {
  const value = param
  if (act.input && !hasFileInput(act) && !isParamsFilled(act, value)) {
    notification.toast('请先输入参数', 'warning')
    return
  }
  const result = await dispatch(act, value, toggleStates[act.id])
  pushLog(act, result)
  if (act.toggle && result.nextState !== undefined) toggleStates[act.id] = result.nextState
}

/** 校验必填输入是否齐全（单输入直接非空；多输入逐项校验） */
function isParamsFilled(act: DebugActionDef, value: string | number | File | Record<string, string | number | File | null> | null): boolean {
  const inputs = inputsOf(act)
  if (inputs.length === 0) return true
  if (inputs.length === 1 && !inputs[0].id) {
    return !(inputs[0].required && (value === null || value === '' || value === undefined))
  }
  const map = value as Record<string, string | number | File | null>
  return inputs.every((i) => {
    if (!i.required) return true
    const v = map?.[i.id ?? act.id]
    return v !== null && v !== '' && v !== undefined
  })
}

/** 开关/普通动作：danger 先确认 */
function onActionClick(act: DebugActionDef): void {
  if (act.danger) {
    confirmAction.value = act
    confirmTitle.value = `确认${act.label}？`
    confirmMessage.value = `「${act.label}」为危险操作，确认执行后将不可撤销。`
    confirmOpen.value = true
    return
  }
  void runAction(act, null)
}

function onConfirm(): void {
  const act = confirmAction.value
  if (!act) return
  void runAction(act, null)
  confirmAction.value = null
}

async function dispatch(act: DebugActionDef, param: unknown, current: boolean | undefined): Promise<DebugActionResult> {
  try {
    const raw = await act.execute(param as string | number | File | Record<string, string | number | File | null> | null | undefined, current)
    if (raw.success && raw.payload !== undefined && detailEnabled.value) openDetail(raw.payload)
    if (raw.success) {
      notification.toast(raw.message, 'success')
    } else {
      notification.toast(raw.message, 'error')
    }
    return raw
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    notification.toast(message, 'error')
    return { success: false, message }
  }
}

/** 调试操作写入全局日志（战斗心经可见；ACTION 类型归「系统」页签展示） */
function pushLog(act: DebugActionDef, result: DebugActionResult): void {
  battleLogManager.addActionLog({
    source: '调试面板',
    action: act.label,
    message: `${act.label} · ${result.message}`,
    level: result.success ? LogLevel.INFO : LogLevel.ERROR,
  })
}

// ════════════ 文件输入 ════════════
function triggerFile(act: DebugActionDef, inputDef: DebugActionInput): void {
  fileInputRefs[valueKey(act, inputDef)]?.click()
}

function onFileChange(act: DebugActionDef, inputDef: DebugActionInput, e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileNames[valueKey(act, inputDef)] = file.name
  void runAction(act, file)
  input.value = ''
}

// ════════════ JSON 展示 ════════════
const detailOpen = ref(false)
const detailJson = ref('')

function openDetail(payload: unknown): void {
  detailJson.value = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  detailOpen.value = true
}

async function copyDetail(): Promise<void> {
  try {
    await navigator.clipboard.writeText(detailJson.value)
    notification.toast('已复制到剪贴板', 'success')
  } catch {
    notification.toast('复制失败', 'error')
  }
}

// ════════════ 键盘快捷键：Ctrl+Shift+D 切换面板 / Esc 关闭 ════════════
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.modelValue) {
    emit('update:modelValue', false)
    return
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault()
    emit('update:modelValue', !props.modelValue)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // 确保 packStore 已初始化（调试操作依赖目录数据）
  void pack.init()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// 暴露 env 供测试/调试
defineExpose({ env, categories })
</script>

<style scoped lang="scss">
/* 右缘停靠：pointer-events 穿透遮罩，面板自身接收点击 */
.xy-debug {
  position: fixed;
  right: 0;
  top: 60px;
  bottom: 0;
  width: 340px;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--xy-paper);
  border-left: 2px solid var(--xy-ink-3);
  box-shadow: -4px 0 24px rgba(var(--rgb-black), 0.35);
  pointer-events: auto;
}

.xy-debug__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
}

.xy-debug__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: 3px;
  color: var(--xy-ink-1);
}

.xy-debug__sub {
  margin-left: var(--space-2);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-regular);
  letter-spacing: 2px;
  color: var(--xy-ink-4);
}

.xy-debug__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

/* 一级分类 Tab（横向滚动） */
.xy-debug__cats {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--xy-ink-line);
  overflow-x: auto;
}

.xy-debug__cat {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);

  &:hover {
    color: var(--xy-ink-1);
  }

  &.active {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
    color: var(--xy-seal);
  }
}

/* 操作区 */
.xy-debug__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
}

.xy-debug__group {
  margin-bottom: var(--space-4);
}

.xy-debug__group-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-debug__group-body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.xy-debug__action {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}

.xy-debug__action-input {
  width: 100%;
  min-width: 0;
}

/* 按钮 */
.xy-debug__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-warm);
  color: var(--xy-ink-2);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &--danger {
    border-color: var(--xy-seal);
    background: var(--xy-seal);
    color: #fff;

    &:hover {
      background: var(--xy-seal);
      color: #fff;
    }
  }

  &--on {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
    color: var(--xy-gold);
  }

  &--file {
    width: 100%;
  }
}

.xy-debug__toggle {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--xy-ink-4);

  .xy-debug__btn--on & {
    background: var(--xy-gold);
  }
}

.xy-debug__file {
  display: none;
}

/* 日志区 */
.xy-debug__log {
  flex-shrink: 0;
  border-top: 1px solid var(--xy-ink-line);
}

.xy-debug__options {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  font-size: var(--font-size-md);
}

/* JSON 弹窗 */
.xy-debug__json {
  margin: 0;
  padding: var(--space-3);
  max-height: 100%;
  overflow: auto;
  background: var(--color-bg-secondary);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: var(--font-size-md);
  line-height: 1.6;
  color: var(--xy-ink-1);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
