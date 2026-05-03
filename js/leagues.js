/**
 * English football pyramid — real competition tier names.
 * Club names are fictional procedurally to avoid implying official affiliation.
 */
/**
 * Per-league economy block — single source of truth for wages, fees, sponsorship and starting cash.
 * Anchored on real-world ranges (weekly £, one-off £). avgWeeklyWage is the squad mean target;
 * topWeeklyWage caps OVR ~85+ stars; baseWeeklyWage is the OVR ~50 floor. feeMultiplier turns a
 * weekly wage into a typical transfer fee. sponsorAnchor is the one-off £ for the "national" tier.
 */
const LEAGUE_ECONOMIES = {
  pl: {
    avgWeeklyWage: 70_000, topWeeklyWage: 250_000, baseWeeklyWage: 8_000,
    feeMultiplier: 120, freeTransferRate: 0.04,
    sponsorAnchor: 3_000_000, staffMultiplier: 200,
    tvBonusPerWeek: 2_400_000, startingCash: 80_000_000,
  },
  ch: {
    avgWeeklyWage: 12_000, topWeeklyWage: 45_000, baseWeeklyWage: 1_800,
    feeMultiplier: 70, freeTransferRate: 0.18,
    sponsorAnchor: 600_000, staffMultiplier: 35,
    tvBonusPerWeek: 200_000, startingCash: 8_000_000,
  },
  l1: {
    avgWeeklyWage: 2_800, topWeeklyWage: 7_500, baseWeeklyWage: 700,
    feeMultiplier: 25, freeTransferRate: 0.35,
    sponsorAnchor: 120_000, staffMultiplier: 10,
    tvBonusPerWeek: 18_000, startingCash: 1_200_000,
  },
  l2: {
    avgWeeklyWage: 1_200, topWeeklyWage: 3_200, baseWeeklyWage: 350,
    feeMultiplier: 10, freeTransferRate: 0.5,
    sponsorAnchor: 45_000, staffMultiplier: 3.5,
    tvBonusPerWeek: 6_000, startingCash: 500_000,
  },
  nl: {
    avgWeeklyWage: 600, topWeeklyWage: 1_500, baseWeeklyWage: 200,
    feeMultiplier: 5, freeTransferRate: 0.75,
    sponsorAnchor: 20_000, staffMultiplier: 1.7,
    tvBonusPerWeek: 1_400, startingCash: 200_000,
  },
  nln: {
    avgWeeklyWage: 350, topWeeklyWage: 800, baseWeeklyWage: 150,
    feeMultiplier: 3, freeTransferRate: 0.95,
    sponsorAnchor: 10_000, staffMultiplier: 1,
    tvBonusPerWeek: 260, startingCash: 120_000,
  },
};

/** Realistic team counts: PL 20; EFL & National divisions 24 each */
export const ENGLISH_PYRAMID = [
  { id: 0, name: 'Premier League', level: 1, teamsInLeague: 20, avgGate: 35_000, economy: LEAGUE_ECONOMIES.pl, tvBonusPerWeek: LEAGUE_ECONOMIES.pl.tvBonusPerWeek },
  { id: 1, name: 'EFL Championship', level: 2, teamsInLeague: 24, avgGate: 18_000, economy: LEAGUE_ECONOMIES.ch, tvBonusPerWeek: LEAGUE_ECONOMIES.ch.tvBonusPerWeek },
  { id: 2, name: 'EFL League One', level: 3, teamsInLeague: 24, avgGate: 9_000, economy: LEAGUE_ECONOMIES.l1, tvBonusPerWeek: LEAGUE_ECONOMIES.l1.tvBonusPerWeek },
  { id: 3, name: 'EFL League Two', level: 4, teamsInLeague: 24, avgGate: 4_500, economy: LEAGUE_ECONOMIES.l2, tvBonusPerWeek: LEAGUE_ECONOMIES.l2.tvBonusPerWeek },
  { id: 4, name: 'National League', level: 5, teamsInLeague: 24, avgGate: 2_200, economy: LEAGUE_ECONOMIES.nl, tvBonusPerWeek: LEAGUE_ECONOMIES.nl.tvBonusPerWeek },
  { id: 5, name: 'National League North', level: 6, teamsInLeague: 24, avgGate: 900, economy: LEAGUE_ECONOMIES.nln, tvBonusPerWeek: LEAGUE_ECONOMIES.nln.tvBonusPerWeek },
  { id: 6, name: 'National League South', level: 7, teamsInLeague: 24, avgGate: 900, economy: LEAGUE_ECONOMIES.nln, tvBonusPerWeek: LEAGUE_ECONOMIES.nln.tvBonusPerWeek },
];

