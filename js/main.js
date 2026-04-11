import {
  Game,
  STAFF_ROLES,
  SPONSOR_TIERS,
  getStaffHireCost,
  playerAvgRating,
  CLUB_IDENTITIES,
  OFF_SEASON_WEEKS,
  PRE_SEASON_WEEKS,
} from './game.js';
import { ENGLISH_PYRAMID, FRANCHISE_REGIONS } from './leagues.js';
import { getClubBadgeSvg } from './club-badges.js';

const game = new Game();
if (!game.load() || !game.state.table?.length) {
  game.reset();
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const els = {
  club: $('#club-name'),
  league: $('#league-name'),
  week: $('#week-num'),
  season: $('#season-num'),
  cash: $('#cash'),
  debt: $('#debt'),
  wages: $('#wages'),
  rep: $('#rep'),
  stadiumLine: $('#stadium-line'),
  fixture: $('#fixture-status'),
  main: $('#tab-content'),
  tabs: $$('.tabs button'),
  btnHelp: $('#btn-help'),
  btnInbox: $('#btn-inbox'),
  inboxBadge: $('#inbox-badge'),
  onboarding: $('#onboarding-overlay'),
  help: $('#help-overlay'),
  mailboxOverlay: $('#mailbox-overlay'),
  mailboxContent: $('#mailbox-content'),
  mailboxClose: $('#mailbox-close'),
  matchdayOverlay: $('#matchday-overlay'),
  matchdayContent: $('#matchday-content'),
};

let mailboxOpen = false;
let mailboxSelKey = '';
let matchdayOpen = false;
let matchdayTab = 'teams';
let helpOpen = false;

function matchCentreAvailable(state) {
  const ph = state?.seasonPhase || 'competitive';
  return !!(state?.lastMatchReport && ph !== 'off_season');
}

/** Header crest — during onboarding, follows the form (state updates on Start). */
function syncClubBadge() {
  const slot = $('#brand-crest-slot');
  if (!slot) return;
  const s = game.state;
  let badgeId = s.clubBadgeId || 'classic';
  let pri = s.clubColorPrimary || '#4ae8a5';
  let sec = s.clubColorSecondary || '#2d9d6a';
  if (!s.onboardingComplete) {
    const checked = document.querySelector('#onboarding-overlay input[name="ob-badge"]:checked');
    if (checked?.value) badgeId = checked.value;
    const ca = $('#ob-color-a')?.value;
    const cb = $('#ob-color-b')?.value;
    if (ca && /^#[0-9A-Fa-f]{6}$/i.test(ca)) pri = ca;
    if (cb && /^#[0-9A-Fa-f]{6}$/i.test(cb)) sec = cb;
  }
  slot.innerHTML = getClubBadgeSvg(badgeId, pri, sec);
}

function updateOnboardingKitPreview() {
  const pri = $('#ob-color-a')?.value || game.state.clubColorPrimary || '#4ae8a5';
  const sec = $('#ob-color-b')?.value || game.state.clubColorSecondary || '#2d9d6a';
  const a = $('.ob-kit-a');
  const b = $('.ob-kit-b');
  if (a) a.style.background = pri;
  if (b) b.style.background = sec;
  $$('[data-badge-thumb]').forEach((el) => {
    const id = el.getAttribute('data-badge-thumb');
    if (!id) return;
    el.innerHTML = getClubBadgeSvg(id, pri, sec).replace('width="44"', 'width="36"').replace('height="44"', 'height="36"');
  });
  syncClubBadge();
}

function syncOnboardingFormValues() {
  const s = game.state;
  const c = $('#ob-club');
  const st = $('#ob-stadium');
  const a = $('#ob-color-a');
  const b = $('#ob-color-b');
  if (c) c.value = s.clubName || '';
  if (st) st.value = s.stadiumName || '';
  if (a) a.value = s.clubColorPrimary || '#4ae8a5';
  if (b) b.value = s.clubColorSecondary || '#2d9d6a';
  const badge = s.clubBadgeId || 'classic';
  $$('input[name="ob-badge"]').forEach((inp) => {
    inp.checked = inp.value === badge;
  });
  updateOnboardingKitPreview();
}

function syncOnboardingOverlay() {
  const el = els.onboarding;
  if (!el) return;
  const show = !game.state.onboardingComplete;
  el.hidden = !show;
  el.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('onboarding-open', show);
  if (show) {
    syncOnboardingFormValues();
  }
}

function syncHelpOverlay() {
  const el = els.help;
  if (!el) return;
  el.hidden = !helpOpen;
  el.setAttribute('aria-hidden', helpOpen ? 'false' : 'true');
}

/** Pyramid browser: league index + team id */
let pyramidView = { league: null, teamId: '' };
let pyramidFlash = { text: '', ok: false };

function inboxItemCount(s) {
  return (s.pendingEvents?.length || 0) + (s.advisories?.length || 0);
}

/** Remaining advances in off-season or pre-season, with 1-based week index. */
function calmPhaseProgress(s) {
  const ph = s.seasonPhase || 'competitive';
  if (ph !== 'off_season' && ph !== 'pre_season') return null;
  const total = ph === 'off_season' ? OFF_SEASON_WEEKS : PRE_SEASON_WEEKS;
  const left = Math.max(0, s.phaseWeeksLeft ?? 0);
  const currentWeek = left <= 0 ? total : Math.min(total, total - left + 1);
  const completed = Math.max(0, total - left);
  return { phase: ph, total, left, currentWeek, completed };
}

function renderCalmSeasonPanel(s) {
  const p = calmPhaseProgress(s);
  if (!p) return '';
  const isOff = p.phase === 'off_season';
  const title = isOff ? 'Off-season (summer break)' : 'Pre-season';
  const body = isOff
    ? `No competitive league fixtures — focus on finances, recruitment, and staff. TV rights pay at a reduced off-season rate each week. After ${p.total} weeks, pre-season begins.`
    : `Closed-doors work and friendlies — small gate bumps each week, then the new league campaign kicks off (${p.total} pre-season weeks).`;
  const pills = Array.from({ length: p.total }, (_, i) => {
    const n = i + 1;
    const done = n <= p.completed;
    const current = n === p.currentWeek && p.left > 0;
    return `<li class="calm-wk${done ? ' calm-wk-done' : ''}${current ? ' calm-wk-current' : ''}" title="Week ${n}"><span>${n}</span></li>`;
  }).join('');
  const nextLbl = isOff ? 'pre-season' : 'the opening league fixtures';
  return `
    <div class="panel calm-phase-panel">
      <h2>${title}</h2>
      <p class="muted">${body}</p>
      <ol class="calm-week-track" aria-label="${title} weeks">${pills}</ol>
      <p class="calm-phase-status"><strong>Week ${p.currentWeek} of ${p.total}</strong> · ${p.left} more advance${p.left === 1 ? '' : 's'} until ${nextLbl}</p>
    </div>`;
}

function inboxItems(s) {
  const out = [];
  for (const ev of s.pendingEvents || []) {
    out.push({ kind: 'event', id: ev.id, headline: ev.headline, body: ev.body, choices: ev.choices || [] });
  }
  for (const a of s.advisories || []) {
    out.push({ kind: 'advisory', ...a });
  }
  return out;
}

function inboxKey(it) {
  return it.kind === 'event' ? `e:${it.id}` : `a:${it.id}`;
}

function renderMailboxHTML() {
  const s = game.state;
  const items = inboxItems(s);
  if (!mailboxSelKey && items.length) mailboxSelKey = inboxKey(items[0]);
  const sel = items.find((it) => inboxKey(it) === mailboxSelKey);

  const listHtml = items.length
    ? `<ul class="mailbox-thread">${items
        .map((it) => {
          const k = inboxKey(it);
          const from = it.kind === 'event' ? 'Board' : it.staffName || 'Staff';
          const title = (it.headline || '').slice(0, 72) + ((it.headline || '').length > 72 ? '…' : '');
          const active = sel && k === inboxKey(sel) ? 'is-active' : '';
          return `<li><button type="button" class="mailbox-item ${active}" data-mbx="${k}"><span class="mbx-from">${from}</span><span class="mbx-title">${title}</span></button></li>`;
        })
        .join('')}</ul>`
    : '<p class="mailbox-empty muted">No messages.</p>';

  let detailHtml = '';
  if (sel) {
    if (sel.kind === 'event') {
      detailHtml = `
        <article class="mail-open mail-open--urgent">
          <div class="mail-meta"><span class="tag-urgent">Board</span> · action required</div>
          <h3>${sel.headline}</h3>
          <p class="mail-body">${sel.body}</p>
          <div class="mail-actions">${(sel.choices || [])
            .map(
              (c) =>
                `<button type="button" class="primary" data-mail-event="${sel.id}" data-mail-choice="${c.id}">${c.label}</button>`
            )
            .join('')}</div>
        </article>`;
    } else {
      let scoutNegHtml = '';
      if (sel.suggestedPlayerId && sel.suggestedListKey === 'transferList') {
        const p = s.transferList?.find((x) => x.id === sel.suggestedPlayerId);
        if (p) {
          const opts = [1, 2, 3, 4, 5]
            .map((y) => `<option value="${y}"${y === 2 ? ' selected' : ''}>${y} yr</option>`)
            .join('');
          scoutNegHtml = `
        <div class="mail-scout-neg">
          <h4 class="subhead">Negotiation (list terms)</h4>
          <p><strong>${p.name}</strong> · ${p.pos} · OVR ${p.ovr} · ${formatMoney(p.askingFee || 0)} · ${formatMoney(p.wage)}/wk</p>
          <div class="row-actions" style="flex-wrap:wrap;align-items:center;gap:0.5rem;margin-top:0.5rem">
            <label>Contract <select data-scout-adv-contract="${sel.id}">${opts}</select></label>
            <button type="button" class="primary" data-scout-sign-advisory="${sel.id}">Confirm signing</button>
          </div>
        </div>`;
        } else {
          scoutNegHtml =
            '<p class="muted" style="margin-top:0.75rem">That player is no longer on the permanent list — refresh the market or dismiss.</p>';
        }
      }
      detailHtml = `
        <article class="mail-open">
          <div class="mail-meta">${sel.staffName || 'Staff'} · ${sel.roleKey === 'dof' ? 'DoF' : sel.roleKey === 'head_scout' ? 'Recruitment' : sel.roleKey === 'commercial' ? 'Commercial' : sel.roleKey || ''}</div>
          <h3>${sel.headline}</h3>
          <p class="mail-body">${sel.body}</p>
          ${scoutNegHtml}
          <div class="mail-actions">
            ${(sel.actions || [])
              .map(
                (act) =>
                  `<button type="button" class="primary" data-mail-advisory="${sel.id}" data-mail-action="${act.id}">${act.label}</button>`
              )
              .join('')}
            <button type="button" data-mail-dismiss="${sel.id}">Dismiss</button>
          </div>
        </article>`;
    }
  }

  return `
    <div class="mailbox-split">
      <aside class="mailbox-list-wrap">${listHtml}</aside>
      <section class="mailbox-detail-wrap">${detailHtml || '<p class="muted mailbox-empty">Select a message</p>'}</section>
    </div>`;
}

function renderMatchdayHTML() {
  const r = game.state.lastMatchReport;
  if (!r) return '';
  const youName = r.playerIsHome ? r.homeName : r.awayName;
  const lineRows = (rows) =>
    (rows || [])
      .map((p) => `<tr><td>${p.name}</td><td>${p.pos}</td><td>${p.ovr}</td></tr>`)
      .join('') || '<tr><td colspan="3" class="muted">—</td></tr>';

  const feedLines = (r.feed || [])
    .map((f) => `<li class="feed-line feed-${f.phase || 'live'}"><span class="feed-min">${f.minute}'</span><span class="feed-txt">${f.text}</span></li>`)
    .join('');

  const goalsOnly = (r.feed || []).filter((x) => String(x.text).includes('GOAL'));

  let body = '';
  if (matchdayTab === 'teams') {
    body = `
      <div class="lineup-grid">
        <div class="lineup-col">
          <h4>${r.homeName}</h4>
          <p class="muted tiny">Starting XI</p>
          <table class="lineup-tbl"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th></tr></thead><tbody>${lineRows(r.homeLineup)}</tbody></table>
          <p class="muted tiny">Subs</p>
          <table class="lineup-tbl sub"><tbody>${lineRows(r.homeBench)}</tbody></table>
        </div>
        <div class="lineup-col">
          <h4>${r.awayName}</h4>
          <p class="muted tiny">Starting XI</p>
          <table class="lineup-tbl"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th></tr></thead><tbody>${lineRows(r.awayLineup)}</tbody></table>
          <p class="muted tiny">Subs</p>
          <table class="lineup-tbl sub"><tbody>${lineRows(r.awayBench)}</tbody></table>
        </div>
      </div>`;
  } else if (matchdayTab === 'feed') {
    body = `<ul class="feed-list">${feedLines}</ul><p class="muted tiny">Simulated commentary — same RNG seed as the result.</p>`;
  } else {
    body = `
      <div class="summary-block">
        <p class="summary-score">${r.homeName} <strong>${r.homeGoals}</strong> – <strong>${r.awayGoals}</strong> ${r.awayName}</p>
        <h4>Goals</h4>
        <ul class="goal-summary">${goalsOnly.map((g) => `<li>${g.text}</li>`).join('') || '<li class="muted">No goals</li>'}</ul>
      </div>`;
  }

  const ctx =
    r.kind === 'friendly'
      ? `${r.leagueLabel} · Week ${r.matchweek} of ${PRE_SEASON_WEEKS}`
      : `${r.leagueLabel} · Matchweek ${r.matchweek}`;

  return `
    <div class="matchday-inner">
      <div class="matchday-toolbar">
        <h2>Match centre</h2>
        <button type="button" class="btn-icon" id="matchday-close" aria-label="Close">×</button>
      </div>
      <p class="matchday-ctx muted">${ctx}</p>
      <div class="matchday-scoreboard">
        <div class="score-block"><span class="score-name">${r.homeName}</span><span class="score-num">${r.homeGoals}</span></div>
        <span class="score-sep">–</span>
        <div class="score-block"><span class="score-name">${r.awayName}</span><span class="score-num">${r.awayGoals}</span></div>
      </div>
      <p class="muted matchday-you">Your club: <strong>${youName}</strong></p>
      <div class="matchday-tabs">
        <button type="button" data-mdtab="teams" class="${matchdayTab === 'teams' ? 'active' : ''}">Before</button>
        <button type="button" data-mdtab="feed" class="${matchdayTab === 'feed' ? 'active' : ''}">Live</button>
        <button type="button" data-mdtab="summary" class="${matchdayTab === 'summary' ? 'active' : ''}">After</button>
      </div>
      <div class="matchday-body">${body}</div>
      <div class="matchday-footer">
        <button type="button" id="matchday-dismiss" class="muted-btn">Close</button>
      </div>
    </div>`;
}

function syncOverlays() {
  const n = inboxItemCount(game.state);
  if (els.inboxBadge) {
    els.inboxBadge.hidden = n <= 0;
    els.inboxBadge.textContent = String(n);
  }
  if (els.mailboxOverlay) {
    const open = mailboxOpen;
    els.mailboxOverlay.hidden = !open;
    els.mailboxOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open && els.mailboxContent) els.mailboxContent.innerHTML = renderMailboxHTML();
  }
  if (els.matchdayOverlay) {
    const show = matchdayOpen && matchCentreAvailable(game.state);
    els.matchdayOverlay.hidden = !show;
    els.matchdayOverlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show && els.matchdayContent) els.matchdayContent.innerHTML = renderMatchdayHTML();
  }
}

function formatMoney(n) {
  return `£${Math.round(n).toLocaleString()}`;
}

function formatAvgRtg(p) {
  const v = playerAvgRating(p);
  return v === null ? '—' : String(v);
}

function boardMeter(label, value) {
  const v = Math.max(0, Math.min(100, value ?? 50));
  return `<div class="board-meter"><span class="board-meter-lbl">${label}</span><div class="board-meter-track"><div class="board-meter-fill" style="width:${v}%"></div></div><span class="board-meter-val">${v}</span></div>`;
}

function cupStatusHeader(s) {
  const c = s.cups || {};
  const parts = [];
  if (c.fa) parts.push(c.fa.done ? `FA (${c.fa.roundsWon} ties)` : 'FA live');
  if (c.trophy?.active) parts.push(c.trophy.done ? 'Trophy out' : 'Trophy live');
  if (c.vase?.active) parts.push(c.vase.done ? 'Vase out' : 'Vase live');
  return parts.length ? parts.join(' · ') : 'Cups';
}

function cupRowsHtml(cups) {
  return (cups || [])
    .map((c) => {
      if (c.type === 'friendly') {
        return `<div><span class="fix-tag friendly">Friendly</span> <span>${c.label}</span></div>`;
      }
      const short =
        c.type === 'fa' ? 'FA Cup' : c.type === 'trophy' ? 'Trophy' : c.type === 'vase' ? 'Vase' : c.type;
      const lbl = String(c.label || '').replace(/^FA (Cup|Trophy|Vase) — /, '');
      return `<div><span class="fix-tag cup">${short}</span> <span>${lbl}</span></div>`;
    })
    .join('');
}

function renderFixtureScheduleHTML(s) {
  const si = s.scheduleStepIndex ?? 0;
  const sched = s.scheduleSteps || s.fixtureSchedule || [];
  if (!sched.length) {
    return '<p class="muted">Fixtures appear when the schedule is ready.</p>';
  }
  return `<ul class="fixture-schedule-list">${sched
    .map((slot, i) => {
      const stepDone = i < si;
      const isNext = i === si;
      const rowCls = stepDone ? 'fix-done' : isNext ? 'fix-next' : 'fix-future';

      if (slot.kind === 'cups_only') {
        const cupsHtml = cupRowsHtml(slot.cups);
        return `<li class="fixture-row ${rowCls}">
        <div class="fix-week">${slot.calendarLabel}</div>
        <div class="fix-league-line muted">No league fixture this date — separate cup / friendly window</div>
        ${cupsHtml ? `<div class="fix-cups">${cupsHtml}</div>` : ''}
      </li>`;
      }

      const mw = slot.roundIndex != null ? slot.roundIndex + 1 : i + 1;
      const lg = slot.league;
      let leagueHtml = '';
      if (lg) {
        const ha = lg.home
          ? '<span class="fix-tag home">Home</span>'
          : '<span class="fix-tag away">Away</span>';
        leagueHtml = `<div class="fix-league-line">${ha}<span class="fix-tag league">League</span> vs ${lg.opponentName}</div>`;
      } else {
        leagueHtml = `<div class="fix-league-line muted">Bye / data</div>`;
      }
      return `<li class="fixture-row ${rowCls}">
        <div class="fix-week">League matchweek ${mw} · ${slot.calendarLabel}</div>
        ${leagueHtml}
      </li>`;
    })
    .join('')}</ul>`;
}

function setActiveTab(id) {
  els.tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
}

function renderHeader() {
  const s = game.state;
  els.club.textContent = s.clubName;
  els.league.textContent = ENGLISH_PYRAMID[s.leagueIndex].name;
  els.week.textContent = s.week;
  els.season.textContent = s.season;
  els.cash.textContent = formatMoney(s.cash);
  els.debt.textContent = formatMoney(s.debt);
  els.wages.textContent = formatMoney(game.weeklyWageBill()) + '/wk';
  els.rep.textContent = s.reputation;
  if (els.stadiumLine) {
    const sn = s.stadiumName || 'Stadium';
    els.stadiumLine.textContent = `${sn} · ${s.stadiumCapacity.toLocaleString()} seats`;
  }
  const rounds = s.leagueRounds || [];
  const ri = s.leagueRoundIndex ?? 0;
  const total = rounds.length;
  const round = rounds[ri];
  const cupBit = cupStatusHeader(s);
  const sy = s.seasonStartYear ?? 2025;
  const cal = `Season calendar ${sy}–${sy + 1} (Aug–May)`;
  const phase = s.seasonPhase || 'competitive';
  const calm = calmPhaseProgress(s);
  const phaseBit = calm
    ? `${calm.phase === 'off_season' ? 'Summer break' : 'Pre-season'} · week ${calm.currentWeek}/${calm.total} · ${calm.left} advance${calm.left === 1 ? '' : 's'} left`
    : '';
  const li = ENGLISH_PYRAMID[s.leagueIndex];
  const tvEff =
    phase === 'off_season'
      ? Math.floor(li.tvBonusPerWeek * 0.11)
      : phase === 'pre_season'
        ? Math.floor(li.tvBonusPerWeek * 0.28)
        : Math.floor(li.tvBonusPerWeek * 0.52);
  const steps = s.scheduleSteps || [];
  const stepIdx = s.scheduleStepIndex ?? 0;
  const nextStep = steps[stepIdx];
  if (phase !== 'competitive') {
    els.fixture.textContent = `${cal} · ${phaseBit} · TV dist. ~${formatMoney(tvEff)}/wk · ${cupBit}`;
  } else if (total === 0) {
    els.fixture.textContent = `${cal} · ${cupBit} · League schedule loading…`;
  } else if (steps.length && stepIdx >= steps.length) {
    els.fixture.textContent = `${cal} · ${cupBit} · Season complete — advance week to roll next season.`;
  } else if (nextStep?.kind === 'cups_only') {
    const c0 = nextStep.cups?.[0];
    const cupLbl = c0?.label ? String(c0.label).replace(/^FA (Cup|Trophy|Vase) — /, '') : 'Cup tie';
    els.fixture.textContent = `${cal} · Next: ${cupLbl} (${nextStep.calendarLabel}) · League ${ri + 1}/${total} after · TV ~${formatMoney(tvEff)}/wk · ${cupBit}`;
  } else if (nextStep?.kind === 'league') {
    const lround = rounds[nextStep.roundIndex ?? ri];
    const you = game.playerRow();
    const m = lround && you ? lround.find((f) => f.home === you.id || f.away === you.id) : null;
    const home = m ? s.table.find((t) => t.id === m.home) : null;
    const away = m ? s.table.find((t) => t.id === m.away) : null;
    const sub = m && you ? `${home?.name} vs ${away?.name}${m.home === you.id ? ' (home)' : ' (away)'}` : 'Full league round';
    const mw = (nextStep.roundIndex ?? ri) + 1;
    els.fixture.textContent = `${cal} · Next league: ${sub} · MW ${mw}/${total} · TV ~${formatMoney(tvEff)}/wk · ${cupBit}`;
  } else {
    const you = game.playerRow();
    const m = you ? round.find((f) => f.home === you.id || f.away === you.id) : null;
    const home = m ? s.table.find((t) => t.id === m.home) : null;
    const away = m ? s.table.find((t) => t.id === m.away) : null;
    const sub = m && you ? `${home?.name} vs ${away?.name}${m.home === you.id ? ' (home)' : ' (away)'}` : 'Full league round';
    els.fixture.textContent = `${cal} · League ${ri + 1}/${total} · ${sub} · TV ~${formatMoney(tvEff)}/wk · ${cupBit}`;
  }
}

function renderDashboard() {
  const s = game.state;
  const you = game.playerRow();
  const sorted = [...s.table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.goalsFor - a.goalsAgainst - (a.goalsFor - a.goalsAgainst);
  });
  const pos = sorted.findIndex((t) => t.isPlayer) + 1;
  const fa = s.cups?.fa;
  const tr = s.cups?.trophy;
  const vz = s.cups?.vase;
  const board = s.board || { fans: 55, investors: 55, media: 55 };
  const insights = game.getAnalyticsInsights();
  const identityLabel = CLUB_IDENTITIES.find((x) => x.id === s.clubIdentity)?.label || 'Not set';
  const canPickId = typeof game.canSetClubIdentity === 'function' ? game.canSetClubIdentity() : true;
  const inboxN = inboxItemCount(s);

  return `
    ${renderCalmSeasonPanel(s)}
    <div class="panel inbox-strip">
      <h2>Club inbox</h2>
      <p class="muted" style="margin-top:-0.25rem">
        ${inboxN ? `You have <strong>${inboxN}</strong> message(s) — staff briefings and board decisions.` : 'No new messages. Hire staff to receive briefings; events arrive as the season unfolds.'}
        ${
          matchCentreAvailable(s)
            ? ' A <strong>match report</strong> is ready (league or pre-season friendly).'
            : ''
        }
      </p>
      <div class="row-actions" style="flex-wrap:wrap;gap:0.5rem">
        <button type="button" class="primary" id="open-inbox-dash">Open inbox</button>
        ${matchCentreAvailable(s) ? '<button type="button" id="open-matchday-dash">Match centre</button>' : ''}
      </div>
    </div>
    <div class="panel board-panel">
      <h2>Stakeholders & atmosphere</h2>
      <div class="board-meters">
        ${boardMeter('Fans', board.fans)}
        ${boardMeter('Investors', board.investors)}
        ${boardMeter('Media', board.media)}
      </div>
      <p class="muted">Atmosphere <strong>${s.atmosphere ?? '—'}</strong>/100 — drives performance and gates. Fans follow results; investors watch cash; media reacts to transfers and crises.</p>
      <h3 class="subhead">Club identity</h3>
      <p class="muted">${CLUB_IDENTITIES.map((x) => `<strong>${x.label}</strong> — ${x.desc}`).join('<br/>')}</p>
      <p class="muted" style="margin-top:0.35rem">${canPickId ? 'You may set or change identity during the opening weeks of each league season only.' : 'Identity is fixed for the rest of this league season — it unlocks again at the next campaign kickoff.'}</p>
      <div class="row-actions" style="flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem">
        ${CLUB_IDENTITIES.map(
          (id) =>
            `<button type="button" data-identity="${id.id}" class="${s.clubIdentity === id.id ? 'primary' : ''}" ${canPickId ? '' : 'disabled'}>${id.label}</button>`
        ).join('')}
      </div>
      <p class="muted" style="margin-top:0.5rem">Active identity: <strong>${identityLabel}</strong>${s.identityDrift ? ` · drift ${s.identityDrift}` : ''}</p>
    </div>
    <div class="panel">
      <h2>Analytics</h2>
      ${
        insights.length
          ? `<ul class="insights-list">${insights.map((i) => `<li>${i.text}</li>`).join('')}</ul>`
          : '<p class="muted">Patterns appear after several league games (late goals, top-six record, reliance on one scorer…).</p>'
      }
      <div class="row-actions" style="margin-top:0.65rem">
        <button type="button" data-analytics-act="refresh_lists">Refresh transfer lists</button>
        <button type="button" data-analytics-act="staff_advice">Staff advice</button>
      </div>
    </div>
    <div class="dashboard-league-row">
      <div class="panel">
        <h2>League table</h2>
        <table>
          <thead><tr><th>#</th><th>Club</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th></tr></thead>
          <tbody>
            ${sorted
              .map(
                (t, i) => `
              <tr class="${t.isPlayer ? 'player-row' : ''}">
                <td>${i + 1}</td>
                <td>${t.name}${t.isPlayer ? ' (you)' : ''}</td>
                <td>${t.played}</td><td>${t.won}</td><td>${t.drawn}</td><td>${t.lost}</td>
                <td>${t.goalsFor}</td><td>${t.goalsAgainst}</td><td>${t.points}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <p class="muted" style="margin-top:0.75rem">Double round-robin: home and away vs every opponent (${(s.leagueRounds?.length ?? 0) || '—'} rounds). Top 2 promote; bottom 2 relegated. 3rd place can win promotion play-offs in the Championship and National League. Cup ties use separate player stats — only league matches count in Pld here.</p>
      </div>
      <div class="panel fixture-panel">
        <h2>Fixture list</h2>
        <p class="muted" style="margin-top:-0.35rem;margin-bottom:0.65rem">League matchweeks and separate cup or friendly dates (not on the same advance as your league game).</p>
        ${renderFixtureScheduleHTML(s)}
      </div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Club snapshot</h2>
        <div class="snapshot-cards">
          <div class="mini"><span class="muted">League position</span><strong>${pos} / ${s.table.length}</strong></div>
          <div class="mini"><span class="muted">League progress</span><strong>${Math.min(s.leagueRoundIndex ?? 0, s.leagueRounds?.length ?? 0)} / ${s.leagueRounds?.length ?? 0} rounds</strong></div>
          <div class="mini"><span class="muted">Calendar (league + cups)</span><strong>${Math.min(s.scheduleStepIndex ?? 0, (s.scheduleSteps || []).length)} / ${(s.scheduleSteps || []).length || '—'}</strong></div>
          <div class="mini"><span class="muted">FA Cup</span><strong>${fa?.done ? `Finished (${fa.roundsWon} ties)` : 'Live'}</strong></div>
          <div class="mini"><span class="muted">FA Trophy</span><strong>${!tr?.active ? '—' : tr.done ? 'Out' : 'Live'}</strong></div>
          <div class="mini"><span class="muted">FA Vase</span><strong>${!vz?.active ? '—' : vz.done ? 'Out' : 'Live'}</strong></div>
          <div class="mini"><span class="muted">Atmosphere</span><strong>${s.atmosphere ?? '—'}</strong></div>
        </div>
        <p style="margin-top:1rem">Ticket price: <strong>${formatMoney(s.ticketPrice)}</strong> per seat (price affects attendance & fans)</p>
        <p>Weekly TV distribution (effective): ${formatMoney(
          (s.seasonPhase || 'competitive') === 'off_season'
            ? Math.floor(ENGLISH_PYRAMID[s.leagueIndex].tvBonusPerWeek * 0.11)
            : (s.seasonPhase || 'competitive') === 'pre_season'
              ? Math.floor(ENGLISH_PYRAMID[s.leagueIndex].tvBonusPerWeek * 0.28)
              : Math.floor(ENGLISH_PYRAMID[s.leagueIndex].tvBonusPerWeek * 0.52)
        )}</p>
        <p>Sponsor income (this week): ${formatMoney(game.sponsorIncomeThisWeek())}</p>
        <p>Portfolio income: ${formatMoney(s.ownedClubs.reduce((a, c) => a + Math.floor((c.weeklyIncome || 0) * 0.52), 0))}/wk</p>
      </div>
      <div class="panel">
        <h2>News</h2>
        <ul class="log" id="news-log"></ul>
      </div>
    </div>
  `;
}

function renderFinances() {
  const s = game.state;
  const rawTv = ENGLISH_PYRAMID[s.leagueIndex].tvBonusPerWeek;
  const ph = s.seasonPhase || 'competitive';
  const calmFin = calmPhaseProgress(s);
  const calmFinLine = calmFin
    ? `<p class="muted" style="margin-bottom:1rem"><strong>${calmFin.phase === 'off_season' ? 'Off-season' : 'Pre-season'}</strong> — week ${calmFin.currentWeek} of ${calmFin.total} (${calmFin.left} advance${calmFin.left === 1 ? '' : 's'} remaining). League fixtures resume after pre-season.</p>`
    : '';
  const tv =
    ph === 'off_season'
      ? Math.floor(rawTv * 0.11)
      : ph === 'pre_season'
        ? Math.floor(rawTv * 0.28)
        : Math.floor(rawTv * 0.52);
  const pl = s.lastWeekPL;
  const upkeep = game.stadiumUpkeepWeekly();
  const sf = s.seasonFinance || {};
  const plRows = pl
    ? `
      <table class="pl-table">
        <caption class="muted">Week ${pl.week} · ${pl.phase} · cash ${formatMoney(pl.openingCash)} → ${formatMoney(pl.closingCash)} (${pl.net >= 0 ? '+' : ''}${formatMoney(pl.net)})</caption>
        <thead><tr><th>Income</th><th class="num">£</th><th></th><th>Expenses</th><th class="num">£</th></tr></thead>
        <tbody>
          ${pl.income
            .map(
              (row, i) => `
            <tr>
              <td>${row.label}</td><td class="num">${formatMoney(row.amount)}</td>
              <td></td>
              <td>${pl.expenses[i] ? pl.expenses[i].label : ''}</td><td class="num">${pl.expenses[i] ? formatMoney(pl.expenses[i].amount) : '—'}</td>
            </tr>`
            )
            .join('')}
          ${
            pl.expenses.length > pl.income.length
              ? pl.expenses
                  .slice(pl.income.length)
                  .map(
                    (row) => `
            <tr><td colspan="2"></td><td></td><td>${row.label}</td><td class="num">${formatMoney(row.amount)}</td></tr>`
                  )
                  .join('')
              : ''
          }
        </tbody>
      </table>
      ${(pl.notes || []).length ? `<ul class="muted small">${pl.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
    `
    : '<p class="muted">Advance at least one week to populate the weekly profit &amp; loss snapshot (stadium upkeep, split wages, TV, cups, portfolio, debt interest, etc.).</p>';
  return `
    ${calmFin ? `<div class="panel"><h2>Season rhythm</h2>${calmFinLine}</div>` : ''}
    <div class="panel">
      <h2>Weekly profit &amp; loss</h2>
      <p class="muted">Last processed week includes squad wages, staff wages, stadium upkeep, match &amp; TV income, multi-club dividends, debt interest, and cup / friendly cash (net).</p>
      ${plRows}
    </div>
    <div class="panel">
      <h2>Season cash events (non-weekly)</h2>
      <p>Youth &amp; academy investment (this season): <strong>${formatMoney(s.youthAcademy?.seasonInvest ?? 0)}</strong></p>
      <p>Transfer fees paid (fees to sign players): <strong>${formatMoney(sf.transferFeesPaid ?? 0)}</strong></p>
      <p>Transfer income (fees from sales): <strong>${formatMoney(sf.transferIncome ?? 0)}</strong></p>
      <p>Stadium expansion spend: <strong>${formatMoney(sf.stadiumSpend ?? 0)}</strong></p>
      <p>Sponsor signing bonuses (one-off lump sums): <strong>${formatMoney(sf.sponsorLumps ?? 0)}</strong></p>
      <p class="muted">Graduates and youth intake settle at season end; negotiated sponsor cheques count when you sign the deal.</p>
    </div>
    <div class="panel">
      <h2>Budget & pricing</h2>
      <p>Weekly squad wages: <strong>${formatMoney(game.weeklyPlayerWages())}</strong> · staff: <strong>${formatMoney(game.weeklyStaffWages())}</strong> · stadium upkeep (modelled): <strong>${formatMoney(upkeep)}</strong>/wk</p>
      <p>TV money (weekly, effective): ${formatMoney(tv)}</p>
      <p>Valuation (sell club): ~${formatMoney(game.clubValuation())}</p>
      <div class="row-actions" style="margin-top:0.75rem">
        <label>Ticket price (£)</label>
        <input type="number" id="ticket-input" min="8" max="120" value="${s.ticketPrice}" />
        <button type="button" id="save-ticket">Update</button>
      </div>
      <p class="muted" style="margin-top:0.75rem">Higher ticket prices lift revenue but reduce fill and can annoy fans if pushed too far.</p>
    </div>
    <div class="panel">
      <h2>Academy & financial stress</h2>
      <p>Academy spend this season: <strong>${formatMoney(s.youthAcademy?.seasonInvest ?? 0)}</strong> (graduates arrive at season end; bigger budgets swing odds).</p>
      <div class="row-actions" style="flex-wrap:wrap">
        <button type="button" data-youth-invest="50000">Invest £50k</button>
        <button type="button" data-youth-invest="150000">£150k</button>
        <button type="button" data-youth-invest="400000">£400k (golden generation odds)</button>
      </div>
      <p style="margin-top:0.75rem">Debt: <strong>${formatMoney(s.debt)}</strong> · weekly interest ≈ ${formatMoney(Math.ceil(s.debt * (s.loanRateWeekly || 0.0035)))}</p>
      <div class="row-actions" style="flex-wrap:wrap">
        <button type="button" data-em-loan="250000" ${s.cash >= 180_000 ? 'disabled' : ''}>Emergency loan £250k</button>
        <button type="button" data-naming-rights ${s.financialExtras?.namingRightsSold ? 'disabled' : ''}>Sell stadium naming rights (+£750k)</button>
      </div>
      <p class="muted" style="margin-top:0.5rem">Failure is not instant game over — debt accrues interest, naming rights unlock cash, and the board may force sales if stakeholders revolt.</p>
    </div>
    <div class="panel">
      <h2>Stadium expansion</h2>
      <p><strong>${s.stadiumName || 'Stadium'}</strong> — capacity <strong>${s.stadiumCapacity.toLocaleString()}</strong></p>
      <div class="row-actions">
        <button type="button" data-expand="500" data-cost="180000">+500 seats (${formatMoney(180000)})</button>
        <button type="button" data-expand="1500" data-cost="480000">+1,500 (${formatMoney(480000)})</button>
        <button type="button" data-expand="4000" data-cost="1200000">+4,000 (${formatMoney(1200000)})</button>
      </div>
    </div>
    <div class="panel">
      <h2>Ownership moves</h2>
      <p class="muted">Sell your club to take a payout and restart with a new project lower in the pyramid (Chairman-style). Buy satellite clubs for passive weekly income.</p>
      <button type="button" class="danger" id="sell-club">Sell club & start new project</button>
      <div id="buy-club-options" style="margin-top:1rem"></div>
    </div>
  `;
}

function renderStaff() {
  return `
    <div class="panel">
      <h2>Staff</h2>
      <p class="muted">Signing fee and weekly wage both rise with quality. Pick a level before hiring.</p>
      ${STAFF_ROLES.map((r) => {
        const st = game.state.staff[r.id];
        const q3cost = getStaffHireCost(r.id, 3);
        return `
        <div class="staff-card">
          <div>
            <strong>${r.label}</strong><br/>
            <span class="muted">${st.hired ? `${st.name || 'Staff'} — ${formatMoney(st.wage)}/wk, quality ${st.quality}${r.id === 'manager' && st.traits?.length ? ` · ${st.traits.join(', ')}` : ''}` : 'Vacant'}</span>
          </div>
          <div class="row-actions">
            ${
              st.hired
                ? `<button type="button" data-fire="${r.id}">Release</button>`
                : `<select data-hire-role="${r.id}" id="q-${r.id}">
                    <option value="1">Quality 1 (${formatMoney(getStaffHireCost(r.id, 1))})</option>
                    <option value="2">2 (${formatMoney(getStaffHireCost(r.id, 2))})</option>
                    <option value="3" selected>3 (${formatMoney(getStaffHireCost(r.id, 3))})</option>
                    <option value="4">4 (${formatMoney(getStaffHireCost(r.id, 4))})</option>
                    <option value="5">5 (${formatMoney(getStaffHireCost(r.id, 5))})</option>
                  </select>
                  <button type="button" class="staff-hire-btn" data-hire="${r.id}">Hire for ${formatMoney(q3cost)}</button>`
            }
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderSquad() {
  const s = game.state;
  const contractLabel = (p) => {
    if (p.onLoan) return `Loan (to s${p.loanEndsSeason ?? '?'})`;
    if (p.contractEndSeason == null) return '—';
    const exp = s.season > p.contractEndSeason;
    return exp ? `<span class="warn">Ended s${p.contractEndSeason}</span>` : `Through s${p.contractEndSeason}`;
  };
  return `
    <div class="panel">
      <h2>Squad (${s.squad.length})</h2>
      <table>
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Contract</th><th>Trait</th><th>League apps</th><th>Cup / fr.</th><th>G (L)</th><th>A (L)</th><th>Av Rtg</th><th>Wage/wk</th><th></th></tr></thead>
        <tbody>
          ${s.squad
            .sort((a, b) => b.ovr - a.ovr)
            .map(
              (p) => `
            <tr>
              <td>${p.name}${p.onLoan ? ' <span class="tag-loan">loan</span>' : ''}</td><td>${p.pos}</td><td>${p.ovr}</td><td>${p.age}</td>
              <td class="muted">${contractLabel(p)}</td>
              <td class="muted">${p.personality || '—'}</td>
              <td>${p.lApps ?? 0}</td><td class="muted">${(p.cApps ?? 0) + (p.fApps ?? 0)} app · ${(p.cGoals ?? 0) + (p.fGoals ?? 0)} gl</td>
              <td>${p.lGoals ?? 0}</td><td>${p.lAssists ?? 0}</td><td>${formatAvgRtg(p)}</td>
              <td>${formatMoney(p.wage)}</td>
              <td><button type="button" data-release="${p.id}" ${s.squad.length <= 16 ? 'disabled' : ''}>Release</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="muted">Minimum 16 players. Permanent deals are at least one season when signed; loans cover the current campaign.</p>
    </div>
  `;
}

function renderTransfers() {
  const s = game.state;
  const perm = s.transferList || [];
  const free = s.freeAgentList || [];
  const loans = s.loanList || [];
  const bids = s.playerBuyOffers || [];
  const contractSelect = (kind, p) => {
    if (kind === 'loan') return '<span class="muted">Season</span>';
    const opts = [1, 2, 3, 4, 5]
      .map((y) => `<option value="${y}"${y === 2 ? ' selected' : ''}>${y} yr</option>`)
      .join('');
    return `<select data-contract-years>${opts}</select>`;
  };
  const row = (p, kind) => {
    const feeLabel =
      kind === 'free' ? 'Free' : kind === 'loan' ? `Loan ${formatMoney(p.askingFee)}` : formatMoney(p.askingFee);
    const disabled = s.squad.length >= 28 || (kind !== 'free' && s.cash < (p.askingFee || 0));
    const btn =
      kind === 'free'
        ? `<button type="button" data-sign-free="${p.id}" ${s.squad.length >= 28 ? 'disabled' : ''}>Sign</button>`
        : kind === 'loan'
          ? `<button type="button" data-sign-loan="${p.id}" ${disabled ? 'disabled' : ''}>Loan in</button>`
          : `<button type="button" data-sign="${p.id}" ${disabled ? 'disabled' : ''}>Buy</button>`;
    return `
            <tr>
              <td>${p.name}</td><td>${p.pos}</td><td>${p.ovr}</td><td>${p.age}</td>
              <td>${feeLabel}</td><td>${formatMoney(p.wage)}</td>
              <td>${contractSelect(kind, p)}</td>
              <td>${btn}</td>
            </tr>`;
  };
  return `
    <div class="panel">
      <h2>Incoming bids (other clubs)</h2>
      <p class="muted">AI clubs may table offers for your players. Accept to bank the fee and remove the player (min. 16 squad players).</p>
      <table>
        <thead><tr><th>Player</th><th>From</th><th>Bid</th><th>Expires</th><th></th></tr></thead>
        <tbody>
          ${
            bids.length
              ? bids
                  .map(
                    (o) => `
            <tr>
              <td>${o.playerName}</td>
              <td>${o.fromClub}</td>
              <td>${formatMoney(o.fee)}</td>
              <td class="muted">week ${o.expiresWeek}</td>
              <td class="row-actions">
                <button type="button" class="primary" data-accept-bid="${o.id}">Accept</button>
                <button type="button" data-reject-bid="${o.id}">Decline</button>
              </td>
            </tr>`
                  )
                  .join('')
              : '<tr><td colspan="5" class="muted">No active bids — keep playing; enquiries appear when results and reputation draw interest.</td></tr>'
          }
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Permanent transfers</h2>
      <p class="muted">Full purchases — choose contract length (minimum one year) when you complete the deal.</p>
      <table>
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Fee</th><th>Wage/wk</th><th>Contract</th><th></th></tr></thead>
        <tbody>
          ${perm.map((p) => row(p, 'perm')).join('') || '<tr><td colspan="8" class="muted">No listings</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Free agents</h2>
      <p class="muted">No transfer fee — pay wages only. Set contract length on signing.</p>
      <table>
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Fee</th><th>Wage/wk</th><th>Contract</th><th></th></tr></thead>
        <tbody>
          ${free.map((p) => row(p, 'free')).join('') || '<tr><td colspan="8" class="muted">No free agents</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Loan market</h2>
      <p class="muted">Pay a loan fee for a season-long deal. Players return when the season ends (or release early).</p>
      <table>
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Loan fee</th><th>Wage/wk</th><th>Contract</th><th></th></tr></thead>
        <tbody>
          ${loans.map((p) => row(p, 'loan')).join('') || '<tr><td colspan="8" class="muted">No loan offers</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderSponsors() {
  const s = game.state;
  const offers = s.sponsorOffers || [];
  return `
    <div class="panel">
      <h2>Negotiated partnerships</h2>
      <p class="muted">One lump sum per brand per league season — larger in higher divisions. Same brand cannot be signed twice until the next league campaign.</p>
      ${
        offers.length
          ? offers
              .map((o) => {
                const pay = o.oneOffPayment ?? o.signingBonus ?? 0;
                const leagueLine = o.leagueName ? `${o.leagueName} · ` : '';
                const blocked = (s.negotiatedBrandsThisSeason || []).includes(o.brand);
                return `
        <div class="sponsor-offer-card">
          <div><strong>${o.brand}</strong> <span class="tag-loan">${o.risk === 'risky' ? 'Risky' : 'Safe'}</span></div>
          <p class="muted" style="margin:0.35rem 0">${o.blurb}</p>
          <p style="font-size:0.85rem">${leagueLine}one-off <strong>${formatMoney(pay)}</strong> · wants top ${o.prefMaxPlace} · min rep ${o.minRep} · ${o.playstyle}</p>
          <div class="row-actions" style="margin-top:0.5rem">
            <button type="button" data-negotiate="${o.id}" ${s.reputation < o.minRep || blocked ? 'disabled' : ''}>${blocked ? 'Signed this campaign' : `Sign (rep ${s.reputation}/${o.minRep})`}</button>
          </div>
        </div>`;
              })
              .join('')
          : '<p class="muted">Offers refresh each week.</p>'
      }
    </div>
    <div class="panel">
      <h2>Active deals</h2>
      ${
        s.sponsors.some((sp) => (sp.weekly || 0) > 0)
          ? s.sponsors
              .filter((sp) => (sp.weekly || 0) > 0)
              .map(
                (sp) =>
                  `<span class="sponsor-pill">${sp.label}: ${formatMoney(sp.weekly)}/wk${sp.penaltyWeeks > 0 ? ` (reduced ${sp.penaltyWeeks}w)` : ''} · ${sp.weeksLeft}w left</span>`
              )
              .join('')
          : '<p class="muted">No recurring weekly sponsors — negotiated and classic packages are one-off payments only.</p>'
      }
    </div>
    <div class="panel">
      <h2>Classic packages</h2>
      <p class="muted">One-off cash per deal. Each package runs for a set number of league campaigns before you can renew (elite = 4 seasons). No weekly instalments.</p>
      <table>
        <thead><tr><th>Package</th><th>One-off</th><th>Term</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${SPONSOR_TIERS.map((t) => {
            const active = game.hasActiveSponsorTier(t.id);
            const left = game.classicSponsorSeasonsUntilRenewal(t.id);
            const renewAt = game.state.classicSponsorRenewSeason?.[t.id];
            const term = t.durationSeasons ?? 1;
            const status = active
              ? `<span class="muted">${left} season${left === 1 ? '' : 's'} left · renew from <strong>season ${renewAt ?? '—'}</strong></span>`
              : '<span class="muted">Available</span>';
            return `
            <tr>
              <td>${t.label}</td>
              <td>${formatMoney(t.signingBonus)}</td>
              <td>${term} season${term === 1 ? '' : 's'}</td>
              <td>${status}</td>
              <td><button type="button" data-sponsor="${t.id}" ${active ? 'disabled' : ''}>${active ? 'Locked' : 'Sign'}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmpire() {
  const s = game.state;
  const offers = s.acquisitionOffers?.length ? s.acquisitionOffers : [];

  return `
    <div class="panel">
      <h2>Multi-club ownership</h2>
      <p class="muted">Satellite clubs pay modest weekly dividends (shown at cash received). Buying a target replaces it with a new opportunity.</p>
      <ul class="owned-list">
        ${s.ownedClubs.map((c) => `<li><strong>${c.name}</strong> — ${c.league} · ${formatMoney(Math.floor((c.weeklyIncome || 0) * 0.52))}/wk</li>`).join('') || '<li class="muted">No other clubs yet.</li>'}
      </ul>
      <h3 class="subhead">Acquire English satellite</h3>
      <div class="offer-grid">
        ${offers
          .map(
            (o) => `
          <button type="button" class="offer-card" data-buy-uid="${o.uid}" data-cost="${o.cost}" ${s.cash < o.cost ? 'disabled' : ''}>
            <span class="offer-name">${o.name}</span>
            <span class="offer-price">${formatMoney(o.cost)}</span>
          </button>`
          )
          .join('')}
      </div>
    </div>
    <div class="panel">
      <h2>Global franchise</h2>
      ${
        s.franchiseUnlocked
          ? `<p class="muted">Unlock earned by competing at the top. Invest abroad for branding and recurring income.</p>
          ${FRANCHISE_REGIONS.map(
            (r) => `
            <div class="staff-card">
              <div><strong>${r.label}</strong><br/><span class="muted">Entry ${formatMoney(r.entryFee)} · est. ${formatMoney(Math.floor(r.tvBonusPerWeek * 0.35))}/wk dividend</span></div>
              <button type="button" data-franchise="${r.id}" ${s.cash < r.entryFee ? 'disabled' : ''}>Acquire</button>
            </div>`
          ).join('')}`
          : '<p class="muted">Finish in the top three of the Premier League to unlock international franchise deals.</p>'
      }
    </div>
  `;
}

let currentTab = 'dashboard';

function renderPyramid() {
  const s = game.state;
  game.ensureWorldPyramid();
  let L = pyramidView.league;
  if (L === null || L === undefined) L = s.leagueIndex;
  L = Number(L);
  const table = game.getScoutTable(L);
  if (!pyramidView.teamId || !table.some((t) => t.id === pyramidView.teamId)) {
    const pr = table.find((t) => t.isPlayer);
    pyramidView.teamId = pr?.id || table[0]?.id || '';
  }
  pyramidView.league = L;

  const leagueOpts = ENGLISH_PYRAMID.map(
    (lg, i) => `<option value="${i}" ${i === L ? 'selected' : ''}>${lg.name}</option>`
  ).join('');

  const teamOpts = table
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === pyramidView.teamId ? 'selected' : ''}>${t.name}${t.isPlayer ? ' (you)' : ''}</option>`
    )
    .join('');

  const team = table.find((t) => t.id === pyramidView.teamId);
  const squad = team?.isPlayer ? s.squad : team?.squad || [];

  const flashHtml = pyramidFlash.text
    ? `<div class="pyramid-flash ${pyramidFlash.ok ? 'flash-ok' : 'flash-bad'}"><p>${pyramidFlash.text}</p></div>`
    : '';
  pyramidFlash = { text: '', ok: false };

  const rows = [...squad]
    .sort((a, b) => b.ovr - a.ovr)
    .map((p) => {
      const canApproach = !team?.isPlayer && (team?.squad?.length || 0) > 16;
      return `
        <tr>
          <td>${p.name}</td><td>${p.pos}</td><td>${p.ovr}</td><td>${p.age}</td>
          <td>${p.lApps ?? 0}</td><td>${p.lGoals ?? 0}</td><td>${p.lAssists ?? 0}</td><td>${formatAvgRtg(p)}</td>
          <td>${formatMoney(p.wage)}</td>
          <td>${
            team?.isPlayer
              ? '<span class="muted">Your squad</span>'
              : canApproach
                ? `<button type="button" class="btn-talks" data-open-talks data-l="${L}" data-tid="${team.id}" data-pid="${p.id}">Open talks</button>`
                : '<span class="muted">Club squad locked</span>'
          }</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Pyramid & squads</h2>
      <p class="muted">Pick a division and club. Appearances, goals and assists shown are <strong>league only</strong> (cup/friendly stats are on the Squad tab). <strong>Open talks</strong> checks ambition fit — big gaps in the pyramid mean many players will refuse outright.</p>
      ${flashHtml}
      <div class="pyramid-toolbar row-actions" style="flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem;align-items:center">
        <label>League <select id="pyramid-league">${leagueOpts}</select></label>
        <label>Club <select id="pyramid-team">${teamOpts}</select></label>
      </div>
      <p class="muted" style="margin-bottom:0.75rem">Showing <strong>${ENGLISH_PYRAMID[L].name}</strong>${team ? ` · ${team.name}` : ''}</p>
      <div id="pyramid-nego" class="pyramid-nego" aria-live="polite"></div>
      <table class="pyramid-roster">
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Apps (L)</th><th>G (L)</th><th>A (L)</th><th>Av Rtg</th><th>Wage/wk</th><th>Negotiate</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="10" class="muted">No squad data</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function wireTab() {
  const html =
    currentTab === 'dashboard'
      ? renderDashboard()
      : currentTab === 'finances'
        ? renderFinances()
        : currentTab === 'staff'
          ? renderStaff()
          : currentTab === 'squad'
            ? renderSquad()
            : currentTab === 'transfers'
              ? renderTransfers()
              : currentTab === 'pyramid'
                ? renderPyramid()
                : currentTab === 'sponsors'
                  ? renderSponsors()
                  : renderEmpire();

  els.main.innerHTML = html;

  if (currentTab === 'dashboard') {
    const log = $('#news-log');
    if (log) {
      log.innerHTML = game.state.history.slice(0, 25).map((h) => `<li class="${h.type || ''}">${h.text}</li>`).join('');
    }
    $('#open-inbox-dash')?.addEventListener('click', () => {
      mailboxOpen = true;
      const items = inboxItems(game.state);
      if (items.length) mailboxSelKey = inboxKey(items[0]);
      syncOverlays();
    });
    $('#open-matchday-dash')?.addEventListener('click', () => {
      matchdayOpen = true;
      matchdayTab = 'teams';
      syncOverlays();
    });
    $$('[data-identity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!game.canSetClubIdentity?.()) return;
        game.setClubIdentity(btn.getAttribute('data-identity'));
        render();
      });
    });
    $$('[data-analytics-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.runAnalyticsAction(btn.getAttribute('data-analytics-act'));
        render();
      });
    });
  }

  if (currentTab === 'finances') {
    $('#save-ticket')?.addEventListener('click', () => {
      const v = Number($('#ticket-input')?.value);
      game.setTicketPrice(v);
      render();
    });
    $$('[data-expand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.expandStadium(Number(btn.dataset.expand), Number(btn.dataset.cost));
        render();
      });
    });
    $('#sell-club')?.addEventListener('click', () => {
      if (confirm('Sell the club? You keep the cash and start a new lower-league project.')) {
        game.sellClub();
        render();
      }
    });
    $$('[data-youth-invest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.investYouthAcademy(Number(btn.getAttribute('data-youth-invest')));
        render();
      });
    });
    $$('[data-em-loan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.takeEmergencyLoan(Number(btn.getAttribute('data-em-loan')));
        render();
      });
    });
    $$('[data-naming-rights]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Sell stadium naming rights for £750k? Fans may react badly.')) {
          game.sellStadiumNamingRights();
          render();
        }
      });
    });
  }

  if (currentTab === 'staff') {
    const syncStaffHireButtons = () => {
      $$('.staff-hire-btn').forEach((btn) => {
        const role = btn.dataset.hire;
        const sel = $(`[data-hire-role="${role}"]`);
        const q = Number(sel?.value || 3);
        btn.textContent = `Hire for ${formatMoney(getStaffHireCost(role, q))}`;
      });
    };
    syncStaffHireButtons();
    $$('[data-hire-role]').forEach((sel) => {
      sel.addEventListener('change', syncStaffHireButtons);
    });
    $$('[data-hire]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.hire;
        const q = Number($(`[data-hire-role="${role}"]`)?.value || 3);
        game.hireStaff(role, q);
        render();
      });
    });
    $$('[data-fire]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.fireStaff(btn.dataset.fire);
        render();
      });
    });
  }

  if (currentTab === 'squad') {
    $$('[data-release]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.releasePlayer(btn.dataset.release);
        render();
      });
    });
  }

  if (currentTab === 'transfers') {
    $$('[data-sign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.closest('tr')?.querySelector('[data-contract-years]');
        const yrs = Number(sel?.value || 2);
        game.signPlayer(btn.dataset.sign, yrs);
        render();
      });
    });
    $$('[data-sign-free]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.closest('tr')?.querySelector('[data-contract-years]');
        const yrs = Number(sel?.value || 2);
        game.signFreeAgent(btn.dataset.signFree, yrs);
        render();
      });
    });
    $$('[data-sign-loan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.signLoanPlayer(btn.dataset.signLoan);
        render();
      });
    });
    $$('[data-accept-bid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.acceptPlayerBuyOffer(btn.dataset.acceptBid);
        render();
      });
    });
    $$('[data-reject-bid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.rejectPlayerBuyOffer(btn.dataset.rejectBid);
        render();
      });
    });
  }

  if (currentTab === 'sponsors') {
    $$('[data-sponsor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.signSponsor(btn.dataset.sponsor);
        render();
      });
    });
    $$('[data-negotiate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-negotiate');
        game.signNegotiatedSponsor(id);
        render();
      });
    });
  }

  if (currentTab === 'empire') {
    $$('[data-buy-uid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.buyOtherEnglishClub(btn.dataset.buyUid);
        render();
      });
    });
    $$('[data-franchise]').forEach((btn) => {
      btn.addEventListener('click', () => {
        game.buyFranchise(btn.dataset.franchise);
        render();
      });
    });
  }
}

