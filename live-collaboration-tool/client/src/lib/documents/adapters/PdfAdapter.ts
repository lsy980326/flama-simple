import {
  DocumentAdapter,
  DocumentModel,
  DocumentBlock,
  DocumentParagraphBlock,
  DocumentImageBlock,
  DocumentImageResource,
  DocumentCustomBlock,
  ParserInput,
  ParserInputDescriptor,
  RenderHandle,
  RenderSurface,
  DocumentRange,
  DocumentLayoutInfo,
  DocumentBundleMetadata,
} from "../types";
import * as pdfjsLib from "pdfjs-dist";

// PDF.js 워커 설정
// - cdnjs의 `pdf.worker.min.js`는 ESM import에 맞지 않아(Vite가 `?import`를 붙여 import 시도) 실패할 수 있습니다.
// - 따라서 기본은 로컬 `pdfjs-dist` 패키지의 worker(mjs)를 사용합니다.
// - 번들러가 `import.meta.url`을 지원하지 않는 환경을 위해 최소한의 fallback만 둡니다.
if (typeof window !== "undefined") {
  try {
    // Vite/ESM 환경: node_modules의 worker(mjs)를 URL로 만들어 설정
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    // 마지막 수단: unpkg의 ESM worker (https 고정)
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

// PDF.js 타입 정의
type PDFDocumentLoadingTask = ReturnType<typeof pdfjsLib.getDocument>;
type PDFDocumentProxy = Awaited<PDFDocumentLoadingTask["promise"]>;
type PDFPageProxy = Awaited<ReturnType<PDFDocumentProxy["getPage"]>>;
type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;
type TextItem = TextContent["items"][number];

interface ExtractedImage {
  id: string;
  blockId: string;
  resource: DocumentImageResource;
}

class PdfRenderHandle implements RenderHandle {
  private blockMap = new Map<string, HTMLElement>();
  private textLayerMap = new Map<string, HTMLElement[]>();

  constructor(
    private readonly root: HTMLElement,
    private readonly getBlockElement: (blockId: string) => HTMLElement | null
  ) {
    // 블록 맵 초기화
    const elements = this.root.querySelectorAll<HTMLElement>("[data-block-id]");
    elements.forEach((element) => {
      const blockId = element.dataset.blockId;
      if (blockId) {
        this.blockMap.set(blockId, element);
      }
    });

    // 텍스트 레이어 맵 초기화
    const textElements = this.root.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span");
    textElements.forEach((element) => {
      const blockId = element.getAttribute("data-block-id");
      if (blockId) {
        if (!this.textLayerMap.has(blockId)) {
          this.textLayerMap.set(blockId, []);
        }
        this.textLayerMap.get(blockId)?.push(element);
      }
    });
  }

  update(): void {
    // PDF는 정적이라 업데이트 불필요
  }

  queryLayout(range: DocumentRange): DocumentLayoutInfo[] {
    const element = this.getBlockElement(range.blockId);
    if (!element) {
      return [];
    }

    // 텍스트 선택 범위가 있는 경우
    if (range.startOffset !== undefined && range.endOffset !== undefined) {
      const textElements = this.textLayerMap.get(range.blockId) || [];
      const rects: DOMRect[] = [];

      // 텍스트 레이어에서 선택 범위에 해당하는 요소 찾기
      for (const textEl of textElements) {
        const rect = textEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          rects.push(new DOMRect(rect.x, rect.y, rect.width, rect.height));
        }
      }

      if (rects.length > 0) {
        return [{ range, boundingRects: rects }];
      }
    }

    // 전체 블록 범위 반환
    const rects = Array.from(element.getClientRects()).map(
      (rect) => new DOMRect(rect.x, rect.y, rect.width, rect.height)
    );
    if (!rects.length) {
      const rect = element.getBoundingClientRect();
      rects.push(new DOMRect(rect.x, rect.y, rect.width, rect.height));
    }
    return [{ range, boundingRects: rects }];
  }

  mapPointToRange(point: DOMPoint): DocumentRange | null {
    // 텍스트 레이어에서 클릭 위치 찾기
    const textElements = this.root.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span");
    for (let i = 0; i < textElements.length; i++) {
      const element = textElements[i];
      const rect = element.getBoundingClientRect();
      if (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      ) {
        const blockId = element.getAttribute("data-block-id");
        if (blockId) {
          return { blockId };
        }
      }
    }

    // 블록 요소에서 찾기
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
    this.blockMap.clear();
    this.textLayerMap.clear();
  }
}

// 텍스트 아이템을 문단 단위로 그룹화
function groupTextItemsIntoParagraphs(
  items: TextItem[],
  pageNum: number
): DocumentParagraphBlock[] {
  const paragraphs: DocumentParagraphBlock[] = [];
  let currentParagraph: TextItem[] = [];
  let blockIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prevItem = i > 0 ? items[i - 1] : null;

    // 줄바꿈 감지 (y 좌표 차이로 판단)
    const isNewLine =
      prevItem &&
      "transform" in prevItem &&
      "transform" in item &&
      prevItem.transform &&
      item.transform &&
      Math.abs((prevItem.transform[5] || 0) - (item.transform[5] || 0)) > 5;

    if (isNewLine && currentParagraph.length > 0) {
      // 현재 문단 저장
      const text = currentParagraph
        .map((it) => ("str" in it ? it.str : ""))
        .join("");
      if (text.trim()) {
        paragraphs.push({
          id: `pdf-page-${pageNum}-block-${blockIndex}`,
          type: "paragraph",
          runs: [
            {
              id: `pdf-page-${pageNum}-run-${blockIndex}`,
              text: text.trim(),
            },
          ],
        });
        blockIndex++;
      }
      currentParagraph = [];
    }

    currentParagraph.push(item);
  }

  // 마지막 문단 저장
  if (currentParagraph.length > 0) {
    const text = currentParagraph
      .map((it) => ("str" in it ? it.str : ""))
      .join("");
    if (text.trim()) {
      paragraphs.push({
        id: `pdf-page-${pageNum}-block-${blockIndex}`,
        type: "paragraph",
        runs: [
          {
            id: `pdf-page-${pageNum}-run-${blockIndex}`,
            text: text.trim(),
          },
        ],
      });
    }
  }

  return paragraphs;
}

