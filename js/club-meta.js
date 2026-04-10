/**
 * Club systems: board pressure, sponsors, identity, atmosphere, youth, traits, analytics, events.
 * Kept compact — decision → consequence loop.
 */

import { ENGLISH_PYRAMID, mulberry32, randomPlayerName } from './leagues.js';

export const PLAYER_PERSONALITIES = ['loyal', 'mercenary', 'injury_prone', 'big_game'];
export const MANAGER_TRAITS = ['develops_youth', 'defensive', 'short_term_results'];

export const CLUB_IDENTITIES = [
  { id: 'youth', label: 'Youth-first', desc: 'Fans want U21 minutes; big fees for veterans test patience.' },
  { id: 'spender', label: 'Big spenders', desc: 'Investors expect squad investment; hoarding cash draws scrutiny.' },
  { id: 'underdog', label: 'Underdog spirit', desc: 'Supporters love punching up; heavy favourites disappoint easily.' },
];

export function rollPlayerPersonality(rng) {
  return PLAYER_PERSONALITIES[Math.floor(rng() * PLAYER_PERSONALITIES.length)];
}

export function rollManagerTraits(rng) {
  const n = 1 + (rng() < 0.35 ? 1 : 0);
  const pool = [...MANAGER_TRAITS];
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

export function migrateToV4(s) {
  if ((s.version || 0) >= 4 && s.board?.fans != null && s.atmosphere != null) return;
  s.board = s.board || { fans: 68, investors: 65, media: 62 };
  s.atmosphere = s.atmosphere ?? 55;
  s.sponsorOffers = Array.isArray(s.sponsorOffers) ? s.sponsorOffers : [];
  s.matchLog = Array.isArray(s.matchLog) ? s.matchLog : [];
  s.pendingEvents = Array.isArray(s.pendingEvents) ? s.pendingEvents : [];
  s.eventId = s.eventId ?? 0;
  s.clubIdentity = s.clubIdentity ?? null;
  s.identityDrift = s.identityDrift ?? 0;
  s.youthAcademy = s.youthAcademy || { seasonInvest: 0 };
  s.financialExtras = s.financialExtras || { namingRightsSold: false };
  s.transferNoise = s.transferNoise ?? 0;
  s.lastLeagueResult = s.lastLeagueResult || null;
  s.loanRateWeekly = s.loanRateWeekly ?? 0.0035;
  if (s.staff?.manager?.hired && !s.staff.manager.traits?.length) {
    s.staff.manager.traits = rollManagerTraits(mulberry32(s.seed + 404));
  }
  const rng = mulberry32(s.seed + 909);
  for (const p of s.squad || []) {
    if (!p.personality) p.personality = rollPlayerPersonality(rng);
  }
  s.version = 4;
}

/** Ticket price 8–120 → multiplier on attendance willingness (0.65–1.15) */
export function ticketPriceFactor(ticketPrice) {
  const t = Math.max(8, Math.min(120, ticketPrice || 18));
  return 1.15 - (t - 8) / 120 * 0.5;
}

/**
 * Atmosphere 0–100 from fans board + recent form + identity
 */
export function resolveAtmosphere(s) {
  const b = s.board?.fans ?? 55;
  const row = s.table?.find((t) => t.isPlayer);
  const form = row && row.played > 0 ? row.points / Math.max(1, row.played * 3) : 0.35;
  let atm = b * 0.45 + form * 55 + (s.reputation || 0) * 0.15;
  if (s.clubIdentity === 'underdog') atm += 3;
  return Math.max(18, Math.min(100, Math.round(atm)));
}

export function computePlayerMatchBoost(s) {
  const atm = (s.atmosphere ?? 55) / 100;
  let boost = (atm - 0.5) * 7;
  const m = s.staff?.manager;
  if (m?.hired && m.traits?.length) {
    if (m.traits.includes('short_term_results')) boost += 1.1;
    if (m.traits.includes('develops_youth')) {
      const y = (s.squad || []).filter((p) => p.age <= 21).length;
      boost += Math.min(2.2, y * 0.2);
    }
    if (m.traits.includes('defensive')) boost += 0.35;
  }
  const bg = (s.squad || []).filter((p) => p.personality === 'big_game').length;
  boost += Math.min(2, bg * 0.35);
  if (s.clubIdentity === 'underdog') boost += 0.4;
  return boost;
}

export function buildSponsorOffers(s) {
  const rng = mulberry32(s.seed + s.week * 17 + s.season * 31);
  const rep = s.reputation || 10;
  const li = Math.min(Math.max(0, s.leagueIndex ?? 5), ENGLISH_PYRAMID.length - 1);
  const tier = ENGLISH_PYRAMID[li];
  const anchor = tier.tvBonusPerWeek;
  /** 1 = top division, ~0.14 = regional tier — scales deal size down the pyramid */
  const divBoost = (ENGLISH_PYRAMID.length - li) / ENGLISH_PYRAMID.length;

  let core;
  if (anchor >= 40_000) {
    core =
      18_000 +
      rep * (700 + divBoost * 420) +
      anchor * (0.22 + divBoost * 0.38 + rng() * (0.04 + divBoost * 0.06));
  } else {
    core =
      10_500 +
      rep * (320 + li * 45) +
      anchor * (2.4 + divBoost * 5.5) +
      rng() * (1800 + (6 - li) * 2200);
  }

  const safe = {
    id: `offer-safe-${s.week}-${s.season}`,
    brand: 'Stable Stays PLC',
    oneOffPayment: Math.round(core * (0.82 + rng() * 0.16)),
    leagueName: tier.name,
    prefMaxPlace: 10,
    minRep: 5,
    playstyle: 'balanced',
    risk: 'safe',
    blurb: 'Wants stability and mid-table security — one partnership fee for the campaign narrative, no weekly instalments.',
  };

  const risky = {
    id: `offer-risk-${s.week}-${s.season}`,
    brand: 'Velocity Bet',
    oneOffPayment: Math.round(core * (1.18 + rng() * 0.24)),
    leagueName: tier.name,
    prefMaxPlace: 6,
    minRep: 12,
    playstyle: 'attacking',
    risk: 'risky',
    blurb: 'Demands top-half buzz — pays a bigger lump sum for a risky brand; still no running weekly fee.',
  };

  return [safe, risky];
}

export function tickBoardPressures(s, delta) {
  if (!s.board) s.board = { fans: 60, investors: 60, media: 60 };
  const b = s.board;
  b.fans = clamp(b.fans + (delta.fans || 0));
  b.investors = clamp(b.investors + (delta.investors || 0));
  b.media = clamp(b.media + (delta.media || 0));
  s.board = b;
}

function clamp(n) {
  return Math.max(5, Math.min(100, Math.round(n)));
}

export function checkSponsorContracts(s) {
  const messages = [];
  const row = s.table?.find((t) => t.isPlayer);
  const place = row ? s.table.findIndex((t) => t.id === row.id) + 1 : 10;
  const n = s.table?.length || 10;

  s.sponsors = (s.sponsors || []).filter((sp) => {
    if (sp.prefMaxPlace == null) return true;
    if (place <= sp.prefMaxPlace) {
      sp.graceWeeks = 3;
      return true;
    }
    sp.graceWeeks = (sp.graceWeeks ?? 3) - 1;
    if (sp.graceWeeks <= 0) {
      messages.push(
        `${sp.label || 'Sponsor'} ended the deal — league position breached the contract (${place}/${n} vs top ${sp.prefMaxPlace}).`
      );
      tickBoardPressures(s, { media: -6, investors: -4 });
      return false;
    }
    messages.push(`${sp.label || 'Sponsor'} warns: results must improve (${sp.graceWeeks} week grace).`);
    return true;
  });

  return messages;
}

export function applyIdentityAfterSigning(s, fee, playerAge) {
  const id = s.clubIdentity;
  if (!id) return;
  if (id === 'youth' && playerAge >= 30 && fee > 120_000) {
    tickBoardPressures(s, { fans: -5, media: 2 });
    s.identityDrift = (s.identityDrift || 0) + 2;
  }
  if (id === 'spender' && fee < 40_000) {
    tickBoardPressures(s, { investors: -3 });
  }
  if (id === 'spender' && fee > 200_000) {
    tickBoardPressures(s, { fans: 3, investors: 2 });
    s.identityDrift = Math.max(0, (s.identityDrift || 0) - 1);
  }
}

export function recordMatchLog(s, { gf, ga, oppRank, week }) {
  const log = s.matchLog || [];
  const concededLate = ga > gf && gf > 0 && ga >= gf + 1;
  log.unshift({
    week,
    gf,
    ga,
    oppRank,
    concededLate: concededLate && Math.random() < 0.35,
    topOpp: oppRank <= 3,
  });
  s.matchLog = log.slice(0, 24);
}

export function computeAnalyticsInsights(s) {
  const insights = [];
  const log = s.matchLog || [];
  if (log.filter((m) => m.concededLate).length >= 3) {
    insights.push({ id: 'late', text: 'You concede frequently after the hour — consider fresher legs or a defensive sub pattern.' });
  }
  const topLosses = log.filter((m) => m.topOpp && m.gf < m.ga).length;
  if (topLosses >= 2 && log.length >= 4) {
    insights.push({ id: 'top', text: 'Results dip against top-table sides — underdog identity rewards discipline over chasing the game.' });
  }
  const squad = s.squad || [];
  const topScorer = [...squad].sort((a, b) => (b.lGoals || 0) - (a.lGoals || 0))[0];
  if (topScorer && (topScorer.lGoals || 0) >= 8) {
    const rest = squad.reduce((sum, p) => sum + (p.lGoals || 0), 0) - (topScorer.lGoals || 0);
    if ((topScorer.lGoals || 0) > rest * 0.55 && squad.length > 8) {
      insights.push({
        id: 'rely',
        text: `${topScorer.name} is carrying the attack — injury or suspension would hurt badly.`,
      });
    }
  }
  return insights.slice(0, 4);
}

export function runYouthIntake(rng, leagueIndex, invest) {
  const tier = Math.max(0, 6 - (leagueIndex ?? 5));
  const n = invest >= 350_000 ? 3 + (rng() < 0.4 ? 1 : 0) : invest >= 150_000 ? 2 : invest >= 50_000 ? 1 : 0;
  const golden = invest >= 400_000 && rng() < 0.12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const age = 16 + Math.floor(rng() * 3);
    const ovr = golden
      ? 58 + Math.floor(rng() * 12)
      : 48 + tier * 2 + Math.floor(rng() * 10) + Math.floor(invest / 200_000);
    const pos = ['GK', 'DF', 'MF', 'FW'][Math.floor(rng() * 4)];
    out.push({
      id: `youth-${Math.floor(rng() * 1e12)}-${i}-${Math.floor(rng() * 1e9)}`,
      name: randomPlayerName(rng),
      pos,
      ovr: Math.min(78, ovr),
      age,
      wage: 400 + Math.floor(rng() * 600),
      askingFee: 0,
      morale: 78 + Math.floor(rng() * 15),
      personality: rollPlayerPersonality(rng),
      lApps: 0,
      cApps: 0,
      fApps: 0,
      lGoals: 0,
      cGoals: 0,
      fGoals: 0,
      lAssists: 0,
      cAssists: 0,
      fAssists: 0,
      lRatingSum: 0,
      cRatingSum: 0,
      fRatingSum: 0,
      lRatingCount: 0,
      cRatingCount: 0,
      fRatingCount: 0,
      fromYouth: true,
    });
  }
  return { players: out, golden };
}