function render() {
  renderHeader();
  wireTab();
  syncOnboardingOverlay();
  syncClubBadge();
  syncHelpOverlay();
  const locked = !game.state.onboardingComplete;
  $('#btn-week')?.toggleAttribute('disabled', locked);
  $('#btn-inbox')?.toggleAttribute('disabled', locked);
  $('#btn-new')?.toggleAttribute('disabled', locked);
  els.tabs?.forEach((t) => t.toggleAttribute('disabled', locked));
  if (!matchCentreAvailable(game.state)) matchdayOpen = false;
  syncOverlays();
}

els.tabs.forEach((b) => {
  b.addEventListener('click', () => {
    currentTab = b.dataset.tab;
    setActiveTab(currentTab);
    render();
  });
});

$('#onboarding-start')?.addEventListener('click', () => {
  const cn = $('#ob-club')?.value?.trim();
  if (!cn) {
    window.alert('Please enter a club name.');
    return;
  }
  game.completeOnboarding({
    clubName: cn,
    stadiumName: $('#ob-stadium')?.value,
    clubColorPrimary: $('#ob-color-a')?.value,
    clubColorSecondary: $('#ob-color-b')?.value,
  });
  render();
});

$('#onboarding-overlay')?.addEventListener('input', (e) => {
  if (e.target?.matches?.('#ob-color-a, #ob-color-b')) updateOnboardingKitPreview();
});
$('#onboarding-overlay')?.addEventListener('change', (e) => {
  if (e.target?.matches?.('input[name="ob-badge"]')) updateOnboardingKitPreview();
});

