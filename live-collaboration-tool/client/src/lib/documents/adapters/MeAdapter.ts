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

// .me 파일은 마크다운 유사 형식의 문서입니다.
// marked 라이브러리를 사용해 HTML로 변환한 후 텍스트를 추출합니다.

class MeRenderHandle implements RenderHandle {
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

// .me 파일 파싱 (마크다운 유사 형식)
const parseMeFile = async (buffer: ArrayBuffer): Promise<string> => {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return text;
  } catch (error) {
    throw new Error(
      `.me 파일 파싱 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

// 마크다운 텍스트를 DocumentModel로 변환
const toDocumentModel = (
  text: string,
  bundleMeta?: DocumentBundleMetadata
): DocumentModel => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: DocumentModel["blocks"] = [];
  type BlockBuilder = {
    type: "paragraph" | "heading";
    runs: Array<{ id: string; text: string }>;
  };
  let currentBlock: BlockBuilder | null = null;

  // forEach 대신 일반 for 루프 사용 (TypeScript 타입 추론 개선)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    // 헤딩 감지 (#으로 시작)
    if (trimmed.startsWith("#")) {
      if (currentBlock && currentBlock.runs.length > 0) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: currentBlock.type,
          runs: currentBlock.runs,
        });
      }

      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const headingText = trimmed.replace(/^#+\s*/, "");
      blocks.push({
        id: `block-${blocks.length}`,
        type: "heading",
        runs: [
          {
            id: `run-${blocks.length}-0`,
            text: headingText,
            style: {
              decorations: ["bold"],
              fontSize: Math.max(20, 28 - (level - 1) * 4),
            },
          },
        ],
      });
      currentBlock = null;
      continue;
    }

    // 빈 줄 처리
    if (!trimmed) {
      if (currentBlock && currentBlock.runs.length > 0) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: currentBlock.type,
          runs: currentBlock.runs,
        });
        currentBlock = null;
      }
      continue;
    }

    // 리스트 감지 (- 또는 * 또는 숫자로 시작)
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      if (currentBlock && currentBlock.runs.length > 0) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: currentBlock.type,
          runs: currentBlock.runs,
        });
      }

      const listText = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
      blocks.push({
        id: `block-${blocks.length}`,
        type: "paragraph",
        runs: [
          {
            id: `run-${blocks.length}-0`,
            text: `• ${listText}`,
          },
        ],
      });
      currentBlock = null;
      continue;
    }

    // 일반 문단
    if (!currentBlock) {
      currentBlock = {
        type: "paragraph",
        runs: [],
      };
    }

    currentBlock.runs.push({
      id: `run-${blocks.length}-${currentBlock.runs.length}`,
      text: line.endsWith(" ") ? line : `${line} `,
    });
  }

  // 마지막 블록 추가
  if (currentBlock !== null && currentBlock.runs.length > 0) {
    blocks.push({
      id: `block-${blocks.length}`,
      type: currentBlock.type,
      runs: currentBlock.runs,
    });
  }

  const metadata = bundleMeta
    ? {
        title: bundleMeta.name ?? "Markdown 문서",
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
    id: `me-${bundleMeta?.id ?? Math.random().toString(36).slice(2)}`,
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

export class MeAdapter implements DocumentAdapter {
  readonly id = "me";
  readonly label = "Markdown-like (.me) Adapter";
  readonly supportedExtensions = ["me", "md", "markdown"];
  readonly supportedMimes = [
    "text/markdown",
    "text/x-markdown",
    "text/plain",
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

    try {
      const text = await parseMeFile(buffer);
      return toDocumentModel(text, {
        id: name ?? `me-${Date.now()}`,
        name,
        description: description ?? "마크다운 문서에서 변환된 문서",
        createdBy: author,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      // 파싱 실패 시 기본 모델 반환
      return toDocumentModel("", {
        id: name ?? `me-${Date.now()}`,
        name,
        description:
          description ??
          `마크다운 문서 (파싱 실패: ${error instanceof Error ? error.message : String(error)})`,
        createdBy: author,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
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
      const element = document.createElement(
        block.type === "heading" ? "h2" : "p"
      );
      element.textContent =
        "runs" in block ? block.runs.map((run) => run.text).join("") : "";
      element.dataset.blockId = block.id;
      element.style.margin = "0 0 16px";
      if (block.type === "heading") {
        element.style.fontSize = "24px";
        element.style.fontWeight = "600";
        element.style.marginBottom = "24px";
      } else {
        element.style.fontSize = "16px";
        element.style.lineHeight = "1.8";
      }
      element.style.color = "#1f2937";
      surface.container.appendChild(element);
      blockMap.set(block.id, element);
    });

    return new MeRenderHandle(surface.container, (blockId) =>
      blockMap.get(blockId) ?? null
    );
  }
}

