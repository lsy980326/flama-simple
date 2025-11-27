import React from "react";
import { AnnotationService } from "../annotations/AnnotationService";
import {
  AnnotationEntry,
  AnnotationNote,
  AnnotationSnapshot,
} from "../annotations/types";
import {
  DocumentBlock,
  DocumentModel,
  DocumentRange,
  DocumentLayoutInfo,
  RenderHandle,
} from "../documents/types";
import "./DocumentViewer.css";

type ClassInput =
  | string
  | Record<string, boolean | undefined | null>
  | Array<string | undefined | null | false>
  | undefined
  | null
  | false;

function cx(...inputs: ClassInput[]): string {
  const classes: string[] = [];
  inputs.forEach((input) => {
    if (!input) {
      return;
    }
    if (typeof input === "string") {
      classes.push(input);
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((item) => {
        if (item) {
          classes.push(item);
        }
      });
      return;
    }
    Object.entries(input).forEach(([key, value]) => {
      if (value) {
        classes.push(key);
      }
    });
  });
  return classes.join(" ");
}

export interface DocumentViewerAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface DocumentViewerTheme {
  background?: string;
  surface?: string;
  accent?: string;
  textColor?: string;
  sidebarWidth?: string;
  highlightColor?: string;
}

export interface SearchResult {
  blockId: string;
  blockIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface DocumentViewerRenderContext {
  document: DocumentModel;
  snapshot: AnnotationSnapshot;
  annotationService: AnnotationService;
  actions: DocumentViewerAction[];
  noteDrafts: Record<string, string>;
  setNoteDraft: (annotationId: string, value: string) => void;
  addNote: (annotationId: string, content: string) => void;
  updateNote: (noteId: string, content: string) => void;
  removeNote: (noteId: string) => void;
  getExcerpt: (annotation: AnnotationEntry) => string;
  getAnnotationLocation: (annotationId: string) => { page: number | null; line: number | null };
  searchQuery: string;
  searchResults: SearchResult[];
  currentSearchIndex: number;
  search: (query: string) => void;
  goToNextSearch: () => void;
  goToPreviousSearch: () => void;
  noteSearchQuery: string;
  setNoteSearchQuery: (query: string) => void;
  scrollToAnnotation?: (annotationId: string) => void;
  onAnnotationClick?: (annotationId: string) => void;
}

export interface DocumentViewerSegment {
  text: string;
  annotations: AnnotationEntry[];
  isSearchMatch?: boolean; // 검색 결과 여부
  searchMatchIndex?: number; // 검색 결과 인덱스
}

export interface DocumentViewerPaginationConfig {
  enabled?: boolean; // 페이지네이션 활성화 여부
  blocksPerPage?: number; // 한 페이지에 표시할 블록 수 (기본값: 20)
  useDocumentPageBreaks?: boolean; // 문서의 페이지 브레이크 정보 사용 (HWP 등)
  showPageNumbers?: boolean; // 페이지 번호 표시 여부
  showNavigation?: boolean; // 페이지 네비게이션 표시 여부
}

export interface PresenceUser {
  clientId: string;
  user: { id: string; name: string };
  lastSeen: number;
  cursor?: { blockId: string; offset: number } | null;
  selection?: { blockId: string; start: number; end: number } | null;
}

export interface DocumentViewerProps {
  document: DocumentModel;
  annotationService: AnnotationService;
  actions?: DocumentViewerAction[];
  className?: string;
  style?: React.CSSProperties;
  theme?: DocumentViewerTheme;
  notePlaceholder?: string;
  pagination?: DocumentViewerPaginationConfig; // 페이지네이션 설정
  searchEnabled?: boolean; // 검색 기능 활성화 여부
  presenceUsers?: PresenceUser[]; // 다른 사용자의 presence 정보 (커서/선택 영역 표시용)
  currentClientId?: string | null; // 본인의 clientId (본인 커서는 표시하지 않음)
  renderHeader?: (context: DocumentViewerRenderContext) => React.ReactNode;
  renderToolbar?: (context: DocumentViewerRenderContext) => React.ReactNode;
  renderSidebar?: (context: DocumentViewerRenderContext) => React.ReactNode;
  renderBlock?: (
    block: DocumentBlock,
    segments: DocumentViewerSegment[],
    context: DocumentViewerRenderContext
  ) => React.ReactNode;
  onAddNote?: (annotationId: string, content: string) => void;
  renderHandleFactory?: (
    root: HTMLElement,
    getElement: (blockId: string) => HTMLElement | null
  ) => RenderHandle;
  onRootRef?: (element: HTMLElement | null) => void;
  onAnnotationClick?: (annotationId: string) => void;
  scrollToAnnotation?: (annotationId: string) => void;
}

export class DefaultRenderHandle implements RenderHandle {
  constructor(
    private readonly root: HTMLElement,
    private readonly getBlockElement: (blockId: string) => HTMLElement | null
  ) {}

