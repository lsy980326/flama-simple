# 스케치업 뷰어 및 피드백 모듈 통합 설계안

## 📋 목차
1. [개요](#개요)
2. [아키텍처 설계](#아키텍처-설계)
3. [디렉토리 구조](#디렉토리-구조)
4. [타입 정의](#타입-정의)
5. [핵심 모듈 설계](#핵심-모듈-설계)
6. [통합 전략](#통합-전략)
7. [성능 최적화](#성능-최적화)
8. [마이그레이션 계획](#마이그레이션-계획)

---

## 개요

### 목표
- 스케치업 3D 모델 뷰어 기능 추가
- 서버 측 .skp → .glb 변환 파이프라인 구축
- 3D 공간 기반 피드백 시스템 구축
- 기존 협업 인프라 재사용
- 모듈화된 구조로 확장성 확보

### 범위
- **서버 측**: .skp 파일 업로드 및 Assimp를 통한 .glb 변환
- **클라이언트 측**: 변환된 .glb 모델 로딩 및 렌더링 (react-three-fiber)
- 3D 공간 좌표 기반 피드백 (핀포인트)
- 실시간 협업 동기화
- 카메라 상태 저장 및 복원 기능

---

## 아키텍처 설계

### 전체 플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                         전체 플로우 (Overall Flow)                    │
└─────────────────────────────────────────────────────────────────────┘

Step 1: 파일 업로드 및 변환 (Upload & Convert)
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Client   │      │ Server   │      │ Queue    │      │ Worker   │
│          │      │          │      │          │      │          │
│ .skp     │─────▶│ 임시저장 │─────▶│ 작업등록 │─────▶│ Assimp   │
│ 업로드   │      │ uploads/ │      │ (Bull)   │      │ Worker   │
│          │      │ temp/    │      │          │      │          │
└──────────┘      └──────────┘      └──────────┘      └─────┬─────┘
                                                              │
                                                              │ .skp → .glb 변환
                                                              │ → 최적화
                                                              │ (Draco 압축)
                                                              │ → .glb 저장
                                                              ▼
                                                         ┌──────────┐
                                                         │ Server   │
                                                         │          │
                                                         │ DB 저장  │
                                                         │ 완료알림 │
                                                         └─────┬─────┘
                                                               │
                                                               ▼
Step 2: 뷰어 렌더링 (Rendering)
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Client   │      │ Three.js  │      │ Canvas   │
│          │      │           │      │          │
│ .glb URL │─────▶│ useGLTF   │─────▶│ 렌더링   │
│ 받기     │      │ 로드      │      │ OrbitCtrl│
└──────────┘      └──────────┘      └──────────┘

Step 3: 피드백 상호작용 (Feedback Interaction)
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ 사용자   │      │ Raycaster │      │ Input    │      │ Server   │
│ 클릭     │─────▶│ 3D 좌표   │─────▶│ 폼 표시  │─────▶│ DB 저장  │
│          │      │ 계산      │      │ 입력     │      │          │
└──────────┘      └──────────┘      └──────────┘      └──────────┘
                  (x,y,z + Normal)   (텍스트 + 카메라 상태)

Step 4: 피드백 시각화 (Visualization)
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Server   │      │ Client    │      │ Canvas   │
│          │      │           │      │          │
│ 피드백   │─────▶│ 조회      │─────▶│ 마커     │
│ 리스트   │      │           │      │ 렌더링   │
└──────────┘      └──────────┘      └─────┬─────┘
                                            │
                                            │ 마커 클릭 시
                                            │ 카메라 상태 복원
                                            ▼
                                    ┌──────────┐
                                    │ 뷰 이동   │
                                    └──────────┘
```

### 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Layer (React)                         │
│  ┌──────────────────┐  ┌──────────────────────────────┐        │
│  │ SketchupViewer  │  │  SketchupViewerWithFeedback  │        │
│  │   Component     │  │      Component              │        │
│  │ (react-three-   │  │  (react-three-fiber +        │        │
│  │  fiber)         │  │   useGLTF)                  │        │
│  └────────┬─────────┘  └──────────────┬───────────────┘        │
└───────────┼────────────────────────────┼──────────────────────┘
            │                            │
┌───────────┼────────────────────────────┼────────────────────────┐
│           │                            │                        │
│  ┌────────▼─────────┐    ┌────────────▼──────────────┐       │
│  │ SketchupManager  │    │ SketchupFeedbackManager      │       │
│  │  (Three.js       │    │  (3D 피드백 관리)           │       │
│  │   래퍼)          │    │  - Raycasting               │       │
│  └────────┬─────────┘    │  - 카메라 상태 저장/복원    │       │
│           │               └────────────┬───────────────┘       │
│           │                            │                       │
│  ┌────────▼────────────────────────────▼───────────────┐       │
│  │         CollaborationManager (재사용)                │       │
│  │         YjsDrawingManager (재사용)                  │       │
│  │         PinpointManager (확장)                       │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Server Layer (Node.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File Upload  │  │ Queue        │  │ Worker       │        │
│  │ API         │──▶│ (Bull/Redis) │──▶│ (Assimp      │        │
│  │             │   │              │   │  Converter)  │        │
│  └─────────────┘   └──────────────┘   └──────┬───────┘        │
│                                                 │                │
│                                                 │ .skp → .glb    │
│                                                 ▼                │
│                                         ┌──────────────┐        │
│                                         │ Storage      │        │
│                                         │ (S3/로컬)    │        │
│                                         └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 모듈 의존성

```
sketchup/
├── SketchupManager (Three.js 래퍼)
│   └── depends on: collaboration/CollaborationManager
│
├── SketchupFeedbackManager
│   ├── depends on: SketchupManager
│   ├── depends on: collaboration/PinpointManager (확장)
│   └── depends on: collaboration/YjsDrawingManager
│
└── components/
    ├── SketchupViewer
    │   └── depends on: SketchupManager
    │
    └── SketchupViewerWithFeedback
        ├── depends on: SketchupViewer
        └── depends on: SketchupFeedbackManager
```

---

## 디렉토리 구조

### 제안 구조

```
live-collaboration-tool/
├── client/
│   └── src/
│       └── lib/
│           ├── sketchup/                    # 🆕 스케치업 모듈
│           │   ├── SketchupManager.ts        # Three.js 뷰어 관리
│           │   ├── SketchupFeedbackManager.ts # 3D 피드백 관리
│           │   ├── SketchupCameraController.ts # 카메라 제어
│           │   ├── SketchupUploader.ts        # 파일 업로드 및 변환 상태 관리
│           │   └── types.ts                  # 스케치업 관련 타입
│           │
│           ├── components/
│           │   ├── SketchupViewer.tsx        # 🆕 기본 3D 뷰어 (react-three-fiber)
│           │   └── SketchupViewerWithFeedback.tsx # 🆕 피드백 포함 뷰어
│           │
│           ├── collaboration/
│           │   └── PinpointManager.ts        # ✏️ 3D 좌표 지원 확장
│           │
│           └── types.ts                      # ✏️ 3D 관련 타입 추가
│
└── server/
    └── src/
        ├── sketchup/                         # 🆕 스케치업 서버 모듈
        │   ├── upload.ts                     # 파일 업로드 API
        │   ├── conversion/                   # 변환 관련
        │   │   ├── queue.ts                  # 변환 큐 설정 (Bull)
        │   │   ├── assimp-worker.ts          # Assimp 변환 Worker
        │   │   ├── sketchup-sdk-worker.ts    # SketchUp SDK Worker (선택)
        │   │   └── hybrid-worker.ts          # 하이브리드 Worker (선택)
        │   └── storage.ts                    # 변환된 파일 저장
        │
        └── index.ts                          # ✏️ 스케치업 API 추가
```

---

## 타입 정의

### 핵심 타입

```typescript
// lib/sketchup/types.ts

/**
 * 3D 공간 좌표
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 3D 카메라 상태
 */
export interface CameraState {
  position: Vector3D;
  target: Vector3D;
  up: Vector3D;
  fov?: number;
  near?: number;
  far?: number;
}

/**
 * 스케치업 피드백 (3D 핀포인트)
 */
export interface SketchupPinpoint {
  id: string;
  position: Vector3D;        // 3D 공간 좌표
  normal?: Vector3D;         // 표면 법선 벡터
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
  viewState?: CameraState;   // 피드백 생성 시 카메라 상태 (선택)
}

/**
 * 스케치업 모델 정보
 */
export interface SketchupModel {
  id: string;
  name: string;
  url: string;              // 변환된 .glb 파일 URL
  originalFormat: 'skp' | 'obj' | 'gltf' | 'glb';
  convertedFormat: 'glb';   // 항상 .glb로 변환됨
  conversionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  conversionId?: string;    // 변환 작업 ID
  metadata?: {
    version?: string;
    units?: 'meters' | 'feet' | 'inches';
    boundingBox?: {
      min: Vector3D;
      max: Vector3D;
    };
  };
}

/**
 * 파일 업로드 응답
 */
export interface SketchupUploadResponse {
  fileId: string;
  conversionId: string;
  status: 'pending' | 'processing';
  message: string;
}

/**
 * 변환 상태 조회 응답
 */
export interface ConversionStatusResponse {
  conversionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;        // 0-100
  glbUrl?: string;          // 변환 완료 시 URL
  error?: string;           // 실패 시 에러 메시지
}

/**
 * 스케치업 뷰어 설정
 */
export interface SketchupViewerConfig {
  container: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: string;
  enableControls?: boolean;
  enableGrid?: boolean;
  enableAxes?: boolean;
  camera?: Partial<CameraState>;
}

/**
 * 스케치업 피드백 설정
 */
export interface SketchupFeedbackConfig {
  collaborationManager: CollaborationManager;
  yjsDocument?: Y.Doc;
  enableRealtime?: boolean;
  onFeedbackAdd?: (pinpoint: SketchupPinpoint) => void;
  onFeedbackUpdate?: (pinpoint: SketchupPinpoint) => void;
  onFeedbackRemove?: (id: string) => void;
}
```

### 기존 타입 확장

```typescript
// lib/types.ts (기존 파일에 추가)

/**
 * 2D/3D 통합 핀포인트 타입
 */
export type Pinpoint = 
  | Pinpoint2D  // 기존 2D 핀포인트
  | Pinpoint3D;  // 새로운 3D 핀포인트

export interface Pinpoint2D {
  id: string;
  type: '2d';
  x: number;
  y: number;
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
}

export interface Pinpoint3D {
  id: string;
  type: '3d';
  position: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
  viewState?: CameraState;
}
```

---

## 핵심 모듈 설계

### 서버 측 모듈

#### 1. 파일 업로드 API

```typescript
// server/src/sketchup/upload.ts

import express, { Request, Response } from 'express';
import multer from 'multer';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { conversionQueue } from './conversion/queue';

const upload = multer({
  dest: join(tmpdir(), 'sketchup-uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export const uploadSketchupFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '파일이 제공되지 않았습니다.' });
      return;
    }

    const fileId = uuidv4();
    const conversionId = uuidv4();
    
    // 파일을 임시 저장소에 저장
    const tempPath = req.file.path;
    
    // 변환 큐에 작업 추가
    const job = await conversionQueue.add('convert-skp-to-glb', {
      fileId,
      conversionId,
      inputPath: tempPath,
      originalFilename: req.file.originalname,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    res.json({
      fileId,
      conversionId,
      status: 'pending',
      message: '파일 업로드 완료. 변환 작업이 큐에 등록되었습니다.',
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    res.status(500).json({
      error: '파일 업로드 실패',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

// 변환 상태 조회 API
export const getConversionStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { conversionId } = req.params;
    const job = await conversionQueue.getJob(conversionId);

    if (!job) {
      res.status(404).json({ error: '변환 작업을 찾을 수 없습니다.' });
      return;
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    if (state === 'completed') {
      const result = await job.returnvalue;
      res.json({
        conversionId,
        status: 'completed',
        progress: 100,
        glbUrl: result.glbUrl,
      });
    } else if (state === 'failed') {
      res.json({
        conversionId,
        status: 'failed',
        error: job.failedReason || '변환 실패',
      });
    } else {
      res.json({
        conversionId,
        status: state === 'active' ? 'processing' : 'pending',
        progress,
      });
    }
  } catch (error) {
    console.error('상태 조회 오류:', error);
    res.status(500).json({
      error: '상태 조회 실패',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
```

#### 2. 변환 큐 및 Worker

```typescript
// server/src/sketchup/conversion/queue.ts

import Queue from 'bull';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const conversionQueue = new Queue('sketchup-conversion', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// 큐 이벤트 리스너
conversionQueue.on('completed', (job) => {
  console.log(`변환 완료: ${job.id}`);
});

conversionQueue.on('failed', (job, err) => {
  console.error(`변환 실패: ${job?.id}`, err);
});

conversionQueue.on('progress', (job, progress) => {
  console.log(`변환 진행: ${job.id} - ${progress}%`);
});
```

#### 3. 변환 엔진 선택: Assimp vs SketchUp C SDK

**권장: Assimp (경량, 빠름, 무료)**

##### 옵션 A: Assimp 사용 (권장)

```typescript
// server/src/sketchup/conversion/assimp-worker.ts

import { Worker, Job } from 'bull';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { conversionQueue } from './queue';

const execAsync = promisify(exec);

interface ConversionJobData {
  fileId: string;
  conversionId: string;
  inputPath: string;
  originalFilename: string;
}

const ASSIMP_PATH = process.env.ASSIMP_PATH || 'assimp';
const OUTPUT_DIR = process.env.SKETCHUP_OUTPUT_DIR || './uploads/converted';

export const assimpConversionWorker = new Worker(
  'sketchup-conversion',
  async (job: Job<ConversionJobData>) => {
    const { fileId, conversionId, inputPath, originalFilename } = job.data;

    try {
      await job.progress(10);

      // 출력 파일 경로
      const outputFilename = `${fileId}.glb`;
      const outputPath = join(OUTPUT_DIR, outputFilename);

      // Assimp 변환 명령
      // 주의: Assimp는 .skp를 직접 지원하지 않을 수 있으므로
      // 중간 포맷(.dae, .fbx)을 거쳐야 할 수 있음
      await job.progress(30);

      // 방법 1: 직접 변환 시도 (Assimp 버전에 따라 지원 여부 다름)
      let command = `${ASSIMP_PATH} export "${inputPath}" "${outputPath}" glb`;
      
      // 방법 2: 중간 포맷 거치기 (더 안정적)
      // const intermediatePath = join(OUTPUT_DIR, `${fileId}.dae`);
      // await execAsync(`${ASSIMP_PATH} export "${inputPath}" "${intermediatePath}" dae`);
      // command = `${ASSIMP_PATH} export "${intermediatePath}" "${outputPath}" glb`;

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });

      await job.progress(70);

      // Draco 압축 (gltf-pipeline 사용)
      const gltfPipeline = require('gltf-pipeline');
      const fs = require('fs').promises;
      
      const glbBuffer = await fs.readFile(outputPath);
      const options = {
        dracoOptions: {
          compressionLevel: 7,
          quantizePositionBits: 14,
          quantizeNormalBits: 10,
          quantizeTexcoordBits: 12,
        },
      };

      const processed = await gltfPipeline.processGltf(glbBuffer, options);
      await fs.writeFile(outputPath, processed.gltf);

      await job.progress(100);

      // 임시 파일 삭제
      if (existsSync(inputPath)) {
        unlinkSync(inputPath);
      }

      const glbUrl = `/api/sketchup/models/${outputFilename}`;

      return {
        fileId,
        conversionId,
        glbUrl,
        outputPath,
      };
    } catch (error) {
      if (existsSync(inputPath)) {
        try {
          unlinkSync(inputPath);
        } catch (e) {
          // 무시
        }
      }
      throw error;
    }
  },
  {
    concurrency: 4, // Assimp는 가볍기 때문에 동시 처리 가능
  }
);
```

**Assimp 장점:**
- ✅ 경량: 대형 3D 소프트웨어 대비 메모리 사용량 1/10 이하
- ✅ 빠른 처리: 변환 속도 3-5배 빠름
- ✅ 무료 오픈소스
- ✅ 서버 배포 용이 (별도 GUI 불필요)
- ✅ 다양한 포맷 지원 (40+ 포맷)

**Assimp 단점:**
- ⚠️ .skp 직접 지원 제한적 (중간 포맷 필요할 수 있음)
- ⚠️ 복잡한 SketchUp 기능 손실 가능

##### 옵션 B: SketchUp C SDK 사용 (고정확도 필요 시)

```typescript
// server/src/sketchup/conversion/sketchup-sdk-worker.ts

import { Worker, Job } from 'bull';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const execAsync = promisify(exec);

// C++ 바인딩 또는 CLI 도구 사용
const SKETCHUP_SDK_CLI = process.env.SKETCHUP_SDK_CLI || './sketchup-converter';

export const sketchupSdkWorker = new Worker(
  'sketchup-conversion',
  async (job: Job<ConversionJobData>) => {
    const { fileId, conversionId, inputPath, originalFilename } = job.data;

    try {
      await job.progress(10);

      const outputFilename = `${fileId}.glb`;
      const outputPath = join(OUTPUT_DIR, outputFilename);

      // SketchUp C SDK CLI 호출
      // (C++ 바인딩 또는 별도 CLI 도구 필요)
      const command = `${SKETCHUP_SDK_CLI} "${inputPath}" "${outputPath}" --format glb --optimize`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 100 * 1024 * 1024, // 100MB
      });

      await job.progress(100);

      if (existsSync(inputPath)) {
        unlinkSync(inputPath);
      }

      const glbUrl = `/api/sketchup/models/${outputFilename}`;

      return {
        fileId,
        conversionId,
        glbUrl,
        outputPath,
      };
    } catch (error) {
      if (existsSync(inputPath)) {
        try {
          unlinkSync(inputPath);
        } catch (e) {
          // 무시
        }
      }
      throw error;
    }
  },
  {
    concurrency: 2, // SDK는 무거울 수 있음
  }
);
```

**SketchUp C SDK 장점:**
- ✅ 최고 정확도: 네이티브 포맷 완벽 지원
- ✅ 모든 메타데이터 보존 (레이어, 컴포넌트, 머티리얼)
- ✅ 정확한 기하학 유지

**SketchUp C SDK 단점:**
- ❌ 라이선스 비용 (상업적 사용 시)
- ❌ C++ 컴파일 필요 (배포 복잡)
- ❌ Node.js 바인딩 구현 필요
- ❌ 서버 의존성 증가

##### 옵션 C: 하이브리드 접근 (권장)

```typescript
// server/src/sketchup/conversion/hybrid-worker.ts

import { Worker, Job } from 'bull';
import { assimpConversionWorker } from './assimp-worker';
import { sketchupSdkWorker } from './sketchup-sdk-worker';

export const hybridConversionWorker = new Worker(
  'sketchup-conversion',
  async (job: Job<ConversionJobData>) => {
    const { fileId, conversionId, inputPath, originalFilename } = job.data;

    try {
      // 1차: Assimp로 빠른 변환 시도
      try {
        const result = await assimpConversionWorker.process(job);
        
        // 변환 품질 검증 (파일 크기, 메시 수 등)
        const qualityScore = await validateConversionQuality(result.outputPath);
        
        if (qualityScore > 0.8) {
          // 품질이 좋으면 Assimp 결과 사용
          return result;
        }
      } catch (assimpError) {
        console.warn('Assimp 변환 실패, SDK로 재시도:', assimpError);
      }

      // 2차: 품질이 낮거나 실패 시 SketchUp SDK 사용
      return await sketchupSdkWorker.process(job);
      
    } catch (error) {
      throw error;
    }
  }
);

async function validateConversionQuality(glbPath: string): Promise<number> {
  // GLB 파일 분석하여 품질 점수 계산
  // - 메시 수
  // - 텍스처 유무
  // - 파일 크기
  // 등등...
  return 0.9; // 예시
}
```

**최종 권장사항:**

1. **초기 단계: Assimp만 사용**
   - 빠른 프로토타이핑
   - 서버 부하 최소화
   - 대부분의 모델 처리 가능

2. **품질 이슈 발생 시: 하이브리드 전환**
   - Assimp 실패/품질 낮음 → SketchUp SDK 재시도
   - 사용자 선택 옵션 제공

3. **대규모 배포 시: SketchUp SDK 전용**
   - 정확도가 중요한 경우
   - 라이선스 비용 감수 가능한 경우

### 클라이언트 측 모듈

#### 1. SketchupUploader (파일 업로드 및 변환 상태 관리)

```typescript
// client/src/lib/sketchup/SketchupUploader.ts

import { SketchupUploadResponse, ConversionStatusResponse } from './types';

export class SketchupUploader {
  private serverUrl: string;
  private pollingInterval: number = 2000; // 2초

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * .skp 파일 업로드
   */
  async uploadFile(file: File): Promise<SketchupUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.serverUrl}/api/sketchup/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`업로드 실패: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 변환 상태 조회
   */
  async getConversionStatus(conversionId: string): Promise<ConversionStatusResponse> {
    const response = await fetch(
      `${this.serverUrl}/api/sketchup/conversion/${conversionId}`
    );

    if (!response.ok) {
      throw new Error(`상태 조회 실패: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 변환 완료까지 폴링
   */
  async waitForConversion(
    conversionId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getConversionStatus(conversionId);

          if (status.status === 'completed' && status.glbUrl) {
            resolve(status.glbUrl);
            return;
          }

          if (status.status === 'failed') {
            reject(new Error(status.error || '변환 실패'));
            return;
          }

          // 진행률 콜백
          if (onProgress && status.progress !== undefined) {
            onProgress(status.progress);
          }

          // 다음 폴링
          setTimeout(poll, this.pollingInterval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}
```

#### 2. SketchupViewer (react-three-fiber 기반)

**책임**: react-three-fiber를 사용한 3D 뷰어 렌더링

```typescript
// lib/components/SketchupViewer.tsx

import React, { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Html } from '@react-three/drei';
import { Vector3D, CameraState } from '../sketchup/types';
import * as THREE from 'three';

interface SketchupViewerProps {
  glbUrl: string;
  onCameraChange?: (state: CameraState) => void;
  onModelClick?: (position: Vector3D, normal?: Vector3D) => void;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

// GLB 모델 로드 컴포넌트
function Model({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const { scene } = useGLTF(url);
  
  React.useEffect(() => {
    if (onLoad) onLoad();
  }, [onLoad]);

  return <primitive object={scene} />;
}

// Raycasting을 통한 클릭 처리
function InteractiveModel({ 
  url, 
  onModelClick 
}: { 
  url: string; 
  onModelClick?: (position: Vector3D, normal?: Vector3D) => void;
}) {
  const { scene, camera } = useThree();
  const meshRef = useRef<THREE.Group>(null);

  const handleClick = (event: any) => {
    if (!onModelClick) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    // 마우스 좌표 정규화
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // 씬의 모든 메시와 교차 검사
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const position: Vector3D = {
        x: intersect.point.x,
        y: intersect.point.y,
        z: intersect.point.z,
      };
      
      const normal: Vector3D | undefined = intersect.face?.normal
        ? {
            x: intersect.face.normal.x,
            y: intersect.face.normal.y,
            z: intersect.face.normal.z,
          }
        : undefined;

      onModelClick(position, normal);
    }
  };

  return (
    <group ref={meshRef} onClick={handleClick}>
      <Model url={url} />
    </group>
  );
}

// 카메라 상태 추적
function CameraTracker({ onCameraChange }: { onCameraChange?: (state: CameraState) => void }) {
  const { camera, controls } = useThree();
  const controlsRef = controls as any;

  useFrame(() => {
    if (!onCameraChange) return;

    const state: CameraState = {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      target: {
        x: controlsRef?.target?.x || 0,
        y: controlsRef?.target?.y || 0,
        z: controlsRef?.target?.z || 0,
      },
      up: {
        x: camera.up.x,
        y: camera.up.y,
        z: camera.up.z,
      },
      fov: (camera as THREE.PerspectiveCamera).fov,
      near: camera.near,
      far: camera.far,
    };

    onCameraChange(state);
  });

  return null;
}

export const SketchupViewer: React.FC<SketchupViewerProps> = ({
  glbUrl,
  onCameraChange,
  onModelClick,
  width = 800,
  height = 600,
  backgroundColor = '#f0f0f0',
}) => {
  return (
    <div style={{ width, height, backgroundColor }}>
      <Canvas>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={75} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          
          <InteractiveModel url={glbUrl} onModelClick={onModelClick} />
          
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={100}
          />
          
          {onCameraChange && <CameraTracker onCameraChange={onCameraChange} />}
          
          <gridHelper args={[10, 10]} />
          <axesHelper args={[5]} />
        </Suspense>
      </Canvas>
    </div>
  );
};
```

#### 3. SketchupViewerWithFeedback (피드백 포함)

```typescript
// lib/components/SketchupViewerWithFeedback.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { SketchupViewer } from './SketchupViewer';
import { SketchupUploader } from '../sketchup/SketchupUploader';
import { SketchupFeedbackManager } from '../sketchup/SketchupFeedbackManager';
import { CollaborationManager } from '../collaboration/CollaborationManager';
import { SketchupPinpoint, Vector3D, CameraState } from '../sketchup/types';
import { Html } from '@react-three/drei';
import * as Y from 'yjs';

interface SketchupViewerWithFeedbackProps {
  serverUrl: string;
  collaborationManager: CollaborationManager;
  yjsDocument?: Y.Doc;
  user: { id: string; name: string; color: string };
  onFeedbackAdd?: (feedback: SketchupPinpoint) => void;
  onFeedbackClick?: (feedback: SketchupPinpoint) => void;
  width?: number;
  height?: number;
}

export const SketchupViewerWithFeedback: React.FC<
  SketchupViewerWithFeedbackProps
> = ({
  serverUrl,
  collaborationManager,
  yjsDocument,
  user,
  onFeedbackAdd,
  onFeedbackClick,
  width = 800,
  height = 600,
}) => {
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<SketchupPinpoint[]>([]);
  const [currentCameraState, setCurrentCameraState] = useState<CameraState | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [clickedPosition, setClickedPosition] = useState<Vector3D | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  
  const uploaderRef = useRef(new SketchupUploader(serverUrl));
  const feedbackManagerRef = useRef<SketchupFeedbackManager | null>(null);

  // 모델 클릭 핸들러
  const handleModelClick = useCallback((position: Vector3D, normal?: Vector3D) => {
    setClickedPosition(position);
    setShowFeedbackForm(true);
  }, []);

  // 피드백 추가
  const handleAddFeedback = useCallback(async () => {
    if (!clickedPosition || !feedbackComment.trim() || !glbUrl) return;

    const feedback: SketchupPinpoint = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      position: clickedPosition,
      comment: feedbackComment,
      userId: user.id,
      createdAt: new Date(),
      isResolved: false,
      viewState: currentCameraState || undefined,
    };

    // 서버에 저장
    await fetch(`${serverUrl}/api/sketchup/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });

    // 로컬 상태 업데이트
    setFeedbacks((prev) => [...prev, feedback]);
    setShowFeedbackForm(false);
    setFeedbackComment('');
    setClickedPosition(null);

    // 실시간 동기화 (Y.js)
    if (yjsDocument) {
      const yjsMap = yjsDocument.getMap('sketchupFeedbacks');
      yjsMap.set(feedback.id, {
        ...feedback,
        createdAt: feedback.createdAt.toISOString(),
      });
    }

    // CollaborationManager를 통한 브로드캐스트
    collaborationManager.sendPinpoint({
      ...feedback,
      type: '3d',
    });

    onFeedbackAdd?.(feedback);
  }, [clickedPosition, feedbackComment, user, currentCameraState, glbUrl, serverUrl, yjsDocument, collaborationManager, onFeedbackAdd]);

  // 피드백 클릭 시 카메라 상태 복원
  const handleFeedbackClick = useCallback((feedback: SketchupPinpoint) => {
    if (feedback.viewState) {
      // 카메라 상태 복원은 SketchupViewer의 onCameraChange를 통해 처리
      // 실제 구현은 SketchupViewer에 setCameraState 메서드 추가 필요
      onFeedbackClick?.(feedback);
    }
  }, [onFeedbackClick]);

  // Y.js 변경 감지
  useEffect(() => {
    if (!yjsDocument) return;

    const yjsMap = yjsDocument.getMap('sketchupFeedbacks');
    
    const updateFeedbacks = () => {
      const feedbackList: SketchupPinpoint[] = [];
      yjsMap.forEach((value, key) => {
        feedbackList.push({
          ...value,
          createdAt: new Date(value.createdAt),
        });
      });
      setFeedbacks(feedbackList);
    };

    yjsMap.observe(updateFeedbacks);
    updateFeedbacks();

    return () => {
      yjsMap.unobserve(updateFeedbacks);
    };
  }, [yjsDocument]);

  return (
    <div style={{ position: 'relative', width, height }}>
      {glbUrl ? (
        <>
          <SketchupViewer
            glbUrl={glbUrl}
            onCameraChange={setCurrentCameraState}
            onModelClick={handleModelClick}
            width={width}
            height={height}
          />
          
          {/* 피드백 마커 렌더링 */}
          {feedbacks.map((feedback) => (
            <FeedbackMarker
              key={feedback.id}
              feedback={feedback}
              onClick={() => handleFeedbackClick(feedback)}
            />
          ))}
          
          {/* 피드백 입력 폼 */}
          {showFeedbackForm && clickedPosition && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 1000,
              }}
            >
              <h3>피드백 추가</h3>
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="피드백을 입력하세요..."
                rows={4}
                style={{ width: '100%', marginBottom: '10px' }}
              />
              <div>
                <button onClick={handleAddFeedback}>저장</button>
                <button onClick={() => {
                  setShowFeedbackForm(false);
                  setFeedbackComment('');
                  setClickedPosition(null);
                }}>
                  취소
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div>모델을 업로드하세요</div>
      )}
    </div>
  );
};

// 피드백 마커 컴포넌트 (3D 공간에 Html 오버레이)
function FeedbackMarker({ 
  feedback, 
  onClick 
}: { 
  feedback: SketchupPinpoint; 
  onClick: () => void;
}) {
  return (
    <Html
      position={[feedback.position.x, feedback.position.y, feedback.position.z]}
      center
    >
      <div
        onClick={onClick}
        style={{
          background: 'red',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        💬
      </div>
    </Html>
  );
}
```

### 4. 기존 SketchupManager (레거시 지원)

**참고**: react-three-fiber를 사용하지 않는 경우를 위한 Three.js 직접 사용 방식
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private config: SketchupViewerConfig;
  private currentModel: SketchupModel | null = null;
  private modelGroup: THREE.Group;

  constructor(config: SketchupViewerConfig) {
    this.config = config;
    this.modelGroup = new THREE.Group();
    this.initializeScene();
    this.setupControls();
    this.startRenderLoop();
  }

  /**
   * 씬 초기화
   */
  private initializeScene(): void {
    // 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      this.config.backgroundColor || 0xf0f0f0
    );

    // 카메라 설정
    const width = this.config.width || 800;
    const height = this.config.height || 600;
    this.camera = new THREE.PerspectiveCamera(
      this.config.camera?.fov || 75,
      width / height,
      this.config.camera?.near || 0.1,
      this.config.camera?.far || 1000
    );

    // 카메라 초기 위치
    if (this.config.camera?.position) {
      this.camera.position.set(
        this.config.camera.position.x,
        this.config.camera.position.y,
        this.config.camera.position.z
      );
    } else {
      this.camera.position.set(5, 5, 5);
    }

    // 렌더러 설정
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.config.container.appendChild(this.renderer.domElement);

    // 그리드 및 축 추가
    if (this.config.enableGrid) {
      const gridHelper = new THREE.GridHelper(10, 10);
      this.scene.add(gridHelper);
    }

    if (this.config.enableAxes) {
      const axesHelper = new THREE.AxesHelper(5);
      this.scene.add(axesHelper);
    }

    // 모델 그룹 추가
    this.scene.add(this.modelGroup);
  }

  /**
   * 컨트롤 설정
   */
  private setupControls(): void {
    if (!this.config.enableControls) return;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 100;
  }

  /**
   * 모델 로드
   */
  async loadModel(model: SketchupModel): Promise<void> {
    // 기존 모델 제거
    this.clearModel();

    // 어댑터를 통한 모델 로드
    const adapter = this.getAdapter(model.format);
    const loadedModel = await adapter.load(model.url);

    this.modelGroup.add(loadedModel);
    this.currentModel = model;

    // 카메라 자동 조정
    this.fitCameraToModel();
  }

  /**
   * 모델 제거
   */
  clearModel(): void {
    while (this.modelGroup.children.length > 0) {
      this.modelGroup.remove(this.modelGroup.children[0]);
    }
    this.currentModel = null;
  }

  /**
   * 카메라 상태 가져오기
   */
  getCameraState(): CameraState {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      target: {
        x: this.controls?.target.x || 0,
        y: this.controls?.target.y || 0,
        z: this.controls?.target.z || 0,
      },
      up: {
        x: this.camera.up.x,
        y: this.camera.up.y,
        z: this.camera.up.z,
      },
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  /**
   * 카메라 상태 설정
   */
  setCameraState(state: CameraState): void {
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    if (this.controls) {
      this.controls.target.set(state.target.x, state.target.y, state.target.z);
      this.controls.update();
    }
    if (state.fov) this.camera.fov = state.fov;
    if (state.near) this.camera.near = state.near;
    if (state.far) this.camera.far = state.far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 화면 클릭 위치를 3D 좌표로 변환
   */
  getWorldPositionFromScreen(x: number, y: number): Vector3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersects = raycaster.intersectObjects(this.modelGroup.children, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      return { x: point.x, y: point.y, z: point.z };
    }

    return null;
  }

  /**
   * 3D 좌표를 화면 좌표로 변환
   */
  getScreenPositionFromWorld(position: Vector3D): { x: number; y: number } | null {
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    vector.project(this.camera);

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (vector.y * -0.5 + 0.5) * rect.height + rect.top;

    return { x, y };
  }

  /**
   * 렌더 루프 시작
   */
  private startRenderLoop(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /**
   * 리사이즈
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 정리
   */
  dispose(): void {
    this.clearModel();
    this.renderer.dispose();
    if (this.controls) this.controls.dispose();
  }

  private getAdapter(format: string): ModelAdapter {
    // 어댑터 팩토리 패턴
    // ...
  }
}
```

### 5. SketchupFeedbackManager (react-three-fiber 버전)

**책임**: 3D 피드백 관리 및 실시간 동기화 (react-three-fiber와 통합)

```typescript
// lib/sketchup/SketchupFeedbackManager.ts

import { CollaborationManager } from '../collaboration/CollaborationManager';
import { SketchupPinpoint, Vector3D, CameraState } from './types';
import * as Y from 'yjs';

export class SketchupFeedbackManager {
  private collaborationManager: CollaborationManager;
  private feedbacks: Map<string, SketchupPinpoint> = new Map();
  private yjsMap?: Y.Map<any>;
  private onFeedbackChange?: (feedbacks: SketchupPinpoint[]) => void;

  constructor(
    collaborationManager: CollaborationManager,
    yjsDocument?: Y.Doc
  ) {
    this.collaborationManager = collaborationManager;

    if (yjsDocument) {
      this.initializeYjs(yjsDocument);
    }

    this.setupEventListeners();
  }

  /**
   * Y.js 초기화
   */
  private initializeYjs(doc: Y.Doc): void {
    this.yjsMap = doc.getMap('sketchupFeedbacks');
    
    // 기존 피드백 로드
    this.yjsMap.forEach((value, key) => {
      const feedback = this.deserializeFeedback(value);
      this.feedbacks.set(key, feedback);
    });

    this.notifyChange();

    // 변경 감지
    this.yjsMap.observe(() => {
      this.feedbacks.clear();
      this.yjsMap!.forEach((value, key) => {
        const feedback = this.deserializeFeedback(value);
        this.feedbacks.set(key, feedback);
      });
      this.notifyChange();
    });
  }

  /**
   * 피드백 추가
   */
  addFeedback(
    position: Vector3D,
    comment: string,
    userId: string,
    viewState?: CameraState
  ): SketchupPinpoint {
    const feedback: SketchupPinpoint = {
      id: this.generateId(),
      position,
      comment,
      userId,
      createdAt: new Date(),
      isResolved: false,
      viewState,
    };

    this.feedbacks.set(feedback.id, feedback);
    this.notifyChange();

    // 실시간 동기화
    if (this.yjsMap) {
      this.yjsMap.set(feedback.id, this.serializeFeedback(feedback));
    }

    // Socket.IO를 통한 브로드캐스트
    this.collaborationManager.sendPinpoint({
      ...feedback,
      type: '3d',
    });

    return feedback;
  }

  /**
   * 피드백 목록 가져오기
   */
  getFeedbacks(): SketchupPinpoint[] {
    return Array.from(this.feedbacks.values());
  }

  /**
   * 피드백 변경 구독
   */
  subscribe(callback: (feedbacks: SketchupPinpoint[]) => void): () => void {
    this.onFeedbackChange = callback;
    return () => {
      this.onFeedbackChange = undefined;
    };
  }

  private notifyChange(): void {
    if (this.onFeedbackChange) {
      this.onFeedbackChange(this.getFeedbacks());
    }
  }

  // 직렬화/역직렬화 메서드
  private serializeFeedback(feedback: SketchupPinpoint): any {
    return {
      id: feedback.id,
      position: feedback.position,
      normal: feedback.normal,
      comment: feedback.comment,
      userId: feedback.userId,
      createdAt: feedback.createdAt.toISOString(),
      isResolved: feedback.isResolved,
      viewState: feedback.viewState,
    };
  }

  private deserializeFeedback(data: any): SketchupPinpoint {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  private generateId(): string {
    return `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private setupEventListeners(): void {
    // CollaborationManager에서 피드백 수신
    this.collaborationManager.onPinpointUpdate = (pinpoint) => {
      if (pinpoint.type === '3d') {
        const feedback: SketchupPinpoint = {
          id: pinpoint.id,
          position: pinpoint.position,
          normal: pinpoint.normal,
          comment: pinpoint.comment,
          userId: pinpoint.userId,
          createdAt: pinpoint.createdAt,
          isResolved: pinpoint.isResolved,
          viewState: pinpoint.viewState,
        };
        
        this.feedbacks.set(feedback.id, feedback);
        this.notifyChange();
      }
    };
  }
}
```

### 6. 기존 SketchupManager (레거시 지원 - Three.js 직접 사용)

**참고**: react-three-fiber를 사용하지 않는 경우를 위한 Three.js 직접 사용 방식

```typescript
// lib/sketchup/SketchupFeedbackManager.ts

import { SketchupManager } from './SketchupManager';
import { CollaborationManager } from '../collaboration/CollaborationManager';
import { YjsDrawingManager } from '../collaboration/YjsDrawingManager';
import { SketchupPinpoint, SketchupFeedbackConfig } from './types';
import * as Y from 'yjs';

export class SketchupFeedbackManager {
  private sketchupManager: SketchupManager;
  private collaborationManager: CollaborationManager;
  private yjsManager?: YjsDrawingManager;
  private feedbacks: Map<string, SketchupPinpoint> = new Map();
  private config: SketchupFeedbackConfig;
  private yjsMap?: Y.Map<any>;

  constructor(
    sketchupManager: SketchupManager,
    config: SketchupFeedbackConfig
  ) {
    this.sketchupManager = sketchupManager;
    this.collaborationManager = config.collaborationManager;
    this.config = config;

    if (config.enableRealtime && config.yjsDocument) {
      this.initializeYjs(config.yjsDocument);
    }

    this.setupEventListeners();
  }

  /**
   * Y.js 초기화
   */
  private initializeYjs(doc: Y.Doc): void {
    this.yjsMap = doc.getMap('sketchupFeedbacks');
    
    // 기존 피드백 로드
    this.yjsMap.forEach((value, key) => {
      const feedback = this.deserializeFeedback(value);
      this.feedbacks.set(key, feedback);
      this.renderFeedback(feedback);
    });

    // 변경 감지
    this.yjsMap.observe((event) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const feedback = this.deserializeFeedback(this.yjsMap!.get(key));
          this.feedbacks.set(key, feedback);
          this.renderFeedback(feedback);
        } else if (change.action === 'delete') {
          this.removeFeedback(key);
        }
      });
    });
  }

  /**
   * 피드백 추가
   */
  addFeedback(
    position: Vector3D,
    comment: string,
    userId: string
  ): SketchupPinpoint {
    const feedback: SketchupPinpoint = {
      id: this.generateId(),
      position,
      comment,
      userId,
      createdAt: new Date(),
      isResolved: false,
      viewState: this.sketchupManager.getCameraState(),
    };

    this.feedbacks.set(feedback.id, feedback);
    this.renderFeedback(feedback);

    // 실시간 동기화
    if (this.config.enableRealtime && this.yjsMap) {
      this.yjsMap.set(feedback.id, this.serializeFeedback(feedback));
    }

    // Socket.IO를 통한 브로드캐스트
    this.collaborationManager.sendPinpoint({
      ...feedback,
      type: '3d',
    });

    this.config.onFeedbackAdd?.(feedback);
    return feedback;
  }

  /**
   * 피드백 업데이트
   */
  updateFeedback(feedback: SketchupPinpoint): void {
    this.feedbacks.set(feedback.id, feedback);
    this.renderFeedback(feedback);

    if (this.config.enableRealtime && this.yjsMap) {
      this.yjsMap.set(feedback.id, this.serializeFeedback(feedback));
    }

    this.config.onFeedbackUpdate?.(feedback);
  }

  /**
   * 피드백 제거
   */
  removeFeedback(id: string): void {
    this.feedbacks.delete(id);
    this.removeFeedbackMarker(id);

    if (this.config.enableRealtime && this.yjsMap) {
      this.yjsMap.delete(id);
    }

    this.config.onFeedbackRemove?.(id);
  }

  /**
   * 피드백 렌더링 (3D 마커 추가)
   */
  private renderFeedback(feedback: SketchupPinpoint): void {
    // Three.js 마커 생성
    const marker = this.createFeedbackMarker(feedback);
    marker.userData.feedbackId = feedback.id;
    this.sketchupManager.addMarker(marker);
  }

  /**
   * 피드백 마커 생성
   */
  private createFeedbackMarker(feedback: SketchupPinpoint): THREE.Object3D {
    const geometry = new THREE.SphereGeometry(0.1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(
      feedback.position.x,
      feedback.position.y,
      feedback.position.z
    );
    return sphere;
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // CollaborationManager에서 피드백 수신
    this.collaborationManager.onPinpointUpdate = (pinpoint) => {
      if (pinpoint.type === '3d') {
        const feedback = this.convertPinpointToFeedback(pinpoint);
        this.updateFeedback(feedback);
      }
    };
  }

  // 직렬화/역직렬화 메서드
  private serializeFeedback(feedback: SketchupPinpoint): any {
    return {
      id: feedback.id,
      position: feedback.position,
      normal: feedback.normal,
      comment: feedback.comment,
      userId: feedback.userId,
      createdAt: feedback.createdAt.toISOString(),
      isResolved: feedback.isResolved,
      viewState: feedback.viewState,
    };
  }

  private deserializeFeedback(data: any): SketchupPinpoint {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  private generateId(): string {
    return `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
```

### 3. React 컴포넌트

#### SketchupViewer

```typescript
// lib/components/SketchupViewer.tsx

import React, { useEffect, useRef } from 'react';
import { SketchupManager } from '../sketchup/SketchupManager';
import { SketchupViewerConfig, SketchupModel } from '../sketchup/types';

export interface SketchupViewerProps {
  model?: SketchupModel;
  config?: Partial<SketchupViewerConfig>;
  onModelLoad?: (model: SketchupModel) => void;
  onError?: (error: Error) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const SketchupViewer: React.FC<SketchupViewerProps> = ({
  model,
  config,
  onModelLoad,
  onError,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SketchupManager | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const manager = new SketchupManager({
        container: containerRef.current,
        ...config,
      });
      managerRef.current = manager;

      return () => {
        manager.dispose();
      };
    } catch (error) {
      onError?.(error as Error);
    }
  }, []);

  useEffect(() => {
    if (managerRef.current && model) {
      managerRef.current.loadModel(model).then(() => {
        onModelLoad?.(model);
      }).catch((error) => {
        onError?.(error);
      });
    }
  }, [model]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
    />
  );
};
```

#### SketchupViewerWithFeedback

```typescript
// lib/components/SketchupViewerWithFeedback.tsx

import React, { useState, useCallback } from 'react';
import { SketchupViewer } from './SketchupViewer';
import { SketchupFeedbackManager } from '../sketchup/SketchupFeedbackManager';
import { CollaborationManager } from '../collaboration/CollaborationManager';
import { SketchupViewerProps } from './SketchupViewer';
import { SketchupFeedbackConfig, SketchupPinpoint } from '../sketchup/types';
import * as Y from 'yjs';

export interface SketchupViewerWithFeedbackProps
  extends Omit<SketchupViewerProps, 'onModelLoad'> {
  collaborationManager: CollaborationManager;
  yjsDocument?: Y.Doc;
  enableRealtime?: boolean;
  user: { id: string; name: string; color: string };
  onFeedbackAdd?: (feedback: SketchupPinpoint) => void;
  onFeedbackClick?: (feedback: SketchupPinpoint) => void;
}

export const SketchupViewerWithFeedback: React.FC<
  SketchupViewerWithFeedbackProps
> = ({
  collaborationManager,
  yjsDocument,
  enableRealtime = true,
  user,
  onFeedbackAdd,
  onFeedbackClick,
  ...viewerProps
}) => {
  const [feedbacks, setFeedbacks] = useState<SketchupPinpoint[]>([]);
  const feedbackManagerRef = useRef<SketchupFeedbackManager | null>(null);

  const handleFeedbackAdd = useCallback(
    (feedback: SketchupPinpoint) => {
      setFeedbacks((prev) => [...prev, feedback]);
      onFeedbackAdd?.(feedback);
    },
    [onFeedbackAdd]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SketchupViewer
        {...viewerProps}
        onModelLoad={(model) => {
          // 피드백 매니저 초기화
          // ...
        }}
      />
      
      {/* 피드백 목록 UI */}
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        {/* 피드백 목록 렌더링 */}
      </div>
    </div>
  );
};
```

---

## 통합 전략

### 1. 기존 인프라 재사용

#### CollaborationManager 확장
- 기존 `Pinpoint` 타입을 `Pinpoint2D | Pinpoint3D`로 확장
- Socket.IO 이벤트에 3D 피드백 지원 추가

#### YjsDrawingManager 활용
- `sketchupFeedbacks` 맵을 Y.js 문서에 추가
- 기존 동기화 메커니즘 재사용

### 2. 점진적 통합

**Phase 1: 기본 뷰어**
- Three.js 기반 뷰어 구현
- 모델 로딩 기능

**Phase 2: 피드백 시스템**
- 3D 피드백 추가
- 기존 PinpointManager 확장

**Phase 3: 실시간 협업**
- Y.js 동기화 연동
- WebRTC 카메라 상태 공유 (선택)

### 3. 의존성 관리

#### 클라이언트 의존성

```json
// client/package.json에 추가
{
  "dependencies": {
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.88.0",
    "three": "^0.160.0",
    "@types/three": "^0.160.0"
  }
}
```

#### 서버 의존성

**Assimp 사용 시:**

```json
// server/package.json에 추가
{
  "dependencies": {
    "bull": "^4.12.0",
    "ioredis": "^5.3.2",
    "uuid": "^9.0.1",
    "gltf-pipeline": "^3.1.0"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.7"
  }
}
```

**환경 변수 설정 (Assimp):**
```bash
# .env
ASSIMP_PATH=/usr/bin/assimp  # 또는 assimp 경로
REDIS_URL=redis://localhost:6379
SKETCHUP_OUTPUT_DIR=./uploads/converted
CONVERSION_ENGINE=assimp  # 또는 'sketchup-sdk' 또는 'hybrid'
```

**Assimp 설치:**
```bash
# Ubuntu/Debian
sudo apt-get install assimp-utils

# macOS
brew install assimp

# 또는 소스 빌드
# https://github.com/assimp/assimp
```

**SketchUp C SDK 사용 시:**
- SketchUp C SDK 라이선스 필요
- C++ 바인딩 또는 CLI 도구 개발 필요
- 환경 변수에 `SKETCHUP_SDK_CLI` 경로 설정

---

## 성능 최적화

### 1. 번들 크기 최적화

```typescript
// Tree-shaking을 위한 named import
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
```

### 2. Lazy Loading

```typescript
// 동적 import로 스케치업 뷰어 로드
const SketchupViewer = React.lazy(() => 
  import('@live-collaboration-tool/client').then(module => ({
    default: module.SketchupViewer
  }))
);
```

### 3. 렌더링 최적화

- Frustum culling
- LOD (Level of Detail)
- Instanced rendering (피드백 마커)

---

## 마이그레이션 계획

### 단계별 구현

**1주차: 서버 측 변환 파이프라인**
- [ ] Redis 및 Bull 큐 설정
- [ ] 파일 업로드 API 구현
- [ ] Assimp 설치 및 테스트
- [ ] Assimp 변환 Worker 구현
- [ ] Draco 압축 통합
- [ ] 변환 상태 조회 API
- [ ] (선택) SketchUp SDK Worker 구현

**2주차: 클라이언트 기본 구조**
- [ ] 디렉토리 구조 생성
- [ ] 타입 정의
- [ ] SketchupUploader 구현
- [ ] react-three-fiber 설정

**3주차: 3D 뷰어 구현**
- [ ] SketchupViewer 컴포넌트 (react-three-fiber)
- [ ] GLB 모델 로딩 (useGLTF)
- [ ] OrbitControls 통합
- [ ] 카메라 상태 관리

**4주차: 피드백 시스템**
- [ ] Raycasting 구현
- [ ] 3D 좌표 계산
- [ ] 피드백 입력 폼
- [ ] 피드백 마커 렌더링 (Html 오버레이)

**5주차: 협업 통합**
- [ ] SketchupFeedbackManager 구현
- [ ] Y.js 동기화 연동
- [ ] CollaborationManager 확장
- [ ] 카메라 상태 저장/복원
- [ ] 실시간 피드백 동기화

**6주차: 통합 및 테스트**
- [ ] 전체 플로우 테스트
- [ ] 에러 처리
- [ ] 성능 최적화
- [ ] 문서화

---

## API 사용 예시

### 파일 업로드 및 변환

```tsx
import { SketchupUploader } from '@live-collaboration-tool/client';

function App() {
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const uploader = new SketchupUploader('http://localhost:5000');

  const handleFileUpload = async (file: File) => {
    try {
      // 1. 파일 업로드
      const { conversionId } = await uploader.uploadFile(file);
      
      // 2. 변환 완료까지 대기 (폴링)
      const url = await uploader.waitForConversion(
        conversionId,
        (progress) => {
          setConversionProgress(progress);
        }
      );
      
      setGlbUrl(url);
    } catch (error) {
      console.error('업로드 실패:', error);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".skp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />
      {conversionProgress > 0 && conversionProgress < 100 && (
        <div>변환 중... {conversionProgress}%</div>
      )}
      {glbUrl && <SketchupViewer glbUrl={glbUrl} />}
    </div>
  );
}
```

### 기본 뷰어 사용

```tsx
import { SketchupViewer } from '@live-collaboration-tool/client';

function App() {
  const glbUrl = '/api/sketchup/models/model-123.glb';

  return (
    <SketchupViewer
      glbUrl={glbUrl}
      width={800}
      height={600}
      backgroundColor="#f0f0f0"
      onCameraChange={(state) => {
        console.log('카메라 상태:', state);
      }}
      onModelClick={(position, normal) => {
        console.log('클릭 위치:', position);
        console.log('법선 벡터:', normal);
      }}
    />
  );
}
```

### 피드백 포함 사용

```tsx
import { 
  SketchupViewerWithFeedback,
  CollaborationManager 
} from '@live-collaboration-tool/client';
import * as Y from 'yjs';

function App() {
  const [yjsDoc] = useState(() => new Y.Doc());
  const collaborationManager = useMemo(() => new CollaborationManager({
    serverUrl: 'http://localhost:5000',
    roomId: 'room-123',
    userId: 'user-1',
    userName: 'User',
    userColor: '#FF0000',
  }), []);

  useEffect(() => {
    collaborationManager.connect();
    
    // Y.js WebSocket 연결
    const provider = new WebsocketProvider(
      'ws://localhost:5001',
      'sketchup-room',
      yjsDoc
    );

    return () => {
      collaborationManager.disconnect();
      provider.destroy();
    };
  }, []);

  return (
    <SketchupViewerWithFeedback
      serverUrl="http://localhost:5000"
      collaborationManager={collaborationManager}
      yjsDocument={yjsDoc}
      user={{
        id: 'user-1',
        name: 'User',
        color: '#FF0000',
      }}
      onFeedbackAdd={(feedback) => {
        console.log('새 피드백:', feedback);
      }}
      onFeedbackClick={(feedback) => {
        console.log('피드백 클릭:', feedback);
        // 카메라 상태 복원 로직
      }}
    />
  );
}
```

---

## 결론

이 설계안은 기존 프로젝트 구조를 최대한 활용하면서 스케치업 뷰어 모듈을 점진적으로 통합하는 방식을 제안합니다. 모듈화된 구조로 확장성을 확보하고, 기존 협업 인프라를 재사용하여 개발 효율성을 높일 수 있습니다.
