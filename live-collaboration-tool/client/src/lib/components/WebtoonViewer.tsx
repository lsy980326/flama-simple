import React from "react";
import { DocumentModel, DocumentBlock, DocumentImageBlock } from "../documents/types";
import "./WebtoonViewer.css";

// 이미지 블록 컴포넌트 (WebGL 오류 방지)
const WebtoonImageBlock: React.FC<{
  block: DocumentImageBlock;
  document: DocumentModel;
  containerWidth: number;
}> = ({ block, document, containerWidth }) => {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [imageSize, setImageSize] = React.useState<{ width: number; height: number } | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    const imageResource = document.resources?.images?.[block.resourceId];
    if (!imageResource) {
      setImageError("이미지 리소스를 찾을 수 없습니다");
      return;
    }

    const blob = new Blob([imageResource.data], { type: imageResource.mimeType });
    const url = URL.createObjectURL(blob);
    setImageUrl(url);

    // 이미지 크기 확인
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      setImageSize({ width, height });

      // WebtoonViewer는 WebGL을 사용하지 않으므로 크기 제한 없음
      // 단순히 정보만 저장 (디버깅용)
    };
    img.onerror = () => {
      setImageError("이미지를 로드할 수 없습니다");
      URL.revokeObjectURL(url);
    };
    img.src = url;
    imgRef.current = img;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [block.resourceId, document.resources]);

  if (imageError) {
    return (
      <div className="webtoon-viewer__image">
        <div className="webtoon-viewer__image-placeholder">
          {imageError} (resourceId: {block.resourceId})
          {block.caption && block.caption.length > 0 && (
            <div className="webtoon-viewer__image-caption">
              {block.caption.map((run) => run.text).join("")}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="webtoon-viewer__image">
        <div className="webtoon-viewer__image-placeholder">이미지 로딩 중...</div>
      </div>
    );
  }

  const imageResource = document.resources?.images?.[block.resourceId];
  // WebtoonViewer는 WebGL을 사용하지 않으므로 크기 제한 없음
  const isLargeImage = imageSize && (imageSize.width > 10000 || imageSize.height > 50000);

  return (
    <div className="webtoon-viewer__image">
      <img
        src={imageUrl}
        alt={imageResource?.altText || ""}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          // 큰 이미지의 경우 GPU 가속 비활성화 (WebGL 오류 방지)
          imageRendering: isLargeImage ? "auto" : "auto",
          // WebGL 사용을 피하기 위해 will-change 제거
          willChange: "auto",
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          console.error("이미지 로드 오류:", e);
          setImageError("이미지를 표시할 수 없습니다");
        }}
      />
      {imageSize && isLargeImage && (
        <div style={{ 
          padding: "4px 8px", 
          fontSize: "11px", 
          color: "#999", 
          background: "#f5f5f5",
          textAlign: "center"
        }}>
          이미지 크기: {imageSize.width} × {imageSize.height}px
        </div>
      )}
      {block.caption && block.caption.length > 0 && (
        <div className="webtoon-viewer__image-caption">
          {block.caption.map((run) => run.text).join("")}
        </div>
      )}
    </div>
  );
};

// 네이버 웹툰 기준 가로 크기 옵션 (740까지만 사용)
export const WEBTOON_WIDTH_OPTIONS = [690, 720, 740] as const;
export type WebtoonWidth = typeof WEBTOON_WIDTH_OPTIONS[number];

export interface WebtoonViewerProps {
  document: DocumentModel;
  width?: WebtoonWidth | number; // 가로 크기 (기본값: 720)
  className?: string;
  style?: React.CSSProperties;
  onBlockRender?: (block: DocumentBlock, element: HTMLElement) => void;
  showWidthSelector?: boolean; // 가로 크기 선택 UI 표시 여부 (기본값: true)
  onWidthChange?: (width: number) => void; // 가로 크기 변경 콜백
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

export const WebtoonViewer: React.FC<WebtoonViewerProps> = ({
  document,
  width = 720,
  className,
  style,
  onBlockRender,
  showWidthSelector = true,
  onWidthChange,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const blockRefs = React.useRef(new Map<string, HTMLElement>());
  const [currentWidth, setCurrentWidth] = React.useState<number>(width);

  // 가로 크기 검증 및 정규화
  const normalizedWidth = React.useMemo(() => {
    if (typeof currentWidth === "number") {
      return currentWidth;
    }
    return currentWidth;
  }, [currentWidth]);

  // width prop이 변경되면 내부 상태 업데이트
  React.useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  // 가로 크기 변경 핸들러
  const handleWidthChange = React.useCallback((newWidth: number) => {
    setCurrentWidth(newWidth);
    if (onWidthChange) {
      onWidthChange(newWidth);
    }
  }, [onWidthChange]);

  // 블록 렌더링
  React.useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    // 블록 렌더링 후 콜백 호출
    blockRefs.current.forEach((element, blockId) => {
      const block = document.blocks.find((b) => b.id === blockId);
      if (block && onBlockRender) {
        onBlockRender(block, element);
      }
    });
  }, [document.blocks, onBlockRender]);

  return (
    <div
      ref={containerRef}
      className={`webtoon-viewer ${className || ""}`}
      style={{
        ...style,
        "--webtoon-width": `${normalizedWidth}px`,
      } as React.CSSProperties}
    >
      {showWidthSelector && (
        <div className="webtoon-viewer__width-selector">
          <label className="webtoon-viewer__width-label">
            가로 크기:
            <select
              className="webtoon-viewer__width-select"
              value={normalizedWidth}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
            >
              {WEBTOON_WIDTH_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div ref={contentRef} className="webtoon-viewer__content">
        {document.blocks.length === 0 ? (
          <div className="webtoon-viewer__empty">
            표시할 내용이 없습니다.
          </div>
        ) : (
          document.blocks.map((block) => {
            const textContent = toPlainText(block);
            
            return (
              <article
                key={block.id}
                data-block-id={block.id}
                className="webtoon-viewer__block"
                ref={(element) => {
                  if (element) {
                    blockRefs.current.set(block.id, element);
                  } else {
                    blockRefs.current.delete(block.id);
                  }
                }}
              >
                {block.type === "heading" ? (
                  <h1 className="webtoon-viewer__heading">{textContent}</h1>
                ) : block.type === "image" ? (
                  <WebtoonImageBlock
                    block={block}
                    document={document}
                    containerWidth={normalizedWidth}
                  />
                ) : (
                  <p className="webtoon-viewer__paragraph">{textContent}</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

