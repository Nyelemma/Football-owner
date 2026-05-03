import {
  ENGLISH_PYRAMID,
  FRANCHISE_REGIONS,
  makeLeagueTeams,
  makeFranchiseLeague,
  mulberry32,
  randomClubName,
  buildDoubleRoundRobinRounds,
  randomPlayerName,
  randomStaffName,
  getLeagueEconomy,
} from './leagues.js';
import { buildFixtureSchedule, buildScheduleSteps, computeScheduleStepIndex } from './calendar-cups.js';
import {
  migrateToV4,
  rollPlayerPersonality,
  rollManagerTraits,
  buildSponsorOffers,
  computePlayerMatchBoost,
  tickBoardPressures,
  resolveAtmosphere,
  checkSponsorContracts,
  recordMatchLog,
  applyIdentityAfterSigning,
  runYouthIntake,
  computeAnalyticsInsights,
  maybeRandomEvent,
  ticketPriceFactor,
  CLUB_IDENTITIES,
} from './club-meta.js';
import { CLUB_BADGE_IDS } from './club-badges.js';
import {
  rollDetailedPosition,
  positionSortKey,
  scorerWeightForPosition,
  squadAttackDefence,
  simulateSideGoals,
  pickStartersFromSquad,
  migrateLegacyPosition,
  suggestRandomPosition,
} from './positions.js';

const SAVE_KEY = 'football-chairman-save-v5';

/** Summer break (May–June) then pre-season (July) before August kickoff — week ticks */
/** Summer break — advance one week at a time (no league fixtures). */
const OFF_SEASON_WEEKS = 6;
/** Training matches & friendlies before the league campaign. */
const PRE_SEASON_WEEKS = 5;

/**
 * Base values are anchored to National League North/South (staffMultiplier = 1.0 reference).
 * Per-tier wage/fee scales linearly with `econ.staffMultiplier`, giving a realistic ~200x
 * spread between a Premier League manager (~£100–200k/wk) and a National League N/S manager
 * (~£400–1.5k/wk). Hire cost ≈ a few weeks of wages, scaled the same way.
 */
const STAFF_BASE_DIVISOR = 1;
const STAFF_ROLES = [
  { id: 'manager', label: 'First-team manager', baseWeekly: 600, qualityCap: 5, hireCost: 1_500 },
  { id: 'dof', label: 'Director of football', baseWeekly: 200, qualityCap: 5, hireCost: 600 },
  { id: 'head_scout', label: 'Head of recruitment', baseWeekly: 80, qualityCap: 5, hireCost: 250 },
  { id: 'commercial', label: 'Commercial director', baseWeekly: 50, qualityCap: 5, hireCost: 180 },
];

function staffEconMult(leagueIndex) {
  const econ = getLeagueEconomy(leagueIndex);
  return econ.staffMultiplier / STAFF_BASE_DIVISOR;
}

/** Signing fee scales with quality (1–5) AND with the player's current division. */
export function getStaffHireCost(roleId, quality, leagueIndex) {
  const def = STAFF_ROLES.find((r) => r.id === roleId);
  if (!def || quality < 1 || quality > def.qualityCap) return 0;
  const mult = 0.55 + quality * 0.22;
  return Math.round(def.hireCost * mult * staffEconMult(leagueIndex));
}

function staffWeeklyWage(def, quality, leagueIndex) {
  const mult = 0.6 + quality * 0.2;
  return Math.round(def.baseWeekly * mult * staffEconMult(leagueIndex));
}

/** Public helper for UI: weekly wage estimate by role id, quality (1–5), and division. */
export function staffWeeklyWageEstimate(roleId, quality, leagueIndex) {
  const def = STAFF_ROLES.find((r) => r.id === roleId);
  if (!def || quality < 1 || quality > def.qualityCap) return 0;
  return staffWeeklyWage(def, quality, leagueIndex);
}

/**
 * Classic sponsor packages: one-off payment only; each tier locks for `durationSeasons`
 * before you can renew. Multipliers are applied to the league economy's `sponsorAnchor`
 * (national tier = 1.0x), so the same offers feel right at every level of the pyramid.
 */
const SPONSOR_TIERS = [
  { id: 'local', label: 'Local business', anchorMul: 0.05, durationSeasons: 1 },
  { id: 'regional', label: 'Regional brand', anchorMul: 0.20, durationSeasons: 2 },
  { id: 'national', label: 'National sponsor', anchorMul: 1.0, durationSeasons: 3 },
  { id: 'elite', label: 'Elite partner', anchorMul: 3.5, durationSeasons: 4 },
];

/** Lump-sum payment for a classic sponsor tier at the player's current division. */
export function getSponsorTierPayment(tierId, leagueIndex) {
  const t = SPONSOR_TIERS.find((x) => x.id === tierId);
  if (!t) return 0;
  const econ = getLeagueEconomy(leagueIndex);
  return Math.round(econ.sponsorAnchor * t.anchorMul);
}

function ensurePlayerStats(p) {
  if (p.apps !== undefined && p.lApps === undefined) {
    p.lApps = p.apps;
    p.cApps = 0;
    p.fApps = 0;
    p.lGoals = p.goals ?? 0;
    p.cGoals = 0;
    p.fGoals = 0;
    p.lAssists = p.assists ?? 0;
    p.cAssists = 0;
    p.fAssists = 0;
    p.lRatingSum = p.ratingSum ?? 0;
    p.cRatingSum = 0;
    p.fRatingSum = 0;
    p.lRatingCount = p.ratingCount ?? 0;
    p.cRatingCount = 0;
    p.fRatingCount = 0;
    delete p.apps;
    delete p.goals;
    delete p.assists;
    delete p.ratingSum;
    delete p.ratingCount;
  }
  p.lApps = p.lApps ?? 0;
  p.cApps = p.cApps ?? 0;
  p.fApps = p.fApps ?? 0;
  p.lGoals = p.lGoals ?? 0;
  p.cGoals = p.cGoals ?? 0;
  p.fGoals = p.fGoals ?? 0;
  p.lAssists = p.lAssists ?? 0;
  p.cAssists = p.cAssists ?? 0;
  p.fAssists = p.fAssists ?? 0;
  p.lRatingSum = p.lRatingSum ?? 0;
  p.cRatingSum = p.cRatingSum ?? 0;
  p.fRatingSum = p.fRatingSum ?? 0;
  p.lRatingCount = p.lRatingCount ?? 0;
  p.cRatingCount = p.cRatingCount ?? 0;
  p.fRatingCount = p.fRatingCount ?? 0;
  return p;
}

export function playerAvgRating(p) {
  ensurePlayerStats(p);
  const n = p.lRatingCount + p.cRatingCount + p.fRatingCount;
  if (!n) return null;
  return Math.round(((p.lRatingSum + p.cRatingSum + p.fRatingSum) / n) * 10) / 10;
}

export function playerLeagueAvgRating(p) {
  ensurePlayerStats(p);
  if (!p.lRatingCount) return null;
  return Math.round((p.lRatingSum / p.lRatingCount) * 10) / 10;
}

export function playerCupAvgRating(p) {
  ensurePlayerStats(p);
  if (!p.cRatingCount) return null;
  return Math.round((p.cRatingSum / p.cRatingCount) * 10) / 10;
}

/**
 * Wage curve: anchor on `econ.baseWeeklyWage` (OVR ~50 floor) and stretch up to
 * `econ.topWeeklyWage` near OVR ~90, with the squad mean landing on `econ.avgWeeklyWage`.
 */
export function wageForOvr(ovr, econ, rng = Math.random) {
  const o = Math.max(40, Math.min(95, ovr));
  const base = econ.baseWeeklyWage;
  const top = econ.topWeeklyWage;
  const t = Math.max(0, Math.min(1, (o - 50) / 40));
  const curve = base + (top - base) * Math.pow(t, 1.9);
  const noise = 0.85 + rng() * 0.3;
  return Math.max(Math.round(econ.baseWeeklyWage * 0.6), Math.round(curve * noise));
}

/** Real fees: weekly wage × feeMultiplier × age factor. Forced free for low-OVR fringe in lower leagues. */
export function feeForPlayer(wage, ovr, age, econ, rng = Math.random) {
  const isFree = rng() < econ.freeTransferRate && ovr < 62;
  if (isFree) return 0;
  const ageFactor = Math.max(0.2, Math.min(1.4, 1.4 - (age - 18) * 0.05));
  const ovrFactor = 0.6 + Math.pow(Math.max(0, ovr - 50) / 40, 1.6) * 1.6;
  const fee = wage * econ.feeMultiplier * ageFactor * ovrFactor * (0.8 + rng() * 0.5);
  return Math.max(0, Math.round(fee / 1000) * 1000);
}

function randomPlayer(rng, tier, econ) {
  const pos = rollDetailedPosition(rng);
  const base = 45 + tier * 4 + Math.floor(rng() * 18);
  const age = 18 + Math.floor(rng() * 16);
  let ovr = Math.min(94, base);
  if (age <= 22 && rng() < 0.55) ovr = Math.min(94, ovr + Math.floor(rng() * 3));
  const personality = rollPlayerPersonality(rng, pos);
  let wage = wageForOvr(ovr, econ, rng);
  if (personality === 'mercenary') wage = Math.round(wage * (1.06 + rng() * 0.08));
  if (personality === 'loyal') wage = Math.round(wage * (0.93 + rng() * 0.05));
  const fee = feeForPlayer(wage, ovr, age, econ, rng);
  return ensurePlayerStats({
    id: `p-${Math.floor(rng() * 1e12)}-${Math.floor(rng() * 1e12)}`,
    name: randomPlayerName(rng),
    pos,
    ovr,
    age,
    wage,
    askingFee: fee,
    morale: 70 + Math.floor(rng() * 25),
    personality,
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
  });
}

/** AI squads for league teams (player club uses state.squad only). */
export function attachSquadsToTable(table, leagueIndex, seedSalt) {
  const tier = Math.max(0, 6 - leagueIndex);
  const econ = getLeagueEconomy(leagueIndex);
  return table.map((team, i) => {
    if (team.isPlayer) {
      const { squad: _drop, ...rest } = team;
      return rest;
    }
    if (team.squad && team.squad.length >= 16) return team;
    const rng = mulberry32(seedSalt + leagueIndex * 13 + i * 997);
    const str = team.squadStrength ?? 55;
    const squad = [];
    for (let j = 0; j < 18; j++) {
      const p = randomPlayer(rng, tier + (j < 9 ? 1 : 0), econ);
      const adjust = (str - 55) * 0.38;
      p.ovr = Math.min(94, Math.max(36, Math.round(p.ovr + adjust + rng() * 7 - 3.5)));
      p.wage = wageForOvr(p.ovr, econ, rng);
      p.askingFee = feeForPlayer(p.wage, p.ovr, p.age, econ, rng);
      squad.push(p);
    }
    return { ...team, squad };
  });
}

function weightedPick(items, weightFn, rng) {
  let w = 0;
  const wts = items.map((it) => {
    w += Math.max(0.01, weightFn(it));
    return w;
  });
  const r = rng() * w;
  for (let i = 0; i < items.length; i++) {
    if (r <= wts[i]) return items[i];
  }
  return items[items.length - 1];
}

function pickStarters(squad, rng) {
  return pickStartersFromSquad(squad, rng);
}

function collectGoalAssignments(starters, goalsFor, rng) {
  const assignments = [];
  if (goalsFor <= 0) return assignments;
  const scorable = starters.filter((p) => p.pos !== 'GK');
  const pool = scorable.length ? scorable : starters;
  for (let g = 0; g < goalsFor; g++) {
    const scorer = weightedPick(pool, (p) => scorerWeightForPosition(p.pos), rng);
    let assistPlayer = null;
    if (rng() < 0.87 && pool.length > 1) {
      const others = pool.filter((p) => p !== scorer);
      assistPlayer = others[Math.floor(rng() * others.length)];
    }
    assignments.push({ scorer, assistPlayer });
  }
  return assignments;
}

function applyGoalAssignments(assignments, kind) {
  const gk = kind === 'league' ? 'lGoals' : kind === 'cup' ? 'cGoals' : 'fGoals';
  const ak = kind === 'league' ? 'lAssists' : kind === 'cup' ? 'cAssists' : 'fAssists';
  for (const { scorer, assistPlayer } of assignments) {
    ensurePlayerStats(scorer);
    scorer[gk] += 1;
    if (assistPlayer) {
      ensurePlayerStats(assistPlayer);
      assistPlayer[ak] += 1;
    }
  }
}

function recordSquadMatchStats(squad, goalsFor, goalsAgainst, rng, kind) {
  if (!squad?.length) return null;
  const starters = pickStarters(squad, rng);
  const sid = new Set(starters.map((p) => p.id));
  const bench = squad.filter((p) => !sid.has(p.id)).slice(0, 9);
  const won = goalsFor > goalsAgainst;
  const lost = goalsFor < goalsAgainst;
  const appsK = kind === 'league' ? 'lApps' : kind === 'cup' ? 'cApps' : 'fApps';
  const rs = kind === 'league' ? 'lRatingSum' : kind === 'cup' ? 'cRatingSum' : 'fRatingSum';
  const rc = kind === 'league' ? 'lRatingCount' : kind === 'cup' ? 'cRatingCount' : 'fRatingCount';
  for (const p of starters) {
    ensurePlayerStats(p);
    p[appsK] += 1;
    let r = 5.75 + rng() * 2.35;
    if (won) r += 0.42;
    else if (lost) r -= 0.52;
    else r += 0.08;
    r = Math.max(4.2, Math.min(9.6, r));
    p[rs] += r;
    p[rc] += 1;
  }
  const goalAssignments = collectGoalAssignments(starters, goalsFor, rng);
  applyGoalAssignments(goalAssignments, kind);
  return { starters, bench, goalAssignments };
}

function sortLineupForDisplay(starters) {
  return [...(starters || [])].sort((a, b) => positionSortKey(a.pos) - positionSortKey(b.pos));
}

