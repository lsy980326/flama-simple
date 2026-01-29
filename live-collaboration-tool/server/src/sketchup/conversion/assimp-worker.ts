import { Job } from 'bull';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { promises as fs } from 'fs';
import { getConversionQueue, ConversionJobData } from './queue';
import { extname } from 'path';
import { tmpdir } from 'os';
import { convertSkpToDaeWithSketchupRuby } from './sketchup-ruby';

const execAsync = promisify(exec);

const ASSIMP_PATH = process.env.ASSIMP_PATH || 'assimp';
const OUTPUT_DIR = process.env.SKETCHUP_OUTPUT_DIR || './uploads/converted';
const STORE_URL = process.env.SKETCHUP_STORE_URL; // 예: http://main-server:5002
const INTERNAL_KEY = process.env.SKETCHUP_INTERNAL_KEY;

// Worker는 Queue의 process 메서드로 생성 (지연 초기화)
// 실제로 사용될 때만 Queue 생성
let workerInitialized = false;

export function initializeAssimpWorker() {
  if (workerInitialized) return;
  
  const conversionQueue = getConversionQueue();
  // Bull은 "job name" 별로 process handler가 필요합니다.
  // upload.ts에서 add('convert-skp-to-glb', ...)로 넣기 때문에 동일 name으로 등록해야 합니다.
  conversionQueue.process(
    'convert-skp-to-glb',
    4, // concurrency
    async (job: Job<ConversionJobData>) => {
      const { fileId, conversionId, inputPath } = job.data;

      try {
        await job.progress(10);

        // 입력 파일 존재 확인 (재시도에서 파일이 지워졌다면 여기서 바로 원인 메시지 제공)
        if (!existsSync(inputPath)) {
          throw new Error(
            `입력 파일을 찾을 수 없습니다: ${inputPath} (재시도 중 임시파일이 삭제되었을 수 있습니다)`
          );
        }

        // 출력 파일 경로
        const outputFilename = `${fileId}.glb`;
        const outputPath = join(OUTPUT_DIR, outputFilename);

        // 출력 디렉토리 생성
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        // 변환 전략:
        // - .skp: SketchUp(Ruby)로 .dae export → Assimp로 .dae → .glb
        // - 그 외: Assimp로 직접 변환(지원 포맷에 한함)
        await job.progress(30);

        const originalExt = extname(job.data.originalFilename || inputPath).toLowerCase();
        let sourcePath = inputPath;
        let intermediateDaePath: string | null = null;

        if (originalExt === '.skp') {
          // .skp → .dae
          intermediateDaePath = join(tmpdir(), `lct-${fileId}.dae`);
          await job.progress(40);
          await convertSkpToDaeWithSketchupRuby({
            inputSkpPath: inputPath,
            outputDaePath: intermediateDaePath,
          });
          sourcePath = intermediateDaePath;
        }

        // Assimp로 source → glb
        const command = `${ASSIMP_PATH} export "${sourcePath}" "${outputPath}" glb`;

        await execAsync(command, {
          maxBuffer: 50 * 1024 * 1024, // 50MB
        });

        await job.progress(70);

        // Draco 압축 (gltf-pipeline 사용)
        try {
          const mod = await import('gltf-pipeline');
          const gltfPipeline: any = (mod as any).default ?? mod;

          const glbBuffer = await fs.readFile(outputPath);
          const options = {
            dracoOptions: {
              compressionLevel: 7,
              quantizePositionBits: 14,
              quantizeNormalBits: 10,
              quantizeTexcoordBits: 12,
            },
          };

          // GLB 바이너리를 Draco 압축한 후 다시 GLB로 저장
          const processed = await gltfPipeline.processGlb(glbBuffer, options);
          if (processed?.glb) {
            await fs.writeFile(outputPath, processed.glb);
          }
        } catch (dracoError) {
          console.warn('Draco 압축 실패, 원본 GLB 사용:', dracoError);
          // Draco 압축 실패해도 계속 진행
        }

        await job.progress(100);

        // 원격 저장 모드: 변환 결과를 메인 서버로 업로드 후 로컬 파일은 제거
        if (STORE_URL) {
          if (!INTERNAL_KEY) {
            throw new Error(
              'SKETCHUP_STORE_URL이 설정되어 있지만 SKETCHUP_INTERNAL_KEY가 없습니다. (내부 업로드 인증키 필요)'
            );
          }

          const base = STORE_URL.replace(/\/+$/, '');
          const putUrl = `${base}/api/sketchup/internal/models/${fileId}`;
          const glbBuf = await fs.readFile(outputPath);

          const resp = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'content-type': 'application/octet-stream',
              'x-sketchup-internal-key': INTERNAL_KEY,
            },
            body: glbBuf as any,
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`원격 GLB 저장 실패: ${resp.status} ${resp.statusText} ${text}`);
          }

          const json = (await resp.json().catch(() => ({}))) as any;
          const glbUrl = typeof json.glbUrl === 'string' ? json.glbUrl : `/api/sketchup/models/${outputFilename}`;

          // 임시 파일 삭제
          if (existsSync(inputPath)) unlinkSync(inputPath);
          if (intermediateDaePath && existsSync(intermediateDaePath)) {
            try {
              unlinkSync(intermediateDaePath);
            } catch {
              // ignore
            }
          }
          try {
            if (existsSync(outputPath)) unlinkSync(outputPath);
          } catch {
            // ignore
          }

          return {
            fileId,
            conversionId,
            glbUrl,
            outputPath,
          };
        }

        // 임시 파일 삭제
        if (existsSync(inputPath)) unlinkSync(inputPath);
        if (intermediateDaePath && existsSync(intermediateDaePath)) {
          try {
            unlinkSync(intermediateDaePath);
          } catch {
            // ignore
          }
        }

        const glbUrl = `/api/sketchup/models/${outputFilename}`;

        return {
          fileId,
          conversionId,
          glbUrl,
          outputPath,
        };
      } catch (error) {
        // 중요: Bull 재시도(attempts)가 남아있는 경우 inputPath를 지우면
        // 다음 시도에서 "Unable to open file"로 2차 실패가 발생합니다.
        // 마지막 시도에서만 정리합니다.
        const maxAttempts =
          typeof job.opts.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
        const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
        if (isLastAttempt && existsSync(inputPath)) {
          try {
            unlinkSync(inputPath);
          } catch (e) {
            // 무시
          }
        }
        throw error;
      }
    }
  );

  // 개발 편의: 이미 GLB인 파일은 변환 없이 저장만 하고 URL을 반환
  conversionQueue.process(
    'store-glb',
    4,
    async (job: Job<ConversionJobData>) => {
      const { fileId, conversionId, inputPath } = job.data;

      if (!existsSync(inputPath)) {
        throw new Error(`입력 파일을 찾을 수 없습니다: ${inputPath}`);
      }

      await job.progress(20);

      const outputFilename = `${fileId}.glb`;
      const outputPath = join(OUTPUT_DIR, outputFilename);
      await fs.mkdir(OUTPUT_DIR, { recursive: true });

      // temp -> output 복사
      const buf = await fs.readFile(inputPath);
      await fs.writeFile(outputPath, buf);

      await job.progress(100);

      // 원격 저장 모드
      if (STORE_URL) {
        if (!INTERNAL_KEY) {
          throw new Error(
            'SKETCHUP_STORE_URL이 설정되어 있지만 SKETCHUP_INTERNAL_KEY가 없습니다. (내부 업로드 인증키 필요)'
          );
        }
        const base = STORE_URL.replace(/\/+$/, '');
        const putUrl = `${base}/api/sketchup/internal/models/${fileId}`;
        const resp = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            'content-type': 'application/octet-stream',
            'x-sketchup-internal-key': INTERNAL_KEY,
          },
          body: buf as any,
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`원격 GLB 저장 실패: ${resp.status} ${resp.statusText} ${text}`);
        }
        const json = (await resp.json().catch(() => ({}))) as any;
        const glbUrl = typeof json.glbUrl === 'string' ? json.glbUrl : `/api/sketchup/models/${outputFilename}`;

        // 로컬 파일 정리
        try {
          if (existsSync(outputPath)) unlinkSync(outputPath);
        } catch {
          // ignore
        }
        try {
          if (existsSync(inputPath)) unlinkSync(inputPath);
        } catch {
          // ignore
        }

        return { fileId, conversionId, glbUrl, outputPath };
      }

      // 임시 파일 삭제
      try {
        if (existsSync(inputPath)) unlinkSync(inputPath);
      } catch {
        // ignore
      }

      const glbUrl = `/api/sketchup/models/${outputFilename}`;
      return { fileId, conversionId, glbUrl, outputPath };
    }
  );
  
  workerInitialized = true;
  console.log('✅ Assimp Worker 초기화 완료');
}

// Worker 인스턴스 export (호환성을 위해)
export const assimpConversionWorker = new Proxy({} as any, {
  get(target, prop) {
    const queue = getConversionQueue();
    return (queue as any)[prop];
  }
});
