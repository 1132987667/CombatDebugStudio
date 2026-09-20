<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #gear>
        <!-- xy-panel-tabs：豁免 xiyou.scss 功能态对 tabpanel 直接子 div 的 grid 化（同 PackPane），否则三栏各被压成 300px 轨道 -->
        <div class="xy-gear-layout xy-panel-tabs">
          <!-- 左侧：当前穿戴槽位（固定等高，属性走悬浮详情） -->
          <aside class="xy-gear-side">
            <div class="xy-gear-grid">
              <div v-for="slot in GEAR_SLOT_KEYS" :key="slot" class="xy-gear-slot"
                :class="[{ empty: !equippedInstance(slot) }, slotQualityClass(slot)]"
                @mouseenter="onEnter($event, equippedInstance(slot))" @mouseleave="onLeave"
                @contextmenu.prevent="openMenu($event, { slot, equipped: true, g: equippedInstance(slot) })">
                <span class="xy-gear-slot-title">
                  <span class="xy-gear-slot-item" :class="qualityClass(equippedInstance(slot)?.rarity ?? 1)">
                    {{ equippedInstance(slot)?.name ?? '空位' }}
                  </span>
                  <span class="xy-gear-slot-name">{{ GEAR_SLOT_LABELS[slot] }}</span>
                  <span v-if="equippedInstance(slot)" class="xy-gear-slot-enhance">
                    强化 +{{ equippedInstance(slot)!.enhance }}
                  </span>
                </span>
                <template v-if="equippedInstance(slot)">
                  <span class="xy-gear-slot-quality" :class="equipQualityClass(equippedInstance(slot)!.quality)">
                    {{ qualityName(equippedInstance(slot)!.quality) }} · ×{{ factorText(equippedInstance(slot)!.qualityFactor) }}
                  </span>
                  <button type="button" class="xy-gear-unequip" @click="pack.unequip(slot)">卸下</button>
                </template>
                <span v-else class="xy-gear-slot-none">未装备</span>
              </div>
            </div>
          </aside>

          <!-- 右侧：背包装备池（独立滚动，可排序筛选） -->
          <div class="xy-gear-pool">
          <div class="xy-gear-toolbar">
            <TacticalSelect v-model="sortBy" :options="SORT_OPTIONS" placeholder="排序" class="xy-gear-sort" />
            <div class="xy-gear-filters" role="group" aria-label="部位筛选">
              <span class="xy-gear-filter-cap">部位</span>
              <button v-for="f in SLOT_FILTERS" :key="f.value" type="button"
                class="xy-gear-filter" :class="{ on: slotFilter === f.value }" @click="slotFilter = f.value">
                {{ f.label }}
              </button>
            </div>
            <div class="xy-gear-filters" role="group" aria-label="品质筛选">
              <span class="xy-gear-filter-cap">品质</span>
              <button v-for="f in QUALITY_FILTERS" :key="f.value" type="button"
                class="xy-gear-filter" :class="{ on: qualityFilter === f.value }" @click="qualityFilter = f.value">
                {{ f.label }}
              </button>
            </div>
          </div>
          <h5 class="xy-panel-hint xy-gear-pool-hint">背包装备 · 点击穿戴</h5>
          <div v-for="slot in visibleGearGroups" :key="slot" class="xy-gear-pool__group">
            <span class="xy-gear-pool__label">{{ GEAR_SLOT_LABELS[slot] }}</span>
            <div class="xy-gear-pool__items">
              <div v-for="g in gearInPack(slot)" :key="g.instanceId" class="xy-gear-pack-item"
                :class="`xy-gear-pack-item--r${g.rarity}`">
                <button
                  type="button"
                  class="xy-gear-pack-item__main"
                  @mouseenter="onEnter($event, g)" @mouseleave="onLeave"
                  @contextmenu.prevent="openMenu($event, { slot, equipped: false, g })"
                  @click="pack.equipInstance(g.instanceId)"
                >
                  <span class="xy-gear-pack-item__title">
                    <span class="xy-gear-pack-item__name" :class="qualityClass(g.rarity)">{{ g.name }}</span>
                    <span class="xy-gear-pack-item__quality" :class="equipQualityClass(g.quality)">
                      {{ qualityName(g.quality) }} · ×{{ factorText(g.qualityFactor) }}
                    </span>
                    <span v-if="g.affixes.length" class="xy-gear-pack-item__affix">词缀 ×{{ g.affixes.length }}</span>
                    <span v-if="g.enhance" class="xy-gear-pack-item__enhance">强化 +{{ g.enhance }}</span>
                  </span>
                  <span class="xy-gear-stat-row">
                    <span v-for="(s, si) in g.stats" :key="si" class="xy-gear-stat-chip">{{ statText(s) }}</span>
                  </span>
                </button>
                <button type="button" class="xy-gear-pack-item__detail" @click="openDetail(g)">详情</button>
              </div>
              <span v-if="gearInPack(slot).length === 0" class="xy-gear-pool__empty">无</span>
            </div>
          </div>
        </div>

          <!-- 最右：已穿戴装备总属性 -->
          <section class="xy-gear-total">
            <h5 class="xy-panel-hint">已穿戴装备提供总属性</h5>
            <div v-if="equippedTotal.length" class="xy-gear-total-rows">
              <span v-for="t in equippedTotal" :key="t.key" class="xy-gear-total-chip">
                {{ t.label }} +{{ t.value }}{{ t.percent ? '%' : '' }}
              </span>
            </div>
            <p v-else class="xy-gear-pool__empty">尚未穿戴装备</p>
          </section>
        </div>

        <!-- 装备详情（新旧对比） -->
        <GearDetailDialog :instance="detailInstance" @close="onDetailClose" @equip="onDetailEquip" />

        <!-- 装备悬浮详情（复用 EntityTooltip：Teleport + rect 定位 + 视口翻转） -->
        <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect"
          @hide="tooltipVisible = false" />

        <!-- 装备右键操作菜单（复用 PackItemCard 的 xy-ctx 范式） -->
        <Teleport to="body">
          <div v-if="menuOpen" ref="menuRef" class="xy-gear-ctx" role="menu" :style="menuStyle" aria-label="装备操作">
            <button v-if="menuTarget?.equipped" type="button" class="xy-gear-ctx-item" @click="act('unequip')">卸下</button>
            <button v-else type="button" class="xy-gear-ctx-item" @click="act('equip')">穿戴</button>
            <button type="button" class="xy-gear-ctx-item xy-gear-ctx-item--danger" @click="act('discard')">丢弃</button>
          </div>
        </Teleport>
      </template>

      <template #treasure>
        <p class="xy-panel-hint">法宝主攻伐 · 神器主防守；战斗中灵能/护体充能满 3 层自动释放，不占行动回合</p>
        <section v-for="group in fabaoGroups" :key="group.kind" class="xy-fabao-group">
          <h5 class="xy-cave-sec">{{ group.label }}</h5>
          <div v-for="row in group.rows" :key="row.def.id" class="xy-row-card">
            <div class="xy-row-top">
              <span class="xy-row-name">{{ row.def.name }}</span>
              <span class="xy-chip xy-chip--muted">{{ row.def.positioning }}</span>
              <span v-if="row.inst" class="xy-chip xy-chip--jade">{{ fabaoTier(row.inst.quality).name }}</span>
              <span v-if="row.equipped" class="xy-chip xy-chip--gold">出战中</span>
              <span v-if="row.count > 1" class="xy-row-side">拥有 ×{{ row.count }}</span>
            </div>
            <p v-if="row.inst" class="xy-row-desc">
              {{ row.stats.map((s) => `${s.label} +${s.value}${row.def.coefficient.attr === s.attr ? '%' : ''}`).join(' · ') }}
            </p>
            <p v-if="row.inst" class="xy-row-desc xy-row-desc--key">
              强化 +{{ row.inst.enhance }}/{{ fabaoTier(row.inst.quality).enhanceCap }}
              <template v-if="row.def.kind === 'fabao'"> · 技能 {{ row.inst.skillRank }}/{{ FABAO_MAX_SKILL_RANK }} 阶</template>
            </p>
            <p class="xy-row-desc">{{ row.def.skill ?? row.def.trigger }}</p>
            <p class="xy-row-desc xy-row-desc--key">{{ row.def.mechanic }}</p>
            <div v-if="row.inst" class="xy-fabao-ops">
              <button type="button" class="xy-shop-buy" @click="toggleEquip(row)">
                {{ row.equipped ? '卸下' : '出战' }}
              </button>
              <button v-if="row.inst.enhance < fabaoTier(row.inst.quality).enhanceCap" type="button" class="xy-shop-buy"
                @click="doEnhance(row)">
                强化（灵尘×1 + {{ fabaoEnhanceCost(row.inst.quality, row.inst.enhance + 1) }} 金）
              </button>
              <button v-if="row.def.kind === 'fabao' && row.inst.skillRank < FABAO_MAX_SKILL_RANK" type="button"
                class="xy-shop-buy" @click="doUpgrade(row)">升阶（器灵×1）</button>
              <button type="button" class="xy-shop-buy xy-fabao-decompose" @click="doDecompose(row)">
                分解（返灵尘×{{ fabaoDustReturn(row.inst) }}）
              </button>
            </div>
            <p v-else class="xy-row-desc xy-row-desc--key">未获得（调试面板可发放）</p>
          </div>
        </section>
      </template>

      <template #mount>
        <p class="xy-panel-hint">坐骑伴战提供防御属性（常驻光环）· 伴战期间与角色同池获得经验（§18）</p>
        <p v-if="mountRows.length === 0" class="xy-panel-hint">尚未获得坐骑——击败敌人有几率掉落个体（调试面板可发放）</p>
        <div v-for="row in mountRows" :key="row.inst.uid" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ row.name }}</span>
            <span class="xy-chip xy-chip--jade">{{ qualityOf(row.inst.quality) }}</span>
            <span v-if="row.inst.active" class="xy-chip xy-chip--gold">出战</span>
            <span class="xy-row-side">Lv.{{ row.inst.level }}/{{ PET_MAX_LEVEL }}</span>
          </div>
          <p class="xy-row-desc">{{ row.statsText }}</p>
          <p class="xy-row-desc xy-row-desc--key">
            资质 {{ row.inst.aptitude }}/{{ APTITUDE_CAP }} · 突破 {{ row.inst.breakthroughs }}/3
            <template v-if="row.inst.trait"> · {{ row.inst.trait }}</template>
          </p>
          <div class="xy-fabao-ops">
            <button type="button" class="xy-shop-buy" @click="toggleMountActive(row.inst)">
              {{ row.inst.active ? '歇战' : '出战' }}
            </button>
            <button v-if="row.inst.level < PET_MAX_LEVEL" type="button" class="xy-shop-buy" @click="feedMount(row.inst)">
              经验丹(+500)
            </button>
            <button v-if="row.inst.aptitude < APTITUDE_CAP" type="button" class="xy-shop-buy" @click="raiseMountApt(row.inst)">
              资质丹(+2)
            </button>
            <button v-if="row.inst.breakthroughs < BREAKTHROUGH_STAGES.length" type="button" class="xy-shop-buy" @click="brkMount(row.inst)">
              突破
            </button>
          </div>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TabItem } from '@/presentation/components'

