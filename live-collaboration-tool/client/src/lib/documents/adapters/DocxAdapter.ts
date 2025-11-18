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

// mammoth.js를 사용해 .docx 파일을 실제로 파싱합니다.
type MammothModule = typeof import("mammoth");
let mammoth: MammothModule | null = null;

// mammoth.js 동적 로딩 (옵셔널 의존성)
const loadMammoth = async (): Promise<MammothModule | null> => {
  if (mammoth) {
    return mammoth;
  }
  try {
    mammoth = await import("mammoth");
    return mammoth;
  } catch (error) {
    console.warn("mammoth.js를 로드할 수 없습니다:", error);
    return null;
  }
};

class DocxRenderHandle implements RenderHandle {
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

// mammoth.js를 사용해 .docx 파일에서 텍스트 추출
const extractTextFromDocx = async (
  buffer: ArrayBuffer
): Promise<string> => {
  const mammothLib = await loadMammoth();
  if (!mammothLib) {
    throw new Error(
      "mammoth.js가 설치되지 않았습니다. 'npm install mammoth'를 실행하세요."
    );
  }

  try {
    const result = await mammothLib.extractRawText({ arrayBuffer: buffer });
    if (result.messages.length > 0) {
      console.warn("mammoth.js 경고:", result.messages);
    }
    return result.value || "";
  } catch (error) {
    throw new Error(
      `.docx 파일 파싱 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const toDocumentModel = (
  text: string,
  bundleMeta?: DocumentBundleMetadata
): DocumentModel => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  const metadata = bundleMeta
    ? {
        title: bundleMeta.name ?? "Word 문서",
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
    id: `docx-${bundleMeta?.id ?? Math.random().toString(36).slice(2)}`,
    metadata,
    blocks: lines.map((line, index) => ({
      id: `block-${index}`,
      type: "paragraph" as const,
      runs: [
        {
          id: `run-${index}`,
          text: line.trim(),
        },
      ],
    })),
  };
};

const clearSurface = (surface: RenderSurface) => {
  const { container } = surface;
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

export class DocxAdapter implements DocumentAdapter {
  readonly id = "docx";
  readonly label = "Microsoft Word Document Adapter";
  readonly supportedExtensions = ["docx"];
  readonly supportedMimes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
      const text = await extractTextFromDocx(buffer);
      return toDocumentModel(text, {
        id: name ?? `docx-${Date.now()}`,
        name,
        description: description ?? "Word 문서에서 변환된 문서",
        createdBy: author,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      // 파싱 실패 시 기본 모델 반환
      return toDocumentModel("", {
        id: name ?? `docx-${Date.now()}`,
        name,
        description:
          description ??
          `Word 문서 (파싱 실패: ${error instanceof Error ? error.message : String(error)})`,
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

    return new DocxRenderHandle(surface.container, (blockId) =>
      blockMap.get(blockId) ?? null
    );
  }
}

