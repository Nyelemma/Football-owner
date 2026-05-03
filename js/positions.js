/**
 * Granular outfield roles + helpers for lineups, scouting copy, and match profiling.
 * Legacy saves may still have DF / MF / FW until migrateToV12 runs.
 */

export const POSITION_GROUPS = {
  GK: ['GK'],
  DEF: ['RB', 'LB', 'CB'],
  MID: ['CDM', 'CM', 'CAM'],
  FWD: ['RW', 'LW', 'ST'],
};

/** Transfers filter row — "All" handled in UI */
export const TRANSFER_FILTER_POSITIONS = ['GK', 'RB', 'LB', 'CB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'];

const LEGACY_POS = new Set(['DF', 'MF', 'FW']);

/** Lineup / feed ordering */
const POS_ORDER = {
  GK: 0,
  RB: 1,
  LB: 2,
  CB: 3,
  CDM: 4,
  CM: 5,
  CAM: 6,
  RW: 7,
  LW: 8,
  ST: 9,
  DF: 3,
  MF: 5,
  FW: 9,
};

/** Goal assignment weights by role */
const SCORER_WEIGHT = {
  GK: 0,
  ST: 3.6,
  RW: 2.85,
  LW: 2.85,
  CAM: 2.35,
  CM: 1.45,
  CDM: 0.75,
  CB: 0.42,
  LB: 0.58,
  RB: 0.58,
  DF: 0.55,
  MF: 1.35,
  FW: 3.1,
};

const ATK_W = {
  ST: 1,
  RW: 0.82,
  LW: 0.82,
  CAM: 0.76,
  CM: 0.48,
  CDM: 0.22,
  CB: 0.12,
  LB: 0.28,
  RB: 0.28,
  GK: 0,
  DF: 0.18,
  MF: 0.42,
  FW: 0.92,
};

const DEF_W = {
  GK: 1,
  CB: 0.82,
  LB: 0.62,
  RB: 0.62,
  CDM: 0.58,
  CM: 0.35,
  CAM: 0.22,
  RW: 0.28,
  LW: 0.28,
  ST: 0.18,
  DF: 0.72,
  MF: 0.38,
  FW: 0.2,
};

/** Pick DEF / MID / FWD with old 2:2:1 weighting across outfield (plus GK share). */
export function rollDetailedPosition(rng) {
  const groups = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD'];
  const g = groups[Math.floor(rng() * groups.length)];
  return suggestRandomPosition(g, rng);
}

export function suggestRandomPosition(group, rng) {
  const list = POSITION_GROUPS[group];
  if (!list?.length) return 'CM';
  return list[Math.floor(rng() * list.length)];
}

export function migrateLegacyPosition(pos, rng) {
  if (!pos) return 'CM';
  if (LEGACY_POS.has(pos)) {
    if (pos === 'DF') return suggestRandomPosition('DEF', rng);
    if (pos === 'MF') return suggestRandomPosition('MID', rng);
    if (pos === 'FW') return suggestRandomPosition('FWD', rng);
  }
  return pos;
}

export function positionSortKey(pos) {
  return POS_ORDER[pos] ?? 50;
}

export function scorerWeightForPosition(pos) {
  return SCORER_WEIGHT[pos] ?? 0.65;
}

/**
 * Weighted attack / defence ratings for goal simulation (same scale as ~40–75 typical squad averages).
 */
export function squadAttackDefence(squad, strengthFallback) {
  if (!squad?.length) {
    const s = strengthFallback ?? 55;
    return { attack: s * 0.56, defence: s * 0.54 };
  }
  let aNum = 0;
  let aDen = 0;
  let dNum = 0;
  let dDen = 0;
  for (const p of squad) {
    const pos = p.pos;
    const o = p.ovr ?? 50;
    const aw = ATK_W[pos] ?? 0.4;
    const dw = DEF_W[pos] ?? 0.4;
    aNum += o * aw;
    aDen += aw;
    dNum += o * dw;
    dDen += dw;
  }
  return {
    attack: aNum / Math.max(0.01, aDen),
    defence: dNum / Math.max(0.01, dDen),
  };
}

const SCORE_BIAS = [0, 0, 1, 1, 1, 1, 2, 2, 2, 2];

function goalChanceForPeriod(teamAttack, oppDefence) {
  const diff = teamAttack - oppDefence;
  return Math.max(0.024, Math.min(0.078, 0.044 + diff * 0.0026));
}

/** Fewer “shooting periods”, softer bias — totals cluster 0–2, max 4. */
export function simulateSideGoals(teamAttack, oppDefence, rng, { periods = 7, homeBonus = 0 } = {}) {
  let g = 0;
  for (let i = 0; i < periods; i++) {
    const p = goalChanceForPeriod(teamAttack, oppDefence) + homeBonus;
    if (rng() < p) g++;
  }
  if (rng() < 0.34) {
    const bias = SCORE_BIAS[Math.floor(rng() * SCORE_BIAS.length)];
    g = Math.round(g * 0.78 + bias * 0.22);
  }
  return Math.min(4, Math.max(0, g));
}

/** Standard 4-4-2 style template: 1 GK, 4 DEF-line, 4 MID-line, 2 up top (best available by OVR). */
export function pickStartersFromSquad(squad, rng) {
  if (!squad?.length) return [];
  const gks = squad.filter((p) => p.pos === 'GK');
  const nonGk = squad.filter((p) => p.pos !== 'GK');
  const byGroup = (set) => nonGk.filter((p) => set.includes(p.pos));
  const used = new Set();
  const takeBest = (pool, n) =>
    [...pool]
      .filter((p) => !used.has(p.id))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, n)
      .map((p) => {
        used.add(p.id);
        return p;
      });

  const gk = gks[Math.floor(rng() * gks.length)] || squad[0];
  const starters = [gk];
  if (gk) used.add(gk.id);

  const defPool = byGroup(POSITION_GROUPS.DEF);
  const midPool = byGroup(POSITION_GROUPS.MID);
  const fwdPool = byGroup(POSITION_GROUPS.FWD);

  starters.push(...takeBest(defPool, 4));
  starters.push(...takeBest(midPool, 4));
  starters.push(...takeBest(fwdPool, 2));

  const remainder = nonGk.filter((p) => !used.has(p.id)).sort(() => rng() - 0.5);
  while (starters.length < 11 && remainder.length) {
    const p = remainder.shift();
    if (!used.has(p.id)) {
      used.add(p.id);
      starters.push(p);
    }
  }

  return starters.length >= 11 ? starters.slice(0, 11) : squad.slice(0, Math.min(11, squad.length));
}
