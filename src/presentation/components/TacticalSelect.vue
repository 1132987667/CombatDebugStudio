<!--
* 文件: TacticalSelect.vue
* 功能: 战术下拉选择器 — 替代原生 <select> 的公共表单控件
* 描述: 全定制 select。遵循系统暗色战术令牌体系（tokens.scss）。
*       支持 v-model / 分组 / 搜索 / 清空 / 禁用项 / 键盘导航 / Teleport 自动翻转。
*       ARIA combobox + listbox 模式（aria-activedescendant，焦点留在触发器）。
* 依赖: tokens.scss 设计令牌；无额外 JS 依赖
-->
<template>
  <div ref="rootRef" class="t-select" :class="[`t-select--${size}`, { 'is-open': open, 'is-disabled': disabled }]">
    <!-- ═══ 触发器 ═══ -->
    <div ref="triggerRef" class="t-select__trigger" role="combobox" tabindex="0" aria-haspopup="listbox"
      :aria-expanded="open" :aria-disabled="disabled"
      :aria-activedescendant="open && highlightedIndex >= 0 ? optionIdOf(highlightedIndex) : undefined" @click="toggle"
      @keydown="onKeydown">
      <i class="t-select__tick t-select__tick--tl" aria-hidden="true"></i>
      <i class="t-select__tick t-select__tick--br" aria-hidden="true"></i>

      <span class="t-select__value" :class="{ 'is-placeholder': !selected }">
        <template v-if="selected">
          <span v-if="selected.icon" class="t-select__value-icon">{{ selected.icon }}</span>
          <span class="t-select__value-label" :title="selected.label">{{ selected.label }}</span>
          <span v-if="selected.hint" class="t-select__value-hint" :title="selected.hint">{{ selected.hint }}</span>
        </template>
        <template v-else>{{ placeholder }}</template>
      </span>

      <span class="t-select__ops">
        <button v-if="clearable && selected && !disabled" type="button" class="t-select__clear" title="清空"
          @click.stop="onClear" @keydown.enter.stop="onClear">×</button>
        <svg class="t-select__chevron" :class="{ 'is-flipped': open }" viewBox="0 0 12 12" width="12" height="12"
          aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
      </span>
    </div>

    <!-- ═══ 下拉面板（Teleport 避免被祖先 overflow 裁剪） ═══ -->
    <Teleport to="body">
      <Transition name="t-panel">
        <div v-if="open" ref="panelRef" class="t-select__panel" :class="{ 't-select__panel--up': dropUp }"
          :style="panelStyle">
          <i class="t-select__corner t-select__corner--tl" aria-hidden="true"></i>
          <i class="t-select__corner t-select__corner--tr" aria-hidden="true"></i>
          <i class="t-select__corner t-select__corner--bl" aria-hidden="true"></i>
          <i class="t-select__corner t-select__corner--br" aria-hidden="true"></i>
          <div class="t-select__scan" aria-hidden="true"></div>

          <div v-if="searchable" class="t-select__search">
            <span class="t-select__search-glyph" aria-hidden="true">⌕</span>
            <input ref="searchRef" v-model="query" class="t-select__search-input" type="text" placeholder="筛选选项…"
              @keydown="onKeydown" />
            <span v-if="query" class="t-select__search-count">{{ visibleFlat.length }}</span>
          </div>

          <div ref="listRef" class="t-select__list" role="listbox" :aria-label="placeholder">
            <div v-if="loading" class="t-select__state">
              <span class="t-select__pulse"></span>加载中…
            </div>
            <div v-else-if="groups.length === 0" class="t-select__state t-select__state--empty">
              {{ query ? `无匹配「${query}」的选项` : emptyText }}
            </div>
            <template v-else>
              <template v-for="g in groups" :key="g.key">
                <div v-if="g.label" class="t-select__group" role="presentation">
                  <span class="t-select__group-dot" aria-hidden="true"></span>{{ g.label }}
                  <span class="t-select__group-rule" aria-hidden="true"></span>
                </div>
                <div v-for="opt in g.options" :key="String(opt.value)" :id="optionIdOf(opt._index)"
                  :data-index="opt._index" class="t-select__option" :class="{
                    'is-selected': isSelected(opt),
                    'is-highlighted': highlightedIndex === opt._index,
                    'is-disabled': opt.disabled,
                  }" role="option" :aria-selected="isSelected(opt)" :aria-disabled="opt.disabled || undefined"
                  @click="choose(opt)" @mouseenter="highlightedIndex = opt._index">
                  <span class="t-select__option-rail" aria-hidden="true"></span>
                  <span v-if="opt.icon" class="t-select__option-icon">{{ opt.icon }}</span>
                  <span class="t-select__option-label" :title="opt.label">{{ opt.label }}</span>
                  <span v-if="opt.hint" class="t-select__option-hint">{{ opt.hint }}</span>
                  <span class="t-select__option-check" aria-hidden="true">◆</span>
                </div>
              </template>
            </template>
          </div>

          <div class="t-select__footer" aria-hidden="true">
            <span class="t-select__footer-count">{{ visibleFlat.length }} 项</span>
            <span class="t-select__footer-keys">↑↓ 移动 · Enter 选择 · Esc 关闭</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/** 选项定义 */
