import type { WebpackOverrideFn } from '@remotion/bundler';

// The source tree uses ESM-style `.js` extensions on relative imports (e.g. `./Trip.js`)
// that actually point at `.ts`/`.tsx` files. Remotion's webpack bundler does not resolve
// `.js` → `.tsx` by default, so teach it via `resolve.extensionAlias`. Required for both
// the smoke render and the full CLI render.
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...(config.resolve?.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
});
