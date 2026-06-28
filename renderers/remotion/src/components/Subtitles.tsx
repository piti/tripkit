import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionToken } from '../../prepare/types.js';

export const Subtitles: React.FC<{ captions: CaptionToken[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (captions.length === 0) return null;
  const ms = (frame / fps) * 1000;
  // Show a ~3s window of words around the current time.
  const windowMs = 2600;
  const visible = captions.filter((c) => c.toMs >= ms - 200 && c.fromMs <= ms + windowMs);
  if (visible.length === 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56 }}>
      <div style={{ maxWidth: '80%', textAlign: 'center', fontFamily: 'sans-serif', fontSize: 34, lineHeight: 1.35 }}>
        {visible.map((c, i) => {
          const active = ms >= c.fromMs && ms <= c.toMs;
          return (
            <span key={i} style={{ color: active ? '#fff' : 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.45)', padding: '2px 6px', borderRadius: 4, margin: '0 2px', fontWeight: active ? 700 : 500 }}>
              {c.text}{' '}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
