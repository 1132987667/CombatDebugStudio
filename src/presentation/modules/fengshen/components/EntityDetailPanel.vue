<!--
* 文件: EntityDetailPanel.vue
* 功能: 封神榜列表右侧详情面板（只读）
* 描述: 点击列表中的名称等可点击字段后，在右侧（6/24 栅格）展示该实体的全部字段值。
*       数组 / Map 做格式化展示；引用字段（REFERENCE_RULES 声明的 path 叶子键）优先显示
*       中文名（如 skillIds → 技能名、roles[].roleId → 角色/敌人名），原始 id 保留在 title 悬浮。
* 依赖: tokens.scss 设计令牌；无额外 JS 依赖
-->
<template>
  <div v-if="entity" class="fs-detail">
    <header class="fs-detail-head">
      <span class="fs-detail-id">{{ entity.id }} <span class="fs-detail-table">{{ schema.label }}</span></span>
      <h3 class="fs-detail-title">{{ detailName }} <Button v-if="schema.table === 'lineups'" size="small"
          title="切换到唤灵台并加载该预设阵容" @click="emit('openInHuanling')">在唤灵台打开</Button>
        <Button size="small" title="在编辑器中打开该实体" @click="emit('edit')">编辑</Button>
      </h3>
    </header>

    <dl class="fs-detail-body">
      <template v-for="field in schema.fields" :key="field.key">
        <div class="fs-detail-row">
          <dt class="fs-detail-label">{{ field.label }}</dt>
          <dd class="fs-detail-value">
            <template v-if="isEmpty(entity[field.key])">—</template>
            <template v-else-if="isRangeArray(entity[field.key])">{{ rangeText(entity[field.key] as [number, number]) }}</template>
            <template v-else-if="Array.isArray(entity[field.key])">
              <ul class="fs-detail-list" :class="{ 'fs-detail-list--grid2': isTwoColList(field) }">
                <li v-for="(item, i) in entity[field.key] as unknown[]" :key="i" class="fs-detail-list-item">
                  <template v-if="isGearStatsItem(field, item)">{{ gearStatText(item) }}</template>
                  <template v-else-if="isGearMaterialsItem(field, item)">{{ gearMatText(item) }}</template>
                  <template v-else-if="isEnemyDropItem(field, item)">{{ enemyDropText(item) }}</template>
                  <template v-else-if="isActorEntry(item)">
                    <span :title="`id: ${item.id}`">{{ actorEntryText(item) }}</span>
                  </template>
                  <template v-else-if="isObject(item)">
                    <dl class="fs-detail-map">
                      <div v-for="(v, k) in item as Record<string, unknown>" :key="k" class="fs-detail-map-row">
                        <dt class="fs-detail-map-key">{{ keyLabel(k) }}</dt>
                        <dd class="fs-detail-map-val" :title="refTitle(k, v)">{{ nestedVal(k, v) }}</dd>
                      </div>
                    </dl>
                  </template>
                  <template v-else>
                    <span v-if="isRefKey(field.key)" :title="`id: ${String(item)}`">{{ refName(item) }}</span>
                    <template v-else>{{ renderScalar(item) }}</template>
                  </template>
                </li>
              </ul>
            </template>
            <template v-else-if="isStatsField(field)">
              <dl class="fs-detail-map fs-detail-map--grid2">
                <div v-for="(v, k) in entity[field.key] as Record<string, unknown>" :key="k" class="fs-detail-map-row">
                  <dt class="fs-detail-map-key">{{ attrLabel(String(k)) }}</dt>
                  <dd class="fs-detail-map-val">{{ attrValue(String(k), v) }}</dd>
                </div>
              </dl>
            </template>
            <template v-else-if="isEnemySkillsField(field)">
              <dl class="fs-detail-map">
                <div v-for="(ids, kind) in entity[field.key] as Record<string, unknown[]>" :key="kind"
                  class="fs-detail-map-row">
                  <dt class="fs-detail-map-key">{{ skillKindLabel(String(kind)) }}</dt>
                  <dd class="fs-detail-map-val">
                    <template v-if="(ids as unknown[]).length">
                      <span v-for="id in ids as string[]" :key="id" class="fs-skill-tag"
                        @mouseenter="showSkillTip($event, id)" @mouseleave="hideSkillTip">
                        {{ refName(id) }}
                      </span>
                    </template>
                    <template v-else>—</template>
                  </dd>
                </div>
              </dl>
            </template>
            <template v-else-if="isActorEntry(entity[field.key])">
              <span :title="actorEntryTitle(entity[field.key])">{{ actorEntryText(entity[field.key]) }}</span>
            </template>
            <template v-else-if="isUnlockCondition(entity[field.key])">
              <span :title="unlockConditionTitle(entity[field.key])">{{
                unlockConditionText(entity[field.key]) }}</span>
            </template>
            <template v-else-if="isObject(entity[field.key])">
              <dl class="fs-detail-map">
                <div v-for="[k, v] in objectEntries(entity[field.key])" :key="k" class="fs-detail-map-row">
                  <dt class="fs-detail-map-key">{{ keyLabel(k) }}</dt>
                  <dd class="fs-detail-map-val" :title="refTitle(k, v)">{{ nestedVal(k, v) }}</dd>
                </div>
              </dl>
            </template>
            <template v-else>
              <span v-if="isRefKey(field.key)" :title="`id: ${String(entity[field.key])}`">{{ refName(entity[field.key])
              }}</span>
              <template v-else>{{ topLevelValue(field, entity[field.key]) }}</template>
            </template>
          </dd>
        </div>
      </template>
    </dl>

    <div v-if="references?.length" class="fs-detail-refs">
      <div class="fs-detail-refs-title">被引用（{{ refCount }} 处）</div>
      <div v-for="g in references" :key="g.sourceTable" class="fs-detail-refs-row">
        <button type="button" class="fs-link" :title="`跳转到${tableLabel(g.sourceTable)}表`"
          @click="emit('goto', g.sourceTable)">{{ tableLabel(g.sourceTable) }}</button>
        <span v-if="g.sourceTable !== 'gears'" class="fs-detail-refs-ids" :title="`id: ${g.ids.join('、')}`">{{
          g.ids.map(refName).join('、') }}</span>
        <span v-else class="fs-detail-refs-ids">
          <template v-for="(id, i) in g.ids" :key="id">
            <span class="fs-ref-gear" :title="`id: ${id}`" @mouseenter="showGearTip($event, id)"
              @mouseleave="hideGearTip">{{ gearName(id) }}</span>{{ i < g.ids.length - 1 ? '、' : '' }} </template>
        </span>
      </div>
    </div>
  </div>

  <!-- 技能悬浮详情 -->
  <EntityTooltip :visible="skillTipVisible" :data="skillTipData" :trigger-rect="skillTipRect" @hide="hideSkillTip" />
  <!-- 装备合成材料悬浮详情 -->
  <EntityTooltip :visible="gearTipVisible" :data="gearTipData" :trigger-rect="gearTipRect" @hide="hideGearTip" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import { TABLE_SCHEMAS, REFERENCE_RULES } from '@/domain/fengshen/schema'
