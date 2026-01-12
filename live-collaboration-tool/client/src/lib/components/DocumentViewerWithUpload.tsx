import React from "react";
import { DocumentViewer, DocumentViewerAction } from "./DocumentViewer";
import { PdfPageBlock } from "./PdfPageBlock";
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
  // 브라우저 native selection이 mouseup 직후 사라져도(또는 우리가 removeAllRanges 해도)
  // 마지막 선택을 유지/재사용할 수 있도록 저장합니다.
  const lastValidRangeRef = React.useRef<{
    blockId: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const lastValidTextRef = React.useRef<string>("");
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

  // NOTE: PdfPageBlock은 별도 파일로 분리하여 렌더마다 언마운트/리마운트되는 문제를 방지합니다.

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

  const scrollToAnnotation = React.useCallback(
    (annotationId: string) => {
      if (!rootElement) return;
      if (!isPdfDocument) return;

      const ann = annotationService
        .listAnnotations()
        .find((a) => a.id === annotationId);
      if (!ann) return;

      const canvasEl = rootElement.querySelector<HTMLElement>(".document-viewer__canvas");
      if (!canvasEl) return;

      const tryScroll = () => {
        // 1) DOM에서 직접 range의 실제 rect를 계산 (layout이 아직 없거나 stale일 수 있음)
        const blockEl = rootElement.querySelector<HTMLElement>(
          `[data-block-id="${ann.range.blockId}"]`
        );
        const textLayer = blockEl?.querySelector<HTMLElement>(
          ".textLayer, .react-pdf__Page__textContent"
        );
        if (textLayer) {
          const spans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${ann.range.blockId}"]`
            )
          );
          if (spans.length) {
            const startOffset = ann.range.startOffset ?? 0;
            const endOffset = ann.range.endOffset ?? startOffset;

            let runOffset = 0;
            let bestRect: DOMRect | null = null;

            for (const span of spans) {
              const spanText = span.textContent || "";
              const spanStart = runOffset;
              const spanEnd = runOffset + spanText.length;
              runOffset = spanEnd;

              const overlapStart = Math.max(spanStart, startOffset);
              const overlapEnd = Math.min(spanEnd, endOffset);
              if (overlapEnd <= overlapStart) continue;

              // 선택된 문자 범위를 Range로 잘라서 rect를 얻음
              const localStart = overlapStart - spanStart;
              const localEnd = overlapEnd - spanStart;

              const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
              const textNodes: Text[] = [];
              while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
              if (!textNodes.length) continue;

              // local offset -> text node mapping
              let acc = 0;
              let sNode: Text = textNodes[0];
              let eNode: Text = textNodes[textNodes.length - 1];
              let sOff = 0;
              let eOff = eNode.data.length;
              for (const n of textNodes) {
                const len = n.data.length;
                if (localStart >= acc && localStart < acc + len) {
                  sNode = n;
                  sOff = localStart - acc;
                }
                if (localEnd >= acc && localEnd <= acc + len) {
                  eNode = n;
                  eOff = localEnd - acc;
                  break;
                }
                acc += len;
              }

              try {
                const r = document.createRange();
                r.setStart(sNode, Math.max(0, Math.min(sOff, sNode.data.length)));
                r.setEnd(eNode, Math.max(0, Math.min(eOff, eNode.data.length)));
                const rects = Array.from(r.getClientRects()).filter((x) => x.width > 0 && x.height > 0);
                for (const rr of rects) {
                  const dr = new DOMRect(rr.x, rr.y, rr.width, rr.height);
                  if (!bestRect || dr.top < bestRect.top) bestRect = dr;
                }
              } catch {
                // ignore
              }

              if (bestRect) break; // 첫 overlap에서 충분
            }

            if (bestRect) {
              const canvasRect = canvasEl.getBoundingClientRect();
              const targetTop =
                canvasEl.scrollTop + (bestRect.top - canvasRect.top) - 120;
              canvasEl.scrollTo({
                top: Math.max(0, targetTop),
                behavior: "smooth",
              });
              return true;
            }
          }
        }

        // 2) fallback: RenderHandle이 계산한 layout 사용
        const layoutRects = ann.layout?.[0]?.boundingRects ?? [];
        const rect = layoutRects.length
          ? layoutRects.reduce((min, r) => (r.top < min.top ? r : min), layoutRects[0])
          : null;
        if (!rect) return false;

        const canvasRect = canvasEl.getBoundingClientRect();
        const targetTop = canvasEl.scrollTop + (rect.top - canvasRect.top) - 120;
        canvasEl.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
        return true;
      };

      // textLayer가 늦게 붙는 케이스를 위해 짧게 재시도
      let attempts = 0;
      const tick = () => {
        attempts += 1;
        if (tryScroll()) return;
        if (attempts < 30) requestAnimationFrame(tick);
      };
      tick();
    },
    [annotationService, isPdfDocument, rootElement]
  );

  // 텍스트 선택 처리 (안정 버전: mouseup에서만 계산)
  // - 드래그 중에는 브라우저 기본 selection 표시만 사용 (깜빡임 방지)
  // - mouseup 시점에만 선택을 계산해서 selectedRange/selectedText를 세팅
  // - 이후 native selection을 제거하고 커스텀 오버레이로 선택영역을 유지
  React.useEffect(() => {
    if (!rootElement || !documentModel) return;

    const handleMouseUpStable = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (!rootElement.contains(range.commonAncestorContainer)) {
        return;
      }

      const findBlockElement = (
        node: Node
      ): { element: HTMLElement; blockId: string } | null => {
        let current: Node | null = node;
        while (current) {
          if (current instanceof HTMLElement) {
            if (current.dataset.pdfBlockId) {
              const pdfPage = current.closest(
                "[data-pdf-page-block-id]"
              ) as HTMLElement | null;
              if (pdfPage?.dataset.pdfPageBlockId) {
                return { element: pdfPage, blockId: pdfPage.dataset.pdfPageBlockId };
              }
              return { element: current, blockId: current.dataset.pdfBlockId };
            }
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
        return;
      }

      const blockId = startBlockInfo.blockId;

      try {
        const isPdfTextLayer =
          startBlockInfo.element.closest(".react-pdf__Page__textContent") !==
          null;

        let blockText = "";
        let startOffset = 0;
        let endOffset = 0;

        if (isPdfTextLayer) {
          const textLayer = startBlockInfo.element.closest(
            ".textLayer, .react-pdf__Page__textContent"
          ) as HTMLElement | null;
          if (!textLayer) return;

          const allSpans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${blockId}"]`
            )
          );
          if (!allSpans.length) return;

          blockText = allSpans.map((s) => s.textContent || "").join("");

          // 선택 오프셋은 오버레이 렌더링(PdfPageBlock)의 span-join 기준과 동일해야 합니다.
          // 기존 normalizeBoundary 기반 로직은 일부 브라우저/텍스트레이어 케이스에서
          // endOffset이 다음 span까지 "밀려" 들어가는 문제가 남아있었습니다.
          // 여기서는 실제로 선택 Range와 교차(intersect)하는 span 목록을 기준으로
          // start/end span을 결정하고, 각 span 내부 오프셋은 Range->toString().length로 계산합니다.
          const offsetBefore = (idx: number) => {
            let acc = 0;
            for (let i = 0; i < idx; i++) acc += allSpans[i].textContent?.length || 0;
            return acc;
          };

          const intersects = (span: HTMLElement) => {
            try {
              return range.intersectsNode(span);
            } catch {
              return false;
            }
          };

          const selectedSpans = allSpans.filter(intersects);
          if (!selectedSpans.length) return;

          const startSpan = selectedSpans[0];
          const endSpan = selectedSpans[selectedSpans.length - 1];
          const startIdx = allSpans.indexOf(startSpan);
          const endIdx = allSpans.indexOf(endSpan);
          if (startIdx < 0 || endIdx < 0) return;

          const localOffsetFromSpanStart = (span: HTMLElement, boundary: { node: Node; offset: number }) => {
            if (!span.contains(boundary.node)) return 0;
            try {
              const rLocal = document.createRange();
              rLocal.selectNodeContents(span);
              rLocal.setEnd(boundary.node, boundary.offset);
              return rLocal.toString().length;
            } catch {
              return 0;
            }
          };

          const localOffsetToSpanEnd = (span: HTMLElement, boundary: { node: Node; offset: number }) => {
            if (!span.contains(boundary.node)) return span.textContent?.length || 0;
            try {
              const rLocal = document.createRange();
              rLocal.selectNodeContents(span);
              rLocal.setEnd(boundary.node, boundary.offset);
              return rLocal.toString().length;
            } catch {
              return span.textContent?.length || 0;
            }
          };

          // start boundary는 원래 Range의 start를 그대로 사용(교차 span 기반으로 startSpan은 안전)
          const startB = { node: range.startContainer, offset: range.startOffset };
          const endB = { node: range.endContainer, offset: range.endOffset };

          const localStart = localOffsetFromSpanStart(startSpan, startB);
          const localEnd = localOffsetToSpanEnd(endSpan, endB);

          startOffset = offsetBefore(startIdx) + localStart;
          endOffset = offsetBefore(endIdx) + localEnd;
        } else {
          const blockContent =
            startBlockInfo.element.querySelector<HTMLElement>(
              ".document-viewer__block-content"
            ) || startBlockInfo.element;
          blockText = blockContent.textContent || "";

          const rangeForStart = document.createRange();
          rangeForStart.selectNodeContents(blockContent);
          rangeForStart.setEnd(range.startContainer, range.startOffset);
          startOffset = rangeForStart.toString().length;

          const rangeForEnd = document.createRange();
          rangeForEnd.selectNodeContents(blockContent);
          rangeForEnd.setEnd(range.endContainer, range.endOffset);
          endOffset = rangeForEnd.toString().length;
        }

        startOffset = Math.max(0, Math.min(startOffset, blockText.length));
        endOffset = Math.max(startOffset, Math.min(endOffset, blockText.length));
        if (endOffset <= startOffset) return;

        const text = blockText.slice(startOffset, endOffset);
        const newRange = { blockId, startOffset, endOffset };
        setSelectedRange(newRange);
        setSelectedText(text);
        lastValidRangeRef.current = newRange;
        lastValidTextRef.current = text;

        // mouseup 직후에는 브라우저 기본 selection 조각(파란 하이라이트)이 남아
        // 우리가 그린 "병합된 파란 오버레이"와 겹쳐 보일 수 있습니다.
        // 여기서는 native selection을 제거하고, 커스텀 오버레이만 남깁니다.
        // (드래그 중에는 native selection이 보이고, mouseup 후에는 오버레이로 고정)
        requestAnimationFrame(() => {
          try {
            selection.removeAllRanges();
          } catch {
            // ignore
          }
        });
      } catch (error) {
        console.warn("선택 영역 계산 실패(안정 버전):", error);
      }
    };

    document.addEventListener("mouseup", handleMouseUpStable, true);
    return () => {
      document.removeEventListener("mouseup", handleMouseUpStable, true);
    };
  }, [rootElement, documentModel]);

  // 텍스트 선택 처리 (legacy - disabled)
  React.useEffect(() => {
    if (!rootElement || !documentModel) return;
    // NOTE: selectionchange 기반 로직은 드래그 중 setState/DOM 업데이트로 깜빡임과 오프셋 불일치를 유발하여 비활성화합니다.
    return;

    let isSelecting = false;
    let updateTimeout: NodeJS.Timeout | null = null;
    let lastValidRange: { blockId: string; startOffset: number; endOffset: number } | null = null;

    const updateSelection = () => {
      const selection = window.getSelection();
      
      // 선택이 없거나 collapsed인 경우
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        // 드래그 중이 아니고, 마지막 유효한 선택이 있으면 유지
        if (!isSelecting && lastValidRange) {
          setSelectedRange(lastValidRange);
          return;
        }
        // 드래그 중이면 선택 초기화
        if (isSelecting) {
          setSelectedRange(null);
          setSelectedText("");
        }
        return;
      }

      const range = selection.getRangeAt(0);
      if (!rootElement || !rootElement.contains(range.commonAncestorContainer)) {
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

          // 모든 span의 텍스트를 순서대로 합쳐서 전체 텍스트 생성
          blockText = allSpans.map(span => span.textContent || "").join("");

          // 정확한 오프셋 계산: 실제로 선택된 span들만 찾아서 계산
          // range가 실제로 어떤 span들을 선택했는지 확인
          const selectedSpans: HTMLElement[] = [];
          
          // range가 교차하는 모든 span 찾기
          for (const span of allSpans) {
            // range가 span과 교차하는지 확인
            try {
              const spanRange = document.createRange();
              spanRange.selectNodeContents(span);
              
              // range와 spanRange가 겹치는지 확인
              if (range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
                  range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0) {
                // range가 span을 완전히 포함
                selectedSpans.push(span);
              } else if (range.compareBoundaryPoints(Range.START_TO_END, spanRange) < 0 &&
                         range.compareBoundaryPoints(Range.END_TO_START, spanRange) > 0) {
                // range와 span이 겹침
                selectedSpans.push(span);
              }
            } catch (e) {
              // span이 선택 범위와 겹치는지 간단히 확인
              if (range.intersectsNode(span)) {
                selectedSpans.push(span);
              }
            }
          }

          if (selectedSpans.length === 0) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }

          // 선택된 첫 번째 span과 마지막 span 찾기
          const firstSelectedSpan = selectedSpans[0];
          const lastSelectedSpan = selectedSpans[selectedSpans.length - 1];
          
          const firstSpanIndex = allSpans.indexOf(firstSelectedSpan);
          const lastSpanIndex = allSpans.indexOf(lastSelectedSpan);

          if (firstSpanIndex === -1 || lastSpanIndex === -1) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }

          // startOffset 계산: 첫 번째 선택된 span 이전까지의 텍스트 길이
          let offset = 0;
          for (let i = 0; i < firstSpanIndex; i++) {
            offset += allSpans[i].textContent?.length || 0;
          }
          
          // 첫 번째 span 내부의 오프셋 계산
          if (range.startContainer.nodeType === Node.TEXT_NODE && firstSelectedSpan.contains(range.startContainer)) {
            // span 내부의 텍스트 노드들 중에서 startContainer까지의 오프셋
            const textNodes = Array.from(firstSelectedSpan.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            let textOffset = 0;
            for (const textNode of textNodes) {
              if (textNode === range.startContainer) {
                textOffset += range.startOffset;
                break;
              }
              textOffset += textNode.textContent?.length || 0;
            }
            startOffset = offset + textOffset;
          } else {
            // range의 시작이 span의 시작인 경우
            startOffset = offset;
          }

          // endOffset 계산: 마지막 선택된 span까지의 텍스트 길이
          offset = 0;
          for (let i = 0; i < lastSpanIndex; i++) {
            offset += allSpans[i].textContent?.length || 0;
          }
          
          // 마지막 span 내부의 오프셋 계산
          if (range.endContainer.nodeType === Node.TEXT_NODE && lastSelectedSpan.contains(range.endContainer)) {
            const textNodes = Array.from(lastSelectedSpan.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            let textOffset = 0;
            for (const textNode of textNodes) {
              if (textNode === range.endContainer) {
                textOffset += range.endOffset;
                break;
              }
              textOffset += textNode.textContent?.length || 0;
            }
            endOffset = offset + textOffset;
          } else {
            // range의 끝이 span의 끝인 경우
            endOffset = offset + (lastSelectedSpan.textContent?.length || 0);
          }

          // 오프셋 검증 및 조정
          if (startOffset === endOffset) {
            setSelectedRange(null);
            setSelectedText("");
            return;
          }

          startOffset = Math.max(0, Math.min(startOffset, blockText.length));
          endOffset = Math.max(startOffset, Math.min(endOffset, blockText.length));
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
        const newRange = {
          blockId,
          startOffset: Math.max(0, Math.min(startOffset, blockText.length)),
          endOffset: Math.max(
            startOffset,
            Math.min(endOffset, blockText.length)
          ),
        };
        setSelectedRange(newRange);
        setSelectedText(text);
        // 마지막 유효한 선택 저장 (브라우저 선택이 사라져도 유지하기 위해)
        lastValidRange = newRange;
      } catch (error) {
        console.warn("선택 영역 계산 실패:", error);
        setSelectedRange(null);
        setSelectedText("");
      }
    };

    // 마우스 다운/업 이벤트로 드래그 상태 추적
    const handleMouseDown = (e: MouseEvent) => {
      // PDF 텍스트 레이어 외부를 클릭하면 선택 초기화
      const target = e.target as HTMLElement;
      if (!target.closest(".react-pdf__Page__textContent")) {
        // PDF 텍스트 레이어가 아니면 선택 초기화
        setSelectedRange(null);
        setSelectedText("");
        lastValidRange = null;
      }
      isSelecting = true;
    };

    const handleMouseUp = () => {
      isSelecting = false;
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
      
      // 마우스를 떼면 즉시 업데이트하여 선택 저장
      updateSelection();
      
      // mouseup 후 약간의 지연을 두고 다시 확인
      // (selectionchange가 발생하여 선택이 사라질 수 있음)
      setTimeout(() => {
        const selection = window.getSelection();
        // selection이 사라졌지만 lastValidRange가 있으면 유지
        if ((!selection || selection.rangeCount === 0 || selection.isCollapsed) && lastValidRange) {
          setSelectedRange(lastValidRange);
        }
      }, 100);
    };

    // 드래그 중에도 선택 영역을 업데이트 (throttle 적용)
    let lastUpdateTime = 0;
    const throttledUpdateSelection = () => {
      const now = Date.now();
      if (now - lastUpdateTime < 16) { // ~60fps로 제한
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          lastUpdateTime = Date.now();
          updateSelection();
        }, 16);
        return;
      }
      lastUpdateTime = now;
      updateSelection();
    };

    // selectionchange 이벤트: 드래그 중에는 throttled, 아닐 때는 즉시
    const handleSelectionChange = () => {
      if (isSelecting) {
        throttledUpdateSelection();
      } else {
        updateSelection();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      if (updateTimeout) clearTimeout(updateTimeout);
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

  const makeExcerpt = React.useCallback((text: string) => {
    const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
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
        meta: { excerpt: makeExcerpt(selectedText) },
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
        meta: { excerpt: makeExcerpt(selectedText) },
      });
    } else {
      // note
      const annotation = annotationService.createHighlight(range, {
        style: { color: "rgba(14, 165, 233, 0.25)", label: "메모" },
        author: { id: user.id, name: user.name },
        meta: { excerpt: makeExcerpt(selectedText) },
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
          scrollToAnnotation={scrollToAnnotation}
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
                        selectedRange={selectedRange}
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
