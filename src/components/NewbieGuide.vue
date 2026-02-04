<template>
  <div class="newbie-guide" :class="{ 'active': isActive }">
    <div class="guide-overlay" @click="nextStep"></div>
    
    <div class="guide-content" :class="'step-' + currentStep">
      <div class="step-indicator">
        <span class="step-number">{{ currentStep }}/{{ totalSteps }}</span>
        <div class="step-progress">
          <div 
            class="step-progress-bar"
            :style="{ width: (currentStep / totalSteps) * 100 + '%' }"
          ></div>
        </div>
      </div>

      <div class="guide-step" v-if="currentStep === 1">
        <h3>欢迎来到战斗调试工作室！</h3>
        <p>本教程将帮助你快速了解游戏的基本操作和战斗系统。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">开始教程</button>
          <button class="action-btn" @click="skipGuide">跳过</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 2">
        <h3>基本攻击操作</h3>
        <p>使用 <span class="key-hint">{{ attackKey }}</span> 键进行普通攻击，这是最基础的攻击方式。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">下一步</button>
          <button class="action-btn" @click="prevStep">上一步</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 3">
        <h3>技能释放</h3>
        <p>使用 <span class="key-hint">{{ skillKey }}</span> 键释放技能，技能会造成更多伤害或提供特殊效果。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">下一步</button>
          <button class="action-btn" @click="prevStep">上一步</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 4">
        <h3>防御与物品</h3>
        <p>使用 <span class="key-hint">{{ defendKey }}</span> 键进行防御，减少受到的伤害。</p>
        <p>使用 <span class="key-hint">{{ itemKey }}</span> 键使用物品，恢复生命值或提供增益效果。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">下一步</button>
          <button class="action-btn" @click="prevStep">上一步</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 5">
        <h3>战斗回放与调试</h3>
        <p>使用 <span class="key-hint">{{ replayKey }}</span> 键打开战斗回放界面，查看战斗过程。</p>
        <p>使用 <span class="key-hint">{{ debugKey }}</span> 键进入调试模式，逐帧分析战斗。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">下一步</button>
          <button class="action-btn" @click="prevStep">上一步</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 6">
        <h3>快捷键设置</h3>
        <p>使用 <span class="key-hint">H</span> 键打开快捷键提示面板，查看当前的快捷键设置。</p>
        <p>你可以在设置中自定义快捷键，以适应你的操作习惯。</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="nextStep">下一步</button>
          <button class="action-btn" @click="prevStep">上一步</button>
        </div>
      </div>

      <div class="guide-step" v-else-if="currentStep === 7">
        <h3>教程完成！</h3>
        <p>你已经了解了游戏的基本操作和战斗系统。现在可以开始你的战斗调试之旅了！</p>
        <div class="guide-image">
        </div>
        <div class="guide-actions">
          <button class="action-btn primary" @click="finishGuide">开始游戏</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { keybindManager } from '@/core/input/KeybindManager';

const isActive = ref(false);
const currentStep = ref(1);
const totalSteps = ref(7);

// 计算当前的快捷键
const attackKey = computed(() => keybindManager.getKeybind('attack'));
const skillKey = computed(() => keybindManager.getKeybind('skill'));
const defendKey = computed(() => keybindManager.getKeybind('defend'));
const itemKey = computed(() => keybindManager.getKeybind('item'));
const replayKey = computed(() => keybindManager.getKeybind('replay'));
const debugKey = computed(() => keybindManager.getKeybind('debug'));

// 开始教程
function startGuide() {
  isActive.value = true;
  currentStep.value = 1;
  // 保存教程完成状态
  localStorage.setItem('newbieGuideCompleted', 'false');
}

// 下一步
function nextStep() {
  if (currentStep.value < totalSteps.value) {
    currentStep.value++;
  } else {
    finishGuide();
  }
}

// 上一步
function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

// 跳过教程
function skipGuide() {
  finishGuide();
}

// 完成教程
function finishGuide() {
  isActive.value = false;
  // 保存教程完成状态
  localStorage.setItem('newbieGuideCompleted', 'true');
}

// 检查是否需要显示教程
function checkShowGuide() {
  const guideCompleted = localStorage.getItem('newbieGuideCompleted');
  if (guideCompleted !== 'true') {
    // 延迟显示，确保页面加载完成
    setTimeout(() => {
      startGuide();
    }, 1000);
  }
}

onMounted(() => {
  checkShowGuide();
});

// 暴露方法给父组件
defineExpose({
  startGuide,
  finishGuide
});
</script>

<style scoped>
.newbie-guide {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
}

.newbie-guide.active {
  opacity: 1;
  visibility: visible;
}

.guide-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  cursor: pointer;
}

.guide-content {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 50px auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: slideIn 0.5s ease;
}

@keyframes slideIn {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.step-indicator {
  padding: 15px 20px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.step-number {
  display: block;
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
}

.step-progress {
  width: 100%;
  height: 6px;
  background: #ddd;
  border-radius: 3px;
  overflow: hidden;
}

.step-progress-bar {
  height: 100%;
  background: #2196F3;
  border-radius: 3px;
  transition: width 0.5s ease;
}

.guide-step {
  padding: 30px;
  text-align: center;
}

.guide-step h3 {
  margin: 0 0 20px 0;
  color: #333;
}

.guide-step p {
  margin: 0 0 15px 0;
  color: #666;
  line-height: 1.5;
}

.key-hint {
  display: inline-block;
  padding: 2px 8px;
  background: #2196F3;
  color: white;
  border-radius: 4px;
  font-weight: bold;
  margin: 0 2px;
}

.guide-image {
  margin: 20px 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.guide-image img {
  width: 100%;
  height: auto;
  display: block;
}

.guide-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.action-btn {
  padding: 10px 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f0f0f0;
}

.action-btn.primary {
  background: #2196F3;
  color: white;
  border-color: #2196F3;
}

.action-btn.primary:hover {
  background: #1976D2;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 5px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .guide-content {
    margin: 20px;
    max-width: none;
  }
  
  .guide-step {
    padding: 20px;
  }
  
  .guide-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .action-btn {
    width: 100%;
    max-width: 200px;
  }
}
</style>
