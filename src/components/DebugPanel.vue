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
            <span class="monitor-value">{{ selectedCharMonitor?.currentEnergy || 0 }}/{{ selectedCharMonitor?.maxEnergy || 150
              }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">ATK:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.attack || 0 }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">DEF:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.defense || 0 }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">SPD:</span>
            <span class="monitor-value">{{ selectedCharMonitor?.speed || 0 }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">状态加成</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">ATK:</span>
            <span class="monitor-value bonus">+{{ getStatBonus('attack') }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">DEF:</span>
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
            <span class="monitor-label">实际ATK:</span>
            <span class="monitor-value final">{{ getFinalStat('attack') }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">实际DEF:</span>
            <span class="monitor-value final">{{ getFinalStat('defense') }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">技能信息</div>
        <div class="skills-display">
          <div class="skill-item passive" v-if="getCharPassive(selectedCharMonitor)">
            <span class="skill-label">被动:</span>
            <span class="skill-name">{{ getCharPassive(selectedCharMonitor) }}</span>
          </div>
          <div class="skill-item small" v-if="getCharSmallSkill(selectedCharMonitor)">
            <span class="skill-label">小技能:</span>
            <span class="skill-name">{{ getCharSmallSkill(selectedCharMonitor) }}</span>
          </div>
          <div class="skill-item ultimate" v-if="getCharUltimate(selectedCharMonitor)">
            <span class="skill-label">大技能:</span>
            <span class="skill-name">{{ getCharUltimate(selectedCharMonitor) }}</span>
          </div>
          <div v-if="!getCharPassive(selectedCharMonitor) && !getCharSmallSkill(selectedCharMonitor) && !getCharUltimate(selectedCharMonitor)" class="no-skills">
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
          <button class="btn-small" @click="$emit('add-status', { name: manualStatusName, turns: manualStatusTurns })">[执行]</button>
        </div>
        <div class="intervention-row">
          <span>[4]</span>
          <span>HP[</span>
          <input type="number" v-model="manualHpAmount" class="intervention-num">
          <span>] MP[</span>
          <input type="number" v-model="manualMpAmount" class="intervention-num">
          <span>]</span>
          <button class="btn-small" @click="$emit('adjust-stats', { hp: manualHpAmount, mp: manualMpAmount })">[执行]</button>
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
import enemiesData from "@configs/enemies/enemies.json";

interface BattleCharacter {
  originalId?: string;
  id: string;
  name: string;
  level: number;
  maxHp: number;
  currentHp: number;
  maxMp: number;
  currentMp: number;
  currentEnergy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  enabled: boolean;
  isFirst: boolean;
  buffs: Array<{
    id: string;
    name: string;
    remainingTurns: number;
    isPositive: boolean;
  }>;
}

interface EnemyData {
  id: string;
  name: string;
  level: number;
  stats: {
    health: number;
    minAttack: number;
    maxAttack: number;
    defense: number;
    speed: number;
  };
  drops: Array<{
    itemId: string;
    quantity: number;
    chance: number;
  }>;
  skills: {
    small?: string;
    passive?: string;
    ultimate?: string;
  };
}

const props = defineProps<{
  battleCharacters: BattleCharacter[];
  enemyParty: BattleCharacter[];
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

const selectedCharMonitor = computed(() => {
  return props.battleCharacters.find((c) => c.id === props.selectedCharacterId) || 
         props.enemyParty.find((e) => e.id === props.selectedCharacterId) || 
         null;
});

const getSelectedCharName = () => {
  const char = props.battleCharacters.find((c) => c.id === props.selectedCharacterId);
  const enemy = props.enemyParty.find((e) => e.id === props.selectedCharacterId);
  return char?.name || enemy?.name || "未选择";
};

const getCharPassive = (char: BattleCharacter | null): string => {
  if (!char || !char.originalId) return "";
  const enemy = (enemiesData as EnemyData[]).find((e) => e.id === char.originalId);
  return enemy?.skills?.passive || "";
};

const getCharSmallSkill = (char: BattleCharacter | null): string => {
  if (!char || !char.originalId) return "";
  const enemy = (enemiesData as EnemyData[]).find((e) => e.id === char.originalId);
  return enemy?.skills?.small || "";
};

const getCharUltimate = (char: BattleCharacter | null): string => {
  if (!char || !char.originalId) return "";
  const enemy = (enemiesData as EnemyData[]).find((e) => e.id === char.originalId);
  return enemy?.skills?.ultimate || "";
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
.debug-panel {
  width: 300px;
  padding: 15px;
  background: #f5f5f5;
  border-left: 1px solid #ddd;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
}

.section {
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin-bottom: 15px;
  overflow: hidden;
}

.section-header {
  padding: 10px 15px;
  background: #f0f0f0;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selected-info {
  font-size: 12px;
  font-weight: normal;
  color: #666;
}

.monitor-group {
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
}

.monitor-group:last-child {
  border-bottom: none;
}

.monitor-subtitle {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 8px;
  color: #666;
}

.monitor-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.monitor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px;
  background: #f9f9f9;
  border-radius: 3px;
  font-size: 12px;
}

.monitor-label {
  font-weight: bold;
  color: #666;
}

.monitor-value {
  color: #333;
}

.monitor-value.bonus {
  color: #4CAF50;
}

.monitor-value.final {
  color: #2196F3;
  font-weight: bold;
}

.skills-display {
  padding: 8px;
  background: #f9f9f9;
  border-radius: 3px;
}

.skill-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px;
  margin-bottom: 4px;
  border-radius: 2px;
  font-size: 11px;
}

.skill-item.passive {
  background: #E8F5E9;
}

.skill-item.small {
  background: #E3F2FD;
}

.skill-item.ultimate {
  background: #F3E5F5;
}

.skill-label {
  font-weight: bold;
  color: #666;
}

.skill-name {
  color: #333;
}

.no-skills {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 10px;
  font-size: 11px;
}

.intervention-list {
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.intervention-btn {
  padding: 8px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.intervention-btn:hover {
  background: #e0e0e0;
}

.intervention-btn.danger {
  background: #FFEBEE;
  border-color: #FFCDD2;
  color: #C62828;
}

.intervention-btn.danger:hover {
  background: #FFCDD2;
}

.intervention-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.intervention-input {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
}

.intervention-num {
  width: 50px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
}

.btn-small {
  padding: 3px 8px;
  font-size: 11px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
}

.btn-small:hover {
  background: #e0e0e0;
}

.snapshot-actions {
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.last-export {
  padding: 12px 15px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #666;
}

.snapshot-btns {
  display: flex;
  gap: 6px;
}

.exception-status {
  padding: 12px 15px;
  font-size: 12px;
  text-align: center;
}

.exception-status.normal {
  background: #E8F5E9;
  color: #2E7D32;
}

.exception-status.warning {
  background: #FFF3E0;
  color: #E65100;
}

.exception-status.error {
  background: #FFEBEE;
  color: #C62828;
}
</style>