import {
  DocumentAdapter,
  DocumentModel,
  DocumentBundleMetadata,
  DocumentRange,
  DocumentLayoutInfo,
  RenderHandle,
  RenderSurface,
  ParserInput,
  ParserInputDescriptor,
} from "../types";

const utf8Decoder = new TextDecoder("utf-8");

class TxtRenderHandle implements RenderHandle {
  constructor(
    private readonly root: HTMLElement,
    private readonly getBlockElement: (blockId: string) => HTMLElement | null
  ) {}

  update(): void {
    // 텍스트는 정적이라 별도 업데이트 없음
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
    // 특별히 정리할 리소스 없음
  }
}

const toDocumentModel = (
  text: string,
  bundleMeta?: DocumentBundleMetadata
): DocumentModel => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const metadata = bundleMeta
    ? {
        title: bundleMeta.name ?? "텍스트 문서",
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
    id: `txt-${bundleMeta?.id ?? Math.random().toString(36).slice(2)}`,
    metadata,
    blocks: lines.map((line, index) => ({
      id: `line-${index}`,
      type: "paragraph" as const,
      runs: [
        {
          id: `run-${index}`,
          text: line,
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

export class TxtAdapter implements DocumentAdapter {
  readonly id = "txt";
  readonly label = "Plain Text Adapter";
  readonly supportedExtensions = ["txt"];
  readonly supportedMimes = ["text/plain", "application/octet-stream"];

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

    const text = utf8Decoder.decode(buffer);
    return toDocumentModel(text, {
      id: name ?? `txt-${Date.now()}`,
      name,
      description: description ?? "텍스트 파일에서 변환된 문서",
      createdBy: author,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
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
      paragraph.style.margin = "0 0 12px";
      paragraph.style.fontSize = "15px";
      paragraph.style.lineHeight = "1.6";
      surface.container.appendChild(paragraph);
      blockMap.set(block.id, paragraph);
    });

    return new TxtRenderHandle(surface.container, (blockId) =>
      blockMap.get(blockId) ?? null
    );
  }
}

