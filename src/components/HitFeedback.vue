<template>
  <div class="hit-feedback-container">
    <transition-group name="hit" tag="div" class="hit-effects">
      <div
        v-for="hit in hits"
        :key="hit.id"
        class="hit-effect"
        :class="[
          hit.type,
          hit.damageType,
          { 'critical': hit.isCritical, 'stun': hit.isStun, 'combo': hit.isCombo }
        ]"
        :style="{
          left: hit.position.x + 'px',
          top: hit.position.y + 'px',
          animationDuration: hit.duration + 'ms',
          animationDelay: hit.delay + 'ms',
          '--hit-intensity': hit.intensity || 1
        }"
        @animationend="removeHit(hit.id)"
      >
        <div class="hit-content">
          <div class="hit-flash" v-if="hit.showFlash"></div>
          <div class="hit-shake" v-if="hit.showShake"></div>
          <div class="hit-stun" v-if="hit.isStun">
            <div class="stun-rings">
              <div class="ring ring-1"></div>
              <div class="ring ring-2"></div>
              <div class="ring ring-3"></div>
            </div>
          </div>
          <div class="hit-particles" v-if="hit.showParticles">
            <div v-for="n in hit.particleCount" :key="n" class="particle"></div>
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

export type HitType = 'damage' | 'heal' | 'block' | 'dodge' | 'parry';
export type DamageType = 'physical' | 'magic' | 'fire' | 'ice' | 'lightning' | 'poison' | 'holy' | 'dark';

interface HitInfo {
  id: string;
  type: HitType;
  damageType?: DamageType;
  position: { x: number; y: number };
  duration: number;
  delay: number;
  intensity: number;
  isCritical: boolean;
  isStun: boolean;
  isCombo: boolean;
  showFlash: boolean;
  showShake: boolean;
  showParticles: boolean;
  particleCount: number;
}

const props = defineProps<{
  position?: {
    x: number;
    y: number;
  };
}>();

const emit = defineEmits<{
  (e: 'hitEnd', hitId: string): void;
}>();

const hits = ref<HitInfo[]>([]);

let hitIdCounter = 0;

function addHit(
  type: HitType = 'damage',
  damageType: DamageType = 'physical',
  position?: { x: number; y: number },
  duration: number = 800,
  delay: number = 0,
  intensity: number = 1,
  isCritical: boolean = false,
  isStun: boolean = false,
  isCombo: boolean = false,
  showFlash: boolean = true,
  showShake: boolean = true,
  showParticles: boolean = true
) {
  const id = `hit_${Date.now()}_${hitIdCounter++}`;
  
  hits.value.push({
    id,
    type,
    damageType,
    position: position || props.position || { x: 0, y: 0 },
    duration,
    delay,
    intensity,
    isCritical,
    isStun,
    isCombo,
    showFlash,
    showShake,
    showParticles,
    particleCount: Math.floor(Math.random() * 6) + 3
  });
  
  return id;
}

function removeHit(id: string) {
  const index = hits.value.findIndex(hit => hit.id === id);
  if (index > -1) {
    hits.value.splice(index, 1);
    emit('hitEnd', id);
  }
}

function clearHits() {
  hits.value = [];
}

defineExpose({
  addHit,
  removeHit,
  clearHits
});
</script>

