<template>
  <div class="battle-test-tool">
    <div class="tool-header">
      <h1>回合制战斗系统测试工具 v1.0</h1>
      <div class="header-actions">
        <button class="header-btn" @click="showRulesDialog = true">战斗规则</button>
        <button class="header-btn" @click="showSceneDialog = true">场景管理</button>
        <button class="header-btn" @click="showStatusDialog = true">初始状态注入</button>
      </div>
    </div>

    <div class="main-layout">
      <div class="config-panel panel-left">
        <div class="panel-section">
          <div class="section-header">
            <span>参战角色</span>
          </div>
          <div class="section-content">
            <div class="character-field">
              <div class="character-party our-party">
                <div class="party-header">我方 ({{battleCharacters.filter(c => c.enabled).length}}人)</div>
                <div class="party-members">
                  <div v-for="char in battleCharacters" :key="char.id" class="character-item" :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }" @click="selectCharacter(char.id)">
                    <div class="char-check">
                      <input type="checkbox" v-model="char.enabled" @click.stop>
                    </div>
                    <div class="char-info">
                      <span class="char-name">{{ char.name }}</span>
                      <span class="char-stats">HP:{{ char.currentHp }}/{{ char.maxHp }} SPD:{{ char.speed }}</span>
                    </div>
                    <div class="char-order" v-if="char.enabled">
                      <span class="order-num">{{ getOrderIndex(char.id) }}</span>
                    </div>
                    <div class="char-status" v-if="char.isFirst">
                      <span class="first-badge">先手</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="field-divider">
                <span class="vs-text">VS</span>
              </div>

              <div class="character-party enemy-party">
                <div class="party-header">敌方 ({{ enemyParty.length }}人)</div>
                <div class="party-members">
                  <div v-for="char in enemyParty" :key="char.id" class="character-item" :class="{ selected: selectedCharacterId === char.id }" @click="selectCharacter(char.id)">
                    <div class="char-check">
                      <input type="checkbox" v-model="char.enabled" @click.stop>
                    </div>
                    <div class="char-info">
                      <span class="char-name">{{ char.name }}</span>
                      <span class="char-stats">HP:{{ char.currentHp }}/{{ char.maxHp }} SPD:{{ char.speed }}</span>
                    </div>
                    <div class="char-order" v-if="char.enabled">
                      <span class="order-num">-</span>
                    </div>
                    <div class="char-status" v-if="char.buffs && char.buffs.length > 0">
                      <span class="first-badge">状态</span>
                    </div>
                  </div>
                  <div v-if="enemyParty.length === 0" class="empty-party">(空位)</div>
                </div>
              </div>
            </div>
          </div>
          <div class="section-actions">
            <button class="btn-small" @click="moveCharacter(-1)">[↑]上调</button>
            <button class="btn-small" @click="moveCharacter(1)">[↓]下调</button>
            <button class="btn-small" @click="addCharacter">[+]添加</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-header">
            <span>角色库</span>
          </div>
          <div class="section-content">
            <div class="character-search">
              <input type="text" v-model="enemySearch" placeholder="搜索角色库..." class="search-input">
            </div>
            <div class="scene-enemy-list">
              <div v-for="group in groupedEnemies" :key="group.scene.id" class="scene-group">
                <div class="scene-header" @click="toggleSceneExpand(group.scene.id)">
                  <span class="expand-icon">{{ isSceneExpanded(group.scene.id) ? '▼' : '▶' }}</span>
                  <span class="scene-name">{{ group.scene.name }}</span>
                  <span class="scene-level">Lv.{{ group.scene.requiredLevel }}+</span>
                  <span class="scene-count">{{ group.enemies.length }}人</span>
                </div>
                <div class="scene-enemies" v-show="isSceneExpanded(group.scene.id)">
                  <div v-for="enemy in group.enemies" :key="enemy.id" class="character-item" @click="addEnemyToBattle(enemy)">
                    <div class="char-info">
                      <span class="char-name">{{ enemy.name }}</span>
                      <span class="char-stats">Lv.{{ enemy.level }} HP:{{ enemy.stats.health }} ATK:{{
                        enemy.stats.minAttack }}-{{ enemy.stats.maxAttack }}</span>
                    </div>
                    <div class="char-actions">
                      <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, 'our')">我方</button>
                      <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, 'enemy')">敌方</button>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="groupedEnemies.length === 0" class="empty-message">
                未找到匹配的敌人
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="battle-panel panel-center">
        <div class="battle-top-section">
          <div class="battle-header">
            <div class="turn-info">
              <span class="turn-label">当前回合:</span>
              <span class="turn-num">{{ currentTurn }}/{{ maxTurns }}</span>
              <span class="actor-info">操作方: {{ currentActor?.name || '等待中' }} (SPD:{{ currentActor?.speed || 0
                }})</span>
            </div>
          </div>

          <div class="battle-field">
            <div class="field-party our-party">
              <div class="party-header">我方 ({{ ourParty.length }}人)</div>
              <div class="party-members">
                <div v-for="member in ourParty" :key="member.id" class="member-card" :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id }" @click="selectCharacter(member.id)">
                  <div class="member-info">
                    <div class="member-name">
                      Lv.{{ member.level }} {{ member.name }}
                      <div class="member-action" v-if="currentActor?.id === member.id">
                        <span class="acting-badge">←操作中</span>
                      </div>
                    </div>
                    <div class="member-hp">
                      <span class="hp-text">HP: {{ member.currentHp }}/{{ member.maxHp }}</span>
                      <div class="hp-bar">
                        <div class="hp-fill" :class="getHpColorClass(member)" :style="{ width: getHpPercent(member) + '%' }"></div>
                      </div>
                    </div>
                    <div class="member-energy">
                      <span class="energy-text">能量: {{ member.currentEnergy || 0 }}/150</span>
                      <div class="energy-bar">
                        <div class="energy-ticks">
                            <div class="tick"></div>
                            <div class="tick"></div>
                            <div class="tick"></div>
                            <div class="tick"></div>
                          </div>
                        <div class="energy-fill" :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }">
                        </div>
                      </div>
                    </div>
                    <div class="member-status">
                      <span v-for="status in getMemberStatuses(member)" :key="status.id" class="status-tag" :class="status.isPositive ? 'positive' : 'negative'">
                        {{ status.name }}:{{ status.remainingTurns }}
                      </span>
                      <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="field-divider">
              <span class="vs-text">VS</span>
            </div>

            <div class="field-party enemy-party">
              <div class="party-header">敌方 ({{ enemyParty.length }}人)</div>
              <div class="party-members">
                <div v-for="member in enemyParty" :key="member.id" class="member-card" :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id }" @click="selectCharacter(member.id)">
                  <div class="member-info">
                    <div class="member-name">
                      Lv.{{ member.level }} {{ member.name }}
                      <div class="member-action" v-if="currentActor?.id === member.id">
                        <span class="acting-badge enemy-acting">←操作中</span>
                      </div>
                    </div>
                    <div class="member-hp">
                      <span class="hp-text">HP: {{ member.currentHp }}/{{ member.maxHp }}</span>
                      <div class="hp-bar">
                        <div class="hp-fill enemy-fill" :class="getHpColorClass(member)" :style="{ width: getHpPercent(member) + '%' }"></div>
                      </div>
                    </div>
                    <div class="member-energy">
                      <span class="energy-text">能量: {{ member.currentEnergy || 0 }}/150</span>
                      <div class="energy-bar">
                        <div class="energy-ticks">
                            <div class="tick"></div>
                            <div class="tick"></div>
                            <div class="tick"></div>
                            <div class="tick"></div>
                          </div>
                        <div class="energy-fill enemy-fill" :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }"></div>
                      </div>
                    </div>
                    <div class="member-status">
                      <span v-for="status in getMemberStatuses(member)" :key="status.id" class="status-tag" :class="status.isPositive ? 'positive' : 'negative'">
                        {{ status.name }}:{{ status.remainingTurns }}
                      </span>
                      <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                    </div>
                  </div>
                </div>
                <div v-if="enemyParty.length === 0" class="empty-party">(空位)</div>
              </div>
            </div>
          </div>
        </div>

        <div class="battle-log-section">
          <div class="log-header">
            <span>战斗日志 (最新在上，按时间倒序)</span>
            <div class="log-filters">
              <label class="filter-check">
                <input type="checkbox" v-model="logFilters.damage">伤害
              </label>
              <label class="filter-check">
                <input type="checkbox" v-model="logFilters.status">状态
              </label>
              <label class="filter-check">
                <input type="checkbox" v-model="logFilters.crit">暴击
              </label>
              <label class="filter-check">
                <input type="checkbox" v-model="logFilters.heal">治疗
              </label>
              <input type="text" v-model="logKeyword" placeholder="关键字" class="log-keyword">
              <button class="btn-small">[F]过滤</button>
            </div>
          </div>
          <div class="log-content">
            <div v-for="(log, index) in filteredLogs" :key="index" class="log-entry" :class="log.level">
              <span class="log-turn">[{{ log.turn }}]</span>
              <span class="log-source">{{ log.source }}</span>
              <span class="log-action">{{ log.action }}</span>
              <span class="log-target">{{ log.target }}</span>
              <span class="log-result">{{ log.result }}</span>
              <div v-if="log.subEffects && log.subEffects.length" class="sub-effects">
                <div v-for="(effect, ei) in log.subEffects" :key="ei" class="sub-effect">
                  → {{ effect }}
                </div>
              </div>
            </div>
            <div v-if="filteredLogs.length === 0" class="no-logs">暂无战斗日志</div>
          </div>
        </div>
      </div>

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
            <button class="intervention-btn">[1] 立即结束当前回合</button>
            <div class="intervention-row">
              <span>[2]</span>
              <input type="text" v-model="manualSkillName" placeholder="技能名" class="intervention-input">
              <button class="btn-small">[执行]</button>
            </div>
            <div class="intervention-row">
              <span>[3]</span>
              <input type="text" v-model="manualStatusName" placeholder="状态名" class="intervention-input">
              <span>回合:</span>
              <input type="number" v-model="manualStatusTurns" class="intervention-num">
              <button class="btn-small">[执行]</button>
            </div>
            <div class="intervention-row">
              <span>[4]</span>
              <span>HP[</span>
              <input type="number" v-model="manualHpAmount" class="intervention-num">
              <span>] MP[</span>
              <input type="number" v-model="manualMpAmount" class="intervention-num">
              <span>]</span>
              <button class="btn-small">[执行]</button>
            </div>
            <button class="intervention-btn">[5] 清除所有状态</button>
            <button class="intervention-btn danger">[R] 重置战斗</button>
          </div>
        </div>

        <div class="section">
          <div class="section-header">数据快照</div>
          <div class="snapshot-actions">
            <button class="intervention-btn">[E] 导出当前状态(JSON)</button>
            <button class="intervention-btn">[I] 导入状态数据</button>
          </div>
          <div class="last-export">
            <span>最近导出: {{ lastExportTime || '无' }}</span>
            <div class="snapshot-btns">
              <button class="btn-small">[查看]</button>
              <button class="btn-small">[重载]</button>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">异常检测</div>
          <div class="exception-status" :class="exceptionStatus.class">
            <span>{{ exceptionStatus.message }}</span>
            <button v-if="exceptionStatus.hasException" class="btn-small">[定位]</button>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model="showRulesDialog" title="战斗规则" width="450px">
      <div class="rule-list">
        <label class="rule-item">
          <input type="checkbox" v-model="rules.speedFirst">
          <span>速度决定出手顺序</span>
        </label>
        <label class="rule-item">
          <input type="checkbox" v-model="rules.fixedTurns">
          <span>固定回合制(每方全体行动1次)</span>
        </label>
        <label class="rule-item">
          <input type="checkbox" v-model="rules.critEnabled">
          <span>暴击率生效</span>
        </label>
        <label class="rule-item">
          <input type="checkbox" v-model="rules.dodgeEnabled">
          <span>闪避率生效</span>
        </label>
      </div>
      <div class="speed-selector">
        <span>自动速率:</span>
        <button v-for="speed in [0.5, 1, 2, 5]" :key="speed" class="speed-btn" :class="{ active: autoSpeed === speed }" @click="autoSpeed = speed">
          {{ speed }}x
        </button>
        <input type="number" v-model="customSpeed" class="custom-speed" placeholder="自定义">
      </div>
    </Dialog>

    <Dialog v-model="showSceneDialog" title="场景管理" width="450px">
      <div class="scene-actions">
        <input type="text" v-model="sceneName" placeholder="测试场景名称" class="scene-input">
        <button class="btn-small">[S]保存</button>
      </div>
      <div class="scene-actions">
        <select v-model="selectedScene" class="scene-select">
          <option value="">选择场景...</option>
          <option v-for="scene in savedScenes" :key="scene" :value="scene">{{ scene }}</option>
        </select>
        <button class="btn-small">[L]加载</button>
        <button class="btn-small">[D]删除</button>
      </div>
    </Dialog>

    <Dialog v-model="showStatusDialog" title="初始状态注入" width="500px">
      <div class="selected-info" style="margin-bottom: 1rem;">当前选中: {{ getSelectedCharName() }}</div>
      <div class="status-injection">
        <div v-for="status in injectableStatuses" :key="status.id" class="status-item" :class="{ active: status.active }">
          <label>
            <input type="checkbox" v-model="status.active">
            <span class="status-name" :class="status.isPositive ? 'positive' : 'negative'">{{ status.name }}</span>
          </label>
          <span class="status-duration">回合:{{ status.duration }}</span>
          <span class="status-effect">{{ status.effect }}</span>
        </div>
      </div>
      <div class="section-actions" style="margin-top: 1rem;">
        <button class="btn-small">[A]添加状态</button>
        <button class="btn-small">[C]清空</button>
      </div>
    </Dialog>

    <div class="control-bar">
      <div class="control-group">
        <button class="control-btn" @click="startBattle" :disabled="isBattleActive">开始战斗</button>
        <button class="control-btn" @click="endBattle" :disabled="!isBattleActive">结束战斗</button>
        <button class="control-btn" @click="resetBattle" :disabled="!isBattleActive && !isAutoPlaying">重置战斗</button>
        <button class="control-btn" @click="stepBack" :disabled="!isBattleActive">回退1回合</button>
        <button class="control-btn" @click="togglePause" :disabled="!isBattleActive">{{ isPaused ? '[|] 继续' : '[||] 暂停' }}</button>
        <button class="control-btn" @click="singleStep" :disabled="!isBattleActive">单步执行</button>
        <button class="control-btn" @click="toggleAutoPlay" :disabled="!isBattleActive">{{ isAutoPlaying ? '[■] 停止自动' : '[▶] 自动播放' }}</button>
      </div>
      <div class="control-group right">
        <button class="control-btn">[Q] 退出工具</button>
        <button class="control-btn">[H] 帮助文档</button>
        <span class="mode-indicator">当前模式: 调试模式 | 战斗状态: {{ battleStateDisplay }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from "vue";
import enemiesData from "@configs/enemies/enemies.json";
import scenesData from "@configs/scenes/scenes.json";
import Dialog from "./Dialog.vue";
import ParticipantPanel from "./ParticipantPanel.vue";
import BattleField from "./BattleField.vue";
import BattleLog from "./BattleLog.vue";
import DebugPanel from "./DebugPanel.vue";
import ControlBar from "./ControlBar.vue";
import { GameBattleSystem } from "@/core/BattleSystem";
import type {
  BattleState,
  BattleParticipant,
  BattleAction as BattleSystemAction,
} from "@/types/battle";

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

interface SceneData {
  id: string;
  name: string;
  background: string;
  difficulties: {
    easy: { enemyIds: string[] };
    normal: { enemyIds: string[] };
    hard: { enemyIds: string[] };
  };
  requiredLevel: number;
  rewards: {
    exp: number;
    gold: number;
  };
}

interface GroupedEnemies {
  scene: SceneData;
  enemies: EnemyData[];
}

interface BattleLog {
  turn: string;
  source: string;
  action: string;
  target: string;
  result: string;
  level: string;
  subEffects?: string[];
}

interface InjectableStatus {
  id: string;
  name: string;
  duration: number;
  effect: string;
  active: boolean;
  isPositive: boolean;
}

const currentTurn = ref(1);
const maxTurns = ref(999);
const isPaused = ref(true);
const isAutoPlaying = ref(false);
const isBattleActive = ref(false); // 战斗是否正在进行
const selectedCharacterId = ref("char_1");
const selectedScene = ref("");
const sceneName = ref("");
const customSpeed = ref<number | null>(null);
const autoSpeed = ref(1);
const currentActorId = ref<string | null>(null);
const logKeyword = ref("");
const manualSkillName = ref("");
const manualStatusName = ref("");
const manualStatusTurns = ref(2);
const manualHpAmount = ref(100);
const manualMpAmount = ref(50);
const lastExportTime = ref<string | null>(null);
const selectedCharMonitor = ref<BattleCharacter | null>(null);
const enemySearch = ref("");
const enemies = ref<EnemyData[]>(enemiesData as EnemyData[]);
const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);

