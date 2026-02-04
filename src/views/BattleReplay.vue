<template>
  <div class="battle-replay">
    <div class="replay-header">
      <h3>战斗回放</h3>
      <div class="replay-info">
        <span class="battle-name">{{ currentRecording?.name || '未选择' }}</span>
        <span class="event-count">事件: {{ currentEventIndex + 1 }}/{{ totalEvents }}</span>
        <span class="current-turn">回合: {{ currentTurn }}</span>
      </div>
    </div>

    <div class="replay-controls">
      <button 
        class="control-btn"
        @click="goToStart"
        :disabled="!canReplay"
        title="回到开始"
      >
        ⏮
      </button>
      <button 
        class="control-btn"
        @click="stepBack"
        :disabled="!canStepBack"
        title="上一步"
      >
        ⏪
      </button>
      <button 
        class="control-btn"
        @click="stepBackFrame"
        :disabled="!canStepBack"
        title="逐帧后退"
      >
        ⏪
      </button>
      <button 
        class="control-btn play-btn"
        @click="togglePlayPause"
        :disabled="!canReplay"
        title="播放/暂停"
      >
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button 
        class="control-btn"
        @click="stepForwardFrame"
        :disabled="!canStepForward"
        title="逐帧前进"
      >
        ⏩
      </button>
      <button 
        class="control-btn"
        @click="stepForward"
        :disabled="!canStepForward"
        title="下一步"
      >
        ⏩
      </button>
      <button 
        class="control-btn"
        @click="goToEnd"
        :disabled="!canReplay"
        title="跳到结束"
      >
        ⏭
      </button>
    </div>

    <div class="replay-frame-controls" v-if="canReplay">
      <span class="frame-info">当前帧: {{ currentFrame }} / {{ totalFrames }}</span>
      <input 
        type="range" 
        class="frame-slider"
        :min="0"
        :max="totalFrames - 1"
        v-model.number="currentFrame"
        @input="jumpToFrame"
      />
    </div>

    <div class="replay-speed">
      <span class="speed-label">速度:</span>
      <button 
        v-for="speed in [0.5, 1, 2, 5]" 
        :key="speed"
        class="speed-btn"
        :class="{ active: replaySpeed === speed }"
        @click="setSpeed(speed)"
      >
        {{ speed }}x
      </button>
    </div>

    <div class="replay-timeline">
      <div class="timeline-header">
        <span class="timeline-title">战斗时间线</span>
        <div class="timeline-zoom">
          <button class="zoom-btn" @click="zoomOut" title="缩小">-</button>
          <span class="zoom-level">{{ zoomLevel }}x</span>
          <button class="zoom-btn" @click="zoomIn" title="放大">+</button>
        </div>
      </div>
      <div class="timeline-track" ref="timelineTrack">
        <div 
          class="timeline-events"
          :style="{ width: totalEvents * (20 * zoomLevel) + 'px' }"
        >
          <div 
            v-for="(event, index) in currentRecording?.events" 
            :key="event.eventId"
            class="timeline-event"
            :class="[
              { active: index === currentEventIndex, 'key-event': isKeyEvent(event), 'bookmarked': isBookmarked(index) },
              'event-type-' + event.type,
              'event-severity-' + getEventSeverity(event)
            ]"
            :title="`${getEventTypeLabel(event.type)} - 回合 ${event.turn}${isKeyEvent(event) ? ' (关键事件)' : ''}${isBookmarked(index) ? ' (已标记)' : ''}`"
            @click="jumpToEvent(index)"
            @contextmenu.prevent="toggleBookmark(index)"
          >
            <div class="event-marker"></div>
            <div v-if="isKeyEvent(event)" class="key-event-indicator">!</div>
            <div v-if="isBookmarked(index)" class="bookmark-indicator">🔖</div>
            <div class="event-tooltip">
              <div class="tooltip-header">{{ getEventTypeLabel(event.type) }}</div>
              <div class="tooltip-turn">回合: {{ event.turn }}</div>
              <div class="tooltip-time">{{ formatTime(event.timestamp) }}</div>
              <div class="tooltip-details">{{ getEventDetails(event) }}</div>
            </div>
          </div>
        </div>
        <div 
          class="timeline-cursor"
          :style="{ left: currentEventIndex * (20 * zoomLevel) + 'px' }"
        ></div>
        <div 
          class="timeline-frame-cursor"
          :style="{ left: (currentFrame / totalFrames) * 100 + '%' }"
        ></div>
      </div>
      <div class="timeline-labels">
        <span v-for="turn in visibleTurns" :key="turn" class="turn-label">{{ turn }}</span>
      </div>
    </div>

    <div class="replay-events">
      <div class="events-header">
        <h4>事件列表</h4>
        <div class="events-filter">
          <select v-model="filterType" class="filter-select">
            <option value="all">所有类型</option>
            <option value="action">动作</option>
            <option value="state_change">状态变化</option>
            <option value="turn_start">回合开始</option>
            <option value="turn_end">回合结束</option>
            <option value="battle_start">战斗开始</option>
            <option value="battle_end">战斗结束</option>
            <option value="key">关键事件</option>
            <option value="bookmarked">已标记</option>
          </select>
          <input 
            v-model="searchQuery" 
            placeholder="搜索事件..." 
            class="search-input"
          />
        </div>
      </div>
      <div class="events-list">
        <div 
          v-for="(event, index) in filteredEvents" 
          :key="event.eventId"
          class="event-item"
          :class="[
            { active: index === currentEventIndex, 'key-event': isKeyEvent(event), 'bookmarked': isBookmarked(index) },
            'event-type-' + event.type,
            'event-severity-' + getEventSeverity(event)
          ]"
          @click="jumpToEvent(index)"
          @contextmenu.prevent="toggleBookmark(index)"
        >
          <div class="event-index">{{ index + 1 }}</div>
          <div class="event-type">
            {{ getEventTypeLabel(event.type) }}
            <span v-if="isKeyEvent(event)" class="key-event-badge">关键</span>
            <span v-if="isBookmarked(index)" class="bookmark-badge">标记</span>
          </div>
          <div class="event-turn">回合 {{ event.turn }}</div>
          <div class="event-time">{{ formatTime(event.timestamp) }}</div>
          <div class="event-details">{{ getEventDetails(event) }}</div>
          <div class="event-actions">
            <button 
              class="action-icon" 
              @click.stop="toggleBookmark(index)"
              :title="isBookmarked(index) ? '取消标记' : '标记事件'"
            >
              {{ isBookmarked(index) ? '🔖' : '📌' }}
            </button>
            <button 
              class="action-icon" 
              @click.stop="inspectEvent(event)"
              title="详细查看"
            >
              🔍
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="debug-panel" v-if="currentRecording">
      <h4>调试信息</h4>
      <div class="debug-info">
        <div class="debug-item">
          <label>当前状态:</label>
          <span>{{ getCurrentState() }}</span>
        </div>
        <div class="debug-item">
          <label>事件统计:</label>
          <span>{{ getEventStats() }}</span>
        </div>
        <div class="debug-item">
          <label>帧率:</label>
          <span>{{ frameRate }} FPS</span>
        </div>
        <div class="debug-item">
          <label>内存使用:</label>
          <span>{{ memoryUsage }} MB</span>
        </div>
      </div>
      <div class="debug-controls">
        <button class="debug-btn" @click="exportDebugData">导出调试数据</button>
        <button class="debug-btn" @click="takeSnapshot">保存快照</button>
        <button class="debug-btn" @click="togglePerformanceMonitor">
          {{ showPerformanceMonitor ? '隐藏性能监控' : '显示性能监控' }}
        </button>
      </div>
    </div>

    <div class="replay-actions">
      <button class="action-btn" @click="loadRecording">加载记录</button>
      <button class="action-btn" @click="saveCurrentRecording">保存记录</button>
      <button class="action-btn" @click="deleteCurrentRecording" :disabled="!currentRecording">删除记录</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

