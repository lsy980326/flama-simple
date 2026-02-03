/**
 * 스케치업 뷰어 데모 컴포넌트
 * .skp 파일 업로드 → 변환 → 3D 뷰어로 표시
 */

import React, { useState, useRef } from 'react';
import { SketchupViewer, SketchupUploader, Vector3D, CameraState, SketchupPinpoint } from '../lib';
import { SketchupPinpointForm } from '../lib/components/SketchupPinpointForm';

export default function SketchupViewerDemo() {
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [clickedPosition, setClickedPosition] = useState<Vector3D | null>(null);
  const [clickedNormal, setClickedNormal] = useState<Vector3D | undefined>(undefined);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);
  const [pinpoints, setPinpoints] = useState<SketchupPinpoint[]>([]);
  const [showPinpointForm, setShowPinpointForm] = useState(false);
  const [restoreCameraState, setRestoreCameraState] = useState<CameraState | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<SketchupUploader | null>(null);
  
  const userId = 'demo-user-1';

  // 서버 URL 설정 (환경 변수 또는 기본값)
  // 서버 HTTP 포트 기본값: 5002 (macOS에서 5000 충돌 케이스 대응)
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5002';

  React.useEffect(() => {
    uploaderRef.current = new SketchupUploader(serverUrl);
  }, [serverUrl]);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploaderRef.current) {
      return;
    }

    // .skp 파일만 허용
    if (!file.name.toLowerCase().endsWith('.skp')) {
      setError('스케치업 파일(.skp)만 업로드할 수 있습니다.');
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    setIsConverting(true);
    setError(null);
    setConversionProgress(0);
    setUploadedFileName(file.name);
    setGlbUrl(null);

    try {
      // 1. 파일 업로드
      const uploadResponse = await uploaderRef.current.uploadFile(file);
      console.log('업로드 완료:', uploadResponse);

      // 2. 변환 완료까지 대기 (폴링)
      const finalGlbUrl = await uploaderRef.current.waitForConversion(
        uploadResponse.conversionId,
        (progress) => {
          setConversionProgress(progress);
          console.log(`변환 진행률: ${progress}%`);
        }
      );

      console.log('변환 완료! GLB URL:', finalGlbUrl);
      setGlbUrl(finalGlbUrl);
      setIsConverting(false);
      setConversionProgress(100);
    } catch (err) {
      console.error('업로드/변환 실패:', err);
      setError(err instanceof Error ? err.message : '업로드 또는 변환에 실패했습니다.');
      setIsUploading(false);
      setIsConverting(false);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleModelClick = (position: Vector3D, normal?: Vector3D) => {
    console.log('[Demo] 모델 클릭:', { position, normal });
    setClickedPosition(position);
    setClickedNormal(normal);
    setShowPinpointForm(true);
    console.log('[Demo] 폼 표시 상태:', true, 'clickedPosition:', position);
  };
  
  React.useEffect(() => {
    console.log('[Demo] 폼 상태 변경:', { showPinpointForm, clickedPosition });
  }, [showPinpointForm, clickedPosition]);

  const handleCameraChange = (state: CameraState) => {
    setCameraState(state);
  };

  const handlePinpointSubmit = (pinpointData: Omit<SketchupPinpoint, 'id' | 'createdAt'>) => {
    const newPinpoint: SketchupPinpoint = {
      ...pinpointData,
      id: `pinpoint-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date(),
    };
    setPinpoints((prev) => [...prev, newPinpoint]);
    setShowPinpointForm(false);
    setClickedPosition(null);
    setClickedNormal(undefined);
  };

  const handlePinpointCancel = () => {
    setShowPinpointForm(false);
    setClickedPosition(null);
    setClickedNormal(undefined);
  };

  const handlePinpointClick = (pinpoint: SketchupPinpoint) => {
    console.log('핀포인트 클릭:', pinpoint);
    if (pinpoint.viewState) {
      setRestoreCameraState(pinpoint.viewState);
    }
  };

  const handleDeletePinpoint = (id: string) => {
    setPinpoints((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLoadGlbDirectly = () => {
    const url = prompt('GLB 파일 URL을 입력하세요:');
    if (url) {
      setGlbUrl(url);
      setError(null);
      setUploadedFileName('직접 로드');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>스케치업 3D 뷰어 데모</h2>
      
      {/* 업로드 섹션 */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>파일 업로드</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={handleFileSelect}
            disabled={isUploading || isConverting}
            style={{
              padding: '10px 20px',
              backgroundColor: isUploading || isConverting ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isUploading || isConverting ? 'not-allowed' : 'pointer',
            }}
          >
            {isUploading ? '업로드 중...' : isConverting ? '변환 중...' : '.skp 파일 선택'}
          </button>
          
          <button 
            onClick={handleLoadGlbDirectly}
            disabled={isUploading || isConverting}
            style={{
              padding: '10px 20px',
              backgroundColor: isUploading || isConverting ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isUploading || isConverting ? 'not-allowed' : 'pointer',
            }}
          >
            GLB 직접 로드
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".skp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {uploadedFileName && (
          <div style={{ marginTop: '10px', color: '#666' }}>
            업로드된 파일: <strong>{uploadedFileName}</strong>
          </div>
        )}

        {isConverting && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '200px', 
                height: '20px', 
                backgroundColor: '#f0f0f0', 
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${conversionProgress}%`,
                  height: '100%',
                  backgroundColor: '#4CAF50',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span>{conversionProgress}%</span>
            </div>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              서버에서 .skp 파일을 .glb로 변환하는 중입니다...
            </p>
          </div>
        )}

        {error && (
          <div style={{ 
            marginTop: '10px', 
            padding: '10px', 
            backgroundColor: '#ffebee', 
            color: '#c62828',
            borderRadius: '4px'
          }}>
            <strong>오류:</strong> {error}
          </div>
        )}
      </div>

      {/* 뷰어 섹션 */}
      <div style={{ marginBottom: '20px' }}>
        {glbUrl ? (
          <div>
            <h3>3D 모델 뷰어</h3>
            <div style={{ 
              border: '2px solid #333', 
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '20px',
              position: 'relative'
            }}>
              <SketchupViewer
                glbUrl={glbUrl}
                onModelClick={handleModelClick}
                onCameraChange={(state) => {
                  handleCameraChange(state);
                  // 카메라 복원 후 상태 리셋
                  if (restoreCameraState) {
                    setRestoreCameraState(null);
                  }
                }}
                pinpoints={pinpoints}
                onPinpointClick={handlePinpointClick}
                cameraState={restoreCameraState || undefined}
                width={800}
                height={600}
                backgroundColor="#f5f5f5"
                enableGrid={true}
                enableAxes={true}
                loadingComponent={
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    height: '100%',
                    color: '#666'
                  }}>
                    모델 로딩 중...
                  </div>
                }
                errorComponent={(err) => (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    height: '100%',
                    color: '#c62828',
                    padding: '20px'
                  }}>
                    <div>
                      <strong>모델 로드 실패</strong>
                      <p>{err.message}</p>
                    </div>
                  </div>
                )}
              />
              
              {/* 핀포인트 입력 폼 */}
              {showPinpointForm && clickedPosition && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 }}>
                  <SketchupPinpointForm
                    position={clickedPosition}
                    normal={clickedNormal}
                    cameraState={cameraState || undefined}
                    userId={userId}
                    onSubmit={handlePinpointSubmit}
                    onCancel={handlePinpointCancel}
                  />
                </div>
              )}
            </div>

            {/* 정보 패널 */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr 1fr', 
              gap: '15px',
              marginTop: '20px'
            }}>
              {/* 클릭 정보 */}
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f9f9f9', 
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <h4 style={{ marginTop: 0 }}>클릭 정보</h4>
                {clickedPosition ? (
                  <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    <div>X: {clickedPosition.x.toFixed(2)}</div>
                    <div>Y: {clickedPosition.y.toFixed(2)}</div>
                    <div>Z: {clickedPosition.z.toFixed(2)}</div>
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>
                      모델을 클릭하면 3D 좌표가 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <p style={{ color: '#666', fontSize: '14px' }}>
                    모델을 클릭해보세요.
                  </p>
                )}
              </div>

              {/* 카메라 정보 */}
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f9f9f9', 
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <h4 style={{ marginTop: 0 }}>카메라 상태</h4>
                {cameraState ? (
                  <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    <div><strong>위치:</strong></div>
                    <div>X: {cameraState.position.x.toFixed(2)}</div>
                    <div>Y: {cameraState.position.y.toFixed(2)}</div>
                    <div>Z: {cameraState.position.z.toFixed(2)}</div>
                    <div style={{ marginTop: '10px' }}><strong>타겟:</strong></div>
                    <div>X: {cameraState.target.x.toFixed(2)}</div>
                    <div>Y: {cameraState.target.y.toFixed(2)}</div>
                    <div>Z: {cameraState.target.z.toFixed(2)}</div>
                    <div style={{ marginTop: '10px' }}>
                      FOV: {cameraState.fov?.toFixed(1) || 'N/A'}°
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#666', fontSize: '14px' }}>
                    카메라 정보가 로드되는 중...
                  </p>
                )}
              </div>

              {/* 핀포인트 목록 */}
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f9f9f9', 
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <h4 style={{ marginTop: 0 }}>핀포인트 ({pinpoints.length})</h4>
                {pinpoints.length > 0 ? (
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {pinpoints.map((pinpoint) => (
                      <div
                        key={pinpoint.id}
                        style={{
                          padding: '8px',
                          marginBottom: '8px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {pinpoint.comment.length > 30 
                            ? `${pinpoint.comment.substring(0, 30)}...` 
                            : pinpoint.comment}
                        </div>
                        <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>
                          {new Date(pinpoint.createdAt).toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={() => handlePinpointClick(pinpoint)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              backgroundColor: '#2196F3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            보기
                          </button>
                          <button
                            onClick={() => handleDeletePinpoint(pinpoint.id)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#666', fontSize: '14px' }}>
                    핀포인트가 없습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center', 
            backgroundColor: '#f9f9f9', 
            borderRadius: '8px',
            border: '1px dashed #ddd'
          }}>
            <p style={{ color: '#666', fontSize: '16px' }}>
              {isUploading || isConverting 
                ? '파일을 업로드하고 변환하는 중입니다...' 
                : '위에서 .skp 파일을 업로드하거나 GLB 파일을 직접 로드하세요.'}
            </p>
          </div>
        )}
      </div>

      {/* 사용법 안내 */}
      <div style={{ 
        marginTop: '30px', 
        padding: '15px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px',
        border: '1px solid #90caf9'
      }}>
        <h4 style={{ marginTop: 0 }}>사용법</h4>
        <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
          <li><strong>파일 업로드:</strong> ".skp 파일 선택" 버튼을 클릭하여 스케치업 파일을 업로드합니다.</li>
          <li><strong>변환 대기:</strong> 서버에서 .skp 파일을 .glb로 변환하는 동안 진행률이 표시됩니다.</li>
          <li><strong>모델 조작:</strong> 변환 완료 후 3D 뷰어에서 마우스로 모델을 회전, 확대/축소할 수 있습니다.</li>
          <li><strong>클릭 테스트:</strong> 모델을 클릭하면 해당 위치의 3D 좌표가 표시됩니다.</li>
          <li><strong>핀포인트 추가:</strong> 모델을 클릭하면 피드백 입력 폼이 나타나며, 핀포인트를 추가할 수 있습니다.</li>
          <li><strong>핀포인트 보기:</strong> 핀포인트 목록에서 "보기" 버튼을 클릭하면 해당 핀포인트 생성 시점의 카메라 상태로 이동합니다.</li>
          <li><strong>직접 로드:</strong> 이미 변환된 .glb 파일이 있다면 "GLB 직접 로드" 버튼을 사용하세요.</li>
        </ul>
        <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
          <strong>참고:</strong> 서버가 실행 중이어야 하며, Redis와 Assimp가 설치되어 있어야 합니다.
        </div>
      </div>
    </div>
  );
}
