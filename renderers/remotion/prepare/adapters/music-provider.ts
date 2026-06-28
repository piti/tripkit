import { writeFile } from 'node:fs/promises';

// Default AI-music provider. Swap the fetch body to target a different service.
export async function generateMusic(apiKey: string, outPath: string): Promise<string> {
  const res = await fetch('https://api.example-music.test/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'gentle uplifting acoustic travel background, instrumental', durationSeconds: 90 }),
  });
  if (!res.ok) throw new Error(`Music provider error ${res.status}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}