interface BattleEvent {
  eventId: string;
  type: 'action' | 'state_change' | 'turn_start' | 'turn_end' | 'battle_start' | 'battle_end';
  timestamp: number;
  turn: number;
  data: any;
}

interface RecordedBattle {
  battleId: string;
  startTime: number;
  endTime?: number;
  winner?: string;
  events: BattleEvent[];
  initialState: {
    participants: Array<{
      id: string;
      name: string;
      type: string;
      maxHealth: number;
      currentHealth: number;
      maxEnergy: number;
      currentEnergy: number;
    }>;
  };
  savedAt?: number;
  name?: string;
}

const props = defineProps<{
  battleManager?: any;
}>();

const emit = defineEmits<{
  (e: 'replay-event', event: BattleEvent, index: number): void;
  (e: 'replay-start', recording: RecordedBattle): void;
  (e: 'replay-end', recording: RecordedBattle): void;
  (e: 'replay-pause', recording: RecordedBattle, index: number): void;
}>();

const currentRecording = ref<RecordedBattle | null>(null);
const currentEventIndex = ref(0);
const currentFrame = ref(0);
const isPlaying = ref(false);
const replaySpeed = ref(1);
const playInterval = ref<number | null>(null);
const timelineTrack = ref<HTMLElement | null>(null);
const zoomLevel = ref(1);
const filterType = ref('all');
const searchQuery = ref('');
const bookmarkedEvents = ref<Set<number>>(new Set());
const frameRate = ref(60);
const memoryUsage = ref(0);
const showPerformanceMonitor = ref(false);

