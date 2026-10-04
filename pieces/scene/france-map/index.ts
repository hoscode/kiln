import hexMap from '../hex-map';

// Hex Map preset on metropolitan France: its 13 regions beat one after another
// while the neighbouring countries rest in grey. Every Hex Map setting still
// applies (flat or globe, palettes, pause, …).
export default {
  ...hexMap,
  id: 'france-map',
  title: 'France Map',
  tags: [...(hexMap.tags ?? []), 'france'],
  params: {
    ...hexMap.params,
    region: { ...hexMap.params.region, default: 'france' as const },
    pause: { ...hexMap.params.pause, default: 0.4 },
    duration: { ...hexMap.params.duration, default: 60 },
  },
};