$('#btn-help')?.addEventListener('click', () => {
  helpOpen = true;
  render();
});
$('#help-close')?.addEventListener('click', () => {
  helpOpen = false;
  render();
});
$('#help-backdrop')?.addEventListener('click', () => {
  helpOpen = false;
  render();
});

$('#btn-week')?.addEventListener('click', () => {
  game.advanceWeek();
  if (matchCentreAvailable(game.state)) {
    matchdayOpen = true;
    matchdayTab = 'teams';
  }
  render();
});

$('#btn-new')?.addEventListener('click', () => {
  if (confirm('Start a completely new save?')) {
    game.reset();
    render();
  }
});

els.main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'pyramid-league') {
    pyramidView.league = Number(t.value);
    pyramidView.teamId = '';
    const ne = $('#pyramid-nego');
    if (ne) ne.innerHTML = '';
    render();
  }
  if (t.id === 'pyramid-team') {
    pyramidView.teamId = t.value;
    const ne = $('#pyramid-nego');
    if (ne) ne.innerHTML = '';
    render();
  }
});

els.main.addEventListener('click', (e) => {
  const talks = e.target.closest('[data-open-talks]');
  if (talks) {
    const L = Number(talks.dataset.l);
    const tid = talks.dataset.tid;
    const pid = talks.dataset.pid;
    const r = game.negotiateClubTransfer(L, tid, pid);
    const box = $('#pyramid-nego');
    if (box) {
      if (r.ok) {
        const opts = [1, 2, 3, 4, 5]
          .map((y) => `<option value="${y}"${y === 2 ? ' selected' : ''}>${y} season${y === 1 ? '' : 's'}</option>`)
          .join('');
        box.innerHTML = `<div class="nego-box ok"><p><strong>${r.playerName}</strong> (${r.clubName}) — ${r.message}</p><p>Package: <strong>${formatMoney(r.fee)}</strong> fee · <strong>${formatMoney(r.wage)}/wk</strong></p><label class="row-actions" style="margin:0.5rem 0">Contract length <select data-pyramid-contract>${opts}</select></label><button type="button" class="primary" data-do-sign data-l="${L}" data-tid="${tid}" data-pid="${pid}">Complete signing</button></div>`;
      } else {
        box.innerHTML = `<div class="nego-box bad"><p><strong>Refused.</strong> ${r.message}</p></div>`;
      }
    }
    return;
  }
  const complete = e.target.closest('[data-do-sign]');
  if (!complete) return;
  const yrs = Number(complete.closest('.nego-box')?.querySelector('[data-pyramid-contract]')?.value || 2);
  const r = game.completeClubTransfer(Number(complete.dataset.l), complete.dataset.tid, complete.dataset.pid, yrs);
  pyramidFlash = { text: r.message, ok: r.ok };
  render();
});