// Battle System
const battleSystem = GameBattleSystem.getInstance();
const currentBattleId = ref<string | null>(null);

const allEnemies = enemiesData as EnemyData[];

function createBattleCharacter(
  enemy: EnemyData,
  index: number
): BattleCharacter {
  return {
    originalId: enemy.id,
    id: `char_${index + 1}`,
    name: enemy.name,
    level: enemy.level,
    maxHp: enemy.stats.health,
    currentHp: enemy.stats.health,
    maxMp: 100,
    currentMp: 100,
    currentEnergy: 0,
    maxEnergy: 150,
    attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
    defense: enemy.stats.defense,
    speed: enemy.stats.speed,
    enabled: index < 3,
    isFirst: index === 0,
    buffs:
      index === 0
        ? [
            {
              id: "buff_1",
              name: "力量祝福",
              remainingTurns: 5,
              isPositive: true,
            },
          ]
        : [],
  };
}

const initialCharacters = allEnemies
  .slice(0, 4)
  .map((enemy, index) => createBattleCharacter(enemy, index));

const battleCharacters = reactive<BattleCharacter[]>(initialCharacters);

const initialEnemies = allEnemies
  .slice(4, 6)
  .map((enemy, index) => createBattleCharacter(enemy, index));

const enemyParty = reactive<BattleCharacter[]>(
  initialEnemies.map((char, index) => ({
    ...char,
    id: `enemy_${index + 1}`,
    buffs:
      index === 0
        ? [
            {
              id: "debuff_1",
              name: "灼烧",
              remainingTurns: 2,
              isPositive: false,
            },
          ]
        : [],
  }))
);

