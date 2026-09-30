export interface Palette {
  bg: string;
  ink: string;
  colors: string[];
}

export const palettes: Record<string, Palette> = {
  kyoto: { bg: '#efe6d8', ink: '#1f2a2e', colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'] },
  'paper-ink': { bg: '#f2ede4', ink: '#1d1d1f', colors: ['#1d1d1f', '#3b4a6b', '#b0413e', '#d9a441'] },
  riso: { bg: '#f5f1e8', ink: '#222222', colors: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c'] },
  desert: { bg: '#ece2d0', ink: '#3e2a22', colors: ['#7a3b2e', '#c0672f', '#d9a066', '#8a9a5b', '#3e4a3d'] },
  sunset: { bg: '#fbf3e4', ink: '#2b2d42', colors: ['#355070', '#6d597a', '#b56576', '#e56b6f', '#eaac8b'] },
  nord: { bg: '#2e3440', ink: '#eceff4', colors: ['#88c0d0', '#81a1c1', '#5e81ac', '#bf616a', '#d08770', '#ebcb8b', '#a3be8c'] },
  noir: { bg: '#0e0e10', ink: '#f5f5f0', colors: ['#f5f5f0', '#bdbdb5', '#7c7c76', '#d4a373'] },
  moss: { bg: '#e9ede4', ink: '#1e2a1f', colors: ['#2d3a2e', '#4f6d4a', '#8aa37b', '#c9b88a', '#a05c3b'] },
  midnight: { bg: '#0b1624', ink: '#dfe6ee', colors: ['#1c2e44', '#34506e', '#8aa3bb', '#e2e8ee', '#c7a15a'] },
  marble: { bg: '#e8e3da', ink: '#26262a', colors: ['#f3f0ea', '#2b2b2f', '#b9ab90', '#5d6b78'] },
  graphite: { bg: '#141416', ink: '#ececec', colors: ['#2a2a2e', '#4a4a50', '#a3a3ab', '#e6e2da', '#b3864f'] },
  ocean: { bg: '#f1f4f2', ink: '#0b1d2a', colors: ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f', '#c81d25'] },
};

export const paletteNames = Object.keys(palettes);

export function getPalette(name: string): Palette {
  return palettes[name] ?? palettes[paletteNames[0]];
}
