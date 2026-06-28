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
  // Per-photo cross-fade...
  const photoOpacity = interpolate(local, [0, per * 0.15, per * 0.85, per], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // ...and a montage-level ease-in/out so the card rises over the map and recedes.
  const montageOpacity = interpolate(frame, [0, 16, durationInFrames - 14, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = interpolate(frame, [0, 18], [24, 0], { extrapolateRight: 'clamp' });
  const src = photos[idx];
  return (
    // Slightly smaller card, nudged up, so the map (and the route line near the
    // bottom) stays framed around the photo rather than being fully covered.
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '66%', height: '62%', marginBottom: '6%', overflow: 'hidden', borderRadius: 16, boxShadow: '0 24px 90px rgba(0,0,0,.7)', border: '3px solid rgba(255,255,255,.85)', opacity: photoOpacity * montageOpacity, transform: `translateY(${rise}px)` }}>
        <Img src={src.startsWith('http') ? src : staticFile(`${assetBase}/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
      </div>
    </AbsoluteFill>
  );
};
