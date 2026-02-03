/**
 * 스케치업 뷰어 관련 타입 정의
 */

/**
 * 3D 공간 좌표
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 3D 카메라 상태
 */
export interface CameraState {
  position: Vector3D;
  target: Vector3D;
  up: Vector3D;
  fov?: number;
  near?: number;
  far?: number;
}

/**
 * 스케치업 피드백 (3D 핀포인트)
 */
export interface SketchupPinpoint {
  id: string;
  position: Vector3D;        // 3D 공간 좌표
  normal?: Vector3D;         // 표면 법선 벡터
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
  viewState?: CameraState;   // 피드백 생성 시 카메라 상태 (선택)
  thumbnail?: string;        // 썸네일 이미지 (data URL)
}

/**
 * 스케치업 모델 정보
 */
export interface SketchupModel {
  id: string;
  name: string;
  url: string;              // 변환된 .glb 파일 URL
  originalFormat: 'skp' | 'obj' | 'gltf' | 'glb';
  convertedFormat: 'glb';   // 항상 .glb로 변환됨
  conversionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  conversionId?: string;    // 변환 작업 ID
  metadata?: {
    version?: string;
    units?: 'meters' | 'feet' | 'inches';
    boundingBox?: {
      min: Vector3D;
      max: Vector3D;
    };
  };
}

/**
 * 파일 업로드 응답
 */
export interface SketchupUploadResponse {
  fileId: string;
  conversionId: string;
  status: 'pending' | 'processing';
  message: string;
}

/**
 * 변환 상태 조회 응답
 */
export interface ConversionStatusResponse {
  conversionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;        // 0-100
  glbUrl?: string;          // 변환 완료 시 URL
  error?: string;           // 실패 시 에러 메시지
}

/**
 * 스케치업 뷰어 설정
 */
export interface SketchupViewerConfig {
  container?: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: string;
  enableControls?: boolean;
  enableGrid?: boolean;
  enableAxes?: boolean;
  camera?: Partial<CameraState>;
}

/**
 * 스케치업 피드백 설정
 */
export interface SketchupFeedbackConfig {
  collaborationManager: any; // CollaborationManager 타입
  yjsDocument?: any;         // Y.Doc 타입
  enableRealtime?: boolean;
  onFeedbackAdd?: (pinpoint: SketchupPinpoint) => void;
  onFeedbackUpdate?: (pinpoint: SketchupPinpoint) => void;
  onFeedbackRemove?: (id: string) => void;
}
