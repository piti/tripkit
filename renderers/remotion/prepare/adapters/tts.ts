export interface TtsAdapter {
  synthesize(text: string, outPath: string): Promise<number>; // seconds
}

// Default adapter is a thin HTTP client behind an env key. The actual provider
// request is intentionally isolated here so it can be swapped or stubbed.
export function getTtsAdapter(env: NodeJS.ProcessEnv = process.env): TtsAdapter {
  const key = env.TRIPKIT_TTS_KEY;
  if (!key) {
    throw new Error(
      'Narration requested (--narrate) but TRIPKIT_TTS_KEY is not set. ' +
      'Set a TTS provider key, or omit --narrate to render with captions + music only.'
    );
  }
  return {
    async synthesize(text: string, outPath: string): Promise<number> {
      // Provider-specific HTTP call writes an audio file to outPath, then we
      // measure its duration. Implemented against the chosen default provider.
      const { synthesizeWithProvider } = await import('./tts-provider.js');
      return synthesizeWithProvider(text, outPath, key);
    },
  };
}
