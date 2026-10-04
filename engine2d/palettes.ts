export interface Palette {
  bg: string;
  ink: string;
  colors: string[];
}

// Colors are ordered so neighbours blend well — gradient() walks them in order.
export const palettes: Record<string, Palette> = {
  klein: { bg: '#002fa7', ink: '#f4f1ea', colors: ['#001a66', '#1f4fd1', '#f4f1ea', '#ffc400', '#ff5e1a'] },
  hokusai: { bg: '#efe4cc', ink: '#0b2545', colors: ['#0b2545', '#13315c', '#3a6ea5', '#8da9c4', '#f2f4f3', '#c1121f'] },
  ember: { bg: '#120807', ink: '#ffe9cf', colors: ['#3b0d0c', '#8c1c13', '#d9480f', '#ff9f1c', '#ffe066'] },
  matisse: { bg: '#f7c548', ink: '#2e294e', colors: ['#2e294e', '#1b998b', '#fdfffc', '#f46036', '#d7263d'] },
  lagoon: { bg: '#0a3d3f', ink: '#e8fff8', colors: ['#0e6e6b', '#1fb5a8', '#7ae7c7', '#ffd166', '#ff5d73'] },
  orchid: { bg: '#2b0f3a', ink: '#fbe9ff', colors: ['#5a189a', '#9d4edd', '#e0aaff', '#ff6d9d', '#ffd6a5'] },
  aurora: { bg: '#05080f', ink: '#e6fff5', colors: ['#0b3c49', '#00a88f', '#7cf29c', '#c58cff', '#ff5fa2'] },
  acid: { bg: '#0d0d0d', ink: '#f0f0f0', colors: ['#1a1a1a', '#3df2a0', '#c6ff00', '#f0f0f0', '#ff2e88'] },
  cyanotype: { bg: '#123a6b', ink: '#f7f3e8', colors: ['#0a2448', '#1f5aa6', '#6fa3d8', '#cfe3f5', '#f7f3e8'] },
  candy: { bg: '#ffe3ec', ink: '#1a0f2e', colors: ['#3d2ccf', '#00b3a4', '#ffd400', '#ff8a00', '#ff2d6f'] },
  'rust-teal': { bg: '#0f2a2e', ink: '#efe6d4', colors: ['#163d43', '#2f6f73', '#9cc5b9', '#e8d8b0', '#d9622b', '#a8331c'] },
  'terracotta-sky': { bg: '#9fc6e7', ink: '#1e2b33', colors: ['#2f4858', '#c4532e', '#e8875b', '#f3c9a5', '#fefae0'] },
  pistachio: { bg: '#dfe8c8', ink: '#2f3e1f', colors: ['#2f3e1f', '#5c7c2a', '#a7c957', '#f6bd60', '#f28482'] },
  // Earlier, quieter set.
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
  atlas: { bg: '#d9e3e6', ink: '#2b2a28', colors: ['#e3b27c', '#9fc086', '#c4a3d0', '#ebcd6e', '#8fb8cc', '#e0907f'] },
  dusk: { bg: '#10141c', ink: '#efe8dc', colors: ['#2f4858', '#33658a', '#86647b', '#b5838d', '#6d8f71', '#c99a5b'] },
};

export const paletteNames = Object.keys(palettes);

export function getPalette(name: string): Palette {
  return palettes[name] ?? palettes[paletteNames[0]];
}
