<template>
  <Transition name="xy-settings-fade">
    <div v-if="modelValue" ref="overlayRef" class="xy-settings-dlg" role="dialog" aria-modal="true"
      aria-label="设置" tabindex="-1" @click.self="close">
      <div class="xy-settings-dlg__panel">
        <header class="xy-settings-dlg__head">
          <h2 class="xy-settings-dlg__name">设置</h2>
          <p class="xy-settings-dlg__sub">掌游戏之枢 · 定界面之位</p>
          <button type="button" class="xy-settings-dlg__close" aria-label="关闭设置" @click="close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="xy-settings-dlg__body">
          <section class="xy-settings-dlg__group">
            <h3 class="xy-settings-dlg__cat">界面</h3>
            <div class="xy-settings-dlg__row">
              <span class="xy-settings-dlg__label">功能面板页签位置</span>
              <div class="xy-settings-dlg__seg" role="radiogroup" aria-label="功能面板页签位置">
                <button type="button" role="radio" class="xy-settings-dlg__seg-btn"
                  :class="{ active: sidebar === 'left' }" :aria-checked="sidebar === 'left'"
                  @click="emit('update:sidebar', 'left')">
                  左侧
                </button>
                <button type="button" role="radio" class="xy-settings-dlg__seg-btn"
                  :class="{ active: sidebar === 'right' }" :aria-checked="sidebar === 'right'"
                  @click="emit('update:sidebar', 'right')">
                  右侧
                </button>
              </div>
            </div>
          </section>

          <section class="xy-settings-dlg__group">
            <h3 class="xy-settings-dlg__cat">游戏</h3>
            <button type="button" class="xy-settings-dlg__row xy-settings-dlg__row--btn xy-ink-hover" @click="onExitClick">
              <span class="xy-settings-dlg__label">退出演劫台</span>
              <span class="xy-settings-dlg__hint">离开斗战西游，返回唤灵台</span>
            </button>
            <button type="button" class="xy-settings-dlg__row xy-settings-dlg__row--btn xy-ink-hover" @click="onManualSave">
              <span class="xy-settings-dlg__label">手动保存进度</span>
              <span class="xy-settings-dlg__hint">立即写入当前存档</span>
            </button>
            <button type="button" class="xy-settings-dlg__row xy-settings-dlg__row--btn xy-ink-hover" @click="onImportClick">
              <span class="xy-settings-dlg__label">导入存档</span>
              <span class="xy-settings-dlg__hint">从 JSON 文件恢复进度</span>
            </button>
            <input ref="fileInput" type="file" accept=".json,application/json" class="xy-settings-dlg__file" @change="onImportFile" />
          </section>

          <section class="xy-settings-dlg__group xy-settings-dlg__group--danger">
            <h3 class="xy-settings-dlg__cat xy-settings-dlg__cat--danger">危险操作</h3>
            <button type="button" class="xy-settings-dlg__row xy-settings-dlg__row--btn xy-settings-dlg__row--danger xy-ink-hover"
              @click="showResetConfirm = true">
              <span class="xy-settings-dlg__label">新游戏</span>
              <span class="xy-settings-dlg__hint">清除所有进度，从头开始</span>
            </button>
          </section>

          <section class="xy-settings-dlg__group">
            <h3 class="xy-settings-dlg__cat">战斗</h3>
            <div class="xy-settings-dlg__row xy-settings-dlg__row--muted">
              <span class="xy-settings-dlg__label">自动战斗</span>
              <span class="xy-settings-dlg__hint">默认关闭</span>
            </div>
            <div class="xy-settings-dlg__row xy-settings-dlg__row--muted">
              <span class="xy-settings-dlg__label">战斗倍速</span>
              <span class="xy-settings-dlg__hint">1× / 2×</span>
            </div>
          </section>

          <section class="xy-settings-dlg__group">
            <h3 class="xy-settings-dlg__cat">音效</h3>
            <div class="xy-settings-dlg__row xy-settings-dlg__row--muted">
              <span class="xy-settings-dlg__label">音量</span>
              <span class="xy-settings-dlg__hint">框架占位，暂不可调</span>
            </div>
          </section>

          <section class="xy-settings-dlg__group">
            <h3 class="xy-settings-dlg__cat">关于</h3>
            <div class="xy-settings-dlg__row xy-settings-dlg__row--muted">
              <span class="xy-settings-dlg__label">版本</span>
              <span class="xy-settings-dlg__hint">斗战西游 0.2.0 · 框架展示</span>
            </div>
            <div class="xy-settings-dlg__row xy-settings-dlg__row--muted">
              <span class="xy-settings-dlg__label">养成系统</span>
              <span class="xy-settings-dlg__hint">25 个子系统 · 全部可点选</span>
            </div>
          </section>
        </div>

        <!-- 新游戏二次确认（PRD §6.2：未确认前不执行任何清除） -->
        <div v-if="showResetConfirm" class="xy-settings-dlg__confirm" role="alertdialog" aria-modal="true"
          aria-label="确认开始新游戏？" tabindex="-1">
          <div class="xy-settings-dlg__confirm-panel">
            <h3 class="xy-settings-dlg__confirm-title">确认开始新游戏？</h3>
            <p class="xy-settings-dlg__confirm-text">
              此操作将清除当前所有游戏进度（包括等级、装备、材料与任务），且不可恢复。建议先导出存档备份。
            </p>
            <div class="xy-settings-dlg__confirm-actions">
              <button type="button" class="xy-settings-dlg__confirm-btn xy-settings-dlg__confirm-btn--primary"
                @click="onResetWithExport">
                导出备份并重置
              </button>
              <button type="button" class="xy-settings-dlg__confirm-btn xy-settings-dlg__confirm-btn--danger"
                @click="doReset">
                直接重置
              </button>
              <button type="button" class="xy-settings-dlg__confirm-btn" @click="showResetConfirm = false">
                取消
              </button>
            </div>
          </div>
          <div v-if="showExitConfirm" class="xy-settings-dlg__confirm" role="alertdialog" aria-modal="true"
            aria-label="确认退出演劫台？" tabindex="-1">
            <div class="xy-settings-dlg__confirm-panel">
              <h3 class="xy-settings-dlg__confirm-title">战斗进行中，确认退出？</h3>
              <p class="xy-settings-dlg__confirm-text">
                当前战斗尚未结束，退出后战斗进度将保留（自动存档），但战场现场不会继续。确定返回唤灵台吗？
              </p>
              <div class="xy-settings-dlg__confirm-actions">
                <button type="button" class="xy-settings-dlg__confirm-btn xy-settings-dlg__confirm-btn--primary"
                  @click="confirmExit">
                  确认退出
                </button>
                <button type="button" class="xy-settings-dlg__confirm-btn" @click="showExitConfirm = false">
                  留在演劫台
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { saveManager } from '../data/save-bridge'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

