// ============================================================
// map.js - Bản đồ Leaflet hiển thị dự án
// ============================================================

let mapInstance = null;
let markersLayer = null;

function initMap() {
  if (mapInstance) return;

  mapInstance = L.map('map').setView([21.0285, 105.8048], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(mapInstance);

  markersLayer = L.layerGroup().addTo(mapInstance);
}

function renderMap(projects) {
  if (!document.getElementById('map')) return;

  if (!mapInstance) {
    initMap();
  } else {
    // Cần setTimeout để Leaflet render đúng khi tab được bật
    setTimeout(() => mapInstance.invalidateSize(), 100);
  }

  markersLayer.clearLayers();

  const validProjects = projects.filter(p => p.lat && p.lng);

  if (validProjects.length === 0) return;

  validProjects.forEach(p => {
    const color = p.status === 'dang-mo-ban' ? '#057a55' :
                  p.status === 'sap-mo-ban' ? '#c27803' : '#6b7280';

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        background:${color};
        width:14px;height:14px;
        border-radius:50%;
        border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        cursor:pointer;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const priceText = p.priceFrom && p.priceTo
      ? `${(p.priceFrom / 1000000).toFixed(1)}–${(p.priceTo / 1000000).toFixed(1)} triệu/m²`
      : 'Đang cập nhật';

    const deadlineText = p.deadline
      ? new Date(p.deadline).toLocaleDateString('vi-VN')
      : 'Chưa xác định';

    const popupHtml = `
      <div class="map-popup" style="min-width:220px;max-width:260px">
        <div class="popup-title">${escapeHtml(p.name)}</div>
        <div class="popup-addr">📍 ${escapeHtml(p.address)}</div>
        <div style="margin-bottom:6px">
          <span style="
            display:inline-block;
            background:${color}22;
            color:${color};
            border-radius:12px;
            padding:2px 10px;
            font-size:11px;
            font-weight:600;
          ">${escapeHtml(p.statusLabel)}</span>
        </div>
        <div class="popup-price">💰 ${priceText}</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px">
          🏠 ${p.totalUnits ? p.totalUnits.toLocaleString('vi-VN') + ' căn' : '—'}
          &nbsp;•&nbsp; 📅 HN: ${deadlineText}
        </div>
        <a href="chi-tiet.html?id=${p.id}" class="popup-link">Xem chi tiết →</a>
      </div>`;

    const marker = L.marker([p.lat, p.lng], { icon })
      .bindPopup(popupHtml, { maxWidth: 280 })
      .addTo(markersLayer);

    marker.on('mouseover', function () { this.openPopup(); });
  });

  // Fit map to markers
  if (validProjects.length > 0) {
    const bounds = L.latLngBounds(validProjects.map(p => [p.lat, p.lng]));
    mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
