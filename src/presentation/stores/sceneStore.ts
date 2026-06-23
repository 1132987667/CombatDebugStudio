import { defineStore } from 'pinia';
import type { SceneData } from '@/types';

interface SceneState {
  savedScenes: string[];
  selectedScene: string;
  sceneName: string;
}

export const useSceneStore = defineStore('scene', {
  state: (): SceneState => ({
    savedScenes: [],
    selectedScene: '',
    sceneName: '',
  }),

  getters: {
    /**
     * 获取保存的场景列表
     */
    getSavedScenes: (state): string[] => {
      return state.savedScenes;
    },

    /**
     * 获取当前选中的场景
     */
    getSelectedScene: (state): string => {
      return state.selectedScene;
    },

    /**
     * 获取场景名称
     */
    getSceneName: (state): string => {
      return state.sceneName;
    },
  },

  actions: {
    /**
     * 设置保存的场景列表
     */
    setSavedScenes(scenes: string[]) {
      this.savedScenes = scenes;
    },

    /**
     * 设置选中的场景
     */
    setSelectedScene(scene: string) {
      this.selectedScene = scene;
    },

    /**
     * 设置场景名称
     */
    setSceneName(name: string) {
      this.sceneName = name;
    },

    /**
     * 保存场景
     */
    saveScene(sceneName: string) {
      if (!sceneName) return;
      if (!this.savedScenes.includes(sceneName)) {
        this.savedScenes.push(sceneName);
      }
    },

    /**
     * 加载场景
     */
    loadScene(sceneName: string) {
      this.selectedScene = sceneName;
    },

    /**
     * 删除场景
     */
    deleteScene(sceneName: string) {
      const index = this.savedScenes.indexOf(sceneName);
      if (index > -1) {
        this.savedScenes.splice(index, 1);
        if (this.selectedScene === sceneName) {
          this.selectedScene = '';
        }
      }
    },

    /**
     * 清空所有场景
     */
    clearScenes() {
      this.savedScenes = [];
      this.selectedScene = '';
      this.sceneName = '';
    },
  },
});
