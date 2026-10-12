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
    try {
      await db.collection('leagueTeams').add({
        name, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, points:0
      });
      form.reset();
      // A new team may already have fixtures with its name, so rebuild.
      await recomputeStandings();
    } catch (err) {
      console.error(err);
      alert('Failed to add player: ' + err.message);
    }
  });

  db.collection('leagueTeams').orderBy('name').onSnapshot(snap => {
    if (snap.empty) { list.innerHTML = '<div class="empty">No players in the league yet.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(teamRow(doc.id, doc.data())));
  });
}

function teamRow(id, t){
  const row = document.createElement('div');
  row.className = 'admin-list-item';
  row.innerHTML = `
    <span data-role="display" style="flex:1">${escapeHtml(t.name)}</span>
    <input data-role="input" value="${escapeHtml(t.name)}" style="display:none; flex:1">
    <span class="tag" data-role="pts">${t.points||0} pts</span>
    <button class="btn secondary" data-role="edit">Edit</button>
    <button class="btn danger" data-role="remove">Remove</button>
  `;

  const displayEl = row.querySelector('[data-role="display"]');
  const inputEl = row.querySelector('[data-role="input"]');
  const editBtn = row.querySelector('[data-role="edit"]');

  editBtn.addEventListener('click', async () => {
    if (editBtn.textContent === 'Edit') {
      displayEl.style.display = 'none';
      inputEl.style.display = 'block';
      inputEl.focus();
      editBtn.textContent = 'Save';
    } else {
      const newName = inputEl.value.trim();
      const oldName = t.name;
      if (!newName) { alert('Name cannot be empty.'); return; }
      if (newName !== oldName) {
        editBtn.disabled = true;
        try {
          await renameTeam(id, oldName, newName);
        } catch (err) {
          console.error(err);
          alert('Rename failed: ' + err.message);
        }
        editBtn.disabled = false;
      }
      displayEl.textContent = newName;
      displayEl.style.display = 'inline';
      inputEl.style.display = 'none';
      editBtn.textContent = 'Edit';
    }
  });

  row.querySelector('[data-role="remove"]').addEventListener('click', async () => {
    if (!confirm(`Remove ${t.name} from the league?`)) return;
    try {
      await db.collection('leagueTeams').doc(id).delete();
    } catch (err) {
      console.error(err);
      alert('Remove failed: ' + err.message);
    }
  });

  return row;
}

// Renames a league team everywhere it's referenced: the team doc itself,
// plus every leagueFixtures doc that has it as home or away.
async function renameTeam(teamId, oldName, newName){
  await db.collection('leagueTeams').doc(teamId).update({ name: newName });

  const [homeSnap, awaySnap] = await Promise.all([
    db.collection('leagueFixtures').where('home', '==', oldName).get(),
    db.collection('leagueFixtures').where('away', '==', oldName).get()
  ]);
  if (homeSnap.empty && awaySnap.empty) return;

  const batch = db.batch();
  homeSnap.forEach(doc => batch.update(doc.ref, { home: newName }));
  awaySnap.forEach(doc => batch.update(doc.ref, { away: newName }));
  await batch.commit();
}

