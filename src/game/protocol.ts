import type { Action, Seat } from "./types";
import type { ClientView } from "./view";

export type ClientMessage =
  | { type: "join"; room: string }
  | { type: "action"; version: number; action: Action };

export type ServerMessage =
  | { type: "joined"; room: string; seat: Seat }
  | { type: "state"; view: ClientView; opponentConnected: boolean }
  | { type: "error"; message: string };
