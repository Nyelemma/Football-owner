/**
 * English football pyramid — real competition tier names.
 * Club names are fictional procedurally to avoid implying official affiliation.
 */
/** Realistic team counts: PL 20; EFL & National divisions 24 each */
export const ENGLISH_PYRAMID = [
  { id: 0, name: 'Premier League', level: 1, teamsInLeague: 20, tvBonusPerWeek: 380_000, avgGate: 35_000 },
  { id: 1, name: 'EFL Championship', level: 2, teamsInLeague: 24, tvBonusPerWeek: 58_000, avgGate: 18_000 },
  { id: 2, name: 'EFL League One', level: 3, teamsInLeague: 24, tvBonusPerWeek: 18_000, avgGate: 9_000 },
  { id: 3, name: 'EFL League Two', level: 4, teamsInLeague: 24, tvBonusPerWeek: 6_500, avgGate: 4_500 },
  { id: 4, name: 'National League', level: 5, teamsInLeague: 24, tvBonusPerWeek: 1_400, avgGate: 2_200 },
  { id: 5, name: 'National League North', level: 6, teamsInLeague: 24, tvBonusPerWeek: 260, avgGate: 900 },
  { id: 6, name: 'National League South', level: 7, teamsInLeague: 24, tvBonusPerWeek: 260, avgGate: 900 },
];

export const FRANCHISE_REGIONS = [
  { id: 'usa', label: 'United States (MLS-style)', tierLabel: 'Division I', teamsInLeague: 10, entryFee: 45_000_000, tvBonusPerWeek: 200_000, avgGate: 22_000 },
  { id: 'jpn', label: 'Japan (J.League-style)', tierLabel: 'J2', teamsInLeague: 10, entryFee: 28_000_000, tvBonusPerWeek: 95_000, avgGate: 8_500 },
  { id: 'esp2', label: 'Spain (Segunda)', tierLabel: 'Segunda División', teamsInLeague: 10, entryFee: 35_000_000, tvBonusPerWeek: 110_000, avgGate: 12_000 },
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

/**
 * Double round-robin as weekly rounds (each round: every team plays once).
 * For 10 teams → 9 + 9 = 18 rounds — home and away vs every opponent.
 */
export function buildDoubleRoundRobinRounds(teamIds, seed) {
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
  const roundsSecond = roundsFirst.map((round) =>
    round.map(({ home, away }) => ({ home: away, away: home }))
  );
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