<style scoped>
.hit-feedback-container {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.hit-effects {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hit-effect {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  z-index: 900;
}

/* 命中类型样式 */
.hit-effect.damage {
  animation: damageHit 0.8s ease-out forwards;
}

.hit-effect.heal {
  animation: healHit 0.8s ease-out forwards;
}

.hit-effect.block {
  animation: blockHit 0.6s ease-out forwards;
}

.hit-effect.dodge {
  animation: dodgeHit 0.5s ease-out forwards;
}

.hit-effect.parry {
  animation: parryHit 0.7s ease-out forwards;
}

/* 伤害类型颜色 */
.hit-effect.physical .hit-flash { background: radial-gradient(circle, rgba(255, 107, 107, 0.8) 0%, rgba(255, 107, 107, 0) 70%); }
.hit-effect.magic .hit-flash { background: radial-gradient(circle, rgba(156, 136, 255, 0.8) 0%, rgba(156, 136, 255, 0) 70%); }
.hit-effect.fire .hit-flash { background: radial-gradient(circle, rgba(255, 123, 37, 0.8) 0%, rgba(255, 123, 37, 0) 70%); }
.hit-effect.ice .hit-flash { background: radial-gradient(circle, rgba(116, 185, 255, 0.8) 0%, rgba(116, 185, 255, 0) 70%); }
.hit-effect.lightning .hit-flash { background: radial-gradient(circle, rgba(254, 202, 87, 0.8) 0%, rgba(254, 202, 87, 0) 70%); }
.hit-effect.poison .hit-flash { background: radial-gradient(circle, rgba(162, 155, 254, 0.8) 0%, rgba(162, 155, 254, 0) 70%); }
.hit-effect.holy .hit-flash { background: radial-gradient(circle, rgba(253, 203, 110, 0.8) 0%, rgba(253, 203, 110, 0) 70%); }
.hit-effect.dark .hit-flash { background: radial-gradient(circle, rgba(108, 92, 231, 0.8) 0%, rgba(108, 92, 231, 0) 70%); }

/* 命中效果组件 */
.hit-flash {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  animation: hitFlash 0.3s ease-out forwards;
}

.hit-shake {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  animation: hitShake 0.4s ease-out forwards;
}

.hit-stun {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  animation: stunEffect 0.8s ease-out forwards;
}

.stun-rings {
  position: relative;
  width: 100%;
  height: 100%;
}

.ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.ring-1 {
  width: 60%;
  height: 60%;
  animation: ringPulse 0.8s ease-out 0s infinite;
}

.ring-2 {
  width: 80%;
  height: 80%;
  animation: ringPulse 0.8s ease-out 0.2s infinite;
}

.ring-3 {
  width: 100%;
  height: 100%;
  animation: ringPulse 0.8s ease-out 0.4s infinite;
}

.hit-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: white;
  border-radius: 50%;
  animation: particleBurst 0.6s ease-out forwards;
}

/* 关键帧动画 */
@keyframes damageHit {
  0% {
    opacity: 1;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.2);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}

@keyframes healHit {
  0% {
    opacity: 1;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
  100% {
    opacity: 0;
    transform: scale(1.3);
  }
}

@keyframes blockHit {
  0% {
    opacity: 1;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.1);
  }
  100% {
    opacity: 0;
    transform: scale(1.2);
  }
}

@keyframes dodgeHit {
  0% {
    opacity: 1;
    transform: translateX(0) scale(0.8);
  }
  50% {
    opacity: 0.8;
    transform: translateX(20px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateX(40px) scale(1.2);
  }
}

@keyframes parryHit {
  0% {
    opacity: 1;
    transform: scale(0.8) rotate(0deg);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.1) rotate(180deg);
  }
  100% {
    opacity: 0;
    transform: scale(1.3) rotate(360deg);
  }
}

@keyframes hitFlash {
  0% {
    opacity: 1;
    transform: scale(0);
  }
  50% {
    opacity: 0.8;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.2);
  }
}

@keyframes hitShake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes stunEffect {
  0% {
    opacity: 1;
    filter: brightness(1);
  }
  50% {
    opacity: 0.8;
    filter: brightness(1.5);
  }
  100% {
    opacity: 0;
    filter: brightness(1);
  }
}

@keyframes ringPulse {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.4);
  }
}

@keyframes particleBurst {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(
      calc((var(--particle-x, 0) - 0.5) * 60px),
      calc((var(--particle-y, 0) - 0.5) * 60px)
    ) scale(0);
  }
}

/* 暴击效果 */
.hit-effect.critical {
  filter: brightness(1.3);
}

.hit-effect.critical .hit-flash {
  animation: criticalHitFlash 0.4s ease-out forwards;
}

@keyframes criticalHitFlash {
  0% {
    opacity: 1;
    transform: scale(0);
  }
  30% {
    opacity: 0.9;
    transform: scale(1.5);
  }
  70% {
    opacity: 0.7;
    transform: scale(1.8);
  }
  100% {
    opacity: 0;
    transform: scale(2);
  }
}

/* 连击效果 */
.hit-effect.combo {
  animation: comboHit 0.6s ease-out forwards;
}

@keyframes comboHit {
  0% {
    opacity: 1;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.3);
  }
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

.hit-enter-active,
.hit-leave-active {
  transition: all 0.3s ease;
}

.hit-enter-from,
.hit-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>