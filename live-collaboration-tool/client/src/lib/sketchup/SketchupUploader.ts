/**
 * 스케치업 파일 업로드 및 변환 상태 관리 클래스
 */

import {
  SketchupUploadResponse,
  ConversionStatusResponse,
} from './types';

export class SketchupUploader {
  private serverUrl: string;
  private pollingInterval: number = 2000; // 2초

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/$/, ''); // 마지막 슬래시 제거
  }

  /**
   * .skp 파일 업로드
   * 
   * @param file 업로드할 .skp 파일
   * @returns 업로드 응답 (fileId, conversionId 포함)
   * @throws 업로드 실패 시 에러
   */
  async uploadFile(file: File): Promise<SketchupUploadResponse> {
    // 파일 확장자 검증
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.skp') && !lower.endsWith('.glb')) {
      throw new Error('지원하지 않는 파일 형식입니다. .skp 또는 .glb 파일만 업로드 가능합니다.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.serverUrl}/api/sketchup/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || errorData.error || `업로드 실패: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * 변환 상태 조회
   * 
   * @param conversionId 변환 작업 ID
   * @returns 변환 상태 정보
   * @throws 상태 조회 실패 시 에러
   */
  async getConversionStatus(conversionId: string): Promise<ConversionStatusResponse> {
    const response = await fetch(
      `${this.serverUrl}/api/sketchup/conversion/${conversionId}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || errorData.error || `상태 조회 실패: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * 변환 완료까지 폴링
   * 
   * @param conversionId 변환 작업 ID
   * @param onProgress 진행률 콜백 (0-100)
   * @param timeout 타임아웃 (밀리초, 기본값: 5분)
   * @returns 변환된 GLB 파일 URL
   * @throws 변환 실패 또는 타임아웃 시 에러
   */
  async waitForConversion(
    conversionId: string,
    onProgress?: (progress: number) => void,
    timeout: number = 5 * 60 * 1000 // 5분
  ): Promise<string> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          // 타임아웃 체크
          if (Date.now() - startTime > timeout) {
            reject(new Error('변환 타임아웃: 시간이 초과되었습니다.'));
            return;
          }

          const status = await this.getConversionStatus(conversionId);

          if (status.status === 'completed' && status.glbUrl) {
            const url = status.glbUrl.startsWith('http')
              ? status.glbUrl
              : `${this.serverUrl}${status.glbUrl.startsWith('/') ? '' : '/'}${status.glbUrl}`;
            resolve(url);
            return;
          }

          if (status.status === 'failed') {
            reject(new Error(status.error || '변환 실패'));
            return;
          }

          // 진행률 콜백
          if (onProgress && status.progress !== undefined) {
            onProgress(status.progress);
          }

          // 다음 폴링
          setTimeout(poll, this.pollingInterval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * 폴링 간격 설정
   * 
   * @param interval 밀리초 단위 간격 (기본값: 2000ms)
   */
  setPollingInterval(interval: number): void {
    if (interval < 500) {
      console.warn('폴링 간격이 너무 짧습니다. 최소 500ms를 권장합니다.');
    }
    this.pollingInterval = interval;
  }

  /**
   * 서버 URL 설정
   * 
   * @param serverUrl 서버 URL
   */
  setServerUrl(serverUrl: string): void {
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }
}