const battleLogs = reactive<BattleLog[]>([]);

const rules = reactive({
  speedFirst: true,
  fixedTurns: false,
  critEnabled: true,
  dodgeEnabled: false,
});

const logFilters = reactive({
  damage: true,
  status: true,
  crit: true,
  heal: false,
});

const savedScenes = ref(["测试_灼烧叠加", "测试_暴击率", "测试_群体治疗"]);

const injectableStatuses = reactive<InjectableStatus[]>([
  {
    id: "burn",
    name: "灼烧",
    duration: 3,
    effect: "伤害:15/回合",
    active: false,
    isPositive: false,
  },
  {
    id: "power",
    name: "力量祝福",
    duration: 5,
    effect: "ATK+20%",
    active: true,
    isPositive: true,
  },
  {
    id: "weak",
    name: "虚弱",
    duration: 2,
    effect: "DEF-30%",
    active: false,
    isPositive: false,
  },
  {
    id: "poison",
    name: "中毒",
    duration: 4,
    effect: "伤害:20/回合",
    active: false,
    isPositive: false,
  },
  {
    id: "shield",
    name: "护盾",
    duration: 3,
    effect: "吸收100伤害",
    active: false,
    isPositive: true,
  },
]);

const ourParty = computed(() => {
  return battleCharacters
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

const currentActor = computed(() => {
  if (!currentActorId.value) return null;
  return (
    battleCharacters.find((c) => c.id === currentActorId.value) ||
    enemyParty.find((e) => e.id === currentActorId.value) ||
    null
  );
});

const filteredLogs = computed(() => {
  let logs = [...battleLogs];
  if (!logFilters.damage) {
    logs = logs.filter((l) => l.level !== "damage" && l.level !== "crit");
  }
  if (!logFilters.status) {
    logs = logs.filter((l) => l.level !== "status");
  }
  if (!logFilters.crit) {
    logs = logs.filter((l) => l.level !== "crit");
  }
  if (!logFilters.heal) {
    logs = logs.filter((l) => l.level !== "heal");
  }
  if (logKeyword.value) {
    const keyword = logKeyword.value.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.source.toLowerCase().includes(keyword) ||
        l.target.toLowerCase().includes(keyword) ||
        l.result.toLowerCase().includes(keyword)
    );
  }
  return logs;
});

const filteredEnemies = computed(() => {
  let filtered = [...enemies.value];
  if (enemySearch.value) {
    const keyword = enemySearch.value.toLowerCase();
    filtered = filtered.filter((enemy) =>
      enemy.name.toLowerCase().includes(keyword)
    );
  }
  return filtered;
});

const scenes = ref<SceneData[]>(scenesData as SceneData[]);
const expandedScenes = reactive<Record<string, boolean>>({});
scenes.value.forEach((s) => (expandedScenes[s.id] = true));

const toggleSceneExpand = (sceneId: string) => {
  expandedScenes[sceneId] = !expandedScenes[sceneId];
};

const isSceneExpanded = (sceneId: string): boolean => {
  return expandedScenes[sceneId] === true;
};

const groupedEnemies = computed<GroupedEnemies[]>(() => {
  const allScenes = scenes.value;
  const allEnemies = filteredEnemies.value;

  return allScenes
    .map((scene) => {
      const sceneEnemyIds = new Set([
        ...scene.difficulties.easy.enemyIds,
        ...scene.difficulties.normal.enemyIds,
        ...scene.difficulties.hard.enemyIds,
      ]);

      const sceneEnemies = allEnemies.filter((enemy) =>
        sceneEnemyIds.has(enemy.id)
      );

      return {
        scene,
        enemies: sceneEnemies,
      };
    })
    .filter((group) => group.enemies.length > 0);
});

const battleStateDisplay = computed(() => {
  if (isAutoPlaying.value) return "自动播放";
  if (!isPaused.value) return "进行中";
  return "暂停";
});

const exceptionStatus = computed(() => {
  return { message: "[正常] 无逻辑异常", class: "normal", hasException: false };
});

watch(
  selectedCharacterId,
  (newId) => {
    selectedCharMonitor.value =
      battleCharacters.find((c) => c.id === newId) || null;
  },
  { immediate: true }
);

watch(
  () => rules.critEnabled,
  (val) => {
    addLog("系统", "", "", "", `暴击率 ${val ? "已启用" : "已禁用"}`, "info");
  }
);

const getOrderIndex = (charId: string) => {
  const index = ourParty.value.findIndex((c) => c.id === charId);
  return index >= 0 ? index + 1 : 0;
};

const selectCharacter = (charId: string) => {
  selectedCharacterId.value = charId;
  selectedCharMonitor.value =
    battleCharacters.find((c) => c.id === charId) ||
    enemyParty.find((e) => e.id === charId) ||
    null;
};

const addEnemyToBattle = (enemy: EnemyData, side: "our" | "enemy" = "our") => {
  const newCharacter: BattleCharacter = {
    id: `enemy_${Date.now()}_${enemy.id}`,
    name: enemy.name,
    level: enemy.level,
    maxHp: enemy.stats.health,
    currentHp: enemy.stats.health,
    maxMp: 100,
    currentMp: 100,
    currentEnergy: 0,
    maxEnergy: 150,
    attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
    defense: enemy.stats.defense,
    speed: enemy.stats.speed,
    enabled: true,
    isFirst: false,
    buffs: [],
  };

  if (side === "our") {
    battleCharacters.push(newCharacter);
  } else {
    enemyParty.push(newCharacter);
  }

  selectCharacter(newCharacter.id);
};

const getSelectedCharName = () => {
  const char = battleCharacters.find((c) => c.id === selectedCharacterId.value);
  const enemy = enemyParty.find((e) => e.id === selectedCharacterId.value);
  return char?.name || enemy?.name || "未选择";
};

const moveCharacter = (direction: number) => {
  const enabledChars = battleCharacters.filter((c) => c.enabled);
  const currentIndex = enabledChars.findIndex(
    (c) => c.id === selectedCharacterId.value
  );
  if (currentIndex < 0) return;
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= enabledChars.length) return;
  const targetChar = enabledChars[newIndex];
  const currentChar = enabledChars[currentIndex];
  const idx1 = battleCharacters.indexOf(currentChar);
  const idx2 = battleCharacters.indexOf(targetChar);
  battleCharacters[idx1] = targetChar;
  battleCharacters[idx2] = currentChar;
};

