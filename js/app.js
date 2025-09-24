(async function () {
  const gmBtn = document.getElementById('gmToggle');
  const sheet = document.getElementById('sheet');

  // Load POIs & map meta
  const data = await fetch('/data/pois.json').then(r => r.json());
  const { width, height, image } = data.meta.map;

  // Leaflet with simple (pixel) CRS
  const bounds = [[0,0],[height,width]]; // [y,x]
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true
  });

  // Background parchment image
  L.imageOverlay(image, bounds, {opacity: 1}).addTo(map);
  map.fitBounds(bounds);

  // Friendly emoji per type
  const typeEmoji = {
    city: '🏰', tavern: '🍺', district: '🎭', wilderness: '🌲', dungeon: '🗝️', default: '📍'
  };

  // Marker factory
  const icon = (emoji) => L.divIcon({
    className: 'poi',
    html: `<div class="poi-chip">${emoji}</div>`,
    iconSize: [32,32],
    iconAnchor: [16,16]
  });

  // Add POIs
  data.pois.forEach(p => {
    const em = typeEmoji[p.type] || typeEmoji.default;
    const marker = L.marker([p.coord[1], p.coord[0]], { icon: icon(em) }).addTo(map);
    marker.bindTooltip(p.name, { permanent: false, direction: 'top', offset: [0, -6] });
    marker.on('click', () => showSheet(p));
  });

  function showSheet(p) {
    sheet.innerHTML = `
      <div class="handle"></div>
      <h2>${p.name}</h2>
      <div class="sub">${[p.type, p.level].filter(Boolean).join(' • ')}</div>
      ${p.image ? `<img class="cover" src="${p.image}" alt="${p.name}">` : ''}
      <p>${p.summary || ''}</p>
      ${p.tags && p.tags.length ? `<div class="tags">${p.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>` : ''}
      <div class="actions">
        <button title="Center on map" id="centerBtn">Center</button>
        <button title="Copy link" id="linkBtn">Copy link</button>
      </div>
    `;
    sheet.hidden = false;
    sheet.classList.add('show');

    // Actions
    sheet.querySelector('#centerBtn')?.addEventListener('click', () => {
      map.setView([p.coord[1], p.coord[0]], Math.max(map.getZoom(), 0));
    });
    sheet.querySelector('#linkBtn')?.addEventListener('click', async () => {
      const url = new URL(window.location.href);
      url.hash = `#${p.id}`;
      try {
        await navigator.clipboard.writeText(url.toString());
        sheet.querySelector('#linkBtn').textContent = 'Copied!';
        setTimeout(()=> sheet.querySelector('#linkBtn').textContent = 'Copy link', 1200);
      } catch {}
    });
  }

  // Deep link support (/#poiId)
  function openFromHash() {
    const id = location.hash.replace('#','');
    if (!id) return;
    const p = data.pois.find(x=>x.id===id);
    if (p) {
      map.setView([p.coord[1], p.coord[0]], 0);
      showSheet(p);
    }
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  // GM mode visual toggle (we’ll use this later for fog-of-war editing)
  let gm = false;
  gmBtn.addEventListener('click', () => {
    gm = !gm;
    gmBtn.textContent = `GM Mode: ${gm ? 'On' : 'Off'}`;
    gmBtn.setAttribute('aria-pressed', String(gm));
    document.getElementById('map').classList.toggle('gm', gm);
    if (!gm) { /* keep sheet open */ }
  });

  // Close sheet on map click (tap outside)
  map.on('click', () => { sheet.classList.remove('show'); setTimeout(()=> sheet.hidden = true, 160); });
})();