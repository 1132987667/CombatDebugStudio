/**
 * 参与者数据传输对象
 * 用于应用层与表现层之间的数据传递
 */
import type { ParticipantSide, SkillSet } from '@/domain/battle/types';

export interface ParticipantInfo {
  /** 鍙備笌鑰呭敮涓€鏍囪瘑绗?*/
  id: string
  /** 鍙備笌鑰呭悕绉?*/
  name: string
  /** 鍙備笌鑰呯被鍨嬶紙鎴戞柟/鏁屾柟锛?*/
  type: ParticipantSide
  /** 闃熶紞褰掑睘 */
  team: ParticipantSide
  /** 鏈€澶х敓鍛藉€?*/
  maxHealth: number
  /** 褰撳墠鐢熷懡鍊?*/
  currentHealth?: number
  /** 鏈€澶ц兘閲忓€?*/
  maxEnergy?: number
  /** 褰撳墠鑳介噺鍊硷紙鍒濆鍊?5锛?*/
  currentEnergy?: number
  /** 绛夌骇锛堚墺1锛?*/
  level: number
  /** 鏈€灏忔敾鍑诲姏锛堚墹鏈€澶ф敾鍑伙級 */
  minAttack: number
  /** 鏈€澶ф敾鍑诲姏锛堚墺鏈€灏忔敾鍑伙級 */
  maxAttack: number
  /** 闃插尽鍔涳紙鈮?锛?*/
  defense: number
  /** 閫熷害锛堚墺1锛?*/
  speed: number
  /** 鏆村嚮鐜囷紙鐧惧垎姣旓紝0-100锛岄粯璁?0锛?*/
  critRate?: number
  /** 鏆村嚮浼ゅ锛堢櫨鍒嗘瘮锛屸墺100锛岄粯璁?25锛?*/
  critDamage?: number
  /** 鍏嶄激鐜囷紙鐧惧垎姣旓紝0-100锛?*/
  damageReduction?: number
  /** 姘旇鍔犳垚锛堢櫨鍒嗘瘮锛屽彲姝ｅ彲璐燂級 */
  healthBonus?: number
  /** 鏀诲嚮鍔犳垚锛堢櫨鍒嗘瘮锛屽彲姝ｅ彲璐燂級 */
  attackBonus?: number
  /** 闃插尽鍔犳垚锛堢櫨鍒嗘瘮锛屽彲姝ｅ彲璐燂級 */
  defenseBonus?: number
  /** 閫熷害鍔犳垚锛堢櫨鍒嗘瘮锛屽彲姝ｅ彲璐燂級 */
  speedBonus?: number
  /** Buff瀹炰緥ID鍒楄〃 */
  buffs?: string[]
  /** 鎶€鑳介厤缃?*/
  skills?: SkillSet
}
