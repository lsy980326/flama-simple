import React from "react";
import {
  LiveCollabCanvas,
  getWSEndpoint,
} from "../../../live-collaboration-tool/client/src/lib";
import { useDemoUser } from "./demoUser";

/**
 * 여러 캔버스 동시 사용 예제
 *
 * 같은 roomId를 사용하면 실시간으로 동기화되고,
 * 다른 roomId를 사용하면 독립적인 캔버스가 됩니다.
 */
export function MultipleCanvasExample() {
  const user1 = useDemoUser("user-multi-1", "사용자 1");
  const user2 = useDemoUser("user-multi-2", "사용자 2");

  return (
    <div style={{ padding: 20 }}>
      <h3>여러 캔버스 동시 사용 예제</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        같은 roomId를 사용하면 실시간으로 동기화됩니다. 다른 roomId를 사용하면
        독립적인 캔버스가 됩니다.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <h4>캔버스 1 (room-1)</h4>
          <LiveCollabCanvas
            serverUrl={getWSEndpoint()}
            roomId="room-1"
            user={user1}
            width={400}
            height={300}
            showToolbar={true}
            showThumbnail={false}
          />
        </div>

        <div>
          <h4>캔버스 2 (room-1 - 동기화됨)</h4>
          <LiveCollabCanvas
            serverUrl={getWSEndpoint()}
            roomId="room-1"
            user={user2}
            width={400}
            height={300}
            showToolbar={true}
            showThumbnail={false}
          />
        </div>

        <div>
          <h4>캔버스 3 (room-2 - 독립적)</h4>
          <LiveCollabCanvas
            serverUrl={getWSEndpoint()}
            roomId="room-2"
            user={user1}
            width={400}
            height={300}
            showToolbar={true}
            showThumbnail={false}
          />
        </div>
      </div>
    </div>
  );
}
