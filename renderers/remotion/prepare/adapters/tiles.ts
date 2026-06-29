export interface TileProvider {
  id: string;
  urlTemplate: string; // staticmaps-style with {z}/{x}/{y}
  attribution: string;
}

export function getTileProvider(id = 'maptiler', env: NodeJS.ProcessEnv = process.env): TileProvider {
  switch (id) {
    case 'maptiler': {
      const key = env.MAPTILER_KEY;
      if (!key) {
        throw new Error(
          'MapTiler is the default tile provider for video but MAPTILER_KEY is not set. ' +
          'Get a free key at https://maptiler.com, then `export MAPTILER_KEY=…`, ' +
          'or pass --tiles esri for non-commercial output.'
        );
      }
      return {
        id: 'maptiler',
        urlTemplate: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
        attribution: '© MapTiler © OpenStreetMap contributors',
      };
    }
    case 'esri':
      return {
        id: 'esri',
        // NOTE: Esri public tiles are non-commercial only when baked into video. Attribution required.
        urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Esri, USGS (non-commercial use)',
      };
    default:
      throw new Error(`Unknown tile provider "${id}". Use "maptiler" or "esri".`);
  }
}