/** Lookup the economy block for a given league index; defaults to the lowest tier. */
export function getLeagueEconomy(leagueIndex) {
  const li = Math.max(0, Math.min(ENGLISH_PYRAMID.length - 1, leagueIndex ?? ENGLISH_PYRAMID.length - 1));
  return ENGLISH_PYRAMID[li].economy;
}

export const FRANCHISE_REGIONS = [
  { id: 'usa', label: 'United States (MLS-style)', tierLabel: 'Division I', teamsInLeague: 10, entryFee: 45_000_000, tvBonusPerWeek: 200_000, avgGate: 22_000, economy: LEAGUE_ECONOMIES.ch },
  { id: 'jpn', label: 'Japan (J.League-style)', tierLabel: 'J2', teamsInLeague: 10, entryFee: 28_000_000, tvBonusPerWeek: 95_000, avgGate: 8_500, economy: LEAGUE_ECONOMIES.l1 },
  { id: 'esp2', label: 'Spain (Segunda)', tierLabel: 'Segunda División', teamsInLeague: 10, entryFee: 35_000_000, tvBonusPerWeek: 110_000, avgGate: 12_000, economy: LEAGUE_ECONOMIES.ch },
];

const PREFIXES = ['Ashford', 'Barton', 'Chedworth', 'Dunston', 'Eastleigh', 'Farnham', 'Grimthorpe', 'Holloway', 'Irwell', 'Kingsbury', 'Loxley', 'Marston', 'Northwick', 'Oakmere', 'Penkridge', 'Quedgeley', 'Ravensmoor', 'Stamford', 'Thornbury', 'Upton', 'Verwood', 'Wetherby', 'Yarnton'];
const SUFFIXES = ['United', 'Town', 'Athletic', 'Rovers', 'City', 'Wanderers', 'County', 'Forest'];

export function randomClubName(rng) {
  const a = PREFIXES[Math.floor(rng() * PREFIXES.length)];
  const b = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
  return `${a} ${b}`;
}

/** Seeded RNG for reproducible league generation */
export function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE_FIRST_NAMES = [
  'James', 'Oliver', 'Harry', 'George', 'Jack', 'Noah', 'Leo', 'Arthur', 'Muhammad', 'Ethan',
  'Henry', 'Oscar', 'William', 'Thomas', 'Freddie', 'Edward', 'Finley', 'Jacob', 'Lucas', 'Theo',
  'Kai', 'Reuben', 'Luca', 'Mateo', 'Diego', 'Bruno', 'Nico', 'Sven', 'Tomas', 'Rory',
  'Daniel', 'Samuel', 'Joseph', 'Benjamin', 'Alexander', 'Max', 'Charlie', 'Isaac', 'Adam', 'Ryan',
  'Kieran', 'Declan', 'Connor', 'Sean', 'Patrick', 'Liam', 'Callum', 'Scott', 'Marcus', 'Jordan',
];
const SURNAMES = [
  'Hughes', 'Clarke', 'Murphy', 'Walsh', 'O\'Connor', 'Kelly', 'Doyle', 'Byrne', 'Ryan', 'O\'Brien',
  'Mitchell', 'Bennett', 'Griffiths', 'Powell', 'Reid', 'Campbell', 'Patel', 'Khan', 'Ahmed', 'Hassan',
  'Silva', 'Costa', 'Fernandes', 'Schmidt', 'Weber', 'Jensen', 'Nielsen', 'Larsen', 'Novak', 'Kowalski',
  'Okonkwo', 'Mensah', 'Diallo', 'Santos', 'Rossi', 'García', 'López', 'Tanaka', 'Park', 'Nakamura',
];

