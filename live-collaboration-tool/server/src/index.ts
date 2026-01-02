import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createRequire } from "module";

// ESM에서 CommonJS 모듈 import
const require = createRequire(import.meta.url);
// @ts-ignore - @y/websocket-server는 ES 모듈이고 TypeScript 설정과 충돌할 수 있음
const { setupWSConnection } = require("@y/websocket-server/utils");
// @ts-ignore - node-hwp는 CommonJS 모듈
const hwp = require("node-hwp");
// multer 타입 확장
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// @ts-ignore - multer는 CommonJS 모듈
const multer = require("multer");

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
const YJS_WS_PORT = parseInt(process.env.YJS_WS_PORT || "5001", 10);

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// multer 설정 (메모리 스토리지 사용)
// @ts-ignore - multer 타입 체크 건너뛰기
const upload = multer({
  // @ts-ignore
  storage: multer.memoryStorage(),
});

// 서버 상태 관리
let isShuttingDown = false;
const activeConnections = new Set();

// 그레이스풀 셧다운 함수
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log("이미 종료 중입니다...");
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} 신호를 받았습니다. 그레이스풀 셧다운을 시작합니다...`);

  try {
    // 1. 새로운 연결 거부
    server.close(() => {
      console.log("HTTP 서버가 종료되었습니다.");
    });

    // 2. WebSocket 서버 종료
    wss.close(() => {
      console.log("Y.js WebSocket 서버가 종료되었습니다.");
    });

    // 3. Socket.IO 연결 종료
    io.close(() => {
      console.log("Socket.IO 서버가 종료되었습니다.");
    });

    // 4. 활성 연결 종료 대기 (최대 10초)
    const shutdownTimeout = setTimeout(() => {
      console.warn("일부 연결이 종료되지 않았지만 강제 종료합니다.");
      process.exit(1);
    }, 10000);

    // 모든 연결이 종료될 때까지 대기
    const checkConnections = setInterval(() => {
      if (activeConnections.size === 0) {
        clearInterval(checkConnections);
        clearTimeout(shutdownTimeout);
        console.log("모든 연결이 종료되었습니다.");
        process.exit(0);
      }
    }, 100);

    // 5초 후에도 연결이 있으면 강제 종료
    setTimeout(() => {
      clearInterval(checkConnections);
      clearTimeout(shutdownTimeout);
      console.log("서버를 종료합니다.");
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error("셧다운 중 오류 발생:", error);
    process.exit(1);
  }
}

// 시그널 핸들러 등록
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// 처리되지 않은 예외 처리
process.on("uncaughtException", (error) => {
  console.error("처리되지 않은 예외:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("처리되지 않은 Promise 거부:", reason);
  console.error("Promise:", promise);
});

// HWPML을 HTML로 변환하는 함수
function convertHwpmlToHtml(hml: string): string {
  if (!hml) {
    return "";
  }

  try {
    let html = hml;

    // 기본 HWPML 태그를 HTML 태그로 변환
    html = html.replace(/<\/?HWPML[^>]*>/gi, "");
    html = html.replace(/<\/?BODY[^>]*>/gi, (match) => {
      return match.replace(/BODY/i, "body");
    });
    html = html.replace(/<SECTION[^>]*>/gi, '<div class="hwp-section">');
    html = html.replace(/<\/SECTION>/gi, "</div>");
    html = html.replace(/<P[^>]*>/gi, "<p>");
    html = html.replace(/<\/P>/gi, "</p>");
    html = html.replace(/<LINE[^>]*>/gi, '<p class="hwp-line">');
    html = html.replace(/<\/LINE>/gi, "</p>");
    html = html.replace(/<CHAR[^>]*>/gi, '<span class="hwp-char">');
    html = html.replace(/<\/CHAR>/gi, "</span>");
    html = html.replace(/<\/?TEXT[^>]*>/gi, "");
    html = html.replace(/<\/?RUBY[^>]*>/gi, (match) => {
      return match.replace(/RUBY/gi, "ruby");
    });
    html = html.replace(/<\/?RT[^>]*>/gi, (match) => {
      return match.replace(/RT(?=[^a-z])/gi, "rt");
    });
    html = html.replace(/<\/?TABLE[^>]*>/gi, (match) => {
      return match.replace(/TABLE/gi, "table");
    });
    html = html.replace(/<\/?TR[^>]*>/gi, (match) => {
      return match.replace(/TR(?=[^a-z])/gi, "tr");
    });
    html = html.replace(/<\/?TD[^>]*>/gi, (match) => {
      return match.replace(/TD(?=[^a-z])/gi, "td");
    });
    html = html.replace(/<IMAGE[^>]*>/gi, (match) => {
      return match.replace(/IMAGE/gi, "img");
    });

    // 스타일 속성 변환
    html = html.replace(/Face="([^"]*)"/gi, (match, face) => {
      return `style="font-family: '${face}'"`;
    });
    html = html.replace(/Size="([^"]*)"/gi, (match, size) => {
      return `style="font-size: ${size}pt"`;
    });
    html = html.replace(/Bold="true"/gi, (match, offset, str) => {
      const tagEnd = str.indexOf(">", offset);
      if (tagEnd > -1) {
        const tag = str.substring(offset, tagEnd + 1);
        if (!tag.includes("style=")) {
          return 'style="font-weight: bold"';
        } else {
          return match.replace(/Bold="true"/gi, "");
        }
      }
      return match;
    });
    html = html.replace(/Italic="true"/gi, (match, offset, str) => {
      const tagEnd = str.indexOf(">", offset);
      if (tagEnd > -1) {
        const tag = str.substring(offset, tagEnd + 1);
        if (!tag.includes("style=")) {
          return 'style="font-style: italic"';
        } else {
          return match.replace(/Italic="true"/gi, "");
        }
      }
      return match;
    });

    // 기본 HTML 구조로 감싸기
    if (!html.includes("<html")) {
      html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      line-height: 1.6;
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .hwp-section { margin: 20px 0; }
    .hwp-line { margin: 5px 0; }
    .hwp-char { display: inline; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    td { border: 1px solid #ddd; padding: 8px; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    }

    return html;
  } catch (error) {
    console.error("HWPML to HTML 변환 오류:", error);
    return `<html><body><p>${hml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()}</p></body></html>`;
  }
}

// HTML 엔티티 디코딩
function decodeHtmlEntities(text: string): string {
  if (!text) {
    return "";
  }

  try {
    text = text.replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });
    text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    return text;
  } catch (error) {
    console.error("HTML 엔티티 디코딩 오류:", error);
    return text;
  }
}

// HWPML에서 텍스트 추출
function extractTextLinesFromHwpml(hml: string): {
  lines: string[];
  pageBreaks: number[];
} {
  if (!hml) {
    return { lines: [], pageBreaks: [] };
  }

  try {
    const lines: string[] = [];
    const pageBreaks: number[] = [];

    const pMatches = hml.match(/<P[^>]*>([\s\S]*?)<\/P>/gi);
    if (pMatches) {
      for (let i = 0; i < pMatches.length; i++) {
        const match = pMatches[i];
        if (
          match.match(/<PAGEBREAK[^>]*>/gi) ||
          match.match(/PageBreak\s*=\s*["']?true["']?/i)
        ) {
          pageBreaks.push(lines.length);
        }

        let text = match.replace(/<P[^>]*>/gi, "").replace(/<\/P>/gi, "");
        text = text.replace(/<PAGEBREAK[^>]*>/gi, "");
        text = text.replace(/<[^>]+>/g, " ");
        text = decodeHtmlEntities(text);
        text = text.replace(/\s+/g, " ").trim();
        if (text && text.length > 0) {
          lines.push(text);
        }
      }
    }

    return { lines, pageBreaks };
  } catch (error) {
    console.error("HWPML 텍스트 추출 오류:", error);
    return { lines: [], pageBreaks: [] };
  }
}

// HTML에서 텍스트 추출
function extractTextFromHtml(html: string): string {
  if (!html) {
    return "";
  }

  try {
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = decodeHtmlEntities(text);
    text = text.replace(/\s+/g, " ").trim();
    return text;
  } catch (error) {
    console.error("HTML 텍스트 추출 오류:", error);
    return "";
  }
}

// 기본 라우트
app.get("/", (req, res) => {
  res.json({
    message: "Live Collaboration Tool Server",
    version: "0.1.0",
    status: "running",
    features: ["Socket.IO", "Y.js WebSocket", "WebRTC Signaling", "HWP Parser"],
  });
});

// 헬스 체크 엔드포인트
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    connections: activeConnections.size,
    timestamp: new Date().toISOString(),
  });
});

// HWP 파일 파싱 API 엔드포인트
app.post(
  "/api/hwp/parse",
  upload.single("file"),
  (req: MulterRequest, res: Response) => {
    if (isShuttingDown) {
      res.status(503).json({ error: "서버가 종료 중입니다." });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "파일이 제공되지 않았습니다." });
      return;
    }

    const fileBuffer = req.file.buffer;
    const tempFilePath = join(
      tmpdir(),
      `hwp-${Date.now()}-${Math.random().toString(36).slice(2)}.hwp`
    );

    try {
      writeFileSync(tempFilePath, fileBuffer);

      hwp.open(tempFilePath, { type: "hwp" }, (err: Error | null, doc: any) => {
        // 임시 파일 삭제
        try {
          unlinkSync(tempFilePath);
        } catch (deleteError) {
          console.warn("임시 파일 삭제 실패:", deleteError);
        }

        if (err) {
          console.error("HWP 파싱 오류:", err);
          res.status(500).json({
            error: "HWP 파일 파싱 실패",
            message: err.message,
            hint:
              "node-hwp(0.1.0-alpha)가 이 HWP를 지원하지 않는 경우가 있습니다(예: 이미지/신규 태그/도형 컴포넌트). " +
              "가능하면 HWP를 PDF로 저장하여 업로드하거나, 다른 HWP 파서(또는 최신 버전)로 교체하세요.",
          });
          return;
        }

        if (!doc) {
          res.status(500).json({
            error: "HWP 파일 파싱 실패",
            message: "문서를 읽을 수 없습니다.",
          });
          return;
        }

        try {
          let hml = "";
          try {
            hml = doc.toHML(false) || "";
          } catch (hmlError) {
            console.error("HWPML 변환 오류:", hmlError);
            res.status(500).json({
              error: "HWP 파일 파싱 실패",
              message: "HWPML 변환 실패",
            });
            return;
          }

          if (!hml) {
            res.status(500).json({
              error: "HWP 파일 파싱 실패",
              message: "HWP 파일에서 HWPML을 추출할 수 없습니다.",
            });
            return;
          }

          const html = convertHwpmlToHtml(hml);
          const text = extractTextFromHtml(html);
          const { lines: textLines, pageBreaks } = extractTextLinesFromHwpml(hml);

          res.json({
            success: true,
            html: html,
            text: text,
            textLines: textLines,
            pageBreaks: pageBreaks,
            hml: hml,
            metadata: doc._hwp_meta || null,
          });
        } catch (parseError) {
          console.error("HWP 파싱 오류:", parseError);
          res.status(500).json({
            error: "HTML 변환 실패",
            message:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
        }
      });
    } catch (error) {
      try {
        unlinkSync(tempFilePath);
      } catch (deleteError) {
        // 무시
      }

      console.error("HWP 처리 오류:", error);
      res.status(500).json({
        error: "파일 처리 실패",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// 에러 핸들러 미들웨어
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error("서버 오류:", err);
  res.status(500).json({
    error: "내부 서버 오류",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 핸들러
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "엔드포인트를 찾을 수 없습니다." });
});

// Y.js WebSocket 서버 설정
const wss = new WebSocketServer({ port: YJS_WS_PORT });

wss.on("connection", (ws: any, req: any) => {
  if (isShuttingDown) {
    ws.close(1013, "서버가 종료 중입니다.");
    return;
  }

  activeConnections.add(ws);
  console.log("Y.js WebSocket 연결:", req.url);

  setupWSConnection(ws, req, {
    docName: (req.url || "").slice(1).split("?")[0] || "drawing-room",
    gc: true,
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    console.log("Y.js WebSocket 연결 종료:", req.url);
  });

  ws.on("error", (error: any) => {
    console.error("Y.js WebSocket 오류:", error);
    activeConnections.delete(ws);
  });
});

// Socket.IO 연결 처리
io.on("connection", (socket) => {
  if (isShuttingDown) {
    socket.disconnect(true);
    return;
  }

  activeConnections.add(socket);
  console.log("사용자 연결됨:", socket.id);

  // 방 참가
  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    console.log(`사용자 ${socket.id}가 방 ${roomId}에 참가했습니다.`);
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

  // 그림 그리기 데이터
  socket.on("drawing-data", (data) => {
    socket.to(data.roomId).emit("drawing-data", data);
  });

  // 핀포인트 데이터
  socket.on("pinpoint-data", (data) => {
    socket.to(data.roomId).emit("pinpoint-data", data);
  });

  // 연결 해제
  socket.on("disconnect", (reason) => {
    activeConnections.delete(socket);
    console.log("사용자 연결 해제됨:", socket.id, reason);
  });

  socket.on("error", (error) => {
    console.error("Socket.IO 오류:", error);
    activeConnections.delete(socket);
  });
});

// 서버 시작
server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📡 Socket.IO 서버 준비 완료`);
  console.log(`🔗 Y.js WebSocket 서버가 포트 ${YJS_WS_PORT}에서 실행 중입니다.`);
  console.log(`💚 헬스 체크: http://localhost:${PORT}/health`);
});

// 서버 오류 처리
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`포트 ${PORT}가 이미 사용 중입니다.`);
    process.exit(1);
  } else {
    console.error("서버 오류:", error);
    process.exit(1);
  }
});

wss.on("error", (error: any) => {
  console.error("WebSocket 서버 오류:", error);
});
