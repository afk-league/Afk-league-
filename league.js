renderNav('league');

const tableBody = document.getElementById('table-body');
const fixturesEl = document.getElementById('fixtures');
const viewButtons = document.querySelectorAll('.view-toggle button');
const views = { fixtures: document.getElementById('view-fixtures'), table: document.getElementById('view-table') };

viewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    viewButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(views).forEach(v => v.style.display = 'none');
    views[btn.dataset.view].style.display = 'block';
  });
});

function fixtureCard(f){
  const homeWon = f.status === 'ft' && f.homeScore > f.awayScore;
  const awayWon = f.status === 'ft' && f.awayScore > f.homeScore;
  const statusLabel = f.status === 'live' ? `Live${f.minute ? ' ' + f.minute + "'" : ''}`
    : f.status === 'ft' ? 'FT'
    : '';

  return `
    <div class="card fixture">
      <div class="teams">
        <div class="team-row">
          <span class="badge">${initials(f.home)}</span>
          <span class="team-name ${homeWon ? 'winner' : ''}">${escapeHtml(f.home)}</span>
        </div>
        <div class="team-row">
          <span class="badge alt">${initials(f.away)}</span>
          <span class="team-name ${awayWon ? 'winner' : ''}">${escapeHtml(f.away)}</span>
        </div>
      </div>
      <div class="score-col">
        <span class="score">${f.status === 'scheduled' ? '' : f.homeScore ?? 0}</span>
        <span class="score">${f.status === 'scheduled' ? '' : f.awayScore ?? 0}</span>
      </div>
    </div>
    <div class="meta-row" style="margin-top:-6px">
      <span class="status ${f.status === 'live' ? 'live' : ''}">${statusLabel}</span>
      <span>Matchday ${f.matchday ?? '-'}</span>
    </div>
  `;
}

// Live listener: the page updates automatically whenever the admin saves.
function loadFixtures(){
  fixturesEl.innerHTML = '<div class="empty">Loading fixtures…</div>';
  db.collection('leagueFixtures').onSnapshot(snap => {
    if (snap.empty) {
      fixturesEl.innerHTML = '<div class="empty">No fixtures posted yet.</div>';
      return;
    }
    const fixtures = [];
    snap.forEach(doc => fixtures.push(doc.data()));

    // Sort by matchday number first, then by date within the same matchday.
    fixtures.sort((a, b) => {
      const mdA = a.matchday ?? 0, mdB = b.matchday ?? 0;
      if (mdA !== mdB) return mdA - mdB;
      const ta = a.date?.toMillis ? a.date.toMillis() : 0;
      const tb = b.date?.toMillis ? b.date.toMillis() : 0;
      return ta - tb;
    });

    fixturesEl.innerHTML = fixtures.map(fixtureCard).join('');
  }, err => {
    console.error(err);
    fixturesEl.innerHTML = '<div class="empty">Could not load fixtures.</div>';
  });
}

function loadTable(){
  tableBody.innerHTML = `<tr><td colspan="8" class="empty">Loading table…</td></tr>`;
  db.collection('leagueTeams').onSnapshot(snap => {
    if (snap.empty) {
      tableBody.innerHTML = `<tr><td colspan="8" class="empty">No teams added yet.</td></tr>`;
      return;
    }
    const teams = [];
    snap.forEach(doc => teams.push(doc.data()));

    teams.sort((a, b) => {
      const pa = a.points || 0, pb = b.points || 0;
      if (pb !== pa) return pb - pa;
      const gdA = (a.gf||0) - (a.ga||0), gdB = (b.gf||0) - (b.ga||0);
      if (gdB !== gdA) return gdB - gdA;
      return (b.gf||0) - (a.gf||0);
    });

    tableBody.innerHTML = teams.map((t, i) => {
      const gd = (t.gf||0) - (t.ga||0);
      return `
        <tr>
          <td><span class="pos">${i+1}</span></td>
          <td>
            <div class="team-cell">
              <span class="badge" style="width:22px;height:22px;font-size:10px">${initials(t.name)}</span>
              ${escapeHtml(t.name)}
            </div>
          </td>
          <td class="num">${t.played||0}</td>
          <td class="num">${t.won||0}</td>
          <td class="num">${t.drawn||0}</td>
          <td class="num">${t.lost||0}</td>
          <td class="num">${gd > 0 ? '+' + gd : gd}</td>
          <td class="num pts">${t.points||0}</td>
        </tr>
      `;
    }).join('');
  }, err => {
    console.error(err);
    tableBody.innerHTML = `<tr><td colspan="8" class="empty">Could not load table.</td></tr>`;
  });
}

loadFixtures();
loadTable();
