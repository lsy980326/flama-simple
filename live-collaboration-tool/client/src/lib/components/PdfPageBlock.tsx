import React from "react";
import type { AnnotationEntry } from "../annotations/types";
import type { AnnotationService } from "../annotations/AnnotationService";

export type PdfSelectedRange =
  | { blockId: string; startOffset: number; endOffset: number }
  | null
  | undefined;

export interface PdfPageBlockProps {
  blockId: string;
  pageNum: number;
  pdfDocPromise: Promise<any>;
  annotations: AnnotationEntry[];
  selectedRange?: PdfSelectedRange;
  annotationService?: AnnotationService;
}

type OverlayRect = { left: number; top: number; width: number; height: number };

function getRectsForSpanTextRange(
  span: HTMLElement,
  localStart: number,
  localEnd: number
): DOMRect[] {
  const start = Math.max(0, localStart);
  const end = Math.max(start, localEnd);
  if (end <= start) return [];

  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }
  if (!textNodes.length) {
    const r = span.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? [r] : [];
  }

  // localStart/localEnd를 텍스트 노드 경계로 매핑
  let acc = 0;
  let startNode: Text = textNodes[0];
  let endNode: Text = textNodes[textNodes.length - 1];
  let startOffset = 0;
  let endOffset = endNode.data.length;

  for (const node of textNodes) {
    const len = node.data.length;
    if (start >= acc && start < acc + len) {
      startNode = node;
      startOffset = start - acc;
    }
    if (end >= acc && end <= acc + len) {
      endNode = node;
      endOffset = end - acc;
      break;
    }
    acc += len;
  }

  try {
    const r = document.createRange();
    r.setStart(
      startNode,
      Math.max(0, Math.min(startOffset, startNode.data.length))
    );
    r.setEnd(
      endNode,
      Math.max(0, Math.min(endOffset, endNode.data.length))
    );
    const raw = Array.from(r.getClientRects()).filter(
      (x) => x.width > 0 && x.height > 0
    );

    return raw.map((x) => new DOMRect(x.x, x.y, x.width, x.height));
  } catch {
    const rr = span.getBoundingClientRect();
    return rr.width > 0 && rr.height > 0 ? [rr] : [];
  }
}

function mergeRectsIntoLines(
  rects: OverlayRect[],
  opts?: { yTolerance?: number; xGap?: number; minWidth?: number }
): OverlayRect[] {
  const yTolerance = opts?.yTolerance ?? 3;
  const xGap = opts?.xGap ?? 2;
  const minWidth = opts?.minWidth ?? 0.5;

  const normalized = rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      left: r.left,
      top: r.top,
      width: Math.max(r.width, minWidth),
      height: r.height,
    }))
    .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));

  if (!normalized.length) return [];

  // 1) 줄(행)로 그룹핑
  const lines: Array<{ top: number; height: number; rects: OverlayRect[] }> = [];
  for (const r of normalized) {
    const line = lines.find(
      (l) => Math.abs(l.top - r.top) <= yTolerance && Math.abs(l.height - r.height) <= yTolerance
    );
    if (line) {
      line.rects.push(r);
      // top/height는 첫 rect를 기준으로 고정(너무 흔들리지 않게)
    } else {
      lines.push({ top: r.top, height: r.height, rects: [r] });
    }
  }

  // 2) 각 줄에서 인접 rect 병합
  const merged: OverlayRect[] = [];
  for (const line of lines) {
    const rs = line.rects.sort((a, b) => a.left - b.left);
    let cur = { ...rs[0] };
    for (let i = 1; i < rs.length; i++) {
      const r = rs[i];
      const curRight = cur.left + cur.width;
      if (r.left <= curRight + xGap) {
        const newRight = Math.max(curRight, r.left + r.width);
        cur.width = newRight - cur.left;
        cur.top = Math.min(cur.top, r.top);
        cur.height = Math.max(cur.height, r.height);
      } else {
        merged.push(cur);
        cur = { ...r };
      }
    }
    merged.push(cur);
  }

  return merged.sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));
}

/**
 * PDF 페이지 블록 렌더링 (캔버스 + 텍스트 레이어 + 오버레이)
 *
 * IMPORTANT:
 * - DocumentViewerWithUpload 내부에서 컴포넌트를 선언하면, 선택 상태 변경 시마다
 *   React가 컴포넌트 타입을 다르게 인식해 언마운트/리마운트가 발생할 수 있습니다.
 *   이는 mouseup 순간 selection/오버레이가 사라지는 원인이 됩니다.
 * - 따라서 별도 파일로 분리해 컴포넌트 아이덴티티를 안정화합니다.
 */
