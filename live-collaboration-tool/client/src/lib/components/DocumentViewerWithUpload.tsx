import React from "react";
import { DocumentViewer, DocumentViewerAction } from "./DocumentViewer";
import { AnnotationService } from "../annotations/AnnotationService";
import {
  DocumentAdapterRegistry,
  DocumentModel,
  DocumentRange,
  DocumentParser,
  RenderHandle,
  RenderSurface,
  DocumentBlock,
} from "../documents/types";
import { createDefaultAdapterRegistry } from "../utils/documentAdapters";
import type { AnnotationEntry } from "../annotations/types";

export interface DocumentViewerWithUploadProps {
  /**
   * 초기 문서 모델 (선택사항)
   * 제공되지 않으면 파일 업로드 UI가 표시됩니다.
   */
  initialDocument?: DocumentModel;

  /**
   * 어노테이션 서비스 인스턴스 (선택사항)
   * 제공되지 않으면 내부에서 생성됩니다.
   */
  annotationService?: AnnotationService;

  /**
   * 어댑터 레지스트리 (선택사항)
   * 제공되지 않으면 기본 어댑터 레지스트리가 사용됩니다.
   */
  adapterRegistry?: DocumentAdapterRegistry;

  /**
   * 사용자 정보 (어노테이션 작성자로 사용)
   */
  user?: { id: string; name: string };

  /**
   * 문서 뷰어 높이 (기본값: 600)
   */
  height?: number;

  /**
   * 검색 기능 활성화 여부 (기본값: true)
   */
  searchEnabled?: boolean;

  /**
   * 커스텀 액션 (선택사항)
   * 제공되지 않으면 기본 액션(형광펜, 밑줄, 메모)이 사용됩니다.
   */
  customActions?: DocumentViewerAction[];

  /**
   * 문서 변경 시 콜백
   */
  onDocumentChange?: (document: DocumentModel | null) => void;

  /**
   * 에러 발생 시 콜백
   */
  onError?: (error: Error) => void;

  /**
   * 스타일 커스터마이징
   */
  style?: React.CSSProperties;

  /**
   * 클래스명
   */
  className?: string;
}

/**
 * 파일 업로드 및 어노테이션 기능이 포함된 DocumentViewer 통합 컴포넌트
 *
 * 이 컴포넌트는 다음 기능을 포함합니다:
 * - 파일 업로드 및 파싱
 * - 텍스트 선택 및 어노테이션 생성
 * - 키보드 단축키 지원 (Ctrl+1: 형광펜, Ctrl+2: 밑줄)
 * - 기본 어댑터 레지스트리 설정
 */
export const DocumentViewerWithUpload: React.FC<
  DocumentViewerWithUploadProps
