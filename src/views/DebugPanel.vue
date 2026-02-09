<template>
  <div class="debug-panel panel-right">
    <div class="section">
      <div class="section-header">
        <span>属性监控</span>
        <span class="selected-info">(当前选中: {{ getSelectedCharName() }})</span>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">基础属性</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">HP:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.currentHp || 0 }}/{{ selectedCharMonitor?.maxHp || 0
            }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">能量:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.currentEnergy || 0 }}/{{ selectedCharMonitor?.maxEnergy
              || 150
            }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.attack || 0 }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.defense || 0 }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">速度:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.speed || 0 }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">状态加成</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value bonus">+{{ getStatBonus('attack') }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value bonus">+{{ getStatBonus('defense') }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">伤害加成:</span>
            <span class="monitor-value bonus">+{{ getDamageBonus() }}%</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">受伤减免:</span>
            <span class="monitor-value bonus">+{{ getDamageReduction() }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">最终属性</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value final">{{ getFinalStat('attack') }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value final">{{ getFinalStat('defense') }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">技能信息</div>
        <div class="skills-display">
          <div class="skill-item passive" v-if="getCharPassive(getSelectedCharId)">
            <span class="skill-label">被动:</span>
            <span class="skill-name">{{ getCharPassive(getSelectedCharId) }}</span>
          </div>
          <div class="skill-item small" v-if="getCharSmallSkill(getSelectedCharId)">
            <span class="skill-label">小技能:</span>
            <span class="skill-name">{{ getCharSmallSkill(getSelectedCharId) }}</span>
          </div>
          <div class="skill-item ultimate" v-if="getCharUltimate(getSelectedCharId)">
            <span class="skill-label">大技能:</span>
            <span class="skill-name">{{ getCharUltimate(getSelectedCharId) }}</span>
          </div>
          <div
            v-if="!getCharPassive(getSelectedCharId) && !getCharSmallSkill(getSelectedCharId) && !getCharUltimate(getSelectedCharId)"
            class="no-skills">
            暂未配置技能
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">手动干预</div>
      <div class="intervention-list">
        <button class="intervention-btn" @click="$emit('end-turn')">[1] 立即结束当前回合</button>
        <div class="intervention-row">
          <span>[2]</span>
          <input type="text" v-model="manualSkillName" placeholder="技能名" class="intervention-input">
          <button class="btn-small" @click="$emit('execute-skill', manualSkillName)">[执行]</button>
        </div>
        <div class="intervention-row">
          <span>[3]</span>
          <input type="text" v-model="manualStatusName" placeholder="状态名" class="intervention-input">
          <span>回合:</span>
          <input type="number" v-model="manualStatusTurns" class="intervention-num">
          <button class="btn-small"
            @click="$emit('add-status', { name: manualStatusName, turns: manualStatusTurns })">[执行]</button>
        </div>
        <div class="intervention-row">
          <span>[4]</span>
          <span>HP[</span>
          <input type="number" v-model="manualHpAmount" class="intervention-num">
          <span>] MP[</span>
          <input type="number" v-model="manualMpAmount" class="intervention-num">
          <span>]</span>
          <button class="btn-small"
            @click="$emit('adjust-stats', { hp: manualHpAmount, mp: manualMpAmount })">[执行]</button>
        </div>
        <button class="intervention-btn" @click="$emit('clear-statuses')">[5] 清除所有状态</button>
        <button class="intervention-btn danger" @click="$emit('reset-battle')">[R] 重置战斗</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header">数据快照</div>
      <div class="snapshot-actions">
        <button class="intervention-btn" @click="$emit('export-state')">[E] 导出当前状态(JSON)</button>
        <button class="intervention-btn" @click="$emit('import-state')">[I] 导入状态数据</button>
      </div>
      <div class="last-export">
        <span>最近导出: {{ lastExportTime || '无' }}</span>
        <div class="snapshot-btns">
          <button class="btn-small" @click="$emit('view-export')">[查看]</button>
          <button class="btn-small" @click="$emit('reload-export')">[重载]</button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">异常检测</div>
      <div class="exception-status" :class="exceptionStatus.class">
        <span>{{ exceptionStatus.message }}</span>
        <button v-if="exceptionStatus.hasException" class="btn-small" @click="$emit('locate-exception')">[定位]</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { GameDataProcessor } from "@/utils/GameDataProcessor";
import type { UIBattleCharacter, Enemy, SceneData } from "@/types";

const props = defineProps<{
  battleCharacters: UIBattleCharacter[];
  enemyParty: UIBattleCharacter[];
  selectedCharacterId: string;
  lastExportTime: string | null;
}>();

const emit = defineEmits<{
  "end-turn": [];
  "execute-skill": [skillName: string];
  "add-status": [status: { name: string; turns: number }];
  "adjust-stats": [stats: { hp: number; mp: number }];
  "clear-statuses": [];
  "reset-battle": [];
  "export-state": [];
  "import-state": [];
  "view-export": [];
  "reload-export": [];
  "locate-exception": [];
}>();

const manualSkillName = ref("");
const manualStatusName = ref("");
const manualStatusTurns = ref(2);
const manualHpAmount = ref(100);
const manualMpAmount = ref(50);

// 初始化GameDataProcessor（自动加载配置）

const selectedCharMonitor = computed(() => {
  if (!props.battleCharacters || !props.enemyParty) return null;
  return props.battleCharacters.find((c) => c.id === props.selectedCharacterId) ||
    props.enemyParty.find((e) => e.id === props.selectedCharacterId) ||
    null;
});

const getSelectedCharId = (): string => {
  if (!props.battleCharacters || !props.enemyParty) return "";
  return props.selectedCharacterId || "";
};

const getSelectedCharName = () => {
  if (!props.battleCharacters || !props.enemyParty) return "未选择";
  const char = props.battleCharacters.find((c) => c.id === props.selectedCharacterId);
  const enemy = props.enemyParty.find((e) => e.id === props.selectedCharacterId);
  return char?.name || enemy?.name || "未选择";
};

const getCharPassive = (id: string): string => {
  if (!id) return "";
  const skills = GameDataProcessor.getCharacterSkills(id);
  return skills.passive?.name || "";
};

const getCharSmallSkill = (id: string): string => {
  if (!id) return "";
  const skills = GameDataProcessor.getCharacterSkills(id);
  return skills.small?.name || "";
};

const getCharUltimate = (id: string): string => {
  if (!id) return "";
  const skills = GameDataProcessor.getCharacterSkills(id);
  return skills.ultimate?.name || "";
};

const getStatBonus = (stat: string) => {
  const char = selectedCharMonitor.value;
  if (!char) return 0;
  const bonuses = char.buffs?.filter((b) => !b.isPositive) || [];
  if (stat === "attack") return bonuses.length * 10;
  if (stat === "defense") return bonuses.length * 5;
  return 0;
};

const getDamageBonus = () => {
  const char = selectedCharMonitor.value;
  if (!char) return 0;
  const bonuses = char.buffs?.filter((b) => b.isPositive) || [];
  return bonuses.length * 15;
};

const getDamageReduction = () => {
  return 10;
};

const getFinalStat = (stat: string) => {
  const char = selectedCharMonitor.value;
  if (!char) return 0;
  const base = stat === "attack" ? char.attack : char.defense;
  const bonus = getStatBonus(stat);
  return Math.floor(base * (1 + bonus / 100));
};

const exceptionStatus = computed(() => {
  return { message: "[正常] 无逻辑异常", class: "normal", hasException: false };
});
</script>

<style scoped>
@use'@/styles/main.scss';
</style>