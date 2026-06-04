// ============================================================
// main.js - Danh sách dự án, tìm kiếm, lọc
// ============================================================

let allProjects = [];
let filteredProjects = [];
let currentView = 'grid';
let currentStatus = '';
let currentDistrict = '';
let searchQuery = '';

// Load dữ liệu
async function loadProjects() {
  try {
    // Thử gọi API backend trước
    const res = await fetch('/api/projects');
    if (res.ok) {
      allProjects = await res.json();
    } else {
      throw new Error('API not available');
    }
  } catch {
    // Fallback: đọc trực tiếp JSON (khi mở file trực tiếp không qua server)
    try {
      const res = await fetch('data/projects.json');
      allProjects = await res.json();
    } catch {
      allProjects = [];
    }
  }

  populateDistrictFilter();
  updateStats();
  applyFilters();
  hideSkeleton();
}

function hideSkeleton() {
  const skeleton = document.getElementById('skeleton');
  if (skeleton) skeleton.style.display = 'none';
}

// Populate district dropdown
function populateDistrictFilter() {
  const select = document.getElementById('district-filter');
  if (!select) return;
  const districts = [...new Set(allProjects.map(p => p.district).filter(Boolean))].sort();
  districts.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    currentDistrict = select.value;
    applyFilters();
  });
}

// Cập nhật thống kê
function updateStats() {
  const statTotal = document.getElementById('stat-total');
  const statOpen = document.getElementById('stat-open');
  const statSoon = document.getElementById('stat-soon');
  const statUnits = document.getElementById('stat-units');

  if (statTotal) statTotal.textContent = allProjects.length;
  if (statOpen) statOpen.textContent = allProjects.filter(p => p.status === 'dang-mo-ban').length;
  if (statSoon) statSoon.textContent = allProjects.filter(p => p.status === 'sap-mo-ban').length;
  if (statUnits) {
    const total = allProjects.reduce((s, p) => s + (p.totalUnits || 0), 0);
    statUnits.textContent = total.toLocaleString('vi-VN');
  }
}

// Áp dụng bộ lọc
function applyFilters() {
  filteredProjects = allProjects.filter(p => {
    if (currentStatus && p.status !== currentStatus) return false;
    if (currentDistrict && p.district !== currentDistrict) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.district || '').toLowerCase().includes(q) ||
        (p.developer || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.innerHTML = `Hiển thị <strong>${filteredProjects.length}</strong> dự án${searchQuery ? ` cho "<strong>${searchQuery}</strong>"` : ''}`;
  }

  renderCurrentView();
}

// Xử lý tìm kiếm
function handleSearch() {
  const input = document.getElementById('search-input');
  searchQuery = input ? input.value.trim() : '';
  applyFilters();
}

// Lắng nghe Enter
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });
  searchInput.addEventListener('input', e => {
    if (e.target.value === '') {
      searchQuery = '';
      applyFilters();
    }
  });
}

// Filter buttons
document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    applyFilters();
  });
});

// Chuyển view
function switchView(view) {
  currentView = view;
  ['grid', 'list', 'map'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const btn = document.getElementById(`btn-${v}`);
    if (el) el.style.display = v === view ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', v === view);
  });

  if (view === 'grid' || view === 'list') renderCurrentView();
  if (view === 'map' && typeof renderMap === 'function') renderMap(filteredProjects);
}

function renderCurrentView() {
  if (currentView === 'grid') renderGrid();
  else if (currentView === 'list') renderList();
  else if (currentView === 'map' && typeof renderMap === 'function') renderMap(filteredProjects);
}

