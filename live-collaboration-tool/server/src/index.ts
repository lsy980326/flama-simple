import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
// @ts-ignore - @y/websocket-server는 ES 모듈이고 TypeScript 설정과 충돌할 수 있음
const { setupWSConnection } = require("@y/websocket-server/utils");

// 환경 변수 로드
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;
const YJS_WS_PORT = 5001;

// 미들웨어
app.use(cors());
app.use(express.json());

// 기본 라우트
app.get("/", (req, res) => {
  res.json({
    message: "Live Collaboration Tool Server",
    version: "1.0.0",
    status: "running",
    features: ["Socket.IO", "Y.js WebSocket", "WebRTC Signaling"],
  });
});

// Y.js WebSocket 지원을 위한 WebSocket 서버 설정
// @y/websocket-server의 setupWSConnection을 사용하여 올바른 프로토콜 처리
const wss = new WebSocketServer({ port: YJS_WS_PORT });

wss.on("connection", (ws, req) => {
  console.log("Y.js WebSocket 연결 시도:", req.url);

  // @y/websocket-server의 공식 setupWSConnection 사용
  // 이 함수가 Y.js 프로토콜을 정확히 처리합니다
  setupWSConnection(ws, req, {
    docName: (req.url || "").slice(1).split("?")[0] || "drawing-room",
    gc: true,
  });

  ws.on("close", () => {
    console.log("Y.js WebSocket 연결 종료됨:", req.url);
  });
});

// Socket.IO 연결 처리
io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);

  // 방 참가
  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    console.log(`사용자 ${socket.id}가 방 ${roomId}에 참가했습니다.`);

    // 방의 다른 사용자들에게 새 사용자 알림
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // 방 떠나기
  socket.on("leave-room", (roomId: string) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-left", socket.id);
    console.log(`사용자 ${socket.id}가 방 ${roomId}에서 떠났습니다.`);
  });

  // WebRTC 시그널링
  socket.on("offer", (data) => {
    socket.to(data.roomId).emit("offer", data);
  });

  socket.on("answer", (data) => {
    socket.to(data.roomId).emit("answer", data);
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.roomId).emit("ice-candidate", data);
  });

  // 채팅 메시지
  socket.on("chat-message", (data) => {
    socket.to(data.roomId).emit("chat-message", data);
  });

  // 그림 그리기 데이터 (Y.js 동기화)
  socket.on("drawing-data", (data) => {
    socket.to(data.roomId).emit("drawing-data", data);
  });

  // 핀포인트 데이터
  socket.on("pinpoint-data", (data) => {
    socket.to(data.roomId).emit("pinpoint-data", data);
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("사용자 연결 해제됨:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📡 Socket.IO 서버 준비 완료`);
  console.log(`🔗 Y.js WebSocket 서버가 포트 5001에서 실행 중입니다.`);
});