const totalEvents = computed(() => {
  return currentRecording.value?.events.length || 0;
});

const totalFrames = computed(() => {
  // 假设每个事件包含10帧
  return (currentRecording.value?.events.length || 0) * 10;
});

const currentTurn = computed(() => {
  if (!currentRecording.value || currentEventIndex.value >= currentRecording.value.events.length) {
    return 0;
  }
  return currentRecording.value.events[currentEventIndex.value].turn;
});

const canReplay = computed(() => {
  return !!currentRecording.value && currentRecording.value.events.length > 0;
});

const canStepBack = computed(() => {
  return canReplay.value && currentEventIndex.value > 0;
});

const canStepForward = computed(() => {
  return canReplay.value && currentEventIndex.value < totalEvents.value - 1;
});

const visibleTurns = computed(() => {
  if (!currentRecording.value) return [];
  const turns = new Set<number>();
  currentRecording.value.events.forEach(event => {
    turns.add(event.turn);
  });
  return Array.from(turns).sort((a, b) => a - b);
});

const filteredEvents = computed(() => {
  if (!currentRecording.value) return [];
  
  let events = currentRecording.value.events;
  
  // 按类型过滤
  if (filterType.value !== 'all') {
    if (filterType.value === 'key') {
      events = events.filter(event => isKeyEvent(event));
    } else if (filterType.value === 'bookmarked') {
      events = events.filter((_, index) => isBookmarked(index));
    } else {
      events = events.filter(event => event.type === filterType.value);
    }
  }
  
  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    events = events.filter(event => 
      event.type.toLowerCase().includes(query) ||
      getEventDetails(event).toLowerCase().includes(query) ||
      event.turn.toString().includes(query)
    );
  }
  
  return events;
});

function loadRecording() {
  // 这里应该显示一个加载对话框，让用户选择要加载的记录
  console.log('加载记录');
  
  // 模拟加载一个记录
  if (props.battleManager) {
    const savedList = props.battleManager.getSavedBattleRecordingsList();
    if (savedList.length > 0) {
      const recording = props.battleManager.loadBattleRecording(savedList[0]);
      if (recording) {
        currentRecording.value = recording;
        currentEventIndex.value = 0;
        isPlaying.value = false;
        emit('replay-start', recording);
      }
    }
  }
}

function saveCurrentRecording() {
  if (currentRecording.value && props.battleManager) {
    const saveKey = props.battleManager.saveBattleRecording(currentRecording.value.battleId, currentRecording.value.name);
    console.log('保存记录:', saveKey);
  }
}

