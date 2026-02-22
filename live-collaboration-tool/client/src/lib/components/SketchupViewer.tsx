/**
 * 스케치업 3D 뷰어 컴포넌트 (React 19 호환)
 * - react-three-fiber 대신 순수 three.js를 사용합니다.
 * - GLB 로딩: GLTFLoader
 * - 카메라 컨트롤: OrbitControls
 */

import React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Vector3D, CameraState, SketchupPinpoint } from "../sketchup/types";

export interface SketchupViewerRef {
  captureThumbnail: (cameraState: CameraState) => Promise<string | null>;
}

export interface SketchupInsetViewportOptions {
  enabled?: boolean;
  width?: number;
  height?: number;
  margin?: number;
  backgroundColor?: string;
  showAxes?: boolean;
}

export interface SketchupViewerProps {
  glbUrl: string;
  onCameraChange?: (state: CameraState) => void;
  onModelClick?: (position: Vector3D, normal?: Vector3D) => void;
  pinpoints?: SketchupPinpoint[];
  onPinpointClick?: (pinpoint: SketchupPinpoint) => void;
  onThumbnailRequest?: (cameraState: CameraState) => Promise<string | null>;
  width?: number;
  height?: number;
  backgroundColor?: string;
  enableGrid?: boolean;
  enableAxes?: boolean;
  /**
   * 기본(기존) OrbitControls는 좌클릭 드래그로 회전합니다.
   * 주석/피드백 입력이 좌클릭과 겹치는 경우가 많아, true면 "중클릭(휠 클릭) 드래그"로 회전하도록 매핑합니다.
   */
  rotateWithMiddleMouse?: boolean;
  /**
   * 뷰어 좌상단에 작은 인셋 뷰포트를 렌더링합니다. (기본: 활성화)
   * 모델 미니맵이 아니라, 카메라 방향에 연동되는 축(Axes) 뷰를 제공합니다.
   */
  insetViewport?: SketchupInsetViewportOptions;
  initialCamera?: Partial<CameraState>;
  cameraState?: CameraState;
  loadingComponent?: React.ReactNode;
  errorComponent?: (error: Error) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_INSET_VIEWPORT: Required<SketchupInsetViewportOptions> = {
  enabled: true,
  width: 160,
  height: 120,
  margin: 12,
  backgroundColor: "#ffffff",
  showAxes: true,
};

function normalizeInsetViewportOptions(
  opts?: SketchupInsetViewportOptions
): Required<SketchupInsetViewportOptions> {
  return {
    enabled: opts?.enabled ?? DEFAULT_INSET_VIEWPORT.enabled,
    width: opts?.width ?? DEFAULT_INSET_VIEWPORT.width,
    height: opts?.height ?? DEFAULT_INSET_VIEWPORT.height,
    margin: opts?.margin ?? DEFAULT_INSET_VIEWPORT.margin,
    backgroundColor: opts?.backgroundColor ?? DEFAULT_INSET_VIEWPORT.backgroundColor,
    showAxes: opts?.showAxes ?? DEFAULT_INSET_VIEWPORT.showAxes,
  };
}

// 썸네일 생성 헬퍼 함수
export async function captureThumbnail(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number = 200,
  height: number = 150
): Promise<string | null> {
  try {
    // 임시 렌더러 생성 (썸네일용)
    const thumbnailRenderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      preserveDrawingBuffer: true 
    });
    thumbnailRenderer.setSize(width, height);
    thumbnailRenderer.setClearColor(renderer.getClearColor(new THREE.Color()));
    
    // 렌더링
    thumbnailRenderer.render(scene, camera);
    
    // 캔버스에서 데이터 URL 추출
    const dataUrl = thumbnailRenderer.domElement.toDataURL('image/png');
    
    // 정리
    thumbnailRenderer.dispose();
    
    return dataUrl;
  } catch (error) {
    console.error('썸네일 생성 실패:', error);
    return null;
  }
}

