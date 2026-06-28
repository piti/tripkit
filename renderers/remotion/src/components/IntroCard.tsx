import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { evolvePath } from '@remotion/paths';
import type { IntroProps } from '../../prepare/types.js';

// Opening hero: the whole trip route on one wide map, with the title/subtitle/dates.
// Its first frame doubles as the video thumbnail, so the map + route + title are all
// visible immediately (no fade-in delay on the route path).
export const IntroCard: React.FC<{ intro: IntroProps; title: string; subtitle: string; dates: string; assetBase: string }> = ({ intro, title, subtitle, dates, assetBase }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const d = intro.routePx.length >= 2
    ? `M ${intro.routePx.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    : '';
  // Draw the full route over the first ~60% of the intro; fully drawn before it ends.
  const reveal = Math.max(1, Math.round(durationInFrames * 0.6));
  const progress = interpolate(frame, [0, reveal], [0.04, 1], { extrapolateRight: 'clamp' });
  const evolved = d ? evolvePath(progress, d) : null;

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const titleY = interpolate(enter, [0, 1], [24, 0]);
  // Slow zoom on the map so the static hero never feels frozen.
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1.1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img src={staticFile(`${assetBase}/${intro.mapImage}`)} style={{ width: intro.mapWidth, height: intro.mapHeight, objectFit: 'cover' }} />
        {d && evolved ? (
          <svg width={intro.mapWidth} height={intro.mapHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
            <path d={d} fill="none" stroke="#fff" strokeWidth={8} opacity={0.55} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={intro.routeColor} strokeWidth={4} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </AbsoluteFill>
      {/* Legibility scrim behind the title. */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,.15) 35%, rgba(0,0,0,0) 60%)' }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 90, opacity: exit, pointerEvents: 'none' }}>
        <div style={{ transform: `translateY(${titleY}px)` }}>
          {dates ? (
            <div style={{ display: 'inline-block', background: intro.routeColor, color: '#fff', fontSize: 24, fontWeight: 600, padding: '7px 16px', borderRadius: 22, fontFamily: 'sans-serif' }}>{dates}</div>
          ) : null}
          <div style={{ color: '#fff', fontSize: 84, fontWeight: 700, marginTop: 14, fontFamily: 'serif', textShadow: '0 2px 24px rgba(0,0,0,.85)', lineHeight: 1.05 }}>{title}</div>
          {subtitle ? (
            <div style={{ color: 'rgba(255,255,255,.92)', fontSize: 34, marginTop: 8, fontFamily: 'sans-serif', textShadow: '0 2px 16px rgba(0,0,0,.8)' }}>{subtitle}</div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
