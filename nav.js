function renderNav(active){
  const links = [
    { href:'index.html', label:'Home', key:'home' },
    { href:'league.html', label:'League', key:'league' },
    { href:'tournament.html', label:'Tournament', key:'tournament' },
    { href:'champions.html', label:'Roll of Champions', key:'champions' },
    { href:'admin.html', label:'Admin', key:'admin' }
  ];

  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = `
    <div class="top-inner">
      <a href="index.html" class="brand">AFK <span>LEAGUE</span></a>
    </div>
    <nav class="tabs">
      ${links.map(l => `<a href="${l.href}" class="${l.key===active ? 'active' : ''}">${l.label}</a>`).join('')}
    </nav>
  `;
  document.body.prepend(header);
}

function fmtDate(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}

function initials(name){
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0,3)
    .toUpperCase();
}

function escapeHtml(str){
  return (str || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
