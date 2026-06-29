import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import type { VideoProps } from '../prepare/types.js';
import { MapFly } from './components/MapFly.js';
import { PhotoMontage } from './components/PhotoMontage.js';
import { TitleCard } from './components/TitleCard.js';
import { IntroCard } from './components/IntroCard.js';
import { Subtitles } from './components/Subtitles.js';

const ASSET_BASE = 'generated';

export const Trip: React.FC<VideoProps> = (props) => {
  // The intro hero card plays first; per-stop segments start after it.
  let from = props.intro ? props.intro.durationInFrames : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {props.music ? <Audio src={props.music.startsWith('http') ? props.music : staticFile(props.music)} volume={() => 0.35} /> : null}
      {props.intro ? (
        <Sequence from={0} durationInFrames={props.intro.durationInFrames}>
          <IntroCard intro={props.intro} title={props.title} subtitle={props.subtitle} dates={props.dates} assetBase={ASSET_BASE} />
        </Sequence>
      ) : null}
      {props.segments.map((seg, i) => {
        const start = from;
        from += seg.durationInFrames;
        // Map-first beat: the camera flies in and the route line draws on the bare
        // map for the opening ~45% of the segment (capped), THEN the photo montage
        // fades in over it for the remainder. Stops with no photos stay map-only.
        const hasPhotos = seg.photos.length > 0;
        const mapBeat = hasPhotos
          ? Math.min(Math.round(seg.durationInFrames * 0.45), 90)
          : seg.durationInFrames;
        const photoDuration = seg.durationInFrames - mapBeat;
        return (
          <Sequence key={i} from={start} durationInFrames={seg.durationInFrames}>
            <MapFly seg={seg} assetBase={ASSET_BASE} revealFrames={mapBeat} />
            {hasPhotos ? (
              <Sequence from={mapBeat} durationInFrames={photoDuration}>
                <PhotoMontage photos={seg.photos} assetBase={ASSET_BASE} />
              </Sequence>
            ) : null}
            <TitleCard seg={seg} />
            <Subtitles captions={seg.captions} />
            {seg.narrationAudio ? <Audio src={staticFile(`${ASSET_BASE}/${seg.narrationAudio}`)} /> : null}
          </Sequence>
        );
      })}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-end', padding: 10, pointerEvents: 'none' }}>
        <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 16, fontFamily: 'sans-serif', textShadow: '0 1px 3px #000' }}>{props.attribution}</span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