import type { EnemyDrop } from '@/shared/types/enemy'
import {
  AFFIX_TARGET_VALUE_LABEL,
  AFFIX_TIER_VALUE_LABEL,
  BUFF_CATEGORY_VALUE_LABEL,
  CONFLICT_GROUP_VALUE_LABEL,
  GEAR_TIER_VALUE_LABEL,
  MODIFIER_TYPE_VALUE_LABEL,
  POLARITY_VALUE_LABEL,
  SKILL_TYPE_VALUE_LABEL,
  SLOT_VALUE_LABEL,
  STACK_RULE_VALUE_LABEL,
} from '@/domain/fengshen/schema'
import { resolveRefName } from '@/domain/fengshen/refNames'
import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { GearData } from '@/domain/fengshen/types'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'

const props = withDefaults(
  defineProps<{
    schema: TableSchema
    entity: Record<string, unknown>
    /** 反向引用：哪些表的哪些实体引用了当前实体 */
    references?: Array<{ sourceTable: string; ids: string[] }>
    /** 全表引用字典（id → 中文名）：引用字段优先中文，缺省回退原始 id */
    refIndex?: Record<string, string>
  }>(),
  { refIndex: () => ({}) },
)

const emit = defineEmits<{
  edit: []
  /** 跳转到引用方所在表 */
  goto: [table: string]
  /** 在唤灵台加载该预设阵容（仅 lineups 表） */
  openInHuanling: []
}>()

const detailName = computed(() => String(props.entity.name ?? props.entity.id ?? '未命名'))

