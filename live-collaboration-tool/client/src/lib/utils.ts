// 유틸리티 함수들

// 색상 유틸리티
export const ColorUtils = {
  // HEX를 RGB로 변환
  hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  },

  // RGB를 HEX로 변환
  rgbToHex(r: number, g: number, b: number): string {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },

  // 랜덤 색상 생성
  randomColor(): string {
    return "#" + Math.floor(Math.random() * 16777215).toString(16);
  },
};

// 좌표 유틸리티
export const CoordinateUtils = {
  // 두 점 사이의 거리 계산
  distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  },

  // 점이 원 안에 있는지 확인
  isPointInCircle(
    px: number,
    py: number,
    cx: number,
    cy: number,
    radius: number
  ): boolean {
    return this.distance(px, py, cx, cy) <= radius;
  },
};

// 시간 유틸리티
export const TimeUtils = {
  // 상대 시간 표시 (예: "2분 전")
  getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  },

  // 날짜 포맷팅
  formatDate(date: Date): string {
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },
};

// 문자열 유틸리티
export const StringUtils = {
  // 문자열 자르기
  truncate(str: string, length: number): string {
    return str.length > length ? str.substring(0, length) + "..." : str;
  },

  // HTML 이스케이프
  escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  },
};

// 디바이스 유틸리티
export const DeviceUtils = {
  // 모바일 디바이스 확인
  isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  },

  // 터치 지원 확인
  isTouchSupported(): boolean {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  },
};

// 스토리지 유틸리티
export const StorageUtils = {
  // 로컬 스토리지에 저장
  setItem(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("로컬 스토리지 저장 실패:", error);
    }
  },

  // 로컬 스토리지에서 가져오기
  getItem(key: string): any {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("로컬 스토리지 읽기 실패:", error);
      return null;
    }
  },

  // 로컬 스토리지에서 제거
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error("로컬 스토리지 제거 실패:", error);
    }
  },
};
