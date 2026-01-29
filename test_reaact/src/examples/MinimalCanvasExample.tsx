import React from "react";
import { LiveCollabCanvas, getWSEndpoint } from "../../../live-collaboration-tool/client/src/lib";
import { useDemoUser } from "./demoUser";

/**
 * 최소 구성 캔버스 예제
 * 
 * 툴바 없이 순수한 캔버스만 렌더링합니다.
 * UI는 필요에 따라 직접 구성할 수 있습니다.
 */
export function MinimalCanvasExample() {
  const user = useDemoUser("user-minimal", "최소 구성 사용자");

  return (
    <div style={{ padding: 20 }}>
      <h3>최소 구성 캔버스 예제</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        툴바 없이 캔버스만 표시합니다. RealTimeDrawingManager API를 통해 직접 제어할 수 있습니다.
      </p>
      <div style={{ border: "2px solid #333", display: "inline-block" }}>
        <LiveCollabCanvas
          serverUrl={getWSEndpoint()}
          roomId="minimal-example-room"
          user={user}
          width={700}
          height={500}
          showToolbar={false}
        />
      </div>
    </div>
  );
}

