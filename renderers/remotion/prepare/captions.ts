import type { CaptionToken } from './types.js';

// Deterministic even-split fallback (used when whisper is unavailable).
export function tokensForText(text: string, totalSeconds: number): CaptionToken[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const per = (totalSeconds * 1000) / words.length;
  return words.map((w, i) => ({ text: w, fromMs: Math.round(i * per), toMs: Math.round((i + 1) * per) }));
}

// Whisper-backed transcription. Optional: if the binary/model can't be set up,
// log a notice and return [] so the caller can fall back to tokensForText.
export async function transcribeToTokens(audioPath: string): Promise<CaptionToken[]> {
  try {
    const { installWhisperCpp, downloadWhisperModel, transcribe, toCaptions } = await import('@remotion/install-whisper-cpp');
    const to = '/tmp/whisper.cpp';
    await installWhisperCpp({ to, version: '1.5.5' });
    await downloadWhisperModel({ model: 'medium.en', folder: to });
    const { transcription } = await transcribe({
      inputPath: audioPath,
      whisperPath: to,
      model: 'medium.en',
      tokenLevelTimestamps: true,
    });
    const { captions } = toCaptions({ whisperCppOutput: transcription });
    return captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs }));
  } catch (err) {
    console.warn(`  ⚠ whisper unavailable — falling back to even-split captions. (${(err as Error).message})`);
    return [];
  }
}
