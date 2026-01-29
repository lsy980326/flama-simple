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
import { Vector3D, CameraState } from "../sketchup/types";

export interface SketchupViewerProps {
  glbUrl: string;
  onCameraChange?: (state: CameraState) => void;
  onModelClick?: (position: Vector3D, normal?: Vector3D) => void;
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

export const SketchupViewer: React.FC<SketchupViewerProps> = ({
  glbUrl,
  onCameraChange,
  onModelClick,
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
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = React.useRef<OrbitControls | null>(null);
  const modelRootRef = React.useRef<THREE.Object3D | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const lastCamStateRef = React.useRef<string>("");

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
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 100;
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

    // render loop
    const tick = () => {
      animationRef.current = requestAnimationFrame(tick);
      controls.update();
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
      if (!onModelClick) return;
      const model = modelRootRef.current;
      if (!model) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) return;

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
    };
    renderer.domElement.addEventListener("click", handleClick);

    return () => {
      renderer.domElement.removeEventListener("click", handleClick);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;

      if (grid) scene.remove(grid);
      if (axes) scene.remove(axes);

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
};
