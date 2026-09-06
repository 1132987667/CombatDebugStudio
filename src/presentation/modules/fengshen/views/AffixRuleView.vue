<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      词条投放规则
    </div>

    <!-- 存档与 configs 定稿不一致：种子一次性写入，改 JSON 不会自动下发到已有存档 -->
    <div v-if="driftFromConfigs" class="fs-ov-drift" role="status">
      <span class="fs-ov-drift-text">当前存档的投放规则与 <code>configs/equipment/affix-rule.json</code> 定稿不一致（子类型、核心系数等可能仍是旧值）。</span>
      <Button size="small" @click="reset">载入定稿</Button>
    </div>

    <!-- Tab 切换 -->
    <div class="fs-exp-tabs" role="tablist" aria-label="词条投放规则">
      <button v-for="t in TABS" :key="t.id" type="button" class="fs-exp-tab" :class="{ active: activeTab === t.id }"
        :role="'tab'" :aria-selected="activeTab === t.id" @click="activeTab = t.id">{{ t.label }}</button>
    </div>

    <!-- ═══ Tab0: 装备总览 ═══ -->
    <section v-if="activeTab === 'overview'" class="fs-exp-panel" role="tabpanel">
      <!-- 推算参数：工具输入条，不属于任何一张卡片 -->
      <div class="fs-ov-params">
        <div class="fs-ov-params-head">
          <span class="fs-block-title">推算参数</span>
          <span class="fs-form-hint">按当前投放规则反推一件装备可产出的全部属性区间。数值为规则推算，非引擎结算，也不读取已配置装备的具体属性。悬停数值可展开分步推导。</span>
        </div>
        <div class="fs-ov-filters">
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">装备等级</span>
            <NumericStepper compact :step="1" :min="1" :max="ovMaxLevel" :model-value="ovLevel"
              @update:model-value="(v: number) => { ovLevel = v }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">装备类型</span>
            <TacticalSelect :model-value="ovSlot" size="md" :options="ovSlotOptions"
              @update:model-value="(v: string | number | null) => { if (v) onOvSlotChange(v as string) }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">装备子类型</span>
            <TacticalSelect :model-value="ovSubType" size="md" :options="ovSubTypeOptions"
              @update:model-value="(v: string | number | null) => { if (v) { ovSubType = v as string; ovPool = 'row-1' } }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">装备品阶</span>
            <TacticalSelect :model-value="ovTier" size="md" :options="ovTierOptions"
              @update:model-value="(v: string | number | null) => { if (v) ovTier = v as string }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">装备品质</span>
            <TacticalSelect :model-value="ovQuality" size="md" :options="ovQualityOptions"
              @update:model-value="(v: string | number | null) => { if (v !== null && v !== '') ovQuality = Number(v) }" />
          </div>
        </div>
      </div>

      <div v-if="overview" class="fs-ov-grid">
        <!-- 左卡：三段属性分区 -->
        <div class="fs-ov-card fs-ov-main">
          <div class="fs-ov-subject">
            <span class="fs-affix-tag-sm" :class="ovSide === 'ATK' ? 'side-atk' : 'side-def'">{{ ovSide }}</span>
            <span class="fs-ov-subject-text">{{ slotGroupLabel(ovSlot) }} · {{ (cfg.sub_type_groups[ovSlot]?.sub_types.find(s => s.id === ovSubType))?.name ?? ovSubType }} · Lv.{{ ovLevel }} · {{ tierLabel(ovTier) }} · 附加 {{ ovQuality }} 条</span>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">核心属性</div>
            <div class="fs-form-hint">由装备子类型决定，取部位固定属性 × 词条系数；装备公式权重 {{ equipFormula?.coreWeight ?? 2 }}。</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>属性</th><th class="fs-td-right">可获得区间</th><th class="fs-td-center">来源</th></tr></thead>
              <tbody>
                <tr v-if="overview.core">
                  <td class="fs-td-strong">{{ attrNameByCode(overview.core.attribute) }}</td>
                  <td class="fs-td-right fs-cell-num"><CalcBreakdown :value="fmtRange(overview.core)" :steps="calcSteps(overview.core, '未配置核心属性系数')" :unit="rangeUnit(overview.core)" /></td>
                  <td class="fs-td-center"><span class="fs-ov-src">装备公式</span></td>
                </tr>
                <tr v-else><td colspan="3" class="fs-cell-dim">未配置核心属性系数</td></tr>
              </tbody>
            </table>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">主要属性（2 条）</div>
            <div class="fs-form-hint">第 1 条按子类型固定，第 2 条从子类型随机池取一条。主要属性不含基础六维，一律走词条曲线。</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>词条</th><th>内容</th><th class="fs-td-right">数值区间</th></tr></thead>
              <tbody>
                <tr>
                  <td>第 1 条 · 固定</td>
                  <td v-if="overview.mainFixed" class="fs-td-strong">{{ attrNameByCode(overview.mainFixed.attribute) }}</td>
                  <td v-else class="fs-cell-dim">未配置</td>
                  <td class="fs-td-right fs-cell-num"><CalcBreakdown :value="fmtRange(overview.mainFixed)" :steps="calcSteps(overview.mainFixed, '子类型主要属性第 1 条未配置')" :unit="rangeUnit(overview.mainFixed)" /></td>
                </tr>
                <tr class="fs-ov-clickable" :class="{ 'is-active': ovPool === 'main' }" tabindex="0" role="button"
                  aria-label="展开主要属性随机池"
                  @click="ovPool = 'main'" @keydown.enter.prevent="ovPool = 'main'" @keydown.space.prevent="ovPool = 'main'">
                  <td>第 2 条 · 随机</td>
                  <td>
                    <span v-if="overview.mainRandom.length">池内 {{ overview.mainRandom.length }} 项，点击查看全部</span>
                    <span v-else class="fs-cell-dim">随机池未配置</span>
                  </td>
                  <td class="fs-td-right fs-cell-num">{{ overview.mainRandom.length ? '见右侧' : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">附加属性（{{ ovQuality }} 条）</div>
            <div class="fs-form-hint">每行随装备产出 1 条，从该行属性池中抽取。点击行可在右侧查看该池全部候选属性及各自可获得区间。</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>行</th><th>名称</th><th>属性池</th><th class="fs-td-center">本品质</th></tr></thead>
              <tbody>
                <tr v-for="row in overview.affixRows" :key="row.row" class="fs-ov-clickable"
                  :class="{ 'is-active': ovPool === `row-${row.row}`, 'is-muted': !row.included }" tabindex="0" role="button"
                  :aria-label="`展开第 ${row.row} 行 ${row.name} 词条池`" :aria-pressed="ovPool === `row-${row.row}`"
                  @click="ovPool = `row-${row.row}`" @keydown.enter.prevent="ovPool = `row-${row.row}`" @keydown.space.prevent="ovPool = `row-${row.row}`">
                  <td class="fs-cell-num">{{ row.row }}</td>
                  <td class="fs-td-strong">{{ row.name }}</td>
                  <td>{{ ovPoolGroupsText(row.groups) }}</td>
                  <td class="fs-td-center">
                    <span v-if="row.included" class="fs-ov-on">投放</span>
                    <span v-else class="fs-cell-dim">不投放</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 右卡：词条池明细 -->
        <aside class="fs-ov-card fs-ov-detail">
          <template v-if="ovPoolDetail">
            <div class="fs-block-title">{{ ovPoolDetail.title }}</div>
            <div class="fs-form-hint">{{ ovPoolDetail.hint }}</div>
            <div class="fs-ov-groups">
              <span v-for="g in ovPoolDetail.groups" :key="g" class="fs-ov-group-chip">{{ g }}</span>
              <span v-if="!ovPoolDetail.groups.length" class="fs-cell-dim">池为空</span>
            </div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>属性</th><th class="fs-td-right">可获得区间</th><th class="fs-td-center">来源</th></tr></thead>
              <tbody>
                <tr v-for="c in ovPoolDetail.candidates" :key="c.attribute" :class="{ 'is-none': c.source === 'none' }">
                  <td>{{ attrNameByCode(c.attribute) }}</td>
                  <td class="fs-td-right fs-cell-num"><CalcBreakdown :value="fmtRange(c)" :steps="c.calc" :unit="rangeUnit(c)" /></td>
                  <td class="fs-td-center"><span class="fs-ov-src">{{ c.source === 'formula' ? '装备公式' : c.source === 'curve' ? '曲线' : '缺曲线' }}</span></td>
                </tr>
                <tr v-if="!ovPoolDetail.candidates.length"><td colspan="3" class="fs-cell-dim">该池下无可投放属性</td></tr>
              </tbody>
            </table>
          </template>
          <!-- 空态：说明 + 建议动作 -->
          <div v-else class="fs-ov-empty">
            <div class="fs-block-title">词条池明细</div>
            <p>左侧选择一个词条池后，这里会列出池内全部候选属性及各自的可获得区间。</p>
            <p class="fs-cell-dim">点击「附加属性」表中的任意一行即可展开。</p>
          </div>
        </aside>
      </div>

      <div v-if="overview?.warnings.length" class="fs-ov-warnings">
        <div class="fs-block-title">配置缺口</div>
        <div class="fs-form-errors">
          <div v-for="w in overview.warnings" :key="w" class="fs-form-error">{{ w }}</div>
        </div>
      </div>
    </section>

    <!-- ═══ Tab0b: 宠物与坐骑总览（8.16 口径：个体驱动 + 品质门槛） ═══ -->
    <section v-else-if="activeTab === 'pet_mount_overview'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-ov-params">
        <div class="fs-ov-params-head">
          <span class="fs-block-title">推算参数</span>
          <span class="fs-form-hint">按当前投放规则反推一只宠物/一匹坐骑可产出的全部属性区间。数值为规则推算，非引擎结算；个体权重与特性读取自 configs 个体表。悬停数值可查看推导过程。</span>
        </div>
        <div class="fs-ov-filters">
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">系统</span>
            <TacticalSelect :model-value="pmSystem" size="md" :options="pmSystemOptions"
              @update:model-value="(v: string | number | null) => { if (v) onPmSystemChange(v as 'pet' | 'mount') }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">个体</span>
            <TacticalSelect :model-value="pmIndividual?.id ?? ''" size="md" :options="pmIndividualOptions"
              @update:model-value="(v: string | number | null) => { pmIndividualId = String(v ?? '') }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">等级</span>
            <NumericStepper compact :step="1" :min="1" :max="pmMaxLevel" :model-value="pmLevel"
              @update:model-value="(v: number) => { pmLevel = v }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">品阶</span>
            <TacticalSelect :model-value="pmTier" size="md" :options="ovTierOptions"
              @update:model-value="(v: string | number | null) => { if (v) pmTier = v as string }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">品质</span>
            <TacticalSelect :model-value="pmQuality" size="md" :options="pmQualityOptions"
              @update:model-value="(v: string | number | null) => { if (v) pmQuality = v as number }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">资质</span>
            <NumericStepper compact :step="10" :min="pmAptitudeMin" :max="pmAptitudeMax" :model-value="pmAptitude"
              @update:model-value="(v: number) => { pmAptitude = v }" />
          </div>
          <div class="fs-ov-field">
            <span class="fs-ov-field-label">突破</span>
            <NumericStepper compact :step="1" :min="0" :max="pmBreakthroughMax" :model-value="pmBreakthrough"
              @update:model-value="(v: number) => { pmBreakthrough = v }" />
          </div>
        </div>

        <!-- 个体一览：当前系统全部个体（就是「宠物与坐骑列表」），点击行选中 -->
        <table class="fs-table fs-ov-table">
          <thead><tr><th>个体</th><th>分类</th><th>主要属性权重</th><th>特性</th></tr></thead>
          <tbody>
            <tr v-for="i in pmIndividuals" :key="i.id" class="fs-ov-clickable"
              :class="{ 'is-active': pmIndividual?.id === i.id }" tabindex="0" role="button"
              :aria-label="`选择个体 ${i.name}`" :aria-pressed="pmIndividual?.id === i.id"
              @click="pmIndividualId = i.id" @keydown.enter.prevent="pmIndividualId = i.id" @keydown.space.prevent="pmIndividualId = i.id">
              <td class="fs-td-strong">{{ i.name }}</td>
              <td>{{ pmCategoryLabel(i.category) }}</td>
              <td>{{ pmWeightText(i) }}</td>
              <td class="fs-cell-dim">{{ i.trait }}</td>
            </tr>
            <tr v-if="!pmIndividuals.length"><td colspan="4" class="fs-cell-dim">configs 个体表为空</td></tr>
          </tbody>
        </table>
      </div>

      <div v-if="pmOverview" class="fs-ov-grid">
        <!-- 左卡：主语行 + 三区 -->
        <div class="fs-ov-card fs-ov-main">
          <div class="fs-ov-subject">
            <span class="fs-affix-tag-sm" :class="pmSystem === 'pet' ? 'side-atk' : 'side-def'">{{ pmSystem === 'pet' ? '宠物' : '坐骑' }}</span>
            <span class="fs-ov-subject-text">{{ pmOverview.individual.name }} · Lv.{{ pmOverview.level }} · {{ tierLabel(pmTier) }} · 品质 {{ pmOverview.quality }}（{{ pmQualityLabel }}）· 资质 {{ pmOverview.aptitude }} · 词条 {{ pmOverview.activeSlotCount }} 条</span>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">主要属性（3 条基础属性，公式区间）</div>
            <div class="fs-form-hint">权重取自个体配置，资质与突破合成养成倍率。点击行可在右侧查看逐步推导。</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>属性</th><th class="fs-td-right">个体权重</th><th class="fs-td-right">可获得区间</th></tr></thead>
              <tbody>
                <tr v-for="(s, idx) in pmOverview.mainSlots" :key="s.attribute" class="fs-ov-clickable"
                  :class="{ 'is-active': pmPool === `main-${idx}` }" tabindex="0" role="button"
                  :aria-label="`展开主要属性 ${s.label} 推导`" :aria-pressed="pmPool === `main-${idx}`"
                  @click="pmPool = `main-${idx}`" @keydown.enter.prevent="pmPool = `main-${idx}`" @keydown.space.prevent="pmPool = `main-${idx}`">
                  <td class="fs-td-strong">{{ s.label }}</td>
                  <td class="fs-td-right fs-cell-num">{{ s.weight }}</td>
                  <td class="fs-td-right fs-cell-num"><CalcBreakdown :value="fmtRange(s.range)" :steps="s.range.calc" :unit="rangeUnit(s.range)" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">特性（品质 {{ pmTraitRow?.minQuality ?? 3 }} 起投放）</div>
            <template v-if="pmTraitRow?.included">
              <div class="fs-form-hint">{{ pmOverview.individual.trait }}</div>
              <div class="fs-ov-pool-gap">机制条，不参与数值反推</div>
            </template>
            <div v-else class="fs-ov-pool-gap">当前品质 {{ pmOverview.quality }} 不投放（品质 {{ pmTraitRow?.minQuality ?? 3 }} 起）</div>
          </div>

          <div class="fs-ov-section">
            <div class="fs-block-title">附加行（品质门槛投放）</div>
            <div class="fs-form-hint">每行随个体产出 1 条，从该行属性池中抽取。点击行可在右侧查看该池全部候选属性及各自可获得区间。</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>行</th><th class="fs-td-center">品质门槛</th><th class="fs-td-center">本品质</th><th class="fs-td-right">属性数</th></tr></thead>
              <tbody>
                <tr v-for="row in pmExtraRows" :key="row.id" class="fs-ov-clickable"
                  :class="{ 'is-active': pmPool === `row-${row.id}`, 'is-muted': !row.included }" tabindex="0" role="button"
                  :aria-label="`展开 ${row.name} 词条池`" :aria-pressed="pmPool === `row-${row.id}`"
                  @click="pmPool = `row-${row.id}`" @keydown.enter.prevent="pmPool = `row-${row.id}`" @keydown.space.prevent="pmPool = `row-${row.id}`">
                  <td class="fs-td-strong">{{ row.name }}</td>
                  <td class="fs-td-center fs-cell-num">品质 {{ row.minQuality }} 起</td>
                  <td class="fs-td-center">
                    <span v-if="row.included" class="fs-ov-on">投放</span>
                    <span v-else class="fs-cell-dim">不投放</span>
                  </td>
                  <td class="fs-td-right fs-cell-num">{{ row.included ? row.candidates.length : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 右卡：词条池明细 -->
        <aside class="fs-ov-card fs-ov-detail">
          <template v-if="pmPoolDetail">
            <div class="fs-block-title">{{ pmPoolDetail.title }}</div>
            <div class="fs-form-hint">{{ pmPoolDetail.hint }}</div>
            <table class="fs-table fs-ov-table">
              <thead><tr><th>属性</th><th class="fs-td-right">可获得区间</th><th class="fs-td-center">来源</th></tr></thead>
              <tbody>
                <tr v-for="c in pmPoolDetail.candidates" :key="c.attribute" :class="{ 'is-none': c.source === 'none' }">
                  <td>{{ attrNameByCode(c.attribute) }}</td>
                  <td class="fs-td-right fs-cell-num"><CalcBreakdown :value="fmtRange(c)" :steps="c.calc" :unit="rangeUnit(c)" /></td>
                  <td class="fs-td-center"><span class="fs-ov-src">{{ c.source === 'formula' ? '公式' : c.source === 'curve' ? '曲线' : '缺曲线' }}</span></td>
                </tr>
                <tr v-if="!pmPoolDetail.candidates.length"><td colspan="3" class="fs-cell-dim">该行下无可投放属性</td></tr>
              </tbody>
            </table>
          </template>
          <div v-else class="fs-ov-empty">
            <div class="fs-block-title">词条池明细</div>
            <p>左侧选择一个词条行后，这里会列出池内全部候选属性及各自的可获得区间。</p>
            <p class="fs-cell-dim">点击「主要属性」或「附加行」表中的任意一行即可展开。</p>
          </div>
        </aside>
      </div>

      <div v-if="pmOverview?.warnings.length" class="fs-ov-warnings">
        <div class="fs-block-title">配置缺口</div>
        <div class="fs-form-errors">
          <div v-for="w in pmOverview.warnings" :key="w" class="fs-form-error">{{ w }}</div>
        </div>
      </div>
    </section>

    <!-- ═══ Tab1: 装备设计 ═══ -->
    <section v-else-if="activeTab === 'matrix'" class="fs-exp-panel" role="tabpanel">
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
              <col style="width:16%" /><col style="width:36%" /><col style="width:48%" />
            </colgroup>
            <thead><tr><th>部位</th><th>固定属性</th><th>子类型</th></tr></thead>
            <tbody>
              <tr v-for="slot in fixedSlotOrder" :key="slot">
                <td class="fs-td-strong">{{ slotGroupLabel(slot) }}</td>
                <td>
                  <TacticalSelect :model-value="cfg.fixed_attributes[slot]" size="md" searchable
                    :options="coreAttrOptions(slot)"
                    @update:model-value="(v: string | number | null) => { if (v) cfg.fixed_attributes[slot] = v as string }" />
                </td>
                <td>
                  <span v-if="cfg.sub_type_groups[slot]?.sub_types?.length">{{ cfg.sub_type_groups[slot].sub_types.map((s) => s.name).join('、') }}</span>
                  <span v-else class="fs-cell-dim">无子类型</span>
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
        <div class="fs-form-hint">核心属性词条的数值系数：基础值 × 系数（剑=攻击×90%、棍=×100%、头盔=气血×115%）。</div>
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
        <div class="fs-form-hint">装备基础属性投放的品阶权重区间（凡品 0.5~0.6 … 仙品 0.9~1.0）。每件装备在区间内随机取一次，故「装备总览」按区间上下界给出可获得范围；「玩家配置 → 装备公式」验算取区间上限作单值示例。</div>
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
      <Button variant="ghost" size="small" @click="reset">载入 configs 定稿</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { AffixRuleConfig, EquipFormulaConfig, PetMountIndividual } from '@/domain/fengshen/types'
import { affixRuleDefaults, mountIndividuals, petIndividuals } from '@/domain/fengshen/affix-rule-defaults'
import {
  buildEquipmentOverview,
  buildPetMountOverview,
  QUALITY_LABELS,
  type CalcStep,
  type EquipmentOverview,
  type OverviewAttrRange,
} from '@/domain/fengshen/equipment-overview'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'
import NumericStepper from '@/presentation/components/NumericStepper.vue'
import Dialog from '@/presentation/components/Dialog.vue'
import CalcBreakdown from '@/presentation/modules/fengshen/components/CalcBreakdown.vue'
import type { TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const notification = useNotificationStore()

const TABS = [
  { id: 'overview', label: '装备总览' },
  { id: 'pet_mount_overview', label: '宠物与坐骑总览' },
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

// ── 状态 ──
const cfg = reactive<AffixRuleConfig>(affixRuleDefaults())
const errors = ref<string[]>([])
/** 存档规则与 configs/equipment/affix-rule.json 定稿不一致（种子一次性写入，改配置不会自动下发） */
const driftFromConfigs = ref(false)
const activeTab = ref<(typeof TABS)[number]['id']>('overview')
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

// ── 装备总览：按规则反推一件装备的属性区间 ──
const ovLevel = ref(50)
const ovSlot = ref('weapon')
const ovSubType = ref('sword')
const ovTier = ref('xian')
const ovQuality = ref(5)
/** 当前展开的词条池：'main' = 主要属性随机池，`row-N` = 附加第 N 行 */
const ovPool = ref<string>('row-1')

const equipFormula = ref<EquipFormulaConfig | null>(null)
const playerConversion = ref<Record<string, number>>({})

const ovSubTypeOptions = computed<TSelectOption[]>(() =>
  (cfg.sub_type_groups[ovSlot.value]?.sub_types ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.id }))
)

const ovSlotOptions = computed<TSelectOption[]>(() =>
  fixedSlotOrder.map((slot) => ({ value: slot, label: cfg.sub_type_groups[slot]?.label ?? slot, hint: cfg.slot_side[slot] ?? '' }))
)

const ovTierOptions = computed<TSelectOption[]>(() =>
  Object.keys(cfg.tier_weight).map((t) => ({ value: t, label: tierLabel(t), hint: `${cfg.tier_weight[t].min}~${cfg.tier_weight[t].max}` }))
)

const ovQualityOptions = computed<TSelectOption[]>(() =>
  QUALITY_LABELS.map((label, i) => ({ value: i + 1, label: `${label}（${i + 1} 条）` }))
)

const ovMaxLevel = computed(() => equipFormula.value?.maxLevel ?? 50)

const ovSide = computed<'ATK' | 'DEF'>(() => cfg.slot_side[ovSlot.value] ?? 'ATK')

const overview = computed<EquipmentOverview | null>(() => {
  const formula = equipFormula.value
  if (!formula) return null
  return buildEquipmentOverview(cfg, formula, playerConversion.value, {
    level: ovLevel.value,
    slot: ovSlot.value,
    subType: ovSubType.value,
    tier: ovTier.value,
    quality: ovQuality.value,
  })
})

/** 切换部位后子类型必须落在该部位的真实子类型上，否则会算出不存在的组合 */
function onOvSlotChange(slot: string): void {
  ovSlot.value = slot
  const first = cfg.sub_type_groups[slot]?.sub_types?.[0]
  ovSubType.value = first ? first.id : slot
}

/** 右侧详情面板：选中的词条池标题 + 候选属性 */
const ovPoolDetail = computed<{ title: string; groups: string[]; candidates: OverviewAttrRange[]; hint: string } | null>(() => {
  const o = overview.value
  if (!o) return null
  if (ovPool.value === 'main') {
    const pool = cfg.main_affix_pool?.[ovSubType.value]
    return {
      title: '主要属性 · 第 2 条随机池',
      groups: pool?.random_pool ?? [],
      candidates: o.mainRandom,
      hint: '随机池中取一条，下列为各条目的可获得区间',
    }
  }
  const row = o.affixRows.find((r) => `row-${r.row}` === ovPool.value)
  if (!row) return null
  return {
    title: `附加属性 · 第 ${row.row} 行 ${row.name}`,
    groups: row.groups,
    candidates: row.candidates,
    hint: row.included ? '本行随装备产出 1 条，从下列属性中等概率抽取' : `当前品质不投放本行（需 ${row.row} 条以上）`,
  }
})

function isPercentAttr(code: string): boolean {
  return ALL_ATTRS.find((a) => a.code === code)?.isPercentage ?? false
}

/** 区间文案：百分比属性带 % 后缀；无曲线属性显示占位而非 0~0 */
function fmtRange(r: OverviewAttrRange | null): string {
  if (!r) return '—'
  if (r.source === 'none') return '无曲线'
  const suffix = isPercentAttr(r.attribute) ? '%' : ''
  return `${r.min} ~ ${r.max}${suffix}`
}

/** 算不出区间时也要给一条说得清缺什么的推导，不留空白气泡 */
function calcSteps(r: OverviewAttrRange | null, missing: string): CalcStep[] {
  return r?.calc ?? [{ label: '缺口', expr: missing }]
}

/** 结论行单位：沿用 isPercentAttr 单一判据，与单元格文案同源 */
function rangeUnit(r: OverviewAttrRange | null): string {
  return r && isPercentAttr(r.attribute) ? '%' : ''
}

function ovPoolGroupsText(groups: string[]): string {
  return groups.map((g) => cfg.attribute_groups[g]?.label ?? attrNameByCode(g)).join('、')
}

// ── 宠物与坐骑总览：个体驱动反推（8.16 口径，个体权重 + 品质门槛） ──
const pmSystem = ref<'pet' | 'mount'>('pet')
const pmIndividualId = ref('')
const pmLevel = ref(50)
const pmTier = ref('xian')
const pmQuality = ref(5)
const pmAptitude = ref(400)
const pmBreakthrough = ref(0)
/** 当前展开的词条行：`main-N` = 主要第 N 条，`row-${id}` = 附加/特性行 */
const pmPool = ref('main-0')

const pmSystemOptions: TSelectOption[] = [
  { value: 'pet', label: '宠物' },
  { value: 'mount', label: '坐骑' },
]

/** 个体权重短名（表头展示用；configs 键是短名 hit/dodge） */
const PM_WEIGHT_LABELS: Record<string, string> = { attack: '攻', hit: '命', speed: '速', defense: '防', dodge: '闪', maxHealth: '血' }

/** 个体分类中文（configs 存英文码 combo/crit/shield_reflect/dodge/universal） */
const PM_CATEGORY_LABELS: Record<string, string> = { combo: '连击', crit: '暴击', shield_reflect: '盾反', dodge: '闪避', universal: '通用' }

function pmCategoryLabel(category: string): string {
  return PM_CATEGORY_LABELS[category] ?? category
}

const pmIndividuals = computed<PetMountIndividual[]>(() => (pmSystem.value === 'pet' ? petIndividuals() : mountIndividuals()))

const pmIndividualOptions = computed<TSelectOption[]>(() =>
  pmIndividuals.value.map((i) => ({ value: i.id, label: i.name, hint: pmCategoryLabel(i.category) }))
)

/** 个体 id 失效（切换系统/配置变更）时回落到第一个，避免整个面板空白 */
const pmIndividual = computed<PetMountIndividual | null>(() =>
  pmIndividuals.value.find((i) => i.id === pmIndividualId.value) ?? pmIndividuals.value[0] ?? null
)

function onPmSystemChange(system: 'pet' | 'mount'): void {
  pmSystem.value = system
  pmIndividualId.value = ''
  pmPool.value = 'main-0'
}

function pmWeightText(i: PetMountIndividual): string {
  return Object.entries(i.weights).map(([k, w]) => `${PM_WEIGHT_LABELS[k] ?? k}${w}`).join(' / ')
}

const pmQualityOptions = computed<TSelectOption[]>(() =>
  QUALITY_LABELS.map((label, i) => ({ value: i + 1, label: `${label}（品质 ${i + 1}）` }))
)

const pmQualityLabel = computed(() => QUALITY_LABELS[pmQuality.value - 1] ?? '')

const pmMaxLevel = computed(() => cfg.pet_mount_rules?.max_level ?? 50)
const pmAptitudeMin = computed(() => cfg.pet_mount_rules?.aptitude.min ?? 280)
const pmAptitudeMax = computed(() => cfg.pet_mount_rules?.aptitude.cap ?? 500)
const pmBreakthroughMax = computed(() => cfg.pet_mount_rules?.breakthroughs.length ?? 3)

const pmOverview = computed(() => {
  const individual = pmIndividual.value
  if (!individual) return null
  return buildPetMountOverview(cfg, playerConversion.value, {
    system: pmSystem.value,
    individual,
    level: pmLevel.value,
    tier: pmTier.value,
    quality: pmQuality.value,
    aptitude: pmAptitude.value,
    breakthrough: pmBreakthrough.value,
  })
})

const pmTraitRow = computed(() => pmOverview.value?.rows.find((r) => r.id === 'trait') ?? null)

/** 附加行（不含 main / trait，两者各自单独渲染） */
const pmExtraRows = computed(() => pmOverview.value?.rows.filter((r) => r.id !== 'main' && r.id !== 'trait') ?? [])

/** 右侧详情面板：选中的词条行标题 + 候选属性 */
const pmPoolDetail = computed<{ title: string; candidates: OverviewAttrRange[]; hint: string } | null>(() => {
  const o = pmOverview.value
  if (!o) return null
  if (pmPool.value.startsWith('main-')) {
    const slot = o.mainSlots[Number(pmPool.value.slice(5))]
    if (!slot) return null
    return {
      title: `主要属性 · ${slot.label}`,
      candidates: [slot.range],
      hint: `个体权重 ${slot.weight}；区间 = 公式基准 × 品阶 × 浮动的外包络`,
    }
  }
  const row = o.rows.find((r) => `row-${r.id}` === pmPool.value)
  if (!row) return null
  return {
    title: `${row.name}（品质 ${row.minQuality} 起）`,
    candidates: row.candidates,
    hint: row.included ? '本行随个体产出 1 条，从下列属性中等概率抽取' : `当前品质不投放本行（品质 ${row.minQuality} 起）`,
  }
})

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
    const [data, formula, player] = await Promise.all([
      api.getAffixRule(),
      api.getEquipFormula(),
      api.getPlayerConfig(),
    ])
    // 合并定稿兜底：旧存档缺新字段（fixed_attributes/tier_weight/core_affix_ratio）时补齐
    resetInto(cfg, { ...affixRuleDefaults(), ...(data ?? {}) } as AffixRuleConfig)
    equipFormula.value = formula
    playerConversion.value = player?.conversion ?? {}
    driftFromConfigs.value = !!data && canonicalJson(toPlain(cfg)) !== canonicalJson(affixRuleDefaults())
    syncOverviewSelection()
  } catch { driftFromConfigs.value = false; resetInto(cfg, affixRuleDefaults()) }
}

/**
 * 键序无关的深比较序列化。存档经过 spread 后键序可能与定稿不同，直接 stringify 会误报。
 */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** 存档里的子类型/品阶集合可能与当前默认值不匹配，载入后收口到真实存在的选项 */
function syncOverviewSelection(): void {
  if (!cfg.sub_type_groups[ovSlot.value]) { onOvSlotChange(fixedSlotOrder[0]); return }
  const ids = cfg.sub_type_groups[ovSlot.value].sub_types.map((s) => s.id)
  if (!ids.includes(ovSubType.value)) ovSubType.value = ids[0] ?? ovSlot.value
  if (!cfg.tier_weight[ovTier.value]) ovTier.value = Object.keys(cfg.tier_weight)[0] ?? ovTier.value
  if (!cfg.tier_weight[pmTier.value]) pmTier.value = Object.keys(cfg.tier_weight)[0] ?? pmTier.value
}

async function save(): Promise<void> {
  errors.value = []
  const result = await write.save('params', { id: 'affix_rule', name: '装备词条投放规则', data: toPlain(cfg) })
  if (result.ok) {
    driftFromConfigs.value = canonicalJson(toPlain(cfg)) !== canonicalJson(affixRuleDefaults())
    notification.notify('已保存', `词条投放规则已保存 · v${await api.getDataVersion()}`, 'success')
  } else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

function reset(): void {
  resetInto(cfg, affixRuleDefaults())
  driftFromConfigs.value = false
  syncOverviewSelection()
  notification.notify('已载入定稿', '当前编辑已替换为 configs/equipment/affix-rule.json，确认无误后点「保存到封神榜」', 'info', 6000)
}

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

/* ── 装备总览 ── */

/* 存档与 configs 定稿不一致的提示条 */
.fs-ov-drift {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background: var(--color-warning-bg);
}

.fs-ov-drift-text {
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
}

/* 推算参数：卡片外的工具输入条 */
.fs-ov-params {
  margin-bottom: var(--space-4);
}

.fs-ov-params-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);

  .fs-block-title { margin-bottom: 0; }
}

.fs-ov-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3) var(--space-4);
  margin-top: var(--space-3);
}

