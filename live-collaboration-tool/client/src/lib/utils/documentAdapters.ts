import { DocumentAdapterRegistry } from "../documents/types";
import { TxtAdapter } from "../documents/adapters/TxtAdapter";
import { DocxAdapter } from "../documents/adapters/DocxAdapter";
import { MeAdapter } from "../documents/adapters/MeAdapter";
import { HwpAdapter } from "../documents/adapters/HwpAdapter";

/**
 * 기본 어댑터 레지스트리를 생성하고 등록합니다.
 * 
 * 지원하는 파일 형식:
 * - .txt (우선순위: 100)
 * - .docx (우선순위: 80)
 * - .me, .md (우선순위: 75)
 * - .hwp (우선순위: 60, API 필요: http://localhost:5000)
 * 
 * @returns 설정된 DocumentAdapterRegistry 인스턴스
 */
export function createDefaultAdapterRegistry(): DocumentAdapterRegistry {
  const registry = new DocumentAdapterRegistry();
  
  // 텍스트 파일 어댑터 (최우선)
  registry.register({ adapter: new TxtAdapter(), priority: 100 });
  
  // DOCX 어댑터
  registry.register({ adapter: new DocxAdapter(), priority: 80 });
  
  // Markdown 어댑터
  registry.register({ adapter: new MeAdapter(), priority: 75 });
  
  // HWP 어댑터 (API 필요: http://localhost:5000)
  registry.register({ adapter: new HwpAdapter(), priority: 60 });
  
  return registry;
}

