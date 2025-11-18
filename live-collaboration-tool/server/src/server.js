import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || 7071;
const app = express();
app.use(cors());

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "lct-realtime-server", version: "0.1.0" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// 문서별 룸 관리
const rooms = new Map(); // documentId -> Set<ws>
// presence 관리 (간단 버전)
const presence = new Map(); // documentId -> Map<clientId, { clientId, user: { id, name }, lastSeen }>

function getRoom(documentId) {
  if (!rooms.has(documentId)) {
    rooms.set(documentId, new Set());
  }
  return rooms.get(documentId);
}

function getPresence(documentId) {
  if (!presence.has(documentId)) {
    presence.set(documentId, new Map());
  }
  return presence.get(documentId);
}

function broadcast(documentId, message, except) {
  const room = getRoom(documentId);
  for (const client of room) {
    if (client !== except && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

wss.on("connection", (ws, req) => {
  let documentId = null;
  let clientId = randomUUID();
  ws._meta = { clientId };

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "join") {
        // { type: "join", documentId, user: { id, name } }
        documentId = msg.documentId;
        const room = getRoom(documentId);
        room.add(ws);

        const docPresence = getPresence(documentId);
        const user = msg.user || { id: clientId, name: "익명" };
        docPresence.set(clientId, {
          clientId,
          user: {
            id: user.id || clientId,
            name: user.name || "익명",
          },
          lastSeen: Date.now(),
          cursor: null, // 초기에는 커서 없음
          selection: null, // 초기에는 선택 영역 없음
        });

        // 접속 안내
        ws.send(
          JSON.stringify({
            type: "joined",
            documentId,
            clientId,
          })
        );
        // 전체 presence 업데이트 브로드캐스트
        broadcast(
          documentId,
          JSON.stringify({
            type: "presence:update",
            documentId,
            users: Array.from(docPresence.values()),
          }),
          null
        );
        return;
      }

      if (!documentId) return;

      // presence ping
      if (msg.type === "presence:ping") {
        const docPresence = getPresence(documentId);
        const user = msg.user || { id: clientId, name: "익명" };
        const presenceData = {
          clientId,
          user: {
            id: user.id || clientId,
            name: user.name || "익명",
          },
          lastSeen: Date.now(),
          cursor: msg.cursor || null, // 커서 위치 정보
          selection: msg.selection || null, // 선택 영역 정보
        };

        docPresence.set(clientId, presenceData);
        broadcast(
          documentId,
          JSON.stringify({
            type: "presence:update",
            documentId,
            users: Array.from(docPresence.values()),
          }),
          null
        );
        return;
      }

      // document:load 이벤트도 브로드캐스트
      if (msg.type === "document:load") {
        const envelope = {
          ...msg,
          documentId,
          clientId,
        };
        broadcast(documentId, JSON.stringify(envelope), ws);
        return;
      }

      // 기타 이벤트는 룸 브로드캐스트
      // annotation:*, note:* 등
      const envelope = {
        ...msg,
        documentId,
        clientId,
      };
      broadcast(documentId, JSON.stringify(envelope), ws);
    } catch (e) {
      // ignore malformed
    }
  });

  ws.on("close", () => {
    if (!documentId) return;
    const room = getRoom(documentId);
    room.delete(ws);

    const docPresence = getPresence(documentId);
    docPresence.delete(clientId);
    broadcast(
      documentId,
      JSON.stringify({
        type: "presence:update",
        documentId,
        users: Array.from(docPresence.values()),
      }),
      null
    );
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Realtime server listening on http://localhost:${PORT}`);
});
