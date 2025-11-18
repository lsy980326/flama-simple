import {
  DocumentAdapter,
  DocumentModel,
  ParserInput,
  ParserInputDescriptor,
  RenderHandle,
  RenderSurface,
  DocumentRange,
  DocumentLayoutInfo,
  DocumentBundleMetadata,
} from "../types";

// .hwp 파일은 복잡한 바이너리 포맷입니다.
// 서버 측에서 node-hwp를 사용하여 HTML로 변환하고,
// 클라이언트에서는 HTML에서 내용만 추출합니다.

class HwpRenderHandle implements RenderHandle {
  constructor(
    private readonly root: HTMLElement,
    private readonly getBlockElement: (blockId: string) => HTMLElement | null
  ) {}

  update(): void {
    // 문서 업데이트 처리
  }

  queryLayout(range: DocumentRange): DocumentLayoutInfo[] {
    const element = this.getBlockElement(range.blockId);
    if (!element) {
      return [];
    }
    const rects = Array.from(element.getClientRects()).map(
      (rect) => new DOMRect(rect.x, rect.y, rect.width, rect.height)
    );
    if (!rects.length) {
      const rect = element.getBoundingClientRect();
      rects.push(new DOMRect(rect.x, rect.y, rect.width, rect.height));
    }
    return [
      {
        range,
        boundingRects: rects,
      },
    ];
  }

  mapPointToRange(point: DOMPoint): DocumentRange | null {
    const elements = this.root.querySelectorAll<HTMLElement>("[data-block-id]");
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements.item(index);
      const rect = element.getBoundingClientRect();
      if (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      ) {
        const blockId = element.dataset.blockId;
        if (blockId) {
          return { blockId };
        }
      }
    }
    return null;
  }

  observeLayoutChange(
    range: DocumentRange,
    callback: (info: DocumentLayoutInfo) => void
  ): () => void {
    const element = this.getBlockElement(range.blockId);
    if (!element) {
      return () => undefined;
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      callback({
        range,
        boundingRects: [new DOMRect(rect.x, rect.y, rect.width, rect.height)],
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }

  dispose(): void {
    // 리소스 정리
  }
}

// 서버에서 HTML로 변환된 HWP 파일 정보
interface HwpParseResult {
  success: boolean;
  html?: string;
  text?: string;
  textLines?: string[]; // 줄 단위로 분리된 텍스트 (서버에서 HWPML에서 직접 추출)
  pageBreaks?: number[]; // 페이지 브레이크 인덱스 배열 (각 페이지 브레이크 이후의 첫 번째 줄 인덱스)
  hml?: string;
  metadata?: any;
  error?: string;
  message?: string;
}

// .hwp 파일에서 HTML 및 텍스트 추출
const extractHwpFromServer = async (
  buffer: ArrayBuffer
): Promise<HwpParseResult | null> => {
  const envUrl = (process.env.REACT_APP_API_URL as string | undefined)?.trim();
  const sameOrigin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const candidates = [
    envUrl, // 환경변수 우선
    sameOrigin ? `${sameOrigin}` : undefined, // 같은 오리진 (프록시 설정 시 /api로 라우팅)
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter((v): v is string => !!v);

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "application/x-hwp" });
  formData.append("file", blob, "document.hwp");

  for (const base of candidates) {
    try {
      const url = `${base.replace(/\/+$/, "")}/api/hwp/parse`;
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        const result = (await response.json()) as HwpParseResult;
        if (
          result?.success &&
          (result.html || (result.textLines && result.textLines.length > 0))
        ) {
          return result;
        }
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ error: "서버 오류" }));
        console.warn(
          "서버 HWP 파싱 실패:",
          base,
          errorData.error || errorData.message
        );
      }
    } catch (error) {
      console.warn("서버 API 호출 실패:", base, error);
    }
  }
  return null;
};

