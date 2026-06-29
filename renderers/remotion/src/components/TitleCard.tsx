import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SegmentProps } from '../../prepare/types.js';

export const TitleCard: React.FC<{ seg: SegmentProps }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const opacity = Math.min(enter, exit);
  const y = interpolate(enter, [0, 1], [20, 0]);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 80, pointerEvents: 'none' }}>
      <div style={{ transform: `translateY(${y}px)`, opacity }}>
        <div style={{ display: 'inline-block', background: seg.dayColor, color: '#fff', fontSize: 22, fontWeight: 600, padding: '6px 14px', borderRadius: 20, fontFamily: 'sans-serif' }}>
          Day {seg.day} · {seg.date}
        </div>
        <div style={{ color: '#fff', fontSize: 64, fontWeight: 700, marginTop: 12, fontFamily: 'serif', textShadow: '0 2px 20px rgba(0,0,0,.8)' }}>{seg.title}</div>
      </div>
    </AbsoluteFill>
  );
};
