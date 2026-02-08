/**
 * 场景数据接口定义
 */

export interface SceneData {
  id: string
  name: string
  background: string
  difficulties: {
    easy: { enemyIds: string[] }
    normal: { enemyIds: string[] }
    hard: { enemyIds: string[] }
  }
  requiredLevel: number
  rewards: {
    exp: number
    gold: number
  }
}