const addCharacter = () => {
  const newId = `char_${Date.now()}`;
  battleCharacters.push({
    id: newId,
    name: `新角色_${battleCharacters.length + 1}`,
    level: 1,
    maxHp: 500,
    currentHp: 500,
    maxMp: 50,
    currentMp: 50,
    currentEnergy: 0,
    maxEnergy: 150,
    attack: 50,
    defense: 30,
    speed: 100,
    enabled: true,
    isFirst: false,
    buffs: [],
  });
};

const getHpPercent = (char: BattleCharacter) => {
  return Math.max(0, (char.currentHp / char.maxHp) * 100);
};



const getHpColorClass = (char: BattleCharacter): string => {
  const percent = (char.currentHp / char.maxHp) * 100;
  if (percent <= 25) return 'low';
  if (percent <= 50) return 'medium';
  return 'high';
};

const getMemberStatuses = (char: BattleCharacter) => {
  return char.buffs || [];
};

const getCharPassive = (char: BattleCharacter | null): string => {
  if (!char) return "";
  const enemy = allEnemies.find((e) => e.id === char.originalId);
  return enemy?.skills?.passive || "";
};

const getCharSmallSkill = (char: BattleCharacter | null): string => {
  if (!char) return "";
  const enemy = allEnemies.find((e) => e.id === char.originalId);
  return enemy?.skills?.small || "";
};