export const PdfPageBlock: React.FC<PdfPageBlockProps> = React.memo(
  ({ blockId, pageNum, pdfDocPromise, annotations, selectedRange, annotationService }) => {
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
      // IMPORTANT:
      // pdf.js `Page.getViewport({ scale })`는 PDF 단위 기준 스케일이며,
      // viewer(TextLayerBuilder + pdf_viewer.css)는 `scale * PDF_TO_CSS_UNITS(=96/72)`를 사용합니다.
      // 여기서 viewport와 CSS 변수(--scale-factor)가 서로 다르면 텍스트 레이어/선택/오버레이가
      // 옆 글자를 침범하는 현상이 발생할 수 있으므로 반드시 동일한 값으로 맞춥니다.
      const PDF_TO_CSS_UNITS = 96 / 72;
      const userScale = 1.5; // TODO: 추후 외부에서 줌 스케일을 받아오도록 변경 가능
      const viewport = page.getViewport({ scale: userScale * PDF_TO_CSS_UNITS });

      // pdf_viewer.css의 TextLayer는 CSS 변수(--scale-factor 등)에 의존합니다.
      // 커스텀 렌더링이므로 페이지 컨테이너에 직접 값을 주입합니다.
      // viewport.scale === userScale * PDF_TO_CSS_UNITS
      pageContainer.style.setProperty("--scale-factor", String(viewport.scale));
      pageContainer.style.setProperty("--user-unit", "1");
      pageContainer.style.setProperty("--total-scale-factor", String(viewport.scale));

        if (cancelled) return;

        // 1) 캔버스
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

        // 2) 텍스트 레이어
        try {
          try {
            // @ts-ignore - CSS 파일은 webpack이 처리
            await import("pdfjs-dist/web/pdf_viewer.css");
          } catch (cssError) {
            console.warn("PDF viewer CSS 로드 실패 (계속 진행):", cssError);
          }

          const pdfViewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
          const builder = new (pdfViewer as any).TextLayerBuilder({
            pdfPage: page,
            enablePermissions: false,
          });

          builder.div.classList.add("react-pdf__Page__textContent");
          builder.div.classList.add("textLayer");

          builder.div.style.position = "absolute";
          builder.div.style.left = "0";
          builder.div.style.top = "0";
          builder.div.style.width = `${viewport.width}px`;
          builder.div.style.height = `${viewport.height}px`;
          builder.div.style.zIndex = "100";
          builder.div.style.pointerEvents = "auto";
          builder.div.style.userSelect = "text";
          (builder.div.style as any).webkitUserSelect = "text";
          builder.div.style.cursor = "text";
          builder.div.style.margin = "0";
          builder.div.style.padding = "0";
          builder.div.style.transform = "none";

          // IMPORTANT: scale 변수는 pageContainer에 주입했으므로 여기서는 재주입하지 않습니다.

          await builder.render({ viewport });

          (builder.div.querySelectorAll("span") as NodeListOf<HTMLElement>).forEach(
            (span) => {
              span.dataset.pdfBlockId = blockId;
              span.style.pointerEvents = "auto";
            }
          );

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

    // 3) 오버레이 (선택/어노테이션)
    const [overlayNodes, setOverlayNodes] = React.useState<React.ReactNode[]>(
      []
    );
    const [hoveredAnnotationId, setHoveredAnnotationId] = React.useState<string | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const overlayContainerRef = React.useRef<HTMLDivElement | null>(null);
    
    // 드래그 감지
    React.useEffect(() => {
      const handleMouseDown = () => {
        setIsDragging(false);
      };
      
      const handleMouseMove = () => {
        if (document.activeElement && (document.activeElement as HTMLElement).closest('.pdf-page')) {
          setIsDragging(true);
        }
      };
      
      const handleMouseUp = () => {
        setTimeout(() => setIsDragging(false), 100);
      };
      
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, []);

    React.useEffect(() => {
      const pageEl = pageRef.current;
      if (!pageEl) {
        setOverlayNodes([]);
        return;
      }

      let cleanupActive: (() => void) | null = null;
      let mutationObserver: MutationObserver | null = null;

      const setupWithTextLayer = (textLayer: HTMLElement) => {
        const nodes: React.ReactNode[] = [];

        // 선택 영역 오버레이
        if (selectedRange && selectedRange.blockId === blockId) {
          const allSpans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${blockId}"]`
            )
          );
          if (allSpans.length > 0) {
            const textLayerRect = textLayer.getBoundingClientRect();
            const rects: OverlayRect[] = [];

            let runOffset = 0;
            for (const span of allSpans) {
              const spanText = span.textContent || "";
              const spanStart = runOffset;
              const spanEnd = runOffset + spanText.length;
              runOffset = spanEnd;

              const overlapStart = Math.max(
                spanStart,
                selectedRange.startOffset ?? 0
              );
              const overlapEnd = Math.min(
                spanEnd,
                selectedRange.endOffset ?? 0
              );
              if (overlapEnd <= overlapStart) continue;

              const localStart = overlapStart - spanStart;
              const localEnd = overlapEnd - spanStart;
              const domRects = getRectsForSpanTextRange(span, localStart, localEnd);
              domRects.forEach((r) => {
                rects.push({
                  left: r.left - textLayerRect.left,
                  top: r.top - textLayerRect.top,
                  width: r.width,
                  height: r.height,
                });
              });
            }

            const mergedRects = mergeRectsIntoLines(rects, { yTolerance: 3, xGap: 2 });
            mergedRects.forEach((r, idx) => {
              nodes.push(
                <div
                  key={`selection-${idx}`}
                  style={{
                    position: "absolute",
                    left: `${r.left}px`,
                    top: `${r.top}px`,
                    width: `${r.width}px`,
                    height: `${r.height}px`,
                    background: "rgba(59, 130, 246, 0.35)",
                    border: "1px solid rgba(59, 130, 246, 0.55)",
                    borderRadius: "2px",
                    pointerEvents: "none",
                  }}
                />
              );
            });
          }
        }

        // 어노테이션 오버레이
        annotations.forEach((a) => {
          const range = a.range;
          if (!range || range.blockId !== blockId) return;

          const allSpans = Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              `span[data-pdf-block-id="${blockId}"]`
            )
          );
          if (!allSpans.length) return;

          const textLayerRect = textLayer.getBoundingClientRect();
          const rects: OverlayRect[] = [];

          let runOffset = 0;
          for (const span of allSpans) {
            const spanText = span.textContent || "";
            const spanStart = runOffset;
            const spanEnd = runOffset + spanText.length;
            runOffset = spanEnd;

            const startOffset = range.startOffset ?? 0;
            const endOffset = range.endOffset ?? startOffset;
            const overlapStart = Math.max(spanStart, startOffset);
            const overlapEnd = Math.min(spanEnd, endOffset);
            if (overlapEnd <= overlapStart) continue;

            const localStart = overlapStart - spanStart;
            const localEnd = overlapEnd - spanStart;
            const domRects = getRectsForSpanTextRange(span, localStart, localEnd);
            domRects.forEach((r) => {
              rects.push({
                left: r.left - textLayerRect.left,
                top: r.top - textLayerRect.top,
                width: r.width,
                height: r.height,
              });
            });
          }

          if (!rects.length) return;

          const mergedRects = mergeRectsIntoLines(rects, { yTolerance: 3, xGap: 2 });

          mergedRects.forEach((r, idx) => {
            const isHovered = hoveredAnnotationId === a.id;
            if (a.type === "highlight") {
              nodes.push(
                <div
                  key={`${a.id}-hl-${idx}`}
                  data-annotation-id={a.id}
                  style={{
                    position: "absolute",
                    left: `${r.left}px`,
                    top: `${r.top}px`,
                    width: `${r.width}px`,
                    height: `${r.height}px`,
                    background: a.style?.color ?? "rgba(250, 204, 21, 0.6)",
                    pointerEvents: "none",
                    opacity: isHovered ? 0.8 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                />
              );
              // 삭제 버튼을 위한 투명한 영역 (호버 감지용) - 드래그 중이 아닐 때만 활성화
              if (annotationService && !isDragging) {
                nodes.push(
                  <div
                    key={`${a.id}-hl-interactive-${idx}`}
                    data-annotation-id={a.id}
                    style={{
                      position: "absolute",
                      left: `${r.left}px`,
                      top: `${r.top}px`,
                      width: `${r.width}px`,
                      height: `${r.height}px`,
                      pointerEvents: "auto",
                      cursor: "pointer",
                      zIndex: 250,
                    }}
                    onMouseEnter={() => {
                      setHoveredAnnotationId(a.id);
                    }}
                    onMouseLeave={() => {
                      setHoveredAnnotationId(null);
                    }}
                    onClick={(e) => {
                      if (window.confirm("메모를 삭제하시겠습니까?")) {
                        e.preventDefault();
                        e.stopPropagation();
                        annotationService.removeAnnotation(a.id);
                      }
                    }}
                  />
                );
              }
              // 삭제 버튼 표시
              if (isHovered && annotationService) {
                nodes.push(
                  <button
                    key={`${a.id}-delete-${idx}`}
                    type="button"
                    className="document-viewer__annotation-delete"
                    style={{
                      position: "absolute",
                      left: `${r.left + r.width - 8}px`,
                      top: `${r.top - 8}px`,
                      zIndex: 300,
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (window.confirm("메모를 삭제하시겠습니까?")) {
                        annotationService.removeAnnotation(a.id);
                      }
                    }}
                    title="어노테이션 삭제"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    ×
                  </button>
                );
              }
            } else if (a.type === "underline") {
              nodes.push(
                <div
                  key={`${a.id}-ul-${idx}`}
                  data-annotation-id={a.id}
                  style={{
                    position: "absolute",
                    left: `${r.left}px`,
                    top: `${r.top + r.height - 2}px`,
                    width: `${r.width}px`,
                    height: `2px`,
                    background: a.style?.underlineColor ?? "#2563eb",
                    pointerEvents: "none",
                    opacity: isHovered ? 0.8 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                />
              );
              // 삭제 버튼을 위한 투명한 영역 (호버 감지용) - 밑줄 영역 위에, 드래그 중이 아닐 때만 활성화
              if (annotationService && !isDragging) {
                nodes.push(
                  <div
                    key={`${a.id}-ul-interactive-${idx}`}
                    data-annotation-id={a.id}
                    style={{
                      position: "absolute",
                      left: `${r.left}px`,
                      top: `${r.top}px`,
                      width: `${r.width}px`,
                      height: `${r.height}px`,
                      pointerEvents: "auto",
                      cursor: "pointer",
                      zIndex: 250,
                    }}
                    onMouseEnter={() => {
                      setHoveredAnnotationId(a.id);
                    }}
                    onMouseLeave={() => {
                      setHoveredAnnotationId(null);
                    }}
                    onClick={(e) => {
                      if (window.confirm("메모를 삭제하시겠습니까?")) {
                        e.preventDefault();
                        e.stopPropagation();
                        annotationService.removeAnnotation(a.id);
                      }
                    }}
                  />
                );
              }
              // 삭제 버튼 표시
              if (isHovered && annotationService) {
                nodes.push(
                  <button
                    key={`${a.id}-delete-${idx}`}
                    type="button"
                    className="document-viewer__annotation-delete"
                    style={{
                      position: "absolute",
                      left: `${r.left + r.width - 8}px`,
                      top: `${r.top + r.height - 8}px`,
                      zIndex: 300,
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (window.confirm("메모를 삭제하시겠습니까?")) {
                        annotationService.removeAnnotation(a.id);
                      }
                    }}
                    title="어노테이션 삭제"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    ×
                  </button>
                );
              }
            }
          });
        });

        setOverlayNodes(nodes);

        if (overlayContainerRef.current) {
          const textLayerRect = textLayer.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          overlayContainerRef.current.style.position = "absolute";
          overlayContainerRef.current.style.left = `${textLayerRect.left - pageRect.left}px`;
          overlayContainerRef.current.style.top = `${textLayerRect.top - pageRect.top}px`;
          overlayContainerRef.current.style.width = `${textLayerRect.width}px`;
          overlayContainerRef.current.style.height = `${textLayerRect.height}px`;
        }
      };

      const start = (textLayer: HTMLElement) => {
        const update = () => setupWithTextLayer(textLayer);
        update();

        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(textLayer);
        resizeObserver.observe(pageEl);

        const handleScroll = () => update();
        window.addEventListener("scroll", handleScroll, true);

        cleanupActive = () => {
          resizeObserver.disconnect();
          window.removeEventListener("scroll", handleScroll, true);
        };
      };

      // textLayer가 아직 생성되지 않은 경우(페이지 이동/복귀 직후) 생성될 때까지 기다렸다가 시작
      const initialTextLayer = pageEl.querySelector<HTMLElement>(
        ".react-pdf__Page__textContent, .textLayer"
      );
      if (initialTextLayer) {
        start(initialTextLayer);
      } else {
        setOverlayNodes([]);
        mutationObserver = new MutationObserver(() => {
          const tl = pageEl.querySelector<HTMLElement>(
            ".react-pdf__Page__textContent, .textLayer"
          );
          if (tl) {
            mutationObserver?.disconnect();
            mutationObserver = null;
            start(tl);
          }
        });
        mutationObserver.observe(pageEl, { childList: true, subtree: true });
      }

      return () => {
        cleanupActive?.();
        cleanupActive = null;
        mutationObserver?.disconnect();
        mutationObserver = null;
      };
    }, [annotations, blockId, selectedRange, hoveredAnnotationId, annotationService, isDragging]);

    return (
      <div style={{ position: "relative" }}>
        <div ref={hostRef} />
        <div
          ref={overlayContainerRef}
          style={{
            position: "absolute",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          {overlayNodes}
        </div>
      </div>
    );
  }
);

PdfPageBlock.displayName = "PdfPageBlock";