function deleteCurrentRecording() {
  if (currentRecording.value && props.battleManager) {
    const saveKey = `battle_recording_${currentRecording.value.battleId}`;
    const success = props.battleManager.deleteBattleRecording(saveKey);
    if (success) {
      currentRecording.value = null;
      currentEventIndex.value = 0;
      isPlaying.value = false;
    }
  }
}

function togglePlayPause() {
  if (!canReplay.value) return;
  
  if (isPlaying.value) {
    pauseReplay();
  } else {
    startReplay();
  }
}

function startReplay() {
  isPlaying.value = true;
  playNextEvent();
}

function pauseReplay() {
  isPlaying.value = false;
  if (playInterval.value) {
    clearInterval(playInterval.value);
    playInterval.value = null;
  }
  if (currentRecording.value) {
    emit('replay-pause', currentRecording.value, currentEventIndex.value);
  }
}

function playNextEvent() {
  if (!isPlaying.value || !canStepForward.value) {
    pauseReplay();
    if (currentRecording.value && currentEventIndex.value >= totalEvents.value - 1) {
      emit('replay-end', currentRecording.value);
    }
    return;
  }

  const delay = 1000 / replaySpeed.value;
  playInterval.value = window.setTimeout(() => {
    stepForward();
    playNextEvent();
  }, delay);
}

function stepBack() {
  if (!canStepBack.value) return;
  
  currentEventIndex.value--;
  // 更新当前帧到事件的开始帧
  currentFrame.value = currentEventIndex.value * 10;
  emitCurrentEvent();
}

function stepForward() {
  if (!canStepForward.value) return;
  
  currentEventIndex.value++;
  // 更新当前帧到事件的开始帧
  currentFrame.value = currentEventIndex.value * 10;
  emitCurrentEvent();
}

function goToStart() {
  if (!canReplay.value) return;
  
  currentEventIndex.value = 0;
  currentFrame.value = 0;
  emitCurrentEvent();
}

function goToEnd() {
  if (!canReplay.value) return;
  
  currentEventIndex.value = totalEvents.value - 1;
  currentFrame.value = totalFrames.value - 1;
  emitCurrentEvent();
}

function jumpToEvent(index: number) {
  if (!currentRecording.value || index < 0 || index >= totalEvents.value) return;
  
  currentEventIndex.value = index;
  // 更新当前帧到事件的开始帧
  currentFrame.value = index * 10;
  emitCurrentEvent();
}

function stepBackFrame() {
  if (!canReplay.value || currentFrame.value <= 0) return;
  
  currentFrame.value--;
  // 更新事件索引
  currentEventIndex.value = Math.floor(currentFrame.value / 10);
  emitCurrentEvent();
}

function stepForwardFrame() {
  if (!canReplay.value || currentFrame.value >= totalFrames.value - 1) return;
  
  currentFrame.value++;
  // 更新事件索引
  currentEventIndex.value = Math.floor(currentFrame.value / 10);
  emitCurrentEvent();
}

function jumpToFrame() {
  if (!currentRecording.value) return;
  
  // 确保帧索引在有效范围内
  currentFrame.value = Math.max(0, Math.min(currentFrame.value, totalFrames.value - 1));
  // 更新事件索引
  currentEventIndex.value = Math.floor(currentFrame.value / 10);
  emitCurrentEvent();
}

function setSpeed(speed: number) {
  replaySpeed.value = speed;
}

function emitCurrentEvent() {
  if (!currentRecording.value || currentEventIndex.value >= currentRecording.value.events.length) return;
  
  const event = currentRecording.value.events[currentEventIndex.value];
  emit('replay-event', event, currentEventIndex.value);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'action': '动作',
    'state_change': '状态变化',
    'turn_start': '回合开始',
    'turn_end': '回合结束',
    'battle_start': '战斗开始',
    'battle_end': '战斗结束'
  };
  return labels[type] || type;
}

function getEventSeverity(event: BattleEvent): string {
  if (event.type === 'battle_start' || event.type === 'battle_end') return 'high';
  if (event.type === 'action' && event.data?.action?.damage && event.data.action.damage > 100) return 'medium';
  return 'low';
}



