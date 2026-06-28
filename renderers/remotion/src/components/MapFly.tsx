import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { interpolateZoom } from 'd3-interpolate';
import { evolvePath, getLength, getPointAtLength } from '@remotion/paths';
import type { SegmentProps } from '../../prepare/types.js';

export const MapFly: React.FC<{ seg: SegmentProps; assetBase: string }> = ({ seg, assetBase }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  const start = seg.fromPx ?? seg.toPx;
  const view0: [number, number, number] = [start.x, start.y, width];
  const view1: [number, number, number] = [seg.toPx.x, seg.toPx.y, width * 0.6];
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const [cx, cy, w] = interpolateZoom(view0, view1)(t);
  const scale = width / w;
  const tx = width / 2 - cx * scale;
  const ty = height / 2 - cy * scale;

  const d = seg.routePx.length >= 2
    ? `M ${seg.routePx.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    : '';
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const evolved = d ? evolvePath(progress, d) : null;
  // Marker dot rides the tip of the revealed route.
  const marker = d ? getPointAtLength(d, getLength(d) * progress) : null;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      <div style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <Img src={seg.mapImage.startsWith('http') ? seg.mapImage : staticFile(`${assetBase}/${seg.mapImage}`)} style={{ width: seg.mapWidth, height: seg.mapHeight }} />
        {d && evolved ? (
          <svg width={seg.mapWidth} height={seg.mapHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
            <path d={d} fill="none" stroke="#fff" strokeWidth={6 / scale} opacity={0.5} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
            <path d={d} fill="none" stroke={seg.dayColor} strokeWidth={3 / scale} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
            {marker ? <circle cx={marker.x} cy={marker.y} r={6 / scale} fill={seg.dayColor} stroke="#fff" strokeWidth={2 / scale} /> : null}
          </svg>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