import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { EquipmentData } from '@/domain/fengshen/types'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import {
  usePackStore,
  GEAR_SLOT_LABELS,
  type GearInstance,
  type GearSlotKey,
} from '@/presentation/stores/packStore'
import { EQUIPMENT_SLOTS } from '@/shared/utils/equipmentAffix'
import { mountIndividuals, individualById, petMountState, petMountStats, PET_MAX_LEVEL, APTITUDE_CAP, BREAKTHROUGH_STAGES,
  breakthrough as mountBreakthrough, feedExpPill as mountFeedPill, raiseAptitude as mountRaiseApt, setPetMountActive, type PetMountInstance } from '../petMount'
import { equipQualityClass, qualityClass, qualityName, qualityOf } from '../quality'
import { attrShortName } from '@/domain/fengshen/equipment-overview'
import { factorText, gearTooltipData, statText } from '../gearTooltip'
import GearDetailDialog from './GearDetailDialog.vue'
import {
  FABAO_MAX_SKILL_RANK,
  fabaoDefs,
  fabaoDustReturn,
  fabaoEnhanceCost,
  fabaoInstanceStats,
  fabaoState,
  fabaoTier,
  decomposeFabao,
  enhanceFabao,
  equipFabao,
  upgradeFabaoSkill,
  type FabaoDef,
  type FabaoInstance,
} from '../fabao'