function toVec3(v?: Vector3D): THREE.Vector3 {
  return new THREE.Vector3(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
}

function cameraStateFrom(camera: THREE.PerspectiveCamera, controls: OrbitControls): CameraState {
  return {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}

// 간단 preload (캐시)
const gltfPromiseCache = new Map<string, Promise<THREE.Object3D>>();
export function preloadSketchupModel(url: string) {
  if (gltfPromiseCache.has(url)) return;
  const loader = new GLTFLoader();
  const p = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err)
    );
  });
  gltfPromiseCache.set(url, p);
}

function autoFrameModel(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // target을 모델 중심으로
  controls.target.copy(center);

  // 카메라 거리 계산
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  // 화면에 들어오게 대략적인 거리
  const dist = maxDim / (2 * Math.tan(fov / 2));
  // 정면(수직/수평 정렬) 뷰: up을 +Y로 고정하고 +Z 방향에서 바라봅니다.
  // (isometric(1,1,1)보다 "정면이 보이게" 체감이 좋고, backface culling 이슈도 덜 헷갈립니다)
  camera.up.set(0, 1, 0);
  const direction = new THREE.Vector3(0, 0, 1);

  camera.position.copy(center.clone().add(direction.multiplyScalar(dist * 1.5 + 0.1)));
  camera.near = Math.max(0.01, dist / 100);
  camera.far = Math.max(1000, dist * 100);
  camera.updateProjectionMatrix();

  // OrbitControls 줌 범위는 모델 크기에 맞게 동적으로 설정해야 합니다.
  // (고정 min/maxDistance면 큰 모델에서 줌이 "안 되는 것처럼" 느껴지거나, 작은 모델에서 더 못 들어갑니다)
  controls.minDistance = Math.max(0.001, dist / 1000);
  controls.maxDistance = Math.max(dist * 10, controls.minDistance * 10);
  controls.zoomSpeed = 1.0;

  controls.update();
}

function autoFrameInsetCamera(
  model: THREE.Object3D,
  insetCamera: THREE.PerspectiveCamera,
  target: THREE.Vector3
) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // target을 모델 중심으로 (오버뷰에서도 통일)
  target.copy(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (insetCamera.fov * Math.PI) / 180;
  const dist = maxDim / (2 * Math.tan(fov / 2));

  // 오버뷰는 대각선 방향에서 전체가 보이도록 배치
  const direction = new THREE.Vector3(1, 1, 1).normalize();
  insetCamera.position.copy(center.clone().add(direction.multiplyScalar(dist * 1.8 + 0.1)));
  insetCamera.near = Math.max(0.01, dist / 100);
  insetCamera.far = Math.max(1000, dist * 200);
  insetCamera.up.set(0, 1, 0);
  insetCamera.lookAt(center);
  insetCamera.updateProjectionMatrix();
}

