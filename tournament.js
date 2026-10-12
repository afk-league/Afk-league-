renderNav('tournament');

const bracketEl = document.getElementById('bracket');
const ROUND_ORDER = ['Quarter-Final', 'Semi-Final', 'Final'];

function matchCard(m){
  const p1Won = m.status === 'ft' && m.score1 > m.score2;
  const p2Won = m.status === 'ft' && m.score2 > m.score1;
  const statusLabel = m.status === 'live' ? 'Live' : m.status === 'ft' ? 'FT' : fmtDate(m.date);

  return `
    <div class="card match-card">
      <div class="team-row">
        <span class="team-name ${p1Won ? 'winner' : ''}">${escapeHtml(m.player1 || 'TBD')}</span>
        <span class="score">${m.status === 'scheduled' ? '' : m.score1 ?? 0}</span>
      </div>
      <div class="team-row">
        <span class="team-name ${p2Won ? 'winner' : ''}">${escapeHtml(m.player2 || 'TBD')}</span>
        <span class="score">${m.status === 'scheduled' ? '' : m.score2 ?? 0}</span>
      </div>
      <div class="meta-row" style="margin:2px 0 0">
        <span class="status ${m.status === 'live' ? 'live' : ''}">${statusLabel}</span>
      </div>
    </div>
  `;
}

async function loadBracket(){
  bracketEl.innerHTML = '<div class="empty">Loading bracket…</div>';

  const [matchSnap, playerSnap] = await Promise.all([
    db.collection('tournamentMatches').orderBy('order', 'asc').get(),
    db.collection('tournamentPlayers').orderBy('seed', 'asc').get()
  ]);

  if(matchSnap.empty){
    const players = [];
    playerSnap.forEach(doc => players.push(doc.data()));
    if(players.length){
      bracketEl.innerHTML = `
        <div class="card">
          <div class="round-label">Entrants (${players.length}/8)</div>
          ${players.map(p => `<div class="team-row" style="margin-bottom:8px">
            <span class="badge">${initials(p.name)}</span><span class="team-name">${escapeHtml(p.name)}</span>
          </div>`).join('')}
        </div>`;
    } else {
      bracketEl.innerHTML = '<div class="empty">No tournament running yet. Check back once admins set the bracket.</div>';
    }
    return;
  }

  const byRound = {};
  matchSnap.forEach(doc => {
    const d = doc.data();
    const round = d.round || 'Round';
    (byRound[round] = byRound[round] || []).push(d);
  });

  const orderedRounds = Object.keys(byRound).sort(
    (a,b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b)
  );

  bracketEl.innerHTML = orderedRounds.map(round => `
    <div>
      <div class="round-label">${escapeHtml(round)}</div>
      ${byRound[round].map(matchCard).join('')}
    </div>
  `).join('');
}

loadBracket();
