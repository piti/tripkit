import React from 'react';
import { Composition } from 'remotion';
import { Trip } from './Trip.js';
import type { VideoProps } from '../prepare/types.js';

const EMPTY: VideoProps = {
  title: '', subtitle: '', dates: '', fps: 30, width: 1920, height: 1080, music: null, attribution: '', intro: null, segments: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Trip"
    component={Trip}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => {
      const segs = props.segments.reduce((sum, s) => sum + s.durationInFrames, 0);
      const total = (props.intro?.durationInFrames ?? 0) + segs;
      return { durationInFrames: Math.max(1, total), fps: props.fps, width: props.width, height: props.height };
    }}
  />
);
