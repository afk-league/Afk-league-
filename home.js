renderNav('home');

const feedEl = document.getElementById('feed');

function fixtureCard(f){
  const homeWon = f.status === 'ft' && f.homeScore > f.awayScore;
  const awayWon = f.status === 'ft' && f.awayScore > f.homeScore;
  const statusLabel = f.status === 'live' ? `Live${f.minute ? ' ' + f.minute + "'" : ''}`
    : f.status === 'ft' ? 'FT'
    : fmtDate(f.date);

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
      <span>${escapeHtml(f.competition)}</span>
    </div>
  `;
}

async function loadFeed(){
  feedEl.innerHTML = '<div class="empty">Loading fixtures…</div>';

  const [leagueSnap, tourneySnap] = await Promise.all([
    db.collection('leagueFixtures').orderBy('date', 'desc').limit(10).get(),
    db.collection('tournamentMatches').orderBy('date', 'desc').limit(10).get()
  ]);

  const items = [];

  leagueSnap.forEach(doc => {
    const d = doc.data();
    items.push({
      home: d.home, away: d.away,
      homeScore: d.homeScore, awayScore: d.awayScore,
      status: d.status, date: d.date, minute: d.minute,
      competition: 'AFK League'
    });
  });

  tourneySnap.forEach(doc => {
    const d = doc.data();
    items.push({
      home: d.player1, away: d.player2,
      homeScore: d.score1, awayScore: d.score2,
      status: d.status, date: d.date, minute: d.minute,
      competition: `AFK Tournament · ${d.round || ''}`
    });
  });

  if(items.length === 0){
    feedEl.innerHTML = '<div class="empty">No fixtures yet. Check back once the admins post the schedule.</div>';
    return;
  }

  // Oldest first, most recent last — still only keeping the most recent
  // batch of matches (the query above already limited to the latest 10
  // per collection), just displayed in chronological order.
  items.sort((a,b) => {
    const ta = a.date?.toMillis ? a.date.toMillis() : 0;
    const tb = b.date?.toMillis ? b.date.toMillis() : 0;
    return ta - tb;
  });

  feedEl.innerHTML = items.slice(-8).map(fixtureCard).join('');
}

loadFeed();