els.btnInbox?.addEventListener('click', () => {
  mailboxOpen = true;
  const items = inboxItems(game.state);
  if (items.length && !items.some((it) => inboxKey(it) === mailboxSelKey)) mailboxSelKey = inboxKey(items[0]);
  syncOverlays();
});

els.mailboxClose?.addEventListener('click', () => {
  mailboxOpen = false;
  syncOverlays();
});

document.getElementById('mailbox-overlay')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('overlay-backdrop')) {
    mailboxOpen = false;
    syncOverlays();
  }
});

document.getElementById('matchday-overlay')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('overlay-backdrop')) {
    matchdayOpen = false;
    syncOverlays();
  }
});

document.addEventListener('click', (e) => {
  const scoutSign = e.target.closest('[data-scout-sign-advisory]');
  if (scoutSign) {
    const aid = scoutSign.getAttribute('data-scout-sign-advisory');
    const sel = scoutSign.closest('.mail-scout-neg')?.querySelector('[data-scout-adv-contract]');
    const yrs = Number(sel?.value || 2);
    const r = game.signPlayerFromAdvisory(aid, yrs);
    if (!r.ok && r.message) window.alert(r.message);
    if (r.ok && mailboxOpen && els.mailboxContent) els.mailboxContent.innerHTML = renderMailboxHTML();
    render();
    return;
  }
  const evB = e.target.closest('[data-mail-event]');
  if (evB) {
    game.resolvePendingEvent(evB.dataset.mailEvent, evB.dataset.mailChoice);
    const items = inboxItems(game.state);
    mailboxSelKey = items.length ? inboxKey(items[0]) : '';
    render();
    return;
  }
  const advB = e.target.closest('[data-mail-advisory]');
  if (advB) {
    game.applyAdvisoryChoice(advB.dataset.mailAdvisory, advB.dataset.mailAction);
    render();
    return;
  }
  const disB = e.target.closest('[data-mail-dismiss]');
  if (disB) {
    game.dismissAdvisory(disB.dataset.mailDismiss);
    render();
    return;
  }
  const mbx = e.target.closest('[data-mbx]');
  if (mbx && els.mailboxContent && mailboxOpen) {
    mailboxSelKey = mbx.getAttribute('data-mbx') || '';
    els.mailboxContent.innerHTML = renderMailboxHTML();
    return;
  }
  const mdt = e.target.closest('[data-mdtab]');
  if (mdt && els.matchdayContent && matchdayOpen && matchCentreAvailable(game.state)) {
    matchdayTab = mdt.getAttribute('data-mdtab') || 'teams';
    els.matchdayContent.innerHTML = renderMatchdayHTML();
    return;
  }
  if (e.target.id === 'matchday-close' || e.target.id === 'matchday-dismiss') {
    matchdayOpen = false;
    syncOverlays();
  }
});

setActiveTab('dashboard');
render();