export function randomPlayerName(rng) {
  const f = MALE_FIRST_NAMES[Math.floor(rng() * MALE_FIRST_NAMES.length)];
  const s = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  return `${f} ${s}`;
}

const STAFF_FIRST = [
  'Graham', 'David', 'Michael', 'Richard', 'Paul', 'Andrew', 'Simon', 'Mark', 'Steven', 'Robert',
  'Neil', 'Gary', 'Keith', 'Brian', 'Peter', 'Alan', 'Chris', 'Steve', 'Tony', 'Martin',
];

export function randomStaffName(rng) {
  const f = STAFF_FIRST[Math.floor(rng() * STAFF_FIRST.length)];
  const s = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  return `${f} ${s}`;
}

function playerHomeInFixture(round, playerTeamId) {
  const f = round.find((x) => x.home === playerTeamId || x.away === playerTeamId);
  if (!f) return null;
  return f.home === playerTeamId;
}

function flipFixtureForTeam(round, playerTeamId) {
  const ix = round.findIndex((f) => f.home === playerTeamId || f.away === playerTeamId);
  if (ix < 0) return false;
  const f = round[ix];
  round[ix] = { home: f.away, away: f.home };
  return true;
}

/** Break long home-only or away-only runs for the player's club (first half only; second half remains strict reverse). */
export function squashPlayerVenueStreaks(roundsFirst, playerTeamId, maxSame = 2) {
  if (!playerTeamId || !roundsFirst?.length || maxSame < 1) return;

  for (let attempt = 0; attempt < 80; attempt++) {
    let last = /** @type {boolean | null} */ (null);
    let streak = 0;
    let flipped = false;
    for (let i = 0; i < roundsFirst.length; i++) {
      const h = playerHomeInFixture(roundsFirst[i], playerTeamId);
      if (h == null) continue;
      if (last === null) {
        last = h;
        streak = 1;
        continue;
      }
      if (h === last) {
        streak++;
        if (streak > maxSame) {
          flipFixtureForTeam(roundsFirst[i], playerTeamId);
          flipped = true;
          break;
        }
      } else {
        last = h;
        streak = 1;
      }
    }
    if (!flipped) break;
  }
}

/**
 * Double round-robin as weekly rounds (each round: every team plays once).
 * Second half mirrors the first by swapping venues. Player venue streaks are capped in the first half.
 */
export function buildDoubleRoundRobinRounds(teamIds, seed, playerTeamId = null) {
  const rng = mulberry32(seed + 333);
  const teams = [...teamIds];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const n = teams.length;
  if (n < 2 || n % 2 !== 0) {
    return [];
  }
  const roundsFirst = [];
  const order = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push({ home: order[i], away: order[n - 1 - i] });
    }
    roundsFirst.push(pairs);
    order.splice(1, 0, order.pop());
  }
  squashPlayerVenueStreaks(roundsFirst, playerTeamId, 2);
  const roundsSecond = roundsFirst.map((round) => round.map(({ home, away }) => ({ home: away, away: home })));
  return [...roundsFirst, ...roundsSecond];
}

export function makeLeagueTeams(leagueIndex, playerClubName, seed) {
  const rng = mulberry32(seed + leagueIndex * 999);
  const def = ENGLISH_PYRAMID[leagueIndex];
  const names = new Set([playerClubName]);
  while (names.size < def.teamsInLeague) {
    names.add(randomClubName(rng));
  }
  return [...names].map((name, i) => ({
    id: `t-${leagueIndex}-${i}`,
    name,
    isPlayer: name === playerClubName,
    squadStrength: 40 + Math.floor(rng() * 35) + (name === playerClubName ? 0 : Math.floor(rng() * 10)),
    form: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}

export function makeFranchiseLeague(region, ownerName, seed) {
  const rng = mulberry32(seed + region.id.charCodeAt(0) * 1_000);
  const clubName = `${ownerName} ${region.label.split(' ')[0]} FC`;
  const names = new Set([clubName]);
  while (names.size < region.teamsInLeague) {
    names.add(randomClubName(rng));
  }
  return [...names].map((name, i) => ({
    id: `f-${region.id}-${i}`,
    name,
    isPlayer: name === clubName,
    squadStrength: 42 + Math.floor(rng() * 30),
    form: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}
