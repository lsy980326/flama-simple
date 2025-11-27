import React from "react";
import {
  CanvasViewer,
  getWSEndpoint,
} from "../../../live-collaboration-tool/client/src/lib";

/**
 * 캔버스 뷰어 예제 (읽기 전용)
 *
 * Canvas 2D 기반 경량 뷰어를 사용합니다.
 * 단순히 컴포넌트를 import하고 props만 전달하면 됩니다.
 * 모든 기능이 라이브러리 내부에서 처리됩니다.
 */
export function CanvasViewerExample() {
  const user = {
    id: "viewer-user",
    name: "뷰어 사용자",
    color: "#9CA3AF",
    isOnline: true,
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>캔버스 뷰어 예제 (읽기 전용)</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        이 예제는 Canvas 2D 기반 경량 뷰어를 사용합니다. 다른 사용자가 그린
        내용을 실시간으로 볼 수 있지만, 직접 그릴 수는 없습니다.
      </p>
      <div
        style={{
          marginBottom: 12,
          padding: 12,
          background: "#EFF6FF",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        <strong>💡 뷰어 모드:</strong> Canvas 2D 기반으로 렌더링되어 PIXI.js보다
        가볍고 빠릅니다. 실시간 동기화는 Y.js를 통해 처리됩니다.
      </div>

      <CanvasViewer
        serverUrl={getWSEndpoint()}
        roomId="basic-example-room"
        user={user}
        width={800}
        height={600}
        canvasWidth={690}
      />

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        <strong>사용 방법:</strong> 위의 "1. 기본 캔버스" 예제에서 그리면 이
        뷰어에서 실시간으로 볼 수 있습니다. 같은 roomId("basic-example-room")를
        사용하여 동기화됩니다.
      </div>
    </div>
  );
}