// PDF에서 이미지 추출
async function extractImagesFromPage(
  page: PDFPageProxy,
  pageNum: number
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  const operatorList = await page.getOperatorList();

  const canvasToPngArrayBuffer = async (
    canvas: HTMLCanvasElement
  ): Promise<ArrayBuffer> => {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob 실패"))),
        "image/png"
      );
    });
    return await blob.arrayBuffer();
  };

  const normalizeToPng = async (
    img: unknown
  ): Promise<{ data: ArrayBuffer; width?: number; height?: number } | null> => {
    if (typeof document === "undefined") {
      return null;
    }

    // ImageData
    if (typeof ImageData !== "undefined" && img instanceof ImageData) {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.putImageData(img, 0, 0);
      return { data: await canvasToPngArrayBuffer(canvas), width: img.width, height: img.height };
    }

    // { data, width, height } (pdf.js가 주는 형태)
    if (
      img &&
      typeof img === "object" &&
      "data" in img &&
      "width" in img &&
      "height" in img
    ) {
      const anyImg = img as { data: unknown; width: number; height: number };
      const u8 =
        anyImg.data instanceof Uint8ClampedArray
          ? anyImg.data
          : anyImg.data instanceof Uint8Array
            ? new Uint8ClampedArray(anyImg.data)
            : null;
      if (!u8) return null;
      const canvas = document.createElement("canvas");
      canvas.width = anyImg.width;
      canvas.height = anyImg.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const imageData = new ImageData(u8, anyImg.width, anyImg.height);
      ctx.putImageData(imageData, 0, 0);
      return { data: await canvasToPngArrayBuffer(canvas), width: anyImg.width, height: anyImg.height };
    }

    // ImageBitmap/HTMLImageElement/HTMLCanvasElement
    if (
      (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) ||
      (typeof HTMLImageElement !== "undefined" && img instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement)
    ) {
      const width = (img as any).width;
      const height = (img as any).height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img as any, 0, 0);
      return { data: await canvasToPngArrayBuffer(canvas), width, height };
    }

    return null;
  };

  const loadFromObjStore = async (
    store: unknown,
    key: string,
    timeoutMs: number
  ): Promise<unknown | null> => {
    const get = (store as any)?.get as
      | ((k: string, cb: (val: unknown) => void) => void)
      | undefined;
    if (!get) return null;
    return await new Promise((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, timeoutMs);
      try {
        get(key, (val: unknown) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          resolve(val ?? null);
        });
      } catch {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  };

  const loadXObjectImage = async (name: unknown, timeoutMs: number): Promise<unknown | null> => {
    if (typeof name !== "string") return null;
    // pdf.js 내부 이미지 오브젝트 저장소에서 꺼내기 (objs + commonObjs 둘 다 시도)
    const objs = (page as any).objs;
    const commonObjs = (page as any).commonObjs;
    return (
      (await loadFromObjStore(objs, name, timeoutMs)) ??
      (await loadFromObjStore(commonObjs, name, timeoutMs))
    );
  };

  const forceDecodeImages = async (): Promise<void> => {
    // 일부 문서에서는 getOperatorList만으로 이미지가 decode/objs에 populate 되지 않음.
    // 아주 작은 offscreen 렌더를 한 번 수행하면 이미지가 로드되는 경우가 많음.
    try {
      const viewport = page.getViewport({ scale: 0.15 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const renderContext = {
        canvasContext: ctx,
        viewport,
        canvas,
      };
      // 타임아웃: 렌더가 길어지면 추출만 포기하고 계속 진행
      await Promise.race([
        page.render(renderContext).promise,
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    } catch {
      // ignore
    }
  };

  // 1) 이미지 오퍼레이터 후보 수집
  const xObjectNames: unknown[] = [];
  const inlineImages: unknown[] = [];
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const op = operatorList.fnArray[i];
    const args = operatorList.argsArray[i];
    const isXObject =
      op === pdfjsLib.OPS.paintImageXObject ||
      op === (pdfjsLib.OPS as any).paintJpegXObject ||
      op === (pdfjsLib.OPS as any).paintImageMaskXObject; // 버전에 따라 존재
    const isInline = op === pdfjsLib.OPS.paintInlineImageXObject;
    if (isXObject) xObjectNames.push(args?.[0]);
    if (isInline) inlineImages.push(args?.[0]);
  }

  // 2) inline image 먼저 처리
  for (const rawInline of inlineImages) {
    if (images.length >= 50) break;
    try {
      const normalized = await normalizeToPng(rawInline);
      if (!normalized) continue;
      const imageId = `pdf-page-${pageNum}-img-${images.length}`;
      const blockId = `pdf-page-${pageNum}-img-block-${images.length}`;
      images.push({
        id: imageId,
        blockId,
        resource: {
          id: imageId,
          mimeType: "image/png",
          data: normalized.data,
          width: normalized.width,
          height: normalized.height,
          altText: `PDF image (page ${pageNum})`,
        },
      });
    } catch {
      // ignore
    }
  }

  // 3) XObject images 처리 (1차: 짧게), 실패 시 offscreen decode 후 재시도
  let decodedOnce = false;
  for (const name of xObjectNames) {
    if (images.length >= 50) break;
    try {
      let raw = await loadXObjectImage(name, 300);
      if (!raw && !decodedOnce) {
        decodedOnce = true;
        await forceDecodeImages();
        raw = await loadXObjectImage(name, 1200);
      }
      if (!raw) continue;

      const normalized = await normalizeToPng(raw);
      if (!normalized) continue;

      const imageId = `pdf-page-${pageNum}-img-${images.length}`;
      const blockId = `pdf-page-${pageNum}-img-block-${images.length}`;
      images.push({
        id: imageId,
        blockId,
        resource: {
          id: imageId,
          mimeType: "image/png",
          data: normalized.data,
          width: normalized.width,
          height: normalized.height,
          altText: `PDF image (page ${pageNum})`,
        },
      });
    } catch (error) {
      console.warn("이미지 추출 실패:", error);
    }
  }

  return images;
}

// PDF 페이지를 캔버스로 렌더링
async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number = 1.5
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context를 가져올 수 없습니다.");
  }

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas, // PDF.js 최신 버전에서 필요
  };

  await page.render(renderContext).promise;
  return canvas;
}