/**
 * 引用叶子键集合：REFERENCE_RULES 中 sourceTable = 当前表的规则的 path 末段（去 []）。
 * 供嵌套字段（roles[].roleId / steps[].effectId / drops[].itemId / matrix[].attackerId 等）
 * 与顶层引用字段（skillIds / growth / faction / formationId）共用翻译判定。
 */
const refLeafKeys = computed(() => {
  const keys = new Set<string>()
  for (const rule of REFERENCE_RULES) {
    if (rule.sourceTable !== props.schema.table) continue
    const segs = rule.path.split('.')
    keys.add(segs[segs.length - 1].replace('[]', ''))
  }
  return keys
})

function isRefKey(key: string): boolean {
  return refLeafKeys.value.has(key)
}

/** 装备名称兜底索引（id → name）：refIndex 未覆盖 gears 时的可靠名称来源，懒加载一次 */
const gearNameIndex = ref<Record<string, string>>({})
let gearNameLoaded = false
function loadGearNameIndex(): void {
  if (gearNameLoaded) return
  gearNameLoaded = true
  try {
    const api = container.resolve<GameDataApi>('GameDataApi')
    void api.listByTable<GearData>('gears', { limit: 1000 }).then((gears) => {
      const idx: Record<string, string> = {}
      for (const g of gears) if (g.id) idx[g.id] = g.name ?? g.id
      gearNameIndex.value = idx
    })
  } catch {
    // 容器未初始化（如单测环境）：跳过，gear tag 名称回退 refIndex / 原 id
  }
}
void loadGearNameIndex()

/** 引用值 → 中文名（未命中回退原 id，保留调试语义） */
function refName(v: unknown): string {
  return resolveRefName(String(v), props.refIndex)
}

/** gear id → 名称：优先 refIndex，兜底组件内 gear 索引，仍缺失回退 id */
function gearName(id: string): string {
  return resolveRefName(id, props.refIndex) !== id
    ? refName(id)
    : resolveRefName(id, gearNameIndex.value)
}

/** 嵌套键值对值渲染：引用键优先中文，否则保持原有标量/对象渲染 */
function refVal(key: string, v: unknown): string {
  return isRefKey(key) ? refName(v) : renderScalar(v)
}

/** 嵌套对象键名 → 中文（未命中回退原键名） */
const NESTED_KEY_LABEL: Record<string, string> = {
  attribute: '属性', modifierType: '修正类型', value: '数值', itemId: '物品', count: '数量',
  type: '类型', skillType: '类型', attackType: '攻击方式', duration: '持续', effectId: '效果',
  buffId: 'Buff', calculation: '计算', baseValue: '基础值', extraValues: '附加值', ratio: '比例',
  slot: '部位', tier: '档位', role: '品阶', row: '排位', target: '目标', faction: '阵营',
  strategy: '策略', seatIndex: '站位', roleId: '角色', maxSlots: '最大站位',
  level: '等级', expRequired: '所需经验', gold: '金币', exp: '经验', materials: '材料',
  sceneId: '场景', probability: '概率', chance: '概率', quantity: '数量', description: '描述',
  polarity: '极性', category: '类别', stackRule: '叠加规则', maxStacks: '最大叠加', effects: '效果',
  min: '最小', max: '最大', index: '序号', condition: '条件', name: '名称', id: 'ID',
  percent: '百分比', attackerId: '攻击方', defenderId: '防御方', coefficient: '系数',
  conflict_group: '冲突组', defaultCoefficient: '默认系数', perLevel: '每级增量', expTable: '经验表',
  requiredLevel: '等级门槛', cost: '金钱', source: '来源', subType: '子类型', rarity: '稀有度',
}

function keyLabel(key: string): string {
  return NESTED_KEY_LABEL[key] ?? key
}