/** 法宝页签行：定义 + 拥有实例（多实例取首个，计数展示） */
interface FabaoRow {
  def: FabaoDef
  inst?: FabaoInstance
  count: number
  equipped: boolean
  stats: ReturnType<typeof fabaoInstanceStats>
}

const fabaoGroups = computed(() => {
  const build = (kind: 'fabao' | 'relic', label: string) => ({
    kind,
    label,
    rows: fabaoDefs
      .filter((d) => d.kind === kind)
      .map((def): FabaoRow => {
        const owned = fabaoState.instances.filter((i) => i.defId === def.id)
        const inst = owned[0]
        return {
          def,
          inst,
          count: owned.length,
          equipped: inst
            ? fabaoState[kind === 'fabao' ? 'equippedFabao' : 'equippedRelic'] === inst.uid
            : false,
          stats: inst ? fabaoInstanceStats(def, inst) : [],
        }
      }),
  })
  return [build('fabao', '法宝'), build('relic', '神器')]
})

function toggleEquip(row: FabaoRow): void {
  if (row.inst) equipFabao(row.inst.uid)
}

function doEnhance(row: FabaoRow): void {
  if (row.inst) enhanceFabao(row.inst.uid)
}

function doUpgrade(row: FabaoRow): void {
  if (row.inst) upgradeFabaoSkill(row.inst.uid)
}