function isBookmarked(index: number): boolean {
  return bookmarkedEvents.value.has(index);
}

function toggleBookmark(index: number): void {
  if (bookmarkedEvents.value.has(index)) {
    bookmarkedEvents.value.delete(index);
  } else {
    bookmarkedEvents.value.add(index);
  }
}

function inspectEvent(event: BattleEvent): void {
  console.log('详细查看事件:', event);
  // 这里可以打开一个模态框显示事件的详细信息
}

function zoomIn(): void {
  if (zoomLevel.value < 5) {
    zoomLevel.value += 0.5;
  }
}

function zoomOut(): void {
  if (zoomLevel.value > 0.5) {
    zoomLevel.value -= 0.5;
  }
}

function getCurrentState(): string {
  if (!currentRecording.value) return '未加载';
  if (currentEventIndex.value === 0) return '战斗开始';
  if (currentEventIndex.value >= totalEvents.value - 1) return '战斗结束';
  return `进行中 - 回合 ${currentTurn.value}`;
}

function getEventStats(): string {
  if (!currentRecording.value) return '无事件';
  const total = totalEvents.value;
  const keyEvents = currentRecording.value.events.filter(isKeyEvent).length;
  const bookmarked = bookmarkedEvents.value.size;
  return `总计: ${total}, 关键: ${keyEvents}, 标记: ${bookmarked}`;
}

function exportDebugData(): void {
  if (!currentRecording.value) return;
  
  const debugData = {
    recording: currentRecording.value,
    currentEventIndex: currentEventIndex.value,
    bookmarkedEvents: Array.from(bookmarkedEvents.value),
    exportTime: new Date().toISOString()
  };
  
  const dataStr = JSON.stringify(debugData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `battle_debug_${currentRecording.value.battleId}_${Date.now()}.json`;
  link.click();
}

function takeSnapshot(): void {
  // 这里可以保存当前战斗状态的快照
  console.log('保存快照');
}

function togglePerformanceMonitor(): void {
  showPerformanceMonitor.value = !showPerformanceMonitor.value;
  // 这里可以显示/隐藏性能监控面板
}


function getEventDetails(event: BattleEvent): string {
  switch (event.type) {
    case 'battle_start':
      return '战斗开始';
    case 'battle_end':
      return `战斗结束，胜利者: ${event.data.winner}`;
    case 'turn_start':
      return `回合开始，行动者: ${event.data.participantId}`;
    case 'turn_end':
      return '回合结束';
    case 'action':
      return `行动: ${event.data.action.type}，来源: ${event.data.action.sourceId}`;
    case 'state_change':
      return '状态变化';
    default:
      return '';
  }
}

function isKeyEvent(event: BattleEvent): boolean {
  // 定义关键事件类型
  const keyEventTypes = ['battle_start', 'battle_end'];
  
  // 检查是否是关键事件类型
  if (keyEventTypes.includes(event.type)) {
    return true;
  }
  
  // 检查是否是高伤害攻击
  if (event.type === 'action' && event.data.action.damage && event.data.action.damage > 500) {
    return true;
  }
  
  // 检查是否是技能释放
  if (event.type === 'action' && event.data.action.type === 'skill') {
    return true;
  }
  
  // 检查是否是状态变化
  if (event.type === 'state_change') {
    return true;
  }
  
  return false;
}

function cleanup() {
  if (playInterval.value) {
    clearInterval(playInterval.value);
    playInterval.value = null;
  }
}

onMounted(() => {
  // 初始化时加载最新的记录
  loadRecording();
});

onUnmounted(() => {
  cleanup();
});

watch(() => currentEventIndex.value, () => {
  // 当事件索引变化时，滚动时间轴
  if (timelineTrack.value) {
    const eventPosition = currentEventIndex.value * 20;
    const trackWidth = timelineTrack.value.clientWidth;
    const scrollPosition = Math.max(0, eventPosition - trackWidth / 2);
    timelineTrack.value.scrollLeft = scrollPosition;
  }
});
</script>

<style scoped>
@import './BattleArena.scss';
</style>