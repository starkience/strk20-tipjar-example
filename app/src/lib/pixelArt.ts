// Tiny pixel-art sprites rendered as inline SVG. Each sprite is a grid of
// single-character cells mapped to colors; rows are padded to a fixed width so
// a ragged map can never break layout. `image-rendering: pixelated` on the <img>
// or inline SVG keeps the hard 8-bit edges when scaled up.

type Palette = Record<string, string>;

const COIN_PALETTE: Palette = {
  K: "#1a1a1a", // outline
  G: "#f5a623", // gold body
  H: "#ffd23f", // gold highlight
  S: "#c67c1e", // gold shadow / symbol
};

// 16x16 gold coin.
const COIN_MAP = [
  "................",
  ".....KKKKKK.....",
  "...KKGGGGGGKK...",
  "..KGGGGGGGGGGK..",
  "..KGGGHHHHGGGK..",
  ".KGGGHHGGHHGGGK.",
  ".KGGHHGGGGHHGGK.",
  ".KGGHGGSSGGHGGK.",
  ".KGGHGGSSGGHGGK.",
  ".KGGHHGGGGHHGGK.",
  ".KGGGHHGGHHGGGK.",
  "..KGGGHHHHGGGK..",
  "..KGGGGGGGGGGK..",
  "...KKGGGGGGKK...",
  ".....KKKKKK.....",
  "................",
];

const WALLET_PALETTE: Palette = {
  K: "#1a1a1a", // outline
  B: "#8a5a2b", // leather body
  D: "#5f3d1c", // leather shadow
  Y: "#ffd23f", // clasp
};

// 16x16 billfold wallet with a gold clasp.
const WALLET_MAP = [
  "................",
  "...KKKKKKKKK....",
  "..KBBBBBBBBBK...",
  "..KBBBBBBBBBBK..",
  ".KKKKKKKKKKKKKK.",
  ".KBBBBBBBBBBBBK.",
  ".KBBBBBBBBBBBBK.",
  ".KBBBBBBBKKKKBK.",
  ".KBBBBBBBKYYKBK.",
  ".KBBBBBBBKYYKBK.",
  ".KBBBBBBBKKKKBK.",
  ".KBBBBBBBBBBBBK.",
  ".KDDDDDDDDDDDDK.",
  ".KKKKKKKKKKKKKK.",
  "................",
  "................",
];

const VAULT_PALETTE: Palette = {
  K: "#1a1a1a", // outline
  S: "#3f3f46", // steel body
  D: "#6b7280", // steel highlight
  Y: "#ffd23f", // gold dial
};

// 16x16 vault — the privacy pool: funds go in, nobody sees inside.
const VAULT_MAP = [
  "................",
  ".KKKKKKKKKKKKKK.",
  ".KSSSSSSSSSSSSK.",
  ".KSDDDDDDDDDDSK.",
  ".KSDSSSSSSSSDSK.",
  ".KSDSSSYYSSSDSK.",
  ".KSDSSYYYYSSDSK.",
  ".KSDSSYYYYSSDSK.",
  ".KSDSSSYYSSSDSK.",
  ".KSDSSSSSSSSDSK.",
  ".KSDDDDDDDDDDSK.",
  ".KSSSSSSSSSSSSK.",
  ".KKKKKKKKKKKKKK.",
  "................",
  "................",
  "................",
];

const JAR_PALETTE: Palette = {
  K: "#1a1a1a", // outline
  Y: "#ffd23f", // rim
  J: "#dbeef5", // glass
  G: "#f5a623", // coins
};

// 16x16 tip jar — the public contract: everyone can see what's inside.
const JAR_MAP = [
  "................",
  "................",
  "....KKKKKKKK....",
  "....KYYYYYYK....",
  "...KKKKKKKKKK...",
  "...KJJJJJJJJK...",
  "...KJGGJJGGJK...",
  "...KJJJJJJJJK...",
  "...KJGGJJGGJK...",
  "...KJJJJJJJJK...",
  "...KJJGGGGJJK...",
  "...KJJJJJJJJK...",
  "...KKKKKKKKKK...",
  "................",
  "................",
  "................",
];

function mapToSvg(map: string[], palette: Palette, size = 16): string {
  const rects: string[] = [];
  for (let y = 0; y < size; y++) {
    const row = (map[y] ?? "").padEnd(size, ".").slice(0, size);
    for (let x = 0; x < size; x++) {
      const color = palette[row[x]];
      if (color) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" width="100%" height="100%">${rects.join("")}</svg>`
  );
}

export const COIN_SVG = mapToSvg(COIN_MAP, COIN_PALETTE);
export const WALLET_SVG = mapToSvg(WALLET_MAP, WALLET_PALETTE);
export const VAULT_SVG = mapToSvg(VAULT_MAP, VAULT_PALETTE);
export const JAR_SVG = mapToSvg(JAR_MAP, JAR_PALETTE);