// HTML 엔티티를 완전히 디코딩하는 함수 (클라이언트 공통)
const decodeHtmlEntities = (text: string): string => {
  if (!text) {
    return "";
  }

  try {
    // 텍스트 영역을 만들어서 브라우저의 내장 디코딩 기능 사용
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    let decoded = textarea.value;

    // 숫자 엔티티가 여전히 남아있는 경우 직접 디코딩
    // 10진수 숫자 엔티티: &#12685;
    decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
      const num = parseInt(code, 10);
      return String.fromCharCode(num);
    });

    // 16진수 숫자 엔티티: &#x12685;
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/gi, (match, code) => {
      const num = parseInt(code, 16);
      return String.fromCharCode(num);
    });

    return decoded;
  } catch (error) {
    console.error("HTML 엔티티 디코딩 오류:", error);
    // 실패 시 기본 디코딩
    return text
      .replace(/&#(\d+);/g, (match, code) =>
        String.fromCharCode(parseInt(code, 10))
      )
      .replace(/&#x([0-9A-Fa-f]+);/gi, (match, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
};

// 서버에서 받은 textLines를 DocumentModel로 변환하는 함수
const textLinesToDocumentModel = (
  textLines: string[],
  pageBreaks?: number[],
  bundleMeta?: DocumentBundleMetadata
): DocumentModel => {
  const blocks: DocumentModel["blocks"] = [];
  let blockIndex = 0;
  const documentPageBreaks: number[] = [];

  // 각 텍스트 줄을 블록으로 변환 (HTML 엔티티 디코딩 적용)
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    if (line && line.trim().length > 0) {
      // HTML 엔티티 디코딩
      const decodedLine = decodeHtmlEntities(line.trim());
      if (decodedLine.length > 0) {
        blocks.push({
          id: `block-${blockIndex++}`,
          type: "paragraph",
          runs: [
            {
              id: `run-${blockIndex}-0`,
              text: decodedLine,
            },
          ],
        });

        // 페이지 브레이크 확인 (페이지 브레이크 이후의 첫 번째 블록 인덱스)
        if (pageBreaks && pageBreaks.includes(i)) {
          documentPageBreaks.push(blocks.length - 1);
        }
      }
    }
  }

  const metadata = bundleMeta
    ? {
        title: bundleMeta.name ?? "한글 문서",
        description: bundleMeta.description,
        author: bundleMeta.createdBy,
        createdAt: bundleMeta.createdAt
          ? new Date(bundleMeta.createdAt)
          : undefined,
        modifiedAt: bundleMeta.updatedAt
          ? new Date(bundleMeta.updatedAt)
          : undefined,
        custom: bundleMeta.extra,
      }
    : undefined;

  return {
    id: `hwp-textlines-${
      bundleMeta?.id ?? Math.random().toString(36).slice(2)
    }`,
    metadata,
    blocks,
    pageBreaks: documentPageBreaks.length > 0 ? documentPageBreaks : undefined,
  };
};