// ---------- STANDINGS ----------
// Rebuilds the whole table from every full-time fixture. Safe to call after
// any fixture change (save, status change, delete) because it never relies
// on incrementing previous values.
async function recomputeStandings(){
  const [teamsSnap, fixSnap] = await Promise.all([
    db.collection('leagueTeams').get(),
    db.collection('leagueFixtures').where('status', '==', 'ft').get()
  ]);
  if (teamsSnap.empty) return;

  const stats = {};
  teamsSnap.forEach(d => {
    stats[d.data().name] = { played:0, won:0, drawn:0, lost:0, gf:0, ga:0, points:0 };
  });

  fixSnap.forEach(d => {
    const f = d.data();
    const h = stats[f.home], a = stats[f.away];
    if (!h || !a) return; // name doesn't match any team
    const hs = Number(f.homeScore) || 0;
    const as = Number(f.awayScore) || 0;
    h.played++; a.played++;
    h.gf += hs; h.ga += as;
    a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; h.points += 3; a.lost++; }
    else if (hs < as) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  });

  const batch = db.batch();
  teamsSnap.forEach(d => batch.update(d.ref, stats[d.data().name]));
  await batch.commit();
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
    try {
      await db.collection('leagueFixtures').add({
        home, away, homeScore:0, awayScore:0, status:'scheduled', matchday,
        date: dateVal ? firebase.firestore.Timestamp.fromDate(new Date(dateVal)) : firebase.firestore.Timestamp.now()
      });
      form.reset();
    } catch (err) {
      console.error(err);
      alert('Failed to add fixture: ' + err.message);
    }
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

  const saveBtn = wrap.querySelector('[data-role="save"]');
  const deleteBtn = wrap.querySelector('[data-role="delete"]');

  saveBtn.addEventListener('click', async () => {
    const homeScore = Number(wrap.querySelector('[data-role="home-score"]').value) || 0;
    const awayScore = Number(wrap.querySelector('[data-role="away-score"]').value) || 0;
    const status = wrap.querySelector('[data-role="status"]').value;

    saveBtn.disabled = true;
    try {
      await db.collection('leagueFixtures').doc(id).update({ homeScore, awayScore, status });
      await recomputeStandings();
    } catch (err) {
      console.error(err);
      alert('Failed to update: ' + err.message);
    }
    saveBtn.disabled = false;
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this fixture?')) return;
    try {
      await db.collection('leagueFixtures').doc(id).delete();
      await recomputeStandings();
    } catch (err) {
      console.error(err);
      alert('Failed to delete: ' + err.message);
    }
  });

  return wrap;
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
    snap.forEach(doc => list.appendChild(playerRow(doc.id, doc.data())));
  });
}

function playerRow(id, p){
  const row = document.createElement('div');
  row.className = 'admin-list-item';
  row.innerHTML = `
    <span data-role="display" style="flex:1">#${p.seed} ${escapeHtml(p.name)}</span>
    <input data-role="input" value="${escapeHtml(p.name)}" style="display:none; flex:1">
    <button class="btn secondary" data-role="edit">Edit</button>
    <button class="btn danger" data-role="remove">Remove</button>
  `;

  const displayEl = row.querySelector('[data-role="display"]');
  const inputEl = row.querySelector('[data-role="input"]');
  const editBtn = row.querySelector('[data-role="edit"]');

  editBtn.addEventListener('click', async () => {
    if (editBtn.textContent === 'Edit') {
      displayEl.style.display = 'none';
      inputEl.style.display = 'block';
      inputEl.focus();
      editBtn.textContent = 'Save';
    } else {
      const newName = inputEl.value.trim();
      const oldName = p.name;
      if (!newName) { alert('Name cannot be empty.'); return; }
      if (newName !== oldName) {
        editBtn.disabled = true;
        await renamePlayer(id, oldName, newName);
        editBtn.disabled = false;
      }
      displayEl.textContent = `#${p.seed} ${newName}`;
      displayEl.style.display = 'inline';
      inputEl.style.display = 'none';
      editBtn.textContent = 'Edit';
    }
  });

  row.querySelector('[data-role="remove"]').addEventListener('click', async () => {
    if (confirm(`Remove ${p.name}?`)) await db.collection('tournamentPlayers').doc(id).delete();
  });

  return row;
}

// Renames a tournament entrant everywhere it's referenced.
async function renamePlayer(playerId, oldName, newName){
  await db.collection('tournamentPlayers').doc(playerId).update({ name: newName });

  const [p1Snap, p2Snap] = await Promise.all([
    db.collection('tournamentMatches').where('player1', '==', oldName).get(),
    db.collection('tournamentMatches').where('player2', '==', oldName).get()
  ]);
  if (p1Snap.empty && p2Snap.empty) return;

  const batch = db.batch();
  p1Snap.forEach(doc => batch.update(doc.ref, { player1: newName }));
  p2Snap.forEach(doc => batch.update(doc.ref, { player2: newName }));
  await batch.commit();
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
