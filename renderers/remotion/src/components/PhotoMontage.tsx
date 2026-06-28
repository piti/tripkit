import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';

export const PhotoMontage: React.FC<{ photos: string[]; assetBase: string }> = ({ photos, assetBase }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (photos.length === 0) return null;
  const per = durationInFrames / photos.length;
  const idx = Math.min(photos.length - 1, Math.floor(frame / per));
  const local = frame - idx * per;
  const scale = interpolate(local, [0, per], [1.05, 1.18], { extrapolateRight: 'clamp' });
  const opacity = interpolate(local, [0, per * 0.15, per * 0.85, per], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const src = photos[idx];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '78%', height: '70%', overflow: 'hidden', borderRadius: 14, boxShadow: '0 20px 80px rgba(0,0,0,.6)', opacity }}>
        <Img src={src.startsWith('http') ? src : staticFile(`${assetBase}/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
      </div>
    </AbsoluteFill>
  );
};