function buildChronologicalGoalEvents(homeName, awayName, homeAssigns, awayAssigns, rng) {
  const rows = [];
  for (const a of homeAssigns || []) {
    rows.push({
      side: 'home',
      team: homeName,
      scorer: a.scorer?.name ?? '?',
      assist: a.assistPlayer?.name ?? null,
    });
  }
  for (const a of awayAssigns || []) {
    rows.push({
      side: 'away',
      team: awayName,
      scorer: a.scorer?.name ?? '?',
      assist: a.assistPlayer?.name ?? null,
    });
  }
  for (const r of rows) {
    r.minute = 4 + Math.floor(rng() * 86);
  }
  rows.sort((a, b) => a.minute - b.minute);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].minute <= rows[i - 1].minute) rows[i].minute = Math.min(90, rows[i - 1].minute + 1);
  }
  return rows;
}

function buildLeagueMatchReport(state, home, away, hGoals, aGoals, homeRet, awayRet, rng, attendanceMeta) {
  const mw = (state.leagueRoundIndex ?? 0) + 1;
  const leagueLabel = ENGLISH_PYRAMID[state.leagueIndex]?.name ?? 'League';
  const goals = buildChronologicalGoalEvents(
    home.name,
    away.name,
    homeRet?.goalAssignments,
    awayRet?.goalAssignments,
    rng
  );
  const feed = [];
  feed.push({ phase: 'before', minute: 0, text: `${leagueLabel} · Matchweek ${mw} — ${home.name} vs ${away.name}` });
  feed.push({ phase: 'live', minute: 1, text: 'Kick-off' });
  for (const g of goals) {
    const tag = g.side === 'home' ? home.name : away.name;
    feed.push({
      phase: 'live',
      minute: g.minute,
      text: `${g.minute}' — GOAL ${tag}: ${g.scorer}${g.assist ? ` · assist ${g.assist}` : ''}`,
    });
  }
  const ftExtra =
    attendanceMeta?.show && attendanceMeta.attendance != null && attendanceMeta.stadiumCapacity
      ? ` · Attendance: ${attendanceMeta.attendance.toLocaleString()} / ${attendanceMeta.stadiumCapacity.toLocaleString()}`
      : '';
  feed.push({
    phase: 'after',
    minute: 90,
    text: `Full time — ${home.name} ${hGoals}–${aGoals} ${away.name}${ftExtra}`,
  });
  return {
    kind: 'league',
    leagueLabel,
    matchweek: mw,
    homeName: home.name,
    awayName: away.name,
    homeLineup: sortLineupForDisplay(homeRet?.starters).map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, age: p.age })),
    awayLineup: sortLineupForDisplay(awayRet?.starters).map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, age: p.age })),
    homeBench: (homeRet?.bench || []).slice(0, 9).map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, age: p.age })),
    awayBench: (awayRet?.bench || []).slice(0, 9).map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, age: p.age })),
    homeGoals: hGoals,
    awayGoals: aGoals,
    playerIsHome: !!home.isPlayer,
    attendance: attendanceMeta?.attendance ?? null,
    stadiumCapacity: attendanceMeta?.stadiumCapacity ?? null,
    stadiumHint: attendanceMeta?.stadiumHint ?? '',
    attendanceLine: attendanceMeta?.attendanceLine ?? '',
    feed,
  };
}

function makeGuestLineup(rng) {
  const starters = Array.from({ length: 11 }, () => ({
    name: randomPlayerName(rng),
    pos: rollDetailedPosition(rng),
    ovr: 45 + Math.floor(rng() * 18),
    age: 18 + Math.floor(rng() * 16),
  }));
  if (!starters.some((p) => p.pos === 'GK')) starters[0].pos = 'GK';
  return starters;
}

function mapLineupRows(starters, bench) {
  const startersM = sortLineupForDisplay(starters).map((p) => ({
    name: p.name,
    pos: p.pos,
    ovr: p.ovr,
    age: p.age ?? null,
  }));
  const benchM = (bench || []).slice(0, 9).map((p) => ({
    name: p.name,
    pos: p.pos,
    ovr: p.ovr,
    age: p.age ?? null,
  }));
  return { startersM, benchM };
}

/**
 * Pre-season weekly friendly — same scoring vibe as _playFriendlyMatch but full match report for Match centre.
 */
function buildPreSeasonFriendlyReport(
  state,
  weekNum,
  playerRet,
  oppName,
  oppStarters,
  oppBench,
  pGoals,
  oGoals,
  playerIsHome,
  rngFeed,
  attendanceMeta
) {
  const clubName = state.table?.find((t) => t.isPlayer)?.name ?? 'Your club';
  const rngOppGoals = mulberry32(state.seed + state.week * 72_104);
  const oppMapped = mapLineupRows(oppStarters, oppBench);

  let homeName;
  let awayName;
  let hGoals;
  let aGoals;
  let homeAssigns;
  let awayAssigns;
  let homeLineup;
  let awayLineup;
  let homeBench;
  let awayBench;

  if (playerIsHome) {
    homeName = clubName;
    awayName = oppName;
    hGoals = pGoals;
    aGoals = oGoals;
    homeAssigns = playerRet?.goalAssignments || [];
    awayAssigns = collectGoalAssignments(oppStarters, oGoals, rngOppGoals);
    const pl = mapLineupRows(playerRet?.starters, playerRet?.bench);
    homeLineup = pl.startersM;
    awayLineup = oppMapped.startersM;
    homeBench = pl.benchM;
    awayBench = oppMapped.benchM;
  } else {
    homeName = oppName;
    awayName = clubName;
    hGoals = oGoals;
    aGoals = pGoals;
    homeAssigns = collectGoalAssignments(oppStarters, oGoals, rngOppGoals);
    awayAssigns = playerRet?.goalAssignments || [];
    const plAway = mapLineupRows(playerRet?.starters, playerRet?.bench);
    homeLineup = oppMapped.startersM;
    awayLineup = plAway.startersM;
    homeBench = oppMapped.benchM;
    awayBench = plAway.benchM;
  }

  const goals = buildChronologicalGoalEvents(homeName, awayName, homeAssigns, awayAssigns, rngFeed);
  const feed = [];
  feed.push({
    phase: 'before',
    minute: 0,
    text: `Pre-season friendly ${weekNum}/${PRE_SEASON_WEEKS} — ${homeName} vs ${awayName}`,
  });
  feed.push({ phase: 'live', minute: 1, text: 'Kick-off (behind closed doors / limited crowd)' });
  for (const g of goals) {
    const tag = g.side === 'home' ? homeName : awayName;
    feed.push({
      phase: 'live',
      minute: g.minute,
      text: `${g.minute}' — GOAL ${tag}: ${g.scorer}${g.assist ? ` · assist ${g.assist}` : ''}`,
    });
  }
  const ftAttendance =
    attendanceMeta?.show && attendanceMeta.attendance != null && attendanceMeta.stadiumCapacity
      ? ` · Attendance: ${attendanceMeta.attendance.toLocaleString()} / ${attendanceMeta.stadiumCapacity.toLocaleString()} (${attendanceMeta.friendlyCrowdNote || 'estimated'})`
      : '';
  feed.push({
    phase: 'after',
    minute: 90,
    text: `Full time — ${homeName} ${hGoals}–${aGoals} ${awayName}${ftAttendance}`,
  });

  return {
    kind: 'friendly',
    leagueLabel: 'Pre-season friendly',
    matchweek: weekNum,
    homeName,
    awayName,
    homeLineup,
    awayLineup,
    homeBench,
    awayBench,
    homeGoals: hGoals,
    awayGoals: aGoals,
    playerIsHome,
    attendance: attendanceMeta?.attendance ?? null,
    stadiumCapacity: attendanceMeta?.stadiumCapacity ?? null,
    stadiumHint: attendanceMeta?.stadiumHint ?? '',
    attendanceNote: attendanceMeta?.friendlyCrowdNote ?? '',
    attendanceLine: attendanceMeta?.attendanceLine ?? '',
    feed,
  };
}

/**
 * How many divisions the buyer is BELOW the seller (higher index = lower tier).
 * Buyer NL North (5), seller PL (0) → gapDown = 5.
 */
export function evaluateTransferApproach({ buyerLeagueIndex, sellerLeagueIndex, playerOvr, reputation }) {
  const gapDown = buyerLeagueIndex - sellerLeagueIndex;

  if (gapDown >= 6) {
    return {
      willing: false,
      reason: 'The player will not entertain a move that far down the pyramid.',
    };
  }
  if (gapDown >= 4 && playerOvr >= 56) {
    return {
      willing: false,
      reason: 'Not interested — your division is too many levels below their ambitions.',
    };
  }
  if (gapDown >= 3 && playerOvr >= 62) {
    return {
      willing: false,
      reason: 'They are not discussing moves to clubs at your level.',
    };
  }
  if (gapDown >= 3 && playerOvr >= 58 && reputation < 40) {
    return {
      willing: false,
      reason: 'Your club profile is too modest for them to take the call seriously.',
    };
  }
  if (gapDown >= 2 && playerOvr >= 70 && reputation < 48) {
    return {
      willing: false,
      reason: 'A player of this standard only wants clubs with a stronger reputation.',
    };
  }
  if (gapDown >= 2 && playerOvr >= 74) {
    return {
      willing: false,
      reason: 'Elite players at this level expect to stay in the upper divisions.',
    };
  }
  if (gapDown >= 1 && playerOvr >= 82 && reputation < 62) {
    return {
      willing: false,
      reason: 'They are holding out for a bigger club than yours.',
    };
  }

  let feeMult = 1 + Math.max(0, gapDown) * 0.2;
  if (gapDown >= 2) feeMult += 0.28;
  if (gapDown >= 3) feeMult += 0.35;
  if (reputation < 38) feeMult += 0.22;
  if (reputation > 78) feeMult -= 0.1;
  feeMult = Math.max(1, feeMult);

  let wageMult = 1 + Math.max(0, gapDown) * 0.12;
  if (gapDown >= 2) wageMult += 0.1;
  if (reputation < 35) wageMult += 0.08;
  wageMult = Math.max(1, wageMult);

  let summary = 'Willing to negotiate.';
  if (gapDown <= 0) summary = 'Interested in the project.';
  else if (gapDown === 1) summary = 'Hesitant but will listen if the package is right.';
  else summary = 'Reluctant — you will need to overpay to convince them.';

  return { willing: true, feeMultiplier: feeMult, wageMultiplier: wageMult, summary };
}

function initCupSeason(leagueIndex) {
  const li = leagueIndex ?? 5;
  return {
    fa: { active: true, done: false, roundsWon: 0 },
    trophy: { active: li >= 4 && li <= 6, done: false, roundsWon: 0 },
    vase: { active: li >= 5, done: false, roundsWon: 0 },
  };
}

function buildTransferMarkets(state, scoutBonus) {
  const tier = Math.max(0, 6 - state.leagueIndex);
  const econ = getLeagueEconomy(state.leagueIndex);
  const rngP = mulberry32(state.seed + state.season * 5000 + 11);
  const nPerm = 14 + scoutBonus;
  state.transferList = Array.from({ length: nPerm }, () => randomPlayer(rngP, tier + Math.floor(scoutBonus / 3), econ));

  const rngF = mulberry32(state.seed + state.season * 6000 + 22);
  const nFree = 7 + Math.floor(scoutBonus / 2);
  state.freeAgentList = Array.from({ length: nFree }, () => {
    const p = randomPlayer(rngF, Math.max(0, tier - 1), econ);
    p.askingFee = 0;
    p.listingType = 'free';
    return p;
  });

  const rngL = mulberry32(state.seed + state.season * 7000 + 33);
  state.loanList = Array.from({ length: 6 }, () => {
    const p = randomPlayer(rngL, tier + 1 + Math.floor(rngL() * 2), econ);
    /** Loan fee ≈ 6–10% of season-long wage outlay; capped to division economy. */
    const notional = Math.floor(p.wage * (40 + rngL() * 55));
    const minLoan = Math.max(500, Math.round(econ.baseWeeklyWage * 4));
    p.askingFee = Math.max(minLoan, Math.floor(notional * 0.06 + rngL() * (econ.baseWeeklyWage * 60)));
    p.listingType = 'loan';
    return p;
  });
}

function generateAcquisitionSlots(rng, startUid) {
  const slots = [];
  for (let i = 0; i < 3; i++) {
    slots.push({
      uid: `acq-${startUid + i}`,
      name: randomClubName(rng),
      cost: 800_000 + Math.floor(rng() * 2_200_000),
    });
  }
  return { slots, nextUid: startUid + 3 };
}

function defaultState() {
  const seed = Date.now() % 1_000_000_000;
  const rng = mulberry32(seed);
  const startLeague = 5;
  const startEcon = getLeagueEconomy(startLeague);
  const clubName = 'Marston Athletic';
  let table = makeLeagueTeams(startLeague, clubName, seed);
  table = attachSquadsToTable(table, startLeague, seed);
  const teamIds = table.map((t) => t.id);
  const playerTid = table.find((t) => t.isPlayer)?.id ?? null;
  const leagueRounds = buildDoubleRoundRobinRounds(teamIds, seed + startLeague * 999, playerTid);
  const acq = generateAcquisitionSlots(mulberry32(seed + 777), 0);

  const st = {
    version: 13,
    seed,
    week: 1,
    season: 1,
    seasonStartYear: 2025,
    leagueIndex: startLeague,
    clubName,
    stadiumName: 'Marston Park',
    clubColorPrimary: '#0d3b66',
    clubColorSecondary: '#f4d35e',
    clubBadgeId: 'crowned-lion',
    clubKitId: 'royal-stripes',
    onboardingComplete: false,
    cash: startEcon.startingCash,
    debt: 0,
    stadiumCapacity: 2_800,
    fanBase: 9_600,
    ticketPrice: 18,
    reputation: 12,
    board: { fans: 68, investors: 65, media: 62 },
    atmosphere: 55,
    clubIdentity: null,
    identityChangeDeadlineWeek: 5,
    identityDrift: 0,
    sponsorOffers: [],
    matchLog: [],
    pendingEvents: [],
    eventId: 0,
    youthAcademy: { seasonInvest: 0 },
    financialExtras: { namingRightsSold: false },
    classicSponsorRenewSeason: {},
    negotiatedBrandsThisSeason: [],
    seasonPhase: 'competitive',
    phaseWeeksLeft: 0,
    transferNoise: 0,
    lastLeagueResult: null,
    lastMatchReport: null,
    loanRateWeekly: 0.0035,
    tempWageMult: 1,
    table,
    leagueRounds,
    leagueRoundIndex: 0,
    scheduleSteps: [],
    scheduleStepIndex: 0,
    fixtureSchedule: [],
    cups: initCupSeason(startLeague),
    advisories: [],
    advisoryId: 0,
    history: [],
    squad: Array.from({ length: 18 }, () => randomPlayer(rng, 0, startEcon)),
    staff: {
      manager: { hired: false, name: '', quality: 0, wage: 0 },
      dof: { hired: false, name: '', quality: 0, wage: 0 },
      head_scout: { hired: false, name: '', quality: 0, wage: 0 },
      commercial: { hired: false, name: '', quality: 0, wage: 0 },
    },
    sponsors: [],
    transferList: [],
    freeAgentList: [],
    loanList: [],
    ownedClubs: [],
    acquisitionOffers: acq.slots,
    acquisitionNextUid: acq.nextUid,
    franchiseUnlocked: false,
    lastEventWeek: 0,
    seasonPlace: null,
    worldLeagues: {},
    worldSeason: -1,
    playerBuyOffers: [],
    lastWeekPL: null,
    seasonFinance: {
      transferFeesPaid: 0,
      transferIncome: 0,
      stadiumSpend: 0,
      sponsorLumps: 0,
    },
  };
  buildTransferMarkets(st, 0);
  st.squad.forEach((p) => {
    ensurePlayerStats(p);
    if (!p.onLoan) {
      p.contractYearsSigned = 2;
      p.contractEndSeason = st.season + 1;
    }
  });
  st.scheduleSteps = buildScheduleSteps(st, ENGLISH_PYRAMID[startLeague].name);
  st.fixtureSchedule = st.scheduleSteps;
  st.scheduleStepIndex = 0;
  st.sponsorOffers = buildSponsorOffers(st);
  return st;
}

