/**
 * 캔버스 좌표 변환 유틸리티
 * 
 * 캔버스와 미리보기 사이의 좌표 변환을 담당하는 모듈입니다.
 * PIXI 캔버스의 절대 좌표와 미리보기 캔버스의 상대 좌표를 변환합니다.
 */

export interface CanvasSize {
  width: number;
  height: number;
}

export interface ThumbnailSize {
  width: number;
  height: number;
}

export interface Coordinate {
  x: number;
  y: number;
}

/**
 * 캔버스 좌표 변환기 클래스
 */
export class CanvasCoordinateConverter {
  private canvasSize: CanvasSize;
  private thumbnailSize: ThumbnailSize;
  private scaleX: number;
  private scaleY: number;

  /**
   * @param canvasSize 원본 캔버스 크기
   * @param thumbnailSize 미리보기 캔버스 크기
   */
  constructor(canvasSize: CanvasSize, thumbnailSize: ThumbnailSize) {
    this.canvasSize = canvasSize;
    this.thumbnailSize = thumbnailSize;
    
    // 스케일 계산 (미리보기 크기 / 원본 캔버스 크기)
    this.scaleX = thumbnailSize.width / canvasSize.width;
    this.scaleY = thumbnailSize.height / canvasSize.height;
  }

  /**
   * 원본 캔버스 좌표를 미리보기 좌표로 변환
   * @param canvasCoord 원본 캔버스 좌표
   * @returns 미리보기 좌표
   */
  canvasToThumbnail(canvasCoord: Coordinate): Coordinate {
    return {
      x: canvasCoord.x * this.scaleX,
      y: canvasCoord.y * this.scaleY,
    };
  }

  /**
   * 미리보기 좌표를 원본 캔버스 좌표로 변환
   * @param thumbnailCoord 미리보기 좌표
   * @returns 원본 캔버스 좌표
   */
  thumbnailToCanvas(thumbnailCoord: Coordinate): Coordinate {
    return {
      x: thumbnailCoord.x / this.scaleX,
      y: thumbnailCoord.y / this.scaleY,
    };
  }

  /**
   * 스크롤 위치를 미리보기 좌표로 변환
   * @param scrollLeft 스크롤 X 위치
   * @param scrollTop 스크롤 Y 위치
   * @returns 미리보기 좌표
   */
  scrollToThumbnail(scrollLeft: number, scrollTop: number): Coordinate {
    return {
      x: scrollLeft * this.scaleX,
      y: scrollTop * this.scaleY,
    };
  }

  /**
   * 미리보기 좌표를 스크롤 위치로 변환
   * @param thumbnailCoord 미리보기 좌표
   * @param viewportWidth 뷰포트 가로 크기
   * @param viewportHeight 뷰포트 세로 크기
   * @param contentOffsetX 실제 내용 범위의 X 오프셋 (썸네일이 실제 내용 범위만 포함하는 경우)
   * @param contentOffsetY 실제 내용 범위의 Y 오프셋 (썸네일이 실제 내용 범위만 포함하는 경우)
   * @returns 스크롤 위치 (클릭한 위치가 뷰포트 중앙에 오도록 조정)
   */
  thumbnailToScroll(
    thumbnailCoord: Coordinate,
    viewportWidth: number,
    viewportHeight: number,
    contentOffsetX: number = 0,
    contentOffsetY: number = 0
  ): { scrollLeft: number; scrollTop: number } {
    // 미리보기 좌표를 캔버스 좌표로 변환 (실제 내용 범위 기준)
    const contentCoord = this.thumbnailToCanvas(thumbnailCoord);
    
    // 실제 내용 범위 좌표를 전체 캔버스 좌표로 변환 (오프셋 추가)
    const canvasCoord = {
      x: contentCoord.x + contentOffsetX,
      y: contentCoord.y + contentOffsetY,
    };
    
    console.log("🔵 [CanvasCoordinateConverter] thumbnailToScroll 계산:", {
      thumbnailCoord,
      contentCoord,
      canvasCoord,
      contentOffset: { x: contentOffsetX, y: contentOffsetY },
      viewportSize: { width: viewportWidth, height: viewportHeight },
      scale: { scaleX: this.scaleX, scaleY: this.scaleY },
      canvasSize: this.canvasSize,
      thumbnailSize: this.thumbnailSize,
    });
    
    // 클릭한 위치가 뷰포트 중앙에 오도록 스크롤 위치 계산
    // 스크롤 위치 = 캔버스 좌표 - 뷰포트 크기의 절반
    const scrollLeft = Math.max(0, Math.min(canvasCoord.x - viewportWidth / 2, this.canvasSize.width - viewportWidth));
    const scrollTop = Math.max(0, Math.min(canvasCoord.y - viewportHeight / 2, this.canvasSize.height - viewportHeight));
    
    console.log("🔵 [CanvasCoordinateConverter] thumbnailToScroll 결과:", {
      scrollLeft,
      scrollTop,
      calculatedFrom: {
        canvasX: canvasCoord.x,
        canvasY: canvasCoord.y,
        viewportHalfWidth: viewportWidth / 2,
        viewportHalfHeight: viewportHeight / 2,
      },
    });
    
    return { scrollLeft, scrollTop };
  }

  /**
   * 뷰포트 크기를 미리보기 크기로 변환
   * @param viewportWidth 뷰포트 가로 크기
   * @param viewportHeight 뷰포트 세로 크기
   * @returns 미리보기 크기
   */
  viewportToThumbnailSize(
    viewportWidth: number,
    viewportHeight: number
  ): { width: number; height: number } {
    return {
      width: viewportWidth * this.scaleX,
      height: viewportHeight * this.scaleY,
    };
  }

  /**
   * 스케일 값 가져오기
   */
  getScale(): { scaleX: number; scaleY: number } {
    return {
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  /**
   * 캔버스 크기 업데이트
   */
  updateCanvasSize(canvasSize: CanvasSize): void {
    this.canvasSize = canvasSize;
    this.scaleX = this.thumbnailSize.width / canvasSize.width;
    this.scaleY = this.thumbnailSize.height / canvasSize.height;
  }

  /**
   * 미리보기 크기 업데이트
   */
  updateThumbnailSize(thumbnailSize: ThumbnailSize): void {
    this.thumbnailSize = thumbnailSize;
    this.scaleX = thumbnailSize.width / this.canvasSize.width;
    this.scaleY = thumbnailSize.height / this.canvasSize.height;
  }
}