const props = defineProps<{
  modelValue: boolean
  sidebar: 'left' | 'right'
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:sidebar': [value: 'left' | 'right']
  back: []
  'progress-changed': []
}>()

const notification = useNotificationStore()
const showResetConfirm = ref(false)
const showExitConfirm = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function close(): void {
  showResetConfirm.value = false
  showExitConfirm.value = false
  emit('update:modelValue', false)
}

/** 退出演劫台：战斗进行中先二次确认，防止误触丢战斗现场 */
function onExitClick(): void {
  const battle = useBattleStore()
  if (battle.isBattleActive) {
    showExitConfirm.value = true
    return
  }
  emit('back')
}

function confirmExit(): void {
  showExitConfirm.value = false
  emit('back')
}

/** 手动存档：立即写入主档（保留最近自动备份，防误覆盖） */
async function onManualSave(): Promise<void> {
  const ok = await saveManager.save('manual')
  notification.toast(ok ? '进度已保存' : '保存失败，请检查浏览器存储', ok ? 'success' : 'error')
}

function onImportClick(): void {
  fileInput.value?.click()
}

/** 导入存档：解析 → 迁移 → 校验 → 落盘 → 恢复，成功后通知父级刷新 UI */
async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const result = await saveManager.importSave(file)
  notification.toast(result.message ?? (result.ok ? '存档导入成功' : '存档导入失败'), result.ok ? 'success' : 'error')
  if (result.ok) emit('progress-changed')
}