  update(): void {
    // no-op for DOM-based implementation
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
      if (!element) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const isInside =
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom;
      if (isInside) {
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
    // no resources to release
  }
}

function toPlainText(block: DocumentBlock): string {
  if ("runs" in block) {
    return block.runs.map((run) => run.text).join("");
  }
  if (block.type === "image") {
    return block.caption?.map((run) => run.text).join("") ?? "";
  }
  return "";
}

function buildSegments(
  block: DocumentBlock,
  textContent: string,
  annotations: AnnotationEntry[],
  searchMatches?: Array<{ start: number; end: number; index: number }>
): DocumentViewerSegment[] {
  // 검색 결과와 어노테이션을 함께 정렬
  const allRanges: Array<{
    start: number;
    end: number;
    type: "annotation" | "search";
    annotation?: AnnotationEntry;
    searchIndex?: number;
  }> = [];

  // 어노테이션 범위 추가
  annotations
    .filter((annotation) => annotation.range.startOffset !== undefined)
    .forEach((annotation) => {
      allRanges.push({
        start: annotation.range.startOffset ?? 0,
        end: annotation.range.endOffset ?? annotation.range.startOffset ?? 0,
        type: "annotation",
        annotation,
      });
    });

  // 검색 결과 범위 추가
  if (searchMatches) {
    searchMatches.forEach((match) => {
      allRanges.push({
        start: match.start,
        end: match.end,
        type: "search",
        searchIndex: match.index,
      });
    });
  }

  // 범위 정렬
  allRanges.sort((a, b) => a.start - b.start);

  if (!allRanges.length) {
    return [{ text: textContent, annotations: [] }];
  }

  const segments: DocumentViewerSegment[] = [];
  let cursor = 0;

  allRanges.forEach((range) => {
    if (range.start > cursor) {
      segments.push({
        text: textContent.slice(cursor, range.start),
        annotations: [],
      });
    }

    const clampedEnd = Math.max(range.start, range.end);
    const segmentText = textContent.slice(range.start, clampedEnd);

    if (range.type === "annotation" && range.annotation) {
      segments.push({
        text: segmentText,
        annotations: [range.annotation],
      });
    } else if (range.type === "search") {
      segments.push({
        text: segmentText,
        annotations: [],
        isSearchMatch: true,
        searchMatchIndex: range.searchIndex,
      });
    }

    cursor = clampedEnd;
  });

  if (cursor < textContent.length) {
    segments.push({
      text: textContent.slice(cursor),
      annotations: [],
    });
  }

  return segments;
}

function getAnnotationClassName(annotation: AnnotationEntry): string {
  return cx("document-viewer__annotation", {
    "document-viewer__annotation--highlight": annotation.type === "highlight",
    "document-viewer__annotation--underline": annotation.type === "underline",
  });
}

// 사용자별 색상 생성 (일관된 색상 할당)
const getUserColor = (clientId: string): string => {
  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
  ];
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// 다른 사용자의 커서/선택 영역 오버레이 컴포넌트
const UserCursorsOverlay: React.FC<{
  rootElement: HTMLElement;
  presenceUsers: PresenceUser[];
  document: DocumentModel;
  currentClientId?: string | null; // 본인의 clientId (본인 커서는 표시하지 않음)
}> = ({ rootElement, presenceUsers, currentClientId }) => {
  // canvas 요소 찾기 (실제 문서가 렌더링되는 컨테이너)
  const canvasElement = React.useMemo(() => {
    return rootElement.querySelector<HTMLElement>('.document-viewer__canvas');
  }, [rootElement]);
  const [cursorPositions, setCursorPositions] = React.useState<
    Map<
      string,
      {
        cursor?: { x: number; y: number; blockId: string };
        selection?: { x: number; y: number; width: number; height: number; blockId: string };
      }
    >
  >(new Map());

  React.useEffect(() => {
    const updatePositions = () => {
      const positions = new Map<
        string,
        {
          cursor?: { x: number; y: number; blockId: string };
          selection?: { x: number; y: number; width: number; height: number; blockId: string };
        }
      >();

      for (const user of presenceUsers) {
        // 본인의 커서는 표시하지 않음
        if (currentClientId && user.clientId === currentClientId) continue;
        
        if (!user.cursor && !user.selection) continue;

        const userPos: {
          cursor?: { x: number; y: number; blockId: string };
          selection?: { x: number; y: number; width: number; height: number; blockId: string };
        } = {};

        // 커서 위치 계산
        if (user.cursor && canvasElement) {
          const blockElement = canvasElement.querySelector<HTMLElement>(
            `[data-block-id="${user.cursor.blockId}"]`
          );
          if (blockElement) {
            // .document-viewer__block-content 내부의 텍스트 노드 찾기
            const blockContent = blockElement.querySelector<HTMLElement>(
              ".document-viewer__block-content"
            ) || blockElement;
            
            // 블록 내의 모든 텍스트 노드 찾기
            const walker = window.document.createTreeWalker(
              blockContent,
              NodeFilter.SHOW_TEXT,
              null
            );
            let textNode: Text | null = null;
            let totalLength = 0;
            const textNodes: Text[] = [];
            
            while (walker.nextNode()) {
              const node = walker.currentNode as Text;
              textNodes.push(node);
              const nodeLength = node.length;
              if (totalLength + nodeLength >= user.cursor.offset) {
                textNode = node;
                break;
              }
              totalLength += nodeLength;
            }
            
            // 텍스트 노드를 찾지 못한 경우 첫 번째 텍스트 노드 사용
            if (!textNode && textNodes.length > 0) {
              textNode = textNodes[0];
              totalLength = 0;
            }
            
            if (textNode) {
              const offsetInNode = Math.max(0, Math.min(
                user.cursor.offset - totalLength,
                textNode.length
              ));
              try {
                const range = window.document.createRange();
                range.setStart(textNode, offsetInNode);
                range.setEnd(textNode, offsetInNode);
                const rect = range.getBoundingClientRect();
                const canvasRect = canvasElement.getBoundingClientRect();
                
                // rect가 유효한 경우에만 커서 위치 설정
                // canvas 요소를 기준으로 상대 위치 계산
                if (rect && !isNaN(rect.left) && !isNaN(rect.top)) {
                  userPos.cursor = {
                    x: rect.left - canvasRect.left + canvasElement.scrollLeft,
                    y: rect.top - canvasRect.top + canvasElement.scrollTop,
                    blockId: user.cursor.blockId,
                  };
                } else if (blockElement) {
                  // Range를 만들 수 없는 경우 블록 요소의 시작 위치 사용
                  const blockRect = blockElement.getBoundingClientRect();
                  const canvasRect = canvasElement.getBoundingClientRect();
                  userPos.cursor = {
                    x: blockRect.left - canvasRect.left + canvasElement.scrollLeft,
                    y: blockRect.top - canvasRect.top + canvasElement.scrollTop,
                    blockId: user.cursor.blockId,
                  };
                }
              } catch (e) {
                // Range 생성 실패 시 무시
              }
            }
          }
        }

        // 선택 영역 계산
        if (user.selection && canvasElement) {
          const blockElement = canvasElement.querySelector<HTMLElement>(
            `[data-block-id="${user.selection.blockId}"]`
          );
          if (blockElement) {
            // .document-viewer__block-content 내부의 텍스트 노드 찾기
            const blockContent = blockElement.querySelector<HTMLElement>(
              ".document-viewer__block-content"
            ) || blockElement;
            
            // 블록 내의 모든 텍스트 노드 찾기
            const walker = window.document.createTreeWalker(
              blockContent,
              NodeFilter.SHOW_TEXT,
              null
            );
            let startNode: Text | null = null;
            let endNode: Text | null = null;
            let totalLength = 0;
            let startOffsetInNode = 0;
            let endOffsetInNode = 0;
            
            while (walker.nextNode()) {
              const node = walker.currentNode as Text;
              const nodeLength = node.length;
              
              if (!startNode && totalLength + nodeLength >= user.selection.start) {
                startNode = node;
                startOffsetInNode = Math.max(0, user.selection.start - totalLength);
              }
              
              if (!endNode && totalLength + nodeLength >= user.selection.end) {
                endNode = node;
                endOffsetInNode = Math.max(0, user.selection.end - totalLength);
                break;
              }
              
              totalLength += nodeLength;
            }
            
            // endNode를 찾지 못한 경우 startNode를 사용
            if (startNode && !endNode) {
              endNode = startNode;
              endOffsetInNode = Math.min(startOffsetInNode + 1, startNode.length);
            }
            
            if (startNode && endNode) {
              try {
                const range = window.document.createRange();
                range.setStart(startNode, Math.max(0, Math.min(startOffsetInNode, startNode.length)));
                range.setEnd(endNode, Math.max(0, Math.min(endOffsetInNode, endNode.length)));
                const rect = range.getBoundingClientRect();
                const canvasRect = canvasElement.getBoundingClientRect();
                
                // rect가 유효한 경우에만 선택 영역 설정
                // canvas 요소를 기준으로 상대 위치 계산
                if (rect && (rect.width > 0 || rect.height > 0)) {
                  userPos.selection = {
                    x: rect.left - canvasRect.left + canvasElement.scrollLeft,
                    y: rect.top - canvasRect.top + canvasElement.scrollTop,
                    width: Math.max(rect.width, 1), // 최소 너비 1px
                    height: Math.max(rect.height, 1), // 최소 높이 1px
                    blockId: user.selection.blockId,
                  };
                }
              } catch (e) {
                // Range 생성 실패 시 무시
              }
            }
          }
        }

        if (userPos.cursor || userPos.selection) {
          positions.set(user.clientId, userPos);
        }
      }

      setCursorPositions(positions);
    };

    if (!canvasElement) {
      return;
    }
    
    updatePositions();
    const interval = setInterval(updatePositions, 100); // 100ms마다 업데이트
    return () => clearInterval(interval);
  }, [rootElement, canvasElement, presenceUsers]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {Array.from(cursorPositions.entries()).map(([clientId, pos]) => {
        const user = presenceUsers.find((u) => u.clientId === clientId);
        if (!user) return null;
        const color = getUserColor(clientId);

        return (
          <React.Fragment key={clientId}>
            {/* 커서 표시 */}
            {pos.cursor && (
              <div
                style={{
                  position: "absolute",
                  left: `${pos.cursor.x}px`,
                  top: `${pos.cursor.y}px`,
                  width: "2px",
                  height: "20px",
                  backgroundColor: color,
                  pointerEvents: "none",
                  boxShadow: `0 0 4px ${color}`,
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-20px",
                    left: "0px",
                    padding: "2px 6px",
                    fontSize: "11px",
                    backgroundColor: color,
                    color: "white",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 1001,
                  }}
                >
                  {user.user.name}
                </div>
              </div>
            )}
            {/* 선택 영역 표시 */}
            {pos.selection && (
              <div
                style={{
                  position: "absolute",
                  left: pos.selection.x,
                  top: pos.selection.y,
                  width: pos.selection.width,
                  height: pos.selection.height,
                  backgroundColor: `${color}40`,
                  border: `1px solid ${color}`,
                  pointerEvents: "none",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

function applyAnnotationStyle(annotation: AnnotationEntry): React.CSSProperties {
  const base: React.CSSProperties = {};
  if (annotation.type === "highlight") {
    base.backgroundColor =
      annotation.style?.color ?? "rgba(253, 224, 71, 0.6)";
    if (annotation.style?.opacity !== undefined) {
      base.opacity = annotation.style.opacity;
    }
  }
  if (annotation.type === "underline") {
    base.textDecorationLine = "underline";
    base.textDecorationStyle = annotation.style?.underlineStyle ?? "solid";
    base.textDecorationColor = annotation.style?.underlineColor ?? "#2563eb";
    base.textDecorationThickness =
      annotation.style?.underlineThickness ?? 2;
  }
  return base;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  annotationService,
  actions = [],
  className,
  style,
  theme,
  notePlaceholder = "메모를 입력하세요",
  pagination,
  searchEnabled = true,
  presenceUsers = [],
  currentClientId = null,
  renderHeader,
  renderToolbar,
  renderSidebar,
  renderBlock,
  onAddNote,
  renderHandleFactory,
  onRootRef,
  onAnnotationClick,
  scrollToAnnotation,
}) => {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const [rootElement, setRootElement] = React.useState<HTMLElement | null>(null);
  const blockRefs = React.useRef(new Map<string, HTMLElement>());
  const [snapshot, setSnapshot] = React.useState<AnnotationSnapshot>({
    annotations: [],
    notes: [],
  });
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>(
    {}
  );
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = React.useState(0);
  const pendingScrollBlock = React.useRef<{ blockId: string; annotationId?: string } | null>(null);
  
  // 검색 상태
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = React.useState(-1);
  
  // 메모 검색 상태
  const [noteSearchQuery, setNoteSearchQuery] = React.useState("");
  
  // 페이지 계산 함수
  const pageInfo = React.useMemo(() => {
    if (!pagination?.enabled) {
      return {
        totalPages: 1,
        currentPageBlocks: document.blocks,
        pageStarts: [0],
        currentPageIndex: 0,
      };
    }
    
    const blocks = document.blocks;
    if (blocks.length === 0) {
      return {
        totalPages: 1,
        currentPageBlocks: [],
        pageStarts: [0],
        currentPageIndex: 0,
      };
    }
    
    const pageStarts: number[] = [0];
    const useDocumentPageBreaks = pagination.useDocumentPageBreaks && document.pageBreaks && document.pageBreaks.length > 0;
    const blocksPerPage = pagination.blocksPerPage || 20;
    
    if (useDocumentPageBreaks && document.pageBreaks) {
      // 문서의 페이지 브레이크 사용 (HWP 등)
      // pageBreaks는 각 페이지 브레이크 이후의 첫 번째 블록 인덱스
      document.pageBreaks.forEach((breakIndex) => {
        if (breakIndex > 0 && breakIndex < blocks.length && !pageStarts.includes(breakIndex)) {
          pageStarts.push(breakIndex);
        }
      });
      // 정렬 (페이지 브레이크가 순서대로 오지 않을 수 있음)
      pageStarts.sort((a, b) => a - b);
      // 중복 제거
      const uniquePageStarts = Array.from(new Set(pageStarts));
      pageStarts.length = 0;
      pageStarts.push(...uniquePageStarts);
    } else {
      // 블록 수 기반 자동 페이지 분할
      for (let i = blocksPerPage; i < blocks.length; i += blocksPerPage) {
        if (!pageStarts.includes(i)) {
          pageStarts.push(i);
        }
      }
    }
    
    const totalPages = Math.max(1, pageStarts.length);
    const clampedPage = Math.max(0, Math.min(currentPage, totalPages - 1));
    const startBlock = pageStarts[clampedPage];
    const endBlock = clampedPage < pageStarts.length - 1 
      ? pageStarts[clampedPage + 1] 
      : blocks.length;
    const currentPageBlocks = blocks.slice(startBlock, endBlock);
    
    return {
      totalPages,
      currentPageBlocks,
      pageStarts,
      currentPageIndex: clampedPage,
    };
  }, [document.blocks, document.pageBreaks, pagination, currentPage]);
  
  // 블록으로 스크롤 (페이지 내)
  const scrollToBlockInPage = React.useCallback((blockId: string, annotationId?: string) => {
    if (!rootElement) {
      return;
    }
    
    const blockElement = rootElement.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"]`
    );
    if (!blockElement) {
      return;
    }
    
    // 어노테이션이 지정된 경우 해당 span 요소로 스크롤
    if (annotationId) {
      const annotationSpans = Array.from(
        blockElement.querySelectorAll<HTMLElement>("[data-annotation-id]")
      );
      const targetSpan = annotationSpans.find(
        (span) => span.dataset.annotationId === annotationId
      );
      
      if (targetSpan) {
        targetSpan.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        // 하이라이트 효과
        const originalBg = targetSpan.style.backgroundColor;
        targetSpan.style.backgroundColor = "rgba(59, 130, 246, 0.5)";
        targetSpan.style.transition = "background-color 0.5s ease";
        setTimeout(() => {
          targetSpan.style.backgroundColor = originalBg;
        }, 1500);
        return;
      }
    }
    
    // span을 찾지 못하면 block으로 스크롤
    blockElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [rootElement]);
  
  // 현재 페이지가 변경되면 스크롤 상단으로 이동 (또는 pendingScrollBlock이 있으면 해당 블록으로)
  React.useEffect(() => {
    if (pagination?.enabled && rootElement) {
      const canvasElement = rootElement.querySelector<HTMLElement>('.document-viewer__canvas');
      if (canvasElement) {
        // pendingScrollBlock이 있으면 해당 블록으로 스크롤
        if (pendingScrollBlock.current) {
          const { blockId, annotationId } = pendingScrollBlock.current;
          // DOM 업데이트를 기다린 후 스크롤
          setTimeout(() => {
            scrollToBlockInPage(blockId, annotationId);
            pendingScrollBlock.current = null;
          }, 100);
        } else {
          // pendingScrollBlock이 없으면 상단으로 스크롤
          canvasElement.scrollTop = 0;
        }
      }
    }
  }, [pageInfo.currentPageIndex, pagination?.enabled, rootElement, scrollToBlockInPage]);
  
  // 블록 ID를 페이지 인덱스로 변환하는 함수
  const findPageForBlock = React.useCallback((blockId: string): number | null => {
    if (!pagination?.enabled) {
      return null; // 페이지네이션이 비활성화된 경우 null 반환
    }
    
    const blockIndex = document.blocks.findIndex(block => block.id === blockId);
    if (blockIndex === -1) {
      return null; // 블록을 찾을 수 없음
    }
    
    // pageStarts 계산 (pageInfo와 동일한 로직)
    const pageStarts: number[] = [0];
    const useDocumentPageBreaks = pagination.useDocumentPageBreaks && document.pageBreaks && document.pageBreaks.length > 0;
    const blocksPerPage = pagination.blocksPerPage || 20;
    
    if (useDocumentPageBreaks && document.pageBreaks) {
      // 문서의 페이지 브레이크 사용
      document.pageBreaks.forEach((breakIndex) => {
        if (breakIndex > 0 && breakIndex < document.blocks.length && !pageStarts.includes(breakIndex)) {
          pageStarts.push(breakIndex);
        }
      });
      pageStarts.sort((a, b) => a - b);
      const uniquePageStarts = Array.from(new Set(pageStarts));
      pageStarts.length = 0;
      pageStarts.push(...uniquePageStarts);
    } else {
      // 블록 수 기반 자동 페이지 분할
      for (let i = blocksPerPage; i < document.blocks.length; i += blocksPerPage) {
        if (!pageStarts.includes(i)) {
          pageStarts.push(i);
        }
      }
    }
    
    // pageStarts를 사용하여 블록이 어느 페이지에 있는지 찾기
    for (let pageIndex = 0; pageIndex < pageStarts.length; pageIndex++) {
      const startBlock = pageStarts[pageIndex];
      const endBlock = pageIndex < pageStarts.length - 1 
        ? pageStarts[pageIndex + 1] 
        : document.blocks.length;
      
      if (blockIndex >= startBlock && blockIndex < endBlock) {
        return pageIndex;
      }
    }
    
    return 0; // 기본값: 첫 페이지
  }, [pagination?.enabled, pagination?.useDocumentPageBreaks, pagination?.blocksPerPage, document.blocks, document.pageBreaks]);
  
  // 어노테이션 ID로 페이지 찾기
  const findPageForAnnotation = React.useCallback((annotationId: string): number | null => {
    const annotation = snapshot.annotations.find(a => a.id === annotationId);
    if (!annotation) {
      return null;
    }
    return findPageForBlock(annotation.range.blockId);
  }, [snapshot.annotations, findPageForBlock]);
  
  // 블록의 줄 번호 계산 (블록 인덱스를 줄 번호로 사용)
  const getLineNumberForBlock = React.useCallback((blockId: string): number | null => {
    const blockIndex = document.blocks.findIndex(block => block.id === blockId);
    if (blockIndex === -1) {
      return null;
    }
    // 블록 인덱스는 0부터 시작하므로 줄 번호는 +1
    return blockIndex + 1;
  }, [document.blocks]);
  
  // 어노테이션의 페이지 번호와 줄 번호 가져오기
  const getAnnotationLocation = React.useCallback((annotationId: string): { page: number | null; line: number | null } => {
    const annotation = snapshot.annotations.find(a => a.id === annotationId);
    if (!annotation) {
      return { page: null, line: null };
    }
    
    const blockId = annotation.range.blockId;
    if (!blockId) {
      return { page: null, line: null };
    }
    
    // 줄 번호 계산
    const line = getLineNumberForBlock(blockId);
    
    // 페이지 번호 계산 (페이지네이션이 활성화된 경우에만)
    let page: number | null = null;
    if (pagination?.enabled) {
      page = findPageForAnnotation(annotationId);
    }
    
    return { page, line };
  }, [snapshot.annotations, findPageForAnnotation, getLineNumberForBlock, pagination?.enabled]);

  // 어노테이션의 excerpt 가져오기
  const getExcerpt = React.useCallback(
    (annotation: AnnotationEntry) => {
      // 전체 문서의 블록에서 찾기 (현재 페이지에 없는 블록도 포함)
      const targetBlock = document.blocks.find(
        (block) => block.id === annotation.range.blockId
      );
      if (!targetBlock) {
        return "";
      }

      const textContent = toPlainText(targetBlock);
      if (!textContent || textContent.length === 0) {
        return "";
      }

      const { startOffset, endOffset } = annotation.range;
      if (
        typeof startOffset !== "number" ||
        typeof endOffset !== "number" ||
        startOffset < 0 ||
        endOffset > textContent.length ||
        startOffset >= endOffset
      ) {
        console.warn("getExcerpt: offset이 없거나 잘못됨", {
          startOffset,
          endOffset,
          textContent,
        });
        // offset이 없거나 잘못된 경우 블록의 처음 부분을 반환
        return textContent.substring(0, Math.min(60, textContent.length));
      }

      const excerpt = textContent.slice(startOffset, endOffset);
      if (!excerpt || excerpt.trim().length === 0) {
        console.warn("getExcerpt: excerpt가 비어있음", {
          startOffset,
          endOffset,
          textContent,
        });
        // offset이 없거나 잘못된 경우 블록의 처음 부분을 반환
        return textContent.substring(0, Math.min(60, textContent.length));
      }

      return excerpt.trim();
    },
    [document.blocks]
  );

  // 메모 검색 하이라이트 함수
  const highlightNote = React.useCallback((content: string, query: string): React.ReactNode => {
    if (!query.trim()) {
      return content;
    }
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = content.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ background: "rgba(250, 204, 21, 0.4)", padding: "0 2px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  }, []);

  // 메모 검색 필터링
  const filteredAnnotations = React.useMemo(() => {
    if (!noteSearchQuery.trim()) {
      return snapshot.annotations;
    }
    const query = noteSearchQuery.trim().toLowerCase();
    const notesByAnnotation = new Map<string, AnnotationNote[]>();
    snapshot.notes.forEach((note) => {
      const list = notesByAnnotation.get(note.annotationId) ?? [];
      list.push(note);
      notesByAnnotation.set(note.annotationId, list);
    });

    return snapshot.annotations.filter((annotation) => {
      // 어노테이션의 excerpt 검색
      const excerpt = getExcerpt(annotation);
      if (excerpt.toLowerCase().includes(query)) {
        return true;
      }
      // 메모 내용 검색
      const notes = notesByAnnotation.get(annotation.id) ?? [];
      return notes.some((note) => note.content.toLowerCase().includes(query));
    });
  }, [snapshot.annotations, snapshot.notes, noteSearchQuery, getExcerpt]);
  
  // 페이지 변경 함수 (현재 사용되지 않음)
  // const goToPage = React.useCallback((page: number) => {
  //   if (pagination?.enabled && page >= 0 && page < pageInfo.totalPages) {
  //     setCurrentPage(page);
  //   }
  // }, [pagination?.enabled, pageInfo.totalPages]);
  
  const goToPreviousPage = React.useCallback(() => {
    if (pagination?.enabled && pageInfo.currentPageIndex > 0) {
      setCurrentPage(pageInfo.currentPageIndex - 1);
    }
  }, [pagination?.enabled, pageInfo.currentPageIndex]);
  
  const goToNextPage = React.useCallback(() => {
    if (pagination?.enabled && pageInfo.currentPageIndex < pageInfo.totalPages - 1) {
      setCurrentPage(pageInfo.currentPageIndex + 1);
    }
  }, [pagination?.enabled, pageInfo.currentPageIndex, pageInfo.totalPages]);
  
  // 어노테이션으로 스크롤 (페이지네이션 지원)
  const handleScrollToAnnotation = React.useCallback((annotationId: string) => {
    const annotation = snapshot.annotations.find(a => a.id === annotationId);
    if (!annotation) {
      return;
    }
    
    // 페이지네이션이 활성화된 경우 해당 페이지로 이동
    if (pagination?.enabled) {
      const targetPage = findPageForAnnotation(annotationId);
      if (targetPage !== null && targetPage !== pageInfo.currentPageIndex) {
        // 다른 페이지에 있는 경우: 페이지 이동 후 스크롤할 블록 정보 저장
        pendingScrollBlock.current = {
          blockId: annotation.range.blockId,
          annotationId: annotationId,
        };
        // 페이지 이동 (useEffect에서 스크롤 처리)
        setCurrentPage(targetPage);
        return;
      }
    }
    
    // 현재 페이지에 있는 경우 (또는 페이지네이션이 비활성화된 경우) 바로 스크롤
    scrollToBlockInPage(annotation.range.blockId, annotationId);
    
    // 외부 scrollToAnnotation도 호출 (페이지네이션이 비활성화된 경우)
    if (scrollToAnnotation && !pagination?.enabled) {
      scrollToAnnotation(annotationId);
    }
  }, [snapshot.annotations, pagination?.enabled, findPageForAnnotation, pageInfo.currentPageIndex, scrollToBlockInPage, scrollToAnnotation]);

  React.useEffect(() => {
    const unsubscribe = annotationService.subscribe(setSnapshot);
    return () => unsubscribe();
  }, [annotationService]);

  React.useEffect(() => {
    if (onRootRef) {
      onRootRef(rootElement);
      return () => {
        onRootRef(null);
      };
    }
    return;
  }, [rootElement, onRootRef]);

  React.useEffect(() => {
    if (!rootElement) {
      return;
    }
    const handle =
      renderHandleFactory?.(rootElement, (blockId: string) =>
        blockRefs.current.get(blockId) ?? null
      ) ??
      new DefaultRenderHandle(
        rootElement,
        (blockId: string) => blockRefs.current.get(blockId) ?? null
      );

    annotationService.attach(handle);

    return () => {
      annotationService.detach();
      handle.dispose();
    };
  }, [annotationService, renderHandleFactory, rootElement, document]);

  React.useEffect(() => {
    blockRefs.current.clear();
  }, [document]);

  // 현재 페이지의 블록만 포함하는 blocksWithText
  const blocksWithText = React.useMemo(() => {
    const blocksToRender = pagination?.enabled 
      ? pageInfo.currentPageBlocks 
      : document.blocks;
    return blocksToRender.map((block) => ({
      block,
      textContent: toPlainText(block),
    }));
  }, [document.blocks, pagination?.enabled, pageInfo.currentPageBlocks]);

  const addNote = React.useCallback(
    (annotationId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }
      if (onAddNote) {
        onAddNote(annotationId, trimmed);
      } else {
        annotationService.addNote(annotationId, {
          content: trimmed,
        });
      }
      setNoteDrafts((prev) => ({ ...prev, [annotationId]: "" }));
    },
    [annotationService, onAddNote]
  );

  const updateNote = React.useCallback(
    (noteId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }
      annotationService.updateNote(noteId, { content: trimmed });
    },
    [annotationService]
  );

  const removeNote = React.useCallback(
    (noteId: string) => {
      annotationService.removeNote(noteId);
    },
    [annotationService]
  );

  const setNoteDraft = React.useCallback(
    (annotationId: string, value: string) => {
      setNoteDrafts((prev) => ({ ...prev, [annotationId]: value }));
    },
    []
  );

  // 검색 기능
  const performSearch = React.useCallback((query: string): SearchResult[] => {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const results: SearchResult[] = [];
    const searchText = query.trim();
    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    document.blocks.forEach((block, blockIndex) => {
      const textContent = toPlainText(block);
      if (!textContent || textContent.length === 0) {
        return;
      }

      let match;
      while ((match = regex.exec(textContent)) !== null) {
        results.push({
          blockId: block.id,
          blockIndex,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          text: match[0],
        });
      }
    });

    return results;
  }, [document.blocks]);

  const handleSearch = React.useCallback((query: string) => {
    setSearchQuery(query);
    const results = performSearch(query);
    setSearchResults(results);
    if (results.length > 0) {
      setCurrentSearchIndex(0);
    } else {
      setCurrentSearchIndex(-1);
    }
  }, [performSearch]);

  const goToNextSearch = React.useCallback(() => {
    if (searchResults.length === 0) {
      return;
    }
    setCurrentSearchIndex((prev) => (prev + 1) % searchResults.length);
  }, [searchResults]);

  const goToPreviousSearch = React.useCallback(() => {
    if (searchResults.length === 0) {
      return;
    }
    setCurrentSearchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
  }, [searchResults]);

  // 검색 결과로 스크롤 및 페이지 이동
  React.useEffect(() => {
    if (currentSearchIndex >= 0 && currentSearchIndex < searchResults.length && rootElement) {
      const result = searchResults[currentSearchIndex];
      
      // 검색 결과가 있는 블록의 페이지 찾기
      if (pagination?.enabled) {
        const targetPage = findPageForBlock(result.blockId);
        if (targetPage !== null && targetPage !== pageInfo.currentPageIndex) {
          // 다른 페이지에 있으면 해당 페이지로 이동
          setCurrentPage(targetPage);
          // 페이지 변경 후 스크롤을 위해 pendingScrollBlock 설정
          pendingScrollBlock.current = {
            blockId: result.blockId,
            annotationId: undefined,
          };
          return;
        }
      }
      
      // 현재 페이지에 있으면 스크롤
      const blockElement = rootElement.querySelector<HTMLElement>(
        `[data-block-id="${result.blockId}"]`
      );
      if (blockElement) {
        // 검색 결과가 있는 블록으로 스크롤
        blockElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        // 검색 결과 하이라이트 (일시적으로)
        const textNode = blockElement.querySelector(".document-viewer__block-content");
        if (textNode) {
          // 검색 결과 강조 표시를 위한 임시 스타일 적용
          setTimeout(() => {
            blockElement.style.backgroundColor = "rgba(250, 204, 21, 0.2)";
            blockElement.style.transition = "background-color 0.5s ease";
            setTimeout(() => {
              blockElement.style.backgroundColor = "";
            }, 1500);
          }, 100);
        }
      }
    }
  }, [currentSearchIndex, searchResults, rootElement, pagination?.enabled, findPageForBlock, pageInfo.currentPageIndex]);

  // 검색 결과를 블록별로 그룹화
  const searchMatchesByBlock = React.useMemo(() => {
    const matches: Map<string, Array<{ start: number; end: number; index: number }>> = new Map();
    searchResults.forEach((result, index) => {
      const blockMatches = matches.get(result.blockId) ?? [];
      blockMatches.push({
        start: result.startOffset,
        end: result.endOffset,
        index,
      });
      matches.set(result.blockId, blockMatches);
    });
    return matches;
  }, [searchResults]);

  const context: DocumentViewerRenderContext = React.useMemo(
    () => ({
      document,
      snapshot,
      annotationService,
      actions,
      noteDrafts,
      setNoteDraft,
      addNote,
      updateNote,
      removeNote,
      getExcerpt,
      getAnnotationLocation,
      searchQuery,
      searchResults,
      currentSearchIndex,
      search: handleSearch,
      goToNextSearch,
      goToPreviousSearch,
      noteSearchQuery,
      setNoteSearchQuery,
      scrollToAnnotation: handleScrollToAnnotation,
      onAnnotationClick,
    }),
    [
      document,
      snapshot,
      annotationService,
      actions,
      noteDrafts,
      setNoteDraft,
      addNote,
      updateNote,
      removeNote,
      getExcerpt,
      getAnnotationLocation,
      searchQuery,
      searchResults,
      currentSearchIndex,
      handleSearch,
      goToNextSearch,
      goToPreviousSearch,
      noteSearchQuery,
      setNoteSearchQuery,
      handleScrollToAnnotation,
      onAnnotationClick,
    ]
  );

  const themeStyle: React.CSSProperties = React.useMemo(() => {
    if (!theme) {
      return {};
    }
    const vars: Record<string, string> = {};
    if (theme.background) {
      vars["--document-viewer-bg"] = theme.background;
    }
    if (theme.surface) {
      vars["--document-viewer-surface"] = theme.surface;
    }
    if (theme.accent) {
      vars["--document-viewer-accent"] = theme.accent;
    }
    if (theme.textColor) {
      vars["--document-viewer-text"] = theme.textColor;
    }
    if (theme.sidebarWidth) {
      vars["--document-viewer-sidebar-width"] = theme.sidebarWidth;
    }
    if (theme.highlightColor) {
      vars["--document-viewer-highlight"] = theme.highlightColor;
    }
    return vars;
  }, [theme]);

  const defaultHeader = React.useMemo(() => {
    return (
      <div className="document-viewer__header">
        <div>
          <h1 className="document-viewer__title">
            {document.metadata?.title ?? "제목 없는 문서"}
          </h1>
          {document.metadata?.description && (
            <p className="document-viewer__subtitle">
              {document.metadata.description}
            </p>
          )}
        </div>
        <div className="document-viewer__metadata">
          {document.metadata?.author && (
            <span>작성자: {document.metadata.author}</span>
          )}
          {document.metadata?.modifiedAt && (
            <span>
              수정일:{" "}
              {new Date(document.metadata.modifiedAt).toLocaleString("ko-KR")}
            </span>
          )}
          {document.metadata?.createdAt && (
            <span>
              생성일:{" "}
              {new Date(document.metadata.createdAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
      </div>
    );
  }, [document.metadata]);

  const defaultToolbar = React.useMemo(() => {
    if (!actions.length) {
      return (
        <div className="document-viewer__toolbar">
          <span>어노테이션 툴을 여기에 연결하세요.</span>
        </div>
      );
    }
    return (
      <div className="document-viewer__toolbar">
        <div className="document-viewer__toolbar-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={cx("document-viewer__toolbar-button", {
                "document-viewer__toolbar-button--active": action.active,
              })}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        <div className="document-viewer__toolbar-spacer" />
      </div>
    );
  }, [actions]);

  const defaultSidebar = React.useMemo(() => {
    if (!filteredAnnotations.length && !snapshot.annotations.length) {
      return (
        <aside className="document-viewer__sidebar">
          <h2>메모 & 하이라이트</h2>
          {/* 메모 검색 입력 */}
          <div style={{ marginBottom: "16px", padding: "0 12px" }}>
            <input
              type="text"
              placeholder="메모 검색..."
              value={noteSearchQuery}
              onChange={(e) => setNoteSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                background: "var(--document-viewer-surface)",
                color: "var(--document-viewer-text)",
              }}
            />
          </div>
          <p className="document-viewer__empty">등록된 어노테이션이 없습니다.</p>
        </aside>
      );
    }
    
    if (!filteredAnnotations.length) {
      return (
        <aside className="document-viewer__sidebar">
          <h2>메모 & 하이라이트</h2>
          {/* 메모 검색 입력 */}
          <div style={{ marginBottom: "16px", padding: "0 12px" }}>
            <input
              type="text"
              placeholder="메모 검색..."
              value={noteSearchQuery}
              onChange={(e) => setNoteSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                background: "var(--document-viewer-surface)",
                color: "var(--document-viewer-text)",
              }}
            />
          </div>
          <p className="document-viewer__empty">검색 결과가 없습니다.</p>
        </aside>
      );
    }
    
    const notesByAnnotation = new Map<string, AnnotationNote[]>();
    snapshot.notes.forEach((note) => {
      const list = notesByAnnotation.get(note.annotationId) ?? [];
      list.push(note);
      notesByAnnotation.set(note.annotationId, list);
    });
    return (
      <aside className="document-viewer__sidebar">
        <h2>메모 & 하이라이트</h2>
        {/* 메모 검색 입력 */}
        <div style={{ marginBottom: "16px", padding: "0 12px" }}>
          <input
            type="text"
            placeholder="메모 검색..."
            value={noteSearchQuery}
            onChange={(e) => setNoteSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: "6px",
              background: "var(--document-viewer-surface)",
              color: "var(--document-viewer-text)",
            }}
          />
        </div>
        {filteredAnnotations.map((annotation, index) => {
          const notes = notesByAnnotation.get(annotation.id) ?? [];
          const excerpt = getExcerpt(annotation);
          const location = getAnnotationLocation(annotation.id);
          // 헤더 클릭 핸들러: 헤더 클릭 시 해당 어노테이션으로 이동
          const handleHeaderClick = () => {
            handleScrollToAnnotation(annotation.id);
          };
          
          // excerpt를 최대 길이로 제한하고 "..." 추가
          // excerpt가 비어있으면 블록의 처음 부분을 사용
          let displayText = "";
          if (excerpt && excerpt.trim().length > 0) {
            displayText = excerpt.trim().length > 60 
              ? excerpt.trim().substring(0, 60) + "..." 
              : excerpt.trim();
          } else {
            // excerpt가 없으면 블록의 처음 부분을 가져옴
            const targetBlock = document.blocks.find(
              (block) => block.id === annotation.range.blockId
            );
            if (targetBlock) {
              const textContent = toPlainText(targetBlock);
              if (textContent && textContent.trim().length > 0) {
                displayText = textContent.trim().length > 60
                  ? textContent.trim().substring(0, 60) + "..."
                  : textContent.trim();
              }
            }
            // 블록도 없으면 기본 텍스트
            if (!displayText) {
              displayText = annotation.type === "highlight" ? "형광펜" : "밑줄";
            }
          }
          
          return (
            <div 
              key={annotation.id} 
              className="document-viewer__note-card"
            >
              <header className="document-viewer__note-header">
                <div 
                  className="document-viewer__note-title"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleHeaderClick();
                  }}
                  style={{ cursor: "pointer" }}
                  title="클릭하여 해당 위치로 이동"
                >
                  {displayText}
                </div>
                <div className="document-viewer__note-location">
                  {typeof location.line === 'number' && location.line > 0 ? (
                    <span className="document-viewer__note-location-text">
                      {pagination?.enabled && typeof location.page === 'number' && location.page >= 0 ? `페이지 ${location.page + 1} ` : ""}{location.line}줄
                    </span>
                  ) : null}
                </div>
              </header>
              <ul className="document-viewer__notes-list">
                {notes
                  .filter((note) => {
                    if (!noteSearchQuery.trim()) {
                      return true;
                    }
                    return note.content.toLowerCase().includes(noteSearchQuery.trim().toLowerCase());
                  })
                  .map((note) => (
                    <li key={note.id}>
                      <strong>{note.author?.name ?? "익명"}</strong>
                      <span>{highlightNote(note.content, noteSearchQuery)}</span>
                    </li>
                  ))}
              </ul>
              <div className="document-viewer__note-form">
                <textarea
                  className="document-viewer__note-input"
                  placeholder={notePlaceholder}
                  value={noteDrafts[annotation.id] ?? ""}
                  onChange={(event) =>
                    setNoteDraft(annotation.id, event.target.value)
                  }
                />
                <button
                  type="button"
                  className="document-viewer__note-submit"
                  onClick={() =>
                    addNote(annotation.id, noteDrafts[annotation.id] ?? "")
                  }
                >
                  메모 추가
                </button>
              </div>
            </div>
          );
        })}
      </aside>
    );
  }, [
    snapshot.annotations,
    snapshot.notes,
    filteredAnnotations,
    getExcerpt,
    noteDrafts,
    notePlaceholder,
    addNote,
    setNoteDraft,
    handleScrollToAnnotation,
    getAnnotationLocation,
    pagination?.enabled,
    noteSearchQuery,
    highlightNote,
  ]);

  const headerNode = renderHeader ? renderHeader(context) : defaultHeader;
  const toolbarNode = renderToolbar ? renderToolbar(context) : defaultToolbar;
  const sidebarNode = renderSidebar ? renderSidebar(context) : defaultSidebar;

  const handleRootRef = React.useCallback((element: HTMLElement | null) => {
    rootRef.current = element;
    setRootElement(element);
  }, []);

  return (
    <div
      ref={handleRootRef}
      className={cx("document-viewer", className)}
      style={{ ...themeStyle, ...style }}
    >
      {headerNode}
      {toolbarNode}
      <div className="document-viewer__body">
        <section className="document-viewer__canvas">
          {blocksWithText.length === 0 ? (
            <p className="document-viewer__empty">표시할 내용이 없습니다.</p>
          ) : (
            blocksWithText.map(({ block, textContent }, blockIndex) => {
              const annotations = snapshot.annotations.filter(
                (annotation) => annotation.range.blockId === block.id
              );
              const blockSearchMatches = searchMatchesByBlock.get(block.id);
              const segments = buildSegments(block, textContent, annotations, blockSearchMatches);
              
              // 페이지 구분선 표시 (페이지 시작이 아니고, 페이지네이션이 활성화된 경우)
              const showPageBreak = pagination?.enabled && 
                blockIndex === 0 && 
                pageInfo.currentPageIndex > 0;
              
              const defaultBlock = (
                <React.Fragment key={block.id}>
                  {showPageBreak && (
                    <div className="document-viewer__page-break" aria-label="페이지 구분">
                      <span className="document-viewer__page-break-line" />
                      {pagination?.showPageNumbers && (
                        <span className="document-viewer__page-number">
                          {pageInfo.currentPageIndex + 1}
                        </span>
                      )}
                      <span className="document-viewer__page-break-line" />
                    </div>
                  )}
                  <article
                    data-block-id={block.id}
                    ref={(element) => {
                      if (element) {
                        blockRefs.current.set(block.id, element);
                      } else {
                        blockRefs.current.delete(block.id);
                      }
                    }}
                    className={cx("document-viewer__block", {
                      "document-viewer__block--heading": block.type === "heading",
                      "document-viewer__block--list": block.type === "list",
                    })}
                  >
                    {(() => {
                      const lineNum = getLineNumberForBlock(block.id);
                      return lineNum !== null ? (
                        <span className="document-viewer__line-number">{lineNum}</span>
                      ) : null;
                    })()}
                      <div className="document-viewer__block-content">
                        {segments.map((segment, index) => {
                          // 검색 결과 하이라이트
                          if (segment.isSearchMatch) {
                            const isCurrentMatch = segment.searchMatchIndex === currentSearchIndex;
                            return (
                              <mark
                                key={`${block.id}-search-${segment.searchMatchIndex}-${index}`}
                                className={cx("document-viewer__search-match", {
                                  "document-viewer__search-match--current": isCurrentMatch,
                                })}
                                data-search-index={segment.searchMatchIndex}
                              >
                                {segment.text}
                              </mark>
                            );
                          }

                          // 어노테이션
                          if (segment.annotations.length) {
                            const annotation = segment.annotations[0];
                            return (
                              <span
                                key={`${block.id}-${annotation.id}-${index}`}
                                data-annotation-id={annotation.id}
                                className={getAnnotationClassName(annotation)}
                                style={{
                                  ...applyAnnotationStyle(annotation),
                                  cursor: onAnnotationClick ? "pointer" : "default",
                                }}
                                title={annotation.style?.label}
                                onClick={(event) => {
                                  if (onAnnotationClick) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onAnnotationClick(annotation.id);
                                  }
                                }}
                                onMouseEnter={(event) => {
                                  if (onAnnotationClick) {
                                    (event.currentTarget as HTMLElement).style.opacity = "0.8";
                                  }
                                }}
                                onMouseLeave={(event) => {
                                  if (onAnnotationClick) {
                                    const originalOpacity =
                                      annotation.style?.opacity ?? 1;
                                    (event.currentTarget as HTMLElement).style.opacity =
                                      String(originalOpacity);
                                  }
                                }}
                              >
                                {segment.text}
                              </span>
                            );
                          }

                          // 일반 텍스트
                          return (
                            <React.Fragment key={`${block.id}-${index}`}>
                              {segment.text}
                            </React.Fragment>
                          );
                        })}
                      </div>
                  </article>
                </React.Fragment>
              );
              if (renderBlock) {
                return renderBlock(block, segments, context);
              }
              return defaultBlock;
            })
          )}
          {/* 다른 사용자의 커서/선택 영역 오버레이 */}
          {presenceUsers.length > 0 && rootElement && (
            <UserCursorsOverlay
              rootElement={rootElement}
              presenceUsers={presenceUsers.filter(u => u.cursor || u.selection)}
              document={document}
              currentClientId={currentClientId}
            />
          )}
        </section>
        {sidebarNode}
      </div>
      {pagination?.enabled && pagination.showNavigation && pageInfo.totalPages > 1 && (
        <div className="document-viewer__pagination document-viewer__pagination--bottom">
          <button
            type="button"
            className="document-viewer__pagination-button"
            disabled={pageInfo.currentPageIndex === 0}
            onClick={goToPreviousPage}
            aria-label="이전 페이지"
          >
            ← 이전
          </button>
          <span className="document-viewer__pagination-info">
            {pagination.showPageNumbers && (
              <>페이지 {pageInfo.currentPageIndex + 1} / {pageInfo.totalPages}</>
            )}
          </span>
          <button
            type="button"
            className="document-viewer__pagination-button"
            disabled={pageInfo.currentPageIndex >= pageInfo.totalPages - 1}
            onClick={goToNextPage}
            aria-label="다음 페이지"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
};

