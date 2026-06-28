import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import type { VideoProps } from '../prepare/types.js';
import { MapFly } from './components/MapFly.js';
import { PhotoMontage } from './components/PhotoMontage.js';
import { TitleCard } from './components/TitleCard.js';
import { Subtitles } from './components/Subtitles.js';

const ASSET_BASE = 'generated';

export const Trip: React.FC<VideoProps> = (props) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {props.music ? <Audio src={props.music.startsWith('http') ? props.music : staticFile(props.music)} volume={() => 0.25} /> : null}
      {props.segments.map((seg, i) => {
        const start = from;
        from += seg.durationInFrames;
        return (
          <Sequence key={i} from={start} durationInFrames={seg.durationInFrames}>
            <MapFly seg={seg} assetBase={ASSET_BASE} />
            <PhotoMontage photos={seg.photos} assetBase={ASSET_BASE} />
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