// PDF 텍스트 레이어 렌더링
async function renderTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  scale: number = 1.5
): Promise<void> {
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "react-pdf__Page__textContent";
  textLayerDiv.style.position = "absolute";
  textLayerDiv.style.left = "0";
  textLayerDiv.style.top = "0";
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;
  textLayerDiv.style.opacity = "0.2"; // 텍스트 선택을 위해 약간 투명하게

  let blockIndex = 0;
  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i];
    if (!("str" in item) || !item.str) continue;

    const textSpan = document.createElement("span");
    textSpan.textContent = item.str;
    textSpan.setAttribute("data-block-id", `pdf-page-${page.pageNumber}-block-${blockIndex}`);

    if ("transform" in item && item.transform) {
      const transform = item.transform;
      textSpan.style.position = "absolute";
      textSpan.style.left = `${transform[4]}px`;
      textSpan.style.top = `${transform[5]}px`;
      textSpan.style.fontSize = `${transform[0]}px`;
    }

    textLayerDiv.appendChild(textSpan);

    // 문단 구분 감지 (줄바꿈)
    const nextItem = textContent.items[i + 1];
    if (
      nextItem &&
      "transform" in item &&
      "transform" in nextItem &&
      item.transform &&
      nextItem.transform &&
      Math.abs((item.transform[5] || 0) - (nextItem.transform[5] || 0)) > 5
    ) {
      blockIndex++;
    }
  }

  container.appendChild(textLayerDiv);
}

