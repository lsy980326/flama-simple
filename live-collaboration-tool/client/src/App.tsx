import React from "react";
import { RealTimeDrawingManager, User, WebRTCConfig } from "./lib";
import "./App.css";

function App() {
  const [isConnected, setIsConnected] = React.useState(false);
  const [drawingManager, setDrawingManager] =
    React.useState<RealTimeDrawingManager | null>(null);
  const [activeUsers, setActiveUsers] = React.useState<User[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [hasBackgroundImage, setHasBackgroundImage] = React.useState(false);
  const [hasImageObjects, setHasImageObjects] = React.useState(false);
  const [backgroundScale, setBackgroundScale] = React.useState(1);
  const [isTransformManual, setIsTransformManual] = React.useState(false);
  const [isTransformHotkey, setIsTransformHotkey] = React.useState(false);
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const additionalImageInputRef = React.useRef<HTMLInputElement>(null);
  const hasTransformTarget = React.useMemo(
    () => hasBackgroundImage || hasImageObjects,
    [hasBackgroundImage, hasImageObjects]
  );
  const effectiveTransformMode = React.useMemo(
    () => (isTransformManual || isTransformHotkey) && hasTransformTarget,
    [isTransformManual, isTransformHotkey, hasTransformTarget]
  );

  React.useEffect(() => {
    let isMounted = true;
    let manager: RealTimeDrawingManager | null = null;

    // DOM이 준비될 때까지 기다림
    if (!canvasContainerRef.current) {
      return;
    }

    // 약간의 지연을 두어 DOM이 완전히 준비되도록 함
    const initTimeout = setTimeout(() => {
      if (!canvasContainerRef.current || !isMounted) {
        return;
      }

      try {
        // 테스트용 사용자 정보
        const testUser: User = {
          id: `user-${Math.random().toString(36).substr(2, 9)}`,
          name: "테스트 사용자",
          color: "#FF6B6B",
          isOnline: true,
        };

        // WebRTC 설정
        const webrtcConfig: WebRTCConfig = {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        };

        // 실시간 그림 그리기 매니저 초기화
        manager = new RealTimeDrawingManager(
          {
            serverUrl: "ws://localhost:5001",
            roomId: "drawing-room",
            user: testUser,
            webrtcConfig,
          },
          canvasContainerRef.current
        );

        manager.setOnBackgroundScaleChange((scale) => {
          if (isMounted) {
            setBackgroundScale(Number(scale.toFixed(2)));
            setHasBackgroundImage(manager?.hasBackgroundImage() ?? false);
          }
        });

        // 이벤트 리스너 설정
        manager.setOnDrawingUpdate((operations) => {
          if (isMounted) {
            console.log("그리기 작업 업데이트:", operations);
          }
        });

        manager.setOnAwarenessUpdate((states) => {
          if (isMounted) {
            const users = Array.from(states.values()).map(
              (state) => state.user
            );
            setActiveUsers(users);
          }
        });

        manager.setOnUserJoin((user) => {
          if (isMounted) {
            console.log("사용자 참가:", user);
          }
        });

        manager.setOnUserLeave((userId) => {
          if (isMounted) {
            console.log("사용자 떠남:", userId);
          }
        });

        manager.setOnPeerConnected((peerId) => {
          if (isMounted) {
            console.log("피어 연결됨:", peerId);
          }
        });

        manager.setOnPeerDisconnected((peerId) => {
          if (isMounted) {
            console.log("피어 연결 해제됨:", peerId);
          }
        });

        // 초기화 및 연결
        manager
          .initialize()
          .then(() => {
            if (isMounted) {
              console.log("실시간 그림 그리기 매니저 초기화 완료");
              if (!manager) {
                return;
              }
              setIsConnected(true);
              setDrawingManager(manager);
              setIsTransformManual(false);
              setIsTransformHotkey(false);
              setError(null);
              setHasBackgroundImage(manager.hasBackgroundImage());
              setBackgroundScale(manager.getBackgroundScale());
            }
          })
          .catch((err) => {
            if (isMounted) {
              console.error("초기화 실패:", err);
              setError(err instanceof Error ? err.message : "초기화 실패");
            }
          });
      } catch (err) {
        if (isMounted) {
          console.error("매니저 생성 실패:", err);
          setError(err instanceof Error ? err.message : "매니저 생성 실패");
        }
      }
    }, 100); // 100ms 지연

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      try {
        if (manager) {
          manager.setOnBackgroundScaleChange(undefined);
          manager.disconnect();
        }
      } catch (disconnectError) {
        // 무시 - cleanup 중 오류는 정상적일 수 있음
      }
    };
  }, []);

  React.useEffect(() => {
    if (!drawingManager) return;
    drawingManager.setTransformMode(effectiveTransformMode);
  }, [drawingManager, effectiveTransformMode]);

  React.useEffect(() => {
    if (!drawingManager) return;

    const handleObjectsChange = (objects: any[]) => {
      const hasImages = Array.isArray(objects)
        ? objects.some((obj) => obj?.type === "image")
        : false;
      setHasImageObjects(hasImages);
    };

    drawingManager.setOnObjectsChange(handleObjectsChange);

    return () => {
      drawingManager.setOnObjectsChange(undefined);
    };
  }, [drawingManager]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "t" || event.key === "T") && event.altKey) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (!hasTransformTarget) {
          return;
        }
        event.preventDefault();
        setIsTransformManual((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasTransformTarget]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(true);
        drawingManager?.setTransformHotkey(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(false);
        drawingManager?.setTransformHotkey(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [drawingManager]);

  const handleBrushSizeChange = (size: number) => {
    drawingManager?.setBrushSize(size);
  };

  const handleBrushColorChange = (color: string) => {
    drawingManager?.setBrushColor(color);
  };

  const handleClearCanvas = () => {
    drawingManager?.clearCanvas();
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !drawingManager) {
      return;
    }

    try {
      await drawingManager.loadBackgroundImage(file);
      setHasBackgroundImage(true);
      setBackgroundScale(
        Number(drawingManager.getBackgroundScale().toFixed(2))
      );
      setError(null);
    } catch (uploadError) {
      console.error("이미지 업로드 실패:", uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "이미지 업로드에 실패했습니다"
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleAdditionalImageClick = () => {
    additionalImageInputRef.current?.click();
  };

  const handleAdditionalImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || !drawingManager) {
      return;
    }

    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    try {
      for (const file of validFiles) {
        await drawingManager.addImageFromFile(file);
      }
      setHasImageObjects(true);
      setError(null);
    } catch (uploadError) {
      console.error("이미지 추가 실패:", uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "이미지를 추가하는 중 오류가 발생했습니다"
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleBackgroundScaleChange = (value: number) => {
    if (!drawingManager || !effectiveTransformMode || !hasBackgroundImage)
      return;

    drawingManager.setBackgroundScale(value);
    const appliedScale = drawingManager.getBackgroundScale();
    setBackgroundScale(Number(appliedScale.toFixed(2)));
  };

  const handleResetBackgroundTransform = () => {
    if (!drawingManager || !effectiveTransformMode || !hasBackgroundImage)
      return;

    drawingManager.resetBackgroundImageTransform();
    setBackgroundScale(Number(drawingManager.getBackgroundScale().toFixed(2)));
  };

  const handleRemoveBackgroundImage = () => {
    if (!drawingManager) return;

    drawingManager.removeBackgroundImage();
    setHasBackgroundImage(false);
    setBackgroundScale(1);
    setIsTransformManual(false);
    setIsTransformHotkey(false);
  };

  React.useEffect(() => {
    if (!drawingManager) {
      setHasBackgroundImage(false);
      setHasImageObjects(false);
      setBackgroundScale(1);
      setIsTransformManual(false);
      setIsTransformHotkey(false);
      return;
    }

    setHasBackgroundImage(drawingManager.hasBackgroundImage());
    setBackgroundScale(
      Number(drawingManager.getBackgroundScale().toFixed(2)) || 1
    );
    setIsTransformManual(drawingManager.isTransformModeEnabled());
    setIsTransformHotkey(false);
  }, [drawingManager]);

  React.useEffect(() => {
    if (!hasTransformTarget) {
      setIsTransformHotkey(false);
      setIsTransformManual(false);
    }
  }, [hasTransformTarget]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Live Collaboration Tool - 실시간 그림 그리기</h1>
        <p>연결 상태: {isConnected ? "연결됨" : "연결 안됨"}</p>
        <p>활성 사용자: {activeUsers.length}명</p>
        {error && (
          <div style={{ color: "red", marginTop: "10px" }}>오류: {error}</div>
        )}

        <div style={{ marginTop: "20px", display: "flex", gap: "20px" }}>
          {/* 그리기 도구 */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <h3>그리기 도구</h3>

            <div>
              <label>브러시 크기: </label>
              <input
                type="range"
                min="1"
                max="20"
                defaultValue="5"
                onChange={(e) =>
                  handleBrushSizeChange(parseInt(e.target.value))
                }
              />
            </div>

            <div>
              <label>색상: </label>
              <input
                type="color"
                defaultValue="#000000"
                onChange={(e) => handleBrushColorChange(e.target.value)}
              />
            </div>

            <button onClick={handleClearCanvas}>캔버스 지우기</button>

            <hr style={{ width: "100%" }} />

            <h3>이미지 도구</h3>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span>
                Transform 모드: {effectiveTransformMode ? "ON" : "OFF"} (Alt+T
                토글 / Ctrl 누른 채 유지)
              </span>
              <button
                onClick={() => setIsTransformManual((prev) => !prev)}
                disabled={!hasBackgroundImage}
              >
                {effectiveTransformMode
                  ? "Transform 모드 종료"
                  : "Transform 모드 진입"}
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <strong>이미지 관리</strong>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button onClick={handleImageUploadClick}>
                  배경 이미지 불러오기
                </button>
                <button onClick={handleAdditionalImageClick}>
                  이미지 추가
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageFileChange}
              />
              <input
                ref={additionalImageInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleAdditionalImageChange}
              />
              <div style={{ marginTop: 12 }}>
                <label>배경 확대/축소: {backgroundScale.toFixed(2)}x</label>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.01}
                  value={backgroundScale}
                  onChange={(e) =>
                    handleBackgroundScaleChange(parseFloat(e.target.value))
                  }
                  disabled={!hasBackgroundImage}
                />
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  onClick={handleResetBackgroundTransform}
                  disabled={!hasBackgroundImage || !effectiveTransformMode}
                >
                  배경 초기화
                </button>
                <button
                  onClick={handleRemoveBackgroundImage}
                  disabled={!hasBackgroundImage}
                >
                  배경 제거
                </button>
              </div>
            </div>

            <hr style={{ width: "100%" }} />

            <h3>캔버스 저장/불러오기</h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <button onClick={() => drawingManager?.downloadCanvasState()}>
                저장하기 (JSON)
              </button>
              <input
                type="file"
                accept="application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !drawingManager) return;
                  try {
                    const text = await file.text();
                    await drawingManager.importCanvasState(text);
                    setHasBackgroundImage(drawingManager.hasBackgroundImage());
                    setBackgroundScale(drawingManager.getBackgroundScale());
                  } catch (error) {
                    console.error("불러오기 실패:", error);
                    setError("캔버스 불러오기에 실패했습니다.");
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>

          {/* 캔버스 영역 */}
          <div>
            <h3>실시간 협업 캔버스</h3>
            <div
              ref={canvasContainerRef}
              id="canvas-container"
              style={{
                width: "800px",
                height: "600px",
                border: "2px solid #333",
                backgroundColor: "#fff",
                cursor: "crosshair",
              }}
            >
              {!drawingManager && <div>캔버스를 초기화하는 중...</div>}
            </div>
          </div>

          {/* 사용자 목록 */}
          <div>
            <h3>활성 사용자</h3>
            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {activeUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    padding: "5px",
                    margin: "2px 0",
                    backgroundColor: user.color,
                    color: "white",
                    borderRadius: "3px",
                    fontSize: "12px",
                  }}
                >
                  {user.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 사용법 안내 */}
        <div
          style={{ marginTop: "20px", textAlign: "left", maxWidth: "800px" }}
        >
          <h3>사용법:</h3>
          <ul>
            <li>마우스로 캔버스에 그려보세요</li>
            <li>브러시 크기와 색상을 변경할 수 있습니다</li>
            <li>다른 사용자와 실시간으로 협업할 수 있습니다</li>
            <li>Y.js로 데이터 동기화, WebRTC로 P2P 통신합니다</li>
            <li>
              Alt+T로 Transform 모드를 토글하거나 Ctrl을 누른 상태에서 이미지를
              클릭/드래그해 빠르게 편집할 수 있습니다
            </li>
            <li>
              이미지를 불러온 뒤 캔버스에서 드래그하면 위치를 옮길 수 있습니다
            </li>
            <li>
              이미지 배율 슬라이드로 크기를 조절하고 초기화 버튼으로 다시 맞출
              수 있습니다
            </li>
          </ul>
        </div>
      </header>
    </div>
  );
}

export default App;
