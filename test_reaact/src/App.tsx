import React from "react";
import {
  LiveCollabCanvas,
  RealTimeDrawingManager,
} from "../../live-collaboration-tool/client/src/lib";

const WS_ENDPOINT = "ws://127.0.0.1:5001";

function useTestUser(label: string) {
  return React.useMemo(
    () => ({
      id: `${label}-${Math.random().toString(36).slice(2, 9)}`,
      name: label,
      color: "#FF6B6B",
      isOnline: true,
    }),
    [label]
  );
}

function Section({
  title,
  description,
  children,
}: React.PropsWithChildren<{
  title: string;
  description?: string;
}>) {
  return (
    <section
      style={{
        marginBottom: 32,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description && <p style={{ color: "#555" }}>{description}</p>}
      {children}
    </section>
  );
}

export default function App() {
  const basicUser = useTestUser("basic-user");
  const lightweightUser = useTestUser("lightweight-user");
  const popupUser = useTestUser("popup-user");
  const [isPopupOpen, setPopupOpen] = React.useState(false);
  const [customManager, setCustomManager] =
    React.useState<RealTimeDrawingManager | null>(null);
  const [customBrush, setCustomBrush] = React.useState(6);
  const [customColor, setCustomColor] = React.useState("#2F80ED");
  const [customScale, setCustomScale] = React.useState(1);
  const [customHasBackground, setCustomHasBackground] = React.useState(false);
  const [customHasOverlay, setCustomHasOverlay] = React.useState(false);
  const [customTransform, setCustomTransform] = React.useState(false);
  const [customTransformHotkey, setCustomTransformHotkey] = React.useState(false);
  const customFileInputRef = React.useRef<HTMLInputElement>(null);
  const customOverlayInputRef = React.useRef<HTMLInputElement>(null);
  const customHasTransformTarget = React.useMemo(
    () => customHasBackground || customHasOverlay,
    [customHasBackground, customHasOverlay]
  );
  const effectiveCustomTransform = React.useMemo(
    () => (customTransform || customTransformHotkey) && customHasTransformTarget,
    [customTransform, customTransformHotkey, customHasTransformTarget]
  );

  React.useEffect(() => {
    if (!customManager) return;

    customManager.setOnBackgroundScaleChange((scale) => {
      setCustomScale(Number(scale.toFixed(2)));
      setCustomHasBackground(customManager.hasBackgroundImage());
    });

    setCustomHasBackground(customManager.hasBackgroundImage());
    setCustomScale(Number(customManager.getBackgroundScale().toFixed(2)));
    setCustomTransform(customManager.isTransformModeEnabled());

    return () => {
      customManager.setOnBackgroundScaleChange(undefined);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customManager) return;

    const handleObjectsChange = (objects: any[]) => {
      const hasImages = Array.isArray(objects)
        ? objects.some((obj) => obj?.type === "image")
        : false;
      setCustomHasOverlay(hasImages);
    };

    customManager.setOnObjectsChange(handleObjectsChange);

    return () => {
      customManager.setOnObjectsChange(undefined);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setBrushSize(customBrush);
  }, [customBrush, customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setBrushColor(customColor);
  }, [customColor, customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setTransformMode(effectiveCustomTransform);
  }, [customManager, effectiveCustomTransform]);

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
        if (!customHasTransformTarget) {
          return;
        }
        event.preventDefault();
        setCustomTransform((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customHasTransformTarget]);

  React.useEffect(() => {
    if (!customManager) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCustomTransformHotkey(true);
        customManager.setTransformHotkey(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCustomTransformHotkey(false);
        customManager.setTransformHotkey(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customHasTransformTarget) {
      setCustomTransformHotkey(false);
    }
  }, [customHasTransformTarget]);

  const handleCustomScaleChange = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    setCustomScale(rounded);
    customManager?.setBackgroundScale(rounded);
  };

  const handleCustomImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !customManager) return;

    try {
      await customManager.loadBackgroundImage(file);
      setCustomHasBackground(true);
      setCustomScale(Number(customManager.getBackgroundScale().toFixed(2)));
    } catch (error) {
      console.error("이미지 업로드 실패:", error);
      alert("이미지를 불러오지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  };

  const handleCustomOverlayUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || !customManager) {
      event.target.value = "";
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
        await customManager.addImageFromFile(file);
      }
      setCustomHasOverlay(true);
    } catch (error) {
      console.error("오버레이 이미지 추가 실패:", error);
      alert("오버레이 이미지를 추가하는 중 오류가 발생했습니다.");
    } finally {
      event.target.value = "";
    }
  };

  const handleCustomRemoveBackground = () => {
    if (!customManager) return;
    try {
      customManager.removeBackgroundImage();
      setCustomHasBackground(false);
      setCustomScale(1);
      if (!customHasOverlay) {
        setCustomTransform(false);
        setCustomTransformHotkey(false);
      }
    } catch (error) {
      console.error("배경 이미지 제거 실패:", error);
    }
  };

  const toggleCustomTransform = () => {
    if (!customManager) return;
    setCustomTransform((prev) => !prev);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h2>LiveCollab Canvas Examples</h2>
      <p style={{ color: "#444" }}>
        아래 예제들은 `LiveCollabCanvas` 컴포넌트를 다양한 방법으로 사용하는
        모습을 보여줍니다.
      </p>

      <Section
        title="1. 기본 도구 패널"
        description="가장 단순한 형태로 캔버스를 렌더링합니다. 같은 roomId를 사용하면 여러 브라우저에서 실시간으로 동기화됩니다."
      >
        <LiveCollabCanvas
          serverUrl={WS_ENDPOINT}
          roomId="demo-room-basic"
          user={basicUser}
          width={900}
          height={520}
          showToolbar
        />
      </Section>

      <Section
        title="2. 최소 구성"
        description="툴바 없이 순수한 캔버스만 렌더링하고 싶을 때 사용할 수 있는 설정입니다. UI는 직접 구성하면 됩니다."
      >
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div>
            <LiveCollabCanvas
              serverUrl={WS_ENDPOINT}
              roomId="demo-room-minimal"
              user={lightweightUser}
              width={700}
              height={420}
              showToolbar={false}
            />
          </div>
        </div>
      </Section>

      <Section
        title="3. 팝업/모달 안에서 사용"
        description="다른 페이지 흐름을 유지하면서 별도의 팝업 창에서 협업 캔버스를 띄울 수 있습니다."
      >
        <button
          style={{ padding: "8px 16px", cursor: "pointer" }}
          onClick={() => setPopupOpen(true)}
        >
          팝업 열기
        </button>

        {isPopupOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
            }}
          >
            <div
              style={{
                background: "white",
                padding: 16,
                borderRadius: 10,
                width: "85%",
                maxWidth: 960,
                boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h4 style={{ margin: 0 }}>실시간 드로잉 팝업</h4>
                <button
                  style={{
                    padding: "4px 10px",
                    border: "none",
                    background: "#333",
                    color: "white",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  onClick={() => setPopupOpen(false)}
                >
                  닫기
                </button>
              </div>
              <LiveCollabCanvas
                serverUrl={WS_ENDPOINT}
                roomId="demo-room-modal"
                user={popupUser}
                width={840}
                height={480}
                showToolbar
              />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="4. 커스텀 UI 연동"
        description="툴바 없이 직접 버튼과 슬라이더를 만들고 `RealTimeDrawingManager` API를 호출하는 예제입니다."
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>브러시 크기</span>
            <input
              type="range"
              min={1}
              max={30}
              value={customBrush}
              onChange={(e) => setCustomBrush(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
              disabled={!customManager}
            />
            <span>{customBrush}px</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>색상</span>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              disabled={!customManager}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => customManager?.clearCanvas()}
              disabled={!customManager}
            >
              캔버스 지우기
            </button>
            <button
              onClick={toggleCustomTransform}
              disabled={!customManager || !customHasTransformTarget}
            >
              Transform {effectiveCustomTransform ? "끄기" : "켜기"}
            </button>
            <button
              onClick={() => customManager?.resetBackgroundImageTransform()}
              disabled={!customManager || !customHasBackground || !effectiveCustomTransform}
            >
              이미지 초기화
            </button>
            <button
              onClick={handleCustomRemoveBackground}
              disabled={!customHasBackground}
            >
              이미지 제거
            </button>
            <button
              onClick={() => customFileInputRef.current?.click()}
              disabled={!customManager}
            >
              이미지 불러오기
            </button>
            <input
              ref={customFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleCustomImageUpload}
            />
            <button
              onClick={() => customOverlayInputRef.current?.click()}
              disabled={!customManager}
            >
              오버레이 이미지 추가
            </button>
            <input
              ref={customOverlayInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleCustomOverlayUpload}
            />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>이미지 배율</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.05}
              value={customScale}
              onChange={(e) =>
                handleCustomScaleChange(parseFloat(e.target.value))
              }
              disabled={!customManager || !customHasBackground || !effectiveCustomTransform}
              style={{ flex: 1 }}
            />
            <span>{customScale.toFixed(2)}x</span>
          </label>
          <div style={{ fontSize: 12, color: "#666" }}>
            💡 Alt+T로 토글하거나 Ctrl을 누른 채 이미지를 클릭/드래그하면 Transform 모드가 활성화됩니다.
          </div>
        </div>

        <LiveCollabCanvas
          serverUrl={WS_ENDPOINT}
          roomId="demo-room-custom-ui"
          user={lightweightUser}
          width={900}
          height={520}
          showToolbar={false}
          onReady={({ manager }) => {
            setCustomManager(manager);
            setCustomHasBackground(manager.hasBackgroundImage());
            setCustomScale(Number(manager.getBackgroundScale().toFixed(2)));
            manager.setBrushSize(customBrush);
            manager.setBrushColor(customColor);
          }}
        />
      </Section>
    </div>
  );
}
