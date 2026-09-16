import type {
  Action,
  GameState,
  PlayerState,
  Seat,
  Winner,
} from "./types";

export const TARGET = 21;
export const HAND_SIZE = 4;
const FULL_PILE = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10];

export function other(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

function newPlayer(): PlayerState {
  return { hand: [], sum: 0, pile: [...FULL_PILE], revealIndex: [] };
}

export function createGameState(): GameState {
  return {
    version: 0,
    phase: "not started",
    players: [newPlayer(), newPlayer()],
    currentPlayer: 0,
    firstPlayer: 0,
    cardCount: 0,
    revealStep: 0,
    countAction: 0,
    tradeIndex: null,
    winner: "none",
  };
}

/**
 * 現在そのフェーズで操作できるプレイヤー。
 * null = どちらでも可（開始・リスタート）。
 * 注意: "trade opponent card" は「差し出す側」ではなく相手が選ぶ。
 */
export function actorFor(state: GameState): Seat | null {
  switch (state.phase) {
    case "not started":
    case "finished":
      return null;
    case "trade opponent card":
      return other(state.currentPlayer);
    default:
      return state.currentPlayer;
  }
}

function replacePlayer(
  players: [PlayerState, PlayerState],
  seat: Seat,
  next: PlayerState,
): [PlayerState, PlayerState] {
  return seat === 0 ? [next, players[1]] : [players[0], next];
}

export function judge(players: [PlayerState, PlayerState]): Winner {
  const a = players[0].sum;
  const b = players[1].sum;
  const outA = a > TARGET;
  const outB = b > TARGET;

  if (outA && outB) return "draw";
  if (outA) return "player1";
  if (outB) return "player0";
  if (a > b) return "player0";
  if (b > a) return "player1";
  return "draw";
}

/** check / trade を1回消化したあとの遷移 */
function advance(state: GameState, countAction: number): GameState {
  if (countAction === 1) {
    return {
      ...state,
      countAction,
      currentPlayer: other(state.currentPlayer),
      phase: "check or trade",
    };
  }
  return {
    ...state,
    countAction,
    winner: judge(state.players),
    phase: "finished",
  };
}

/**
 * 唯一の状態遷移関数。
 * 不正な操作（手番違い・フェーズ違い・範囲外）は null を返して無視する。
 */
export function applyAction(
  state: GameState,
  seat: Seat,
  action: Action,
): GameState | null {
  const next = reduce(state, seat, action);
  return next ? { ...next, version: state.version + 1 } : null;
}

function reduce(
  state: GameState,
  seat: Seat,
  action: Action,
): GameState | null {
  const actor = actorFor(state);
  if (actor !== null && actor !== seat) return null;

  switch (action.type) {
    case "start game": {
      if (state.phase !== "not started") return null;
      return { ...createGameState(), phase: "initial card selection" };
    }

    case "restart": {
      if (state.phase !== "finished") return null;
      return createGameState();
    }

    case "confirm pile card": {
      if (state.phase !== "initial card selection") return null;
      const seatNow = state.currentPlayer;
      const p = state.players[seatNow];
      const value = p.pile[action.index];
      if (value === undefined) return null;
      if (p.sum + value > TARGET) return null;

      const pile = [...p.pile];
      pile.splice(action.index, 1);
      const players = replacePlayer(state.players, seatNow, {
        hand: [...p.hand, value],
        sum: p.sum + value,
        pile,
        revealIndex: [],
      });

      const cardCount = state.cardCount + 1;
      if (cardCount < HAND_SIZE) {
        return { ...state, players, cardCount };
      }
      if (seatNow === 0) {
        return { ...state, players, cardCount: 0, currentPlayer: 1 };
      }

      // 両者が4枚選び終わった → 先手をサーバー側で抽選
      const firstPlayer: Seat = Math.random() < 0.5 ? 0 : 1;
      return {
        ...state,
        players,
        cardCount: 0,
        firstPlayer,
        currentPlayer: firstPlayer,
        revealStep: 0,
        phase: "turn order decided",
      };
    }

    case "reset selection": {
      if (state.phase !== "initial card selection") return null;
      const seatNow = state.currentPlayer;
      const p = state.players[seatNow];
      const players = replacePlayer(state.players, seatNow, {
        hand: [],
        sum: 0,
        pile: [...p.hand, ...p.pile].sort((x, y) => x - y),
        revealIndex: [],
      });
      return { ...state, players, cardCount: 0 };
    }

    case "start revealing": {
      if (state.phase !== "turn order decided") return null;
      return { ...state, phase: "reveal card" };
    }

    case "reveal opponent card": {
      if (state.phase !== "reveal card") return null;
      const opp = other(state.currentPlayer);
      const target = state.players[opp];
      if (action.index < 0 || action.index >= target.hand.length) return null;
      if (target.revealIndex.includes(action.index)) return null;

      const players = replacePlayer(state.players, opp, {
        ...target,
        revealIndex: [...target.revealIndex, action.index],
      });

      if (state.revealStep === 0) {
        return { ...state, players, revealStep: 1, currentPlayer: opp };
      }
      return {
        ...state,
        players,
        currentPlayer: state.firstPlayer,
        phase: "check or trade",
      };
    }

    case "check": {
      if (state.phase !== "check or trade") return null;
      return advance(state, state.countAction + 1);
    }

    case "trade": {
      if (state.phase !== "check or trade") return null;
      return { ...state, phase: "trade" };
    }

    case "choose own trade card": {
      if (state.phase !== "trade") return null;
      const hand = state.players[state.currentPlayer].hand;
      if (action.index < 0 || action.index >= hand.length) return null;
      return { ...state, tradeIndex: action.index, phase: "trade opponent card" };
    }

    case "choose opponent trade card": {
      if (state.phase !== "trade opponent card") return null;
      if (state.tradeIndex === null) return null;

      const cur = state.currentPlayer;
      const opp = other(cur);
      const myIndex = state.tradeIndex;
      const oppIndex = action.index;

      const me = state.players[cur];
      const you = state.players[opp];
      const myCard = me.hand[myIndex];
      const oppCard = you.hand[oppIndex];
      if (myCard === undefined || oppCard === undefined) return null;

      const myHand = [...me.hand];
      myHand[myIndex] = oppCard;
      const yourHand = [...you.hand];
      yourHand[oppIndex] = myCard;

      // 交換したカードは、公開されていたかどうかに関係なく双方に知られる。
      // 自分が差し出した札の値は自分が見ているし、相手が差し出した札の値は
      // 相手が見ている。つまり交換後はお互いに相手の1枚を確実に特定できる。
      const myReveal = [
        ...me.revealIndex.filter((i) => i !== myIndex),
        myIndex,
      ];
      const yourReveal = [
        ...you.revealIndex.filter((i) => i !== oppIndex),
        oppIndex,
      ];

      let players = replacePlayer(state.players, cur, {
        ...me,
        hand: myHand,
        sum: me.sum - myCard + oppCard,
        revealIndex: myReveal,
      });
      players = replacePlayer(players, opp, {
        ...you,
        hand: yourHand,
        sum: you.sum - oppCard + myCard,
        revealIndex: yourReveal,
      });

      return advance(
        { ...state, players, tradeIndex: null },
        state.countAction + 1,
      );
    }

    default:
      return null;
  }
}