// ========== RENDER GRID ==========
function renderGrid() {
  const container = document.getElementById('projects-grid');
  if (!container) return;

  if (filteredProjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🔍</div>
        <h3>Không tìm thấy dự án</h3>
        <p>Thử thay đổi từ khóa hoặc bộ lọc</p>
      </div>`;
    return;
  }

  container.innerHTML = filteredProjects.map(p => `
    <div class="project-card" onclick="goToDetail(${p.id})">
      <div class="card-header">
        <div class="card-title">${escHtml(p.name)}</div>
        <span class="badge ${statusBadge(p.status)}">${escHtml(p.statusLabel)}</span>
      </div>
      <div class="card-body">
        <div class="card-address">
          <span>📍</span>
          <span>${escHtml(p.address)}</span>
        </div>
        <div class="card-info">
          <div class="info-item">
            <div class="label">Giá bán</div>
            <div class="value price">${formatPriceRange(p)}</div>
          </div>
          <div class="info-item">
            <div class="label">Diện tích</div>
            <div class="value">${p.areaFrom && p.areaTo ? `${p.areaFrom}–${p.areaTo} m²` : '—'}</div>
          </div>
          <div class="info-item">
            <div class="label">Tổng căn hộ</div>
            <div class="value">${p.totalUnits ? p.totalUnits.toLocaleString('vi-VN') + ' căn' : '—'}</div>
          </div>
          <div class="info-item">
            <div class="label">Đợt mở bán</div>
            <div class="value">${escHtml(p.round || '—')}</div>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <span class="card-deadline ${isUrgent(p.deadline) ? 'urgent' : ''}">
          ${deadlineText(p.deadline)}
        </span>
        <span class="btn btn-primary btn-sm">Xem chi tiết →</span>
      </div>
    </div>
  `).join('');
}

// ========== RENDER LIST ==========
function renderList() {
  const container = document.getElementById('projects-list');
  if (!container) return;

  if (filteredProjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>Không tìm thấy dự án</h3>
        <p>Thử thay đổi từ khóa hoặc bộ lọc</p>
      </div>`;
    return;
  }

  container.innerHTML = filteredProjects.map((p, i) => `
    <div class="list-item" onclick="goToDetail(${p.id})">
      <div class="list-num">${i + 1}</div>
      <div class="list-main">
        <div class="list-title">${escHtml(p.name)}</div>
        <div class="list-addr">📍 ${escHtml(p.address)}</div>
      </div>
      <div class="list-meta">
        <div class="meta-item">
          <div class="label">Giá</div>
          <div class="value" style="color:var(--primary)">${formatPriceRange(p)}</div>
        </div>
        <div class="meta-item">
          <div class="label">Trạng thái</div>
          <div class="value">
            <span class="badge ${statusBadge(p.status)}">${escHtml(p.statusLabel)}</span>
          </div>
        </div>
        <div class="meta-item">
          <div class="label">Căn hộ</div>
          <div class="value">${p.totalUnits ? p.totalUnits.toLocaleString('vi-VN') : '—'}</div>
        </div>
      </div>
      <span class="btn btn-outline btn-sm" style="white-space:nowrap">Chi tiết →</span>
    </div>
  `).join('');
}

// ========== HELPERS ==========
function goToDetail(id) {
  window.location.href = `chi-tiet.html?id=${id}`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  if (status === 'dang-mo-ban') return 'badge-success';
  if (status === 'sap-mo-ban') return 'badge-warning';
  return 'badge-danger';
}

function formatPriceRange(p) {
  if (!p.priceFrom || !p.priceTo) return '—';
  const from = (p.priceFrom / 1000000).toFixed(1);
  const to = (p.priceTo / 1000000).toFixed(1);
  return `${from}–${to} tr/m²`;
}

function deadlineText(deadline) {
  if (!deadline) return '📅 Chưa xác định';
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return '⚫ Đã hết hạn';
  if (diff <= 7) return `⚠️ Còn ${diff} ngày`;
  return `📅 HN: ${d.toLocaleDateString('vi-VN')}`;
}

function isUrgent(deadline) {
  if (!deadline) return false;
  const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 7;
}

// Khởi động
loadProjects();