> = ({
  initialDocument,
  annotationService: propAnnotationService,
  adapterRegistry: propAdapterRegistry,
  user = { id: "user-1", name: "사용자" },
  height = 600,
  searchEnabled = true,
  customActions,
  onDocumentChange,
  onError,
  style,
  className,
}) => {
  const [documentModel, setDocumentModel] =
    React.useState<DocumentModel | null>(initialDocument || null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeTool, setActiveTool] = React.useState<
    "highlight" | "underline" | "note"
  >("highlight");
  const [rootElement, setRootElement] = React.useState<HTMLElement | null>(
    null
  );
  const [selectedRange, setSelectedRange] = React.useState<{
    blockId: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [selectedText, setSelectedText] = React.useState("");
  const [renderHandle, setRenderHandle] = React.useState<RenderHandle | null>(
    null
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pdfContainerRef = React.useRef<HTMLDivElement>(null);

  const isPdfDocument = Boolean(
    documentModel &&
      documentModel.raw instanceof ArrayBuffer &&
      Array.isArray(documentModel.blocks) &&
      documentModel.blocks.some(
        (b: any) =>
          b && b.type === "custom" && b.data && b.data.kind === "pdfPage"
      )
  );

  // PDFDocumentProxy는 문서 단위로 1번만 로드해서 모든 페이지 렌더가 공유하도록 캐싱합니다.
  // (pdf.js가 워커로 data를 transfer(detach)할 수 있어서, 페이지마다 getDocument를 호출하면 2페이지부터 깨질 수 있음)
  const pdfDocPromiseRef = React.useRef<Promise<any> | null>(null);
  const pdfDocIdRef = React.useRef<string | null>(null);

  /**
   * PDF 페이지 블록 렌더링 (캔버스 + 텍스트 레이어 + 어노테이션 오버레이)
   */
  const PdfPageBlock: React.FC<{
    blockId: string;
    pageNum: number;
    pdfDocPromise: Promise<any>;
    annotations: AnnotationEntry[];
  }> = ({ blockId, pageNum, pdfDocPromise, annotations }) => {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const pageRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      let cancelled = false;

      const run = async () => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";

        const pageContainer = document.createElement("div");
        pageContainer.className = "pdf-page";
        pageContainer.dataset.pdfPageBlockId = blockId;
        pageContainer.style.position = "relative";
        pageContainer.style.margin = "0 auto 24px";
        host.appendChild(pageContainer);
        pageRef.current = pageContainer;

        const pdf = await pdfDocPromise;
        const page = await pdf.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        // pdf_viewer.css의 TextLayer는 CSS 변수(--scale-factor 등)에 의존합니다.
        // pdfViewer/page 래퍼를 쓰지 않는 커스텀 렌더링이므로, 페이지 컨테이너에 직접 값을 주입합니다.
        // PDF_TO_CSS_UNITS = 96/72 (pdf.js 내부 상수와 동일)
        const cssScaleFactor = scale * (96 / 72);
        pageContainer.style.setProperty(
          "--scale-factor",
          String(cssScaleFactor)
        );
        pageContainer.style.setProperty("--user-unit", "1");
        pageContainer.style.setProperty(
          "--total-scale-factor",
          String(cssScaleFactor)
        );

        if (cancelled) return;

        // 1. 캔버스와 컨테이너 크기를 viewport와 1:1로 고정 (오차 원천 차단)
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context를 가져올 수 없습니다.");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";

        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
        pageContainer.appendChild(canvas);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled) return;

        // text layer (선택/드래그/검색용) - pdf.js 공식 TextLayerBuilder 사용 (좌표/스케일 정확)
        try {
          // TextLayerBuilder는 pdf_viewer.css의 스타일/변수에 의존합니다.
          // (예: --scale-factor) 커스텀 뷰어에서도 정확한 위치/선택을 위해 CSS를 로드합니다.
          await import("pdfjs-dist/web/pdf_viewer.css");
          const pdfViewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
          const builder = new (pdfViewer as any).TextLayerBuilder({
            pdfPage: page,
            enablePermissions: false,
          });

          // 우리가 기존에 쓰던 클래스도 같이 붙여서(선택/탐색 로직 재사용) 유지합니다.
          builder.div.classList.add("react-pdf__Page__textContent");

          // 위치/레이어링 - 캔버스와 정확히 같은 위치에 오도록 설정
          builder.div.style.position = "absolute";
          builder.div.style.left = "0";
          builder.div.style.top = "0";
          builder.div.style.width = `${viewport.width}px`;
          builder.div.style.height = `${viewport.height}px`;
          builder.div.style.zIndex = "100"; // 캔버스(1)보다 훨씬 위에, 어노테이션(30)보다도 위에
          builder.div.style.pointerEvents = "auto";
          builder.div.style.userSelect = "text";
          (builder.div.style as any).webkitUserSelect = "text";
          builder.div.style.cursor = "text";
          builder.div.style.margin = "0";
          builder.div.style.padding = "0";
          builder.div.style.transform = "none"; // transform이 위치를 어긋나게 할 수 있음

          // 중요: PDF.js 엔진이 사용하는 스케일 변수 주입
          // viewport.scale을 직접 사용하여 정확한 위치 계산 보장
          builder.div.style.setProperty(
            "--scale-factor",
            String(viewport.scale)
          );
          builder.div.style.setProperty("--user-unit", "1");
          builder.div.style.setProperty(
            "--total-scale-factor",
            String(viewport.scale)
          );

          await builder.render({ viewport });

          // 렌더링 후 위치 검증 및 조정
          // TextLayerBuilder가 생성한 span들이 정확한 위치에 있는지 확인
          const spans = builder.div.querySelectorAll<HTMLElement>("span");
          spans.forEach((span) => {
            // span의 pointer-events 명시적으로 설정
            span.style.pointerEvents = "auto";
            // span의 transform이 부모와 일치하도록 보장
            if (span.style.transform && span.style.transform !== "none") {
              // transform은 유지하되, 부모의 transform과 충돌하지 않도록
            }
          });

          // span에 blockId를 심어서 선택/레이아웃 계산이 range.blockId로 매핑되게 합니다.
          builder.div.querySelectorAll<HTMLElement>("span").forEach((span) => {
            span.dataset.pdfBlockId = blockId;
            // span의 pointer-events도 명시적으로 설정
            span.style.pointerEvents = "auto";
          });

          pageContainer.appendChild(builder.div);
        } catch (e) {
          console.warn("PDF 텍스트 레이어(TextLayerBuilder) 렌더 실패:", e);
        }
      };

      run().catch((e) => {
        console.error("PDF 페이지 렌더 실패:", e);
      });

      return () => {
        cancelled = true;
      };
    }, [blockId, pageNum, pdfDocPromise]);

    // annotation overlay (텍스트 레이어 위에 정확히 맞춰서 렌더링)
    const [overlayNodes, setOverlayNodes] = React.useState<React.ReactNode[]>(
      []
    );
    const overlayContainerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      const pageEl = pageRef.current;
      if (!pageEl) {
        setOverlayNodes([]);
        return;
      }

      // 텍스트 레이어 찾기
      const textLayer = pageEl.querySelector<HTMLElement>(
        ".react-pdf__Page__textContent, .textLayer"
      );
      if (!textLayer) {
        setOverlayNodes([]);
        return;
      }

      const updateOverlays = () => {
        const nodes: React.ReactNode[] = [];

        annotations.forEach((a) => {
          // 어노테이션의 range 정보 가져오기
          const range = a.range;
          if (!range || range.blockId !== blockId) return;

          // 텍스트 레이어에서 해당 범위의 span들 찾기
          const allSpans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${blockId}"]`
            )
          );
          if (!allSpans.length) return;

          // startOffset과 endOffset에 해당하는 span들 찾기
          let offset = 0;
          const selectedSpans: HTMLElement[] = [];

          for (const span of allSpans) {
            const spanText = span.textContent || "";
            const spanStart = offset;
            const spanEnd = offset + spanText.length;
            offset = spanEnd;

            // 선택 범위와 겹치는 span인지 확인
            if (
              range.endOffset !== undefined &&
              range.startOffset !== undefined
            ) {
              if (spanEnd > range.startOffset && spanStart < range.endOffset) {
                selectedSpans.push(span);
              }
            }
          }

          if (!selectedSpans.length) return;

          // 각 span의 실제 위치를 사용해서 오버레이 생성
          selectedSpans.forEach((span, spanIdx) => {
            const spanRect = span.getBoundingClientRect();
            const textLayerRect = textLayer.getBoundingClientRect();

            // 텍스트 레이어 기준 상대 위치 계산
            const left = spanRect.left - textLayerRect.left;
            const top = spanRect.top - textLayerRect.top;

            if (a.type === "highlight") {
              nodes.push(
                <div
                  key={`${a.id}-span-${spanIdx}`}
                  style={{
                    position: "absolute",
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${spanRect.width}px`,
                    height: `${spanRect.height}px`,
                    background: a.style?.color ?? "rgba(250, 204, 21, 0.6)",
                    pointerEvents: "none",
                    zIndex: 30, // 텍스트 레이어(20) 위에 표시
                  }}
                />
              );
            } else if (a.type === "underline") {
              nodes.push(
                <div
                  key={`${a.id}-span-${spanIdx}`}
                  style={{
                    position: "absolute",
                    left: `${left}px`,
                    top: `${top + spanRect.height - 2}px`,
                    width: `${spanRect.width}px`,
                    height: `2px`,
                    background: a.style?.underlineColor ?? "#2563eb",
                    pointerEvents: "none",
                    zIndex: 30, // 텍스트 레이어(20) 위에 표시
                  }}
                />
              );
            }
          });
        });

        setOverlayNodes(nodes);

        // 오버레이 컨테이너 위치 업데이트
        if (overlayContainerRef.current) {
          const textLayerRect = textLayer.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          overlayContainerRef.current.style.position = "absolute";
          overlayContainerRef.current.style.left = `${
            textLayerRect.left - pageRect.left
          }px`;
          overlayContainerRef.current.style.top = `${
            textLayerRect.top - pageRect.top
          }px`;
          overlayContainerRef.current.style.width = `${textLayerRect.width}px`;
          overlayContainerRef.current.style.height = `${textLayerRect.height}px`;
        }
      };

      // 초기 업데이트
      updateOverlays();

      // 리사이즈/스크롤 시 업데이트
      const resizeObserver = new ResizeObserver(updateOverlays);
      resizeObserver.observe(textLayer);
      resizeObserver.observe(pageEl);

      // 스크롤 이벤트 리스너
      const handleScroll = () => updateOverlays();
      window.addEventListener("scroll", handleScroll, true);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener("scroll", handleScroll, true);
      };
    }, [annotations, blockId]);

    return (
      <div style={{ position: "relative" }}>
        <div ref={hostRef} />
        <div
          ref={overlayContainerRef}
          style={{
            position: "absolute",
            pointerEvents: "none",
            zIndex: 30, // 텍스트 레이어(20) 위에 표시
          }}
        >
          {overlayNodes}
        </div>
      </div>
    );
  };

  class PdfTextLayerRenderHandle implements RenderHandle {
    constructor(
      private readonly root: HTMLElement,
      private readonly getBlockElement: (blockId: string) => HTMLElement | null
    ) {}

    update(): void {}

    queryLayout(range: DocumentRange) {
      const host = this.getBlockElement(range.blockId);
      if (!host) return [];
      const spans = Array.from(
        host.querySelectorAll<HTMLElement>(
          `span[data-pdf-block-id="${range.blockId}"]`
        )
      );
      if (!spans.length) {
        const rects = Array.from(host.getClientRects()).map(
          (r) => new DOMRect(r.x, r.y, r.width, r.height)
        );
        return rects.length ? [{ range, boundingRects: rects }] : [];
      }

      const start = range.startOffset ?? 0;
      const end = range.endOffset ?? start;

      let offset = 0;
      const rects: DOMRect[] = [];
      for (const span of spans) {
        const text = span.textContent ?? "";
        const spanStart = offset;
        const spanEnd = offset + text.length;
        offset = spanEnd;
        const overlaps = end > spanStart && start < spanEnd;
        if (!overlaps) continue;
        const r = span.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          rects.push(new DOMRect(r.x, r.y, r.width, r.height));
        }
      }
      return rects.length ? [{ range, boundingRects: rects }] : [];
    }

    mapPointToRange(point: DOMPoint): DocumentRange | null {
      const el = document.elementFromPoint(
        point.x,
        point.y
      ) as HTMLElement | null;
      const span = el?.closest?.(
        "span[data-pdf-block-id]"
      ) as HTMLElement | null;
      const blockId = span?.dataset.pdfBlockId;
      if (blockId) return { blockId };
      return null;
    }

    observeLayoutChange(range: DocumentRange, callback: any) {
      const el = this.getBlockElement(range.blockId);
      if (!el) return () => undefined;
      const observer = new ResizeObserver(() => {
        const layouts = this.queryLayout(range);
        if (layouts[0]) callback(layouts[0]);
      });
      observer.observe(el);
      // 최초 1회
      const layouts = this.queryLayout(range);
      if (layouts[0]) callback(layouts[0]);
      return () => observer.disconnect();
    }

    dispose(): void {}
  }

  // AnnotationService 인스턴스 생성 (컴포넌트 생명주기 동안 유지)
  const annotationServiceRef = React.useRef<AnnotationService | null>(null);
  if (!annotationServiceRef.current) {
    annotationServiceRef.current =
      propAnnotationService ||
      new AnnotationService({
        onError: (error) => {
          console.warn("AnnotationService error", error);
          onError?.(error instanceof Error ? error : new Error(String(error)));
        },
      });
  }
  const annotationService = annotationServiceRef.current;

  // DocumentAdapterRegistry 생성 및 어댑터 등록
  const adapterRegistryRef = React.useRef<DocumentAdapterRegistry | null>(null);
  if (!adapterRegistryRef.current) {
    adapterRegistryRef.current =
      propAdapterRegistry ?? createDefaultAdapterRegistry();
  }
  const adapterRegistry = adapterRegistryRef.current;

  // PDF 문서가 로드되면, 문서 단위로 PDFDocumentProxy를 1번만 생성해서 캐싱합니다.
  React.useEffect(() => {
    if (!isPdfDocument || !documentModel) {
      pdfDocPromiseRef.current = null;
      pdfDocIdRef.current = null;
      return;
    }

    const docId = documentModel.id ?? "pdf";
    if (pdfDocPromiseRef.current && pdfDocIdRef.current === docId) {
      return; // 이미 준비됨
    }

    pdfDocIdRef.current = docId;
    pdfDocPromiseRef.current = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      if (typeof window !== "undefined") {
        try {
          (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        } catch {
          // ignore
        }
      }
      // IMPORTANT: pdf.js가 data를 transfer(detach)할 수 있으므로, 원본 raw를 직접 넘기지 말고 복사본을 넘깁니다.
      const raw = documentModel.raw as ArrayBuffer;
      const safeCopy = raw.slice(0);
      const task = (pdfjsLib as any).getDocument({ data: safeCopy });
      return await task.promise;
    })();
  }, [isPdfDocument, documentModel]);

  // 문서 변경 시 콜백 호출
  React.useEffect(() => {
    onDocumentChange?.(documentModel);
  }, [documentModel, onDocumentChange]);

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const descriptor = {
        extension,
        mimeType: file.type || undefined,
        metadata: { name: file.name },
      };

      // 디버깅: 파일 정보 로그
      console.log("🔍 파일 업로드 시도:", {
        extension,
        mimeType: file.type,
        fileName: file.name,
        descriptor,
      });

      const allAdapters = adapterRegistry.listAdapters();
      console.log(
        "📋 등록된 어댑터 목록 (총 " + allAdapters.length + "개):",
        allAdapters.map((a) => ({
          id: a.id,
          label: a.label,
          extensions: a.supportedExtensions,
          mimes: a.supportedMimes,
        }))
      );

      if (allAdapters.length === 0) {
        console.error(
          "❌ 등록된 어댑터가 없습니다! 레지스트리 초기화가 실패했을 수 있습니다."
        );
        setErrorMessage(
          "문서 뷰어 초기화에 실패했습니다. 페이지를 새로고침해주세요."
        );
        return;
      }

      // 각 어댑터가 이 파일을 처리할 수 있는지 확인
      allAdapters.forEach((adapter) => {
        const canHandle = adapter.canHandle(descriptor);
        console.log(`  - ${adapter.id}: canHandle = ${canHandle}`, {
          extension,
          supportedExtensions: adapter.supportedExtensions,
          mimeType: file.type,
          supportedMimes: adapter.supportedMimes,
        });
      });

      const parser = adapterRegistry.findParser(descriptor) as
        | DocumentParser
        | undefined;
      console.log(
        "🔎 찾은 파서:",
        parser ? { id: parser.id, label: parser.label } : "없음"
      );
      if (!parser) {
        const errorMsg = `지원하지 않는 파일 형식입니다: .${extension} (현재 지원: .txt, .docx, .me, .md, .pdf, .hwp)`;
        setErrorMessage(errorMsg);
        onError?.(new Error(errorMsg));
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const model = await parser.parse({
          buffer,
          descriptor,
        });

        // 문서 모델에 메타데이터 추가
        const newModel: DocumentModel = {
          ...model,
          // IMPORTANT: 어댑터가 생성한 id/raw/blocks 구조를 유지해야 합니다.
          // 특히 PDF는 custom(pdfPage) 블록 + raw(ArrayBuffer)를 기반으로 렌더링합니다.
          id: model.id ?? `doc-${Date.now()}`,
          metadata: {
            ...model.metadata,
            title: file.name,
            author: model.metadata?.author ?? user.name,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        };

        console.log("🧩 파싱 완료 모델 요약:", {
          id: newModel.id,
          blockCount: newModel.blocks?.length,
          hasRaw: newModel.raw instanceof ArrayBuffer,
          hasPdfPageBlocks:
            Array.isArray(newModel.blocks) &&
            newModel.blocks.some(
              (b: any) => b?.type === "custom" && b?.data?.kind === "pdfPage"
            ),
        });

        setDocumentModel(newModel);
        setErrorMessage(null);
        // 어노테이션 초기화
        annotationService.deserialize({
          annotations: [],
          notes: [],
          version: 1,
        });
      } catch (error) {
        console.error(error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : "파일 파싱 중 오류가 발생했습니다.";
        setErrorMessage(errorMsg);
        onError?.(error instanceof Error ? error : new Error(errorMsg));
      }
    },
    [adapterRegistry, annotationService, user.name, onError]
  );

  const handlePickFile = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 텍스트 선택 처리
  React.useEffect(() => {
    if (!rootElement || !documentModel) return;

    const updateSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      const range = selection.getRangeAt(0);
      if (!rootElement.contains(range.commonAncestorContainer)) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      // 블록 요소 찾기 (일반 블록 또는 PDF 텍스트 레이어)
      const findBlockElement = (
        node: Node
      ): { element: HTMLElement; blockId: string } | null => {
        let current: Node | null = node;
        while (current) {
          if (current instanceof HTMLElement) {
            // PDF 텍스트 레이어의 span인 경우
            if (current.dataset.pdfBlockId) {
              // PDF 페이지 컨테이너 찾기
              const pdfPage = current.closest(
                "[data-pdf-page-block-id]"
              ) as HTMLElement;
              if (pdfPage && pdfPage.dataset.pdfPageBlockId) {
                return {
                  element: pdfPage,
                  blockId: pdfPage.dataset.pdfPageBlockId,
                };
              }
              // 직접 span에서 blockId 가져오기
              return { element: current, blockId: current.dataset.pdfBlockId };
            }
            // 일반 블록인 경우
            if (current.dataset.blockId) {
              return { element: current, blockId: current.dataset.blockId };
            }
          }
          current = current.parentNode;
        }
        return null;
      };

      const startBlockInfo = findBlockElement(range.startContainer);
      const endBlockInfo = findBlockElement(range.endContainer);

      if (
        !startBlockInfo ||
        !endBlockInfo ||
        startBlockInfo.blockId !== endBlockInfo.blockId
      ) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      const blockId = startBlockInfo.blockId;

      try {
        // PDF 텍스트 레이어인지 확인
        const isPdfTextLayer =
          startBlockInfo.element.closest(".react-pdf__Page__textContent") !==
          null;

        let blockText = "";
        let startOffset = 0;
        let endOffset = 0;

        if (isPdfTextLayer) {
          // PDF 텍스트 레이어: 모든 span의 텍스트를 순서대로 합쳐서 계산
          const textLayer = startBlockInfo.element.closest(
            ".react-pdf__Page__textContent"
          );
          if (!textLayer) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }

          const allSpans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${blockId}"]`
            )
          );
          const selectedText = selection.toString();

          // 선택된 텍스트로부터 오프셋 계산
          let currentOffset = 0;
          let foundStart = false;
          let foundEnd = false;

          for (const span of allSpans) {
            const spanText = span.textContent || "";
            const spanStart = currentOffset;
            const spanEnd = currentOffset + spanText.length;

            // 선택 범위와 겹치는지 확인
            if (!foundStart && range.intersectsNode(span)) {
              // 선택 시작 위치 계산
              const tempRange = document.createRange();
              tempRange.setStart(textLayer, 0);
              tempRange.setEnd(range.startContainer, range.startOffset);
              const beforeText = tempRange.toString();
              startOffset = beforeText.length;
              foundStart = true;
            }

            if (range.intersectsNode(span)) {
              // 선택 종료 위치 계산
              const tempRange = document.createRange();
              tempRange.setStart(textLayer, 0);
              tempRange.setEnd(range.endContainer, range.endOffset);
              const beforeText = tempRange.toString();
              endOffset = beforeText.length;
              foundEnd = true;
            }

            blockText += spanText;
            currentOffset = spanEnd;

            if (foundStart && foundEnd) break;
          }

          if (!foundStart || !foundEnd || startOffset === endOffset) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }
        } else {
          // 일반 블록: 기존 로직
          const blockContent =
            startBlockInfo.element.querySelector<HTMLElement>(
              ".document-viewer__block-content"
            ) || startBlockInfo.element;
          blockText = blockContent.textContent || "";

          // 간단한 오프셋 계산
          const rangeForStart = document.createRange();
          rangeForStart.selectNodeContents(blockContent);
          rangeForStart.setEnd(range.startContainer, range.startOffset);
          startOffset = rangeForStart.toString().length;

          const rangeForEnd = document.createRange();
          rangeForEnd.selectNodeContents(blockContent);
          rangeForEnd.setEnd(range.endContainer, range.endOffset);
          endOffset = rangeForEnd.toString().length;

          if (startOffset === endOffset) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }
        }

        const text = blockText.slice(startOffset, endOffset);
        setSelectedRange({
          blockId,
          startOffset: Math.max(0, Math.min(startOffset, blockText.length)),
          endOffset: Math.max(
            startOffset,
            Math.min(endOffset, blockText.length)
          ),
        });
        setSelectedText(text);
      } catch (error) {
        console.warn("선택 영역 계산 실패:", error);
        setSelectedRange(null);
        setSelectedText("");
      }
    };

    document.addEventListener("selectionchange", updateSelection);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
    };
  }, [rootElement, documentModel]);

  React.useEffect(() => {
    setSelectedRange(null);
    setSelectedText("");
  }, [documentModel]);

  const clearSelection = React.useCallback(() => {
    setSelectedRange(null);
    setSelectedText("");
    const selection = window.getSelection();
    selection?.removeAllRanges();
  }, []);

  const handleApplySelection = React.useCallback(() => {
    if (!selectedRange) return;

    const range: DocumentRange = {
      blockId: selectedRange.blockId,
      startOffset: selectedRange.startOffset,
      endOffset: selectedRange.endOffset,
    };

    if (activeTool === "highlight") {
      annotationService.createHighlight(range, {
        style: { color: "rgba(250, 204, 21, 0.6)", label: "사용자 지정" },
        author: { id: user.id, name: user.name },
      });
    } else if (activeTool === "underline") {
      annotationService.createUnderline(range, {
        style: {
          underlineColor: "#2563eb",
          underlineThickness: 2,
          underlineStyle: "solid",
          label: "사용자 지정",
        },
        author: { id: user.id, name: user.name },
      });
    } else {
      // note
      const annotation = annotationService.createHighlight(range, {
        style: { color: "rgba(14, 165, 233, 0.25)", label: "메모" },
        author: { id: user.id, name: user.name },
      });
      const content = window
        .prompt("메모 내용을 입력하세요", selectedText)
        ?.trim();
      if (content) {
        annotationService.addNote(annotation.id, {
          content,
          author: { id: user.id, name: user.name },
        });
      } else {
        annotationService.removeAnnotation(annotation.id);
      }
    }

    clearSelection();
  }, [
    activeTool,
    annotationService,
    selectedRange,
    selectedText,
    clearSelection,
    user,
  ]);

  // 키보드 단축키: Ctrl+1 (형광펜), Ctrl+2 (밑줄)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 입력 필드에 포커스가 있을 때는 단축키 무시
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ctrl+1: 형광펜 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setActiveTool("highlight");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        }
        return;
      }

      // Ctrl+2: 밑줄 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "2") {
        event.preventDefault();
        setActiveTool("underline");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRange, selectedText, handleApplySelection]);

  // DocumentViewer actions
  const actions = React.useMemo<DocumentViewerAction[]>(() => {
    if (customActions) {
      return customActions;
    }
    return [
      {
        id: "highlight",
        label: "형광펜",
        active: activeTool === "highlight",
        onClick: () => setActiveTool("highlight"),
      },
      {
        id: "underline",
        label: "밑줄",
        active: activeTool === "underline",
        onClick: () => setActiveTool("underline"),
      },
      {
        id: "note",
        label: "메모",
        active: activeTool === "note",
        onClick: () => setActiveTool("note"),
      },
    ];
  }, [activeTool, customActions]);

  if (!documentModel) {
    return (
      <div
        style={{ padding: 20, textAlign: "center", ...style }}
        className={className}
      >
        <p style={{ marginBottom: 16, color: "#666" }}>
          PDF 파일을 포함한 문서 파일을 업로드하여 시작하세요.
        </p>
        <button
          onClick={handlePickFile}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
            background: "#2F80ED",
            color: "white",
            border: "none",
            borderRadius: 6,
          }}
        >
          PDF 파일 선택 (.pdf, .txt, .docx, .md, .hwp)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx,.me,.md,.pdf,.hwp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {errorMessage && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#fee",
              color: "#c33",
              borderRadius: 4,
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={style} className={className}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={handlePickFile}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            background: "#2F80ED",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          다른 파일 불러오기
        </button>
        <span style={{ color: "#666", fontSize: 14 }}>
          현재 문서: {documentModel.metadata?.title ?? "제목 없음"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx,.me,.md,.pdf,.hwp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#fee",
            color: "#c33",
            borderRadius: 4,
          }}
        >
          {errorMessage}
        </div>
      )}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          overflow: "hidden",
          background: "white",
        }}
      >
        <DocumentViewer
          document={documentModel}
          annotationService={annotationService}
          actions={actions}
          pagination={
            documentModel.pageBreaks && documentModel.pageBreaks.length > 0
              ? {
                  enabled: true,
                  useDocumentPageBreaks: true,
                  showNavigation: true,
                  showPageNumbers: true,
                }
              : undefined
          }
          renderHandleFactory={
            isPdfDocument
              ? (root, getElement) =>
                  new PdfTextLayerRenderHandle(root, getElement)
              : undefined
          }
          renderBlock={
            isPdfDocument
              ? (block: DocumentBlock, _segments: any, context: any) => {
                  if (block.type !== "custom") return null;
                  const data = (block as any).data as any;
                  if (!data || data.kind !== "pdfPage") return null;
                  const pageNum = Number(data.pageNum);
                  const pdfDocPromise = pdfDocPromiseRef.current;
                  if (!pdfDocPromise) {
                    return (
                      <div key={block.id} data-block-id={block.id}>
                        PDF 로딩 중...
                      </div>
                    );
                  }
                  const ann = context.snapshot.annotations.filter(
                    (a: AnnotationEntry) => a.range.blockId === block.id
                  );
                  return (
                    <div key={block.id} data-block-id={block.id}>
                      <PdfPageBlock
                        blockId={block.id}
                        pageNum={pageNum}
                        pdfDocPromise={pdfDocPromise}
                        annotations={ann}
                      />
                    </div>
                  );
                }
              : undefined
          }
          style={{ height }}
          searchEnabled={searchEnabled}
          onRootRef={setRootElement}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        💡 텍스트를 드래그하여 선택한 후 Ctrl+1 (형광펜), Ctrl+2 (밑줄)로
        어노테이션을 추가하거나 툴바 버튼을 사용할 수 있습니다.
      </div>
    </div>
  );
};
