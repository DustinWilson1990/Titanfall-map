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
  // Background parchment image (upload assets/map.png)
  L.imageOverlay(image, bounds).addTo(map);
  map.fitBounds(bounds);

  // Marker icons (basic)
  const icon = (emoji) => L.divIcon({
    className: 'poi',
    html: `<div style="font-size:20px">${emoji}</div>`,
    iconSize: [24,24],
    iconAnchor: [12,12]
  });

  const typeEmoji = {
    city: '🏰',
    tavern: '🍺',
    district: '🎭',
    wilderness: '🌲',
    dungeon: '🗝️',
    default: '📍'
  };

  // Add POIs
  data.pois.forEach(p => {
    const em = typeEmoji[p.type] || typeEmoji.default;
    const marker = L.marker([p.coord[1], p.coord[0]], { icon: icon(em) }).addTo(map);

    marker.on('click', () => {
      showSheet(p);
    });

    marker.bindTooltip(p.name, { permanent: false, direction: 'top' });
  });

  function showSheet(p) {
    sheet.innerHTML = `
      <h2>${p.name}</h2>
      <div class="tags">${[p.type, p.level].filter(Boolean).join(' • ')}</div>
      <p>${p.summary || ''}</p>
      ${p.tags ? `<p><strong>Tags:</strong> ${p.tags.join(', ')}</p>` : ''}
    `;
    sheet.hidden = false;
  }

  // GM mode visual toggle (we’ll use this later for fog-of-war editing)
  let gm = false;
  gmBtn.addEventListener('click', () => {
    gm = !gm;
    gmBtn.textContent = `GM Mode: ${gm ? 'On' : 'Off'}`;
    gmBtn.setAttribute('aria-pressed', String(gm));
    document.getElementById('map').classList.toggle('gm', gm);
    if (!gm) sheet.hidden = true;
  });

  // Close sheet on map click
  map.on('click', () => { sheet.hidden = true; });
})();