// HTML에서 내용만 추출하여 DocumentModel로 변환
const htmlToDocumentModel = (
  html: string,
  bundleMeta?: DocumentBundleMetadata
): DocumentModel => {
  if (!html || html.trim().length === 0) {
    // 빈 HTML인 경우 빈 문서 반환
    return {
      id: `hwp-empty-${bundleMeta?.id ?? Math.random().toString(36).slice(2)}`,
      metadata: bundleMeta
        ? {
            title: bundleMeta.name ?? "한글 문서",
            description: bundleMeta.description,
            author: bundleMeta.createdBy,
            createdAt: bundleMeta.createdAt
              ? new Date(bundleMeta.createdAt)
              : undefined,
            modifiedAt: bundleMeta.updatedAt
              ? new Date(bundleMeta.updatedAt)
              : undefined,
            custom: bundleMeta.extra,
          }
        : undefined,
      blocks: [],
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body || doc.documentElement;

  const blocks: DocumentModel["blocks"] = [];
  let blockIndex = 0;

  // script, style, meta, link 태그 제거
  const elementsToRemove = body.querySelectorAll(
    "script, style, meta, link, noscript"
  );
  elementsToRemove.forEach((el) => el.remove());

  // HTML 엔티티를 완전히 디코딩하는 함수
  const decodeHtmlEntities = (text: string): string => {
    if (!text) {
      return "";
    }

    try {
      // 텍스트 영역을 만들어서 브라우저의 내장 디코딩 기능 사용
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      let decoded = textarea.value;

      // 숫자 엔티티가 여전히 남아있는 경우 직접 디코딩
      // 10진수 숫자 엔티티: &#12685;
      decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
        const num = parseInt(code, 10);
        return String.fromCharCode(num);
      });

      // 16진수 숫자 엔티티: &#x12685;
      decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/gi, (match, code) => {
        const num = parseInt(code, 16);
        return String.fromCharCode(num);
      });

      return decoded;
    } catch (error) {
      console.error("HTML 엔티티 디코딩 오류:", error);
      // 실패 시 기본 디코딩
      return text
        .replace(/&#(\d+);/g, (match, code) =>
          String.fromCharCode(parseInt(code, 10))
        )
        .replace(/&#x([0-9A-Fa-f]+);/gi, (match, code) =>
          String.fromCharCode(parseInt(code, 16))
        )
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
  };

  // 텍스트 내용만 추출하는 헬퍼 함수
  const extractTextContent = (element: Element): string => {
    // script, style 태그는 무시
    if (
      element.tagName.toLowerCase() === "script" ||
      element.tagName.toLowerCase() === "style"
    ) {
      return "";
    }

    // 텍스트 노드만 추출 (HTML 태그 무시)
    let text = "";
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }
        const parentTag = parent.tagName.toLowerCase();
        // script, style, meta, link 등은 제외
        if (
          parentTag === "script" ||
          parentTag === "style" ||
          parentTag === "meta" ||
          parentTag === "link" ||
          parentTag === "noscript"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    const textNodes: string[] = [];
    while ((node = walker.nextNode())) {
      const textContent = node.textContent?.trim();
      if (textContent && textContent.length > 0) {
        textNodes.push(textContent);
      }
    }

    // 텍스트 노드들을 공백으로 연결
    text = textNodes.join(" ").trim();

    // HTML 엔티티 디코딩
    text = decodeHtmlEntities(text);

    // 연속된 공백 정리
    text = text.replace(/\s+/g, " ");

    return text;
  };

  // 가장 확실한 방법: body.innerText를 우선 사용하여 모든 텍스트 추출
  // innerText는 렌더링된 텍스트를 반환하므로 블록 요소 사이의 줄바꿈을 포함
  let innerText = body.innerText || body.textContent || "";

  // HTML 엔티티 디코딩
  innerText = decodeHtmlEntities(innerText);

  if (innerText && innerText.trim().length > 0) {
    // 줄바꿈으로 분리 (빈 줄 제거)
    const lines = innerText
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // 각 줄을 블록으로 변환
    for (const line of lines) {
      if (line.trim().length > 0) {
        blocks.push({
          id: `block-${blockIndex++}`,
          type: "paragraph",
          runs: [
            {
              id: `run-${blockIndex}-0`,
              text: line.trim(),
            },
          ],
        });
      }
    }
  }

  // innerText가 비어있거나 매우 적은 경우, 블록 요소를 직접 찾아서 추출
  if (blocks.length === 0 || blocks.length < 3) {
    // 모든 <p> 태그를 문서 순서대로 찾기
    const allParagraphs = Array.from(
      body.querySelectorAll("p, div.hwp-section, div.hwp-line, p.hwp-line")
    );
    const processedElements = new Set<Element>();

    for (const element of allParagraphs) {
      // 이미 처리된 요소는 건너뛰기
      if (processedElements.has(element)) {
        continue;
      }

      // 부모 요소가 이미 처리되었는지 확인
      let hasProcessedParent = false;
      let parent = element.parentElement;
      while (parent && parent !== body) {
        if (processedElements.has(parent)) {
          hasProcessedParent = true;
          break;
        }
        parent = parent.parentElement;
      }

      if (hasProcessedParent) {
        continue;
      }

      // 텍스트 추출
      const text = extractTextContent(element);
      if (text && text.trim().length > 0) {
        const textTrimmed = text.trim();

        // 중복 체크 (이미 blocks에 있는지 확인)
        const isDuplicate = blocks.some((block) => {
          if ("runs" in block && block.runs) {
            return block.runs.some((run) => run.text.trim() === textTrimmed);
          }
          return false;
        });

        if (!isDuplicate) {
          blocks.push({
            id: `block-${blockIndex++}`,
            type: "paragraph",
            runs: [
              {
                id: `run-${blockIndex}-0`,
                text: textTrimmed,
              },
            ],
          });
          processedElements.add(element);
        }
      }
    }

    // 제목 태그 처리
    const allHeadings = Array.from(
      body.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
    for (const element of allHeadings) {
      if (processedElements.has(element)) {
        continue;
      }

      const text = extractTextContent(element);
      if (text && text.trim().length > 0) {
        const tagName = element.tagName.toLowerCase();
        const level = parseInt(tagName.charAt(1));
        const textTrimmed = text.trim();

        // 중복 체크
        const isDuplicate = blocks.some((block) => {
          if ("runs" in block && block.runs) {
            return block.runs.some((run) => run.text.trim() === textTrimmed);
          }
          return false;
        });

        if (!isDuplicate) {
          blocks.push({
            id: `block-${blockIndex++}`,
            type: "heading",
            runs: [
              {
                id: `run-${blockIndex}-0`,
                text: textTrimmed,
                style: {
                  fontSize: Math.max(20, 32 - (level - 1) * 4),
                  decorations: ["bold"],
                },
              },
            ],
          });
          processedElements.add(element);
        }
      }
    }
  }

  // 최종 확인: body.textContent를 사용하여 모든 텍스트가 추출되었는지 확인
  // textContent는 모든 텍스트를 포함하므로 누락된 텍스트가 있는지 확인
  const allBodyText = body.textContent?.trim() || "";
  if (allBodyText && allBodyText.length > 0) {
    // runs 속성이 있는 블록만 처리 (paragraph, heading, list 타입)
    const extractedTextLength = blocks.reduce((sum: number, block) => {
      if ("runs" in block && block.runs) {
        return (
          sum + block.runs.reduce((s: number, run) => s + run.text.length, 0)
        );
      }
      return sum;
    }, 0);

    // 전체 텍스트가 추출된 텍스트보다 1.05배 이상 많은 경우 textContent로 재추출
    // 또는 blocks가 3개 미만인 경우
    // 또는 추출된 텍스트가 전체 텍스트의 90% 미만인 경우
    if (
      blocks.length === 0 ||
      blocks.length < 3 ||
      (allBodyText.length > extractedTextLength * 1.05 &&
        allBodyText.length > 100) ||
      (blocks.length > 0 &&
        extractedTextLength > 0 &&
        extractedTextLength < allBodyText.length * 0.9)
    ) {
      // textContent를 사용하여 모든 텍스트 추출
      // 공백으로 분리하여 더 많은 줄 추출
      const lines = allBodyText
        .split(/\s{2,}|\r?\n+/) // 2개 이상의 연속 공백 또는 줄바꿈으로 분리
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // 추출된 줄이 기존 blocks보다 많은 경우 또는 blocks가 거의 없는 경우 재추출
      if (
        lines.length > blocks.length * 1.2 ||
        blocks.length < 3 ||
        blocks.length === 0
      ) {
        // 기존 blocks를 덮어쓰기
        blocks.length = 0;
        blockIndex = 0;
        for (const line of lines) {
          if (line.trim().length > 0) {
            blocks.push({
              id: `block-${blockIndex++}`,
              type: "paragraph",
              runs: [
                {
                  id: `run-${blockIndex}-0`,
                  text: line.trim(),
                },
              ],
            });
          }
        }
      }
    }
  }

  const metadata = bundleMeta
    ? {
        title: bundleMeta.name ?? "한글 문서",
        description: bundleMeta.description,
        author: bundleMeta.createdBy,
        createdAt: bundleMeta.createdAt
          ? new Date(bundleMeta.createdAt)
          : undefined,
        modifiedAt: bundleMeta.updatedAt
          ? new Date(bundleMeta.updatedAt)
          : undefined,
        custom: bundleMeta.extra,
      }
    : undefined;

  return {
    id: `hwp-html-${bundleMeta?.id ?? Math.random().toString(36).slice(2)}`,
    metadata,
    blocks,
  };
};

const clearSurface = (surface: RenderSurface) => {
  const { container } = surface;
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

export class HwpAdapter implements DocumentAdapter {
  readonly id = "hwp";
  readonly label = "한글 문서 Adapter";
  readonly supportedExtensions = ["hwp"];
  readonly supportedMimes = [
    "application/x-hwp",
    "application/haansofthwp",
    "application/vnd.haansoft-hwp",
    "application/octet-stream",
  ];

  canHandle(descriptor: ParserInputDescriptor): boolean {
    const extension = descriptor.extension?.toLowerCase();
    const mimeType = descriptor.mimeType?.toLowerCase();
    if (extension && this.supportedExtensions.includes(extension)) {
      return true;
    }
    if (mimeType && this.supportedMimes.includes(mimeType)) {
      return true;
    }
    return false;
  }

  async parse(input: ParserInput): Promise<DocumentModel> {
    const { buffer, descriptor } = input;
    const rawName = descriptor.metadata?.name;
    const name = typeof rawName === "string" ? rawName : undefined;
    const rawDescription = descriptor.metadata?.description;
    const description =
      typeof rawDescription === "string" ? rawDescription : undefined;
    const rawAuthor = descriptor.metadata?.author;
    const author = typeof rawAuthor === "string" ? rawAuthor : undefined;

    // 서버 API로 HTML 변환
    const serverResult = await extractHwpFromServer(buffer);

    if (serverResult && serverResult.success) {
      const bundleMeta: DocumentBundleMetadata = {
        id: name ?? `hwp-${Date.now()}`,
        name,
        description: description ?? "한글 문서에서 변환된 문서",
        createdBy: author || serverResult.metadata?.author,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 서버에서 받은 textLines를 우선 사용 (가장 정확한 추출)
      if (serverResult.textLines && serverResult.textLines.length > 0) {
        console.log(
          "서버에서 textLines 사용, 줄 수:",
          serverResult.textLines.length,
          "페이지 브레이크:",
          serverResult.pageBreaks?.length || 0
        );
        return textLinesToDocumentModel(
          serverResult.textLines,
          serverResult.pageBreaks,
          bundleMeta
        );
      }

      // textLines가 없는 경우 HTML에서 추출
      if (serverResult.html) {
        console.log("서버에서 HTML 사용하여 추출");
        return htmlToDocumentModel(serverResult.html, bundleMeta);
      }
    }

    // 서버 API 실패 시 안내 텍스트가 포함된 문서 반환(빈 문서가 아닌 표시 가능 문서)
    const fallbackTitle = name ?? "한글 문서";
    const fallbackText =
      "한글(HWP) 파서 서버에 연결할 수 없습니다. 환경변수 REACT_APP_API_URL을 설정하거나 HWP 파서 API를 실행하세요.";
    return {
      id: `hwp-fallback-${Date.now()}`,
      metadata: {
        title: fallbackTitle,
        description: description ?? "HWP 파서 연결 실패 안내",
        author,
        createdAt: new Date(),
        modifiedAt: new Date(),
      },
      blocks: [
        {
          id: "block-0",
          type: "heading",
          runs: [
            {
              id: "run-0-0",
              text: fallbackTitle,
              style: { decorations: ["bold"], fontSize: 22 },
            },
          ],
        },
        {
          id: "block-1",
          type: "paragraph",
          runs: [{ id: "run-1-0", text: fallbackText }],
        },
      ],
    };
  }

  canRender(_model: DocumentModel): boolean {
    return true;
  }

  async render(
    model: DocumentModel,
    surface: RenderSurface
  ): Promise<RenderHandle> {
    clearSurface(surface);
    const blockMap = new Map<string, HTMLElement>();
    model.blocks.forEach((block) => {
      const paragraph = document.createElement("p");
      paragraph.textContent =
        "runs" in block ? block.runs.map((run) => run.text).join("") : "";
      paragraph.dataset.blockId = block.id;
      paragraph.style.margin = "0 0 16px";
      paragraph.style.fontSize = "16px";
      paragraph.style.lineHeight = "1.8";
      paragraph.style.color = "#1f2937";
      surface.container.appendChild(paragraph);
      blockMap.set(block.id, paragraph);
    });

    return new HwpRenderHandle(
      surface.container,
      (blockId) => blockMap.get(blockId) ?? null
    );
  }
}
