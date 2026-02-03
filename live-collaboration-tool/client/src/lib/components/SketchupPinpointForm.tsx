/**
 * 스케치업 핀포인트 입력 폼 컴포넌트
 * 모델 클릭 시 표시되는 피드백 입력 폼
 */

import React, { useState } from 'react';
import { SketchupPinpoint, Vector3D, CameraState } from '../sketchup/types';

export interface SketchupPinpointFormProps {
  position: Vector3D;
  normal?: Vector3D;
  cameraState?: CameraState;
  userId: string;
  onSubmit: (pinpoint: Omit<SketchupPinpoint, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const SketchupPinpointForm: React.FC<SketchupPinpointFormProps> = ({
  position,
  normal,
  cameraState,
  userId,
  onSubmit,
  onCancel,
  className,
  style,
}) => {
  const [comment, setComment] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      return;
    }

    onSubmit({
      position,
      normal,
      comment: comment.trim(),
      userId,
      isResolved: false,
      viewState: cameraState,
    });

    setComment('');
  };

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        zIndex: 1001,
        minWidth: '300px',
        maxWidth: '500px',
        pointerEvents: 'auto',
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ marginTop: 0, marginBottom: '15px' }}>핀포인트 추가</h3>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            피드백 내용
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="피드백을 입력하세요..."
            rows={4}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#666' }}>
          <div>위치: ({position.x.toFixed(2)}, {position.y.toFixed(2)}, {position.z.toFixed(2)})</div>
          {normal && (
            <div>법선: ({normal.x.toFixed(2)}, {normal.y.toFixed(2)}, {normal.z.toFixed(2)})</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!comment.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: comment.trim() ? '#4CAF50' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: comment.trim() ? 'pointer' : 'not-allowed',
              fontSize: '14px',
            }}
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
};
