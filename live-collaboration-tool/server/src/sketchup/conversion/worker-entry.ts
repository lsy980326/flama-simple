import dotenv from "dotenv";

dotenv.config();

/**
 * 원격 변환 워커(별도 머신)용 엔트리.
 *
 * - 메인 서버(Express)는 실행하지 않고, Bull 큐의 변환 작업만 처리합니다.
 * - 변환 결과를 메인 서버로 보내려면:
 *   - SKETCHUP_STORE_URL (예: http://main-server:5002)
 *   - SKETCHUP_INTERNAL_KEY (메인 서버와 동일 값)
 */
async function main() {
  const mod = await import("./assimp-worker.js");
  if (mod.initializeAssimpWorker) mod.initializeAssimpWorker();

  console.log("🧰 SketchUp conversion worker is running.");

  // Bull worker는 내부적으로 이벤트 루프를 잡고 있지만,
  // 환경에 따라 프로세스가 종료되는 것을 방지하기 위해 keep-alive를 둡니다.
  setInterval(() => {}, 60_000);
}

main().catch((e) => {
  console.error("❌ worker-entry fatal:", e);
  process.exit(1);
});

