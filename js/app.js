(async function () {
  const gmBtn = document.getElementById('gmToggle');
  const sheet = document.getElementById('sheet');
  const searchInput = document.getElementById('search');
  const typeChecks = Array.from(document.querySelectorAll('.type-filter'));
  const fogCanvas = document.getElementById('fog');
  const fogCtx = fogCanvas.getContext('2d');

  // Load data
  const data = await fetch('/data/pois.json').then(r => r.json());
  const { width, height, image } = data.meta.map;

  // Map setup (pixel CRS)
  const bounds = [[0,0],[height,width]]; // [y,x]
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true
  });
  L.imageOverlay(image, bounds, {opacity: 1}).addTo(map);
  map.fitBounds(bounds);

  // Regions (optional soft overlays)
  if (Array.isArray(data.regions)) {
    data.regions.forEach(r => {
      const latlngs = r.polygon.map(([x,y]) => [y,x]); // swap to [lat, lng] = [y,x]
      L.polygon(latlngs, {
        color: r.style?.stroke || '#8f6b3a',
        weight: 2,
        fillColor: r.style?.fill || '#c8b89a',
        fillOpacity: r.style?.opacity ?? 0.15
      }).addTo(map).bindTooltip(r.name, {direction:'center'});
    });
  }

  // Marker icons
  const typeEmoji = { city:'🏰', tavern:'🍺', district:'🎭', wilderness:'🌲', dungeon:'🗝️', trial:'⚖️', default:'📍' };
  const icon = (emoji) => L.divIcon({
    className: 'poi',
    html: `<div class="poi-chip">${emoji}</div>`,
    iconSize: [32,32], iconAnchor: [16,16]
  });

  // Build markers
  const markers = data.pois.map(p => {
    const em = typeEmoji[p.type] || typeEmoji.default;
    const m = L.marker([p.coord[1], p.coord[0]], { icon: icon(em) })
      .addTo(map)
      .bindTooltip(p.name, { permanent:false, direction:'top', offset:[0,-6] });
    m.on('click', () => showSheet(p));
    return { p, m };
  });

  // Sheet renderer
  function showSheet(p) {
    sheet.innerHTML = `
      <div class="handle"></div>
      <h2>${p.name}</h2>
      <div class="sub">${[p.type, p.level].filter(Boolean).join(' • ')}</div>
      ${p.image ? `<img class="cover" src="${p.image}" alt="${p.name}">` : ''}
      <p>${p.summary || ''}</p>
      ${p.lore ? `<div class="card"><strong>Lore</strong><p>${p.lore}</p></div>` : ''}
      ${p.npcs?.length ? `<div class="card"><strong>NPCs</strong><ul>${p.npcs.map(n=>`<li><strong>${n.name}:</strong> ${n.note||''}</li>`).join('')}</ul></div>` : ''}
      ${p.hooks?.length ? `<div class="card"><strong>Hooks</strong><ul>${p.hooks.map(h=>`<li>${h}</li>`).join('')}</ul></div>` : ''}
      ${p.tags?.length ? `<div class="tags">${p.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>` : ''}
      <div class="actions">
        <button title="Center on map" id="centerBtn">Center</button>
        <button title="Copy link" id="linkBtn">Copy link</button>
      </div>
    `;
    sheet.hidden = false;
    sheet.classList.add('show');

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

  // Deep link open
  function openFromHash() {
    const id = location.hash.replace('#','');
    if (!id) return;
    const found = data.pois.find(x=>x.id===id);
    if (found) { map.setView([found.coord[1], found.coord[0]], 0); showSheet(found); }
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  // Search + Filter
  function activeTypes() {
    return new Set(typeChecks.filter(c=>c.checked).map(c=>c.value));
  }
  function matchesSearch(p, q) {
    if (!q) return true;
    q = q.toLowerCase();
    const hay = [
      p.name, p.summary, p.lore, p.level,
      ...(p.tags||[]), ...(p.hooks||[]),
      ...((p.npcs||[]).map(n=>`${n.name} ${n.note||''}`))
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }
  function applyFilters() {
    const types = activeTypes();
    const q = searchInput.value.trim();
    markers.forEach(({p,m}) => {
      const okType = types.has(p.type) || (p.type==='district' && types.has('district')) || (p.tags||[]).includes('trial') && types.has('trial');
      const okSearch = matchesSearch(p, q);
      const visible = okType && okSearch;
      if (visible) m.addTo(map); else m.remove();
    });
  }
  searchInput.addEventListener('input', applyFilters);
  typeChecks.forEach(c=>c.addEventListener('change', applyFilters));
  applyFilters();

  // GM mode
  let gm = false;
  gmBtn.addEventListener('click', () => {
    gm = !gm;
    gmBtn.textContent = `GM Mode: ${gm ? 'On' : 'Off'}`;
    gmBtn.setAttribute('aria-pressed', String(gm));
    document.getElementById('map').classList.toggle('gm', gm);
    fogCanvas.style.pointerEvents = gm ? 'auto' : 'none';
  });

  // ====== FOG OF WAR (Canvas overlay) ======
  // Stored as "strokes": {x,y,r,erase} in image pixel coords.
  const FOG_KEY = 'titanfall_fog_v1';
  let strokes = loadFog();
  let drawing = false;
  let erasing = false;

  // Resize and sync canvas to map size & position
  function syncCanvas() {
    const size = map.getSize();
    fogCanvas.width = size.x;
    fogCanvas.height = size.y;
    drawFog();
  }
  map.on('resize zoom move', syncCanvas);
  syncCanvas();

  function latLngToPixel(latlng) {
    // Convert latlng to container point (pixel on screen)
    return map.latLngToContainerPoint(latlng);
  }
  function imgXYtoLatLng(x, y) {
    // Convert image coords to latlng
    return L.latLng(y, x);
  }
  function containerPointToImgXY(pt) {
    // Convert container pixel to image coords
    const latlng = map.containerPointToLatLng(pt);
    return [latlng.lng, latlng.lat]; // [x,y] in image coords
  }

  // Draw fog: dark overlay, then reveal/erase circles
  function drawFog() {
    fogCtx.clearRect(0,0,fogCanvas.width, fogCanvas.height);
    // Full dark veil
    fogCtx.fillStyle = 'rgba(0,0,0,0.55)';
    fogCtx.fillRect(0,0,fogCanvas.width, fogCanvas.height);

    // Composite reveals (draw destination-out for reveal, destination-in for erase inverse)
    strokes.forEach(s => {
      const latlng = imgXYtoLatLng(s.x, s.y);
      const pt = latLngToPixel(latlng);
      fogCtx.save();
      fogCtx.globalCompositeOperation = s.erase ? 'source-over' : 'destination-out';
      fogCtx.beginPath();
      fogCtx.arc(pt.x, pt.y, s.r / map.getZoomScale(map.getZoom(), 0), 0, Math.PI*2);
      fogCtx.fillStyle = s.erase ? 'rgba(0,0,0,0.55)' : '#000';
      fogCtx.fill();
      fogCtx.restore();
    });
  }

  function saveFog() {
    localStorage.setItem(FOG_KEY, JSON.stringify(strokes));
  }
  function loadFog() {
    try {
      const raw = localStorage.getItem(FOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // Touch/mouse handlers
  function pointerDown(e) {
    if (!gm) return;
    drawing = true;
    erasing = (e.touches && e.touches.length >= 2); // two fingers = erase
    fogCanvas.setPointerCapture?.(e.pointerId || 0);
    addStroke(e);
  }
  function pointerMove(e) {
    if (!gm || !drawing) return;
    addStroke(e);
  }
  function pointerUp() {
    if (!drawing) return;
    drawing = false;
    saveFog();
  }

  function addStroke(e) {
    const rect = fogCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : (e.clientX || 0);
    const clientY = e.touches ? e.touches[0].clientY : (e.clientY || 0);
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Convert to image coords for persistence
    const imgXY = containerPointToImgXY(L.point(x,y));
    const radius = 80; // base reveal radius in image pixels

    strokes.push({ x: imgXY[0], y: imgXY[1], r: radius, erase: erasing });
    drawFog();
  }

  // Enable interaction only in GM
  fogCanvas.style.touchAction = 'none';
  fogCanvas.addEventListener('pointerdown', pointerDown);
  fogCanvas.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  fogCanvas.addEventListener('touchstart', e => { if (gm) e.preventDefault(); }, {passive:false});
  fogCanvas.addEventListener('touchmove',  e => { if (gm) e.preventDefault(); }, {passive:false});

  // Initial draw
  drawFog();

  // Close sheet on map tap
  map.on('click', () => { sheet.classList.remove('show'); setTimeout(()=> sheet.hidden = true, 160); });
})();