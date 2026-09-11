import { useEffect, useState } from "react";
import "./App.css";
import Card from "./components/Card";
import PileRack from "./components/PileRack";
import ScoreTrack from "./components/ScoreTrack";
import { useGameRoom } from "./net/useGameRoom";
import { HAND_SIZE, other, TARGET } from "./game/engine";
import { handRange } from "./game/range";
import type { GamePhase, Seat } from "./game/types";

const GAME_TITLE = "Import BlackJack";

/** URL の ?room= を部屋IDにする。無ければ生成して URL に書き戻す。 */
function resolveRoom(): string {
  const params = new URLSearchParams(location.search);
  const existing = params.get("room");
  if (existing) return existing;

  const id = Math.random().toString(36).slice(2, 8);
  params.set("room", id);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  return id;
}

/** 相手の手番中、相手が何をしているのかを伝える */
function waitingFor(phase: GamePhase): string {
  switch (phase) {
    case "initial card selection":
      return "They're building their hand.";
    case "turn order decided":
      return "They're about to take a peek.";
    case "reveal card":
      return "They're choosing a card to turn over.";
    case "check or trade":
      return "They're deciding whether to swap.";
    case "trade":
      return "They're choosing a card to offer.";
    case "trade opponent card":
      return "They're choosing what to hand you.";
    default:
      return "";
  }
}