export const SketchupViewer = React.forwardRef<SketchupViewerRef, SketchupViewerProps>(({
  glbUrl,
  onCameraChange,
  onModelClick,
  pinpoints = [],
  onPinpointClick,
  onThumbnailRequest,
  width = 800,
  height = 600,
  backgroundColor = "#f0f0f0",
  enableGrid = true,
  enableAxes = true,
  rotateWithMiddleMouse = true,
  insetViewport,
  initialCamera,
  cameraState,
  loadingComponent,
  errorComponent,
  className,
  style,
}, ref) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = React.useRef<OrbitControls | null>(null);
  const modelRootRef = React.useRef<THREE.Object3D | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const lastCamStateRef = React.useRef<string>("");
  const pinpointsGroupRef = React.useRef<THREE.Group | null>(null);
  const pinpointMarkersRef = React.useRef<Map<string, THREE.Object3D>>(new Map());
  const mainClearColorRef = React.useRef<THREE.Color>(new THREE.Color(backgroundColor));
  const defaultDistanceRef = React.useRef<number | null>(null);

  // inset viewport
  const insetSceneRef = React.useRef<THREE.Scene | null>(null);
  const insetCameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const insetTargetRef = React.useRef<THREE.Vector3>(new THREE.Vector3());
  const insetOptionsRef = React.useRef<Required<SketchupInsetViewportOptions>>(
    normalizeInsetViewportOptions(insetViewport)
  );
  const insetClearColorRef = React.useRef<THREE.Color>(
    new THREE.Color(insetOptionsRef.current.backgroundColor)
  );

  const setMainCameraView = React.useCallback((dir: THREE.Vector3) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target.clone();
    const currentDist = camera.position.distanceTo(target);
    const dist = defaultDistanceRef.current ?? currentDist;
    const direction = dir.clone().normalize();

    camera.position.copy(target.clone().add(direction.multiplyScalar(dist)));

    // top/bottom은 up 벡터를 별도로 잡아 "북쪽이 위"처럼 보이게 정렬
    if (Math.abs(direction.y) > 0.9) {
      // 위에서 내려다보는 경우: -Z를 화면 위로 (대략적인 북 방향)
      camera.up.set(0, 0, -1 * Math.sign(direction.y));
    } else {
      camera.up.set(0, 1, 0);
    }

    camera.updateProjectionMatrix();
    controls.update();
  }, []);

  const handleInsetClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const model = modelRootRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const insetCamera = insetCameraRef.current;
    if (!model || !camera || !controls || !insetCamera) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // 인셋 영역에서의 클릭 좌표를 NDC로 변환
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, insetCamera);
    const hits = raycaster.intersectObject(model, true);
    if (hits.length === 0) return;

    const hitPoint = hits[0].point.clone();
    const oldTarget = controls.target.clone();
    const offset = camera.position.clone().sub(oldTarget);

    // 메인 카메라/타겟을 "해당 위치"로 이동
    controls.target.copy(hitPoint);
    camera.position.copy(hitPoint.clone().add(offset));
    controls.update();

    e.preventDefault();
    e.stopPropagation();
  }, []);

  const [error, setError] = React.useState<Error | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  // keep inset options updated for the render loop (init effect는 deps가 []라서 ref로 전달)
  React.useEffect(() => {
    const normalized = normalizeInsetViewportOptions(insetViewport);
    insetOptionsRef.current = normalized;
    insetClearColorRef.current = new THREE.Color(normalized.backgroundColor);
  }, [insetViewport]);

  // keep clear color ref updated
  React.useEffect(() => {
    mainClearColorRef.current = new THREE.Color(backgroundColor);
  }, [backgroundColor]);

  // init renderer/scene/camera/controls once
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      initialCamera?.fov ?? 75,
      width / height,
      initialCamera?.near ?? 0.1,
      initialCamera?.far ?? 1000
    );
    camera.position.copy(
      initialCamera?.position ? toVec3(initialCamera.position) : new THREE.Vector3(5, 5, 5)
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(new THREE.Color(backgroundColor));
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // glTF 텍스처는 기본적으로 sRGB(베이스컬러) 기준이 많아서, 출력 색공간을 sRGB로 맞춰야
    // 색이 뿌옇거나 어둡게 보이지 않습니다.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PBR 톤매핑(선택): 텍스처가 "있는 것처럼 보이는데 너무 어둡다" 류 체감 개선
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // 초기값은 넉넉하게 두고, 모델 로드 후 autoFrameModel에서 모델 크기에 맞게 재설정합니다.
    controls.minDistance = 0.001;
    controls.maxDistance = 1_000_000;
    // 더블 클릭 이벤트 비활성화 (클릭 이벤트와 충돌 방지)
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;

    // 좌클릭은 "핀포인트/피드백"에 사용하고, 회전은 중클릭(휠 클릭) 드래그로 분리
    if (rotateWithMiddleMouse) {
      // OrbitControls는 mouseButtons 매핑 값과 event.button을 비교합니다.
      // LEFT를 -1로 두면 어떤 버튼에도 매칭되지 않아 좌클릭 드래그가 컨트롤에 의해 소비되지 않습니다.
      const NO_MOUSE_ACTION = -1 as unknown as THREE.MOUSE;
      controls.mouseButtons = {
        LEFT: NO_MOUSE_ACTION,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
    controlsRef.current = controls;

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(10, 10, 5);
    scene.add(dir);

    // inset viewport scene/camera (좌상단) - "오버뷰" 카메라 (같은 scene를 다시 렌더링)
    const insetScene = new THREE.Scene();
    const insetCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    insetCamera.position.set(0, 0, 4);
    insetCamera.lookAt(0, 0, 0);
    insetSceneRef.current = insetScene;
    insetCameraRef.current = insetCamera;

    // (참고) 현재 인셋은 "같은 모델의 오버뷰"를 렌더링합니다.
    // 필요 시 opts.showAxes를 이용해 별도 gizmo scene을 추가 렌더링하는 방식으로 확장할 수 있습니다.

    // helpers
    let grid: THREE.GridHelper | null = null;
    let axes: THREE.AxesHelper | null = null;
    if (enableGrid) {
      grid = new THREE.GridHelper(10, 10);
      scene.add(grid);
    }
    if (enableAxes) {
      axes = new THREE.AxesHelper(5);
      scene.add(axes);
    }

    // 핀포인트 그룹 생성
    const pinpointsGroup = new THREE.Group();
    pinpointsGroup.name = "pinpoints";
    scene.add(pinpointsGroup);
    pinpointsGroupRef.current = pinpointsGroup;

    // render loop
    const tick = () => {
      animationRef.current = requestAnimationFrame(tick);
      controls.update();
      
      // 스프라이트가 항상 카메라를 향하도록 업데이트
      const pinpointsGroup = pinpointsGroupRef.current;
      if (pinpointsGroup) {
        pinpointsGroup.children.forEach((group) => {
          if (group instanceof THREE.Group) {
            group.children.forEach((child) => {
              if (child instanceof THREE.Sprite) {
                child.lookAt(camera.position);
              }
            });
          }
        });
      }
      
      // main + inset viewport render (single canvas, scissor 기반)
      const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
      const fullW = Math.max(1, Math.floor(drawingBufferSize.x));
      const fullH = Math.max(1, Math.floor(drawingBufferSize.y));
      const pixelRatio = renderer.getPixelRatio();

      renderer.setScissorTest(true);

      // main
      renderer.setViewport(0, 0, fullW, fullH);
      renderer.setScissor(0, 0, fullW, fullH);
      renderer.setClearColor(mainClearColorRef.current);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      // inset (top-left)
      const insetCamera = insetCameraRef.current;
      const insetOpts = insetOptionsRef.current;
      if (insetOpts.enabled && insetCamera) {
        const insetW = Math.max(1, Math.floor(insetOpts.width * pixelRatio));
        const insetH = Math.max(1, Math.floor(insetOpts.height * pixelRatio));
        const insetMargin = Math.max(0, Math.floor(insetOpts.margin * pixelRatio));

        const insetX = insetMargin;
        const insetY = Math.max(insetMargin, fullH - insetH - insetMargin);

        // 오버뷰는 타겟만 현재 controls.target에 맞춰 추적 (인셋 카메라 위치는 모델 로드 시 프레이밍됨)
        const insetTarget = insetTargetRef.current;
        insetTarget.copy(controls.target);
        insetCamera.lookAt(insetTarget);

        renderer.setViewport(insetX, insetY, insetW, insetH);
        renderer.setScissor(insetX, insetY, insetW, insetH);
        renderer.setClearColor(insetClearColorRef.current);
        renderer.clear(true, true, true);
        renderer.render(scene, insetCamera);
      }

      renderer.setScissorTest(false);

      if (onCameraChange) {
        const state = cameraStateFrom(camera, controls);
        const key = JSON.stringify(state);
        if (key !== lastCamStateRef.current) {
          lastCamStateRef.current = key;
          onCameraChange(state);
        }
      }
    };
    tick();

    const runPick = (clientX: number, clientY: number) => {
      const model = modelRootRef.current;
      if (!model) return;
      if (!scene.children.includes(model)) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // 1) 핀포인트 우선
      const pinpointsGroup = pinpointsGroupRef.current;
      if (pinpointsGroup && onPinpointClick) {
        const pinpointIntersects = raycaster.intersectObjects(pinpointsGroup.children, true);
        if (pinpointIntersects.length > 0) {
          const marker = pinpointIntersects[0].object;
          const pinpointId = marker.userData.pinpointId;
          if (pinpointId) {
            const pinpoint = Array.from(pinpointMarkersRef.current.entries())
              .find(([id]) => id === pinpointId)?.[1]?.userData.pinpoint as SketchupPinpoint;
            if (pinpoint) {
              onPinpointClick(pinpoint);
              return;
            }
          }
        }
      }

      // 2) 모델 클릭 (메모/핀포인트 입력)
      if (!onModelClick) return;
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const position: Vector3D = { x: hit.point.x, y: hit.point.y, z: hit.point.z };

        let normal: Vector3D | undefined;
        if (hit.face) {
          const obj = hit.object as THREE.Mesh;
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
          const n = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          normal = { x: n.x, y: n.y, z: n.z };
        }
        onModelClick(position, normal);
        return;
      }

      // 모델 표면을 못 맞춘 경우에도 "화면 어디든" 메모를 남길 수 있도록,
      // 현재 타겟 깊이(controls.target)에 있는 화면 평면과의 교차점을 사용합니다.
      const viewNormal = new THREE.Vector3();
      camera.getWorldDirection(viewNormal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewNormal, controls.target);
      const fallbackPoint = new THREE.Vector3();
      const ok = raycaster.ray.intersectPlane(plane, fallbackPoint);
      if (!ok) return;

      onModelClick(
        { x: fallbackPoint.x, y: fallbackPoint.y, z: fallbackPoint.z },
        { x: viewNormal.x, y: viewNormal.y, z: viewNormal.z }
      );
    };

    // 좌클릭은 "메모/핀포인트"로 확실하게 동작하게:
    // OrbitControls가 pointerdown에서 preventDefault를 수행하면 click이 생성되지 않는 브라우저가 있어,
    // capture 단계의 pointerdown에서 즉시 피킹합니다.
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // 더블클릭은 무시
      if (event.detail === 2) return;
      runPick(event.clientX, event.clientY);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown, { capture: true });

    return () => {
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown, { capture: true } as any);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;

      if (grid) scene.remove(grid);
      if (axes) scene.remove(axes);
      if (pinpointsGroupRef.current) {
        scene.remove(pinpointsGroupRef.current);
        pinpointsGroupRef.current = null;
      }
      pinpointMarkersRef.current.clear();

      controls.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        // ignore
      }
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
      modelRootRef.current = null;
      insetSceneRef.current = null;
      insetCameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // handle size/background changes
  React.useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;

    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color(backgroundColor));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }, [width, height, backgroundColor]);

  // handle cameraState restore
  React.useEffect(() => {
    if (!cameraState) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.position.copy(toVec3(cameraState.position));
    controls.target.copy(toVec3(cameraState.target));
    if (typeof cameraState.fov === "number") camera.fov = cameraState.fov;
    if (typeof cameraState.near === "number") camera.near = cameraState.near;
    if (typeof cameraState.far === "number") camera.far = cameraState.far;
    camera.updateProjectionMatrix();
    controls.update();
  }, [cameraState]);

  // load glbUrl
  React.useEffect(() => {
    let cancelled = false;
    const scene = sceneRef.current;
    if (!scene) return;

    setError(null);
    setIsLoading(true);

    // remove old model
    if (modelRootRef.current) {
      scene.remove(modelRootRef.current);
      modelRootRef.current = null;
    }

    const loader = new GLTFLoader();
    const p =
      gltfPromiseCache.get(glbUrl) ??
      new Promise<THREE.Object3D>((resolve, reject) => {
        loader.load(
          glbUrl,
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => reject(err)
        );
      });
    gltfPromiseCache.set(glbUrl, p);

    p.then((root) => {
      if (cancelled) return;
      // clone to allow multiple viewers same url
      const cloned = root.clone(true);

      // SketchUp 좌표계는 기본적으로 Z-up(파란축이 위)이고, Three.js는 Y-up입니다.
      // 그대로 렌더링하면 "처음에 위에서 내려다보는" 것처럼 느껴질 수 있어,
      // Z-up -> Y-up으로 맞추는 회전을 적용합니다.
      // (x축 기준 -90도 회전: Z가 Y로 올라오고, Y가 -Z로 이동)
      cloned.rotation.x = -Math.PI / 2;
      cloned.updateMatrixWorld(true);

      // SketchUp/OBJ/Assimp 경로에서 "얇은 면(벽/천장 등)"은 단면일 때가 많아,
      // glTF 기본 설정(단면 렌더링)에서는 각도에 따라 일부가 "사라진 것처럼" 보일 수 있습니다.
      // 그래서 뷰어 레벨에서 double-sided를 강제해 사용자 체감을 개선합니다.
      cloned.traverse((obj) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mesh = obj as any;
        if (!mesh || !mesh.isMesh) return;
        const material = mesh.material;
        const setDoubleSide = (m: any) => {
          if (!m) return;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        };
        if (Array.isArray(material)) material.forEach(setDoubleSide);
        else setDoubleSide(material);
      });

      modelRootRef.current = cloned;
      scene.add(cloned);

      // 모델이 원점에서 멀거나 스케일이 큰 경우 기본 카메라로는 안 보일 수 있어 자동 프레이밍
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        autoFrameModel(cloned, camera, controls);
        defaultDistanceRef.current = camera.position.distanceTo(controls.target);
      }

      // 인셋 오버뷰 카메라 프레이밍
      const insetCamera = insetCameraRef.current;
      if (insetCamera) {
        autoFrameInsetCamera(cloned, insetCamera, insetTargetRef.current);
      }

      setIsLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // 핀포인트 마커 업데이트
  React.useEffect(() => {
    const scene = sceneRef.current;
    const pinpointsGroup = pinpointsGroupRef.current;
    if (!scene || !pinpointsGroup) return;

    const markers = pinpointMarkersRef.current;
    const currentIds = new Set(pinpoints.map(p => p.id));

    // 제거된 핀포인트 마커 삭제
    for (const [id, marker] of markers.entries()) {
      if (!currentIds.has(id)) {
        pinpointsGroup.remove(marker);
        // marker는 Group일 수 있으므로 안전하게 traverse하며 자원을 해제
        marker.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mat = obj.material;
            if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
            else mat?.dispose();
          } else if (obj instanceof THREE.Sprite) {
            obj.material?.dispose();
          }
        });
        markers.delete(id);
      }
    }

    // 새 핀포인트 마커 추가 또는 업데이트
    for (const pinpoint of pinpoints) {
      if (markers.has(pinpoint.id)) {
        // 기존 마커 위치 및 상태 업데이트
        const group = markers.get(pinpoint.id)!;
        group.position.set(pinpoint.position.x, pinpoint.position.y, pinpoint.position.z);
        group.userData.pinpoint = pinpoint;
        
        // 그룹 내부의 마커와 스프라이트 색상 업데이트
        group.children.forEach((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
            const material = child.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial;
            if (material) {
              material.color.set(pinpoint.isResolved ? 0x00ff00 : 0xff0000);
            }
          }
        });
      } else {
        // 새 마커 생성
        const geometry = new THREE.SphereGeometry(0.1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: pinpoint.isResolved ? 0x00ff00 : 0xff0000,
          transparent: true,
          opacity: 0.8,
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(pinpoint.position.x, pinpoint.position.y, pinpoint.position.z);
        marker.userData.pinpointId = pinpoint.id;
        marker.userData.pinpoint = pinpoint;
        
        // 항상 카메라를 향하도록 (Billboard 효과)
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            color: pinpoint.isResolved ? 0x00ff00 : 0xff0000,
            transparent: true,
            opacity: 0.9,
          })
        );
        sprite.scale.set(0.2, 0.2, 1);
        sprite.position.copy(marker.position);
        sprite.userData.pinpointId = pinpoint.id;
        sprite.userData.pinpoint = pinpoint;
        
        // 구체와 스프라이트를 그룹으로 묶기
        const group = new THREE.Group();
        group.add(marker);
        group.add(sprite);
        group.userData.pinpointId = pinpoint.id;
        group.userData.pinpoint = pinpoint;
        
        pinpointsGroup.add(group);
        markers.set(pinpoint.id, group);
      }
    }
  }, [pinpoints]);

  // 썸네일 생성 함수를 외부에 노출
  React.useImperativeHandle(ref, () => ({
    captureThumbnail: async (cameraState: CameraState): Promise<string | null> => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!scene || !camera || !renderer) return null;

      // 카메라 상태 임시 저장
      const originalPosition = camera.position.clone();
      const originalTarget = controlsRef.current?.target.clone();
      const originalFov = camera.fov;
      const originalNear = camera.near;
      const originalFar = camera.far;

      // 썸네일용 카메라 상태 설정
      camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      if (controlsRef.current) {
        controlsRef.current.target.set(cameraState.target.x, cameraState.target.y, cameraState.target.z);
        controlsRef.current.update();
      }
      if (cameraState.fov) camera.fov = cameraState.fov;
      if (cameraState.near) camera.near = cameraState.near;
      if (cameraState.far) camera.far = cameraState.far;
      camera.updateProjectionMatrix();

      // 썸네일 생성
      const thumbnail = await captureThumbnail(renderer, scene, camera, 200, 150);

      // 카메라 상태 복원
      camera.position.copy(originalPosition);
      if (controlsRef.current && originalTarget) {
        controlsRef.current.target.copy(originalTarget);
        controlsRef.current.update();
      }
      camera.fov = originalFov;
      camera.near = originalNear;
      camera.far = originalFar;
      camera.updateProjectionMatrix();

      return thumbnail;
    }
  }), []);

  // onThumbnailRequest가 있으면 외부에서 썸네일 요청 가능하도록 설정
  React.useEffect(() => {
    if (onThumbnailRequest && sceneRef.current && cameraRef.current && rendererRef.current) {
      // 외부에서 썸네일 요청 시 사용할 수 있도록 준비
    }
  }, [onThumbnailRequest]);

  if (error && errorComponent) {
    return <>{errorComponent(error)}</>;
  }

  return (
    <div
      className={className}
      style={{
        width,
        height,
        backgroundColor,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {(() => {
        const opts = normalizeInsetViewportOptions(insetViewport);
        if (!opts.enabled) return null;
        return (
          <div
            style={{
              position: "absolute",
              top: opts.margin,
              left: opts.margin,
              width: opts.width,
              height: opts.height,
              border: "1px solid rgba(0,0,0,0.25)",
              borderRadius: 8,
              pointerEvents: "auto",
              // 인셋 영역에서의 클릭/드래그는 인셋 인터랙션으로 소비
              background: "transparent",
              boxShadow: "0 1px 6px rgba(0,0,0,0.15)",
              display: "grid",
              gridTemplateRows: "1fr auto",
              overflow: "hidden",
            }}
            onClick={handleInsetClick}
            onMouseDown={(e) => {
              // 메인 뷰어로 이벤트 전파 차단
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onAuxClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {/* 상단: 캔버스 인셋이 뒤에서 렌더링되므로, 여기는 클릭 영역만 담당 */}
            <div style={{ flex: 1 }} />

            {/* 하단: 동서남북/상하 프리셋 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 6,
                padding: 8,
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(6px)",
                borderTop: "1px solid rgba(0,0,0,0.12)",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {[
                { key: "N", label: "북", dir: new THREE.Vector3(0, 0, 1) },
                { key: "E", label: "동", dir: new THREE.Vector3(1, 0, 0) },
                { key: "S", label: "남", dir: new THREE.Vector3(0, 0, -1) },
                { key: "W", label: "서", dir: new THREE.Vector3(-1, 0, 0) },
                { key: "U", label: "위", dir: new THREE.Vector3(0, 1, 0) },
                { key: "D", label: "아래", dir: new THREE.Vector3(0, -1, 0) },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  style={{
                    border: "1px solid rgba(0,0,0,0.15)",
                    borderRadius: 6,
                    padding: "6px 0",
                    fontSize: 12,
                    background: "white",
                    cursor: "pointer",
                  }}
                  onClick={() => setMainCameraView(v.dir)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {isLoading && (loadingComponent ?? null)}
    </div>
  );
});

SketchupViewer.displayName = 'SketchupViewer';
