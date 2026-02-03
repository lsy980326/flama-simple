import React from "react";
import { 
  SketchupUploader, 
  SketchupViewer, 
  SketchupPinpointForm,
  Vector3D, 
  CameraState, 
  SketchupPinpoint 
} from "../../../live-collaboration-tool/client/src/lib";

/**
 * 스케치업 뷰어 데모 (React 19 호환)
 * - GLB URL 직접 입력해서 로드 가능
 * - (선택) 서버 업로드/변환도 가능
 * - 핀포인트 추가 기능 포함
 */
export function SketchupExample() {
  const [glbUrl, setGlbUrl] = React.useState<string>("");
  const [activeUrl, setActiveUrl] = React.useState<string>("");
  const [progress, setProgress] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const [clickedPosition, setClickedPosition] = React.useState<Vector3D | null>(null);
  const [clickedNormal, setClickedNormal] = React.useState<Vector3D | undefined>(undefined);
  const [cameraState, setCameraState] = React.useState<CameraState | null>(null);
  const [pinpoints, setPinpoints] = React.useState<SketchupPinpoint[]>([]);
  const [showPinpointForm, setShowPinpointForm] = React.useState(false);
  const [restoreCameraState, setRestoreCameraState] = React.useState<CameraState | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const viewerRef = React.useRef<{ captureThumbnail: (cameraState: CameraState) => Promise<string | null> } | null>(null);
  
  const userId = 'demo-user-1';

  const serverUrl = "http://localhost:5002";
  const uploader = React.useMemo(() => new SketchupUploader(serverUrl), []);

  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    setError(null);
    setProgress(0);
    try {
      const res = await uploader.uploadFile(file);
      const url = await uploader.waitForConversion(res.conversionId, (p) =>
        setProgress(p)
      );
      setActiveUrl(url);
      setGlbUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>스케치업 뷰어</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={glbUrl}
          onChange={(e) => setGlbUrl(e.target.value)}
          placeholder="GLB URL 입력 (예: http://localhost:5002/api/sketchup/models/xxx.glb)"
          style={{ width: 720, maxWidth: "100%", padding: "8px 10px" }}
        />
        <button onClick={() => setActiveUrl(glbUrl)} disabled={!glbUrl}>
          로드
        </button>
        <button onClick={onPickFile}>.skp/.glb 업로드</button>
        <input
          ref={fileRef}
          type="file"
          accept=".skp,.glb"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {progress > 0 && progress < 100 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          변환 진행률: {progress}%
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#c62828" }}>
          오류: {error}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
        {activeUrl ? (
          <>
            {/* 뷰어 왼쪽 */}
            <div style={{ position: 'relative', border: '2px solid #333', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
              <SketchupViewer
                ref={viewerRef}
                glbUrl={activeUrl}
                width={900}
                height={600}
                onModelClick={(pos, normal) => {
                  console.log("click", pos);
                  setClickedPosition(pos);
                  setClickedNormal(normal);
                  setShowPinpointForm(true);
                }}
                onCameraChange={(state) => {
                  setCameraState(state);
                  // 카메라 복원 후 상태 리셋
                  if (restoreCameraState) {
                    setRestoreCameraState(null);
                  }
                }}
                pinpoints={pinpoints}
                onPinpointClick={(pinpoint) => {
                  console.log('핀포인트 클릭:', pinpoint);
                  if (pinpoint.viewState) {
                    setRestoreCameraState(pinpoint.viewState);
                  }
                }}
                cameraState={restoreCameraState || undefined}
              />
              
              {/* 핀포인트 입력 폼 */}
              {showPinpointForm && clickedPosition && (
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  pointerEvents: 'none', 
                  zIndex: 1000 
                }}>
                  <SketchupPinpointForm
                    position={clickedPosition}
                    normal={clickedNormal}
                    cameraState={cameraState || undefined}
                    userId={userId}
                    onSubmit={async (pinpointData) => {
                      // 썸네일 생성
                      let thumbnail: string | null = null;
                      if (cameraState && viewerRef.current) {
                        try {
                          thumbnail = await viewerRef.current.captureThumbnail(cameraState);
                        } catch (error) {
                          console.error('썸네일 생성 실패:', error);
                        }
                      }
                      
                      const newPinpoint: SketchupPinpoint = {
                        ...pinpointData,
                        id: `pinpoint-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        createdAt: new Date(),
                        thumbnail: thumbnail || undefined,
                      };
                      setPinpoints((prev) => [...prev, newPinpoint]);
                      setShowPinpointForm(false);
                      setClickedPosition(null);
                      setClickedNormal(undefined);
                    }}
                    onCancel={() => {
                      setShowPinpointForm(false);
                      setClickedPosition(null);
                      setClickedNormal(undefined);
                    }}
                  />
                </div>
              )}
            </div>
            
            {/* 핀포인트 목록 오른쪽 */}
            {pinpoints.length > 0 && (
              <div style={{ 
                width: '400px',
                padding: 16, 
                backgroundColor: '#f9f9f9', 
                borderRadius: '8px',
                border: '1px solid #ddd',
                overflowY: 'auto',
                maxHeight: '600px',
                flexShrink: 0
              }}>
                <h4 style={{ marginTop: 0, marginBottom: 16 }}>핀포인트 ({pinpoints.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pinpoints.map((pinpoint) => (
                    <div
                      key={pinpoint.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #ddd',
                        fontSize: '12px'
                      }}
                    >
                      {/* 썸네일 왼쪽 */}
                      <div style={{ flexShrink: 0 }}>
                        {pinpoint.thumbnail ? (
                          <img 
                            src={pinpoint.thumbnail} 
                            alt="썸네일"
                            style={{
                              width: '120px',
                              height: '90px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #ddd',
                              backgroundColor: '#f0f0f0'
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '120px',
                            height: '90px',
                            backgroundColor: '#e0e0e0',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                            fontSize: '11px',
                            border: '1px solid #ddd'
                          }}>
                            썸네일 없음
                          </div>
                        )}
                      </div>
                      
                      {/* 메모 + 버튼 오른쪽 */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontWeight: 'bold', 
                            marginBottom: '4px',
                            wordBreak: 'break-word'
                          }}>
                            {pinpoint.comment}
                          </div>
                          <div style={{ color: '#666', fontSize: '11px' }}>
                            {new Date(pinpoint.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              if (pinpoint.viewState) {
                                setRestoreCameraState(pinpoint.viewState);
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              backgroundColor: '#2196F3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            보기
                          </button>
                          <button
                            onClick={() => {
                              setPinpoints((prev) => prev.filter((p) => p.id !== pinpoint.id));
                            }}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#666" }}>GLB URL을 입력하고 로드하세요.</div>
        )}
      </div>
    </div>
  );
}

