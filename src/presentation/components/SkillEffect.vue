<!--
 * 文件: SkillEffect.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 技能效果组件
 * 描述: 显示技能施放效果，包括图标、名称和粒子特效
 * 版本: 1.0.0
-->

<template>
  <div class="skill-effect-container">
    <transition-group name="skill" tag="div" class="skill-effects">
      <div
        v-for="effect in effects"
        :key="effect.id"
        class="skill-effect"
        :class="[
          effect.type,
          effect.damageType,
          { 'high-intensity': effect.intensity && effect.intensity > 1 }
        ]"
        :style="{
          left: effect.position.x + 'px',
          top: effect.position.y + 'px',
          animationDuration: effect.duration + 'ms',
          animationDelay: effect.delay + 'ms',
          '--effect-intensity': effect.intensity || 1
        }"
        @animationend="removeEffect(effect.id)"
      >
        <div class="effect-content">
          <div class="effect-icon" v-if="effect.icon">{{ effect.icon }}</div>
          <div class="effect-name" v-if="effect.name">{{ effect.name }}</div>
          <div class="effect-particles" v-if="effect.showParticles">
            <div v-for="n in particleCount" :key="n" class="particle"></div>
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

export type SkillEffectType = 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate' | 'area' | 'projectile' | 'channel';
export type DamageType = 'physical' | 'magic' | 'fire' | 'ice' | 'lightning' | 'poison' | 'holy' | 'dark';

interface SkillEffectInfo {
  id: string;
  type: SkillEffectType;
  damageType?: DamageType;
  name?: string;
  icon?: string;
  position: { x: number; y: number };
  duration: number;
  delay: number;
  intensity?: number;
  showParticles?: boolean;
  particleCount?: number;
}

const props = defineProps<{
  position?: {
    x: number;
    y: number;
  };
}>();

const emit = defineEmits<{
  (e: 'effectEnd', effectId: string): void;
}>();

const effects = ref<SkillEffectInfo[]>([]);

let effectIdCounter = 0;

const particleCount = computed(() => Math.floor(Math.random() * 8) + 4);

const effectIcons: Record<DamageType, string> = {
  physical: '⚔️',
  magic: '✨',
  fire: '🔥',
  ice: '❄️',
  lightning: '⚡',
  poison: '☠️',
  holy: '✨',
  dark: '💀'
};

function addSkillEffect(
  type: SkillEffectType = 'attack', 
  damageType: DamageType = 'physical', 
  name?: string, 
  icon?: string, 
  position?: { x: number; y: number }, 
  duration: number = 1000, 
  delay: number = 0,
  intensity: number = 1,
  showParticles: boolean = true
) {
  const id = `skill_effect_${Date.now()}_${effectIdCounter++}`;
  
  effects.value.push({
    id,
    type,
    damageType,
    name,
    icon: icon || effectIcons[damageType],
    position: position || props.position || { x: 0, y: 0 },
    duration,
    delay,
    intensity,
    showParticles,
    particleCount: Math.floor(Math.random() * 8) + 4
  });
  
  return id;
}

function removeEffect(id: string) {
  const index = effects.value.findIndex(effect => effect.id === id);
  if (index > -1) {
    effects.value.splice(index, 1);
    emit('effectEnd', id);
  }
}

function clearEffects() {
  effects.value = [];
}

defineExpose({
  addSkillEffect,
  removeEffect,
  clearEffects
});
</script>

<style scoped>
.skill-effect-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.skill-effects {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.skill-effect {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  z-index: 1000;
}

/* 基础效果类型 */
.skill-effect.attack {
  background: radial-gradient(circle, rgba(255, 100, 100, 0.8) 0%, rgba(255, 100, 100, 0) 70%);
  animation: attackEffect 1s ease-out forwards;
}

.skill-effect.heal {
  background: radial-gradient(circle, rgba(100, 255, 100, 0.8) 0%, rgba(100, 255, 100, 0) 70%);
  animation: healEffect 1s ease-out forwards;
}

.skill-effect.buff {
  background: radial-gradient(circle, rgba(100, 100, 255, 0.8) 0%, rgba(100, 100, 255, 0) 70%);
  animation: buffEffect 1s ease-out forwards;
}

.skill-effect.debuff {
  background: radial-gradient(circle, rgba(255, 100, 255, 0.8) 0%, rgba(255, 100, 255, 0) 70%);
  animation: debuffEffect 1s ease-out forwards;
}

.skill-effect.ultimate {
  background: radial-gradient(circle, rgba(255, 255, 100, 0.8) 0%, rgba(255, 255, 100, 0) 70%);
  animation: ultimateEffect 1.5s ease-out forwards;
  box-shadow: 0 0 30px rgba(255, 255, 100, 0.8);
}

.skill-effect.area {
  background: radial-gradient(circle, rgba(200, 200, 200, 0.6) 0%, rgba(200, 200, 200, 0) 70%);
  animation: areaEffect 1.2s ease-out forwards;
}

.skill-effect.projectile {
  background: radial-gradient(circle, rgba(255, 200, 100, 0.8) 0%, rgba(255, 200, 100, 0) 70%);
  animation: projectileEffect 0.8s ease-out forwards;
}

.skill-effect.channel {
  background: radial-gradient(circle, rgba(100, 200, 255, 0.6) 0%, rgba(100, 200, 255, 0) 70%);
  animation: channelEffect 2s ease-out forwards;
}

/* 伤害类型效果 */
.skill-effect.physical {
  background: radial-gradient(circle, rgba(255, 107, 107, 0.8) 0%, rgba(255, 107, 107, 0) 70%);
  box-shadow: 0 0 20px rgba(255, 107, 107, 0.5);
}

.skill-effect.magic {
  background: radial-gradient(circle, rgba(156, 136, 255, 0.8) 0%, rgba(156, 136, 255, 0) 70%);
  box-shadow: 0 0 20px rgba(156, 136, 255, 0.5);
}

.skill-effect.fire {
  background: radial-gradient(circle, rgba(255, 123, 37, 0.8) 0%, rgba(255, 123, 37, 0) 70%);
  box-shadow: 0 0 25px rgba(255, 123, 37, 0.6);
}

.skill-effect.ice {
  background: radial-gradient(circle, rgba(116, 185, 255, 0.8) 0%, rgba(116, 185, 255, 0) 70%);
  box-shadow: 0 0 20px rgba(116, 185, 255, 0.5);
}

.skill-effect.lightning {
  background: radial-gradient(circle, rgba(254, 202, 87, 0.8) 0%, rgba(254, 202, 87, 0) 70%);
  box-shadow: 0 0 30px rgba(254, 202, 87, 0.7);
}

.skill-effect.poison {
  background: radial-gradient(circle, rgba(162, 155, 254, 0.8) 0%, rgba(162, 155, 254, 0) 70%);
  box-shadow: 0 0 20px rgba(162, 155, 254, 0.5);
}

.skill-effect.holy {
  background: radial-gradient(circle, rgba(253, 203, 110, 0.8) 0%, rgba(253, 203, 110, 0) 70%);
  box-shadow: 0 0 25px rgba(253, 203, 110, 0.6);
}

.skill-effect.dark {
  background: radial-gradient(circle, rgba(108, 92, 231, 0.8) 0%, rgba(108, 92, 231, 0) 70%);
  box-shadow: 0 0 20px rgba(108, 92, 231, 0.5);
}

/* 高强度效果 */
.skill-effect.high-intensity {
  filter: brightness(1.5);
  box-shadow: 0 0 40px rgba(255, 255, 255, 0.8);
}

.effect-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
}