/** 嵌套对象枚举值 → 中文（按键名分组；映射统一引用 schema.ts 的单一来源，组件特有键保留本地） */
const NESTED_VALUE_LABEL: Record<string, Record<string, string>> = {
  modifierType: MODIFIER_TYPE_VALUE_LABEL,
  attackType: { normal: '普攻', skill: '技能' },
  skillType: SKILL_TYPE_VALUE_LABEL,
  polarity: POLARITY_VALUE_LABEL,
  // buff 类别：schema 权威表 + 本面板嵌套场景特有的 action/modifier 两键
  category: { ...BUFF_CATEGORY_VALUE_LABEL, action: '动作', modifier: '属性' },
  stackRule: STACK_RULE_VALUE_LABEL,
  row: { front: '前排', back: '后排' },
  target: AFFIX_TARGET_VALUE_LABEL,
  slot: SLOT_VALUE_LABEL,
  tier: { ...AFFIX_TIER_VALUE_LABEL, ...GEAR_TIER_VALUE_LABEL },
  conflict_group: CONFLICT_GROUP_VALUE_LABEL,
  type: {
    deal_damage: '造成伤害', apply_buff: '施加增益', heal: '治疗', modify_attribute: '属性修正',
    clear_scene: '通关前置', clear_boss: '击败BOSS', modifier: '属性修正',
    summon: '召唤', cleanse: '净化', dispel: '驱散', revive: '复活', transform: '变身',
    knockback: '击退', pull: '拉扯', teleport: '传送', reflect: '反射', drain: '吸取',
    buff: '增益', debuff: '减益',
  },
}

/** 嵌套键值对值渲染：属性/引用/枚举优先中文，否则保持原有标量 */
function nestedVal(key: string, v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (key === 'attribute') return attrLabel(String(v))
  if (isRefKey(key)) return refName(v)
  if (typeof v === 'string' && NESTED_VALUE_LABEL[key]?.[v]) return NESTED_VALUE_LABEL[key][v]
  return renderScalar(v)
}

/** 顶层标量渲染：select 枚举字段用 schema.valueLabel 翻译，其余保持原有展示 */
function topLevelValue(field: TableSchema['fields'][number], v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'string' && field.valueLabel?.[v]) return field.valueLabel[v]
  return String(v)
}

/** 嵌套引用键的 title：保留原始 id（单值） */
function refTitle(key: string, v: unknown): string | undefined {
  if (!isRefKey(key) || v === undefined || v === null) return undefined
  return `id: ${String(v)}`
}

/** stats 字段 = 属性统计对象（actors/enemies 的 `{ attrCode: number }`），走友好属性面板渲染 */
function isStatsField(field: TableSchema['fields'][number]): boolean {
  return field.type === 'map' && field.key === 'stats'
}

/** 敌人掉落数组（enemies.drops）→ 两列网格展示，减少纵向滚动 */
function isTwoColList(field: TableSchema['fields'][number]): boolean {
  return field.key === 'drops' && field.type === 'array'
}

/** 二元数字数组 = 闭区间 [min, max]（敌人 exp/money 奖励：战斗结算时在区间内随机取值） */
function isRangeArray(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2
    && typeof v[0] === 'number' && typeof v[1] === 'number'
}

/** 区间 → "10 ~ 20"；上下限相等时只显示单值 */
function rangeText([min, max]: [number, number]): string {
  return min === max ? String(min) : `${min} ~ ${max}`
}

/** 属性 code → 展示名（无元数据时回退原 code） */
function attrLabel(code: string): string {
  return getAttrMeta(code as ATTRIBUTE_CODE)?.displayName ?? code
}

