import { actorFor, other } from "./engine";
import type { GamePhase, GameState, Seat, Winner } from "./types";

/** null = 自分には見えないカード */
export type CardView = number | null;

export type PlayerView = {
  hand: CardView[];
  /** 相手に公開済みのインデックス（自分の手札なら「相手に知られている札」） */
  revealIndex: number[];
  /** 自分の合計、または決着後のみ相手の合計 */
  sum: number | null;
  pileCount: number;
};

export type ClientView = {
  version: number;
  phase: GamePhase;
  me: Seat;
  currentPlayer: Seat;
  firstPlayer: Seat;
  /** 今操作できるのは誰か。null = どちらでも可 */
  actor: Seat | null;
  players: [PlayerView, PlayerView];
  /** 自分の山札のみ */
  myPile: number[];
  cardCount: number;
  revealStep: number;
  countAction: number;
  /** 自分が差し出した札の index。相手には送らない */
  tradeIndex: number | null;
  winner: Winner;
};

/**
 * 完全情報の GameState から、seat から見えるぶんだけを抜き出す。
 * ここを通さずにクライアントへ送ると手札が丸見えになるので注意。
 */
export function toClientView(state: GameState, me: Seat): ClientView {
  const opp = other(me);
  const open = state.phase === "finished";

  const mine = state.players[me];
  const yours = state.players[opp];

  const myView: PlayerView = {
    hand: [...mine.hand],
    revealIndex: [...mine.revealIndex],
    sum: mine.sum,
    pileCount: mine.pile.length,
  };

  const yourView: PlayerView = {
    hand: yours.hand.map((value, i) =>
      open || yours.revealIndex.includes(i) ? value : null,
    ),
    revealIndex: [...yours.revealIndex],
    sum: open ? yours.sum : null,
    pileCount: yours.pile.length,
  };

  const players: [PlayerView, PlayerView] =
    me === 0 ? [myView, yourView] : [yourView, myView];

  return {
    version: state.version,
    phase: state.phase,
    me,
    currentPlayer: state.currentPlayer,
    firstPlayer: state.firstPlayer,
    actor: actorFor(state),
    players,
    myPile: [...mine.pile],
    cardCount: state.cardCount,
    revealStep: state.revealStep,
    countAction: state.countAction,
    tradeIndex: state.currentPlayer === me ? state.tradeIndex : null,
    winner: state.winner,
  };
}