function doDecompose(row: FabaoRow): void {
  if (row.inst) decomposeFabao(row.inst.uid)
}

/** 坐骑个体行（petMountState 权威；持有列表 + 养成操作） */
interface MountRow {
  inst: PetMountInstance
  name: string
  statsText: string
}

const MOUNT_ATTR_LABELS: Record<string, string> = {
  attack: '攻击',
  defense: '防御',
  hit: '命中',
  dodge: '闪避',
  speed: '速度',
  maxHealth: '气血',
}

const mountRows = computed<MountRow[]>(() =>
  petMountState.mounts.map((inst) => ({
    inst,
    name: individualById(inst.individualId)?.name ?? inst.individualId,
    statsText: petMountStats(inst)
      .map((s) => `${MOUNT_ATTR_LABELS[s.attr] ?? s.attr} +${s.value}`)
      .join(' · '),
  })),
)

function toggleMountActive(inst: PetMountInstance): void {
  setPetMountActive('mount', inst.uid)
}

function feedMount(inst: PetMountInstance): void {
  mountFeedPill('mount', inst.uid)
}

function raiseMountApt(inst: PetMountInstance): void {
  mountRaiseApt('mount', inst.uid)
}

function brkMount(inst: PetMountInstance): void {
  mountBreakthrough('mount', inst.uid)
}

const pack = usePackStore()

// NOTE: 独立进入装备 tab 时可能尚未开过行囊/洞府，确保背包与穿戴状态就绪
onMounted(() => {
  void pack.init()
})

const sub = ref<'gear' | 'treasure' | 'mount'>('gear')

const SUBS: TabItem[] = [
  { id: 'gear', label: '装备' },
  { id: 'treasure', label: '法宝' },
  { id: 'mount', label: '坐骑' },
]

/** 六类装备槽键（顺序 = 展示顺序；单一来源 EQUIPMENT_SLOTS） */
const GEAR_SLOT_KEYS: GearSlotKey[] = [...EQUIPMENT_SLOTS]

/** 背包装备实例视图（含装备定义名，供模板展示） */
interface GearPackView extends GearInstance {
  name: string
  rarity: number
  stats: EquipmentStatEntry[]
}

/** 背包装备排序键 */
type GearSortKey = 'default' | 'rarity-desc' | 'rarity-asc' | 'name'
const sortBy = ref<GearSortKey>('default')

const SORT_OPTIONS = [
  { value: 'default', label: '默认排序' },
  { value: 'rarity-desc', label: '品阶降序' },
  { value: 'rarity-asc', label: '品阶升序' },
  { value: 'name', label: '名称' },
]