const clearSurface = (surface: RenderSurface) => {
  const { container } = surface;
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

export class PdfAdapter implements DocumentAdapter {
  readonly id = "pdf";
  readonly label = "PDF Document Adapter";
  readonly supportedExtensions = ["pdf"];
  readonly supportedMimes = ["application/pdf"];

  canHandle(descriptor: ParserInputDescriptor): boolean {
    const extension = descriptor.extension?.toLowerCase();
    const mimeType = descriptor.mimeType?.toLowerCase();
    if (extension && this.supportedExtensions.includes(extension)) return true;
    if (mimeType && this.supportedMimes.includes(mimeType)) return true;
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
      // NOTE: pdf.js는 `data: ArrayBuffer`를 워커로 전달할 때 transfer(detach)할 수 있습니다.
      // 따라서 원본 buffer(raw로 보관할 값)는 절대 pdf.js에 직접 넘기지 않고, 복사본만 전달합니다.
      const safeCopyForPdfjs = buffer.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: safeCopyForPdfjs });
      const pdf = await loadingTask.promise;

      // PDF는 이미지/레이아웃이 텍스트 흐름과 강하게 결합되어 있어,
      // "텍스트 블록 + 이미지 블록"으로 정확히 재구성하기가 매우 어렵습니다(특히 form XObject 등).
      // 따라서 뷰어에서는 페이지 단위로 캔버스를 렌더링(이미지 포함)하고 텍스트 레이어로 선택/검색을 지원합니다.
      // 여기서는 페이지 단위 custom block만 생성합니다.
      const blocks: DocumentBlock[] = [];
      const pageBreaks: number[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (pageNum > 1) {
          pageBreaks.push(blocks.length); // 다음 페이지 시작 인덱스
        }
        const pageBlock: DocumentCustomBlock = {
          id: `pdf-page-${pageNum}`,
          type: "custom",
          data: {
            kind: "pdfPage",
            pageNum,
            scale: 1.5,
          },
        };
        blocks.push(pageBlock);
      }

      const metadata: DocumentBundleMetadata = {
        id: name ?? `pdf-${Date.now()}`,
        name,
        description: description ?? "PDF 문서에서 변환된 문서",
        createdBy: author,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return {
        id: `pdf-${metadata.id}`,
        blocks,
        pageBreaks,
        raw: buffer, // 원본 PDF 데이터 저장 (렌더링 시 사용)
        metadata: {
          title: metadata.name ?? "PDF 문서",
          description: metadata.description,
          author: metadata.createdBy,
          createdAt: metadata.createdAt ? new Date(metadata.createdAt) : undefined,
          modifiedAt: metadata.updatedAt ? new Date(metadata.updatedAt) : undefined,
        },
      };
    } catch (error) {
      throw new Error(
        `PDF 파싱 실패: ${error instanceof Error ? error.message : String(error)}`
      );
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

    const { container } = surface;
    container.style.position = "relative";

    // PDF 원본 데이터 가져오기 (raw 필드에서)
    const pdfBuffer = model.raw as ArrayBuffer | undefined;
    if (!pdfBuffer) {
      throw new Error("PDF 원본 데이터가 없습니다.");
    }

    try {
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdf = await loadingTask.promise;

      // 각 페이지 렌더링
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        // 페이지 컨테이너
        const pageContainer = document.createElement("div");
        pageContainer.style.position = "relative";
        pageContainer.style.marginBottom = "24px";
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.margin = "0 auto";

        // 캔버스 렌더링
        const canvas = await renderPageToCanvas(page, 1.5);
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        pageContainer.appendChild(canvas);

        // 텍스트 레이어 추가 (텍스트 선택용)
        await renderTextLayer(page, pageContainer, 1.5);

        // 블록 ID 매핑 (페이지별로)
        const textBlocks = model.blocks.filter((block) =>
          block.id.startsWith(`pdf-page-${pageNum}-`)
        );
        textBlocks.forEach((block) => {
          pageContainer.setAttribute("data-block-id", block.id);
        });

        container.appendChild(pageContainer);
      }
    } catch (error) {
      console.error("PDF 렌더링 실패:", error);
      throw error;
    }

    return new PdfRenderHandle(container, (blockId) => {
      return container.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    });
  }
}

