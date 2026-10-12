renderNav('admin');

const loginView = document.getElementById('login-view');
const dashView = document.getElementById('dash-view');
const deniedView = document.getElementById('denied-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const whoami = document.getElementById('whoami');

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

auth.onAuthStateChanged(user => {
  [loginView, dashView, deniedView].forEach(v => v.style.display = 'none');
  if (!user) {
    loginView.style.display = 'block';
    return;
  }
  if (!isAdminEmail(user.email)) {
    deniedView.style.display = 'block';
    return;
  }
  whoami.textContent = user.email;
  dashView.style.display = 'block';
  initDashboard();
});

// ---------- tabs ----------
const tabButtons = document.querySelectorAll('.admin-tab');
const tabPanels = {
  teams: document.getElementById('panel-teams'),
  fixtures: document.getElementById('panel-fixtures'),
  tournament: document.getElementById('panel-tournament'),
  champions: document.getElementById('panel-champions')
};
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(tabPanels).forEach(p => p.style.display = 'none');
    tabPanels[btn.dataset.tab].style.display = 'block';
  });
});

let dashboardInitialized = false;
function initDashboard(){
  if (dashboardInitialized) return;
  dashboardInitialized = true;
  wireTeams();
  wireFixtures();
  wireTournamentPlayers();
  wireTournamentMatches();
  wireChampions();
}

// ---------- TEAMS ----------
function wireTeams(){
  const form = document.getElementById('team-form');
  const list = document.getElementById('team-list');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('team-name').value.trim();
    if (!name) return;
    await db.collection('leagueTeams').add({
      name, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, points:0
    });
    form.reset();
  });

  db.collection('leagueTeams').orderBy('name').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No players in the league yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => {
      const t = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        <span>${escapeHtml(t.name)}</span>
        <span class="tag">${t.points||0} pts</span>
        <button class="btn danger" data-id="${doc.id}">Remove</button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        if (confirm(`Remove ${t.name} from the league?`)) await db.collection('leagueTeams').doc(doc.id).delete();
      });
      list.appendChild(row);
    });
  });
}

async function teamOptions(){
  const snap = await db.collection('leagueTeams').orderBy('name').get();
  return snap.docs.map(d => `<option value="${escapeHtml(d.data().name)}">${escapeHtml(d.data().name)}</option>`).join('');
}

// ---------- FIXTURES ----------
function wireFixtures(){
  const form = document.getElementById('fixture-form');
  const list = document.getElementById('fixture-list');
  const homeSel = document.getElementById('fixture-home');
  const awaySel = document.getElementById('fixture-away');

  db.collection('leagueTeams').orderBy('name').onSnapshot(snap => {
    const opts = snap.docs.map(d => `<option value="${escapeHtml(d.data().name)}">${escapeHtml(d.data().name)}</option>`).join('');
    homeSel.innerHTML = opts || '<option value="">Add teams first</option>';
    awaySel.innerHTML = opts || '<option value="">Add teams first</option>';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const home = homeSel.value, away = awaySel.value;
    const matchday = Number(document.getElementById('fixture-matchday').value) || 1;
    const dateVal = document.getElementById('fixture-date').value;
    if (!home || !away || home === away) { alert('Pick two different players.'); return; }
    await db.collection('leagueFixtures').add({
      home, away, homeScore:0, awayScore:0, status:'scheduled', matchday,
      date: dateVal ? firebase.firestore.Timestamp.fromDate(new Date(dateVal)) : firebase.firestore.Timestamp.now()
    });
    form.reset();
  });

  db.collection('leagueFixtures').orderBy('date', 'desc').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No fixtures yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(fixtureEditor(doc.id, doc.data())));
  });
}

function fixtureEditor(id, f){
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <div class="small">MD${f.matchday ?? '-'} · ${escapeHtml(f.home)} vs ${escapeHtml(f.away)}</div>
    <div class="form-grid" style="margin-top:10px">
      <div class="form-row"><label>${escapeHtml(f.home)} score</label><input type="number" min="0" value="${f.homeScore ?? 0}" data-role="home-score"></div>
      <div class="form-row"><label>${escapeHtml(f.away)} score</label><input type="number" min="0" value="${f.awayScore ?? 0}" data-role="away-score"></div>
    </div>
    <div class="form-row">
      <label>Status</label>
      <select data-role="status">
        <option value="scheduled" ${f.status==='scheduled'?'selected':''}>Scheduled</option>
        <option value="live" ${f.status==='live'?'selected':''}>Live</option>
        <option value="ft" ${f.status==='ft'?'selected':''}>Full-time</option>
      </select>
    </div>
    <div class="row-actions">
      <button class="btn" data-role="save">Save</button>
      <button class="btn danger" data-role="delete">Delete</button>
    </div>
  `;

  wrap.querySelector('[data-role="save"]').addEventListener('click', async () => {
    const homeScore = Number(wrap.querySelector('[data-role="home-score"]').value) || 0;
    const awayScore = Number(wrap.querySelector('[data-role="away-score"]').value) || 0;
    const status = wrap.querySelector('[data-role="status"]').value;
    const prevStatus = f.status;

    await db.collection('leagueFixtures').doc(id).update({ homeScore, awayScore, status });

    // Recompute standings when a match is freshly marked full-time
    if (status === 'ft' && prevStatus !== 'ft') {
      await applyResultToStandings(f.home, f.away, homeScore, awayScore);
    }
  });

  wrap.querySelector('[data-role="delete"]').addEventListener('click', async () => {
    if (confirm('Delete this fixture?')) await db.collection('leagueFixtures').doc(id).delete();
  });

  return wrap;
}

async function applyResultToStandings(homeName, awayName, homeScore, awayScore){
  const snap = await db.collection('leagueTeams').get();
  const byName = {};
  snap.forEach(doc => byName[doc.data().name] = doc.id);

  async function bump(name, gf, ga, result){
    const id = byName[name];
    if (!id) return;
    const ref = db.collection('leagueTeams').doc(id);
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() || {};
      tx.update(ref, {
        played: (cur.played||0) + 1,
        won: (cur.won||0) + (result==='w'?1:0),
        drawn: (cur.drawn||0) + (result==='d'?1:0),
        lost: (cur.lost||0) + (result==='l'?1:0),
        gf: (cur.gf||0) + gf,
        ga: (cur.ga||0) + ga,
        points: (cur.points||0) + (result==='w'?3:result==='d'?1:0)
      });
    });
  }

  const homeResult = homeScore > awayScore ? 'w' : homeScore < awayScore ? 'l' : 'd';
  const awayResult = awayScore > homeScore ? 'w' : awayScore < homeScore ? 'l' : 'd';
  await bump(homeName, homeScore, awayScore, homeResult);
  await bump(awayName, awayScore, homeScore, awayResult);
}

// ---------- TOURNAMENT PLAYERS ----------
function wireTournamentPlayers(){
  const form = document.getElementById('player-form');
  const list = document.getElementById('player-list');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('player-name').value.trim();
    if (!name) return;
    const count = (await db.collection('tournamentPlayers').get()).size;
    if (count >= 8) { alert('The tournament is capped at 8 players.'); return; }
    await db.collection('tournamentPlayers').add({ name, seed: count + 1 });
    form.reset();
  });

  db.collection('tournamentPlayers').orderBy('seed').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No entrants yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => {
      const p = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `<span>#${p.seed} ${escapeHtml(p.name)}</span><button class="btn danger">Remove</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (confirm(`Remove ${p.name}?`)) await db.collection('tournamentPlayers').doc(doc.id).delete();
      });
      list.appendChild(row);
    });
  });
}