/** 品质筛选：0 全部，1-5 凡/精/超/绝/神（按装备实例 quality，与品阶正交） */
const QUALITY_FILTERS = [
  { value: 0, label: '全部' },
  { value: 1, label: '凡' },
  { value: 2, label: '精' },
  { value: 3, label: '超' },
  { value: 4, label: '绝' },
  { value: 5, label: '神' },
]
const qualityFilter = ref(0)

/** 部位筛选：all = 六槽位全展示（默认） */
const slotFilter = ref<'all' | GearSlotKey>('all')
const SLOT_FILTERS: Array<{ value: 'all' | GearSlotKey; label: string }> = [
  { value: 'all', label: '全部' },
  ...GEAR_SLOT_KEYS.map((s) => ({ value: s, label: GEAR_SLOT_LABELS[s] })),
]

/** 池内分组：按部位筛选裁剪 */
const visibleGearGroups = computed(() =>
  GEAR_SLOT_KEYS.filter((s) => slotFilter.value === 'all' || s === slotFilter.value),
)

/** 背包中该槽位可穿戴的装备实例（应用品质筛选 + 排序） */
function gearInPack(slot: GearSlotKey): GearPackView[] {
  const list = pack
    .packGearInstances()
    .filter((g) => pack.gearById(g.itemId)?.slot === slot)
    .filter((g) => qualityFilter.value === 0 || g.quality === qualityFilter.value)
    .map((g) => ({
      ...g,
      name: pack.gearById(g.itemId)?.name ?? g.itemId,
      rarity: pack.gearById(g.itemId)?.rarity ?? 1,
      stats: pack.instanceStats(g),
    }))
  const by = sortBy.value
  if (by === 'rarity-desc') list.sort((a, b) => b.rarity - a.rarity)
  else if (by === 'rarity-asc') list.sort((a, b) => a.rarity - b.rarity)
  else if (by === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return list
}

/** 已穿戴装备提供的总属性（equippedStats 按 attribute+modifierType 聚合） */
const equippedTotal = computed<Array<{ key: string; label: string; value: number; percent: boolean }>>(() => {
  const agg = new Map<string, { value: number; percent: boolean }>()
  for (const s of pack.equippedStats()) {
    const key = `${s.attribute}:${s.modifierType}`
    const prev = agg.get(key)
    agg.set(key, { value: (prev?.value ?? 0) + s.value, percent: s.modifierType === 'percent' })
  }
  return [...agg.entries()]
    .map(([key, v]) => {
      const [attribute] = key.split(':')
      return { key, label: attrShortName(attribute), value: v.value, percent: v.percent }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
})

/* ── 装备详情（新旧对比弹窗） ── */
const detailInstance = ref<GearInstance | null>(null)

function openDetail(g: GearPackView): void {
  tooltipVisible.value = false
  detailInstance.value = g
}

function onDetailClose(): void {
  detailInstance.value = null
}

function onDetailEquip(instanceId: string): void {
  if (pack.equipInstance(instanceId)) detailInstance.value = null
}

/** 当前槽位已穿戴实例视图 */
function equippedInstance(slot: GearSlotKey): GearPackView | null {
  const inst = pack.equippedInstance(slot)
  if (!inst) return null
  return {
    ...inst,
    name: pack.gearById(inst.itemId)?.name ?? inst.itemId,
    rarity: pack.gearById(inst.itemId)?.rarity ?? 1,
    stats: pack.instanceStats(inst),
  }
}

/** 装备槽品质类（已穿戴按装备品级着色；空槽回退凡品灰） */
function slotQualityClass(slot: GearSlotKey): string {
  const rarity = equippedInstance(slot)?.rarity ?? 1
  return `xy-gear-slot--r${rarity}`
}

/* ── 装备悬浮详情（复用 EntityTooltip 范式：Teleport + rect 定位） ── */
const tooltipVisible = ref(false)
const triggerRect = ref<DOMRect | null>(null)
const tooltipData = ref<TooltipData | null>(null)

/** 悬浮进入：记录触发元素 rect + 组装数据（空槽不显示） */
function onEnter(e: MouseEvent, g: GearPackView | null): void {
  if (!g) return
  triggerRect.value = (e.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null
  tooltipData.value = gearTooltipData(pack, GEAR_SLOT_LABELS, g)
  tooltipVisible.value = true
}

function onLeave(): void {
  tooltipVisible.value = false
}

/* ── 装备右键菜单（复用 PackItemCard 的 xy-ctx 范式） ── */
/** 菜单目标：装备槽（equipped=true 卸下）或背包装备实例（equipped=false 穿戴） */
interface GearMenuTarget {
  slot: GearSlotKey
  equipped: boolean
  g: GearPackView | null
}

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const menuTarget = ref<GearMenuTarget | null>(null)
let removeDocListener: (() => void) | null = null

/** 右键打开菜单：先收起悬浮，再定位菜单（视口内防溢出） */
function openMenu(e: MouseEvent, target: GearMenuTarget): void {
  if (!target.g) return
  tooltipVisible.value = false
  menuTarget.value = target
  menuStyle.value = {
    left: `${Math.min(e.clientX, window.innerWidth - 132)}px`,
    top: `${Math.min(e.clientY, window.innerHeight - 168)}px`,
  }
  menuOpen.value = true
  removeDocListener = () => {
    window.removeEventListener('mousedown', onDocMouseDown, true)
  }
  window.addEventListener('mousedown', onDocMouseDown, true)
}

function onDocMouseDown(e: MouseEvent): void {
  if (menuRef.value?.contains(e.target as Node)) return
  closeMenu()
}

function closeMenu(): void {
  menuOpen.value = false
  removeDocListener?.()
  removeDocListener = null
}

function act(action: 'equip' | 'unequip' | 'discard'): void {
  const target = menuTarget.value
  closeMenu()
  if (!target?.g) return
  if (action === 'equip') pack.equipInstance(target.g.instanceId)
  else if (action === 'unequip') pack.unequip(target.slot)
  else pack.discardGearInstance(target.g.instanceId)
}

onBeforeUnmount(() => {
  removeDocListener?.()
})

/** 坐骑品级 → chip 类（EquipPanel 专属，不入统一映射表） */
</script>

<style scoped lang="scss">
@use '@/presentation/styles/mixins' as *;

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 装备页三栏布局：左=固定等高穿戴槽位，中=背包装备池（独立滚动），右=已穿戴总属性 ── */
.xy-gear-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--space-3);
  align-items: stretch;
}

/* 左侧边栏：占满面板高度，内容超高才内部滚动。
   四周留白：卡片 hover 上移 4px + 4px 外圈 ring 超出滚动容器裁剪边界（同 BattleRoster 范式） */
.xy-gear-side {
  flex: 0 0 220px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  padding: 14px var(--space-3);
}

/* 右侧背包装备池：撑满剩余宽度，独立滚动（留白理由同 .xy-gear-side） */
.xy-gear-pool {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 14px var(--space-3) var(--space-4);
}

/* ── 当前穿戴：与行囊 PackItemCard 同款视觉（品级色描边 + 双点底纹 + hover 浮起） ── */
.xy-gear-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
}

.xy-gear-slot {
  --r-color: var(--xy-ink-line);
  --ring: var(--r-color);
  --glow: color-mix(in srgb, var(--r-color) 40%, transparent);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  /* 六槽等高：内容固定为 标题行+品质行+卸下按钮（属性明细走悬浮详情），空槽同高 */
  height: 112px;
  border: 2px solid var(--r-color);
  border-radius: 2px;
  color: var(--xy-ink-1);

  &::after {
    @include mixin-bg-dual-dots();
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 2px var(--xy-paper),
      0 0 0 4px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(var(--rgb-black), 0.4);

    &::after {
      animation: dots-flow 6s linear infinite;
    }
  }

  /* 品级着色：r1 凡品灰 ~ r5 仙品橙（对齐 tokens --rarity-* 令牌） */
  &--r1 { --r-color: var(--rarity-1); }
  &--r2 { --r-color: var(--rarity-2); }
  &--r3 { --r-color: var(--rarity-3); }
  &--r4 { --r-color: var(--rarity-4); }
  &--r5 { --r-color: var(--rarity-5); }

  &.empty {
    opacity: 0.6;
  }
}

/* 名称行：装备名（品阶色）+ 部位 + 强化（同背包卡片标题行结构） */
.xy-gear-slot-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  flex-wrap: wrap;
}