/** 属性值格式化：百分比属性追加 %，其余保持原有展示 */
function attrValue(code: string, v: unknown): string {
  if (typeof v === 'number' && getAttrMeta(code as ATTRIBUTE_CODE)?.isPercentage) {
    return `${v}%`
  }
  return renderScalar(v)
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

/** 模板 v-for 源：对象 → 键值对数组（模板表达式不能写含 Record 的内联断言，收口到 script） */
function objectEntries(v: unknown): Array<[string, unknown]> {
  return isObject(v) ? Object.entries(v) : []
}

/** gear 表 stats 数组元素（{attribute, modifierType, value}）类型守卫 */
function isGearStatsItem(field: TableSchema['fields'][number], v: unknown): v is { attribute: string; modifierType: string; value: number } {
  return field.key === 'stats' && isObject(v)
}

/** gear 表 materials 数组元素（{itemId, count}）类型守卫 */
function isGearMaterialsItem(field: TableSchema['fields'][number], v: unknown): v is { itemId: string; count: number } {
  return field.key === 'materials' && isObject(v)
}

/** 属性加成数组项 → 通俗文本："攻击 +24" / "速度 +15%" */
function gearStatText(item: { attribute: string; modifierType: string; value: number }): string {
  const name = getAttrMeta(item.attribute as ATTRIBUTE_CODE)?.displayName ?? item.attribute
  const suffix = item.modifierType === 'percent' ? '%' : ''
  return `${name} ${item.value > 0 ? '+' : ''}${item.value}${suffix}`
}

/** 制造材料数组项 → 通俗文本："桃木 ×3"（引用 items 表取中文名） */
function gearMatText(item: { itemId: string; count: number }): string {
  return `${refName(item.itemId)} ×${item.count}`
}

/** 敌人表 drops 数组元素类型守卫（结构 = shared EnemyDrop） */
function isEnemyDropItem(field: TableSchema['fields'][number], v: unknown): v is EnemyDrop {
  return field.key === 'drops' && isObject(v)
}

/** 掉落数组项 → 通俗文本："桃木 ×2 · 50%" */
function enemyDropText(item: EnemyDrop): string {
  const qty = item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''
  const chance = item.chance != null ? ` · ${Math.round(item.chance * 100)}%` : ''
  return `${refName(item.itemId)}${qty}${chance}`
}

/** 敌人条目形状（{id, name?, level?}）：scenes.enemies 数组项 / scenes.yaotu 对象，单行化避免键值竖排冗余 */
function isActorEntry(v: unknown): v is { id: string; name?: string; level?: number } {
  if (!isObject(v)) return false
  return typeof v.id === 'string'
    && Object.keys(v).every((k) => k === 'id' || k === 'name' || k === 'level')
    && (v.name === undefined || typeof v.name === 'string')
}

/** 敌人条目 → 单行文本「花妖幼芽 Lv.2」；name 缺失回退引用翻译（id → 敌人名） */
function actorEntryTextOf(item: { id: string; name?: string; level?: number }): string {
  const name = item.name || refName(item.id)
  const lv = item.level != null ? ` Lv.${item.level}` : ''
  return `${name}${lv}`
}

/** 解锁条件形状（{type, sceneId}）：scenes.unlockCondition */
function isUnlockCondition(v: unknown): v is { type: string; sceneId?: string } {
  return isObject(v) && typeof v.type === 'string'
    && Object.keys(v).every((k) => k === 'type' || k === 'sceneId')
    && (v.sceneId === undefined || typeof v.sceneId === 'string')
}

/** 解锁条件 → 单行文本「通关前置：桃林小径」（类型走枚举翻译，场景走引用翻译） */
function unlockConditionTextOf(v: { type: string; sceneId?: string }): string {
  const typeLabel = NESTED_VALUE_LABEL.type[v.type] ?? v.type
  return v.sceneId ? `${typeLabel}：${refName(v.sceneId)}` : typeLabel
}

/** 解锁条件 title：保留原始场景 id（调试语义） */
function unlockConditionTitleOf(v: { type: string; sceneId?: string }): string | undefined {
  return v.sceneId ? `id: ${v.sceneId}` : undefined
}

// ── 模板入口（模板表达式无法依赖 v-else-if 的 predicate 收窄，收口到 script 内部守卫） ──

function actorEntryText(v: unknown): string {
  return isActorEntry(v) ? actorEntryTextOf(v) : ''
}
function actorEntryTitle(v: unknown): string | undefined {
  return isActorEntry(v) ? `id: ${v.id}` : undefined
}
function unlockConditionText(v: unknown): string {
  return isUnlockCondition(v) ? unlockConditionTextOf(v) : ''
}
function unlockConditionTitle(v: unknown): string | undefined {
  return isUnlockCondition(v) ? unlockConditionTitleOf(v) : undefined
}

/** 敌人表 skills 对象（{ small/passive/ultimate: string[] }）类型守卫 */
function isEnemySkillsField(field: TableSchema['fields'][number]): boolean {
  return field.type === 'object' && field.key === 'skills'
}

/** 技能分组键 → 中文（单一来源 schema.SKILL_TYPE_VALUE_LABEL） */
function skillKindLabel(kind: string): string {
  return SKILL_TYPE_VALUE_LABEL[kind] ?? kind
}

// ════ 技能悬浮详情 ════
const skillTipVisible = ref(false)
const skillTipData = ref<TooltipData | null>(null)
const skillTipRect = ref<DOMRect | null>(null)

function showSkillTip(e: MouseEvent, skillId: string): void {
  const config = GameDataProcessor.findSkillById(skillId)
  if (!config) return
  skillTipData.value = {
    name: config.name,
    description: config.description ?? '',
    badge: config.skillType === 'ultimate' ? '终极技' : '技能',
    durationLabel: config.cooldown > 0 ? `${config.cooldown}回合冷却` : undefined,
    details: [
      { label: '能量消耗', value: `${config.energyCost ?? 0}` },
      ...(config.cooldown > 0 ? [{ label: '冷却', value: `${config.cooldown} 回合` }] : []),
    ],
  }
  skillTipRect.value = (e.currentTarget as HTMLElement).getBoundingClientRect()
  skillTipVisible.value = true
}

function hideSkillTip(): void {
  skillTipVisible.value = false
  skillTipData.value = null
}

// ════ 装备合成材料悬浮详情（被引用区：装备详情来源） ════
const gearTipVisible = ref(false)
const gearTipData = ref<TooltipData | null>(null)
const gearTipRect = ref<DOMRect | null>(null)

let gearTipSeq = 0
function showGearTip(e: MouseEvent, gearId: string): void {
  // NOTE: 事件 currentTarget 仅在同步阶段有效，进入异步回调后必为 null —— 先同步取 rect
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const api = container.resolve<GameDataApi>('GameDataApi')
  const seq = ++gearTipSeq
  void api.listByTable<GearData>('gears', { limit: 1000 }).then((gears) => {
    if (seq !== gearTipSeq) return
    const gear = gears.find((g) => g.id === gearId)
    if (!gear) return
    const details = (gear.materials ?? []).map((m) => ({
      label: refName(m.itemId),
      value: `×${m.count}`,
    }))
    if (gear.cost && gear.cost > 0) details.push({ label: '制造金钱', value: `${gear.cost}` })
    gearTipData.value = {
      name: gear.name,
      description: gear.description ?? '',
      badge: NESTED_VALUE_LABEL.slot[gear.slot] ?? gear.slot,
      durationLabel: gear.tier ? NESTED_VALUE_LABEL.tier[gear.tier] ?? gear.tier : undefined,
      details,
      source: gear.source,
    }
    gearTipRect.value = rect
    gearTipVisible.value = true
  })
}

function hideGearTip(): void {
  gearTipVisible.value = false
  gearTipData.value = null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 标量 / 对象渲染：对象转紧凑 JSON，其余转字符串（数组元素对象在此做键值对展示） */
function renderScalar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

const refCount = computed(() => props.references?.reduce((n, g) => n + g.ids.length, 0) ?? 0)
</script>

<style scoped lang="scss">
.fs-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.fs-detail-head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-6) var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
}

