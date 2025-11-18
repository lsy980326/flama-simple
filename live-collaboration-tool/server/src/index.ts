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
  file?: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
  };
}

// @ts-ignore - multer는 CommonJS 모듈
const multer = require("multer");

// node-hwp 사용 예시 (제공된 코드 참고)
// const HWP = hwp.HWP;
// const doc = new HWP();
// doc.loadFromHWP(file, callback, option);

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
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// multer 설정 (메모리 스토리지 사용)
// @ts-ignore - multer 타입 체크 건너뛰기
const upload = multer({
  // @ts-ignore
  storage: multer.memoryStorage(),
});

// HWPML을 HTML로 변환하는 함수 (file_converter 패턴 참고)
// 참고: https://github.com/pjt3591oo/file_converter
function convertHwpmlToHtml(hml: string): string {
  if (!hml) {
    return "";
  }

  try {
    let html = hml;

    // 기본 HWPML 태그를 HTML 태그로 변환
    // <HWPML> 제거
    html = html.replace(/<\/?HWPML[^>]*>/gi, "");

    // <BODY> -> <body>
    html = html.replace(/<\/?BODY[^>]*>/gi, (match) => {
      return match.replace(/BODY/i, "body");
    });

    // <SECTION> -> <div class="section">
    html = html.replace(/<SECTION[^>]*>/gi, '<div class="hwp-section">');
    html = html.replace(/<\/SECTION>/gi, "</div>");

    // <P> -> <p> (이미 소문자로 변환되므로 명확하게 처리)
    html = html.replace(/<P[^>]*>/gi, "<p>");
    html = html.replace(/<\/P>/gi, "</p>");

    // <LINE> -> <p> (문단으로 처리하여 더 명확하게)
    html = html.replace(/<LINE[^>]*>/gi, '<p class="hwp-line">');
    html = html.replace(/<\/LINE>/gi, "</p>");

    // <CHAR> -> <span>
    html = html.replace(/<CHAR[^>]*>/gi, '<span class="hwp-char">');
    html = html.replace(/<\/CHAR>/gi, "</span>");

    // <TEXT> -> 텍스트만 유지
    html = html.replace(/<\/?TEXT[^>]*>/gi, "");

    // <RUBY> -> <ruby>
    html = html.replace(/<\/?RUBY[^>]*>/gi, (match) => {
      return match.replace(/RUBY/gi, "ruby");
    });

    // <RT> -> <rt>
    html = html.replace(/<\/?RT[^>]*>/gi, (match) => {
      return match.replace(/RT(?=[^a-z])/gi, "rt");
    });

    // <TABLE> -> <table>
    html = html.replace(/<\/?TABLE[^>]*>/gi, (match) => {
      return match.replace(/TABLE/gi, "table");
    });

    // <TR> -> <tr>
    html = html.replace(/<\/?TR[^>]*>/gi, (match) => {
      return match.replace(/TR(?=[^a-z])/gi, "tr");
    });

    // <TD> -> <td>
    html = html.replace(/<\/?TD[^>]*>/gi, (match) => {
      return match.replace(/TD(?=[^a-z])/gi, "td");
    });

    // <IMAGE> -> <img>
    html = html.replace(/<IMAGE[^>]*>/gi, (match) => {
      return match.replace(/IMAGE/gi, "img");
    });

    // 스타일 속성 추출 및 변환
    // Face 속성을 스타일로 변환
    html = html.replace(/Face="([^"]*)"/gi, (match, face) => {
      return `style="font-family: '${face}'"`;
    });

    // Size 속성을 스타일로 변환
    html = html.replace(/Size="([^"]*)"/gi, (match, size) => {
      return `style="font-size: ${size}pt"`;
    });

    // Bold, Italic 등 처리
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
    // 변환 실패 시 기본 텍스트 추출
    return `<html><body><p>${hml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()}</p></body></html>`;
  }
}

// HTML 엔티티를 완전히 디코딩하는 함수
function decodeHtmlEntities(text: string): string {
  if (!text) {
    return "";
  }

  try {
    // 먼저 숫자 엔티티 디코딩 (&#12685; 같은 형태)
    // 10진수 숫자 엔티티: &#12685;
    text = text.replace(/&#(\d+);/g, (match, code) => {
      const num = parseInt(code, 10);
      return String.fromCharCode(num);
    });

    // 16진수 숫자 엔티티: &#x12685;
    text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, code) => {
      const num = parseInt(code, 16);
      return String.fromCharCode(num);
    });

    // 일반적인 HTML 엔티티 디코딩
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    // 알려진 HTML 엔티티들
    const entities: Record<string, string> = {
      "&nbsp;": " ",
      "&lt;": "<",
      "&gt;": ">",
      "&amp;": "&",
      "&quot;": '"',
      "&apos;": "'",
      "&copy;": "©",
      "&reg;": "®",
      "&trade;": "™",
      "&hellip;": "…",
      "&mdash;": "—",
      "&ndash;": "–",
    };

    // 나머지 일반 엔티티 처리
    for (const [entity, char] of Object.entries(entities)) {
      text = text.replace(
        new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        char
      );
    }

    return text;
  } catch (error) {
    console.error("HTML 엔티티 디코딩 오류:", error);
    return text;
  }
}