.xy-gear-slot-name {
  color: var(--xy-ink-3);
}

.xy-gear-slot-enhance {
  color: var(--color-success);
}

.xy-gear-slot-quality {
  font-weight: 600;
}

.xy-gear-slot-none {
  color: var(--xy-ink-4);
}

.xy-gear-unequip {
  margin-top: var(--space-1);
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

/* ── 已穿戴装备总属性：最右独立列（顶部对齐） ── */
.xy-gear-total {
  flex: 0 0 220px;
  align-self: flex-start;
  padding: var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);

  .xy-panel-hint {
    margin-bottom: var(--space-2);
  }
}

.xy-gear-total-rows {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
}

.xy-gear-total-chip {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

/* ── 背包装备池工具栏（排序 + 部位筛选 + 品质筛选） ── */
.xy-gear-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin-bottom: var(--space-2);

  .t-select {
    width: 9rem;
  }
}

.xy-gear-sort {
  flex-shrink: 0;
}

.xy-gear-filters {
  display: flex;
  flex-wrap: wrap;
  flex: none; /* 工具栏变窄时优先挤压排序框，品质筛选不折行 */
  gap: var(--space-1);
}

/* 筛选组前缀标签（部位/品质），区分两组同名「全部」 */
.xy-gear-filter-cap {
  align-self: center;
  color: var(--xy-ink-4);
  margin-right: var(--space-1);
}