/** 新游戏（导出备份并重置）：先下载当前进度 JSON，再执行重置 */
async function onResetWithExport(): Promise<void> {
  showResetConfirm.value = false
  await saveManager.exportSave()
  await doResetCore()
}

/** 新游戏（直接重置） */
async function doReset(): Promise<void> {
  showResetConfirm.value = false
  await doResetCore()
}

async function doResetCore(): Promise<void> {
  await saveManager.reset()
  notification.toast('新游戏已开始', 'success')
  emit('progress-changed')
}

const overlayRef = ref<HTMLElement | null>(null)

watch(
  () => props.modelValue,
  open => {
    if (open) nextTick(() => overlayRef.value?.focus())
  },
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.modelValue) close()
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped lang="scss">
.xy-settings-dlg {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(var(--rgb-black), 0.76);
  backdrop-filter: blur(3px);
  outline: none;
}

.xy-settings-dlg__panel {
  display: flex;
  flex-direction: column;
  position: relative;
  width: min(520px, 92vw);
  max-height: min(680px, 88vh);
  min-height: 0;
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  box-shadow: 0 24px 64px rgba(var(--rgb-black), 0.65);
  border-radius: 4px;
  overflow: hidden;
}

.xy-settings-dlg__head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 2px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
}

.xy-settings-dlg__name {
  margin: 0;
  
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-settings-dlg__sub {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  color: var(--xy-ink-4);
}

.xy-settings-dlg__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-left: auto;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-settings-dlg__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
}

.xy-settings-dlg__group {
  margin-bottom: var(--space-4);
}

.xy-settings-dlg__cat {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-settings-dlg__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
  text-align: left;
  font-family: inherit;
  color: var(--xy-ink-1);
  box-sizing: border-box;

  &--muted {
    cursor: default;
    opacity: 0.75;
  }

  &--btn {
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);

    &:hover {
      border-color: var(--xy-seal);
    }
  }
}

.xy-settings-dlg__label {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
  flex-shrink: 0;
}

.xy-settings-dlg__hint {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-settings-dlg__seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
}

.xy-settings-dlg__seg-btn {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: 1px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);

  &:hover {
    color: var(--xy-ink-1);
  }

  &.active {
    background: var(--xy-seal);
    color: #fff;
  }
}

.xy-settings-fade-enter-active {
  transition: opacity var(--transition-base);
}

.xy-settings-fade-leave-active {
  transition: opacity var(--transition-fast);
}

.xy-settings-fade-enter-from,
.xy-settings-fade-leave-to {
  opacity: 0;
}

/* 导入存档文件选择器（隐藏原生 input） */
.xy-settings-dlg__file {
  display: none;
}

/* 危险操作分组 */
.xy-settings-dlg__group--danger {
  border-top: 1px dashed var(--xy-ink-line);
  padding-top: var(--space-4);
}

.xy-settings-dlg__cat--danger {
  border-left-color: var(--xy-seal);
  color: var(--xy-seal);
}

.xy-settings-dlg__row--danger:hover {
  border-color: var(--xy-seal);
  background: var(--xy-seal-soft);
}

/* 新游戏二次确认覆盖层 */
.xy-settings-dlg__confirm {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(var(--rgb-black), 0.62);
  backdrop-filter: blur(2px);
  outline: none;
}

.xy-settings-dlg__confirm-panel {
  width: min(420px, 92%);
  padding: var(--space-5);
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  box-shadow: 0 20px 48px rgba(var(--rgb-black), 0.5);
  border-radius: 4px;
}

.xy-settings-dlg__confirm-title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-settings-dlg__confirm-text {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-md);
  line-height: 1.7;
  color: var(--xy-ink-3);
}

.xy-settings-dlg__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
}

.xy-settings-dlg__confirm-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-ink-1);
  }

  &--primary {
    border-color: var(--xy-seal);
    background: var(--xy-seal);
    color: #fff;

    &:hover {
      background: var(--xy-seal);
      color: #fff;
    }
  }

  &--danger {
    border-color: var(--xy-seal);
    color: var(--xy-seal);

    &:hover {
      background: var(--xy-seal-soft);
    }
  }
}
</style>
