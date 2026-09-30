import { int, num, palette } from '../../../engine2d';
import { defineShader } from '../../../enginegl';
import fragment from './gyroid.frag?raw';

export default defineShader({
  id: 'gyroid',
  title: 'Gyroid',
  tags: ['shader', 'raymarching', 'loop'],
  aspect: 1,
  animation: { duration: 8, fps: 60, loop: true },
  params: {
    palette: palette('sunset'),
    scale: num(9, 3, 24, 0.1),
    thickness: num(0.025, 0.004, 0.1, 0.001),
    bias: num(0, -0.9, 0.9, 0.01),
    orbits: int(1, 0, 3, 'Camera orbits'),
    distance: num(3.1, 2, 6, 0.05),
    focal: num(2.2, 1, 5, 0.05, 'Focal length'),
    colorSpread: num(1.4, 0, 5, 0.05, 'Color spread'),
    colorShift: num(0, 0, 1, 0.01, 'Color shift'),
    exposure: num(1.6, 0.3, 4, 0.05),
    grain: num(0.03, 0, 0.2, 0.005),
  },
  fragment,
});