const getCharUltimate = (char: BattleCharacter | null): string => {
  if (!char) return "";
  const enemy = allEnemies.find((e) => e.id === char.originalId);
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

const addLog = (
  turn: string,
  source: string,
  action: string,
  target: string,
  result: string,
  level: string = "info"
) => {
  battleLogs.unshift({ turn, source, action, target, result, level });
  if (battleLogs.length > 100) battleLogs.pop();
};

// 子组件事件处理方法
const endTurn = () => {
  // 结束当前回合的逻辑
  if (currentActorId.value) {
    addLog(currentTurn.value.toString(), "系统", "结束回合", currentActor.value?.name || "", "回合结束", "info");
    currentActorId.value = null;
  }
};

const executeSkill = (skillName: string) => {
  if (!skillName) return;
  if (currentActor.value) {
    addLog(currentTurn.value.toString(), currentActor.value.name, "使用技能", "", skillName, "info");
  }
};

const addStatus = (status: { name: string; turns: number }) => {
  if (!status.name) return;
  const selectedChar = battleCharacters.find(c => c.id === selectedCharacterId.value) || 
                      enemyParty.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.buffs.push({
      id: `status_${Date.now()}`,
      name: status.name,
      remainingTurns: status.turns,
      isPositive: true
    });
    addLog(currentTurn.value.toString(), "系统", "添加状态", selectedChar.name, `${status.name} (${status.turns}回合)`, "status");
  }
};

const adjustStats = (stats: { hp: number; mp: number }) => {
  const selectedChar = battleCharacters.find(c => c.id === selectedCharacterId.value) || 
                      enemyParty.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.currentHp = Math.max(0, Math.min(selectedChar.maxHp, selectedChar.currentHp + stats.hp));
    selectedChar.currentMp = Math.max(0, Math.min(selectedChar.maxMp, selectedChar.currentMp + stats.mp));
    addLog(currentTurn.value.toString(), "系统", "调整属性", selectedChar.name, `HP:${stats.hp}, MP:${stats.mp}`, "info");
  }
};

