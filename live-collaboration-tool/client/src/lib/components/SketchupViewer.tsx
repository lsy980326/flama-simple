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
  initialCamera?: Partial<CameraState>;
  cameraState?: CameraState;
  loadingComponent?: React.ReactNode;
  errorComponent?: (error: Error) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
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
  const direction = new THREE.Vector3(1, 1, 1).normalize();

  camera.position.copy(center.clone().add(direction.multiplyScalar(dist * 1.5 + 0.1)));
  camera.near = Math.max(0.01, dist / 100);
  camera.far = Math.max(1000, dist * 100);
  camera.updateProjectionMatrix();

  controls.update();
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

  const [error, setError] = React.useState<Error | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

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
    controls.minDistance = 1;
    controls.maxDistance = 100;
    // 더블 클릭 이벤트 비활성화 (클릭 이벤트와 충돌 방지)
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controlsRef.current = controls;

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(10, 10, 5);
    scene.add(dir);

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
      
      renderer.render(scene, camera);

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

    // click -> raycast
    const handleClick = (event: MouseEvent) => {
      // OrbitControls의 더블 클릭 이벤트와 충돌 방지
      if (event.detail === 2) {
        return; // 더블 클릭은 무시
      }
      
      console.log('[SketchupViewer] 클릭 이벤트 발생', { 
        clientX: event.clientX, 
        clientY: event.clientY,
        detail: event.detail 
      });
      
      const model = modelRootRef.current;
      if (!model) {
        console.log('[SketchupViewer] 모델이 없습니다');
        return;
      }
      
      // 모델이 씬에 추가되었는지 확인
      if (!scene.children.includes(model)) {
        console.log('[SketchupViewer] 모델이 씬에 없습니다');
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      console.log('[SketchupViewer] 마우스 좌표:', mouse);
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      // 먼저 핀포인트 마커와 교차 검사
      const pinpointsGroup = pinpointsGroupRef.current;
      if (pinpointsGroup && onPinpointClick) {
        const pinpointIntersects = raycaster.intersectObjects(pinpointsGroup.children, true);
        if (pinpointIntersects.length > 0) {
          console.log('[SketchupViewer] 핀포인트 클릭 감지');
          const hit = pinpointIntersects[0];
          const marker = hit.object;
          const pinpointId = marker.userData.pinpointId;
          if (pinpointId) {
            // 핀포인트 찾기
            const pinpoint = Array.from(pinpointMarkersRef.current.entries())
              .find(([id]) => id === pinpointId)?.[1]?.userData.pinpoint as SketchupPinpoint;
            if (pinpoint) {
              onPinpointClick(pinpoint);
              return;
            }
          }
        }
      }

      // 모델 클릭 처리
      if (!onModelClick) {
        console.log('[SketchupViewer] onModelClick 콜백이 없습니다');
        return;
      }
      
      const intersects = raycaster.intersectObject(model, true);
      console.log('[SketchupViewer] 교차점 개수:', intersects.length);
      
      if (intersects.length === 0) {
        console.log('[SketchupViewer] 모델과 교차하지 않음');
        return;
      }

      const hit = intersects[0];
      const position: Vector3D = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      console.log('[SketchupViewer] 클릭 위치:', position);

      let normal: Vector3D | undefined;
      if (hit.face) {
        const obj = hit.object as THREE.Mesh;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
        const n = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        normal = { x: n.x, y: n.y, z: n.z };
      }
      
      console.log('[SketchupViewer] onModelClick 호출');
      onModelClick(position, normal);
    };
    renderer.domElement.addEventListener("click", handleClick);

    return () => {
      renderer.domElement.removeEventListener("click", handleClick);
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
      modelRootRef.current = cloned;
      scene.add(cloned);

      // 모델이 원점에서 멀거나 스케일이 큰 경우 기본 카메라로는 안 보일 수 있어 자동 프레이밍
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        autoFrameModel(cloned, camera, controls);
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
        marker.geometry?.dispose();
        if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        } else {
          marker.material?.dispose();
        }
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
      {isLoading && (loadingComponent ?? null)}
    </div>
  );
});

SketchupViewer.displayName = 'SketchupViewer';
