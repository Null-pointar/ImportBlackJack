import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { applyAction, createGameState } from "../src/game/engine";
import { toClientView } from "../src/game/view";
import type { GameState, Seat } from "../src/game/types";
import type { ClientMessage, ServerMessage } from "../src/game/protocol";

const PORT = Number(process.env.PORT ?? 8787);
/** 両者が切断してから部屋を破棄するまでの猶予（リロード・再接続用） */
const ROOM_TTL_MS = 5 * 60 * 1000;
/** 本番では自分のフロントのオリジンだけを許可する。空なら無制限（開発用） */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Room = {
  id: string;
  state: GameState;
  sockets: [WebSocket | null, WebSocket | null];
  disposeTimer: NodeJS.Timeout | null;
};

const rooms = new Map<string, Room>();

function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = { id, state: createGameState(), sockets: [null, null], disposeTimer: null };
    rooms.set(id, room);
  }
  if (room.disposeTimer) {
    clearTimeout(room.disposeTimer);
    room.disposeTimer = null;
  }
  return room;
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** その席から見える状態だけを1人に送る */
function sendState(room: Room, seat: Seat) {
  const socket = room.sockets[seat];
  if (!socket) return;
  send(socket, {
    type: "state",
    view: toClientView(room.state, seat),
    opponentConnected: room.sockets[seat === 0 ? 1 : 0] !== null,
  });
}

/** 各席に「その席から見える状態」だけを配る */
function broadcast(room: Room) {
  ([0, 1] as Seat[]).forEach((seat) => sendState(room, seat));
}

function bothConnected(room: Room) {
  return room.sockets[0] !== null && room.sockets[1] !== null;
}

// ── ビルド済みフロントの配信 ──────────────────────────────
// 本番は 1 サービスで完結させる。同一オリジンになるので
// VITE_WS_URL も ALLOWED_ORIGINS も設定不要になる。
// 開発中は Vite が 5173 で配信するので dist は使われない。
const CLIENT_DIR = resolve(process.cwd(), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveStatic(url: string, res: import("node:http").ServerResponse): boolean {
  if (!existsSync(CLIENT_DIR)) return false;

  const requested = decodeURIComponent(url.split("?")[0]);
  // ディレクトリ外への脱出を防ぐ
  const candidate = resolve(join(CLIENT_DIR, normalize(requested)));
  if (candidate !== CLIENT_DIR && !candidate.startsWith(CLIENT_DIR + sep)) {
    res.writeHead(403).end("forbidden");
    return true;
  }

  const isFile = existsSync(candidate) && statSync(candidate).isFile();
  // SPA なので未知のパスは index.html に落とす
  const filePath = isFile ? candidate : join(CLIENT_DIR, "index.html");
  if (!existsSync(filePath)) return false;

  const ext = extname(filePath);
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    // ファイル名にハッシュが付く assets だけ長期キャッシュ
    "cache-control": filePath.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(filePath).pipe(res);
  return true;
}

// Render などの PaaS はポートを掴んだ HTTP サーバーとヘルスチェックを要求するので、
// 素の WebSocketServer ではなく HTTP サーバーに載せる。
const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method === "GET" && serveStatic(req.url ?? "/", res)) return;

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket, request) => {
  // 他サイトに埋め込まれて勝手に接続されるのを防ぐ
  const origin = request.headers.origin ?? "";
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    socket.close(1008, "origin not allowed");
    return;
  }

  let room: Room | null = null;
  let seat: Seat | null = null;

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, { type: "error", message: "invalid JSON" });
      return;
    }

    if (message.type === "join") {
      if (room) {
        send(socket, { type: "error", message: "already joined" });
        return;
      }
      const id = String(message.room).slice(0, 32);
      if (!id) {
        send(socket, { type: "error", message: "room id required" });
        return;
      }

      const target = getRoom(id);
      const free: Seat | null =
        target.sockets[0] === null ? 0 : target.sockets[1] === null ? 1 : null;
      if (free === null) {
        send(socket, { type: "error", message: "This room already has two players." });
        socket.close();
        return;
      }

      room = target;
      seat = free;
      room.sockets[seat] = socket;
      send(socket, { type: "joined", room: room.id, seat });
      broadcast(room);
      return;
    }

    if (message.type === "action") {
      if (!room || seat === null) {
        send(socket, { type: "error", message: "join a room first" });
        return;
      }
      if (message.action.type === "start game" && !bothConnected(room)) {
        send(socket, { type: "error", message: "Waiting for a second player." });
        return;
      }
      // 連打や遅延で届いた「古い状態に対する操作」を弾く
      if (message.version !== room.state.version) {
        send(socket, { type: "error", message: "That tap arrived too late." });
        sendState(room, seat);
        return;
      }

      // 状態遷移はここだけ。不正な操作は engine が null を返して弾く。
      const next = applyAction(room.state, seat, message.action);
      if (!next) {
        send(socket, { type: "error", message: "That move isn't allowed right now." });
        sendState(room, seat);
        return;
      }
      room.state = next;
      broadcast(room);
      return;
    }
  });

  socket.on("close", () => {
    if (!room || seat === null) return;
    if (room.sockets[seat] === socket) room.sockets[seat] = null;

    const current = room;
    if (current.sockets[0] === null && current.sockets[1] === null) {
      current.disposeTimer = setTimeout(() => {
        if (current.sockets[0] === null && current.sockets[1] === null) {
          rooms.delete(current.id);
        }
      }, ROOM_TTL_MS);
    } else {
      broadcast(current);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`game server listening on http://localhost:${PORT} (ws path: /ws)`);
});