export function maybeRandomEvent(s, rng) {
  if ((s.pendingEvents || []).length > 0) return null;
  if (rng() > 0.14) return null;
  const roll = rng();
  const id = `ev-${++s.eventId}`;
  if (roll < 0.28) {
    const squad = [...(s.squad || [])].sort((a, b) => b.ovr - a.ovr);
    const star = squad[0];
    if (!star) return null;
    return {
      id,
      type: 'star_exit',
      headline: `${star.name} wants talks`,
      body: `${star.name} (${star.pos}, OVR ${star.ovr}) feels the project has stalled. Deal with it before morale infects the dressing room.`,
      choices: [
        { id: 'promise', label: 'Promise investment (+£ wage bill next week)', wagePct: 0.08 },
        { id: 'fine', label: 'Fine them publicly', fans: -4, starMorale: -15 },
        { id: 'ignore', label: 'Ignore (risk transfer request)', media: -5 },
      ],
    };
  }
  if (roll < 0.5 && (s.sponsors || []).length) {
    const sp = s.sponsors[rng() < 0.5 ? 0 : s.sponsors.length - 1];
    return {
      id,
      type: 'sponsor_shock',
      headline: 'Sponsor nervous',
      body: `${sp.label} is reviewing spend after industry headlines. Offer a gesture or they may pause payments.`,
      choices: [
        { id: 'pr', label: 'PR charm offensive (£25k)', cost: 25_000, media: 6 },
        { id: 'cut', label: 'Accept reduced terms (-15% this sponsor 8w)', weeklyMult: 0.85, weeks: 8 },
      ],
    };
  }
  if (roll < 0.72) {
    const cost = 40_000 + Math.floor(rng() * 90_000);
    return {
      id,
      type: 'stadium_damage',
      headline: 'Stadium damage',
      body: `Storm damage to roof section — repairs quoted at £${cost.toLocaleString()}.`,
      choices: [
        { id: 'pay', label: 'Pay repairs', cost },
        { id: 'delay', label: 'Patch job (fans -6, atmosphere -8)', fans: -6 },
      ],
    };
  }
  return {
    id,
    type: 'hijack',
    headline: 'Transfer hijack rumour',
    body: 'A richer club is circling your top target on the loan list — media noise rises.',
    choices: [
      { id: 'deny', label: 'Deny publicly', media: 3 },
      { id: 'silent', label: 'Stay silent', media: -2 },
    ],
  };
}
