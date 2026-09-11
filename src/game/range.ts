import { TARGET } from "./engine";
import type { CardView } from "./view";

export type HandRange = {
  /** 見えているカードの合計 */
  known: number;
  /** 見えていない枚数 */
  hidden: number;
  /** ありうる最小値（隠れたカードは最低1） */
  min: number;
  /** ありうる最大値（隠れたカードは最大10、ただし上限は21） */
  max: number;
  /** 全部見えている＝確定値かどうか */
  exact: boolean;
};

/**
 * 手札の見え方から「ありうる合計の幅」を出す。
 * 相手の合計そのものはサーバーから送られてこないので、
 * 公開済みのカードだけを根拠にクライアント側で推定する。
 */
export function handRange(hand: CardView[]): HandRange {
  let known = 0;
  let hidden = 0;
  for (const card of hand) {
    if (card === null) hidden += 1;
    else known += card;
  }
  return {
    known,
    hidden,
    min: known + hidden,
    max: hidden === 0 ? known : Math.min(TARGET, known + hidden * 10),
    exact: hidden === 0,
  };
}
