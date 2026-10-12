renderNav('champions');

const listEl = document.getElementById('champions-list');

async function loadChampions(){
  listEl.innerHTML = '<div class="empty">Loading roll of champions…</div>';
  const snap = await db.collection('champions').orderBy('date', 'desc').get();

  if(snap.empty){
    listEl.innerHTML = '<div class="empty">No champions crowned yet.</div>';
    return;
  }

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  listEl.innerHTML = `<div class="card" style="padding:4px 16px">${rows.map(c => `
    <div class="champion-row">
      <div class="trophy">🏆</div>
      <div class="champion-info">
        <div class="champion-season">${escapeHtml(c.season || '')}</div>
        <div class="champion-name">${escapeHtml(c.winner)}</div>
        <div class="champion-tag">${escapeHtml(c.competition || '')}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

loadChampions();
