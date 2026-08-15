/**
 * 主角实体 ID 契约（演劫台阵容/战斗/调试全链路的固定 id）。
 * 主题"降妖者"是 playerParty 第一人，引擎内以该 id 识别主角；
 * SkillAltar/BattleZen 等按此 id 从战斗队伍定位主角，统一收口避免散落的魔法字符串。
 */
export const PLAYER_ID = 'player'