function migrateToV2(s) {
  const table = s.table || [];
  const teamIds = table.map((t) => t.id);
  const seed = s.seed || 1;
  const leagueIndex = s.leagueIndex ?? 5;
  const pid = table.find((t) => t.isPlayer)?.id ?? null;
  s.leagueRounds = buildDoubleRoundRobinRounds(teamIds, seed + leagueIndex * 999, pid);
  const n = s.leagueRounds.length;
  const matchesPerRound = teamIds.length / 2;
  const oldIdx = s.fixtureIndex ?? 0;
  s.leagueRoundIndex = Math.min(n - 1, Math.max(0, Math.floor(oldIdx / Math.max(1, matchesPerRound))));
  delete s.fixtures;
  delete s.fixtureIndex;
  s.version = 2;
  if (!s.acquisitionOffers?.length) {
    const acq = generateAcquisitionSlots(mulberry32(seed + 888), s.acquisitionNextUid || 0);
    s.acquisitionOffers = acq.slots;
    s.acquisitionNextUid = acq.nextUid;
  }
  if (s.cupEliminated === undefined) {
    s.cupEliminated = false;
    s.cupRound = 0;
    s.cupWins = 0;
  }
  for (const sp of s.sponsors || []) {
    if (sp.tierId === undefined && sp.label) {
      const t = SPONSOR_TIERS.find((x) => x.label === sp.label);
      sp.tierId = t?.id || 'local';
    }
  }
  if (!Array.isArray(s.freeAgentList)) s.freeAgentList = [];
  if (!Array.isArray(s.loanList)) s.loanList = [];
  const scout = s.staff?.head_scout?.hired ? s.staff.head_scout.quality : 0;
  if (s.freeAgentList.length === 0 && s.loanList.length === 0) {
    buildTransferMarkets(s, scout);
  }
  if (
    s.table?.length &&
    s.table.some((t) => !t.isPlayer && (!t.squad || t.squad.length < 11))
  ) {
    const li = s.leagueIndex ?? 5;
    s.table = attachSquadsToTable(s.table, li, s.seed + (s.season || 1) * 3);
  }
  s.squad?.forEach(ensurePlayerStats);
}

function migrateToV3(s) {
  const rlen = s.leagueRounds?.length || 0;
  const schedOk = Array.isArray(s.fixtureSchedule) && s.fixtureSchedule.length === rlen && rlen > 0;
  if ((s.version || 0) >= 3 && s.cups?.fa && schedOk) return;
  s.seasonStartYear = s.seasonStartYear ?? 2024 + (s.season || 1);
  s.cups = s.cups?.fa ? s.cups : initCupSeason(s.leagueIndex ?? 5);
  if (s.cupEliminated !== undefined) {
    if (s.cupEliminated) {
      s.cups.fa = { active: true, done: true, roundsWon: s.cupWins ?? s.cups.fa.roundsWon ?? 0 };
    }
    delete s.cupEliminated;
    delete s.cupRound;
    delete s.cupWins;
  }
  s.advisories = Array.isArray(s.advisories) ? s.advisories : [];
  s.advisoryId = s.advisoryId ?? 0;
  if (rlen) {
    s.fixtureSchedule = buildFixtureSchedule(s, ENGLISH_PYRAMID[s.leagueIndex ?? 5].name);
  } else {
    s.fixtureSchedule = [];
  }
  s.version = 3;
  s.squad?.forEach(ensurePlayerStats);
}

function migrateToV4FromState(s) {
  migrateToV4(s);
  if (!s.sponsorOffers?.length) s.sponsorOffers = buildSponsorOffers(s);
}

function migrateToV5(s) {
  const classicIds = new Set(SPONSOR_TIERS.map((t) => t.id));
  s.classicSponsorRenewSeason =
    s.classicSponsorRenewSeason && typeof s.classicSponsorRenewSeason === 'object' && !Array.isArray(s.classicSponsorRenewSeason)
      ? { ...s.classicSponsorRenewSeason }
      : {};
  for (const tid of s.claimedSponsorTiers || []) {
    if (classicIds.has(tid) && s.classicSponsorRenewSeason[tid] === undefined) {
      s.classicSponsorRenewSeason[tid] = s.season;
    }
  }
  delete s.claimedSponsorTiers;
  s.negotiatedBrandsThisSeason = Array.isArray(s.negotiatedBrandsThisSeason) ? [...s.negotiatedBrandsThisSeason] : [];
  s.sponsors = (s.sponsors || []).filter((sp) => {
    if (sp.tierId === 'negotiated') return false;
    if (classicIds.has(sp.tierId)) {
      if (s.classicSponsorRenewSeason[sp.tierId] === undefined) s.classicSponsorRenewSeason[sp.tierId] = s.season;
      return false;
    }
    return true;
  });
  const validPh = ['competitive', 'off_season', 'pre_season'];
  s.seasonPhase = validPh.includes(s.seasonPhase) ? s.seasonPhase : 'competitive';
  s.phaseWeeksLeft = Math.max(0, s.phaseWeeksLeft ?? 0);
  if (s.seasonPhase !== 'competitive' && s.phaseWeeksLeft <= 0) {
    s.seasonPhase = 'competitive';
    s.phaseWeeksLeft = 0;
  }
  if (Array.isArray(s.sponsorOffers) && s.sponsorOffers.some((o) => o.oneOffPayment == null)) {
    s.sponsorOffers = buildSponsorOffers(s);
  }
  if (s.lastMatchReport === undefined) s.lastMatchReport = null;
  s.version = 5;
}

function migrateToV6(s) {
  s.playerBuyOffers = Array.isArray(s.playerBuyOffers) ? s.playerBuyOffers : [];
  s.lastWeekPL = s.lastWeekPL ?? null;
  s.seasonFinance = s.seasonFinance || {
    transferFeesPaid: 0,
    transferIncome: 0,
    stadiumSpend: 0,
    sponsorLumps: 0,
  };
  const y = (x) => (typeof x === 'number' && !Number.isNaN(x) ? x : 0);
  s.seasonFinance.transferFeesPaid = y(s.seasonFinance.transferFeesPaid);
  s.seasonFinance.transferIncome = y(s.seasonFinance.transferIncome);
  s.seasonFinance.stadiumSpend = y(s.seasonFinance.stadiumSpend);
  s.seasonFinance.sponsorLumps = y(s.seasonFinance.sponsorLumps);
  const se = s.season ?? 1;
  for (const p of s.squad || []) {
    if (p.onLoan) continue;
    if (p.contractEndSeason == null) {
      p.contractEndSeason = se + 1;
      p.contractYearsSigned = p.contractYearsSigned ?? 2;
    }
  }
  s.version = 6;
}

function migrateToV7(s) {
  const upgrading = (s.version || 0) < 7;
  const calm = s.seasonPhase === 'off_season' || s.seasonPhase === 'pre_season';
  const ln = ENGLISH_PYRAMID[s.leagueIndex ?? 5]?.name || 'League';
  if (s.identityChangeDeadlineWeek == null) {
    s.identityChangeDeadlineWeek = calm ? s.week + 999 : s.week + 2;
  }
  if (upgrading && !calm && s.leagueRounds?.length) {
    s.scheduleSteps = buildScheduleSteps(s, ln);
    s.fixtureSchedule = s.scheduleSteps;
    s.scheduleStepIndex = computeScheduleStepIndex(s, ln);
  } else if (upgrading) {
    s.scheduleSteps = Array.isArray(s.scheduleSteps) ? s.scheduleSteps : [];
    s.scheduleStepIndex = s.scheduleStepIndex ?? 0;
  }
  s.version = 7;
}