.xy-gear-filter {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &.on {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
    color: var(--xy-seal);
  }
}

.xy-gear-pool-hint {
  margin-bottom: var(--space-2);
}

/* ── 背包装备池 ── */
.xy-gear-pool__group {
  margin-bottom: var(--space-3);
}

.xy-gear-pool__label {
  display: inline-block;
  margin-bottom: var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-gear-pool__items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-2);
}

/* 属性小标签：每条属性一格，避免长串拼接在窄卡片里乱换行 */
.xy-gear-stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  width: 100%;
}

.xy-gear-stat-chip {
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  color: var(--xy-ink-3);
}

/* 背包池卡片：与行囊 PackItemCard 同款视觉 */
.xy-gear-pack-item {
  --r-color: var(--xy-ink-line);
  --ring: var(--r-color);
  --glow: color-mix(in srgb, var(--r-color) 40%, transparent);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  border: 2px solid var(--r-color);
  border-radius: 2px;

  &::after {
    @include mixin-bg-dual-dots();
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 2px var(--xy-paper),
      0 0 0 4px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(var(--rgb-black), 0.4);

    &::after {
      animation: dots-flow 6s linear infinite;
    }
  }

  &--r1 { --r-color: var(--rarity-1); }
  &--r2 { --r-color: var(--rarity-2); }
  &--r3 { --r-color: var(--rarity-3); }
  &--r4 { --r-color: var(--rarity-4); }
  &--r5 { --r-color: var(--rarity-5); }
}

.xy-gear-pack-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--xy-ink-1);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

/* 标题行：名称（品阶色）+ 品质系数 + 词缀 + 强化 */
.xy-gear-pack-item__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  flex-wrap: wrap;
}

.xy-gear-pack-item__quality {
  font-weight: 600;
}

.xy-gear-pack-item__affix {
  color: var(--xy-ink-3);
}

.xy-gear-pack-item__enhance {
  color: var(--color-success);
}

.xy-gear-pack-item__detail {
  align-self: flex-start;
  flex-shrink: 0;
  margin: var(--space-2) var(--space-2) 0 0;
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

.xy-gear-pool__empty {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 装备右键操作菜单（Teleport 到 body，用全局令牌；与 PackItemCard 的 xy-ctx 同范式） ── */
.xy-gear-ctx {
  position: fixed;
  z-index: calc(var(--z-modal) + 60);
  display: flex;
  flex-direction: column;
  min-width: 128px;
  padding: var(--space-1);
  background: var(--color-overlay-panel);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.xy-gear-ctx-item {
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-warning);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
}
</style>
