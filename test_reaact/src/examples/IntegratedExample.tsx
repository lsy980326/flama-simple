import React from "react";
import {
  LiveCollabCanvas,
  DocumentViewerWithUpload,
  getWSEndpoint,
} from "../../../live-collaboration-tool/client/src/lib";

/**
 * 통합 예제
 * 
 * 캔버스와 문서 뷰어를 함께 사용하는 예제입니다.
 */
export function IntegratedExample() {
  const user = {
    id: "user-integrated",
    name: "통합 사용자",
    color: "#10B981",
    isOnline: true,
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>통합 예제</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        캔버스와 문서 뷰어를 함께 사용할 수 있습니다.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div>
          <h4>실시간 협업 캔버스</h4>
          <LiveCollabCanvas
            serverUrl={getWSEndpoint()}
            roomId="integrated-canvas-room"
            user={user}
            width={800}
            height={500}
            showToolbar={true}
          />
        </div>

        <div>
          <h4>문서 뷰어</h4>
          <DocumentViewerWithUpload
            user={user}
            height={500}
            searchEnabled={true}
          />
        </div>
      </div>
    </div>
  );
}