.fs-detail-edit {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}

.fs-detail-id {
  font-family: var(--font-family-mono);
  color: var(--color-text-tertiary);
}

.fs-detail-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.fs-detail-table {
  color: var(--color-text-tertiary);
}

.fs-detail-body {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.fs-detail-row {
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border-default);

  &:last-child {
    border-bottom: none;
  }
}

.fs-detail-label {
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-1);
}

.fs-detail-value {
  margin: 0;
  color: var(--color-text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}

.fs-detail-list {
  margin: 0;
  padding-left: var(--space-4);
}

/* 敌人掉落两列网格：右栏详情宽度有限，两列减少纵向滚动 */
.fs-detail-list--grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-3);
}

.fs-detail-list-item {
  line-height: var(--line-height-md);
}

.fs-detail-map {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

/* 属性统计两列网格（enemies/actors 的 stats） */
.fs-detail-map--grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1) var(--space-3);
}

.fs-detail-map-row {
  display: flex;
  gap: var(--space-2);
}

.fs-detail-map-key {
  flex-shrink: 0;
  min-width: 5em;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
}

.fs-detail-map-val {
  margin: 0;
  color: var(--color-text-primary);
  word-break: break-word;
}

/* 技能名 tag（敌人技能组）：悬浮展示详情 */
.fs-skill-tag {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 1px 8px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-info);
  cursor: help;
  transition: var(--transition-fast);

  &:hover {
    border-color: var(--color-info);
    background: var(--color-info-bg);
  }
}

.fs-detail-refs {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fs-detail-refs-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.fs-detail-refs-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--font-size-md);
}

.fs-detail-refs-ids {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  word-break: break-all;
}

/* 被引用区：装备详情（gears）来源的装备名 tag —— 悬浮展示合成材料清单 */
.fs-ref-gear {
  display: inline-block;
  margin: 1px 2px 1px 0;
  padding: 0 6px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-info);
  cursor: help;
  transition: var(--transition-fast);

  &:hover {
    border-color: var(--color-info);
    background: var(--color-info-bg);
  }
}
</style>