// HWPML에서 페이지 브레이크 정보를 추출하는 함수
function extractPageBreaksFromHwpml(hml: string): number[] {
  if (!hml) {
    return [];
  }

  try {
    const pageBreaks: number[] = [];
    let currentIndex = 0;

    // HWPML에서 페이지 브레이크 태그 찾기
    // <PAGEBREAK>, <PAGE>, <NEWPAGE> 등의 태그 또는 페이지 속성 찾기
    const pageBreakPatterns = [
      /<PAGEBREAK[^>]*>/gi,
      /<PAGE[^>]*>/gi,
      /<NEWPAGE[^>]*>/gi,
      /<SECTION[^>]*PageBreak[^>]*>/gi,
    ];

    // 모든 블록 태그의 위치를 추적하면서 페이지 브레이크 찾기
    const allBlockTags = hml.matchAll(/<(P|LINE|SECTION)[^>]*>/gi);
    let blockIndex = 0;

    for (const match of allBlockTags) {
      const tag = match[0];

      // 페이지 브레이크 태그가 있는지 확인
      for (const pattern of pageBreakPatterns) {
        if (pattern.test(tag)) {
          pageBreaks.push(blockIndex);
          break;
        }
      }

      // 페이지 브레이크 속성이 있는지 확인
      if (tag.match(/PageBreak\s*=\s*["']?true["']?/i)) {
        pageBreaks.push(blockIndex);
      }

      blockIndex++;
    }

    return pageBreaks;
  } catch (error) {
    console.error("페이지 브레이크 추출 오류:", error);
    return [];
  }
}

// HWPML에서 직접 텍스트를 줄 단위로 추출하는 함수 (페이지 정보 포함)
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

    // HWPML 태그를 제거하고 텍스트만 추출
    // <P>, <LINE>, <SECTION> 등의 블록 요소 사이의 텍스트를 추출

    // 1. <P> 태그 내용 추출
    const pMatches = hml.match(/<P[^>]*>([\s\S]*?)<\/P>/gi);
    if (pMatches) {
      for (let i = 0; i < pMatches.length; i++) {
        const match = pMatches[i];
        // 페이지 브레이크 확인
        if (
          match.match(/<PAGEBREAK[^>]*>/gi) ||
          match.match(/PageBreak\s*=\s*["']?true["']?/i)
        ) {
          pageBreaks.push(lines.length);
        }

        // 태그 제거하고 텍스트만 추출
        let text = match.replace(/<P[^>]*>/gi, "").replace(/<\/P>/gi, "");
        // 페이지 브레이크 태그 제거
        text = text.replace(/<PAGEBREAK[^>]*>/gi, "");
        // 내부 태그 제거
        text = text.replace(/<[^>]+>/g, " ");
        // HTML 엔티티 디코딩
        text = decodeHtmlEntities(text);
        // 공백 정리
        text = text.replace(/\s+/g, " ").trim();
        if (text && text.length > 0) {
          lines.push(text);
        }
      }
    }

    // 2. <LINE> 태그 내용 추출
    const lineMatches = hml.match(/<LINE[^>]*>([\s\S]*?)<\/LINE>/gi);
    if (lineMatches) {
      for (const match of lineMatches) {
        // 페이지 브레이크 확인
        if (
          match.match(/<PAGEBREAK[^>]*>/gi) ||
          match.match(/PageBreak\s*=\s*["']?true["']?/i)
        ) {
          pageBreaks.push(lines.length);
        }

        let text = match.replace(/<LINE[^>]*>/gi, "").replace(/<\/LINE>/gi, "");
        text = text.replace(/<PAGEBREAK[^>]*>/gi, "");
        text = text.replace(/<[^>]+>/g, " ");
        text = decodeHtmlEntities(text);
        text = text.replace(/\s+/g, " ").trim();
        if (text && text.length > 0) {
          lines.push(text);
        }
      }
    }

    // 3. <SECTION> 태그 내용 추출 (내부에 <P>, <LINE>이 없는 경우만)
    const sectionMatches = hml.match(/<SECTION[^>]*>([\s\S]*?)<\/SECTION>/gi);
    if (sectionMatches) {
      for (const match of sectionMatches) {
        // 내부에 <P> 또는 <LINE> 태그가 있는지 확인
        if (!match.match(/<[PL]/i)) {
          // 페이지 브레이크 확인
          if (
            match.match(/<PAGEBREAK[^>]*>/gi) ||
            match.match(/PageBreak\s*=\s*["']?true["']?/i)
          ) {
            pageBreaks.push(lines.length);
          }

          let text = match
            .replace(/<SECTION[^>]*>/gi, "")
            .replace(/<\/SECTION>/gi, "");
          text = text.replace(/<PAGEBREAK[^>]*>/gi, "");
          text = text.replace(/<[^>]+>/g, " ");
          text = decodeHtmlEntities(text);
          text = text.replace(/\s+/g, " ").trim();
          if (text && text.length > 0) {
            lines.push(text);
          }
        }
      }
    }

    // 4. 태그가 없는 일반 텍스트 추출 (블록 태그 사이의 텍스트)
    // 모든 블록 태그를 제거한 후 남은 텍스트
    let remainingText = hml;
    // 블록 태그 제거
    remainingText = remainingText.replace(/<[PLSECTION][^>]*>/gi, "");
    remainingText = remainingText.replace(/<\/[PLSECTION]>/gi, "");
    // 페이지 브레이크 태그 제거
    remainingText = remainingText.replace(/<PAGEBREAK[^>]*>/gi, "");
    // 모든 태그 제거
    remainingText = remainingText.replace(/<[^>]+>/g, " ");
    // HTML 엔티티 디코딩
    remainingText = decodeHtmlEntities(remainingText);
    // 줄바꿈으로 분리
    const remainingLines = remainingText
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    lines.push(...remainingLines);

    // 중복 제거 (페이지 브레이크 인덱스 조정 필요)
    const uniqueLines: string[] = [];
    const seenLines = new Set<string>();
    const adjustedPageBreaks: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!seenLines.has(line)) {
        seenLines.add(line);
        uniqueLines.push(line);

        // 페이지 브레이크 인덱스 조정
        if (pageBreaks.includes(i)) {
          adjustedPageBreaks.push(uniqueLines.length - 1);
        }
      }
    }

    return { lines: uniqueLines, pageBreaks: adjustedPageBreaks };
  } catch (error) {
    console.error("HWPML 텍스트 추출 오류:", error);
    return { lines: [], pageBreaks: [] };
  }
}

// HTML에서 순수 텍스트 추출 (어노테이션용)
function extractTextFromHtml(html: string): string {
  if (!html) {
    return "";
  }

  try {
    // HTML 태그 제거
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");

    // HTML 엔티티 디코딩 (완전한 디코딩)
    text = decodeHtmlEntities(text);

    // 공백 정리
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
    version: "1.0.0",
    status: "running",
    features: ["Socket.IO", "Y.js WebSocket", "WebRTC Signaling", "HWP Parser"],
  });
});

// HWP 파일 파싱 API 엔드포인트
app.post(
  "/api/hwp/parse",
  upload.single("file"),
  (req: MulterRequest, res: Response) => {
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
      // 임시 파일로 저장
      writeFileSync(tempFilePath, fileBuffer);

      // node-hwp로 파싱 (제공된 코드 패턴 참고)
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
          // HWPML로 변환
          let hml = "";
          try {
            hml = doc.toHML(false) || "";
            console.log("HWPML 변환 성공, 길이:", hml.length);
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

          // HWPML을 HTML로 변환
          const html = convertHwpmlToHtml(hml);
          console.log("HTML 변환 성공, 길이:", html.length);

          if (!html) {
            res.status(500).json({
              error: "HTML 변환 실패",
              message: "HWPML을 HTML로 변환할 수 없습니다.",
            });
            return;
          }

          // HTML에서 텍스트 추출 (클라이언트에서 사용)
          const text = extractTextFromHtml(html);

          // HWPML에서 직접 텍스트 줄 추출 (더 정확한 추출, 페이지 정보 포함)
          const { lines: textLines, pageBreaks } =
            extractTextLinesFromHwpml(hml);
          console.log(
            "HWPML 텍스트 줄 추출 성공, 줄 수:",
            textLines.length,
            "페이지 브레이크:",
            pageBreaks.length
          );

          res.json({
            success: true,
            html: html,
            text: text,
            textLines: textLines, // 줄 단위로 분리된 텍스트
            pageBreaks: pageBreaks, // 페이지 브레이크 인덱스 배열 (각 페이지 브레이크 이후의 첫 번째 줄 인덱스)
            hml: hml,
            metadata: doc._hwp_meta || null,
          });
          return;
        } catch (parseError) {
          console.error("HWP 파싱 오류:", parseError);
          res.status(500).json({
            error: "HTML 변환 실패",
            message:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
          return;
        }
      });
    } catch (error) {
      // 임시 파일 삭제
      try {
        unlinkSync(tempFilePath);
      } catch (deleteError) {
        // 무시
      }

      console.error("HWP 처리 오류:", error);
      return res.status(500).json({
        error: "파일 처리 실패",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

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
