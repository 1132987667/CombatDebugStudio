<template>
  <Dialog :model-value="modelValue" title="战斗记录" width="800px"
    @update:model-value="$emit('update:modelValue', $event)">
    <div class="recording-body">
      <!-- 左侧：战斗列表 -->
      <div class="recording-list">
        <div class="list-header">战斗列表</div>
        <div v-if="recordings.length === 0" class="list-empty">暂无战斗记录</div>
        <div v-for="rec in recordings" :key="rec.battleId"
          class="recording-item"
          :class="{ active: selectedRecording?.battleId === rec.battleId }"
          @click="selectRecording(rec)">
          <div class="recording-name">{{ formatBattleName(rec) }}</div>
          <div class="recording-meta">
            <span>{{ new Date(rec.startTime).toLocaleTimeString() }}</span>
            <span class="recording-count">{{ rec.combatRecords.length }} 次行动</span>
          </div>
        </div>
      </div>

      <!-- 右侧：详情 -->
      <div class="recording-detail">
        <template v-if="!selectedRecording">
          <div class="detail-placeholder">请从左侧选择一个战斗记录</div>
        </template>
        <template v-else-if="selectedRecording.combatRecords.length === 0">
          <div class="detail-placeholder">该战斗暂无详细记录</div>
        </template>
        <template v-else>
          <div class="detail-header">
            共 {{ selectedRecording.combatRecords.length }} 次行动
          </div>
          <div class="detail-actions">
            <div v-for="(record, idx) in selectedRecording.combatRecords" :key="record.id"
              class="action-card"
              :class="{ expanded: expandedRecordId === record.id }"
              @click="toggleExpand(record.id)">
              <div class="action-summary">
                <span class="action-index">#{{ idx + 1 }}</span>
                <span class="action-actor" :class="record.actionType">{{ record.actorName }}</span>
                <span class="action-arrow">→</span>
                <span class="action-target">{{ record.targetName }}</span>
                <span class="action-type-badge" :class="record.actionType">
                  {{ record.actionType === 'attack' ? '攻击' : record.skillName || '技能' }}
                </span>
                <span class="action-damage">{{ record.damage }}</span>
                <span class="action-expand-icon">{{ expandedRecordId === record.id ? '▲' : '▼' }}</span>
              </div>

              <!-- 展开详情 -->
              <div v-if="expandedRecordId === record.id" class="action-detail">
                <!-- 伤害拆分 -->
                <div v-if="record.damageBreakdown" class="breakdown-section">
                  <div class="breakdown-title">伤害计算链路</div>
                  <div class="breakdown-steps">
                    <div v-for="(step, si) in record.damageBreakdown.steps" :key="si" class="step-row">
                      <span class="step-indicator">▸</span>
                      <span class="step-desc">{{ step.description }}</span>
                    </div>
                  </div>

                  <div class="breakdown-stats">
                    <div class="stat-row">
                      <span class="stat-label">暴击</span>
                      <span class="stat-value" :class="record.damageBreakdown.isCritical ? 'crit' : ''">
                        {{ record.damageBreakdown.isCritical ? '是 (x' + record.damageBreakdown.critMultiplier.toFixed(2) + ')' : '否' }}
                      </span>
                    </div>
                    <div class="stat-row">
                      <span class="stat-label">敌方防御</span>
                      <span class="stat-value">{{ record.damageBreakdown.defenseValue }}</span>
                    </div>
                    <div class="stat-row">
                      <span class="stat-label">防御减免</span>
                      <span class="stat-value">x{{ record.damageBreakdown.defenseMultiplier.toFixed(4) }}</span>
                    </div>
                    <div v-if="record.damageBreakdown.normalAtkReduction" class="stat-row">
                      <span class="stat-label">普攻减免</span>
                      <span class="stat-value">{{ record.damageBreakdown.normalAtkReduction }}%</span>
                    </div>
                    <div v-if="record.damageBreakdown.skillDmgReduction" class="stat-row">
                      <span class="stat-label">技能减免</span>
                      <span class="stat-value">{{ record.damageBreakdown.skillDmgReduction }}%</span>
                    </div>
                    <div v-if="record.damageBreakdown.generalDamageReduction" class="stat-row">
                      <span class="stat-label">通用减免</span>
                      <span class="stat-value">{{ record.damageBreakdown.generalDamageReduction }}%</span>
                    </div>
                    <div class="stat-row final">
                      <span class="stat-label">最终伤害</span>
                      <span class="stat-value final-value">{{ record.damageBreakdown.finalDamage }}</span>
                    </div>
                  </div>
                </div>

                <!-- 无拆分时显示基本信息 -->
                <div v-else class="breakdown-section">
                  <div class="breakdown-title">基本信息</div>
                  <div class="stat-row">
                    <span class="stat-label">动作类型</span>
                    <span class="stat-value">{{ record.actionType }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">伤害值</span>
                    <span class="stat-value">{{ record.damage }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_RECORDER_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleRecorder, RecordedBattle } from '@/domain/battle/service/BattleRecorder'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const battleRecorder = container.resolve<BattleRecorder>(BATTLE_RECORDER_TOKEN.toString())

const recordings = ref<RecordedBattle[]>([])
const selectedRecording = ref<RecordedBattle | null>(null)
const expandedRecordId = ref<string | null>(null)

// 每次打开时刷新数据
watch(() => props.modelValue, (val) => {
  if (val) {
    refresh()
  }
})

function refresh() {
  recordings.value = battleRecorder.getAllRecordings()
}

function selectRecording(rec: RecordedBattle) {
  selectedRecording.value = rec
  expandedRecordId.value = null
}

function toggleExpand(id: string) {
  expandedRecordId.value = expandedRecordId.value === id ? null : id
}

function formatBattleName(rec: RecordedBattle): string {
  const date = new Date(rec.startTime)
  return `战斗 ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}
</script>

<style scoped>
.recording-body {
  display: flex;
  gap: var(--space-3);
  height: var(--recording-body-height, 500px);
}

/* ====== 左侧列表 ====== */
.recording-list {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid rgba(79, 195, 247, 0.2);
  padding-right: var(--space-3);
  overflow-y: auto;
}

.list-header {
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid rgba(79, 195, 247, 0.2);
}

.list-empty {
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  padding: var(--space-5) 0;
}

.recording-item {
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  margin-bottom: var(--space-1);
}

.recording-item:hover {
  background: rgba(79, 195, 247, 0.1);
}

.recording-item.active {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.3);
}

.recording-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
  margin-bottom: var(--space-1);
}

.recording-meta {
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.recording-count {
  color: rgba(255, 255, 255, 0.4);
}

/* ====== 右侧详情 ====== */
.recording-detail {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.detail-placeholder {
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  padding: var(--space-8) 0;
}

.detail-header {
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid rgba(79, 195, 247, 0.2);
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* ====== 行动卡片 ====== */
.action-card {
  border: 1px solid rgba(79, 195, 247, 0.15);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}

.action-card:hover {
  border-color: rgba(79, 195, 247, 0.3);
}

.action-card.expanded {
  border-color: rgba(79, 195, 247, 0.4);
}

.action-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2);
  cursor: pointer;
  background: rgba(79, 195, 247, 0.03);
  transition: background var(--transition-fast);
}

.action-summary:hover {
  background: rgba(79, 195, 247, 0.07);
}

.action-index {
  color: rgba(255, 255, 255, 0.35);
  font-family: 'JetBrains Mono', monospace;
  min-width: 30px;
}

.action-actor {
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
}

.action-actor.skill {
  color: var(--color-debuff);
}

.action-arrow {
  color: rgba(255, 255, 255, 0.35);
}

.action-target {
  color: rgba(255, 255, 255, 0.7);
  flex: 1;
}

.action-type-badge {
  padding: 1px var(--space-1);
  border-radius: var(--radius-sm);
  background: rgba(79, 195, 247, 0.15);
  color: var(--color-info);
}

.action-type-badge.skill {
  background: rgba(167, 139, 250, 0.15);
  color: var(--color-debuff);
}

.action-damage {
  font-family: 'JetBrains Mono', monospace;
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  min-width: 40px;
  text-align: right;
}

.action-expand-icon {
  color: rgba(255, 255, 255, 0.3);
}

/* ====== 展开详情 ====== */
.action-detail {
  border-top: 1px solid rgba(79, 195, 247, 0.1);
  padding: var(--space-2) var(--space-3);
  background: rgba(0, 0, 0, 0.15);
}

.breakdown-section {
  margin-bottom: var(--space-2);
}

.breakdown-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-1);
}

.breakdown-steps {
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-2);
}

.step-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px 0;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.step-row:last-child {
  border-bottom: none;
}

.step-indicator {
  color: var(--color-energy);
}

.step-desc {
  flex: 1;
}

.breakdown-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px var(--space-2);
  background: rgba(0, 0, 0, 0.15);
  border-radius: var(--radius-sm);
}

.stat-label {
  color: rgba(255, 255, 255, 0.5);
}

.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-weight: var(--font-weight-semibold);
  color: rgba(255, 255, 255, 0.8);
}

.stat-value.crit {
  color: var(--color-warning);
}

.stat-row.final {
  grid-column: 1 / -1;
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.2);
}

.final-value {
  font-size: var(--font-size-md);
  color: var(--color-warning);
}
</style>