export default function App() {
  const [room] = useState(resolveRoom);
  const { view, seat, opponentConnected, status, error, send } = useGameRoom(room);
  const [pickedValue, setPickedValue] = useState<number | null>(null);
  const [pickedCard, setPickedCard] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // サーバー側の状態が進んだら選択をクリアする
  useEffect(() => {
    setPickedValue(null);
    setPickedCard(null);
  }, [view?.version]);

  useEffect(() => {
    if (!error) return;
    setToast(error.message);
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [error]);

  const copyInvite = () => {
    void navigator.clipboard?.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!view || seat === null) {
    return (
      <div className="app">
        <main className="splash">
          <h1 className="brand">{GAME_TITLE}</h1>
          <p className="splash-note">
            Connecting to room {room}. If this is the first visit in a while, the
            server takes a moment to wake up.
          </p>
        </main>
      </div>
    );
  }

  const me: Seat = view.me;
  const opp: Seat = other(me);
  const mine = view.players[me];
  const yours = view.players[opp];
  const myTurn = view.actor === null || view.actor === me;
  const myRange = handRange(mine.hand);
  const oppRange = handRange(yours.hand);
  const roomLeft = TARGET - myRange.known;
  const handsLocked =
    view.phase !== "not started" && view.phase !== "initial card selection";

  // どちらの手札から1枚選ぶフェーズなのか
  const pickTarget: "mine" | "opponent" | null = !myTurn
    ? null
    : view.phase === "reveal card"
      ? "opponent"
      : view.phase === "trade" || view.phase === "trade opponent card"
        ? "mine"
        : null;

  const confirmPick = () => {
    if (pickedCard === null) return;
    if (view.phase === "reveal card")
      send({ type: "reveal opponent card", index: pickedCard });
    else if (view.phase === "trade")
      send({ type: "choose own trade card", index: pickedCard });
    else if (view.phase === "trade opponent card")
      send({ type: "choose opponent trade card", index: pickedCard });
  };

  const iWon = view.winner === (me === 0 ? "player0" : "player1");

  const stage = () => {
    if (!myTurn && view.phase !== "finished") {
      return (
        <>
          <h2 className="stage-head">Waiting for your opponent</h2>
          <p className="stage-copy">{waitingFor(view.phase)}</p>
        </>
      );
    }

    switch (view.phase) {
      case "initial card selection":
        return (
          <>
            <h2 className="stage-head">
              Take four cards without passing {TARGET}
            </h2>
            <p className="stage-copy">
              {mine.hand.length} of {HAND_SIZE} taken · {roomLeft} left to spend
            </p>
            <PileRack
              pile={view.myPile}
              roomLeft={roomLeft}
              selected={pickedValue}
              onSelect={setPickedValue}
            />
            <div className="actions">
              <button
                className="primary"
                disabled={pickedValue === null}
                onClick={() => {
                  if (pickedValue === null) return;
                  send({
                    type: "confirm pile card",
                    index: view.myPile.indexOf(pickedValue),
                  });
                }}
              >
                Take card
              </button>
              <button
                className="ghost"
                disabled={mine.hand.length === 0}
                onClick={() => send({ type: "reset selection" })}
              >
                Start over
              </button>
            </div>
          </>
        );

      case "turn order decided":
        return (
          <>
            <h2 className="stage-head">
              {view.firstPlayer === me ? "You go first" : "Your opponent goes first"}
            </h2>
            <p className="stage-copy">
              Each player turns over one card in the other's hand.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => send({ type: "start revealing" })}>
                Take a peek
              </button>
            </div>
          </>
        );

      case "reveal card":
        return (
          <>
            <h2 className="stage-head">Turn over one of their cards</h2>
            <p className="stage-copy">
              Pick a face-down card above. Both of you will see it from now on.
            </p>
            <div className="actions">
              <button className="primary" disabled={pickedCard === null} onClick={confirmPick}>
                Turn it over
              </button>
            </div>
          </>
        );

      case "check or trade":
        return (
          <>
            <h2 className="stage-head">Check, or force a swap</h2>
            <p className="stage-copy">
              If you swap, you pick the card you give up — they pick the one you get.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => send({ type: "check" })}>
                Check
              </button>
              <button className="danger" onClick={() => send({ type: "trade" })}>
                Force a swap
              </button>
            </div>
          </>
        );

      case "trade":
        return (
          <>
            <h2 className="stage-head">Choose the card you'll give up</h2>
            <p className="stage-copy">
              Pick from your own hand below. You don't get to choose what comes back.
            </p>
            <div className="actions">
              <button className="primary" disabled={pickedCard === null} onClick={confirmPick}>
                Offer this card
              </button>
            </div>
          </>
        );

      case "trade opponent card":
        return (
          <>
            <h2 className="stage-head">They forced a swap</h2>
            <p className="stage-copy">
              Choose which of your cards to hand over. You'll get theirs in return.
            </p>
            <div className="actions">
              <button className="primary" disabled={pickedCard === null} onClick={confirmPick}>
                Hand it over
              </button>
            </div>
          </>
        );

      case "finished":
        return (
          <>
            <h2 className="stage-head" data-result={view.winner === "draw" ? "draw" : iWon ? "win" : "loss"}>
              {view.winner === "draw" ? "Draw" : iWon ? "You win" : "Your opponent wins"}
            </h2>
            <p className="stage-copy">
              {mine.sum} against {yours.sum}
            </p>
            <div className="actions">
              <button className="primary" onClick={() => send({ type: "restart" })}>
                Play again
              </button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="bar">
        <h1 className="brand">{GAME_TITLE}</h1>
        <div className="bar-side">
          <span className="conn" data-state={status}>
            {status === "open" ? `room ${room}` : "reconnecting"}
          </span>
          <button className="ghost small" onClick={copyInvite}>
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </div>
      </header>

      {view.phase === "not started" ? (
        <main className="lobby">
          <h2 className="lobby-head">
            Closest to {TARGET} wins.
            <br />
            Neither of you can see the whole board.
          </h2>
          <p className="lobby-copy">
            Take four cards from your own pile without passing {TARGET}. Turn over
            one card in your opponent's hand. Then check, or force a swap — you
            choose what you give up, they choose what you get.
          </p>

          <div className="invite">
            <span className="invite-url">{location.href}</span>
            <button className="ghost" onClick={copyInvite}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="actions">
            <button
              className="primary"
              disabled={!opponentConnected}
              onClick={() => send({ type: "start game" })}
            >
              Start game
            </button>
          </div>
          <p className="lobby-hint">
            {opponentConnected
              ? "Both seats are filled."
              : "Send that link to your opponent. This screen unlocks when they arrive."}
          </p>
        </main>
      ) : (
        <main className="table">
          <section className="side" data-active={view.actor === opp ? "true" : undefined}>
            <p className="who">
              Opponent
              <span className="who-state">
                {opponentConnected ? "" : "disconnected"}
              </span>
            </p>
            <div className="hand">
              {yours.hand.map((value, i) => {
                const alreadyOpen = yours.revealIndex.includes(i);
                const selectable = pickTarget === "opponent" && !alreadyOpen;
                return (
                  <Card
                    key={i}
                    value={value}
                    selectable={selectable}
                    selected={pickTarget === "opponent" && pickedCard === i}
                    onClick={selectable ? () => setPickedCard(pickedCard === i ? null : i) : undefined}
                  />
                );
              })}
            </div>
            {handsLocked && <ScoreTrack range={oppRange} tone="opponent" />}
          </section>

          <section className="stage" aria-live="polite">
            {stage()}
          </section>

          <section className="side" data-active={view.actor === me ? "true" : undefined}>
            {mine.hand.length > 0 && <ScoreTrack range={myRange} tone="you" />}
            <div className="hand">
              {mine.hand.map((value, i) => {
                const selectable = pickTarget === "mine";
                return (
                  <Card
                    key={i}
                    value={value}
                    seen={mine.revealIndex.includes(i)}
                    selectable={selectable}
                    selected={pickTarget === "mine" && pickedCard === i}
                    onClick={selectable ? () => setPickedCard(pickedCard === i ? null : i) : undefined}
                  />
                );
              })}
            </div>
            <p className="who">You</p>
          </section>
        </main>
      )}

      {toast && <p className="toast">{toast}</p>}
    </div>
  );
}
