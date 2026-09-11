// サーバー・クライアント共有の型定義。
// ここには「正しい状態（サーバーだけが持つ完全な情報）」の形を書く。

export type Seat = 0 | 1;

export type GamePhase =
  | "not started"
  | "initial card selection"
  | "turn order decided"
  | "reveal card"
  | "check or trade"
  | "trade"
  | "trade opponent card"
  | "finished";

export type Winner = "none" | "draw" | "player0" | "player1";

export type PlayerState = {
  hand: number[];
  sum: number;
  pile: number[];
  /** 相手に公開済みの手札インデックス（このプレイヤーの hand に対する index） */
  revealIndex: number[];
};

/** 完全情報。サーバーのみが保持する。クライアントには絶対にそのまま送らない。 */
export type GameState = {
  /** 状態のバージョン。遷移ごとに +1。古い操作（連打・遅延）を弾くために使う */
  version: number;
  phase: GamePhase;
  players: [PlayerState, PlayerState];
  currentPlayer: Seat;
  firstPlayer: Seat;
  /** 初期カード選択で現在のプレイヤーが何枚選んだか */
  cardCount: number;
  /** 公開フェーズの進行（0 = 一人目、1 = 二人目） */
  revealStep: number;
  /** check / trade が何回行われたか */
  countAction: number;
  /** trade で currentPlayer が差し出した手札の index */
  tradeIndex: number | null;
  winner: Winner;
};

export type Action =
  | { type: "start game" }
  | { type: "confirm pile card"; index: number }
  | { type: "reset selection" }
  | { type: "start revealing" }
  | { type: "reveal opponent card"; index: number }
  | { type: "check" }
  | { type: "trade" }
  | { type: "choose own trade card"; index: number }
  | { type: "choose opponent trade card"; index: number }
  | { type: "restart" };
