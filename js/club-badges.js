/**
 * Raster gallery of pre-coloured club badges and kits the player picks during onboarding.
 * Each entry's `primary` and `secondary` are exposed so the rest of the game can still read
 * club colours as derived data (used in finances/insights copy etc.) — no UI tints from these.
 */

export const CLUB_BADGES = [
  { id: 'crowned-lion', label: 'Crowned Lion', src: 'assets/badges/badge-crowned-lion.png', primary: '#0d3b66', secondary: '#f4d35e' },
  { id: 'crowned-shield', label: 'Crowned Shield', src: 'assets/badges/badge-crowned-shield.png', primary: '#a01029', secondary: '#f4c95d' },
  { id: 'roundel-star', label: 'Roundel & Star', src: 'assets/badges/badge-roundel-star.png', primary: '#0f5f3f', secondary: '#f7f3e3' },
  { id: 'anchor-disc', label: 'Anchor Disc', src: 'assets/badges/badge-anchor-disc.png', primary: '#0c5466', secondary: '#eaf2f0' },
  { id: 'eagle-wings', label: 'Eagle Wings', src: 'assets/badges/badge-eagle-wings.png', primary: '#ff7a1a', secondary: '#1a1a1a' },
  { id: 'hammers-anvil', label: 'Hammers & Anvil', src: 'assets/badges/badge-hammers-anvil.png', primary: '#2b3743', secondary: '#cfd8de' },
  { id: 'oak-tree', label: 'Oak Tree', src: 'assets/badges/badge-oak-tree.png', primary: '#1f5c3a', secondary: '#f1e6c6' },
  { id: 'twin-towers', label: 'Twin Towers', src: 'assets/badges/badge-twin-towers.png', primary: '#3b1f5c', secondary: '#e8e0f5' },
  { id: 'knight-chess', label: 'Chess Knight', src: 'assets/badges/badge-knight-chess.png', primary: '#1a1a1a', secondary: '#d6a72e' },
  { id: 'wave-seabird', label: 'Wave & Seabird', src: 'assets/badges/badge-wave-seabird.png', primary: '#0a4d8a', secondary: '#f1e8c8' },
  { id: 'phoenix', label: 'Phoenix', src: 'assets/badges/badge-phoenix.png', primary: '#c2371a', secondary: '#f4c95d' },
  { id: 'monogram-rose', label: 'Tudor Rose', src: 'assets/badges/badge-monogram-rose.png', primary: '#a01029', secondary: '#ffffff' },
];

export const CLUB_KITS = [
  { id: 'royal-stripes', label: 'Royal Stripes', src: 'assets/kits/kit-royal-stripes.png', primary: '#0d3b66', secondary: '#ffffff' },
  { id: 'solid-collar', label: 'Crimson Polo', src: 'assets/kits/kit-solid-collar.png', primary: '#a01029', secondary: '#ffffff' },
  { id: 'hoops', label: 'Emerald Hoops', src: 'assets/kits/kit-hoops.png', primary: '#0f5f3f', secondary: '#ffffff' },
  { id: 'half-and-half', label: 'Claret & Sky', src: 'assets/kits/kit-half-and-half.png', primary: '#7b1d2e', secondary: '#5fb0d8' },
  { id: 'central-sash', label: 'Sky Sash', src: 'assets/kits/kit-central-sash.png', primary: '#0a8ad9', secondary: '#ffffff' },
  { id: 'sleeve-panels', label: 'Black & Tangerine', src: 'assets/kits/kit-sleeve-panels.png', primary: '#1a1a1a', secondary: '#ff7a1a' },
  { id: 'pinstripes', label: 'Navy Pinstripes', src: 'assets/kits/kit-pinstripes.png', primary: '#0d2240', secondary: '#d6a72e' },
  { id: 'modern-v', label: 'Modern V-Print', src: 'assets/kits/kit-modern-v.png', primary: '#ffffff', secondary: '#00b3a7' },
];

export const CLUB_BADGE_IDS = CLUB_BADGES.map((b) => b.id);
export const CLUB_KIT_IDS = CLUB_KITS.map((k) => k.id);

const DEFAULT_BADGE = CLUB_BADGES[0];
const DEFAULT_KIT = CLUB_KITS[0];

export function getBadge(id) {
  return CLUB_BADGES.find((b) => b.id === id) || DEFAULT_BADGE;
}

export function getKit(id) {
  return CLUB_KITS.find((k) => k.id === id) || DEFAULT_KIT;
}

export function isValidBadgeId(id) {
  return typeof id === 'string' && CLUB_BADGE_IDS.includes(id);
}

export function isValidKitId(id) {
  return typeof id === 'string' && CLUB_KIT_IDS.includes(id);
}

/**
 * Header crest <img> tag — replaces the old SVG generator. Kept named the same so existing
 * call sites continue to work.
 */
export function getClubBadgeSvg(badgeId) {
  const b = getBadge(badgeId);
  return `<img class="brand-crest" src="${b.src}" alt="${b.label} club crest" width="44" height="44" />`;
}
