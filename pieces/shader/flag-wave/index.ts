import { bool, choice, group, int, num } from '../../../engine2d';
import { defineShader } from '../../../enginegl';
import fragment from './flag-wave.frag?raw';
import { flagCanvas, flagCodes, flags } from './flags';
import { weaveTexture } from './weave';

export default defineShader({
  id: 'flag-wave',
  title: 'Flag Wave',
  tags: ['shader', 'raymarching', 'loop', 'flag'],
  aspect: 16 / 9,
  animation: { duration: 6, fps: 60, loop: true },
  params: {
    flag: choice(flagCodes, 'es'),
    ...group('Wind', {
      wind: num(1, 0, 2, 0.01),
      waves: int(2, 1, 6, 'Waves per loop'),
      wavelength: num(0.6, 0.25, 1.2, 0.01),
      tilt: num(1.2, -3, 3, 0.05, 'Diagonal folds'),
      ripple: num(0.6, 0, 1.5, 0.01),
      droop: num(0.12, 0, 0.4, 0.005),
    }),
    ...group('Fabric', {
      threads: num(600, 60, 3000, 1, 'Threads per width'),
      weave: num(1, 0, 2, 0.01, 'Weave relief'),
      wrinkles: num(1, 0, 3, 0.01),
      sheen: num(0.6, 0, 2, 0.01),
      translucency: num(0.7, 0, 1.5, 0.01),
    }),
    ...group('Sun', {
      sunAzimuth: num(-58, -180, 180, 1, 'Sun azimuth'),
      sunElevation: num(26, 2, 85, 0.5, 'Sun elevation'),
      sunIntensity: num(4, 0.5, 8, 0.05, 'Sun intensity'),
      clouds: num(0.35, 0, 1, 0.01),
    }),
    ...group('Camera', {
      yaw: num(-14, -70, 70, 0.5),
      pitch: num(-10, -30, 30, 0.5),
      zoom: num(1, 0.5, 6, 0.01),
      focal: num(2.6, 1, 6, 0.05, 'Focal length'),
      pole: bool(true),
    }),
    ...group('Render', {
      exposure: num(1, 0.2, 3, 0.01),
      grain: num(0.015, 0, 0.1, 0.001),
    }),
  },
  textures: {
    flag: (p) => flagCanvas(flags[p.flag]),
    weave: { draw: weaveTexture, repeat: true, data: true },
  },
  fragment,
});