.fs-ov-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 120px;
}

.fs-ov-field-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

/* 左卡卡头：本件装备的主语（参数条只留控件） */
.fs-ov-subject {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
}

.fs-ov-subject-text {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  font-variant-numeric: tabular-nums;
}

/* 左右两张卡片，6:4 */
.fs-ov-grid {
  display: grid;
  grid-template-columns: 6fr 4fr;
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 1180px) {
  .fs-ov-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.fs-ov-card {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-sm);
}

.fs-ov-detail {
  position: sticky;
  top: 0;
  align-self: start;
}

/* 卡内分区：用分隔线代替再套一层卡片，避免卡片套卡片 */
.fs-ov-section {
  & + .fs-ov-section {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-default);
  }
}

.fs-ov-empty {
  p {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-md);
    line-height: 1.6;
  }
}

.fs-ov-warnings {
  margin-top: var(--space-4);
}

/* 未配置投放池的显式缺口块：红边警示，绝不与「已配置但为 0」混淆 */
.fs-ov-pool-gap {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--color-warning);
  border-radius: var(--radius-sm);
  color: var(--color-warning);
  font-size: var(--font-size-md);
}

.fs-ov-table {
  margin-top: var(--space-2);

  tbody td.fs-td-center,
  thead th.fs-td-center { text-align: center; }

  tbody td.fs-td-right,
  thead th.fs-td-right { text-align: right; }
}

/* 可点击展开词条池的行：hover / pressed / 选中三态齐备 */
.fs-ov-clickable {
  cursor: pointer;

  td { transition: background var(--transition-fast); }

  &:hover td { background: var(--color-bg-hover); }

  &:active td { background: var(--color-bg-hover-accent); }

  &.is-muted td { color: var(--color-text-secondary); }
}

.fs-ov-clickable.is-active td {
  background: rgba(var(--rgb-energy), var(--alpha-wash));
  box-shadow: inset 3px 0 0 var(--color-energy);
}

.fs-ov-clickable:focus-visible {
  outline: 2px solid var(--color-info);
  outline-offset: -2px;
}

.fs-ov-detail .fs-ov-table tbody tr.is-none td {
  color: var(--color-warning);
}

.fs-ov-src,
.fs-ov-on {
  display: inline-block;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-md);
  white-space: nowrap;
}

.fs-ov-on {
  border-color: var(--color-energy-deep);
  color: var(--color-energy);
}

.fs-ov-groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: var(--space-2) 0;
}

.fs-ov-group-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
}
</style>
