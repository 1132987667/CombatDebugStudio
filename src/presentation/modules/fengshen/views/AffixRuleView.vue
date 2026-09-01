<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      词条投放规则
    </div>

    <!-- Tab 切换 -->
    <div class="fs-exp-tabs" role="tablist" aria-label="词条投放规则">
      <button v-for="t in TABS" :key="t.id" type="button" class="fs-exp-tab" :class="{ active: activeTab === t.id }"
        :role="'tab'" :aria-selected="activeTab === t.id" @click="activeTab = t.id">{{ t.label }}</button>
    </div>

    <!-- ═══ Tab1: 装备设计 ═══ -->
    <section v-if="activeTab === 'matrix'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">装备部位阵营归属</div>
        <div class="fs-form-hint">每个装备部位归属于攻击系（ATK）或防御系（DEF），决定该部位可抽取的词条池。</div>
        <div class="fs-slot-side-readonly">
          <div class="fs-slot-side-row"><span class="fs-slot-side-label">攻击装备</span> {{ atkSlotLabels }}</div>
          <div class="fs-slot-side-row"><span class="fs-slot-side-label">防御装备</span> {{ defSlotLabels }}</div>
        </div>
      </div>

      <!-- 部位固定属性 -->
      <div class="fs-exp-block">
        <div class="fs-block-title">部位固定属性</div>
        <div class="fs-form-hint">每个装备部位必然提供的主属性（武器=攻击、护甲=防御、头部=气血、脚部=闪避、护符=命中、护腕=速度）。</div>
        <div class="fs-rule-wrap is-capped">
          <table class="fs-table fs-rule">
            <colgroup>
              <col style="width:16%" /><col style="width:36%" />
              <col style="width:16%" /><col style="width:16%" /><col style="width:16%" />
            </colgroup>
            <thead><tr><th>部位</th><th>固定属性</th><th class="fs-th-center">轻</th><th class="fs-th-center">中</th><th class="fs-th-center">重</th></tr></thead>
            <tbody>
              <tr v-for="slot in fixedSlotOrder" :key="slot">
                <td class="fs-td-strong">{{ slotGroupLabel(slot) }}</td>
                <td>
                  <TacticalSelect :model-value="cfg.fixed_attributes[slot]" size="md" searchable
                    :options="coreAttrOptions(slot)"
                    @update:model-value="(v: string | number | null) => { if (v) cfg.fixed_attributes[slot] = v as string }" />
                </td>
                <td v-for="(st, stIdx) in slotSubTypes(slot)" :key="st ? st.id : 'empty-' + stIdx" class="fs-td-center">
                  <span v-if="st">{{ st.name }}</span><span v-else class="fs-cell-dim">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fs-rule-grid">
      <!-- 子类型核心属性词条系数 -->
      <div class="fs-exp-block">
        <div class="fs-block-title">子类型核心属性词条系数</div>
        <div class="fs-form-hint">核心属性词条的数值系数：基础值 × 系数（剑=攻击×85%、棍=×100%、锤=×115%）。</div>
        <div class="fs-rule-wrap">
          <table class="fs-table fs-rule">
            <colgroup><col style="width:18%" /><col style="width:18%" /><col style="width:14%" /><col style="width:28%" /><col style="width:22%" /></colgroup>
            <thead><tr><th>子类型</th><th>部位</th><th class="fs-th-center">阵营</th><th>核心属性</th><th class="fs-th-right">系数</th></tr></thead>
            <tbody>
              <tr v-for="st in allSubTypes" :key="st.id">
                <td class="fs-td-strong">{{ st.name }}</td>
                <td>{{ slotGroupLabel(st.slotKey) }}</td>
                <td class="fs-td-center"><span class="fs-affix-tag-sm" :class="st.side === 'ATK' ? 'side-atk' : 'side-def'">{{ st.side }}</span></td>
                <td>
                  <TacticalSelect :model-value="cfg.core_affix_ratio[st.id]?.attribute" size="md" searchable
                    :options="coreAttrOptions(st.slotKey)"
                    @update:model-value="(v: string | number | null) => { if (v) ensureCoreRatio(st.id).attribute = v as string }" />
                </td>
                <td class="fs-td-right">
                  <NumericStepper compact :step="0.05" :min="0" :max="9.95"
                    :model-value="ensureCoreRatio(st.id).ratio"
                    @update:model-value="(v: number) => { ensureCoreRatio(st.id).ratio = v }" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 装备品阶权重 -->
      <div class="fs-exp-block">
        <div class="fs-block-title">装备品阶权重</div>
        <div class="fs-form-hint">装备基础属性投放的品阶权重区间（凡品 0.5~0.6 … 仙品 0.9~1.0），取区间上限参与计算。</div>
        <div class="fs-rule-wrap">
          <table class="fs-table fs-rule">
            <colgroup><col style="width:25%" /><col style="width:25%" /><col style="width:25%" /><col style="width:25%" /></colgroup>
            <thead><tr><th>阶位</th><th class="fs-th-center">强化上限</th><th class="fs-th-right">权重下限</th><th class="fs-th-right">权重上限</th></tr></thead>
            <tbody>
              <tr v-for="(tw, tier) in cfg.tier_weight" :key="tier">
                <td class="fs-td-strong">{{ tierLabel(tier) }}</td>
                <td class="fs-cell-num fs-td-center">{{ tierEnhanceCap(tier) }}</td>
                <td class="fs-td-right"><input v-model.number="tw.min" type="number" step="0.1" min="0" max="1" class="fs-input fs-exp-num fs-num-right" /></td>
                <td class="fs-td-right"><input v-model.number="tw.max" type="number" step="0.1" min="0" max="1" class="fs-input fs-exp-num fs-num-right" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <!-- 词条数值曲线 -->
      <div class="fs-exp-block">
        <div class="fs-block-title">词条数值曲线</div>
        <div class="fs-form-hint">按来源系统定义各属性组的词条数值区间，随等级线性成长：满级值 ≈ 基础 + 每级成长 × (等级-1)。</div>
        <div v-for="(rows, sysKey) in cfg.affix_value_curve" :key="sysKey" class="fs-curve-system">
          <div class="fs-block-title" style="margin-top: var(--space-3);">{{ valueCurveSystemLabel(sysKey) }}</div>
          <div class="fs-rule-wrap is-scroll">
            <table class="fs-table fs-rule">
              <colgroup><col style="width:280px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /></colgroup>
              <thead>
                <tr><th>属性组</th><th class="fs-th-center">下限基础</th><th class="fs-th-center">下限成长</th><th class="fs-th-center">下限满级</th><th class="fs-th-center">上限基础</th><th class="fs-th-center">上限成长</th><th class="fs-th-center">上限满级</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in rows" :key="i">
                  <td>{{ attrNames(row.attributes) }}</td>
                  <td class="fs-td-center"><input v-model.number="row.min.base" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.min.perLevel" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.min.full" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.base" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.perLevel" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.full" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">装备附加词条</div>
        <div class="fs-form-hint">每行定义一条词条槽位的属性组来源池。ATK 侧行从攻击系属性组抽池，DEF 侧行从防御系属性组抽池。同一行同一侧不可重复选择相同属性组。</div>
        <div class="fs-rule-wrap is-scroll">
        <table class="fs-table">
          <thead>
            <tr><th style="width:40px">行</th><th style="width:120px">词条名称</th><th>ATK 侧属性组池</th><th>DEF 侧属性组池</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in cfg.affix_rows" :key="row.row">
              <td>{{ row.row }}</td>
              <td><input v-model="row.name" type="text" class="fs-input" /></td>
              <td>
                <div class="fs-pool-editor">
                  <TacticalSelect v-for="(g, i) in row.pool.ATK" :key="i" :model-value="g" size="md" clearable
                    :options="poolOptions('ATK', row, 'ATK')"
                    @update:model-value="(v: string | number | null) => { if (v) row.pool.ATK[i] = v as string }"
                    @clear="row.pool.ATK.splice(i, 1)" />
                  <Button size="small" @click="row.pool.ATK.push(nextGroupCode('ATK', row, 'ATK'))">+ 添加</Button>
                </div>
              </td>
              <td>
                <div class="fs-pool-editor">
                  <TacticalSelect v-for="(g, i) in row.pool.DEF" :key="i" :model-value="g" size="md" clearable
                    :options="poolOptions('DEF', row, 'DEF')"
                    @update:model-value="(v: string | number | null) => { if (v) row.pool.DEF[i] = v as string }"
                    @clear="row.pool.DEF.splice(i, 1)" />
                  <Button size="small" @click="row.pool.DEF.push(nextGroupCode('DEF', row, 'DEF'))">+ 添加</Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- 子类型矩阵预览 -->
      <div class="fs-exp-block">
        <div class="fs-block-title">装备子类型词条矩阵预览</div>
        <div class="fs-form-hint">每个子类型的可用属性组 = 所属阵营对应的组池。</div>
        <div class="fs-rule-wrap is-scroll">
          <table class="fs-table fs-affix-matrix">
            <thead>
              <tr>
                <th>词条行</th>
                <th v-for="st in allSubTypes" :key="st.id" :class="st.side === 'ATK' ? 'side-atk' : 'side-def'">
                  {{ st.name }}<br /><small>{{ st.side }}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in cfg.affix_rows" :key="row.row">
                <td>{{ row.name }}</td>
                <td v-for="st in allSubTypes" :key="st.id" :class="st.side === 'ATK' ? 'side-atk' : 'side-def'">
                  <span v-for="g in (row.pool[st.side] ?? [])" :key="g" class="fs-affix-tag-sm">{{ g }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ═══ Tab2: 宠物与坐骑 ═══ -->
    <section v-else-if="activeTab === 'pet_mount'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">宠物与坐骑词条数值曲线</div>
        <div class="fs-form-hint">定义宠物与坐骑的词条数值区间，随等级线性成长：满级值 ≈ 基础 + 每级成长 × (等级-1)。</div>
        <div v-for="(rows, sysKey) in cfg.affix_value_curve" :key="sysKey" class="fs-curve-system">
          <div v-if="sysKey === 'pet_mount'" class="fs-block-title" style="margin-top: var(--space-3);">{{ valueCurveSystemLabel(sysKey) }}</div>
          <div v-if="sysKey === 'pet_mount'" class="fs-rule-wrap is-scroll">
            <table class="fs-table fs-rule">
              <colgroup><col style="width:280px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /><col style="width:110px" /></colgroup>
              <thead>
                <tr><th>属性组</th><th class="fs-th-center">下限基础</th><th class="fs-th-center">下限成长</th><th class="fs-th-center">下限满级</th><th class="fs-th-center">上限基础</th><th class="fs-th-center">上限成长</th><th class="fs-th-center">上限满级</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in rows" :key="i">
                  <td>{{ attrNames(row.attributes) }}</td>
                  <td class="fs-td-center"><input v-model.number="row.min.base" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.min.perLevel" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.min.full" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.base" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.perLevel" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                  <td class="fs-td-center"><input v-model.number="row.max.full" type="number" step="0.01" class="fs-input fs-exp-num" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Tab3: 属性组配置 ═══ -->
    <section v-else-if="activeTab === 'groups'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">属性组列表（{{ Object.keys(cfg.attribute_groups).length }} 组）</div>
        <div class="fs-form-hint">每个属性组定义一组同阵营、同层级的属性集合。点击「编辑」管理组内属性。</div>

        <div class="fs-table-wrap">
          <table class="fs-table">
            <thead>
              <tr><th>组码</th><th>标签</th><th>阵营</th><th>层级</th><th>属性数</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="(group, code) in cfg.attribute_groups" :key="code">
                <td class="fs-mono">{{ code }}</td>
                <td>{{ group.label }}</td>
                <td><span class="fs-affix-tag-sm" :class="group.side === 'ATK' ? 'side-atk' : 'side-def'">{{ group.side }}</span></td>
                <td><span class="fs-affix-tag-sm">{{ group.tier }}</span></td>
                <td class="fs-cell-num">{{ group.attributes.length }}</td>
                <td class="fs-col-actions">
                  <Button size="small" @click="openEditGroup(code)">编辑</Button>
                  <Button size="small" variant="danger" @click="removeGroup(code)">删除</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="fs-toolbar" style="margin-top: var(--space-3);">
          <input v-model="newGroupCode" type="text" class="fs-input" placeholder="新组码（如 ATK-L4）" style="width:160px" />
          <Button size="small" variant="primary" @click="addGroup">添加属性组</Button>
        </div>
      </div>

      <!-- 编辑属性组弹窗 -->
      <Dialog v-model="editGroupOpen" title="编辑属性组" width="560px" :esc-closable="false" :mask-closable="false">
        <div v-if="editingGroup" class="fs-group-edit">
          <div class="fs-edit-row">
            <span class="fs-exp-field-label">组码</span>
            <span class="fs-mono">{{ editingCode }}</span>
            <span class="fs-exp-field-label">标签</span>
            <input v-model="editingGroup.label" type="text" class="fs-input fs-exp-formula" />
          </div>
          <div class="fs-edit-row">
            <span class="fs-exp-field-label">阵营</span>
            <TacticalSelect :model-value="editingGroup.side" size="md" :options="SIDE_OPTIONS"
              @update:model-value="(v: string | number | null) => { if (v) editingGroup.side = v as 'ATK' | 'DEF' }" />
            <span class="fs-exp-field-label">层级</span>
            <TacticalSelect :model-value="editingGroup.tier" size="md" :options="TIER_OPTIONS"
              @update:model-value="(v: string | number | null) => { if (v) editingGroup.tier = v as string }" />
          </div>

          <div class="fs-edit-attrs">
            <div class="fs-block-title">组内属性（{{ editingGroup.attributes.length }}）</div>
            <div class="fs-group-attrs">
              <span v-for="(attr, i) in editingGroup.attributes" :key="i" class="fs-attr-chip">
                <span class="fs-attr-name">{{ editingGroup.names[i] ?? attr }}</span>
                <span class="fs-attr-code">{{ attr }}</span>
                <button type="button" class="fs-chip-remove" @click="removeAttr(editingCode, i)">x</button>
              </span>
            </div>
            <div class="fs-group-add-attr">
              <TacticalSelect :model-value="addAttrSelection[editingCode] ?? null" size="md" searchable placeholder="选择属性…"
                :options="availableAttrsOptions(editingCode)"
                @update:model-value="(v: string | number | null) => { addAttrSelection[editingCode] = v as string }" />
              <input v-model="addAttrNameSelection[editingCode]" type="text" class="fs-input" placeholder="显示名称" style="width:120px" />
              <Button size="small" @click="addAttr(editingCode)">添加属性</Button>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="fs-edit-footer">
            <Button variant="ghost" @click="editGroupOpen = false">关闭</Button>
          </div>
        </template>
      </Dialog>
    </section>

    <!-- ═══ Tab3: 禁止规则 ═══ -->
    <section v-else-if="activeTab === 'forbidden'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">词条禁止规则</div>
        <div class="fs-form-hint">指定装备部位不允许洗出的属性词条。例如武器不出免伤率、护甲不出暴击率等。</div>
        <div class="fs-rule-wrap">
        <table class="fs-table fs-rule">
          <colgroup><col style="width:180px" /><col /><col style="width:220px" /><col style="width:72px" /></colgroup>
          <thead>
            <tr><th>装备部位</th><th>禁止属性</th><th>显示名称</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="(rule, idx) in cfg.forbidden" :key="idx">
              <td>
                <TacticalSelect :model-value="rule.slot" size="md" :options="forbiddenSlotOptions"
                  @update:model-value="(v: string | number | null) => { if (v) { rule.slot = v as string; rule.slotLabel = slotGroupLabel(v as string) } }" />
              </td>
              <td>
                <div class="fs-forbidden-attrs">
                  <TacticalSelect v-for="(attr, i) in rule.attributes" :key="i" :model-value="attr" size="md" searchable clearable
                    :options="allAttrsOptions"
                    @update:model-value="(v: string | number | null) => { if (v) { rule.attributes[i] = v as string; rule.attributeLabels[i] = attrNameByCode(v as string) } }"
                    @clear="rule.attributes.splice(i, 1); rule.attributeLabels.splice(i, 1)" />
                  <Button size="small" @click="addForbiddenAttr(idx)">+ 添加</Button>
                </div>
              </td>
              <td>
                <div class="fs-forbidden-labels">
                  <span v-for="(label, i) in rule.attributeLabels" :key="i" class="fs-forbidden-label-tag">
                    <input v-model="rule.attributeLabels[i]" type="text" class="fs-inline-input" />
                  </span>
                </div>
              </td>
              <td><button type="button" class="fs-btn-danger-sm" @click="cfg.forbidden.splice(idx, 1)">删除</button></td>
            </tr>
          </tbody>
        </table>
        </div>
        <div class="fs-toolbar" style="margin-top: var(--space-2);">
          <Button size="small" variant="primary" @click="addForbiddenRule">添加禁止规则</Button>
        </div>
      </div>
    </section>

    <!-- ═══ Tab4: 导出配置 ═══ -->
    <section v-else-if="activeTab === 'export'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">导出 JSON 配置</div>
        <div class="fs-form-hint">导出当前词条投放规则为 JSON 文件，可直接替换 configs/equipment/affix-rule.json。</div>
        <div class="fs-export-preview">
          <pre class="fs-code-block">{{ exportJson }}</pre>
        </div>
        <div class="fs-toolbar" style="margin-top: var(--space-2);">
          <Button variant="energy" @click="downloadJson">下载 JSON 文件</Button>
          <Button size="small" @click="copyJson">复制到剪贴板</Button>
        </div>
      </div>
    </section>

    <!-- ═══ 公共底部 ═══ -->
    <div v-if="errors.length" class="fs-form-errors">
      <div v-for="e in errors" :key="e" class="fs-form-error">{{ e }}</div>
    </div>

    <div class="fs-toolbar" style="margin-top: var(--space-3);">
      <Button variant="energy" @click="save">保存到封神榜</Button>
      <Button variant="danger" size="small" @click="reset">重置默认</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { AffixRuleConfig } from '@/domain/fengshen/types'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'
import NumericStepper from '@/presentation/components/NumericStepper.vue'
import Dialog from '@/presentation/components/Dialog.vue'
import type { TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const notification = useNotificationStore()

const TABS = [
  { id: 'matrix', label: '装备设计' },
  { id: 'pet_mount', label: '宠物与坐骑' },
  { id: 'groups', label: '属性组配置' },
  { id: 'forbidden', label: '禁止规则' },
  { id: 'export', label: '导出配置' },
] as const

const SIDE_OPTIONS: TSelectOption[] = [
  { value: 'ATK', label: 'ATK（攻击系）' },
  { value: 'DEF', label: 'DEF（防御系）' },
]

const TIER_OPTIONS: TSelectOption[] = [
  { value: 'L1', label: 'L1 — 基础数值' },
  { value: 'L2', label: 'L2 — 百分比加成' },
  { value: 'L3', label: 'L3 — 独立系数' },
  { value: 'L4', label: 'L4 — 最终乘区' },
]

// ── 全量属性列表 ──
interface AttrInfo { code: string; name: string; isPercentage: boolean }
const ALL_ATTRS: AttrInfo[] = [
  { code: 'attack', name: '攻击', isPercentage: false },
  { code: 'hitValue', name: '命中值', isPercentage: false },
  { code: 'speed', name: '速度', isPercentage: false },
  { code: 'maxHealth', name: '气血', isPercentage: false },
  { code: 'defense', name: '防御', isPercentage: false },
  { code: 'dodgeValue', name: '闪避值', isPercentage: false },
  { code: 'attackBonus', name: '攻击加成', isPercentage: true },
  { code: 'hitBonus', name: '命中加成', isPercentage: true },
  { code: 'speedBonus', name: '速度加成', isPercentage: true },
  { code: 'healthBonus', name: '气血加成', isPercentage: true },
  { code: 'defenseBonus', name: '防御加成', isPercentage: true },
  { code: 'dodgeBonus', name: '闪避加成', isPercentage: true },
  { code: 'shieldBonus', name: '护盾加成', isPercentage: true },
  { code: 'healBonus', name: '治疗强度加成', isPercentage: true },
  { code: 'reflectBonus', name: '伤害反弹加成', isPercentage: true },
  { code: 'damageBoost', name: '伤害加成', isPercentage: true },
  { code: 'normalAtkBonus', name: '普攻加成', isPercentage: true },
  { code: 'skillBonus', name: '技能加成', isPercentage: true },
  { code: 'critRate', name: '暴击率', isPercentage: true },
  { code: 'critDamage', name: '暴击伤害', isPercentage: true },
  { code: 'hit', name: '命中率', isPercentage: true },
  { code: 'comboRate', name: '连击率', isPercentage: true },
  { code: 'trueDamageRate', name: '真伤率', isPercentage: true },
  { code: 'counterRate', name: '反击率', isPercentage: true },
  { code: 'lifestealRate', name: '吸血率', isPercentage: true },
  { code: 'effectHit', name: '效果命中', isPercentage: true },
  { code: 'controlSuccessRate', name: '控制命中', isPercentage: true },
  { code: 'lifestealBonus', name: '吸血效果加成', isPercentage: true },
  { code: 'armorBreak', name: '破甲', isPercentage: true },
  { code: 'vulnerability', name: '易伤', isPercentage: true },
  { code: 'shieldReduction', name: '护盾削减', isPercentage: true },
  { code: 'healReduction', name: '治疗强度削减', isPercentage: true },
  { code: 'lifestealReduction', name: '吸血效果削减', isPercentage: true },
  { code: 'reflectReduction', name: '伤害反弹削减', isPercentage: true },
  { code: 'damageReduction', name: '免伤率', isPercentage: true },
  { code: 'shield', name: '护盾', isPercentage: false },
  { code: 'reflectDamagePercent', name: '伤害反弹', isPercentage: true },
  { code: 'hpRegenPercent', name: '气血回复(%)', isPercentage: true },
  { code: 'dodge', name: '闪避率', isPercentage: true },
  { code: 'critResist', name: '暴击抵抗', isPercentage: true },
  { code: 'critDmgTakenReduction', name: '暴伤减免', isPercentage: true },
  { code: 'trueDamageResist', name: '真伤抗性', isPercentage: true },
  { code: 'normalAtkDmgReduction', name: '普攻抵抗', isPercentage: true },
  { code: 'skillDmgReduction', name: '技能抵抗', isPercentage: true },
  { code: 'controlImmunity', name: '控制豁免', isPercentage: true },
  { code: 'debuffImmunityRate', name: '效果抵抗', isPercentage: true },
  { code: 'energyInit', name: '初始能量', isPercentage: false },
  { code: 'energyGainEfficiency', name: '能量获取效率', isPercentage: true },
  { code: 'splash', name: '溅射', isPercentage: true },
  { code: 'damageCoefficient', name: '伤害系数', isPercentage: true },
  { code: 'comboDamageCoefficient', name: '连击伤害系数', isPercentage: true },
  { code: 'counterDamageCoefficient', name: '反击伤害系数', isPercentage: true },
  { code: 'trueDamageCoefficient', name: '真伤系数', isPercentage: true },
  { code: 'attackCoefficient', name: '攻击系数', isPercentage: true },
  { code: 'hitCoefficient', name: '命中系数', isPercentage: true },
  { code: 'speedCoefficient', name: '速度系数', isPercentage: true },
  { code: 'healthCoefficient', name: '气血系数', isPercentage: true },
  { code: 'defenseCoefficient', name: '防御系数', isPercentage: true },
  { code: 'dodgeCoefficient', name: '闪避系数', isPercentage: true },
  { code: 'damageReductionCoefficient', name: '免伤系数', isPercentage: true },
  { code: 'finalAttack', name: '最终攻击', isPercentage: true },
  { code: 'finalDefense', name: '最终防御', isPercentage: true },
  { code: 'finalDamageBoost', name: '最终伤害提升', isPercentage: true },
  { code: 'finalDamageReduction', name: '最终伤害减免', isPercentage: true },
]

// ── 词条数值曲线默认值（对齐 configs/equipment/affix-rule.json 的 affix_value_curve） ──
const DEFAULT_VALUE_CURVE: AffixRuleConfig['affix_value_curve'] = {
  equipment: [
    { attributes: ['attackBonus', 'hitBonus', 'speedBonus', 'healthBonus', 'defenseBonus', 'dodgeBonus'], min: { base: 1, perLevel: 0.1, full: 6 }, max: { base: 10, perLevel: 0.2, full: 20 } },
    { attributes: ['attackCoefficient', 'hitCoefficient', 'speedCoefficient', 'healthCoefficient', 'defenseCoefficient', 'dodgeCoefficient'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['hit', 'dodge', 'lifestealRate', 'effectHit', 'controlSuccessRate'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['counterRate', 'trueDamageRate', 'critRate', 'reflectDamagePercent', 'critResist'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 3, perLevel: 0.1, full: 8 } },
    { attributes: ['critDamage', 'critDmgTakenReduction', 'damageCoefficient', 'comboDamageCoefficient', 'counterDamageCoefficient', 'trueDamageCoefficient', 'finalAttack', 'finalDefense'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['comboRate'], min: { base: 3, perLevel: 0.06, full: 6 }, max: { base: 8, perLevel: 0.12, full: 14 } },
    { attributes: ['damageBoost', 'normalAtkBonus', 'skillBonus', 'shieldBonus', 'healBonus', 'reflectBonus', 'finalDamageBoost', 'lifestealBonus'], min: { base: 1, perLevel: 0.1, full: 6 }, max: { base: 10, perLevel: 0.2, full: 20 } },
    { attributes: ['trueDamageResist', 'normalAtkDmgReduction', 'skillDmgReduction', 'controlImmunity', 'debuffImmunityRate', 'armorBreak'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['energyGainEfficiency'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['shieldReduction', 'healReduction', 'lifestealReduction', 'reflectReduction'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 3, perLevel: 0.1, full: 8 } },
    { attributes: ['damageReduction', 'damageReductionCoefficient', 'finalDamageReduction'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['hpRegenPercent'], min: { base: 1, perLevel: 0.02, full: 2 }, max: { base: 3, perLevel: 0.04, full: 5 } },
    { attributes: ['energyInit'], min: { base: 5, perLevel: 0.1, full: 10 }, max: { base: 15, perLevel: 0.2, full: 25 } },
    { attributes: ['splash'], min: { base: 3, perLevel: 0.06, full: 6 }, max: { base: 8, perLevel: 0.12, full: 14 } },
  ],
  pet_mount: [
    { attributes: ['attackBonus', 'hitBonus', 'speedBonus', 'healthBonus', 'defenseBonus', 'dodgeBonus'], min: { base: 6, perLevel: 0.16, full: 14 }, max: { base: 15, perLevel: 0.3, full: 30 } },
    { attributes: ['attackCoefficient', 'hitCoefficient', 'speedCoefficient', 'healthCoefficient', 'defenseCoefficient', 'dodgeCoefficient'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['hit', 'dodge', 'lifestealRate', 'effectHit', 'controlSuccessRate'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['counterRate', 'trueDamageRate', 'critRate', 'reflectDamagePercent', 'critResist'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 3, perLevel: 0.1, full: 8 } },
    { attributes: ['critDamage', 'critDmgTakenReduction', 'damageCoefficient', 'comboDamageCoefficient', 'counterDamageCoefficient', 'trueDamageCoefficient', 'finalAttack', 'finalDefense'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['comboRate'], min: { base: 3, perLevel: 0.06, full: 6 }, max: { base: 8, perLevel: 0.12, full: 14 } },
    { attributes: ['damageBoost', 'normalAtkBonus', 'skillBonus', 'shieldBonus', 'healBonus', 'reflectBonus', 'finalDamageBoost', 'lifestealBonus'], min: { base: 1, perLevel: 0.1, full: 6 }, max: { base: 10, perLevel: 0.2, full: 20 } },
    { attributes: ['trueDamageResist', 'normalAtkDmgReduction', 'skillDmgReduction', 'controlImmunity', 'debuffImmunityRate', 'armorBreak'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['energyGainEfficiency'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 4, perLevel: 0.12, full: 10 } },
    { attributes: ['shieldReduction', 'healReduction', 'lifestealReduction', 'reflectReduction'], min: { base: 1, perLevel: 0.06, full: 4 }, max: { base: 3, perLevel: 0.1, full: 8 } },
    { attributes: ['damageReduction', 'damageReductionCoefficient', 'finalDamageReduction'], min: { base: 1, perLevel: 0.04, full: 3 }, max: { base: 3, perLevel: 0.06, full: 6 } },
    { attributes: ['hpRegenPercent'], min: { base: 1, perLevel: 0.02, full: 2 }, max: { base: 3, perLevel: 0.04, full: 5 } },
    { attributes: ['energyInit'], min: { base: 5, perLevel: 0.1, full: 10 }, max: { base: 15, perLevel: 0.2, full: 25 } },
    { attributes: ['splash'], min: { base: 3, perLevel: 0.06, full: 6 }, max: { base: 8, perLevel: 0.12, full: 14 } },
  ],
}

// ── 默认配置 ──
function defaultConfig(): AffixRuleConfig {
  return {
    id: 'affix_rule',
    description: '附加属性（词条）投放规则',
    fixed_attributes: {
      weapon: 'attack',
      armor: 'defense',
      helmet: 'maxHealth',
      boots: 'dodgeValue',
      charm: 'hitValue',
      glove: 'speed',
    },
    tier_weight: {
      fan: { min: 0.5, max: 0.6 },
      xuan: { min: 0.6, max: 0.7 },
      di: { min: 0.7, max: 0.8 },
      tian: { min: 0.8, max: 0.9 },
      xian: { min: 0.9, max: 1.0 },
    },
    core_affix_ratio: {
      sword: { attribute: 'attack', ratio: 0.85 },
      dagger: { attribute: 'attack', ratio: 0.85 },
      staff: { attribute: 'attack', ratio: 1.0 },
      blade: { attribute: 'attack', ratio: 1.0 },
      cloth_armor: { attribute: 'defense', ratio: 0.85 },
      leather_armor: { attribute: 'defense', ratio: 1.0 },
      plate_armor: { attribute: 'defense', ratio: 1.15 },
      face_guard: { attribute: 'maxHealth', ratio: 0.85 },
      crown: { attribute: 'maxHealth', ratio: 1.0 },
      helmet: { attribute: 'maxHealth', ratio: 1.15 },
      cloth_boots: { attribute: 'dodgeValue', ratio: 1.15 },
      leather_boots: { attribute: 'dodgeValue', ratio: 1.0 },
      battle_boots: { attribute: 'dodgeValue', ratio: 0.85 },
      charm: { attribute: 'hitValue', ratio: 1.0 },
      glove: { attribute: 'speed', ratio: 1.0 },
    },
    affix_value_curve: DEFAULT_VALUE_CURVE,
    attribute_groups: {
      'ATK-L1': { label: '攻击系·基础数值', side: 'ATK', tier: 'L1', attributes: ['attack', 'hitValue', 'speed'], names: ['攻击', '命中', '速度'] },
      'ATK-L2': { label: '攻击系·百分比加成', side: 'ATK', tier: 'L2', attributes: ['attackBonus', 'hitBonus', 'speedBonus'], names: ['攻击加成', '命中加成', '速度加成'] },
      'ATK-L3': { label: '攻击系·独立系数', side: 'ATK', tier: 'L3', attributes: ['attackCoefficient', 'hitCoefficient', 'speedCoefficient'], names: ['攻击系数', '命中系数', '速度系数'] },
      'ATK-MEC': { label: '攻击系·机制对抗', side: 'ATK', tier: 'L1', attributes: ['critRate', 'critDamage', 'hit', 'comboRate', 'trueDamageRate', 'damageBoost', 'normalAtkBonus', 'skillBonus', 'counterRate', 'lifestealRate', 'effectHit', 'controlSuccessRate', 'lifestealBonus'], names: ['暴击率', '暴击伤害', '命中率', '连击率', '真伤率', '伤害加成', '普攻加成', '技能加成', '反击率', '吸血率', '效果命中', '控制命中', '吸血效果加成'] },
      'SHD-L1': { label: '破甲·易伤', side: 'ATK', tier: 'L1', attributes: ['armorBreak', 'vulnerability'], names: ['破甲', '易伤'] },
      'SHD-L2': { label: '削减类', side: 'ATK', tier: 'L2', attributes: ['shieldReduction', 'healReduction', 'lifestealReduction', 'reflectReduction'], names: ['护盾削减', '治疗强度削减', '吸血效果削减', '伤害反弹削减'] },
      'DEF-L1': { label: '防御系·基础数值', side: 'DEF', tier: 'L1', attributes: ['maxHealth', 'defense', 'dodgeValue'], names: ['气血', '防御', '闪避'] },
      'DEF-L2': { label: '防御系·百分比加成', side: 'DEF', tier: 'L2', attributes: ['healthBonus', 'defenseBonus', 'dodgeBonus'], names: ['气血加成', '防御加成', '闪避加成'] },
      'DEF-L3': { label: '防御系·独立系数', side: 'DEF', tier: 'L3', attributes: ['healthCoefficient', 'defenseCoefficient', 'dodgeCoefficient'], names: ['气血系数', '防御系数', '闪避系数'] },
      'DEF-MEC': { label: '防御系·机制对抗', side: 'DEF', tier: 'L1', attributes: ['damageReduction', 'shield', 'reflectDamagePercent', 'hpRegenPercent', 'shieldBonus', 'healBonus', 'reflectBonus', 'dodge', 'critResist', 'critDmgTakenReduction', 'trueDamageResist', 'normalAtkDmgReduction', 'skillDmgReduction', 'controlImmunity', 'debuffImmunityRate'], names: ['免伤率', '护盾', '伤害反弹', '气血回复(%)', '护盾加成', '治疗强度加成', '伤害反弹加成', '闪避率', '暴击抵抗', '暴伤减免', '真伤抗性', '普攻抵抗', '技能抵抗', '控制豁免', '效果抵抗'] },
      'ALL-MEC': { label: '通用·机制节奏', side: 'DEF', tier: 'L1', attributes: ['energyInit', 'energyGainEfficiency', 'splash'], names: ['初始能量', '能量获取效率', '溅射'] },
      'L3-通用': { label: '通用·独立乘区', side: 'ATK', tier: 'L3', attributes: ['damageCoefficient', 'comboDamageCoefficient', 'counterDamageCoefficient', 'trueDamageCoefficient'], names: ['伤害系数', '连击伤害系数', '反击伤害系数', '真伤系数'] },
      'L4-通用': { label: '通用·最终乘区', side: 'DEF', tier: 'L4', attributes: ['damageReductionCoefficient', 'finalAttack', 'finalDefense', 'finalDamageBoost', 'finalDamageReduction'], names: ['免伤系数', '最终攻击', '最终防御', '最终伤害提升', '最终伤害减免'] },
      'ATK-ADD': { label: '攻击系·百分比加成（完整）', side: 'ATK', tier: 'L2', attributes: ['attackBonus', 'hitBonus', 'speedBonus', 'damageBoost', 'normalAtkBonus', 'skillBonus'], names: ['攻击加成', '命中加成', '速度加成', '伤害加成', '普攻加成', '技能加成'] },
      'DEF-ADD': { label: '防御系·百分比加成（完整）', side: 'DEF', tier: 'L2', attributes: ['healthBonus', 'defenseBonus', 'dodgeBonus', 'shieldBonus', 'healBonus', 'reflectBonus'], names: ['气血加成', '防御加成', '闪避加成', '护盾加成', '治疗强度加成', '伤害反弹加成'] },
      'ATK-ALL': { label: '攻击系·全部属性', side: 'ATK', tier: 'L1', attributes: ['critRate', 'critDamage', 'hit', 'comboRate', 'trueDamageRate', 'damageBoost', 'normalAtkBonus', 'skillBonus', 'counterRate', 'lifestealRate', 'effectHit', 'controlSuccessRate', 'lifestealBonus', 'armorBreak', 'vulnerability', 'damageCoefficient', 'comboDamageCoefficient', 'counterDamageCoefficient', 'trueDamageCoefficient', 'shieldReduction', 'healReduction', 'lifestealReduction', 'reflectReduction', 'finalAttack', 'finalDamageBoost'], names: ['暴击率', '暴击伤害', '命中率', '连击率', '真伤率', '伤害加成', '普攻加成', '技能加成', '反击率', '吸血率', '效果命中', '控制命中', '吸血效果加成', '破甲', '易伤', '伤害系数', '连击伤害系数', '反击伤害系数', '真伤系数', '护盾削减', '治疗强度削减', '吸血效果削减', '伤害反弹削减', '最终攻击', '最终伤害提升'] },
      'DEF-ALL': { label: '防御系·全部属性', side: 'DEF', tier: 'L1', attributes: ['damageReduction', 'shield', 'reflectDamagePercent', 'hpRegenPercent', 'shieldBonus', 'healBonus', 'reflectBonus', 'dodge', 'critResist', 'critDmgTakenReduction', 'trueDamageResist', 'normalAtkDmgReduction', 'skillDmgReduction', 'controlImmunity', 'debuffImmunityRate', 'energyInit', 'energyGainEfficiency', 'damageReductionCoefficient', 'finalDefense', 'finalDamageReduction'], names: ['免伤率', '护盾', '伤害反弹', '气血回复(%)', '护盾加成', '治疗强度加成', '伤害反弹加成', '闪避率', '暴击抵抗', '暴伤减免', '真伤抗性', '普攻抵抗', '技能抵抗', '控制豁免', '效果抵抗', '初始能量', '能量获取效率', '免伤系数', '最终防御', '最终伤害减免'] },
    },
    sub_type_groups: {
      weapon: { label: '武器', sub_types: [{ id: 'sword', name: '剑' }, { id: 'staff', name: '棍' }, { id: 'hammer', name: '锤' }] },
      armor: { label: '衣甲', sub_types: [{ id: 'cloth_armor', name: '布甲' }, { id: 'leather_armor', name: '皮甲' }, { id: 'plate_armor', name: '盔甲' }] },
      helmet: { label: '头部', sub_types: [{ id: 'face_guard', name: '面' }, { id: 'crown', name: '冠' }, { id: 'helmet', name: '头盔' }] },
      boots: { label: '脚部', sub_types: [{ id: 'cloth_boots', name: '布靴' }, { id: 'leather_boots', name: '皮靴' }, { id: 'battle_boots', name: '战靴' }] },
      charm: { label: '护符', sub_types: [{ id: 'charm', name: '护符' }] },
      glove: { label: '护腕', sub_types: [{ id: 'glove', name: '护腕' }] },
    },
    slot_side: { weapon: 'ATK', armor: 'DEF', helmet: 'DEF', boots: 'DEF', charm: 'ATK', glove: 'ATK' },
    affix_rows: [
      { row: 1, name: '基础属性', pool: { ATK: ['ATK-L1'], DEF: ['DEF-L1'] } },
      { row: 2, name: '百分比加成', pool: { ATK: ['ATK-ADD'], DEF: ['DEF-ADD'] } },
      { row: 3, name: '生存对抗', pool: { ATK: ['ATK-MEC', 'SHD-L2'], DEF: ['DEF-MEC', 'ALL-MEC'] } },
      { row: 4, name: '机制功能', pool: { ATK: ['ATK-ALL'], DEF: ['DEF-ALL'] } },
      { row: 5, name: '独立系数', pool: { ATK: ['L3-通用', 'ATK-L3'], DEF: ['L4-通用', 'DEF-L3'] } },
    ],
    forbidden: [
      { slot: 'weapon', slotLabel: '武器', attributes: ['damageReduction'], attributeLabels: ['免伤率'] },
      { slot: 'armor', slotLabel: '护甲', attributes: ['critRate'], attributeLabels: ['暴击率'] },
      { slot: 'boots', slotLabel: '脚部', attributes: ['critDamage'], attributeLabels: ['暴击伤害'] },
      { slot: 'charm', slotLabel: '护符', attributes: ['defense', 'defenseBonus', 'defenseCoefficient'], attributeLabels: ['防御', '防御加成', '防御系数'] },
    ],
  }
}

// ── 状态 ──
const cfg = reactive<AffixRuleConfig>(defaultConfig())
const errors = ref<string[]>([])
const activeTab = ref<'matrix' | 'pet_mount' | 'groups' | 'forbidden' | 'export'>('matrix')
const newGroupCode = ref('')
const addAttrSelection = ref<Record<string, string>>({})
const addAttrNameSelection = ref<Record<string, string>>({})

// 属性组编辑弹窗
const editGroupOpen = ref(false)
const editingCode = ref('')
const editingGroup = computed(() => (editingCode.value ? (cfg.attribute_groups[editingCode.value] ?? null) : null))

// ── 计算 ──
const allGroupCodes = computed(() => Object.keys(cfg.attribute_groups))

const allSubTypes = computed(() => {
  const result: Array<{ id: string; name: string; side: 'ATK' | 'DEF'; slotKey: string }> = []
  for (const [groupId, group] of Object.entries(cfg.sub_type_groups)) {
    const side = cfg.slot_side[groupId] ?? 'ATK'
    for (const st of group.sub_types) result.push({ id: st.id, name: st.name, side, slotKey: groupId })
  }
  return result
})

/** 部位展示顺序（固定属性表行序） */
const fixedSlotOrder = ['weapon', 'armor', 'helmet', 'boots', 'charm', 'glove']

/** 部位下子类型（对齐 轻/中/重 三列；护符/护腕无子类型显示 —） */
function slotSubTypes(slot: string): Array<{ id: string; name: string } | null> {
  const sts = cfg.sub_type_groups[slot]?.sub_types ?? []
  return [sts[0] ?? null, sts[1] ?? null, sts[2] ?? null]
}

/** 核心属性选项（固定属性 / 子类型核心词条共用：六维基础属性 + 百分比加成） */
function coreAttrOptions(slot: string): TSelectOption[] {
  return ALL_ATTRS.filter((a) => ['attack', 'defense', 'maxHealth', 'dodgeValue', 'hitValue', 'speed', 'attackBonus', 'defenseBonus', 'healthBonus', 'dodgeBonus', 'hitBonus', 'speedBonus'].includes(a.code))
    .map((a) => ({ value: a.code, label: a.name, hint: a.code }))
}

/** 确保子类型核心词条系数存在（编辑时惰性初始化） */
function ensureCoreRatio(subTypeId: string): { attribute: string; ratio: number } {
  const existing = cfg.core_affix_ratio[subTypeId]
  if (existing) return existing
  const ratio = { attribute: 'attack', ratio: 1 }
  cfg.core_affix_ratio[subTypeId] = ratio
  return ratio
}

/** 品阶中文名 */
function tierLabel(tier: string): string {
  return ({ fan: '凡品', xuan: '玄品', di: '地品', tian: '天品', xian: '仙品' } as Record<string, string>)[tier] ?? tier
}

/** 品阶强化上限（对齐 PRD §21） */
function tierEnhanceCap(tier: string): number {
  return ({ fan: 3, xuan: 6, di: 9, tian: 12, xian: 15 } as Record<string, number>)[tier] ?? 0
}

/** 词条数值曲线：来源系统中文名 */
function valueCurveSystemLabel(sysKey: string): string {
  return ({ equipment: '装备', pet_mount: '宠物与坐骑' } as Record<string, string>)[sysKey] ?? sysKey
}

/** 词条数值曲线：属性 code 列表 → 中文名串 */
function attrNames(codes: string[]): string {
  return codes.map((c) => attrNameByCode(c)).join('、')
}

const atkSlotLabels = computed(() =>
  Object.entries(cfg.slot_side)
    .filter(([, side]) => side === 'ATK')
    .map(([slot]) => slotGroupLabel(slot))
    .join('、')
)
const defSlotLabels = computed(() =>
  Object.entries(cfg.slot_side)
    .filter(([, side]) => side === 'DEF')
    .map(([slot]) => slotGroupLabel(slot))
    .join('、')
)
const allAttrsFlat = computed(() => ALL_ATTRS)

const exportJson = computed(() => JSON.stringify(toPlain(cfg), null, 2))

const allAttrsOptions = computed<TSelectOption[]>(() =>
  ALL_ATTRS.map((a) => ({ value: a.code, label: a.name, hint: a.code }))
)

const forbiddenSlotOptions = computed<TSelectOption[]>(() =>
  Object.entries(cfg.sub_type_groups).map(([gid, g]) => ({ value: gid, label: g.label }))
)

// ── 词条池：过滤已选属性组，防止同一行同一侧重复 ──
function poolOptions(side: 'ATK' | 'DEF', row: AffixRuleConfig['affix_rows'][number], poolSide: 'ATK' | 'DEF'): TSelectOption[] {
  const used = new Set(row.pool[poolSide])
  return Object.entries(cfg.attribute_groups)
    .filter(([code, g]) => g.side === side)
    .map(([code, g]) => ({ value: code, label: `${code} — ${g.label}`, disabled: used.has(code) && row.pool[poolSide][row.pool[poolSide].indexOf(code)] !== code }))
    .filter((opt) => !used.has(opt.value as string) || row.pool[poolSide].includes(opt.value as string))
}

function nextGroupCode(side: 'ATK' | 'DEF', row: AffixRuleConfig['affix_rows'][number], poolSide: 'ATK' | 'DEF'): string {
  const used = new Set(row.pool[poolSide])
  const available = Object.entries(cfg.attribute_groups)
    .filter(([code, g]) => g.side === side && !used.has(code))
    .map(([code]) => code)
  return available[0] ?? `${side}-L1`
}

// ── 属性组：可用属性选项 ──
function availableAttrsOptions(groupCode: string): TSelectOption[] {
  const used = new Set(cfg.attribute_groups[groupCode]?.attributes ?? [])
  return ALL_ATTRS.filter((a) => !used.has(a.code)).map((a) => ({ value: a.code, label: a.name, hint: a.code }))
}

// ── 方法 ──
function slotGroupLabel(slot: string): string {
  return cfg.sub_type_groups[slot]?.label ?? slot
}

function resetInto<T extends object>(target: T, source: T): void {
  Object.keys(target).forEach((k) => delete (target as Record<string, unknown>)[k])
  Object.assign(target, structuredClone(source))
}

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function attrNameByCode(code: string): string {
  return ALL_ATTRS.find((a) => a.code === code)?.name ?? code
}

function addGroup(): void {
  const code = newGroupCode.value.trim()
  if (!code || cfg.attribute_groups[code]) { notification.notify('错误', '组码为空或已存在', 'error'); return }
  cfg.attribute_groups[code] = { label: code, side: 'ATK', tier: 'L1', attributes: [], names: [] }
  newGroupCode.value = ''
  notification.notify('已添加', `属性组 ${code}`, 'success')
}

function openEditGroup(code: string): void {
  editingCode.value = code
  editGroupOpen.value = true
}

function removeGroup(code: string): void {
  delete cfg.attribute_groups[code]
}

function addAttr(groupCode: string): void {
  const code = addAttrSelection.value[groupCode]
  const name = addAttrNameSelection.value[groupCode]?.trim() || attrNameByCode(code)
  if (!code) return
  const group = cfg.attribute_groups[groupCode]
  if (group.attributes.includes(code)) { notification.notify('提示', '该属性已存在', 'error'); return }
  group.attributes.push(code)
  group.names.push(name)
  addAttrSelection.value[groupCode] = ''
  addAttrNameSelection.value[groupCode] = ''
}

function removeAttr(groupCode: string, idx: number): void {
  const group = cfg.attribute_groups[groupCode]
  group.attributes.splice(idx, 1)
  group.names.splice(idx, 1)
}

function addForbiddenRule(): void {
  cfg.forbidden.push({ slot: 'weapon', slotLabel: '武器', attributes: [], attributeLabels: [] })
}

function addForbiddenAttr(idx: number): void {
  cfg.forbidden[idx].attributes.push('')
  cfg.forbidden[idx].attributeLabels.push('')
}

async function load(): Promise<void> {
  try {
    const data = await api.getAffixRule()
    // 合并 defaultConfig 兜底：旧数据缺新字段（fixed_attributes/tier_weight/core_affix_ratio）时补齐
    resetInto(cfg, { ...defaultConfig(), ...(data ?? {}) })
  } catch { resetInto(cfg, defaultConfig()) }
}

async function save(): Promise<void> {
  errors.value = []
  const result = await write.save('params', { id: 'affix_rule', name: '装备词条投放规则', data: toPlain(cfg) })
  if (result.ok) notification.notify('已保存', `词条投放规则已保存 · v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

function reset(): void { resetInto(cfg, defaultConfig()) }

function downloadJson(): void {
  const blob = new Blob([exportJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'affix-rule.json'; a.click()
  URL.revokeObjectURL(url)
  notification.notify('已下载', 'affix-rule.json', 'success')
}

async function copyJson(): Promise<void> {
  await navigator.clipboard.writeText(exportJson.value)
  notification.notify('已复制', 'JSON 已复制到剪贴板', 'success')
}

void load()
</script>

<style scoped lang="scss">
.fs-group-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.fs-edit-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.fs-edit-attrs {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border, #e8e8e8);
}
.fs-edit-footer {
  display: flex;
  justify-content: flex-end;
}
.fs-group-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.fs-attr-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--color-bg-secondary, #f0f0f0);
  font-size: var(--font-size-md);
}
.fs-attr-name {
  font-weight: 500;
}
.fs-attr-code {
  color: var(--color-text-secondary, #999);
  font-size: var(--font-size-md);
}
.fs-chip-remove {
  background: none;
  border: none;
  color: #ff4d4f;
  cursor: pointer;
  padding: 0 2px;
  font-size: var(--font-size-md);
}
.fs-group-add-attr {
  display: flex;
  gap: 6px;
  align-items: center;
}
.fs-pool-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;

  :deep(.t-select) {
    min-width: 220px;
    flex: 1 1 220px;
  }
}
.fs-tag-add {
  background: none;
  border: 1px dashed var(--color-border, #d9d9d9);
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
  font-size: var(--font-size-md);
  color: var(--color-primary, #1890ff);
}
.fs-inline-input {
  border: none;
  background: transparent;
  font-size: inherit;
  padding: 0;
  width: 60px;
}
.fs-btn-danger-sm {
  background: none;
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
  font-size: var(--font-size-md);
}
.fs-forbidden-attrs, .fs-forbidden-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.fs-forbidden-label-tag {
  display: inline-flex;
  padding: 1px 4px;
  border: 1px solid var(--color-border, #d9d9d9);
  border-radius: 3px;
  background: #fff;
}
.fs-table-scroll {
  overflow-x: auto;
}
.fs-affix-matrix .fs-affix-tag-sm {
  display: inline-block;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--color-bg-secondary, #f0f0f0);
  font-size: var(--font-size-md);
  white-space: nowrap;
}
.side-atk { background: rgba(255, 77, 79, 0.04); }
.side-def { background: rgba(24, 144, 255, 0.04); }
.fs-mono { font-family: var(--font-family-mono); }
.fs-export-preview {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: 4px;
  margin-top: 8px;
}
.fs-code-block {
  margin: 0;
  padding: 12px;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.fs-slot-side-readonly {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.fs-slot-side-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-md);
}
.fs-slot-side-label {
  font-weight: 500;
  min-width: 5em;
}
.fs-exp-num {
  width: 90px;
  font-family: var(--font-family-mono);
}
.fs-curve-system {
  padding-top: var(--space-1);
}

/* ── 表格美化：外框 / 固定列宽 / 下拉撑满 / 对齐 / 斑马纹 ── */
.fs-rule-wrap {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.fs-rule-wrap.is-scroll {
  overflow-x: auto;
}

.fs-rule {
  table-layout: fixed;
}

/* 稀疏表两列并排：宽屏用内容填满而非拉伸单表 */
.fs-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
  margin-bottom: var(--space-4);
}

.fs-rule-grid > .fs-exp-block {
  margin-bottom: 0;
}

@media (max-width: 1180px) {
  .fs-rule-grid {
    grid-template-columns: 1fr;
  }
}

/* 单列满屏但列少的表：限宽，避免列被撑成巨槽 */
.fs-rule-wrap.is-capped {
  max-width: 780px;
}

/* 单元格内单选下拉撑满列宽（仅直接置于 td 的单选，池编辑器的多选不受影响） */
.fs-rule td > :deep(.t-select) {
  width: 100%;
}

/* 含控件的行：垂直居中 + 呼吸感 */
.fs-rule tbody td {
  vertical-align: middle;
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}

/* 斑马纹（hover 仍高亮） */
.fs-rule-wrap .fs-table tbody tr:nth-child(even) td {
  background: rgba(var(--rgb-white), 0.02);
}

.fs-rule-wrap .fs-table tbody tr:hover td {
  background: var(--color-bg-hover);
}

/* 列对齐 */
.fs-rule thead th.fs-th-center { text-align: center; }
.fs-rule thead th.fs-th-right { text-align: right; }
.fs-rule tbody td.fs-td-center { text-align: center; }
.fs-rule tbody td.fs-td-right { text-align: right; }

/* 首列强调 */
.fs-td-strong {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

/* 数字输入右对齐 */
.fs-num-right {
  text-align: right;
}

/* 区块标题左侧 accent 竖条，强化分区 */
.fs-exp-block > .fs-block-title {
  position: relative;
  padding-left: var(--space-3);
}

.fs-exp-block > .fs-block-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.1em;
  bottom: 0.1em;
  width: 3px;
  border-radius: 2px;
  background: var(--color-energy);
}
</style>