// ---------- TOURNAMENT MATCHES ----------
function wireTournamentMatches(){
  const form = document.getElementById('match-form');
  const list = document.getElementById('match-list');
  const p1Sel = document.getElementById('match-p1');
  const p2Sel = document.getElementById('match-p2');

  db.collection('tournamentPlayers').orderBy('seed').onSnapshot(snap => {
    const opts = '<option value="">TBD</option>' + snap.docs.map(d => `<option value="${escapeHtml(d.data().name)}">${escapeHtml(d.data().name)}</option>`).join('');
    p1Sel.innerHTML = opts;
    p2Sel.innerHTML = opts;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const round = document.getElementById('match-round').value;
    const order = Number(document.getElementById('match-order').value) || 0;
    const player1 = p1Sel.value, player2 = p2Sel.value;
    await db.collection('tournamentMatches').add({
      round, order, player1, player2, score1:0, score2:0, status:'scheduled',
      date: firebase.firestore.Timestamp.now()
    });
    form.reset();
  });

  db.collection('tournamentMatches').orderBy('order').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No matches set yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(matchEditor(doc.id, doc.data())));
  });
}

function matchEditor(id, m){
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <div class="small">${escapeHtml(m.round)} · ${escapeHtml(m.player1||'TBD')} vs ${escapeHtml(m.player2||'TBD')}</div>
    <div class="form-grid" style="margin-top:10px">
      <div class="form-row"><label>${escapeHtml(m.player1||'P1')} score</label><input type="number" min="0" value="${m.score1 ?? 0}" data-role="s1"></div>
      <div class="form-row"><label>${escapeHtml(m.player2||'P2')} score</label><input type="number" min="0" value="${m.score2 ?? 0}" data-role="s2"></div>
    </div>
    <div class="form-row">
      <label>Status</label>
      <select data-role="status">
        <option value="scheduled" ${m.status==='scheduled'?'selected':''}>Scheduled</option>
        <option value="live" ${m.status==='live'?'selected':''}>Live</option>
        <option value="ft" ${m.status==='ft'?'selected':''}>Full-time</option>
      </select>
    </div>
    <div class="row-actions">
      <button class="btn" data-role="save">Save</button>
      <button class="btn danger" data-role="delete">Delete</button>
    </div>
  `;
  wrap.querySelector('[data-role="save"]').addEventListener('click', async () => {
    const score1 = Number(wrap.querySelector('[data-role="s1"]').value) || 0;
    const score2 = Number(wrap.querySelector('[data-role="s2"]').value) || 0;
    const status = wrap.querySelector('[data-role="status"]').value;
    await db.collection('tournamentMatches').doc(id).update({ score1, score2, status });
  });
  wrap.querySelector('[data-role="delete"]').addEventListener('click', async () => {
    if (confirm('Delete this match?')) await db.collection('tournamentMatches').doc(id).delete();
  });
  return wrap;
}

// ---------- CHAMPIONS ----------
function wireChampions(){
  const form = document.getElementById('champion-form');
  const list = document.getElementById('champion-admin-list');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const season = document.getElementById('champion-season').value.trim();
    const competition = document.getElementById('champion-competition').value;
    const winner = document.getElementById('champion-winner').value.trim();
    if (!winner) return;
    await db.collection('champions').add({
      season, competition, winner, date: firebase.firestore.Timestamp.now()
    });
    form.reset();
  });

  db.collection('champions').orderBy('date', 'desc').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No champions logged yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => {
      const c = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `<span>${escapeHtml(c.season)} · ${escapeHtml(c.competition)} — <strong>${escapeHtml(c.winner)}</strong></span><button class="btn danger">Remove</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (confirm('Remove this entry?')) await db.collection('champions').doc(doc.id).delete();
      });
      list.appendChild(row);
    });
  });
}
