/**
 * Club crest shapes for the header (kit colours apply here only, not app chrome).
 * Each function returns inner SVG markup (viewBox 0 0 40 40).
 */

export const CLUB_BADGE_IDS = ['classic', 'shield', 'roundel', 'stripes', 'monogram', 'wings'];

function escHex(c) {
  return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.trim()) ? c.trim() : '#4ae8a5';
}

const inner = {
  classic: (p, s) => `
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#0f1f18" stroke="${s}" stroke-width="2" />
    <ellipse cx="20" cy="22" rx="12" ry="7" fill="none" stroke="${p}" stroke-width="1.3" opacity="0.9" />
    <circle cx="20" cy="22" r="2.2" fill="${p}" />
  `,
  shield: (p, s) => `
    <path d="M8 6h24v14c0 8-6 14-12 18-6-4-12-10-12-18V6z" fill="#0f1f18" stroke="${s}" stroke-width="1.8" />
    <path d="M12 11h16v10c0 5-3.5 9-8 12-4.5-3-8-7-8-12V11z" fill="${p}" opacity="0.85" />
    <circle cx="20" cy="16" r="3" fill="#0f1f18" stroke="${s}" stroke-width="0.8" />
  `,
  roundel: (p, s) => `
    <circle cx="20" cy="20" r="17" fill="#0f1f18" stroke="${s}" stroke-width="2" />
    <circle cx="20" cy="20" r="12" fill="none" stroke="${p}" stroke-width="1.5" opacity="0.9" />
    <circle cx="20" cy="20" r="5" fill="${p}" />
    <path d="M20 8v4M20 28v4M8 20h4M28 20h4" stroke="${s}" stroke-width="1" opacity="0.6" />
  `,
  stripes: (p, s) => `
    <rect x="4" y="6" width="32" height="28" rx="4" fill="#0f1f18" stroke="${s}" stroke-width="1.5" />
    <rect x="7" y="9" width="7" height="22" rx="1" fill="${p}" opacity="0.9" />
    <rect x="16.5" y="9" width="7" height="22" rx="1" fill="${s}" opacity="0.55" />
    <rect x="26" y="9" width="7" height="22" rx="1" fill="${p}" opacity="0.75" />
  `,
  monogram: (p, s) => `
    <circle cx="20" cy="20" r="17" fill="#0f1f18" stroke="${s}" stroke-width="2" />
    <text x="20" y="26" text-anchor="middle" font-size="14" font-weight="700" font-family="Outfit,system-ui,sans-serif" fill="${p}">FC</text>
    <circle cx="20" cy="20" r="14" fill="none" stroke="${p}" stroke-width="0.8" opacity="0.35" />
  `,
  wings: (p, s) => `
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#0f1f18" stroke="${s}" stroke-width="1.5" />
    <path d="M8 22 Q14 12 20 18 Q26 12 32 22 Q26 26 20 22 Q14 26 8 22" fill="${p}" opacity="0.9" />
    <ellipse cx="20" cy="22" rx="3" ry="2" fill="#0f1f18" stroke="${s}" stroke-width="0.6" />
  `,
};

/**
 * Full SVG element as string — replaces header crest slot.
 */
export function getClubBadgeSvg(badgeId, primary, secondary) {
  const p = escHex(primary);
  const s = escHex(secondary);
  const fn = inner[badgeId] || inner.classic;
  return `<svg class="brand-crest" width="44" height="44" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${fn(p, s)}</svg>`;
}

export function isValidBadgeId(id) {
  return typeof id === 'string' && CLUB_BADGE_IDS.includes(id);
}