export interface TSelectOption {
  value: string | number
  label: string
  disabled?: boolean
  /** 前缀图标（单字符） */
  icon?: string
  /** 右侧辅助文本（如 "Lv.5+"） */
  hint?: string
  /** 分组名；相同 group 的选项归入同一分组头下 */
  group?: string
}

type TSelectSize = 'sm' | 'md'

interface Props {
  modelValue: string | number | null
  options: TSelectOption[]
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  searchable?: boolean
  loading?: boolean
  size?: TSelectSize
  emptyText?: string
}

const props = withDefaults(defineProps<Props>(), {
  // NOTE: modelValue 默认 null —— 父组件绑定时若意外为 undefined（如 reactive 动态键缺失），
  // Vue 会以默认值替换并跳过类型检查；null 与 undefined 在本组件语义等价（显示 placeholder）。
  modelValue: null,
  placeholder: '请选择',
  disabled: false,
  clearable: false,
  searchable: false,
  loading: false,
  size: 'md',
  emptyText: '暂无选项',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number | null): void
  (e: 'change', v: string | number | null, option: TSelectOption | null): void
  (e: 'clear'): void
  (e: 'visible-change', open: boolean): void
}>()

// ── 实例隔离 ──
const uid = Math.random().toString(36).slice(2, 8)
const optionIdOf = (i: number) => `t-select-${uid}-opt-${i}`

// ── 状态 ──
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const open = ref(false)
const query = ref('')
const highlightedIndex = ref(-1)
const dropUp = ref(false)
const panelStyle = ref<Record<string, string>>({})

// ── 数据扁平化：分组 + 扁平索引 ──
interface FlatOption extends TSelectOption { _index: number }
interface OptionGroup { key: string; label: string; options: FlatOption[] }

const visibleFlat = computed<FlatOption[]>(() => {
  const q = query.value.trim().toLowerCase()
  let list = props.options
  if (q) list = list.filter(o => o.label.toLowerCase().includes(q))
  return list.map((o, i) => ({ ...o, _index: i }))
})

const groups = computed<OptionGroup[]>(() => {
  const out: OptionGroup[] = []
  const indexByKey = new Map<string, number>()
  for (const opt of visibleFlat.value) {
    const key = opt.group ?? ''
    let gi = indexByKey.get(key)
    if (gi === undefined) {
      gi = out.length
      indexByKey.set(key, gi)
      out.push({ key: key || `__nogroup_${gi}`, label: key, options: [] })
    }
    out[gi].options.push(opt)
  }
  return out
})

const selected = computed(() =>
  props.options.find(o => o.value === props.modelValue) ?? null
)
const isSelected = (o: TSelectOption) => o.value === props.modelValue

// ── 开合（全局注册表：打开时关闭其他展开实例） ──
const openClosers = new Set<() => void>()

