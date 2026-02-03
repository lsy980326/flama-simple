/**
 * 스케치업 모듈 초기화
 * 
 * 이 모듈을 사용하지 않으려면:
 * 1. index.ts에서 이 파일 import 제거
 * 2. 또는 환경 변수 SKETCHUP_ENABLED=false로 설정
 */

import express, { Express } from 'express';
import multer from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync } from 'fs';
import { uploadSketchupFile, getConversionStatus } from './upload.js';

// Worker는 지연 초기화됨 (initializeSketchupModule 호출 시)
let workerInitialized = false;

function initializeWorker() {
  if (workerInitialized) return;
  
  // Worker는 동적 import로 지연 로드
  import('./conversion/assimp-worker.js').then((module) => {
    // initializeAssimpWorker 함수 호출
    if (module.initializeAssimpWorker) {
      module.initializeAssimpWorker();
    }
    workerInitialized = true;
  }).catch((error) => {
    console.error('❌ Assimp Worker 초기화 실패:', error);
  });
}

export interface SketchupModuleConfig {
  enabled?: boolean;
  outputDir?: string;
  maxFileSize?: number;
}

/**
 * 스케치업 모듈을 Express 앱에 등록
 * 
 * @param app Express 앱 인스턴스
 * @param config 모듈 설정
 * @returns 등록된 라우터 (제거 시 사용)
 */
export function initializeSketchupModule(
  app: Express,
  config: SketchupModuleConfig = {}
): { router: express.Router; cleanup: () => void } | null {
  // 환경 변수로 비활성화 가능
  const enabled = config.enabled ?? process.env.SKETCHUP_ENABLED !== 'false';
  
  if (!enabled) {
    console.log('📦 스케치업 모듈이 비활성화되어 있습니다.');
    return null;
  }

  console.log('📦 스케치업 모듈 초기화 중...');
  
  // Worker 초기화 (모듈이 활성화된 경우에만)
  initializeWorker();

  // 라우터 생성
  const router = express.Router();

  // 파일 업로드 라우트
  const upload = multer({
    dest: join(tmpdir(), 'sketchup-uploads'),
    limits: { fileSize: config.maxFileSize || 100 * 1024 * 1024 }, // 100MB
  });

  // @ts-ignore - Express 타입 버전 충돌
  router.post('/upload', upload.single('file'), uploadSketchupFile);
  // @ts-ignore - Express 타입 버전 충돌
  router.get('/conversion/:conversionId', getConversionStatus);

  // 정적 파일 제공 (변환된 GLB 파일)
  const outputDir = config.outputDir || process.env.SKETCHUP_OUTPUT_DIR || './uploads/converted';
  router.use('/models', express.static(outputDir));

  /**
   * 원격 변환 워커가 변환 결과(GLB)를 메인 서버로 업로드하는 내부 엔드포인트
   *
   * - PUT /api/sketchup/internal/models/:fileId
   * - Body: application/octet-stream (GLB bytes)
   * - Header: x-sketchup-internal-key: <SKETCHUP_INTERNAL_KEY>
   */
  router.put(
    '/internal/models/:fileId',
    express.raw({ type: '*/*', limit: '200mb' }),
    (req, res) => {
      const key = req.header('x-sketchup-internal-key');
      const expected = process.env.SKETCHUP_INTERNAL_KEY;
      if (!expected || key !== expected) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const { fileId } = req.params;
      if (!fileId) {
        res.status(400).json({ error: 'fileId가 필요합니다.' });
        return;
      }

      const buf = req.body as Buffer;
      if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
        res.status(400).json({ error: 'GLB 바이너리가 비어있습니다.' });
        return;
      }

      try {
        // outputDir 보장
        // (sync로 처리해도 충분히 빠르고 단순)
        mkdirSync(outputDir, { recursive: true });
        // 파일별 폴더로 저장 (GLB 내부의 image.uri 상대 경로 텍스처 로딩을 위해)
        const fileDir = join(outputDir, fileId);
        mkdirSync(fileDir, { recursive: true });
        const fullPath = join(fileDir, 'model.glb');
        writeFileSync(fullPath, buf);
        res.json({ ok: true, glbUrl: `/api/sketchup/models/${fileId}/model.glb` });
      } catch (e) {
        res.status(500).json({ error: '저장 실패', message: e instanceof Error ? e.message : String(e) });
      }
    }
  );

  // 앱에 라우터 등록
  app.use('/api/sketchup', router);

  // 정리 함수 (필요 시 모듈 제거용)
  const cleanup = () => {
    // 라우터 제거는 Express에서 직접 지원하지 않으므로
    // 앱 재시작이 필요할 수 있음
    console.log('📦 스케치업 모듈 정리 완료');
  };

  console.log('✅ 스케치업 모듈 초기화 완료');
  return { router, cleanup };
}

/**
 * 스케치업 모듈이 활성화되어 있는지 확인
 */
export function isSketchupModuleEnabled(): boolean {
  return process.env.SKETCHUP_ENABLED !== 'false';
}
