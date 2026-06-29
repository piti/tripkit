import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { writeFile } from 'node:fs/promises';

// Default provider implementation. Replace the fetch body to target a different
// TTS service; the contract is: write audio to outPath, return its duration (s).
export async function synthesizeWithProvider(text: string, outPath: string, apiKey: string): Promise<number> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`TTS provider error ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return getAudioDurationInSeconds(outPath);
}