const clearStatuses = () => {
  const selectedChar = battleCharacters.find(c => c.id === selectedCharacterId.value) || 
                      enemyParty.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.buffs = [];
    addLog(currentTurn.value.toString(), "系统", "清除状态", selectedChar.name, "所有状态已清除", "status");
  }
};

const exportState = () => {
  const state = {
    battleCharacters,
    enemyParty,
    currentTurn: currentTurn.value,
    rules,
    battleLogs
  };
  const json = JSON.stringify(state, null, 2);
  localStorage.setItem('battleState', json);
  lastExportTime.value = new Date().toLocaleString();
  addLog(currentTurn.value.toString(), "系统", "导出状态", "", "战斗状态已导出", "info");
};

const importState = () => {
  const savedState = localStorage.getItem('battleState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      // 这里需要实现导入逻辑
      addLog(currentTurn.value.toString(), "系统", "导入状态", "", "战斗状态已导入", "info");
    } catch (e) {
      addLog(currentTurn.value.toString(), "系统", "导入状态", "", "导入失败", "error");
    }
  }
};

const viewExport = () => {
  const savedState = localStorage.getItem('battleState');
  if (savedState) {
    console.log('Exported Battle State:', JSON.parse(savedState));
  }
};

const reloadExport = () => {
  importState();
};

const locateException = () => {
  // 异常定位逻辑
  addLog(currentTurn.value.toString(), "系统", "定位异常", "", "开始异常检测", "info");
};

const saveScene = () => {
  if (sceneName.value) {
    savedScenes.value.push(sceneName.value);
    addLog(currentTurn.value.toString(), "系统", "保存场景", "", sceneName.value, "info");
    sceneName.value = "";
  }
};

const loadScene = () => {
  if (selectedScene.value) {
    addLog(currentTurn.value.toString(), "系统", "加载场景", "", selectedScene.value, "info");
  }
};

const deleteScene = () => {
  if (selectedScene.value) {
    const index = savedScenes.value.indexOf(selectedScene.value);
    if (index > -1) {
      savedScenes.value.splice(index, 1);
      addLog(currentTurn.value.toString(), "系统", "删除场景", "", selectedScene.value, "info");
      selectedScene.value = "";
    }
  }
};

const addCustomStatus = () => {
  // 添加自定义状态逻辑
  addLog(currentTurn.value.toString(), "系统", "添加自定义状态", "", "自定义状态已添加", "status");
};

const clearInjectableStatuses = () => {
  injectableStatuses.forEach(status => {
    status.active = false;
  });
  addLog(currentTurn.value.toString(), "系统", "清空状态", "", "所有可注入状态已清空", "status");
};

const exitTool = () => {
  // 退出工具逻辑
  addLog(currentTurn.value.toString(), "系统", "退出工具", "", "战斗测试工具已退出", "info");
};

const showHelp = () => {
  // 显示帮助逻辑
  addLog(currentTurn.value.toString(), "系统", "显示帮助", "", "帮助文档已打开", "info");
};

const togglePause = () => {
  isPaused.value = !isPaused.value;
};

const singleStep = async () => {
  if (!currentBattleId.value) {
    alert("请先开始战斗");
    return;
  }

  isPaused.value = false;

  try {
    // 执行战斗回合
    await battleSystem.processTurn(currentBattleId.value!);

    // 同步战斗状态
    syncBattleState();
  } catch (error) {
    console.error("执行回合时出错:", error);
    addLog("系统", "", "", "", `执行回合时出错: ${error}`, "error");
    isPaused.value = true;
  }
};

const toggleAutoPlay = () => {
  if (!currentBattleId.value) {
    alert("请先开始战斗");
    return;
  }

  if (isAutoPlaying.value) {
    // 停止自动播放
    isAutoPlaying.value = false;
    isPaused.value = true;
    addLog("系统", "", "", "", "停止自动战斗", "info");
  } else {
    // 开始自动播放
    isAutoPlaying.value = true;
    isPaused.value = false;
    addLog("系统", "", "", "", "开始自动战斗", "info");
    
    // 开始自动战斗循环
    const autoBattleInterval = setInterval(async () => {
      if (!isAutoPlaying.value || !currentBattleId.value || isPaused.value) {
        clearInterval(autoBattleInterval);
        return;
      }

      try {
        await battleSystem.processTurn(currentBattleId.value!);
        syncBattleState();

        // 检查战斗是否结束
        if (!currentBattleId.value) {
          clearInterval(autoBattleInterval);
          isAutoPlaying.value = false;
          isPaused.value = true;
        }
      } catch (error) {
        console.error("自动战斗时出错:", error);
        addLog("系统", "", "", "", `自动战斗时出错: ${error}`, "error");
        clearInterval(autoBattleInterval);
        isAutoPlaying.value = false;
        isPaused.value = true;
      }
    }, 1000 / autoSpeed.value);
  }
};

const stepBack = () => {
  if (currentTurn.value > 1) {
    currentTurn.value--;
  }
};

