/**
 * Season calendar (August–May) and named cup rounds.
 * FA Cup entry/qualifying by tier; FA Trophy (National League system); FA Vase (steps 5–6).
 */

export function calendarWeekLabel(seasonStartYear, matchWeekIndex) {
  const d = new Date(seasonStartYear, 7, 3 + matchWeekIndex * 7);
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  return `${mon} ${d.getFullYear()}`;
}

export const FA_CUP_ROUNDS = [
  'FA Cup — Extra preliminary',
  'FA Cup — Preliminary',
  'FA Cup — First qualifying',
  'FA Cup — Second qualifying',
  'FA Cup — Third qualifying',
  'FA Cup — Fourth qualifying',
  'FA Cup — First round proper',
  'FA Cup — Second round proper',
  'FA Cup — Third round proper',
  'FA Cup — Fourth round',
  'FA Cup — Fifth round',
  'FA Cup — Quarter-final',
  'FA Cup — Semi-final',
  'FA Cup — Final',
];

/** Round index in FA_CUP_ROUNDS where club enters (0 = PL … 6 = NL South) */
export const FA_CUP_ENTRY_ROUND = [9, 8, 7, 6, 5, 2, 0];

/** First league week (0-based) with an FA tie for that tier */
export const FA_FIRST_WEEK = [14, 13, 12, 10, 8, 1, 0];

export const FA_TROPHY_ROUNDS = [
  'FA Trophy — First qualifying',
  'FA Trophy — Second qualifying',
  'FA Trophy — Third qualifying',
  'FA Trophy — First round',
  'FA Trophy — Second round',
  'FA Trophy — Third round',
  'FA Trophy — Quarter-final',
  'FA Trophy — Semi-final',
  'FA Trophy — Final',
];

export const FA_VASE_ROUNDS = [
  'FA Vase — First qualifying',
  'FA Vase — Second qualifying',
  'FA Vase — First round',
  'FA Vase — Second round',
  'FA Vase — Third round',
  'FA Vase — Fourth round',
  'FA Vase — Fifth round',
  'FA Vase — Quarter-final',
  'FA Vase — Semi-final',
  'FA Vase — Final',
];

/**
 * @param {object} state
 * @param {string} leagueName — division name for league fixtures
 */
export function buildFixtureSchedule(state, leagueName) {
  const rounds = state.leagueRounds || [];
  const you = state.table?.find((t) => t.isPlayer);
  const seasonYear = state.seasonStartYear ?? 2025;
  const li = Math.min(state.leagueIndex ?? 0, 6);

  const faFirst = FA_FIRST_WEEK[li];
  const faEntry = FA_CUP_ENTRY_ROUND[li];

  return rounds.map((round, wi) => {
    const cal = calendarWeekLabel(seasonYear, wi);
    let league = null;
    if (you) {
      const m = round.find((f) => f.home === you.id || f.away === you.id);
      if (m) {
        const home = m.home === you.id;
        const opp = state.table.find((t) => t.id === (home ? m.away : m.home));
        league = {
          home,
          opponentId: opp?.id,
          opponentName: opp?.name || 'TBC',
          competition: leagueName,
        };
      }
    }

    const cups = [];

    if (wi >= faFirst && (wi - faFirst) % 2 === 0) {
      const ri = faEntry + Math.floor((wi - faFirst) / 2);
      if (ri >= 0 && ri < FA_CUP_ROUNDS.length) {
        cups.push({ type: 'fa', roundIndex: ri, label: FA_CUP_ROUNDS[ri] });
      }
    }

    if (li >= 4 && li <= 6 && wi >= 3 && (wi - 3) % 3 === 0) {
      const tri = Math.min(FA_TROPHY_ROUNDS.length - 1, Math.floor((wi - 3) / 3));
      cups.push({ type: 'trophy', roundIndex: tri, label: FA_TROPHY_ROUNDS[tri] });
    }

    if (li >= 5 && wi >= 2 && (wi - 2) % 4 === 0) {
      const vi = Math.min(FA_VASE_ROUNDS.length - 1, Math.floor((wi - 2) / 4));
      cups.push({ type: 'vase', roundIndex: vi, label: FA_VASE_ROUNDS[vi] });
    }

    if (wi === 15) {
      cups.push({ type: 'friendly', roundIndex: 0, label: 'Friendly (benefit match)' });
    }

    return { weekIndex: wi, calendarLabel: cal, league, cups };
  });
}

/**
 * Flatten league + cup ties into separate calendar steps (like real England:
 * league matchday then midweek / dedicated cup window), so cups are not on the same advance as league.
 * @param {object} state
 * @param {string} leagueName
 * @returns {Array<{ kind: string, roundIndex?: number, calendarLabel: string, league?: object | null, cups?: array }>}
 */
export function buildScheduleSteps(state, leagueName) {
  const base = buildFixtureSchedule(state, leagueName);
  const sy = state.seasonStartYear ?? 2025;
  let calIdx = 0;
  const steps = [];
  for (let wi = 0; wi < base.length; wi++) {
    const b = base[wi];
    steps.push({
      kind: 'league',
      roundIndex: wi,
      weekIndex: wi,
      calendarLabel: calendarWeekLabel(sy, calIdx++),
      league: b.league,
      cups: [],
    });
    if (b.cups?.length) {
      steps.push({
        kind: 'cups_only',
        leagueRoundRef: wi,
        calendarLabel: `${calendarWeekLabel(sy, calIdx++)} · cup / secondary fixture`,
        cups: b.cups,
      });
    }
  }
  return steps;
}

/**
 * Next schedule step index to play, given league rounds already completed (leagueRoundIndex = completed count).
 */
export function computeScheduleStepIndex(state, leagueName) {
  const r = state.leagueRoundIndex ?? 0;
  const base = buildFixtureSchedule(state, leagueName || 'League');
  let idx = 0;
  for (let wi = 0; wi < r; wi++) {
    idx += 1;
    if (base[wi]?.cups?.length) idx += 1;
  }
  return idx;
}
