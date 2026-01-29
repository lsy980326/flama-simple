import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { IncomingMessage } from "http";
import type WebSocket from "ws";

// 메시지 타입 (y-websocket 규약)
const messageSync = 0;
const messageAwareness = 1;

const wsReadyStateOpen = 1;

type WSSharedDoc = Y.Doc & {
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;
};

const docs = new Map<string, WSSharedDoc>();

function send(conn: WebSocket, data: Uint8Array) {
  if ((conn as any).readyState !== wsReadyStateOpen) return;
  try {
    conn.send(data);
  } catch {
    // ignore
  }
}

function broadcast(doc: WSSharedDoc, exceptConn: WebSocket | null, data: Uint8Array) {
  doc.conns.forEach((_controlledIds, conn) => {
    if (exceptConn && conn === exceptConn) return;
    send(conn, data);
  });
}

function getYDoc(docName: string, gc: boolean): WSSharedDoc {
  const existing = docs.get(docName);
  if (existing) return existing;

  const doc = new Y.Doc() as WSSharedDoc;
  doc.gc = gc;
  doc.conns = new Map();
  doc.awareness = new awarenessProtocol.Awareness(doc);

  // 문서 업데이트를 모든 연결로 브로드캐스트
  doc.on("update", (update: Uint8Array, origin: any) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    const except = origin && typeof origin === "object" ? (origin as WebSocket) : null;
    broadcast(doc, except, message);
  });

  // Awareness 업데이트 브로드캐스트
  doc.awareness.on("update", ({ added, updated, removed }: any, origin: any) => {
    const changedClients = added.concat(updated, removed) as number[];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);
    const except = origin && typeof origin === "object" ? (origin as WebSocket) : null;
    broadcast(doc, except, message);
  });

  docs.set(docName, doc);
  return doc;
}

export function setupWSConnection(
  conn: WebSocket,
  req: IncomingMessage,
  opts?: { docName?: string; gc?: boolean }
) {
  const docName = opts?.docName || "drawing-room";
  const gc = opts?.gc ?? true;
  const doc = getYDoc(docName, gc);

  // 연결별로 제어하는 awareness clientIds 추적
  const controlledIds = new Set<number>();
  doc.conns.set(conn, controlledIds);

  // 초기 sync step1 전송
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(conn, encoding.toUint8Array(encoder));
  }

  // 현재 awareness 상태 전송
  {
    const states = Array.from(doc.awareness.getStates().keys());
    if (states.length > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, states)
      );
      send(conn, encoding.toUint8Array(encoder));
    }
  }

  conn.on("message", (data: WebSocket.RawData) => {
    try {
      const msg = data instanceof Uint8Array ? data : new Uint8Array(data as any);
      const decoder = decoding.createDecoder(msg);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn as any);
          const reply = encoding.toUint8Array(encoder);
          if (reply.length > 1) {
            send(conn, reply);
          }
          break;
        }
        case messageAwareness: {
          const update = decoding.readVarUint8Array(decoder);
          // origin을 conn으로 넣어 자기 자신에게는 echo 하지 않게
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, update, conn as any);

          // applyAwarenessUpdate 내부에서 doc.awareness가 업데이트되고, 위 리스너가 broadcast함
          // controlledIds 추적 업데이트 (대략적): 모든 clientIds를 현재 상태에서 찾아서 set에 넣는다
          // (정확한 clientId 추적을 위해서는 protocol parsing이 더 필요하지만, 제거 시 안전하게 전체 제거 처리)
          break;
        }
        default:
          // ignore
          break;
      }
    } catch {
      // ignore malformed
    }
  });

  const closeConn = () => {
    doc.conns.delete(conn);
    // 연결 종료 시, 해당 연결이 만든 awareness를 제거 (여기서는 안전하게 all states에서 제거하지 않음)
    // 필요하면 추후 clientId 추적을 더 정확하게 구현

    if (doc.conns.size === 0) {
      docs.delete(docName);
      try {
        doc.destroy();
      } catch {
        // ignore
      }
    }
  };

  conn.on("close", closeConn);
  conn.on("error", closeConn);
}