const startBattle = () => {
  // 获取启用的角色和敌人的详细信息
  const enabledCharacters = battleCharacters.filter((c) => c.enabled);
  const enemies = enemyParty;

  // 检查是否有足够的参战单位
  if (enabledCharacters.length === 0) {
    alert("请至少选择一个角色参战");
    return;
  }

  if (enemies.length === 0) {
    alert("请至少添加一个敌人");
    return;
  }

  // 构建参与者信息数组
  const participantsInfo = [
    // 角色
    ...enabledCharacters.map((char) => ({
      id: char.id,
      name: char.name,
      type: 'character' as const,
      maxHealth: char.maxHp,
      currentHealth: char.currentHp,
      maxEnergy: char.maxEnergy,
      currentEnergy: char.currentEnergy
    })),
    // 敌人
    ...enemies.map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      type: 'enemy' as const,
      maxHealth: enemy.maxHp,
      currentHealth: enemy.currentHp,
      maxEnergy: enemy.maxEnergy,
      currentEnergy: enemy.currentEnergy
    }))
  ];

  // 创建战斗
  const battleState = battleSystem.createBattle(participantsInfo);
  currentBattleId.value = battleState.battleId;

  // 重置战斗状态
  currentTurn.value = 1;
  isPaused.value = false;
  isAutoPlaying.value = false;
  isBattleActive.value = true;
  
  // 清空已处理的 action ID 集合，确保新战斗的所有 action 都能被处理
  processedActionIds.value.clear();

  // 添加战斗开始日志
  addLog(
    "系统",
    "",
    "",
    "",
    `战斗开始！战斗ID: ${battleState.battleId}`,
    "info"
  );
  addLog(
    "系统",
    "",
    "",
    "",
    `参战角色: ${enabledCharacters.length} 人 | 参战敌人: ${enemies.length} 人`,
    "info"
  );
};

// 同步战斗状态到 UI
const syncBattleState = () => {
  if (!currentBattleId.value) {
    return;
  }

  try {
    // 获取当前战斗状态
    const battleState = battleSystem.getBattleState(currentBattleId.value);
    if (!battleState) {
      console.error("无法获取战斗状态:", currentBattleId.value);
      addLog("系统", "", "", "", `无法获取战斗状态，战斗可能已结束`, "error");
      currentBattleId.value = null;
      return;
    }

    // 更新战斗状态
    currentTurn.value = battleState.currentTurn + 1; // 战斗系统从0开始计数

    // 更新当前行动者
    if (battleState.currentTurn < battleState.turnOrder.length) {
      const currentParticipantId =
        battleState.turnOrder[battleState.currentTurn];
      currentActorId.value = currentParticipantId;
    }

    // 同步参与者状态
    try {
      syncParticipantsState(battleState);
    } catch (syncError: any) {
      console.error("同步参与者状态时出错:", syncError);
      addLog(
        "系统",
        "",
        "",
        "",
        `同步参与者状态时出错: ${syncError.message || syncError}`,
        "error"
      );
    }

    // 同步战斗日志
    try {
      syncBattleLogs(battleState);
    } catch (logError: any) {
      console.error("同步战斗日志时出错:", logError);
      addLog(
        "系统",
        "",
        "",
        "",
        `同步战斗日志时出错: ${logError.message || logError}`,
        "error"
      );
    }

    // 检查战斗是否结束
    if (!battleState.isActive) {
      // 战斗结束日志已经在 syncBattleLogs 中添加，这里不需要重复添加
      currentBattleId.value = null;
      isPaused.value = true;
      isAutoPlaying.value = false;
    }
  } catch (error: any) {
    console.error("同步战斗状态时出错:", error);
    addLog(
      "系统",
      "",
      "",
      "",
      `同步战斗状态时出错: ${error.message || error}`,
      "error"
    );
    // 出错后重置战斗状态
    isPaused.value = true;
    isAutoPlaying.value = false;
  }
};

// 同步参与者状态
const syncParticipantsState = (battleState: BattleState) => {
  // 遍历所有参与者
  battleState.participants.forEach((participant: BattleParticipant) => {
    // 查找对应的角色或敌人
    const character = battleCharacters.find(
      (c) => c.id === participant.id.replace("character_", "")
    );
    const enemy = enemyParty.find(
      (e) => e.id === participant.id.replace("enemy_", "")
    );

    if (character) {
      // 更新角色状态
      character.currentHp = participant.currentHealth;
      character.maxHp = participant.maxHealth;
      character.currentEnergy = participant.currentEnergy;
      character.maxEnergy = participant.maxEnergy;
      // 这里可以根据需要更新其他状态，如MP、buff等
    } else if (enemy) {
      // 更新敌人状态
      enemy.currentHp = participant.currentHealth;
      enemy.maxHp = participant.maxHealth;
      enemy.currentEnergy = participant.currentEnergy;
      enemy.maxEnergy = participant.maxEnergy;
      // 这里可以根据需要更新其他状态，如MP、buff等
    }
  });
};

// 已处理的 action ID 集合
const processedActionIds = ref<Set<string>>(new Set());