.effect-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.effect-name {
  font-size: 14px;
}

.effect-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: white;
  border-radius: 50%;
  animation: particleFloat 1s ease-out forwards;
}

.particle:nth-child(1) { top: 20%; left: 20%; animation-delay: 0s; }
.particle:nth-child(2) { top: 30%; left: 70%; animation-delay: 0.1s; }
.particle:nth-child(3) { top: 60%; left: 30%; animation-delay: 0.2s; }
.particle:nth-child(4) { top: 70%; left: 80%; animation-delay: 0.3s; }
.particle:nth-child(5) { top: 40%; left: 10%; animation-delay: 0.4s; }
.particle:nth-child(6) { top: 10%; left: 60%; animation-delay: 0.5s; }
.particle:nth-child(7) { top: 80%; left: 40%; animation-delay: 0.6s; }
.particle:nth-child(8) { top: 50%; left: 90%; animation-delay: 0.7s; }

/* 动画效果 */
@keyframes attackEffect {
  0% {
    opacity: 1;
    transform: scale(0) rotate(0deg);
    width: 0;
    height: 0;
  }
  50% {
    opacity: 0.8;
    transform: scale(1.2) rotate(180deg);
    width: 100px;
    height: 100px;
  }
  100% {
    opacity: 0;
    transform: scale(2) rotate(360deg);
    width: 150px;
    height: 150px;
  }
}

@keyframes healEffect {
  0% {
    opacity: 1;
    transform: scale(0);
    width: 0;
    height: 0;
  }
  50% {
    opacity: 0.8;
    transform: scale(1.2);
    width: 120px;
    height: 120px;
  }
  100% {
    opacity: 0;
    transform: scale(1.8);
    width: 180px;
    height: 180px;
  }
}

@keyframes buffEffect {
  0% {
    opacity: 1;
    transform: scale(0) translateY(0);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.3) translateY(-20px);
  }
  100% {
    opacity: 0;
    transform: scale(1.6) translateY(-40px);
  }
}

@keyframes debuffEffect {
  0% {
    opacity: 1;
    transform: scale(0) rotate(0deg);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.4) rotate(180deg);
  }
  100% {
    opacity: 0;
    transform: scale(1.8) rotate(360deg);
  }
}

@keyframes ultimateEffect {
  0% {
    opacity: 1;
    transform: scale(0);
    filter: blur(0);
  }
  30% {
    opacity: 0.9;
    transform: scale(1.5);
    filter: blur(2px);
  }
  70% {
    opacity: 0.8;
    transform: scale(2);
    filter: blur(4px);
  }
  100% {
    opacity: 0;
    transform: scale(2.5);
    filter: blur(6px);
  }
}

@keyframes areaEffect {
  0% {
    opacity: 1;
    transform: scale(0);
    width: 0;
    height: 0;
  }
  50% {
    opacity: 0.7;
    transform: scale(1.5);
    width: 200px;
    height: 200px;
  }
  100% {
    opacity: 0;
    transform: scale(2);
    width: 250px;
    height: 250px;
  }
}

@keyframes projectileEffect {
  0% {
    opacity: 1;
    transform: translateX(-100px) scale(0.5);
  }
  50% {
    opacity: 0.9;
    transform: translateX(0) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translateX(100px) scale(0.8);
  }
}

@keyframes channelEffect {
  0% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
  100% {
    opacity: 0;
    transform: scale(1.2);
  }
}

@keyframes particleFloat {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(
      calc(var(--particle-x, 0) * 50px),
      calc(var(--particle-y, 0) * 50px)
    ) scale(0);
  }
}

.skill-enter-active,
.skill-leave-active {
  transition: all 0.3s ease;
}

.skill-enter-from,
.skill-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>