async function setOpen(v: boolean) {
  if (v === open.value) return
  open.value = v
  emit('visible-change', v)
  if (v) {
    openClosers.forEach(fn => fn())
    openClosers.add(close)
    query.value = ''
    highlightedIndex.value = Math.max(
      0,
      visibleFlat.value.findIndex(o => o.value === props.modelValue),
    )
    updatePosition()
    await nextTick()
    // ── 二次校准：渲染后用真实高度重算翻转 ──
    updatePosition()
    searchRef.value?.focus()
    scrollHighlightedIntoView()
    document.addEventListener('pointerdown', onDocPointerDown, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
  } else {
    openClosers.delete(close)
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
    triggerRef.value?.focus({ preventScroll: true })
  }
}
function close() { setOpen(false) }
function toggle() {
  if (props.disabled) return
  open.value ? close() : setOpen(true)
}
function onDocPointerDown(e: PointerEvent) {
  const t = e.target as Node
  if (rootRef.value?.contains(t)) return
  if (panelRef.value?.contains(t)) return
  close()
}

// ── 定位：fixed + 自动翻转 + 视口钳制 ──
const PANEL_GAP = 6
function updatePosition() {
  const trig = triggerRef.value
  if (!trig) return
  const r = trig.getBoundingClientRect()
  const panelH = panelRef.value?.offsetHeight || estimatePanelHeight()
  const panelW = Math.max(r.width, 200)
  const spaceBelow = window.innerHeight - r.bottom - PANEL_GAP - 8
  const spaceAbove = r.top - PANEL_GAP - 8
  dropUp.value = panelH > spaceBelow && spaceAbove > spaceBelow
  const top = dropUp.value ? r.top - panelH - PANEL_GAP : r.bottom + PANEL_GAP
  const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8))
  const maxH = Math.max(180, dropUp.value ? spaceAbove : spaceBelow)
  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${panelW}px`,
    maxWidth: `${Math.max(panelW, 360)}px`,
    maxHeight: `${maxH}px`,
  }
}
function estimatePanelHeight() {
  const rowH = 34, groupH = 26, footerH = 26
  return Math.min(
    groups.value.reduce((h, g) => h + (g.label ? groupH : 0) + g.options.length * rowH,
      footerH + (props.searchable ? 40 : 0)),
    320,
  )
}

// ── 选择 ──
function choose(opt: FlatOption) {
  if (opt.disabled) return
  // P3-1: 剥离内部 _index 字段，调用方只看到纯 TSelectOption
  const { _index, ...plain } = opt
  emit('update:modelValue', opt.value)
  emit('change', opt.value, plain)
  close()
}
function onClear() {
  emit('update:modelValue', null)
  emit('change', null, null)
  emit('clear')
}

// ── 键盘导航（ARIA combobox：焦点留在触发器） ──
const isFromInput = (e: KeyboardEvent) => (e.target as HTMLElement).tagName === 'INPUT'

function moveHighlight(delta: number) {
  const list = visibleFlat.value
  if (!list.some(o => !o.disabled)) return
  let i = highlightedIndex.value
  for (let step = 0; step < list.length; step++) {
    i = (i + delta + list.length) % list.length
    if (!list[i].disabled) break
  }
  highlightedIndex.value = i
  scrollHighlightedIntoView()
}
function firstEnabled(dir: 1 | -1): number {
  const list = visibleFlat.value
  if (dir === 1) {
    for (let i = 0; i < list.length; i++) if (!list[i].disabled) return i
  } else {
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].disabled) return i
  }
  return highlightedIndex.value
}
function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  const inInput = isFromInput(e)
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (!open.value) { setOpen(true); return }
      moveHighlight(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      if (!open.value) { setOpen(true); return }
      moveHighlight(-1)
      break
    case 'Enter':
      e.preventDefault()
      if (!open.value) { setOpen(true); return }
      {
        const opt = visibleFlat.value[highlightedIndex.value]
        if (opt && !opt.disabled) choose(opt)
      }
      break
    case ' ':
      // P1-2: 搜索框内空格正常输入
      if (inInput) return
      e.preventDefault()
      if (!open.value) { setOpen(true); return }
      {
        const opt = visibleFlat.value[highlightedIndex.value]
        if (opt && !opt.disabled) choose(opt)
      }
      break
    case 'Escape':
      if (open.value) { e.preventDefault(); close() }
      break
    case 'Tab':
      if (open.value) close()
      break
    case 'Home':
    case 'End':
      // P2-7: 搜索框内 Home/End 控制光标，不劫持
      if (inInput) return
      if (open.value) {
        e.preventDefault()
        highlightedIndex.value = firstEnabled(e.key === 'Home' ? 1 : -1)
        scrollHighlightedIntoView()
      }
      break
    default:
      // P1-2: 搜索框内不触发 typeahead
      if (open.value && !inInput
        && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeahead(e.key)
      }
  }
}

// ── 首字母快速定位（typeahead） ──
let typeaheadBuffer = ''
let typeaheadTimer: ReturnType<typeof setTimeout> | null = null
function typeahead(ch: string) {
  typeaheadBuffer += ch.toLowerCase()
  if (typeaheadTimer) clearTimeout(typeaheadTimer)
  typeaheadTimer = setTimeout(() => { typeaheadBuffer = '' }, 500)
  const hit = visibleFlat.value.find(
    o => !o.disabled && o.label.toLowerCase().startsWith(typeaheadBuffer),
  )
  if (hit) {
    highlightedIndex.value = hit._index
    scrollHighlightedIntoView()
  }
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const list = listRef.value
    const el = list?.querySelector(`[data-index="${highlightedIndex.value}"]`) as HTMLElement | null
    if (!list || !el) return
    const lr = list.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    if (er.top < lr.top) list.scrollTop += er.top - lr.top - 4
    else if (er.bottom > lr.bottom) list.scrollTop += er.bottom - lr.bottom + 4
  })
}

// ── P2-4: 搜索过滤变化时重置高亮到首个可用项 ──
watch(query, () => { highlightedIndex.value = firstEnabled(1) })

watch(() => props.options, () => {
  if (open.value && highlightedIndex.value >= visibleFlat.value.length) {
    highlightedIndex.value = Math.max(0, visibleFlat.value.length - 1)
  }
})

onBeforeUnmount(() => {
  if (open.value) close()
  if (typeaheadTimer) clearTimeout(typeaheadTimer)
})

defineExpose({ focus: () => triggerRef.value?.focus() })
</script>

<style scoped lang="scss">
/* ════════════════════════════════════════════
   TacticalSelect — 暗色战术风格
   颜色 100% 来自 tokens.scss，零硬编码色值
   ════════════════════════════════════════════ */
.t-select {
  position: relative;
  display: inline-flex;
  width: 10rem;
  font-family: var(--font-family-base);
  --accent: var(--color-energy);
  --accent-rgb: var(--rgb-energy);
}

/* ── 触发器 ── */
.t-select__trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 0 var(--space-3);
  background:
    linear-gradient(180deg, rgba(var(--rgb-white), var(--alpha-tint)) 0%, transparent 45%),
    var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.t-select--md .t-select__trigger {
  min-height: 34px;
  font-size: var(--font-size-md);
}

.t-select--sm .t-select__trigger {
  min-height: 26px;
  font-size: var(--font-size-sm);
  padding: 0 var(--space-2);
}

.t-select__trigger:hover {
  border-color: var(--color-border-tertiary-hover);
}

.t-select__trigger:focus-visible {
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 2px rgba(var(--rgb-info), var(--alpha-wash-strong));
}

.t-select.is-open .t-select__trigger {
  border-color: var(--accent);
  box-shadow:
    0 0 12px rgba(var(--accent-rgb), var(--alpha-wash-strong)),
    inset 0 0 10px rgba(var(--accent-rgb), var(--alpha-tint));
}

.t-select.is-disabled .t-select__trigger {
  color: var(--color-text-disabled);
  cursor: not-allowed;
  opacity: 0.55;
}

/* 角标 — 展开时放大点亮 */
.t-select__tick {
  position: absolute;
  width: 5px;
  height: 5px;
  border: 0 solid rgba(var(--accent-rgb), var(--alpha-border));
  pointer-events: none;
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.t-select__tick--tl {
  top: 3px;
  left: 3px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.t-select__tick--br {
  bottom: 3px;
  right: 3px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

.t-select.is-open .t-select__tick {
  width: 8px;
  height: 8px;
  border-color: var(--accent);
}

/* 值区 */
.t-select__value {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.t-select__value.is-placeholder {
  color: var(--color-text-tertiary);
}

.t-select__value-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.t-select__value-icon {
  flex-shrink: 0;
}

.t-select__value-hint {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-tertiary);
}

/* 右侧控件 */
.t-select__ops {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.t-select__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(var(--rgb-white), var(--alpha-wash));
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.t-select__trigger:hover .t-select__clear {
  opacity: 1;
}

.t-select__clear:hover {
  background: rgba(var(--rgb-danger), var(--alpha-wash-strong));
  color: var(--color-danger);
}

.t-select__chevron {
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast), color var(--transition-fast);
}

.t-select.is-open .t-select__chevron {
  transform: rotate(180deg);
  color: var(--accent);
}

/* ── 下拉面板 ── */
.t-select__panel {
  position: fixed;
  /* P0-1: 面板层级压过 Dialog(1400)，低于 Tooltip */
  z-index: calc(var(--z-modal) + 50);
  display: flex;
  flex-direction: column;
  background: var(--color-overlay-panel);
  border: 1px solid rgba(var(--accent-rgb), var(--alpha-border));
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg), 0 0 24px rgba(var(--accent-rgb), var(--alpha-wash));
  backdrop-filter: blur(12px);
  overflow: hidden;
  transform-origin: top center;
}

.t-select__panel--up {
  transform-origin: bottom center;
}

/* 四角括号 — 战术 HUD 签名 */
.t-select__corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 0 solid var(--accent);
  pointer-events: none;
  z-index: 1;
}

.t-select__corner--tl {
  top: 4px;
  left: 4px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.t-select__corner--tr {
  top: 4px;
  right: 4px;
  border-top-width: 1px;
  border-right-width: 1px;
}

.t-select__corner--bl {
  bottom: 4px;
  left: 4px;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.t-select__corner--br {
  bottom: 4px;
  right: 4px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

/* 扫描线纹理 */
.t-select__scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0px, transparent 3px,
      rgba(var(--rgb-white), 0.015) 3px, rgba(var(--rgb-white), 0.015) 4px);
}

/* 搜索框 */
.t-select__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
}

.t-select__search-glyph {
  color: var(--color-text-tertiary);
}

.t-select__search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text-primary);
  font-family: inherit;

  &::placeholder {
    color: var(--color-text-disabled);
  }
}

.t-select__search-count {
  color: var(--accent);
  font-weight: var(--font-weight-bold);
}

/* 选项列表 */
.t-select__list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-1);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}

/* 分组头 */
.t-select__group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-1);
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.t-select__group-dot {
  width: 4px;
  height: 4px;
  background: var(--accent);
  transform: rotate(45deg);
  flex-shrink: 0;
}

.t-select__group-rule {
  flex: 1;
  height: 1px;
  background: var(--color-border-default);
}

/* 选项行 */
.t-select__option {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  /* P2-9: 长列表渲染保险（300 行内零成本） */
  content-visibility: auto;
  contain-intrinsic-size: 34px;
}

.t-select--md .t-select__option {
  font-size: var(--font-size-md);
  min-height: 34px;
}

.t-select--sm .t-select__option {
  font-size: var(--font-size-sm);
  min-height: 26px;
}

/* 左侧轨道 — 悬停锁定 */
.t-select__option-rail {
  position: absolute;
  left: var(--space-2);
  top: 50%;
  width: 3px;
  height: 0;
  transform: translateY(-50%);
  background: var(--accent);
  box-shadow: 0 0 6px rgba(var(--accent-rgb), var(--alpha-glow));
  transition: height var(--transition-fast);
}

.t-select__option.is-highlighted {
  background: rgba(var(--accent-rgb), var(--alpha-wash));
  color: var(--color-text-primary);
}

.t-select__option.is-highlighted .t-select__option-rail {
  height: 60%;
}

.t-select__option.is-selected {
  background: rgba(var(--accent-rgb), var(--alpha-wash-strong));
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
}

.t-select__option.is-selected .t-select__option-rail {
  height: 60%;
}

.t-select__option.is-disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
  opacity: 0.5;
}

.t-select__option.is-disabled:hover {
  background: transparent;
}

.t-select__option-icon {
  flex-shrink: 0;
}

.t-select__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.t-select__option-hint {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-tertiary);
}

.t-select__option-check {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--accent);
  opacity: 0;
  transform: scale(0.5);
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.t-select__option.is-selected .t-select__option-check {
  opacity: 1;
  transform: scale(1);
}

/* 状态 */
.t-select__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.t-select__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: t-pulse 1s ease-in-out infinite;
}

@keyframes t-pulse {

  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 页脚状态条 */
.t-select__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-top: 1px solid var(--color-border-default);
  background: rgba(var(--rgb-black), var(--alpha-wash));
  color: var(--color-text-tertiary);
  letter-spacing: 0.5px;
}

.t-select__footer-count {
  color: var(--accent);
  font-weight: var(--font-weight-bold);
}

.t-select__footer-keys {
  font-family: 'Cinzel', var(--font-family-base);
}

/* ── 面板进出场 ── */
.t-panel-enter-active {
  transition: opacity var(--transition-fast) ease-out,
    transform var(--transition-fast) cubic-bezier(0.34, 1.3, 0.64, 1);
}

.t-panel-leave-active {
  transition: opacity 120ms ease-in, transform 120ms ease-in;
}

.t-panel-enter-from,
.t-panel-leave-to {
  opacity: 0;
  transform: scaleY(0.92);
}

/* P2-5: 对齐系统 BuffTextTag 的减弱动效约定 */
@media (prefers-reduced-motion: reduce) {
  .t-select__pulse {
    animation: none;
  }

  .t-select__panel,
  .t-select__option,
  .t-select__chevron,
  .t-select__option-rail {
    transition: none;
  }

  .t-panel-enter-active,
  .t-panel-leave-active {
    transition: opacity 1ms;
  }

  .t-panel-enter-from,
  .t-panel-leave-to {
    transform: none;
  }
}
</style>