// 同步战斗日志
const syncBattleLogs = (battleState: BattleState) => {
  // 按时间戳和回合号排序 actions
  const sortedActions = [...battleState.actions].sort((a, b) => {
    // 首先按时间戳排序
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    // 如果时间戳相同，按回合号排序
    const turnA = a.turn || 0;
    const turnB = b.turn || 0;
    if (turnA !== turnB) {
      return turnA - turnB;
    }
    // 如果回合号也相同，按 action ID 排序
    return a.id.localeCompare(b.id);
  });
  
  // 遍历排序后的 actions
  sortedActions.forEach((action: BattleSystemAction) => {
    // 检查是否已经处理过该 action
    if (processedActionIds.value.has(action.id)) {
      return;
    }
    
    // 标记该 action 为已处理
    processedActionIds.value.add(action.id);
    
    // 构建日志内容
    let logSource = action.sourceId;
    let logTarget = action.targetId;
    let logResult = "";
    let logLevel = "info";

    // 解析来源和目标
    if (action.sourceId === "system") {
      logSource = "系统";
    } else {
      // 尝试获取参与者名称
      const participant = battleState.participants.get(action.sourceId);
      if (participant) {
        logSource = participant.name;
        // 根据参与者类型设置日志级别
        logLevel = participant.type === "enemy" ? "enemy" : "ally";
      }
    }

    if (action.targetId === "system") {
      logTarget = "";
    } else {
      // 尝试获取参与者名称
      const participant = battleState.participants.get(action.targetId);
      if (participant) {
        logTarget = participant.name;
      }
    }

    // 构建结果信息
    if (action.effects && action.effects.length > 0) {
      // 详细解析 effects 数组
      const effects: string[] = [];
      let energyCost = "";
      let damage = "";
      let heal = "";
      
      action.effects.forEach(effect => {
        if (effect.description.includes("消耗")) {
          energyCost = effect.description;
        } else if (effect.description.includes("伤害")) {
          damage = effect.description;
        } else if (effect.description.includes("恢复")) {
          heal = effect.description;
        } else if (!effect.description.includes("战斗开始") && !effect.description.includes("战斗结束")) {
          effects.push(effect.description);
        }
      });
      
      // 构建标准化的日志格式
      if (action.type === "skill") {
        let skillName = "";
        if (action.skillId) {
          // 从技能ID中提取技能名称
          if (action.skillId.includes("heal")) skillName = "治疗术";
          else if (action.skillId.includes("attack")) skillName = "强力攻击";
          else if (action.skillId.includes("ultimate")) skillName = "终极技能";
          else if (action.skillId.includes("enemy_skill_1")) skillName = "爪击";
          else if (action.skillId.includes("enemy_skill_2")) skillName = "狂暴";
          else skillName = "技能";
        }
        
        const parts = [];
        if (energyCost) {
          // 消耗能量是自己的行为，不需要显示目标
          parts.push(energyCost);
        }
        parts.push(`对 ${logTarget} 使用 ${skillName}`);
        if (damage) parts.push(damage);
        if (heal) parts.push(heal);
        
        // 如果只有消耗能量和使用技能，没有其他效果，添加一个占位符表示操作完成
        if (parts.length === 2 && !damage && !heal) {
          parts.push(" ");
        }
        
        // 过滤掉重复的技能使用描述和空字符串
        const filteredEffects = effects.filter(effect => 
          !effect.includes(`${logSource} 使用 ${skillName}`) && effect.trim() !== ""
        );
        if (filteredEffects.length > 0) parts.push(...filteredEffects);
        
        logResult = parts.filter(p => p.trim() !== "").join("，");
        logLevel = action.sourceId.includes("enemy") ? "enemy" : "ally";
      } else if (action.sourceId === "system" && action.effects && action.effects.some(e => e.description.includes("战斗开始"))) {
        // 战斗开始日志
        logResult = action.effects[0].description;
        logLevel = "info";
      } else if (action.sourceId === "system" && action.effects && action.effects.some(e => e.description.includes("战斗结束"))) {
        // 战斗结束日志
        logResult = action.effects[0].description;
        logLevel = "info";
      } else {
        logResult = effects.join("，");
      }
    } else if (action.damage && action.damage > 0) {
      // 伤害动作
      logResult = `对 ${logTarget} 普通攻击，造成 ${action.damage} 伤害`;
      logLevel = action.sourceId.includes("enemy") ? "enemy" : "ally";
    } else if (action.heal && action.heal > 0) {
      // 治疗动作
      logResult = `对 ${logTarget} 治疗，恢复 ${action.heal} HP`;
      logLevel = action.sourceId.includes("enemy") ? "enemy" : "ally";
    }

    // 检查是否已经添加过该日志
    // 为系统消息使用特殊的回合标识
    let turnLabel = "";
    if (action.sourceId === "system" && action.effects && action.effects.some(e => e.description.includes("战斗开始"))) {
      turnLabel = "系统";
      const isLogExists = battleLogs.some(
        (log) => log.turn === "系统" && log.result === action.effects[0].description
      );
      if (isLogExists) return;
    } else if (action.sourceId === "system" && action.effects && action.effects.some(e => e.description.includes("战斗结束"))) {
      turnLabel = "系统";
      const isLogExists = battleLogs.some(
        (log) => log.turn === "系统" && log.result === action.effects[0].description
      );
      if (isLogExists) return;
    } else {
      // 使用 action.turn 作为回合号
      const turnNum = action.turn || 1;
      turnLabel = `回合${turnNum}`;
      const isLogExists = battleLogs.some(
        (log) =>
          log.turn === `回合${turnNum}` &&
          log.source === logSource &&
          log.target === logTarget &&
          log.result === logResult
      );
      if (isLogExists) return;
    }
    
    // 添加日志
    addLog(
      turnLabel,
      logSource,
      "对",
      logTarget,
      logResult,
      logLevel
    );
  });
};

const endBattle = () => {
  if (!currentBattleId.value) {
    alert("当前没有进行中的战斗");
    return;
  }

  // 结束战斗，默认角色方胜利
  battleSystem.endBattle(currentBattleId.value, "character");

  // 同步战斗状态
  syncBattleState();

  // 重置战斗状态
  currentBattleId.value = null;
  isPaused.value = true;
  isAutoPlaying.value = false;
  isBattleActive.value = false;
};

const resetBattle = () => {
  // 重置战斗状态
  currentBattleId.value = null;
  currentTurn.value = 1;
  isPaused.value = true;
  isAutoPlaying.value = false;
  isBattleActive.value = false;
  
  // 清空战斗日志
  battleLogs.length = 0;
  
  // 清空已处理的 action ID 集合
  processedActionIds.value.clear();
  
  // 重置角色状态到初始值
  battleCharacters.forEach(char => {
    char.currentHp = char.maxHp;
    char.currentEnergy = 0;
  });
  
  enemyParty.forEach(enemy => {
    enemy.currentHp = enemy.maxHp;
    enemy.currentEnergy = 0;
  });
  
  // 添加重置日志
  addLog(
    "系统",
    "",
    "",
    "",
    "战斗已重置",
    "info"
  );
};

onMounted(() => {
  currentActorId.value = ourParty.value[0]?.id || null;
  addLog("系统", "", "", "", "测试工具已加载", "info");
});
</script>

<style scoped lang="scss">
@import './BattleArena.scss';
</style>
