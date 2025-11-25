// 실시간 협업 라이브러리 메인 엔트리 포인트
export { CollaborationManager } from "./collaboration/CollaborationManager";
export { CanvasManager } from "./canvas/CanvasManager";
export { WebRTCManager } from "./webrtc/WebRTCManager";
export { PinpointManager } from "./collaboration/PinpointManager";
export { ChatManager } from "./collaboration/ChatManager";

// 실시간 그림 그리기 시스템
export { YjsDrawingManager } from "./collaboration/YjsDrawingManager";
export { WebRTCDataChannelManager } from "./webrtc/WebRTCDataChannelManager";
export { AwarenessManager } from "./collaboration/AwarenessManager";
export { RealTimeDrawingManager } from "./collaboration/RealTimeDrawingManager";
export { LiveCollabCanvas } from "./components/LiveCollabCanvas";
export { CanvasThumbnailNavigator } from "./components/CanvasThumbnailNavigator";
export {
  DocumentViewer,
  DefaultRenderHandle,
} from "./components/DocumentViewer";
export {
  WebtoonViewer,
  WEBTOON_WIDTH_OPTIONS,
} from "./components/WebtoonViewer";
export type { WebtoonWidth } from "./components/WebtoonViewer";
export { TxtAdapter } from "./documents/adapters/TxtAdapter";
export { DocxAdapter } from "./documents/adapters/DocxAdapter";
export { MeAdapter } from "./documents/adapters/MeAdapter";
export { HwpAdapter } from "./documents/adapters/HwpAdapter";
export { ImageAdapter } from "./documents/adapters/ImageAdapter";
export {
  MemoryStorageProvider,
} from "./documents/storage/providers/MemoryStorageProvider";
export {
  IndexedDBStorageProvider,
} from "./documents/storage/providers/IndexedDBStorageProvider";

// 타입 정의
export * from "./types";
export * from "./documents/types";
export * from "./annotations/types";
export * from "./documents/storage";
export type {
  DocumentViewerAction,
  DocumentViewerRenderContext,
  DocumentViewerTheme,
  DocumentViewerSegment,
} from "./components/DocumentViewer";

// 유틸리티
export * from "./utils";
export { CanvasCoordinateConverter } from "./utils/canvasCoordinateConverter";
export type {
  CanvasSize,
  ThumbnailSize,
  Coordinate,
} from "./utils/canvasCoordinateConverter";

// 어노테이션
export { AnnotationService } from "./annotations/AnnotationService";
