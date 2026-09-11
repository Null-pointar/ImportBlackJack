import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, Seat } from "../game/types";
import type { ClientMessage, ServerMessage } from "../game/protocol";
import type { ClientView } from "../game/view";

export type ConnectionStatus = "connecting" | "open" | "closed";

/** 同じ文面が連続しても再表示できるように id を持たせる */
export type RoomError = { message: string; id: number };

function wsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

export function useGameRoom(room: string) {
  const [view, setView] = useState<ClientView | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<RoomError | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  /** 最後に受け取った状態のバージョン。古い操作を送らないための照合用 */
  const versionRef = useRef(0);

  useEffect(() => {
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("open");
        setError(null);
        const join: ClientMessage = { type: "join", room };
        socket.send(JSON.stringify(join));
      };

      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "joined") {
          setSeat(message.seat);
        } else if (message.type === "state") {
          versionRef.current = message.view.version;
          setView(message.view);
          setOpponentConnected(message.opponentConnected);
        } else if (message.type === "error") {
          setError({ message: message.message, id: Date.now() + Math.random() });
        }
      };

      socket.onclose = () => {
        setStatus("closed");
        if (!closedByUs) retry = setTimeout(connect, 1000);
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [room]);

  const send = useCallback((action: Action) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = {
      type: "action",
      version: versionRef.current,
      action,
    };
    socket.send(JSON.stringify(message));
  }, []);

  return { view, seat, opponentConnected, status, error, send };
}