function migrateToV8(s) {
  if (s.stadiumName == null || String(s.stadiumName).trim() === '') s.stadiumName = 'Community Ground';
  if (!s.clubColorPrimary || !/^#[0-9A-Fa-f]{6}$/.test(s.clubColorPrimary)) s.clubColorPrimary = '#4ae8a5';
  if (!s.clubColorSecondary || !/^#[0-9A-Fa-f]{6}$/.test(s.clubColorSecondary)) s.clubColorSecondary = '#2d9d6a';
  if (s.onboardingComplete === undefined) s.onboardingComplete = true;
  s.version = 8;
}

function migrateToV9(s) {
  if (!CLUB_BADGE_IDS.includes(s.clubBadgeId)) s.clubBadgeId = 'classic';
  s.version = 9;
}

/**
 * v10: wages, fees and sponsorship are anchored on the per-league economy table, and
 * onboarding now selects from raster badge + kit galleries instead of colour pickers.
 * Recompute every existing wage/fee against the player's current division so old saves
 * don't lose money but stop showing outdated values.
 */
function migrateToV10(s) {
  if ((s.version || 0) >= 10) return;
  const econ = getLeagueEconomy(s.leagueIndex ?? 5);
  const rng = mulberry32((s.seed || 1) + 10_777);

  for (const p of s.squad || []) {
    if (typeof p.ovr === 'number') {
      p.wage = wageForOvr(p.ovr, econ, rng);
      p.askingFee = feeForPlayer(p.wage, p.ovr, p.age ?? 24, econ, rng);
    }
  }

  if (Array.isArray(s.transferList)) {
    for (const p of s.transferList) {
      if (typeof p.ovr === 'number') {
        p.wage = wageForOvr(p.ovr, econ, rng);
        p.askingFee = feeForPlayer(p.wage, p.ovr, p.age ?? 24, econ, rng);
      }
    }
  }
  if (Array.isArray(s.freeAgentList)) {
    for (const p of s.freeAgentList) {
      if (typeof p.ovr === 'number') {
        p.wage = wageForOvr(p.ovr, econ, rng);
        p.askingFee = 0;
      }
    }
  }
  if (Array.isArray(s.loanList)) {
    for (const p of s.loanList) {
      if (typeof p.ovr === 'number') {
        p.wage = wageForOvr(p.ovr, econ, rng);
        const notional = Math.floor(p.wage * 50);
        p.askingFee = Math.max(500, Math.floor(notional * 0.06));
      }
    }
  }

  for (const t of s.table || []) {
    for (const p of t.squad || []) {
      if (typeof p.ovr === 'number') {
        p.wage = wageForOvr(p.ovr, econ, rng);
        p.askingFee = feeForPlayer(p.wage, p.ovr, p.age ?? 24, econ, rng);
      }
    }
  }

  if (s.staff) {
    for (const role of STAFF_ROLES) {
      const cur = s.staff[role.id];
      if (cur?.hired) {
        cur.wage = staffWeeklyWage(role, cur.quality || 1, s.leagueIndex);
      }
    }
  }

  /** Map legacy procedural badge ids onto the new gallery ids */
  const legacyBadgeMap = {
    classic: 'crowned-lion',
    shield: 'crowned-shield',
    roundel: 'roundel-star',
    stripes: 'royal-stripes-badge',
    monogram: 'monogram-rose',
    wings: 'eagle-wings',
  };
  if (legacyBadgeMap[s.clubBadgeId]) s.clubBadgeId = legacyBadgeMap[s.clubBadgeId];
  if (!s.clubKitId) s.clubKitId = 'royal-stripes';
  s.version = 10;
}

/**
 * v11 — staff economy rebalance: realistic NL N/S anchors and a wider per-tier spread,
 * so a non-league manager costs ~£500/wk and a Premier League manager ~£100–200k/wk.
 * Recompute wages on hired staff so old saves pick up the new tariffs immediately.
 */
function migrateToV11(s) {
  if ((s.version || 0) >= 11) return;
  if (s.staff) {
    for (const role of STAFF_ROLES) {
      const cur = s.staff[role.id];
      if (cur?.hired) {
        cur.wage = staffWeeklyWage(role, cur.quality || 1, s.leagueIndex);
      }
    }
  }
  s.version = 11;
}

function estimateOpponentVenueCapacity(team, leagueIndex) {
  const li = leagueIndex ?? 5;
  const tier = Math.max(0, ENGLISH_PYRAMID.length - 1 - li);
  const str = team?.squadStrength ?? 54;
  return Math.min(76_000, Math.round(2600 + tier * 2400 + str * 34));
}

function computeGateAttendanceFigures(state, homeTeam, awayTeam, rng) {
  const li = state.leagueIndex ?? 5;
  const stadiumRaw = Number(state.stadiumCapacity);
  const stadiumSafe = Number.isFinite(stadiumRaw) && stadiumRaw >= 250 ? Math.floor(stadiumRaw) : 2800;

  let cap = homeTeam.isPlayer ? stadiumSafe : estimateOpponentVenueCapacity(homeTeam, li);
  let capNum = Number(cap);
  if (!Number.isFinite(capNum) || capNum < 500) capNum = Math.max(stadiumSafe, 7500);

  const fanStored = Number(state.fanBase);
  const fallbackFan = Math.round(capNum * 3.25);
  const fanBaseHome = Number.isFinite(fanStored) && fanStored >= 400 ? Math.floor(fanStored) : fallbackFan;

  let fanBase = homeTeam.isPlayer ? fanBaseHome : Math.round(capNum * 0.74);

  let hype = (() => {
    const opp = awayTeam;
    const oppStrength = opp.isPlayer
      ? state.squad.reduce((s, p) => s + p.ovr, 0) / Math.max(1, state.squad.length)
      : opp.squadStrength ?? 54;
    const oppStrengthNorm = Math.max(0, Math.min(1.22, (oppStrength - 40) / 36));
    const form = Math.max(-5, Math.min(5, homeTeam.form ?? 0));
    return oppStrengthNorm * 460 + form * 260;
  })();

  let randomness = rng() * 2000 - 1000;

  /** Pre-season friendlies — smaller turnout than league. */
  if (homeTeam.__friendlyHost) {
    fanBase = Math.round(fanBase * 0.42);
    hype *= 0.38;
    randomness *= 0.55;
  }

  let attendance = Math.min(Math.max(0, Math.floor(fanBase + hype + randomness)), capNum);
  if (!Number.isFinite(attendance)) attendance = Math.min(capNum, Math.round(capNum * 0.72));

  const fillRatio = capNum > 0 ? attendance / capNum : 0;
  const stadiumHint =
    homeTeam.isPlayer && fillRatio > 0.94 && !homeTeam.__friendlyHost
      ? 'Stadium nearly full — consider expanding when finances allow.'
      : '';
  const friendlyCrowdNote = homeTeam.__friendlyHost ? 'scaled for friendly' : '';

  const attendanceLine = `${attendance.toLocaleString()} / ${capNum.toLocaleString()}`;
  return {
    attendance,
    stadiumCapacity: capNum,
    stadiumHint,
    show: true,
    friendlyCrowdNote,
    attendanceLine,
  };
}

/** Minimal home/away records for attendance math during friendlies — `home` must be literal host club. */
function friendlyHostGuestTeams(state, playerIsHome, oppStrengthRounded) {
  const pr = state.table?.find((t) => t.isPlayer);
  if (!pr) return null;
  const opp = {
    isPlayer: false,
    squadStrength: oppStrengthRounded,
    form: 0,
    __friendlyOpp: true,
  };
  const hostGhost = playerIsHome
    ? { ...pr, __friendlyHost: true }
    : { ...opp, __friendlyHost: true };
  const guestGhost = playerIsHome ? opp : pr;
  return { home: hostGhost, away: guestGhost };
}
function migratePlayerPositionsGranular(p, rng) {
  if (!p || !p.pos) return;
  p.pos = migrateLegacyPosition(p.pos, rng);
}

function migrateToV13(s) {
  if ((s.version || 0) >= 13) return;
  const sc = Number(s.stadiumCapacity);
  if (!Number.isFinite(sc) || sc < 250) s.stadiumCapacity = 2800;
  const fb = Number(s.fanBase);
  if (!Number.isFinite(fb) || fb < 400) {
    const cap = Math.max(500, s.stadiumCapacity || 2800);
    s.fanBase = Math.min(65_000, Math.round(cap * 3.5 + (s.reputation || 12) * 420));
  }
  s.version = 13;
}

function migrateToV12(s) {
  if ((s.version || 0) >= 12) return;
  const rng = mulberry32((s.seed || 1) + 120_012);
  if (s.fanBase == null || s.fanBase < 100) {
    const cap = s.stadiumCapacity || 2800;
    s.fanBase = Math.min(65_000, Math.round(cap * 3.5 + (s.reputation || 12) * 420));
  }
  for (const p of s.squad || []) migratePlayerPositionsGranular(p, rng);
  for (const p of s.transferList || []) migratePlayerPositionsGranular(p, rng);
  for (const p of s.freeAgentList || []) migratePlayerPositionsGranular(p, rng);
  for (const p of s.loanList || []) migratePlayerPositionsGranular(p, rng);
  for (const t of s.table || []) {
    for (const p of t.squad || []) migratePlayerPositionsGranular(p, rng);
  }
  s.version = 12;
}

export class Game {
  constructor() {
    this.state = defaultState();
    this.listeners = [];
    this._ensureLeagueSchedule();
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  _emit() {
    this.listeners.forEach((f) => f(this.state));
  }

  get league() {
    return ENGLISH_PYRAMID[this.state.leagueIndex];
  }

  playerRow() {
    return this.state.table.find((t) => t.isPlayer);
  }

  _ensureLeagueSchedule() {
    const s = this.state;
    const calm = s.seasonPhase === 'off_season' || s.seasonPhase === 'pre_season';
    if (!calm && !s.leagueRounds?.length && s.table?.length) {
      const teamIds = s.table.map((t) => t.id);
      const pid = s.table.find((t) => t.isPlayer)?.id ?? null;
      s.leagueRounds = buildDoubleRoundRobinRounds(teamIds, s.seed + s.leagueIndex * 999, pid);
      s.leagueRoundIndex = 0;
    }
    const rlen = s.leagueRounds?.length || 0;
    if (!calm && rlen) {
      const nm = ENGLISH_PYRAMID[s.leagueIndex ?? 5].name;
      const expected = buildScheduleSteps(s, nm).length;
      if (!Array.isArray(s.scheduleSteps) || s.scheduleSteps.length !== expected) {
        s.scheduleSteps = buildScheduleSteps(s, nm);
        s.fixtureSchedule = s.scheduleSteps;
      }
    }
    if (!calm && !s.cups?.fa) s.cups = initCupSeason(s.leagueIndex ?? 5);
  }

  _buildFixturesIfNeeded() {
    const s = this.state;
    const teamIds = s.table.map((t) => t.id);
    const pid = s.table.find((t) => t.isPlayer)?.id ?? null;
    s.leagueRounds = buildDoubleRoundRobinRounds(teamIds, s.seed + s.season * 11 + s.leagueIndex * 999, pid);
    s.leagueRoundIndex = 0;
    s.scheduleStepIndex = 0;
    s.seasonStartYear = 2024 + s.season;
    s.cups = initCupSeason(s.leagueIndex);
    const nm = ENGLISH_PYRAMID[s.leagueIndex].name;
    s.scheduleSteps = buildScheduleSteps(s, nm);
    s.fixtureSchedule = s.scheduleSteps;
  }

  leagueRoundTotal() {
    return this.state.leagueRounds?.length ?? 0;
  }

  weeklyPlayerWages() {
    const mult = this.state.tempWageMult ?? 1;
    return Math.round(this.state.squad.reduce((a, p) => a + p.wage, 0) * mult);
  }

  weeklyStaffWages() {
    let staff = 0;
    for (const role of STAFF_ROLES) {
      const st = this.state.staff[role.id];
      if (st.hired) staff += st.wage;
    }
    return Math.round(staff);
  }

  weeklyWageBill() {
    return this.weeklyPlayerWages() + this.weeklyStaffWages();
  }

  stadiumUpkeepWeekly() {
    const cap = this.state.stadiumCapacity || 0;
    return Math.round(950 + cap * 0.062);
  }

  sponsorIncomeThisWeek() {
    return this.state.sponsors.reduce((acc, sp) => {
      const w = sp.weekly || 0;
      const mult = sp.penaltyWeeks > 0 ? sp.weeklyMult ?? 1 : 1;
      return acc + w * mult;
    }, 0);
  }

  hasActiveSponsorTier(tierId) {
    const s = this.state;
    const renewAt = s.classicSponsorRenewSeason?.[tierId];
    if (renewAt != null && s.season < renewAt) return true;
    return s.sponsors.some((sp) => sp.tierId === tierId && sp.weeksLeft > 0);
  }

  /** Seasons remaining until this classic tier can be signed again (0 = available now). */
  classicSponsorSeasonsUntilRenewal(tierId) {
    const s = this.state;
    const renewAt = s.classicSponsorRenewSeason?.[tierId];
    if (renewAt == null || s.season >= renewAt) return 0;
    return renewAt - s.season;
  }

  commercialBonus() {
    const c = this.state.staff.commercial;
    if (!c.hired) return 1;
    return 1 + c.quality * 0.04;
  }

  managerBonus() {
    const m = this.state.staff.manager;
    if (!m.hired) return 0;
    return m.quality * 1.2;
  }

  scoutTierBonus() {
    const sc = this.state.staff.head_scout;
    if (!sc.hired) return 0;
    return sc.quality;
  }

  simulateMatch(homeId, awayId) {
    const rng = mulberry32(this.state.seed + this.state.week * 1_000_003 + this.state.leagueRoundIndex * 17 + homeId.charCodeAt(2));
    const table = this.state.table;
    const home = table.find((t) => t.id === homeId);
    const away = table.find((t) => t.id === awayId);
    if (!home || !away) return { hGoals: 0, aGoals: 0 };

    const playerSquadAvg =
      this.state.squad.reduce((s, p) => s + p.ovr, 0) / Math.max(1, this.state.squad.length);

    const hStr = home.isPlayer ? playerSquadAvg + this.managerBonus() : home.squadStrength;
    const aStr = away.isPlayer ? playerSquadAvg + this.managerBonus() : away.squadStrength;

    const homeAtkSquad = home.isPlayer ? this.state.squad : home.squad;
    const homeDefSquad = homeAtkSquad;
    const awayAtkSquad = away.isPlayer ? this.state.squad : away.squad;
    const awayDefSquad = awayAtkSquad;

    let { attack: hAt } = squadAttackDefence(homeAtkSquad, hStr);
    let { defence: hDef } = squadAttackDefence(homeDefSquad, hStr);
    let { attack: aAt } = squadAttackDefence(awayAtkSquad, aStr);
    let { defence: aDef } = squadAttackDefence(awayDefSquad, aStr);

    const matchBoost = computePlayerMatchBoost(this.state);
    if (home.isPlayer) {
      hAt += this.managerBonus() * 0.34 + matchBoost * 0.36;
      hDef += this.managerBonus() * 0.2 + matchBoost * 0.14;
    }
    if (away.isPlayer) {
      aAt += this.managerBonus() * 0.3 + matchBoost * 0.24;
      aDef += this.managerBonus() * 0.18 + matchBoost * 0.09;
    }

    const homeBonus = 0.006;
    let hGoals = simulateSideGoals(hAt, aDef, rng, { homeBonus });
    let aGoals = simulateSideGoals(aAt, hDef, rng, { homeBonus: 0 });

    const injN = this.state.squad.filter((p) => p.personality === 'injury_prone').length;
    if (home.isPlayer && rng() < Math.min(0.1, 0.025 + injN * 0.02)) hGoals = Math.max(0, hGoals - 1);
    if (away.isPlayer && rng() < Math.min(0.1, 0.025 + injN * 0.02)) aGoals = Math.max(0, aGoals - 1);

    const update = (team, gf, ga) => {
      team.played += 1;
      team.goalsFor += gf;
      team.goalsAgainst += ga;
      if (gf > ga) {
        team.won += 1;
        team.points += 3;
        team.form = Math.min(5, team.form + 1);
      } else if (gf === ga) {
        team.drawn += 1;
        team.points += 1;
      } else {
        team.lost += 1;
        team.form = Math.max(-5, team.form - 1);
      }
    };

    update(home, hGoals, aGoals);
    update(away, aGoals, hGoals);

    const homeSquad = home.isPlayer ? this.state.squad : home.squad;
    const awaySquad = away.isPlayer ? this.state.squad : away.squad;
    const emptyRet = { starters: [], bench: [], goalAssignments: [] };
    const homeRet = recordSquadMatchStats(homeSquad, hGoals, aGoals, rng, 'league') || emptyRet;
    const awayRet = recordSquadMatchStats(awaySquad, aGoals, hGoals, rng, 'league') || emptyRet;

    if (home.isPlayer || away.isPlayer) {
      const repRng = mulberry32(
        this.state.seed + this.state.week * 1_000_003 + this.state.leagueRoundIndex * 17 + homeId.charCodeAt(2) + 90210
      );
      const attRng = mulberry32(
        this.state.seed + this.state.week * 1_000_003 + this.state.leagueRoundIndex * 17 + homeId.charCodeAt(2) + 45111
      );
      const attendanceMeta = computeGateAttendanceFigures(this.state, home, away, attRng);
      this.state.lastMatchReport = buildLeagueMatchReport(
        this.state,
        home,
        away,
        hGoals,
        aGoals,
        homeRet,
        awayRet,
        repRng,
        attendanceMeta
      );
    }
    return { hGoals, aGoals };
  }

  dismissLastMatchReport() {
    this.state.lastMatchReport = null;
    this._emit();
    this.save();
  }

  matchdayRevenue(mult = 1) {
    const row = this.playerRow();
    const cap = this.state.stadiumCapacity;
    const atm = (this.state.atmosphere ?? 55) / 100;
    const fanMood = (this.state.board?.fans ?? 60) / 100;
    const ticketF = ticketPriceFactor(this.state.ticketPrice);
    const fill = Math.min(
      1,
      0.28 +
        (row ? (row.points / Math.max(1, row.played * 3)) * 0.38 : 0.28) +
        this.state.reputation * 0.007 +
        atm * 0.22 +
        fanMood * 0.12
    );
    const priceDrag = ticketF;
    const attendance = Math.floor(cap * fill * priceDrag * this.commercialBonus() * mult);
    return Math.floor(attendance * this.state.ticketPrice * 0.62);
  }

  _playScheduledCups(slot) {
    const s = this.state;
    if (!slot?.cups?.length) return;
    for (const c of slot.cups) {
      if (c.type === 'friendly') {
        this._playFriendlyMatch(c.label, slot.calendarLabel);
        continue;
      }
      const key = c.type === 'fa' ? 'fa' : c.type === 'trophy' ? 'trophy' : c.type === 'vase' ? 'vase' : null;
      if (!key) continue;
      const st = s.cups[key];
      if (!st || st.done || !st.active) continue;
      this._runCupTie(key, c, slot.calendarLabel);
    }
  }

  _cupPrizeBase(key, roundIndex) {
    const m = key === 'fa' ? 1.4 : key === 'trophy' ? 0.55 : 0.35;
    return Math.floor((8000 + roundIndex * 9000) * m * 0.55);
  }

  _runCupTie(key, cupMeta, calLabel) {
    const s = this.state;
    const st = s.cups[key];
    const rng = mulberry32(
      s.seed + s.week * 50_003 + key.charCodeAt(0) * 97 + st.roundsWon * 13 + (cupMeta.roundIndex || 0) * 7
    );
    const li = s.leagueIndex;
    let oppLeagueIndex = li;
    if (key === 'fa') {
      const drop = li <= 0 ? 0 : 1 + Math.floor(rng() * Math.min(4, li + 1));
      oppLeagueIndex = Math.max(0, li - drop);
    } else if (key === 'trophy') {
      oppLeagueIndex = Math.max(4, li - Math.floor(rng() * 2));
    } else {
      oppLeagueIndex = Math.min(6, li + Math.floor(rng() * 2));
    }
    const oppName = randomClubName(rng);
    const oppLeagueName = ENGLISH_PYRAMID[oppLeagueIndex].name;
    const tierGap = Math.max(0, li - oppLeagueIndex);
    const roundBoost = (cupMeta.roundIndex || 0) * 0.9;
    const oppStrength =
      42 + (ENGLISH_PYRAMID.length - 1 - oppLeagueIndex) * 4.8 + rng() * 15 + roundBoost;

    const playerSquadAvg = s.squad.reduce((x, p) => x + p.ovr, 0) / Math.max(1, s.squad.length);
    const pStr = playerSquadAvg + this.managerBonus() + rng() * 4;
    const pGoals = simulateSideGoals(pStr * 0.58, oppStrength * 0.535, rng, { homeBonus: 0.005 });
    const oGoals = simulateSideGoals(oppStrength * 0.56, pStr * 0.528, rng, { homeBonus: 0 });

    s.cash += Math.floor(this.matchdayRevenue(0.88));
    const label = cupMeta.label || `${key} tie`;
    const isFinal = /Final/i.test(label) && !/Semi/i.test(label);

    const finishWin = (viaPens) => {
      st.roundsWon += 1;
      const basePrize = this._cupPrizeBase(key, cupMeta.roundIndex || 0) + tierGap * 11_000 + Math.floor(rng() * 14_000);
      const tvSlice = Math.floor((4200 + tierGap * 9_000 + rng() * 8_000) * (key === 'fa' ? 1.2 : 0.75));
      s.cash += basePrize + tvSlice;
      s.reputation = Math.min(100, s.reputation + 1 + Math.min(2, Math.floor(tierGap / 2)));
      const res = viaPens
        ? `drew ${pGoals}-${oGoals} vs ${oppName} (${oppLeagueName}), won on penalties`
        : `beat ${oppName} (${oppLeagueName}) ${pGoals}-${oGoals}`;
      s.history.unshift({
        week: s.week,
        type: 'cup',
        text: `${label} (${calLabel}): ${res}. Prize & TV ~£${(basePrize + tvSlice).toLocaleString()}.`,
      });
      if (isFinal) {
        const bonus = key === 'fa' ? 165_000 + Math.floor(rng() * 120_000) : 58_000 + Math.floor(rng() * 35_000);
        s.cash += bonus;
        s.history.unshift({
          week: s.week,
          type: 'cup',
          text: `Won ${label}! Bonus £${bonus.toLocaleString()}.`,
        });
        st.done = true;
      }
    };

    const finishLoss = (extra) => {
      st.done = true;
      s.history.unshift({
        week: s.week,
        type: 'cup',
        text: `${label} (${calLabel}): out vs ${oppName} (${oppLeagueName}) ${pGoals}-${oGoals}${extra ? ` — ${extra}` : ''}.`,
      });
    };

    if (pGoals > oGoals) {
      finishWin(false);
    } else if (pGoals === oGoals) {
      const win = rng() > 0.46;
      if (win) finishWin(true);
      else finishLoss('lost on penalties');
    } else {
      finishLoss('');
    }

    const rngCup = mulberry32(s.seed + s.week * 60_001 + st.roundsWon + (cupMeta.roundIndex || 0));
    recordSquadMatchStats(s.squad, pGoals, oGoals, rngCup, 'cup');
  }

  _playFriendlyMatch(label, calLabel) {
    const s = this.state;
    const rng = mulberry32(s.seed + s.week * 72_001);
    const oppName = randomClubName(rng);
    const oppStrength = 36 + rng() * 22;
    const playerSquadAvg = s.squad.reduce((x, p) => x + p.ovr, 0) / Math.max(1, s.squad.length);
    const pStr = playerSquadAvg + this.managerBonus() * 0.6 + rng() * 3;
    const pGoals = simulateSideGoals(pStr * 0.56, oppStrength * 0.528, rng, { homeBonus: 0 });
    const oGoals = simulateSideGoals(oppStrength * 0.55, pStr * 0.52, rng, { homeBonus: 0 });
    s.cash += Math.floor(this.matchdayRevenue(0.12));
    recordSquadMatchStats(s.squad, pGoals, oGoals, rng, 'friendly');
    s.history.unshift({
      week: s.week,
      type: 'friendly',
      text: `${label} (${calLabel}): ${oppName} — ${pGoals}-${oGoals}.`,
    });
  }

  /** Weekly pre-season advance: simulate a friendly and attach a full Match centre report (not league). */
  _simulatePreSeasonFriendlyAndReport() {
    const s = this.state;
    const rng = mulberry32(s.seed + s.week * 72_001);
    const oppName = randomClubName(rng);
    const oppStrength = 36 + rng() * 22;
    const playerSquadAvg = s.squad.reduce((x, p) => x + p.ovr, 0) / Math.max(1, s.squad.length);
    const pStr = playerSquadAvg + this.managerBonus() * 0.6 + rng() * 3;
    const pGoals = simulateSideGoals(pStr * 0.56, oppStrength * 0.528, rng, { homeBonus: 0 });
    const oGoals = simulateSideGoals(oppStrength * 0.55, pStr * 0.52, rng, { homeBonus: 0 });
    const rngLine = mulberry32(s.seed + s.week * 72_003);
    const oppStarters = makeGuestLineup(rngLine);
    const oppBench = makeGuestLineup(mulberry32(s.seed + s.week * 72_004)).slice(0, 9);
    const playerRet = recordSquadMatchStats(s.squad, pGoals, oGoals, rng, 'friendly');
    const playerIsHome = rng() < 0.52;
    const weekNum = PRE_SEASON_WEEKS - (s.phaseWeeksLeft ?? 0);
    const oppStrengthRounded = Math.round(oppStrength);
    const pairing = friendlyHostGuestTeams(s, playerIsHome, oppStrengthRounded);
    const attRng = mulberry32(s.seed + s.week * 72_097);
    const attendanceMeta = pairing
      ? computeGateAttendanceFigures(s, pairing.home, pairing.away, attRng)
      : { attendance: null, stadiumCapacity: null, stadiumHint: '', show: false, attendanceLine: '', friendlyCrowdNote: '' };
    const rngFeed = mulberry32(s.seed + s.week * 72_099);
    const row = this.playerRow();
    const yn = row?.name || s.clubName;
    s.lastMatchReport = buildPreSeasonFriendlyReport(
      s,
      weekNum,
      playerRet,
      oppName,
      oppStarters,
      oppBench,
      pGoals,
      oGoals,
      playerIsHome,
      rngFeed,
      attendanceMeta
    );
    const scoreTxt = playerIsHome ? `${yn} ${pGoals}-${oGoals} ${oppName}` : `${oppName} ${oGoals}-${pGoals} ${yn}`;
    s.history.unshift({
      week: s.week,
      type: 'friendly',
      text: `Pre-season friendly (${weekNum}/${PRE_SEASON_WEEKS}): ${scoreTxt}.`,
    });
  }

  _stadiumEventIncome() {
    const s = this.state;
    const cap = s.stadiumCapacity;
    const rate = 1.8 + Math.random() * 4.4;
    const gross = Math.floor(rate * cap + 600 + Math.random() * 5_000);
    return Math.floor(gross * this.commercialBonus());
  }

  advanceWeek() {
    const s = this.state;
    s.week += 1;
    const openingCash = s.cash;

    const phase = s.seasonPhase || 'competitive';
    const li = ENGLISH_PYRAMID[s.leagueIndex];

    const expenses = [];
    const income = [];
    const plNotes = [];

    const pw = this.weeklyPlayerWages();
    const sw = this.weeklyStaffWages();
    const upkeep = this.stadiumUpkeepWeekly();
    s.cash -= pw + sw + upkeep;
    expenses.push({ label: 'Squad wages', amount: pw });
    expenses.push({ label: 'Staff wages', amount: sw });
    expenses.push({ label: 'Stadium upkeep (grounds, utilities, maintenance)', amount: upkeep });

    const spBase = this.sponsorIncomeThisWeek();
    const comm = this.commercialBonus();
    const sp = Math.floor(spBase * comm);
    s.cash += sp;
    if (sp) income.push({ label: 'Sponsor income (negotiated deals × commercial)', amount: sp });
    if (spBase && comm !== 1) plNotes.push(`Commercial director uplift ×${comm.toFixed(2)} on sponsor cash.`);

    let tvMult = 0.52;
    if (phase === 'off_season') tvMult = 0.11;
    else if (phase === 'pre_season') tvMult = 0.28;
    const tv = Math.floor(li.tvBonusPerWeek * tvMult);
    s.cash += tv;
    income.push({
      label: `League TV distribution (${phase === 'competitive' ? 'in-season' : phase === 'off_season' ? 'off-season' : 'pre-season'} share)`,
      amount: tv,
    });

    const portInc = this.tickOwnedClubs();
    if (portInc) income.push({ label: 'Multi-club portfolio (satellite / franchise dividends)', amount: portInc });

    if (s.debt > 0) {
      const interest = Math.ceil(s.debt * (s.loanRateWeekly || 0.0035));
      s.cash -= interest;
      expenses.push({ label: 'Debt interest', amount: interest });
    }

    const rounds = s.leagueRounds || [];

    if (phase === 'competitive') {
      const nm = li.name;
      let sched = s.scheduleSteps || [];
      if (rounds.length && !sched.length) {
        s.scheduleSteps = buildScheduleSteps(s, nm);
        s.fixtureSchedule = s.scheduleSteps;
        sched = s.scheduleSteps;
      }

      if (sched.length && s.scheduleStepIndex < sched.length) {
        const step = sched[s.scheduleStepIndex];
        s.scheduleStepIndex += 1;

        if (step.kind === 'league') {
          const wi = step.roundIndex;
          const round = rounds[wi];
          s.lastMatchReport = null;
          this._sortTable();
          const standingsSnap = [...s.table].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.goalsFor - a.goalsAgainst - (a.goalsFor - a.goalsAgainst);
          });
          const row = this.playerRow();
          for (const f of round) {
            const res = this.simulateMatch(f.home, f.away);
            if (row && res && (f.home === row.id || f.away === row.id)) {
              const ph = f.home === row.id;
              const gf = ph ? res.hGoals : res.aGoals;
              const ga = ph ? res.aGoals : res.hGoals;
              const oppId = ph ? f.away : f.home;
              const oppRank = standingsSnap.findIndex((t) => t.id === oppId) + 1;
              const won = gf > ga;
              const lost = gf < ga;
              tickBoardPressures(s, {
                fans: won ? 4 : lost ? -5 : 0,
                investors: 0,
                media: won ? 2 : lost ? -2 : 1,
              });
              if (s.clubIdentity === 'underdog' && oppRank <= 3 && oppRank > 0 && won) {
                tickBoardPressures(s, { fans: 3, media: 2 });
              }
              recordMatchLog(s, {
                week: s.week,
                gf,
                ga,
                oppRank: oppRank > 0 ? oppRank : 5,
              });
              s.lastLeagueResult = { gf, ga, oppId };
            }
          }
          let leagueGate = 0;
          if (row) {
            const m = round.find((f) => f.home === row.id || f.away === row.id);
            if (m) {
              const atHome = m.home === row.id;
              const gateMult = atHome ? 1 : 0.36;
              leagueGate = Math.floor(this.matchdayRevenue(gateMult));
              s.cash += leagueGate;
            }
          }
          if (leagueGate) income.push({ label: 'League matchday (tickets & match revenue)', amount: leagueGate });
          s.leagueRoundIndex = wi + 1;
        } else if (step.kind === 'cups_only') {
          const cashBeforeCups = s.cash;
          this._playScheduledCups({ cups: step.cups, calendarLabel: step.calendarLabel });
          const cupNet = s.cash - cashBeforeCups;
          if (cupNet) income.push({ label: 'Cups & friendlies (gates, prize money, TV)', amount: cupNet });
        }
      }

      if (sched.length && s.scheduleStepIndex >= sched.length && rounds.length > 0) {
        this._endSeason();
      }
    } else {
      if (phase === 'off_season') {
        s.lastMatchReport = null;
      }
      s.phaseWeeksLeft = Math.max(0, (s.phaseWeeksLeft || 0) - 1);
      let preGate = 0;
      if (phase === 'pre_season') {
        preGate = Math.floor(this.matchdayRevenue(0.06));
        s.cash += preGate;
        if (preGate) income.push({ label: 'Pre-season (gates & low-intensity friendlies)', amount: preGate });
        this._simulatePreSeasonFriendlyAndReport();
      }
      if (s.phaseWeeksLeft <= 0) {
        if (phase === 'off_season') {
          s.seasonPhase = 'pre_season';
          s.phaseWeeksLeft = PRE_SEASON_WEEKS;
          s.history.unshift({
            week: s.week,
            type: 'season',
            text: `Pre-season begins (${PRE_SEASON_WEEKS} weeks) — friendlies and fitness work before the league campaign.`,
          });
        } else if (phase === 'pre_season') {
          this._kickOffCompetitiveSeason();
        }
      }
    }

    const competitiveNow = (s.seasonPhase || 'competitive') === 'competitive';

    s.sponsorOffers = buildSponsorOffers(s);

    tickBoardPressures(s, {
      investors: s.cash > 500_000 ? 1 : s.cash < 80_000 ? -4 : 0,
      fans: s.ticketPrice > 55 ? -1 : 0,
      media: 0,
    });

    s.atmosphere = resolveAtmosphere(s);

    if (competitiveNow) {
      const spMsgs = checkSponsorContracts(s);
      for (const t of spMsgs) {
        s.history.unshift({ week: s.week, type: 'sponsor', text: t });
      }
    }

    const evRng = mulberry32(s.seed + s.week * 91);
    const ev = maybeRandomEvent(s, evRng);
    if (ev) {
      s.pendingEvents = s.pendingEvents || [];
      s.pendingEvents.push(ev);
    }

    if ((s.identityDrift || 0) > 10) {
      tickBoardPressures(s, { fans: -8, media: -4 });
      s.history.unshift({
        week: s.week,
        type: 'identity',
        text: 'Supporters protest — the club has drifted from its stated identity.',
      });
      s.identityDrift = 0;
    }

    if (s.tempWageMult > 1) {
      s.tempWageMult = 1;
    }

    s.sponsors = s.sponsors
      .map((sp) => ({
        ...sp,
        weeksLeft: sp.weeksLeft - 1,
        penaltyWeeks: sp.penaltyWeeks > 0 ? sp.penaltyWeeks - 1 : 0,
      }))
      .filter((sp) => sp.weeksLeft > 0);

    if (s.board.fans < 22 || s.board.investors < 22) {
      const force = [...s.squad].filter((p) => !p.onLoan).sort((a, b) => b.wage - a.wage)[0];
      if (force && s.squad.length > 16 && s.cash < 120_000) {
        s.history.unshift({
          week: s.week,
          type: 'board',
          text: `Investors demand action — high earners like ${force.name} are flagged until finances stabilise.`,
        });
      }
    }

    if (competitiveNow && s.week - s.lastEventWeek >= 6 && Math.random() < 0.35) {
      s.lastEventWeek = s.week;
      const payout = this._stadiumEventIncome();
      s.cash += payout;
      if (payout) income.push({ label: 'Non-matchday stadium use (events, conferences, concerts)', amount: payout });
      s.history.unshift({
        week: s.week,
        type: 'event',
        text: `Non-matchday event at ${s.stadiumName || 'the stadium'} (capacity ${s.stadiumCapacity.toLocaleString()}) — +£${payout.toLocaleString()}.`,
      });
    }

    if (s.cash < -500_000) {
      s.history.unshift({ week: s.week, type: 'crisis', text: 'Financial crisis — board injected a small loan to keep the lights on.' });
      s.cash += 200_000;
      s.debt += 200_000;
      income.push({ label: 'Emergency board injection (loan)', amount: 200_000 });
      plNotes.push('Crisis liquidity added — £200k cash, debt increased by £200k.');
    }

    const closingCash = s.cash;
    const sumIn = income.reduce((a, x) => a + x.amount, 0);
    const sumOut = expenses.reduce((a, x) => a + x.amount, 0);
    s.lastWeekPL = {
      week: s.week,
      season: s.season,
      phase,
      openingCash,
      closingCash,
      net: closingCash - openingCash,
      income,
      expenses,
      sumIn,
      sumOut,
      notes: plNotes,
    };

    this._generateStaffAdvisories();
    this._maybeIncomingBuyOffers();

    this._emit();
    this.save();
  }

  _sortTable() {
    this.state.table.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.goalsFor - a.goalsFor;
    });
  }

  _endSeason() {
    const s = this.state;
    this._sortTable();
    const row = this.playerRow();
    const idx = s.table.findIndex((t) => t.isPlayer);
    const place = idx + 1;
    const n = s.table.length;
    s.seasonPlace = place;
    const leagueNameFinished = ENGLISH_PYRAMID[s.leagueIndex].name;
    const seasonClosing = s.season;

    s.squad = s.squad.filter((p) => !(p.onLoan && p.loanEndsSeason === seasonClosing));

    let promoted = false;
    let relegated = false;
    let repDelta = 0;

    const playOffLeagues = s.leagueIndex === 1 || s.leagueIndex === 4;
    let promotionViaPlayOff = false;
    if (place === 3 && playOffLeagues && s.leagueIndex > 0) {
      const rngP = mulberry32(s.seed + seasonClosing * 12_011 + s.leagueIndex);
      const pWin = s.leagueIndex === 1 ? 0.3 : 0.24;
      if (rngP() < pWin) {
        promotionViaPlayOff = true;
        s.leagueIndex -= 1;
        promoted = true;
        repDelta = 7;
        s.history.unshift({
          week: s.week,
          type: 'promo',
          text: `Promotion play-offs won — up to the ${ENGLISH_PYRAMID[s.leagueIndex].name}.`,
        });
      }
    }

    if (!promoted && place <= 2 && s.leagueIndex > 0) {
      s.leagueIndex -= 1;
      promoted = true;
      repDelta = 8;
    } else if (!promoted && place >= n - 1 && s.leagueIndex < ENGLISH_PYRAMID.length - 1) {
      s.leagueIndex += 1;
      relegated = true;
      repDelta = -6;
    } else if (!promoted) {
      repDelta = place <= 4 ? 3 : place >= n - 2 ? -2 : 1;
    }

    s.reputation = Math.max(0, Math.min(100, s.reputation + repDelta));

    s.season += 1;
    s.seasonFinance = {
      transferFeesPaid: 0,
      transferIncome: 0,
      stadiumSpend: 0,
      sponsorLumps: 0,
    };

    const newLeagueName = ENGLISH_PYRAMID[s.leagueIndex].name;
    let fate = '';
    if (promoted) fate = ` Promoted to ${newLeagueName}.`;
    else if (relegated) fate = ` Relegated to ${newLeagueName}.`;
    else fate = ` Staying in ${newLeagueName} — league table refreshed with new opponents.`;

    s.history.unshift({
      week: s.week,
      type: 'season',
      text: `Season ${seasonClosing} finished — ${place}${this._ordinal(place)} in ${leagueNameFinished}.${fate}`,
    });

    if (promoted && !promotionViaPlayOff) {
      s.history.unshift({
        week: s.week,
        type: 'promo',
        text: `Board confirms promotion: welcome to the ${newLeagueName}.`,
      });
    }
    if (relegated) {
      s.history.unshift({
        week: s.week,
        type: 'relegation',
        text: `Relegation confirmed — the fight continues in the ${newLeagueName}.`,
      });
    }

    if (s.leagueIndex === 0 && place <= 3) {
      s.franchiseUnlocked = true;
      s.history.unshift({
        week: s.week,
        type: 'unlock',
        text: 'Global franchise opportunities unlocked — you can invest in clubs abroad.',
      });
    }

    const inv = s.youthAcademy?.seasonInvest ?? 0;
    const rngY = mulberry32(s.seed + seasonClosing * 888);
    const { players, golden } = runYouthIntake(rngY, s.leagueIndex, inv);
    for (const p of players) {
      ensurePlayerStats(p);
      p.contractYearsSigned = 3;
      p.contractEndSeason = s.season + 2;
      if (s.squad.length < 28) s.squad.push(p);
    }
    if (players.length) {
      s.history.unshift({
        week: s.week,
        type: 'youth',
        text: golden
          ? 'Golden generation — exceptional academy graduates join the first-team picture.'
          : `${players.length} academy graduate(s) step up (season investment £${inv.toLocaleString()}).`,
      });
    }
    s.youthAcademy = { seasonInvest: 0 };

    const rngDev = mulberry32(s.seed + seasonClosing * 333);
    const mgr = s.staff?.manager;
    if (mgr?.hired && mgr.traits?.includes('develops_youth')) {
      for (const p of s.squad) {
        if (p.age <= 21 && rngDev() < 0.42) p.ovr = Math.min(88, p.ovr + 1);
      }
    }

    this._refreshTransferMarket();

    const prevC = s.cups || {};
    s.cups = {
      fa: { active: false, done: true, roundsWon: prevC.fa?.roundsWon ?? 0 },
      trophy: { active: false, done: true, roundsWon: prevC.trophy?.roundsWon ?? 0 },
      vase: { active: false, done: true, roundsWon: prevC.vase?.roundsWon ?? 0 },
    };

    s.leagueRounds = [];
    s.fixtureSchedule = [];
    s.scheduleSteps = [];
    s.scheduleStepIndex = 0;
    s.leagueRoundIndex = 0;
    s.seasonPhase = 'off_season';
    s.phaseWeeksLeft = OFF_SEASON_WEEKS;
    s.lastMatchReport = null;
    s.history.unshift({
      week: s.week,
      type: 'season',
      text: `Summer break (${OFF_SEASON_WEEKS}w), then pre-season (${PRE_SEASON_WEEKS}w) — the league returns after that.`,
    });
  }

  _kickOffCompetitiveSeason() {
    const s = this.state;
    const tableSeed = s.seed + s.season * 7919 + s.leagueIndex * 97;
    const newTable = makeLeagueTeams(s.leagueIndex, s.clubName, tableSeed);
    s.table = attachSquadsToTable(newTable, s.leagueIndex, tableSeed);
    s.worldSeason = -1;
    s.seasonPhase = 'competitive';
    s.phaseWeeksLeft = 0;
    s.negotiatedBrandsThisSeason = [];
    this._buildFixturesIfNeeded();
    s.identityChangeDeadlineWeek = s.week + 3;
    s.history.unshift({
      week: s.week,
      type: 'season',
      text: `League fixtures begin — ${ENGLISH_PYRAMID[s.leagueIndex].name} matchweek 1.`,
    });
  }

  _ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  _refreshTransferMarket() {
    buildTransferMarkets(this.state, this.scoutTierBonus());
  }

  hireStaff(roleId, quality) {
    const def = STAFF_ROLES.find((r) => r.id === roleId);
    if (!def) return false;
    if (quality < 1 || quality > def.qualityCap) return false;
    const li = this.state.leagueIndex;
    const hireCost = getStaffHireCost(roleId, quality, li);
    if (this.state.cash < hireCost) return false;
    this.state.cash -= hireCost;
    const wage = staffWeeklyWage(def, quality, li);
    const nameRng = mulberry32(
      this.state.seed +
        roleId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
        quality * 997 +
        (this.state.week || 1)
    );
    const hired = {
      hired: true,
      name: randomStaffName(nameRng),
      quality,
      wage,
    };
    if (roleId === 'manager') {
      hired.traits = rollManagerTraits(mulberry32(this.state.seed + quality * 41 + 22));
    }
    this.state.staff[roleId] = hired;
    this._emit();
    this.save();
    return true;
  }

  fireStaff(roleId) {
    if (!this.state.staff[roleId]?.hired) return;
    this.state.staff[roleId] = { hired: false, name: '', quality: 0, wage: 0 };
    this._emit();
    this.save();
  }

  _generateStaffAdvisories() {
    const s = this.state;
    if (!Array.isArray(s.advisories)) s.advisories = [];
    if (s.advisoryId === undefined) s.advisoryId = 0;
    const rng = mulberry32(s.seed + s.week * 4001 + (s.leagueRoundIndex || 0) * 53);

    const push = (item) => {
      if (s.advisories.length >= 8) return;
      if (s.advisories.some((a) => a.id === item.id)) return;
      s.advisories.push(item);
    };

    if (s.staff.dof.hired && rng() < 0.18) {
      const groupsNeeded = ['DEF', 'MID', 'FWD', 'GK', 'DEF', 'MID'];
      const grp = groupsNeeded[Math.floor(rng() * groupsNeeded.length)];
      const posNeed = suggestRandomPosition(grp, rng);
      const nm = s.staff.dof.name;
      push({
        id: `adv-${++s.advisoryId}`,
        roleKey: 'dof',
        staffName: nm,
        headline: 'Squad balance',
        body: `${nm} (director of football): we're short at ${posNeed}. Prioritise loans or permanent deals before fixtures bunch up.`,
        actions: [
          { id: 'pulse_market', label: 'Refresh scouting lists' },
          { id: 'dismiss', label: 'Noted, thanks' },
        ],
      });
    }

    if (s.staff.dof.hired && !s.staff.head_scout.hired && rng() < 0.14) {
      const nm = s.staff.dof.name;
      push({
        id: `adv-${++s.advisoryId}`,
        roleKey: 'dof',
        staffName: nm,
        headline: 'Backroom',
        body: `${nm} suggests appointing a head of recruitment to widen non-league and loan scouting.`,
        actions: [{ id: 'dismiss', label: 'Understood' }],
      });
    }

    if (s.staff.head_scout.hired && rng() < 0.2 && s.transferList?.length) {
      const p = s.transferList[Math.floor(rng() * s.transferList.length)];
      const nm = s.staff.head_scout.name;
      push({
        id: `adv-${++s.advisoryId}`,
        roleKey: 'head_scout',
        staffName: nm,
        headline: 'Recruitment',
        body: `${nm} flags ${p.name} (${p.pos}, age ${p.age ?? '—'}, OVR ${p.ovr}) as a strong fit on current wages — open negotiations below when ready.`,
        suggestedPlayerId: p.id,
        suggestedListKey: 'transferList',
        actions: [
          { id: 'pulse_market', label: 'Regenerate transfer market' },
          { id: 'dismiss', label: "We'll review internally" },
        ],
      });
    }

    if (s.staff.commercial.hired && rng() < 0.16) {
      const ideas = [
        { line: 'A mid-season hospitality bundle could lift matchday margins with little capex.', bonus: 4500 },
        { line: 'Digital programme inventory is cheap locally — short trial with two vendors.', bonus: 3200 },
        { line: 'Community sponsor wall by the main stand photographs well for regional press.', bonus: 2800 },
      ];
      const idea = ideas[Math.floor(rng() * ideas.length)];
      const nm = s.staff.commercial.name;
      push({
        id: `adv-${++s.advisoryId}`,
        roleKey: 'commercial',
        staffName: nm,
        headline: 'Commercial',
        body: `${nm}: ${idea.line}`,
        bonusCash: idea.bonus,
        actions: [
          { id: 'commercial_take', label: `Pilot (+£${idea.bonus.toLocaleString()} one-off)` },
          { id: 'dismiss', label: 'Park for now' },
        ],
      });
    }
  }

  dismissAdvisory(advisoryId) {
    this.state.advisories = (this.state.advisories || []).filter((a) => a.id !== advisoryId);
    this._emit();
    this.save();
  }

  applyAdvisoryChoice(advisoryId, actionId) {
    const s = this.state;
    const a = (s.advisories || []).find((x) => x.id === advisoryId);
    if (!a) return;
    if (actionId === 'pulse_market') {
      this._refreshTransferMarket();
      s.history.unshift({
        week: s.week,
        type: 'staff',
        text: `${a.staffName}'s note acted on — transfer lists refreshed.`,
      });
    } else if (actionId === 'commercial_take' && a.bonusCash) {
      s.cash += a.bonusCash;
      s.history.unshift({
        week: s.week,
        type: 'staff',
        text: `${a.staffName}'s pilot landed — +£${a.bonusCash.toLocaleString()} one-off.`,
      });
    }
    s.advisories = s.advisories.filter((x) => x.id !== advisoryId);
    this._emit();
    this.save();
  }

  getAnalyticsInsights() {
    return computeAnalyticsInsights(this.state);
  }

  runAnalyticsAction(actionId) {
    if (actionId === 'refresh_lists') {
      this._refreshTransferMarket();
      this.state.history.unshift({
        week: this.state.week,
        type: 'analytics',
        text: 'Analytics follow-up: transfer lists refreshed.',
      });
    } else if (actionId === 'staff_advice' || actionId === 'staff_pulse') {
      this._generateStaffAdvisories();
    }
    this._emit();
    this.save();
  }

  signNegotiatedSponsor(offerId) {
    const s = this.state;
    const idx = s.sponsorOffers.findIndex((x) => x.id === offerId);
    if (idx < 0) return false;
    const o = s.sponsorOffers[idx];
    if (s.reputation < o.minRep) return false;
    s.negotiatedBrandsThisSeason = s.negotiatedBrandsThisSeason || [];
    if (s.negotiatedBrandsThisSeason.includes(o.brand)) return false;
    const pay = Math.round(
      o.oneOffPayment ?? o.signingBonus ?? (o.weekly && o.maxWeeks ? o.weekly * Math.min(o.maxWeeks, 40) * 0.04 : 0)
    );
    if (pay <= 0) return false;
    s.cash += pay;
    s.seasonFinance = s.seasonFinance || {};
    s.seasonFinance.sponsorLumps = (s.seasonFinance.sponsorLumps || 0) + pay;
    s.negotiatedBrandsThisSeason.push(o.brand);
    const leagueName = o.leagueName || ENGLISH_PYRAMID[s.leagueIndex]?.name || '';
    s.history.unshift({
      week: s.week,
      type: 'sponsor',
      text: `${o.brand}: one-off partnership +£${pay.toLocaleString()} (${leagueName}).${o.risk === 'risky' ? ' Brand expects visibility if results dip.' : ''}`,
    });
    s.sponsorOffers.splice(idx, 1);
    this._emit();
    this.save();
    return true;
  }

  canSetClubIdentity() {
    const s = this.state;
    if ((s.seasonPhase || '') !== 'competitive') return false;
    const w = s.identityChangeDeadlineWeek;
    if (w == null) return true;
    return s.week < w;
  }

  setClubIdentity(identityId) {
    if (!this.canSetClubIdentity()) return false;
    const def = CLUB_IDENTITIES.find((x) => x.id === identityId);
    if (!def) return false;
    this.state.clubIdentity = identityId;
    this.state.identityDrift = 0;
    this.state.history.unshift({
      week: this.state.week,
      type: 'identity',
      text: `Board records club identity: ${def.label}.`,
    });
    this._emit();
    this.save();
    return true;
  }

  setClubBranding({ clubName, stadiumName, clubColorPrimary, clubColorSecondary, clubBadgeId, clubKitId } = {}) {
    const s = this.state;
    const trim = (x, max) => String(x ?? '').trim().slice(0, max);
    const hexOk = (c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.trim());
    if (clubName != null && trim(clubName, 44)) {
      s.clubName = trim(clubName, 44);
      const row = s.table?.find((t) => t.isPlayer);
      if (row) row.name = s.clubName;
    }
    if (stadiumName != null && trim(stadiumName, 44)) s.stadiumName = trim(stadiumName, 44);
    if (clubColorPrimary != null && hexOk(clubColorPrimary)) s.clubColorPrimary = clubColorPrimary.trim();
    if (clubColorSecondary != null && hexOk(clubColorSecondary)) s.clubColorSecondary = clubColorSecondary.trim();
    if (clubBadgeId != null && CLUB_BADGE_IDS.includes(clubBadgeId)) s.clubBadgeId = clubBadgeId;
    if (clubKitId != null && typeof clubKitId === 'string') s.clubKitId = clubKitId;
    this._emit();
    this.save();
    return true;
  }

  completeOnboarding({ clubName, stadiumName, clubColorPrimary, clubColorSecondary, clubBadgeId, clubKitId }) {
    this.setClubBranding({ clubName, stadiumName, clubColorPrimary, clubColorSecondary, clubBadgeId, clubKitId });
    this.state.onboardingComplete = true;
    this.state.history.unshift({
      week: this.state.week,
      type: 'season',
      text: `Welcome to ${this.state.clubName} — your tenure at ${this.state.stadiumName} begins.`,
    });
    this._emit();
    this.save();
    return true;
  }

  investYouthAcademy(amount) {
    const s = this.state;
    if (amount < 25_000 || s.cash < amount) return false;
    s.cash -= amount;
    s.youthAcademy = s.youthAcademy || { seasonInvest: 0 };
    s.youthAcademy.seasonInvest = (s.youthAcademy.seasonInvest || 0) + amount;
    s.history.unshift({
      week: s.week,
      type: 'youth',
      text: `Academy investment +£${amount.toLocaleString()} — better graduates at season end.`,
    });
    this._emit();
    this.save();
    return true;
  }

  takeEmergencyLoan(amount) {
    const s = this.state;
    if (amount < 100_000) return false;
    s.cash += amount;
    s.debt += Math.round(amount * 1.07);
    tickBoardPressures(s, { investors: -4, media: -2 });
    s.history.unshift({
      week: s.week,
      type: 'finance',
      text: `Emergency credit: +£${amount.toLocaleString()} (debt +7% premium).`,
    });
    this._emit();
    this.save();
    return true;
  }

  sellStadiumNamingRights() {
    const s = this.state;
    s.financialExtras = s.financialExtras || { namingRightsSold: false };
    if (s.financialExtras.namingRightsSold) return false;
    s.cash += 750_000;
    s.financialExtras.namingRightsSold = true;
    tickBoardPressures(s, { investors: 8, fans: -5, media: 3 });
    s.history.unshift({
      week: s.week,
      type: 'finance',
      text: 'Stadium naming rights sold — cash in, mixed fan reaction.',
    });
    this._emit();
    this.save();
    return true;
  }

  resolvePendingEvent(eventId, choiceId) {
    const s = this.state;
    const ev = s.pendingEvents?.find((e) => e.id === eventId);
    if (!ev) return false;
    const ch = ev.choices?.find((c) => c.id === choiceId);
    if (!ch) return false;

    if (ev.type === 'star_exit') {
      const star = [...s.squad].sort((a, b) => b.ovr - a.ovr)[0];
      if (choiceId === 'promise') {
        s.tempWageMult = 1.08;
        s.history.unshift({
          week: s.week,
          type: 'event',
          text: `Investment promised to keep ${star?.name || 'key players'} committed — wage surge next week.`,
        });
      } else if (choiceId === 'fine') {
        if (star) star.morale = Math.max(25, (star.morale ?? 75) - 15);
        tickBoardPressures(s, { fans: -5, media: 3 });
      } else {
        tickBoardPressures(s, { media: -5 });
      }
    } else if (ev.type === 'sponsor_shock') {
      if (choiceId === 'pr') {
        const cost = ch.cost ?? 25_000;
        if (s.cash < cost) return false;
        s.cash -= cost;
        tickBoardPressures(s, { media: ch.media ?? 6 });
      } else if (choiceId === 'cut' && s.sponsors.length) {
        const sp = s.sponsors[0];
        sp.penaltyWeeks = ch.weeks || 8;
        sp.weeklyMult = ch.weeklyMult ?? 0.85;
        s.history.unshift({ week: s.week, type: 'sponsor', text: `${sp.label} agreed temporary reduced terms.` });
      }
    } else if (ev.type === 'stadium_damage') {
      if (choiceId === 'pay') {
        const cost = ch.cost;
        if (cost == null || s.cash < cost) return false;
        s.cash -= cost;
      } else {
        tickBoardPressures(s, { fans: ch.fans ?? -6 });
        s.atmosphere = Math.max(12, (s.atmosphere ?? 55) - 8);
      }
    } else if (ev.type === 'hijack') {
      tickBoardPressures(s, { media: choiceId === 'deny' ? 3 : -2 });
      s.transferNoise = (s.transferNoise || 0) + 1;
    }

    s.pendingEvents = s.pendingEvents.filter((e) => e.id !== eventId);
    this._emit();
    this.save();
    return true;
  }

  signPlayer(playerId, contractYears = 2) {
    return this._signFromList('transferList', playerId, contractYears);
  }

  signFreeAgent(playerId, contractYears = 2) {
    return this._signFromList('freeAgentList', playerId, contractYears);
  }

  signLoanPlayer(playerId) {
    return this._signFromList('loanList', playerId, 1);
  }

  _signFromList(listKey, playerId, contractYears = 2) {
    const s = this.state;
    const list = s[listKey];
    if (!Array.isArray(list)) return false;
    const p = list.find((x) => x.id === playerId);
    if (!p || s.squad.length >= 28) return false;
    const fee = p.askingFee || 0;
    if (s.cash < fee) return false;
    s.cash -= fee;
    s.seasonFinance = s.seasonFinance || {};
    s.seasonFinance.transferFeesPaid = (s.seasonFinance.transferFeesPaid || 0) + fee;
    const signed = {
      ...p,
      id: `s-${p.id}-${listKey}-${Date.now()}`,
    };
    delete signed.listingType;
    if (listKey === 'loanList') {
      signed.onLoan = true;
      signed.loanEndsSeason = s.season;
      delete signed.contractEndSeason;
      delete signed.contractYearsSigned;
    } else {
      const yrs = Math.max(1, Math.min(5, Math.floor(contractYears) || 2));
      signed.contractYearsSigned = yrs;
      signed.contractEndSeason = s.season + yrs - 1;
      delete signed.onLoan;
      delete signed.loanEndsSeason;
    }
    ensurePlayerStats(signed);
    s.squad.push(signed);
    s[listKey] = list.filter((x) => x.id !== playerId);
    applyIdentityAfterSigning(s, fee, signed.age || 24);
    s.transferNoise = (s.transferNoise || 0) + 1;
    tickBoardPressures(s, { media: 2 });
    this._emit();
    this.save();
    return true;
  }

  acceptPlayerBuyOffer(offerId) {
    const s = this.state;
    const offers = s.playerBuyOffers || [];
    const o = offers.find((x) => x.id === offerId);
    if (!o || (o.expiresWeek ?? 0) <= s.week) return false;
    const idx = s.squad.findIndex((p) => p.id === o.playerId);
    if (idx < 0 || s.squad.length <= 16) return false;
    s.cash += o.fee;
    s.seasonFinance = s.seasonFinance || {};
    s.seasonFinance.transferIncome = (s.seasonFinance.transferIncome || 0) + o.fee;
    s.squad.splice(idx, 1);
    s.playerBuyOffers = offers.filter((x) => x.id !== offerId);
    s.history.unshift({
      week: s.week,
      type: 'transfer',
      text: `Accepted ${o.fromClub}'s bid for ${o.playerName} — +£${o.fee.toLocaleString()}.`,
    });
    tickBoardPressures(s, { media: 1, fans: -1 });
    this._emit();
    this.save();
    return true;
  }

  rejectPlayerBuyOffer(offerId) {
    const s = this.state;
    const offers = s.playerBuyOffers || [];
    const o = offers.find((x) => x.id === offerId);
    if (!o) return false;
    s.playerBuyOffers = offers.filter((x) => x.id !== offerId);
    s.history.unshift({
      week: s.week,
      type: 'transfer',
      text: `Declined ${o.fromClub}'s approach for ${o.playerName}.`,
    });
    this._emit();
    this.save();
    return true;
  }

  signPlayerFromAdvisory(advisoryId, contractYears = 2) {
    const s = this.state;
    const a = (s.advisories || []).find((x) => x.id === advisoryId);
    if (!a?.suggestedPlayerId || a.suggestedListKey !== 'transferList') return { ok: false, message: 'No player linked to this briefing.' };
    const p = s.transferList?.find((x) => x.id === a.suggestedPlayerId);
    if (!p) return { ok: false, message: 'That player is no longer on the market — try refreshing lists.' };
    const ok = this._signFromList('transferList', a.suggestedPlayerId, contractYears);
    if (!ok) return { ok: false, message: 'Signing failed (squad cap or insufficient funds).' };
    s.advisories = s.advisories.filter((x) => x.id !== advisoryId);
    s.history.unshift({
      week: s.week,
      type: 'staff',
      text: `${p.name} signed — deal completed from the recruitment briefing.`,
    });
    this._emit();
    this.save();
    return { ok: true, message: `Signed ${p.name}.` };
  }

  releasePlayer(playerId) {
    const i = this.state.squad.findIndex((p) => p.id === playerId);
    if (i < 0 || this.state.squad.length <= 16) return false;
    this.state.squad.splice(i, 1);
    this._emit();
    this.save();
    return true;
  }

  ensureWorldPyramid() {
    const s = this.state;
    s.worldLeagues = s.worldLeagues || {};
    let count = 0;
    for (let L = 0; L < ENGLISH_PYRAMID.length; L++) {
      if (L === s.leagueIndex) continue;
      const key = String(L);
      const tbl = s.worldLeagues[key] ?? s.worldLeagues[L];
      if (Array.isArray(tbl) && tbl.length >= 8) count++;
    }
    const need = s.worldSeason !== s.season || count < ENGLISH_PYRAMID.length - 1;
    if (!need) return;
    for (let L = 0; L < ENGLISH_PYRAMID.length; L++) {
      if (L === s.leagueIndex) continue;
      const rng = mulberry32(s.seed + s.season * 401 + L * 503);
      const filler = randomClubName(rng);
      const table = makeLeagueTeams(L, filler, s.seed + s.season * 31 + L * 91).map((t) => ({
        ...t,
        isPlayer: false,
      }));
      s.worldLeagues[String(L)] = attachSquadsToTable(table, L, s.seed + s.season * 77 + L);
    }
    s.worldSeason = s.season;
  }

  getScoutTable(leagueIdx) {
    if (leagueIdx === this.state.leagueIndex) return this.state.table;
    this.ensureWorldPyramid();
    const w = this.state.worldLeagues;
    const k = String(leagueIdx);
    return w[k] || w[leagueIdx] || [];
  }

  findScoutTeam(leagueIdx, teamId) {
    return this.getScoutTable(leagueIdx).find((t) => t.id === teamId) || null;
  }

  negotiateClubTransfer(leagueIdx, teamId, playerId) {
    const team = this.findScoutTeam(leagueIdx, teamId);
    if (!team) return { ok: false, message: 'Club not found.' };
    if (team.isPlayer) return { ok: false, message: 'Your own squad is listed under Squad, not here.' };
    const p = team.squad?.find((x) => x.id === playerId);
    if (!p) return { ok: false, message: 'Player not found.' };
    if ((team.squad?.length || 0) <= 16) {
      return { ok: false, message: 'The club will not go below a minimum squad size.' };
    }

    const ev = evaluateTransferApproach({
      buyerLeagueIndex: this.state.leagueIndex,
      sellerLeagueIndex: leagueIdx,
      playerOvr: p.ovr,
      reputation: this.state.reputation,
    });
    if (!ev.willing) return { ok: false, message: ev.reason };

    const fee = Math.round(p.askingFee * ev.feeMultiplier);
    const wage = Math.round(p.wage * ev.wageMultiplier);
    return {
      ok: true,
      message: ev.summary,
      fee,
      wage,
      playerName: p.name,
      clubName: team.name,
    };
  }

  completeClubTransfer(leagueIdx, teamId, playerId, contractYears = 2) {
    const n = this.negotiateClubTransfer(leagueIdx, teamId, playerId);
    if (!n.ok) return n;
    if (this.state.squad.length >= 28) return { ok: false, message: 'Your squad is full.' };
    if (this.state.cash < n.fee) return { ok: false, message: `You need ${n.fee.toLocaleString()} for the agreed fee.` };

    const team = this.findScoutTeam(leagueIdx, teamId);
    if (!team?.squad) return { ok: false, message: 'Club data is out of date — refresh the pyramid view.' };
    const idx = team.squad.findIndex((x) => x.id === playerId);
    if (idx < 0) return { ok: false, message: 'That player is no longer at the club.' };

    const p = team.squad[idx];
    const s = this.state;
    s.cash -= n.fee;
    s.seasonFinance = s.seasonFinance || {};
    s.seasonFinance.transferFeesPaid = (s.seasonFinance.transferFeesPaid || 0) + n.fee;
    team.squad.splice(idx, 1);

    const yrs = Math.max(1, Math.min(5, Math.floor(contractYears) || 2));
    const signed = {
      ...p,
      id: `s-${p.id}-from-${teamId}-${Date.now()}`,
      wage: n.wage,
      askingFee: n.fee,
      contractYearsSigned: yrs,
      contractEndSeason: s.season + yrs - 1,
    };
    delete signed.listingType;
    delete signed.onLoan;
    delete signed.loanEndsSeason;
    ensurePlayerStats(signed);
    s.squad.push(signed);
    applyIdentityAfterSigning(s, n.fee, signed.age || 24);
    s.transferNoise = (s.transferNoise || 0) + 1;
    tickBoardPressures(s, { media: 3 });
    s.history.unshift({
      week: s.week,
      type: 'transfer',
      text: `Signed ${signed.name} from ${team.name} (${ENGLISH_PYRAMID[leagueIdx].name}) for £${n.fee.toLocaleString()} (${yrs}-yr deal).`,
    });
    this._emit();
    this.save();
    return { ok: true, message: `Signed ${signed.name}.` };
  }

  expandStadium(extraSeats, cost) {
    if (this.state.cash < cost || extraSeats < 100) return false;
    this.state.cash -= cost;
    this.state.seasonFinance = this.state.seasonFinance || {};
    this.state.seasonFinance.stadiumSpend = (this.state.seasonFinance.stadiumSpend || 0) + cost;
    this.state.stadiumCapacity += extraSeats;
    this.state.fanBase = Math.min(130_000, Math.round((this.state.fanBase ?? 9600) + extraSeats * 0.88));
    this._emit();
    this.save();
    return true;
  }

  setTicketPrice(p) {
    if (p < 8 || p > 120) return;
    this.state.ticketPrice = Math.round(p);
    if (p > 62) tickBoardPressures(this.state, { fans: -2 });
    else if (p < 14) tickBoardPressures(this.state, { fans: 1 });
    this._emit();
    this.save();
  }

  signSponsor(tierId) {
    const t = SPONSOR_TIERS.find((x) => x.id === tierId);
    if (!t) return false;
    if (this.hasActiveSponsorTier(tierId)) return false;
    const s = this.state;
    const dur = Math.max(1, t.durationSeasons ?? 1);
    const payment = getSponsorTierPayment(tierId, s.leagueIndex);
    s.cash += payment;
    s.seasonFinance = s.seasonFinance || {};
    s.seasonFinance.sponsorLumps = (s.seasonFinance.sponsorLumps || 0) + payment;
    s.classicSponsorRenewSeason = s.classicSponsorRenewSeason || {};
    s.classicSponsorRenewSeason[tierId] = s.season + dur;
    s.history.unshift({
      week: s.week,
      type: 'sponsor',
      text: `${t.label}: +£${payment.toLocaleString()} one-off — deal runs ${dur} season${dur === 1 ? '' : 's'} (renew from season ${s.season + dur}).`,
    });
    this._emit();
    this.save();
    return true;
  }

  clubValuation() {
    const row = this.playerRow();
    const base = 2_500_000;
    const rep = this.state.reputation * 180_000;
    const cap = this.state.stadiumCapacity * 420;
    const leagueMul = (ENGLISH_PYRAMID.length - this.state.leagueIndex) * 900_000;
    const perf = row ? row.points * 25_000 : 0;
    return Math.floor(base + rep + cap + leagueMul + perf);
  }

  sellClub() {
    const v = this.clubValuation();
    this.state.cash += v;
    this.state.history.unshift({
      week: this.state.week,
      type: 'sale',
      text: `Sold ${this.state.clubName} for £${v.toLocaleString()}.`,
    });
    const seed = (this.state.seed + 1) % 1_000_000_000;
    const newName = randomClubName(mulberry32(seed + 17));
    this.state.seed = seed;
    this.state.clubName = newName;
    this.state.stadiumName = `${newName.split(/\s+/)[0] || 'Municipal'} Park`;
    this.state.clubBadgeId = 'crowned-lion';
    this.state.clubKitId = 'royal-stripes';
    this.state.clubColorPrimary = '#0d3b66';
    this.state.clubColorSecondary = '#f4d35e';
    this.state.leagueIndex = Math.min(ENGLISH_PYRAMID.length - 1, this.state.leagueIndex + 2);
    const newEcon = getLeagueEconomy(this.state.leagueIndex);
    this.state.cash = newEcon.startingCash;
    let nt = makeLeagueTeams(this.state.leagueIndex, newName, seed);
    this.state.table = attachSquadsToTable(nt, this.state.leagueIndex, seed);
    this.state.worldSeason = -1;
    const rngNew = mulberry32(seed);
    this.state.squad = Array.from({ length: 16 }, () => randomPlayer(rngNew, 0, newEcon));
    this.state.squad.forEach((pl) => {
      ensurePlayerStats(pl);
      pl.contractYearsSigned = 2;
      pl.contractEndSeason = this.state.season + 1;
    });
    this.state.seasonPhase = 'competitive';
    this.state.phaseWeeksLeft = 0;
    this.state.negotiatedBrandsThisSeason = [];
    this.state.classicSponsorRenewSeason = {};
    this.state.lastMatchReport = null;
    this.state.playerBuyOffers = [];
    this.state.lastWeekPL = null;
    this.state.seasonFinance = {
      transferFeesPaid: 0,
      transferIncome: 0,
      stadiumSpend: 0,
      sponsorLumps: 0,
    };
    this._refreshTransferMarket();
    this._buildFixturesIfNeeded();
    this.state.identityChangeDeadlineWeek = this.state.week + 3;
    this.state.onboardingComplete = false;
    this._emit();
    this.save();
  }

  _replaceAcquisitionSlot(uid) {
    const s = this.state;
    const rng = mulberry32(s.seed + s.acquisitionNextUid + 31);
    const idx = s.acquisitionOffers.findIndex((o) => o.uid === uid);
    if (idx < 0) return;
    s.acquisitionOffers[idx] = {
      uid: `acq-${s.acquisitionNextUid}`,
      name: randomClubName(rng),
      cost: 800_000 + Math.floor(rng() * 2_200_000),
    };
    s.acquisitionNextUid += 1;
  }

  buyOtherEnglishClub(uid) {
    const offer = this.state.acquisitionOffers.find((o) => o.uid === uid);
    if (!offer || this.state.cash < offer.cost) return false;
    this.state.cash -= offer.cost;
    this.state.ownedClubs.push({
      name: offer.name,
      weeklyIncome: Math.floor(offer.cost * 0.00009),
      league: ENGLISH_PYRAMID[Math.min(ENGLISH_PYRAMID.length - 1, this.state.leagueIndex + 1)].name,
    });
    this._replaceAcquisitionSlot(uid);
    this._emit();
    this.save();
    return true;
  }

  buyFranchise(regionId) {
    const region = FRANCHISE_REGIONS.find((r) => r.id === regionId);
    if (!region || !this.state.franchiseUnlocked) return false;
    if (this.state.cash < region.entryFee) return false;
    this.state.cash -= region.entryFee;
    const table = makeFranchiseLeague(region, this.state.clubName.split(' ')[0] || 'Chairman', this.state.seed);
    this.state.ownedClubs.push({
      name: table.find((t) => t.isPlayer)?.name || region.label,
      weeklyIncome: Math.floor(region.tvBonusPerWeek * 0.22),
      league: region.label,
      franchise: true,
    });
    this.state.history.unshift({
      week: this.state.week,
      type: 'franchise',
      text: `Acquired a franchise operation in ${region.label}.`,
    });
    this._emit();
    this.save();
    return true;
  }

  tickOwnedClubs() {
    const mult = 0.52;
    let inc = 0;
    for (const c of this.state.ownedClubs) {
      inc += Math.floor((c.weeklyIncome || 0) * mult);
    }
    this.state.cash += inc;
    return inc;
  }

  _maybeIncomingBuyOffers() {
    const s = this.state;
    s.playerBuyOffers = s.playerBuyOffers || [];
    s.playerBuyOffers = s.playerBuyOffers.filter((o) => (o.expiresWeek ?? 0) > s.week);
    const rng = mulberry32(s.seed + s.week * 31 + 902);
    if (s.squad.length < 5) return;
    if (rng() > 0.125) return;
    const pool = s.squad.filter((p) => !p.onLoan && (p.ovr ?? 0) >= 50);
    if (!pool.length) return;
    const p = pool[Math.floor(rng() * pool.length)];
    if (s.playerBuyOffers.some((o) => o.playerId === p.id)) return;
    /**
     * Bidder usually shops one tier up, so they value the player at the buyer's economy
     * (a star at NL North will fetch a League Two-sized bid). Mix wage × feeMultiplier
     * with ovr/goals modifiers to keep stars commanding a premium.
     */
    const buyerLi = Math.max(0, (s.leagueIndex ?? 5) - 1);
    const buyerEcon = getLeagueEconomy(buyerLi);
    const baseFee = feeForPlayer(p.wage, p.ovr, p.age, buyerEcon, rng);
    const formBoost = ((p.ovr - 50) * buyerEcon.feeMultiplier * 80 + (p.lGoals || 0) * buyerEcon.feeMultiplier * 60) * (0.82 + rng() * 0.32);
    const fee = Math.round(baseFee + Math.max(0, formBoost));
    const fromClub = randomClubName(rng);
    const feeClamped = Math.max(Math.round(buyerEcon.baseWeeklyWage * buyerEcon.feeMultiplier * 0.5), fee);
    s.playerBuyOffers.push({
      id: `bid-${s.week}-${p.id}`,
      playerId: p.id,
      playerName: p.name,
      fromClub,
      fee: feeClamped,
      expiresWeek: s.week + 4,
    });
    s.history.unshift({
      week: s.week,
      type: 'transfer',
      text: `${fromClub} made a formal bid for ${p.name} (~£${feeClamped.toLocaleString()}) — see Transfers.`,
    });
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (_) {}
    try {
      localStorage.removeItem('football-chairman-save-v1');
      localStorage.removeItem('football-chairman-save-v2');
    } catch (_) {}
  }

  load() {
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      if (!raw) raw = localStorage.getItem('football-chairman-save-v2');
      if (!raw) raw = localStorage.getItem('football-chairman-save-v1');
      if (raw) {
        this.state = JSON.parse(raw);
        if (!this.state.version || this.state.version < 2 || !this.state.leagueRounds?.length) {
          migrateToV2(this.state);
        }
        migrateToV3(this.state);
        migrateToV4FromState(this.state);
        migrateToV5(this.state);
        migrateToV6(this.state);
        migrateToV7(this.state);
        migrateToV8(this.state);
        migrateToV9(this.state);
        migrateToV10(this.state);
        migrateToV11(this.state);
        migrateToV12(this.state);
        migrateToV13(this.state);
        this._ensureLeagueSchedule();
        if (!this.state.acquisitionOffers?.length) {
          const acq = generateAcquisitionSlots(mulberry32(this.state.seed + 888), this.state.acquisitionNextUid || 0);
          this.state.acquisitionOffers = acq.slots;
          this.state.acquisitionNextUid = acq.nextUid;
        }
        if (!Array.isArray(this.state.freeAgentList) || !Array.isArray(this.state.loanList)) {
          if (!Array.isArray(this.state.freeAgentList)) this.state.freeAgentList = [];
          if (!Array.isArray(this.state.loanList)) this.state.loanList = [];
          this._refreshTransferMarket();
        }
        this.state.squad?.forEach(ensurePlayerStats);
        if (this.state.worldSeason === undefined) this.state.worldSeason = -1;
        if (!this.state.worldLeagues) this.state.worldLeagues = {};
        this._emit();
        return true;
      }
    } catch (_) {}
    return false;
  }

  reset() {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('football-chairman-save-v1');
    localStorage.removeItem('football-chairman-save-v2');
    this.state = defaultState();
    this._ensureLeagueSchedule();
    this._emit();
    this.save();
  }
}

export { STAFF_ROLES, SPONSOR_TIERS, CLUB_IDENTITIES, OFF_SEASON_WEEKS, PRE_SEASON_WEEKS };
