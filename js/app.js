/**
 * EquipVault — Main Application Controller (Rebuilt)
 * Dark Charcoal / Gold Enterprise Design
 */
document.addEventListener('DOMContentLoaded', async () => {

  /* ═══════ STATE ═══════ */
  const S = {
    user: null, role: 'Borrower', tab: 'dashboard', viewMode: 'grid',
    equipment: [], requests: [], returns: [], dashboard: null,
    filters: {
      equipment: { category:'All', status:'All', condition:'All', search:'' },
      requests:  { status:'All', search:'' },
      history:   { condition:'All', search:'' }
    }
  };

  /* ═══════ DOM CACHE ═══════ */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  /* ═══════ THEME MANAGEMENT ═══════ */
  function initTheme() {
    const saved = localStorage.getItem('equipvault_theme') || 'dark';
    applyTheme(saved);
    if ($('btn-theme')) {
      $('btn-theme').addEventListener('click', () => {
        const curr = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = curr === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        toast('Theme Changed', `Switched to ${next} mode.`, 'info');
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('equipvault_theme', theme);
    const btn = $('btn-theme');
    if (btn) {
      if (theme === 'light') {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        btn.title = 'Switch to Dark Mode';
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        btn.title = 'Switch to Light Mode';
      }
    }
  }

  /* ═══════ INIT ═══════ */
  async function init() {
    initTheme();
    const conn = await StorageService.init();
    checkSession();
    await refreshAll();
    bindEvents();
    switchTab('dashboard');
  }

  function checkSession() {
    const raw = localStorage.getItem('equipvault_auth_user');
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u.role === 'Borrower') {
          window.location.href = 'borrower.html';
          return;
        }
        loginUser(u, false);
        return;
      } catch(e) { localStorage.removeItem('equipvault_auth_user'); }
    }
    window.location.href = 'login.html';
  }

  async function refreshAll() {
    try {
      const [eq, reqs, rets, dash] = await Promise.all([
        StorageService.getEquipment(),
        StorageService.getRequests(),
        StorageService.getReturns(),
        StorageService.getDashboard()
      ]);
      S.equipment = eq; S.requests = reqs; S.returns = rets; S.dashboard = dash;
      updateBadges();
      renderTab();
    } catch(err) {
      console.error('[EquipVault] Data Error:', err);
      toast('Error', 'Failed to load data: ' + err.message, 'error');
    }
  }

  /* ═══════ BADGES & HEADER ═══════ */
  function updateBadges() {
    if (!S.dashboard) return;
    const m = S.dashboard.metrics;
    // Header chips
    if (m.overdue_count > 0) {
      $('chip-overdue').style.display = 'inline-flex';
      $('chip-overdue-text').textContent = `${m.overdue_count} Overdue`;
      $('badge-overdue').style.display = 'inline-block';
      $('badge-overdue').textContent = m.overdue_count;
    } else {
      $('chip-overdue').style.display = 'none';
      if ($('badge-overdue')) $('badge-overdue').style.display = 'none';
    }
    if (m.pending_requests > 0) {
      $('chip-pending').style.display = 'inline-flex';
      $('chip-pending-text').textContent = `${m.pending_requests} Pending`;
      $('badge-requests').style.display = 'inline-block';
      $('badge-requests').textContent = m.pending_requests;
    } else {
      $('chip-pending').style.display = 'none';
      if ($('badge-requests')) $('badge-requests').style.display = 'none';
    }
    // Equipment badge
    if ($('badge-equipment')) {
      $('badge-equipment').style.display = 'inline-block';
      $('badge-equipment').textContent = m.total_equipment;
      $('badge-equipment').style.background = 'var(--gold-subtle)';
      $('badge-equipment').style.color = 'var(--gold-400)';
      $('badge-equipment').style.border = '1px solid var(--border-gold)';
    }
    // Returns badge & Active Loans indicator
    const activeLoansCount = (S.dashboard && S.dashboard.active_requests) ? S.dashboard.active_requests.length : (m.active_loans != null ? m.active_loans : 0);
    if ($('badge-returns')) {
      if (activeLoansCount > 0) {
        $('badge-returns').style.display = 'inline-block';
        $('badge-returns').textContent = activeLoansCount;
        $('badge-returns').style.background = 'var(--status-borrowed-bg)';
        $('badge-returns').style.color = 'var(--status-borrowed)';
        $('badge-returns').style.border = '1px solid rgba(245,158,11,0.2)';
      } else {
        $('badge-returns').style.display = 'none';
      }
    }
    if ($('returns-active-count')) {
      $('returns-active-count').textContent = `${activeLoansCount} Active Loan${activeLoansCount === 1 ? '' : 's'}`;
      $('returns-active-count').className = activeLoansCount > 0 ? 'badge badge-borrowed' : 'badge badge-available';
    }
  }

  /* ═══════ NAVIGATION ═══════ */
  function switchTab(tab) {
    S.tab = tab;
    $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.view-section').forEach(s => s.classList.toggle('active', s.id === `view-${tab}`));
    renderTab();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderTab() {
    switch(S.tab) {
      case 'dashboard':  renderDashboard(); break;
      case 'equipment':  renderEquipment(); break;
      case 'requests':   renderRequests();  break;
      case 'returns':    renderReturns();   break;
      case 'overdue':    renderOverdue();   break;
      case 'history':    renderHistory();   break;
    }
  }

  function updateRoleView(role) {
    S.role = role;
    const isAdmin = role === 'Administrator';
    const isCustodian = role === 'Equipment Custodian';
    if ($('btn-add-equipment')) $('btn-add-equipment').style.display = 'inline-flex';
    if ($('btn-dash-add-equipment')) $('btn-dash-add-equipment').style.display = 'inline-flex';
    if ($('requests-page-title')) $('requests-page-title').textContent = (role === 'Borrower') ? 'My Borrowing Requests' : 'Borrowing Requests & Approvals';
    renderTab();
  }

  /* ═══════ AUTH ═══════ */
  function loginUser(user, notify) {
    S.user = user; S.role = user.role;
    localStorage.setItem('equipvault_auth_user', JSON.stringify(user));
    const parts = user.name.split(' ');
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : user.name.slice(0,2).toUpperCase();
    $('sidebar-avatar').textContent = initials;
    $('sidebar-user-name').textContent = user.name;
    $('sidebar-user-role').textContent = user.role;
    $('header-avatar').textContent = initials;
    $('header-user-name').textContent = user.name;
    $('header-user-role').textContent = user.role;
    updateRoleView(user.role);
    if (notify) toast('Welcome Back', `Signed in as ${user.name} (${user.role})`, 'success');
  }

  function logout() {
    if (!confirm('Sign out of EquipVault?')) return;
    localStorage.removeItem('equipvault_auth_user');
    window.location.href = 'login.html';
  }

  /* ═══════ 1. DASHBOARD ═══════ */
  function renderDashboard() {
    if (!S.dashboard) return;
    const m = S.dashboard.metrics;
    $('kpi-total').textContent = m.total_equipment;
    $('kpi-available').textContent = m.available_equipment;
    $('kpi-availability-rate').textContent = m.availability_rate;
    $('kpi-available-bar').style.width = `${m.availability_rate}%`;
    const activeLoansCount = (S.dashboard && S.dashboard.active_requests) ? S.dashboard.active_requests.length : (m.active_loans != null ? m.active_loans : 0);
    $('kpi-borrowed').textContent = activeLoansCount;
    $('kpi-borrowed-bar').style.width = `${m.total_equipment > 0 ? (activeLoansCount/m.total_equipment)*100 : 0}%`;
    $('kpi-overdue').textContent = m.overdue_count;
    $('kpi-overdue-bar').style.width = `${m.total_equipment > 0 ? Math.min(100, (m.overdue_count/m.total_equipment)*100) : 0}%`;
    $('kpi-maintenance').textContent = m.maintenance_equipment;
    $('kpi-maintenance-bar').style.width = `${m.total_equipment > 0 ? (m.maintenance_equipment/m.total_equipment)*100 : 0}%`;
    $('kpi-pending').textContent = m.pending_requests;
    $('kpi-pending-bar').style.width = `${Math.min(100, (m.pending_requests/5)*100)}%`;

    // Overdue banner
    if (m.overdue_count > 0) {
      $('overdue-banner').style.display = 'flex';
      $('overdue-banner-title').textContent = `${m.overdue_count} Overdue Loan${m.overdue_count > 1 ? 's' : ''} Detected!`;
    } else {
      $('overdue-banner').style.display = 'none';
    }

    // Active Loans
    const active = S.dashboard.active_requests || [];
    if (active.length === 0) {
      $('dash-active-loans').innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg><h3>No Active Loans</h3><p>All equipment is safely stored.</p></div>`;
    } else {
      $('dash-active-loans').innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Equipment</th><th>Borrower</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${active.slice(0,5).map(r => {
        const bc = r.is_overdue ? 'badge-overdue' : 'badge-borrowed';
        const bt = r.is_overdue ? `Overdue (${r.overdue_days}d)` : 'Active';
        return `<tr><td><div class="table-item-cell"><img class="table-item-img" src="${r.equipment_image||'assets/images/laptop.jpg'}" alt=""><div><div class="table-name">${esc(r.equipment_name)}</div><div class="table-sub">${esc(r.equipment_id)}</div></div></div></td><td><div class="table-name">${esc(r.borrower_name)}</div><div class="table-sub">${esc(r.department||'')}</div></td><td>${fmtDate(r.expected_return_date)}</td><td><span class="badge ${bc}">${bt}</span></td><td><button class="btn btn-secondary btn-sm" onclick="EV.openReturn('${r.id}')">Return</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }

    // Category breakdown
    const cats = S.dashboard.categories_breakdown || [];
    const fills = ['bar-gold','bar-blue','bar-green','bar-purple','bar-rose'];
    if (cats.length === 0) {
      $('dash-category-breakdown').innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No data.</p>';
    } else {
      const maxC = Math.max(...cats.map(c => c.count), 1);
      $('dash-category-breakdown').innerHTML = cats.map((c, i) => `<div class="bar-stat"><div class="bar-stat-labels"><span>${esc(c.category)}</span><span>${c.count} items</span></div><div class="bar-track"><div class="bar-fill ${fills[i % fills.length]}" style="width:${Math.round((c.count/maxC)*100)}%"></div></div></div>`).join('');
    }

    // Activity stream
    const logs = S.dashboard.recent_activities || [];
    if (logs.length === 0) {
      $('dash-activity-stream').innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No recent activity.</p>';
    } else {
      $('dash-activity-stream').innerHTML = logs.slice(0,5).map(l => `<div class="activity-item"><div class="activity-dot"></div><div class="activity-details"><div class="activity-text">${esc(l.details)}</div><div class="activity-meta">${fmtDateTime(l.created_at)} • ${esc(l.performed_by)}</div></div></div>`).join('');
    }
  }

  /* ═══════ 2. EQUIPMENT ═══════ */
  async function renderEquipment() {
    const items = await StorageService.getEquipment(S.filters.equipment);
    const c = $('equipment-container');
    if (items.length === 0) {
      c.className = 'equipment-grid'; c.style.padding = '16px';
      c.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg><h3>No Equipment Found</h3><p>No items match your criteria.</p><button class="btn btn-secondary btn-sm mt-1" onclick="EV.clearEqFilters()">Clear Filters</button></div>`;
      return;
    }
    if (S.viewMode === 'grid') {
      c.className = 'equipment-grid'; c.style.padding = '16px';
      c.innerHTML = items.map(item => {
        const totUnits = Math.max(1, parseInt(item.total_units, 10) || 1);
        const availUnits = item.available_units != null ? parseInt(item.available_units, 10) : (item.status === 'Available' ? totUnits : 0);
        const effectiveStatus = (item.status === 'Under Maintenance') ? 'Under Maintenance' : (availUnits <= 0 ? 'Borrowed' : item.status);
        const sb = statusBadge(effectiveStatus, availUnits, totUnits);
        const cc = condClass(item.condition);
        const canEdit = S.role !== 'Borrower';
        const isAdmin = S.role === 'Administrator';
        const isAvail = effectiveStatus === 'Available' && availUnits > 0;
        const stockPct = totUnits > 0 ? Math.max(0, Math.round((availUnits / totUnits) * 100)) : 0;
        const stockBarColor = effectiveStatus === 'Under Maintenance' ? 'var(--status-maintenance, #f59e0b)'
          : availUnits <= 0 ? 'var(--status-borrowed, #f43f5e)'
          : stockPct > 50 ? 'var(--status-available, #10b981)'
          : 'var(--gold-400, #fbbf24)';
        const unitColor = effectiveStatus === 'Under Maintenance' ? 'var(--gold-400)'
          : availUnits <= 0 ? 'var(--status-borrowed, #f43f5e)'
          : 'var(--status-available, #10b981)';

        return `<article class="equipment-card">
          <div class="equipment-card-media">
            <img src="${item.image_url||'assets/images/laptop.jpg'}" alt="${esc(item.name)}" loading="lazy">
            <div class="badge-float">${sb}</div>
            <div class="cat-float">${esc(item.category)}</div>
          </div>
          <div class="equipment-card-body">
            <div class="eq-id-tag">
              <span class="eq-id">${esc(item.id)}</span>
              <span class="cond-pill ${cc}">${esc(item.condition)}</span>
            </div>
            <h3 class="equipment-card-title">${esc(item.name)}</h3>
            <p class="equipment-card-desc">${esc(item.description||'No description.')}</p>

            <!-- Prominent Unit Stock Box -->
            <div style="margin:8px 0 6px;padding:9px 12px;background:rgba(255,255,255,0.035);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <span style="font-size:0.68rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Units Available</span>
                <span style="font-size:0.86rem;font-weight:800;color:${unitColor};">
                  <span style="font-size:1.05rem;">${availUnits}</span> / ${totUnits} <span style="font-size:0.72rem;font-weight:600;color:var(--text-dim);">available</span>
                </span>
              </div>
              <div style="height:6px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${stockPct}%;background:${stockBarColor};border-radius:99px;transition:width 0.4s ease;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
                <span>${availUnits <= 0 ? '<strong style="color:#f43f5e;">All units borrowed</strong>' : `${availUnits} unit${availUnits > 1 ? 's' : ''} in stock`}</span>
                <span>Limit: ${totUnits} total</span>
              </div>
            </div>

            <div class="eq-meta-row" style="margin-top:auto;padding-top:8px;">
              <div class="eq-meta-item">
                <div class="eq-meta-label">Location</div>
                <div class="eq-meta-val">${esc(item.location||'Main Storage')}</div>
              </div>
              <div class="eq-meta-item">
                <div class="eq-meta-label">Stock Units</div>
                <div class="eq-meta-val" style="font-weight:700;color:${unitColor};">${availUnits} / ${totUnits}</div>
              </div>
              <div class="eq-meta-item">
                <div class="eq-meta-label">Borrows</div>
                <div class="eq-meta-val">${item.total_borrows||0} loans</div>
              </div>
            </div>
          </div>
          <div class="equipment-card-actions">
            <button class="btn btn-secondary btn-sm" style="flex:1" onclick="EV.openDetails('${item.id}')" title="Specs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Specs
            </button>
            ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="EV.openEdit('${item.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit
            </button>` : ''}
            ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="EV.deleteEq('${item.id}')" title="Delete" style="color:#ef4444" ${effectiveStatus==='Borrowed'?'disabled':''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>` : ''}
          </div>
        </article>`;
      }).join('');
    } else {
      c.className = 'table-wrapper'; c.style.padding = '0';
      c.innerHTML = `<table class="data-table"><thead><tr><th>Equipment</th><th>Category</th><th>Units Available</th><th>Condition</th><th>Status</th><th>Location</th><th>Loans</th><th>Actions</th></tr></thead><tbody>${items.map(item => {
        const totUnits = Math.max(1, parseInt(item.total_units, 10) || 1);
        const availUnits = item.available_units != null ? parseInt(item.available_units, 10) : (item.status === 'Available' ? totUnits : 0);
        const effectiveStatus = (item.status === 'Under Maintenance') ? 'Under Maintenance' : (availUnits <= 0 ? 'Borrowed' : item.status);
        const stockPct = totUnits > 0 ? Math.max(0, Math.round((availUnits / totUnits) * 100)) : 0;
        const stockBarColor = effectiveStatus === 'Under Maintenance' ? 'var(--gold-400)' : availUnits <= 0 ? '#f43f5e' : stockPct > 50 ? 'var(--status-available)' : 'var(--gold-400)';
        return `<tr><td><div class="table-item-cell"><img class="table-item-img" src="${item.image_url||'assets/images/laptop.jpg'}" alt=""><div><div class="table-name">${esc(item.name)}</div><div class="table-sub table-mono">${esc(item.id)}</div></div></div></td><td>${esc(item.category)}</td><td style="min-width:130px;"><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:0.9rem;font-weight:700;color:${availUnits<=0?'#f43f5e':'var(--status-available)'}">${availUnits}</span><span style="color:var(--text-dim);font-size:0.8rem;">/ ${totUnits}</span></div><div style="margin-top:4px;height:4px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${stockPct}%;background:${stockBarColor};border-radius:99px;"></div></div><div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;">${availUnits<=0?'All units borrowed':availUnits+' of '+totUnits+' available'}</div></td><td><span class="cond-pill ${condClass(item.condition)}">${esc(item.condition)}</span></td><td>${statusBadge(effectiveStatus, availUnits, totUnits)}</td><td>${esc(item.location||'Main Storage')}</td><td>${item.total_borrows||0}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="EV.openDetails('${item.id}')">Specs</button>${S.role!=='Borrower' ? `<button class="btn btn-secondary btn-sm" onclick="EV.openEdit('${item.id}')">Edit</button>` : ''}</div></td></tr>`;
      }).join('')}</tbody></table>`;
    }
  }

  /* ═══════ 3. REQUESTS ═══════ */
  async function renderRequests() {
    let reqs = await StorageService.getRequests(S.filters.requests);
    if (S.role === 'Borrower' && S.user) {
      const ue = (S.user.email||'').toLowerCase();
      const uid = (S.user.borrower_id||'').toLowerCase();
      reqs = reqs.filter(r => (r.borrower_email && r.borrower_email.toLowerCase() === ue) || (uid && r.borrower_id_number && r.borrower_id_number.toLowerCase() === uid));
    }
    if (reqs.length === 0) {
      $('requests-tbody').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;"><p class="text-muted">No borrowing requests match your criteria.</p></td></tr>`;
      return;
    }
    $('requests-tbody').innerHTML = reqs.map(req => {
      const sb = reqStatusBadge(req.status, req.is_overdue, req.overdue_days);
      const isAdminOrCust = S.role === 'Administrator' || S.role === 'Equipment Custodian';
      const canApprove = isAdminOrCust && req.status === 'Pending';
      const canRelease = isAdminOrCust && req.status === 'Approved';
      return `<tr><td class="table-mono">${esc(req.id)}</td><td><div class="table-item-cell"><img class="table-item-img" src="${req.equipment_image||'assets/images/laptop.jpg'}" alt=""><div><div class="table-name">${esc(req.equipment_name)}</div><div class="table-sub">${esc(req.equipment_id)} &bull; <strong style="color:var(--gold-400);">${req.units || 1} unit(s)</strong></div></div></div></td><td><div class="table-name">${esc(req.borrower_name)}</div><div class="table-sub">${esc(req.borrower_id_number)} • ${esc(req.department)}</div></td><td style="font-size:0.78rem;"><div><b>From:</b> ${fmtDateTime(req.borrow_date)}</div><div><b>Due:</b> ${fmtDateTime(req.expected_return_date)}</div></td><td><div style="max-width:200px;font-size:0.78rem;color:var(--text-dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title="${esc(req.purpose)}">${esc(req.purpose)}</div></td><td>${sb}</td><td><div class="table-actions">${canApprove ? `<button class="btn btn-success btn-sm" onclick="EV.openApproval('${req.id}','approve')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Approve</button><button class="btn btn-danger btn-sm" onclick="EV.openApproval('${req.id}','reject')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reject</button>` : ''}${canRelease ? `<button class="btn btn-primary btn-sm" onclick="EV.release('${req.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Release</button>` : ''}${req.status==='Active' ? `<button class="btn btn-secondary btn-sm" onclick="EV.openReturn('${req.id}')">Return</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="EV.viewReceipt('${req.id}')" title="Receipt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button></div></td></tr>`;
    }).join('');
  }

  /* ═══════ 4. RETURNS ═══════ */
  function renderReturns() {
    const active = (S.dashboard && S.dashboard.active_requests) || [];
    if (active.length === 0) {
      $('returns-tbody').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;"><p class="text-muted">No equipment currently borrowed.</p></td></tr>`;
      return;
    }
    $('returns-tbody').innerHTML = active.map(r => {
      const od = r.is_overdue;
      const sb = od ? `<span class="badge badge-overdue">Overdue (${r.overdue_days}d)</span>` : `<span class="badge badge-available">On Track</span>`;
      return `<tr class="${od?'overdue-row':''}"><td class="table-mono">${esc(r.id)}</td><td><div class="table-item-cell"><img class="table-item-img" src="${r.equipment_image||'assets/images/laptop.jpg'}" alt=""><div><div class="table-name">${esc(r.equipment_name)}</div><div class="table-sub">${esc(r.equipment_id)} &bull; <strong style="color:var(--gold-400);">${r.units || 1} unit(s)</strong></div></div></div></td><td><div class="table-name">${esc(r.borrower_name)}</div><div class="table-sub">${esc(r.department||'')}</div></td><td>${fmtDateTime(r.borrow_date)}</td><td style="color:${od?'#f43f5e':'inherit'};font-weight:${od?700:'normal'}">${fmtDateTime(r.expected_return_date)}</td><td>${sb}</td><td><button class="btn btn-primary btn-sm" onclick="EV.openReturn('${r.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> Record Return</button></td></tr>`;
    }).join('');
  }

  /* ═══════ 5. OVERDUE / DUE DATES ═══════ */
  function renderOverdue() {
    const active = (S.dashboard && S.dashboard.active_requests) || [];
    if (active.length === 0) {
      $('overdue-tbody').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;"><p class="text-muted">No active loans to monitor.</p></td></tr>`;
      return;
    }
    const now = new Date();
    $('overdue-tbody').innerHTML = active.map(r => {
      const due = new Date(r.expected_return_date);
      const diffMs = due - now;
      const od = diffMs < 0;
      let daysText = '';
      let tcClass = '';
      if (od) {
        const days = Math.max(1, Math.ceil(Math.abs(diffMs) / 86400000));
        daysText = `Overdue by ${days} day${days > 1 ? 's' : ''}`;
        tcClass = 'color:#f43f5e; font-weight:700;';
      } else {
        const days = Math.ceil(diffMs / 86400000);
        if (days <= 1) {
          const hours = Math.max(1, Math.round(diffMs / 3600000));
          daysText = `Due in 1 day (~${hours}h left)`;
          tcClass = 'color:var(--gold-400); font-weight:700;';
        } else {
          daysText = `Due in ${days} days`;
          tcClass = 'color:var(--status-available); font-weight:600;';
        }
      }
      const sb = od ? '<span class="badge badge-overdue">OVERDUE</span>' : '<span class="badge badge-available">ON TRACK</span>';
      const tc = `<span style="${tcClass}">${daysText}</span>`;
      return `<tr class="${od?'overdue-row':''}"><td class="table-mono">${esc(r.id)}</td><td><div class="table-item-cell"><img class="table-item-img" src="${r.equipment_image||'assets/images/laptop.jpg'}" alt=""><div><div class="table-name">${esc(r.equipment_name)}</div><div class="table-sub">${esc(r.equipment_id)} &bull; <strong style="color:var(--gold-400);">${r.units || 1} unit(s)</strong></div></div></div></td><td><div class="table-name">${esc(r.borrower_name)}</div><div class="table-sub">${esc(r.borrower_id_number)}</div></td><td style="font-size:0.78rem"><div>${esc(r.borrower_email||'—')}</div><div class="text-muted">${esc(r.contact_number||'—')}</div></td><td>${fmtDateTime(r.expected_return_date)}</td><td>${sb}</td><td>${tc}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="EV.sendReminder('${esc(r.borrower_name)}','${esc(r.equipment_name)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Remind</button><button class="btn btn-primary btn-sm" onclick="EV.openReturn('${r.id}')">Check-in</button></div></td></tr>`;
    }).join('');
  }

  /* ═══════ 6. HISTORY ═══════ */
  async function renderHistory() {
    const hist = await StorageService.getReturns(S.filters.history);
    if (hist.length === 0) {
      $('history-tbody').innerHTML = `<tr><td colspan="9" style="text-align:center;padding:3rem;"><p class="text-muted">No history records found.</p></td></tr>`;
      return;
    }
    $('history-tbody').innerHTML = hist.map(r => {
      const od = r.is_overdue == 1;
      return `<tr><td class="table-mono" style="color:var(--gold-400)">${esc(r.id)}</td><td class="table-sub">${esc(r.request_id)}</td><td><div class="table-name">${esc(r.equipment_name||r.equipment_id)}</div><div class="table-sub">${esc(r.equipment_id)} &bull; <strong style="color:var(--gold-400);">${r.units || 1} unit(s)</strong></div></td><td class="table-name">${esc(r.borrower_name)}</td><td>${fmtDate(r.borrow_date)}</td><td><div>${fmtDateTime(r.actual_return_date)}</div>${od ? `<span style="font-size:0.68rem;color:#f43f5e;font-weight:700">(${r.days_overdue}d late)</span>` : `<span style="font-size:0.68rem;color:var(--status-available)">On Time</span>`}</td><td><span class="cond-pill ${condClass(r.condition_on_return)}">${esc(r.condition_on_return)}</span></td><td>${esc(r.received_by)}</td><td><button class="btn btn-secondary btn-sm" onclick="EV.viewRetReceipt('${r.id}')" title="Receipt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Receipt</button></td></tr>`;
    }).join('');
  }

  /* ═══════ ID & ASSET HELPERS ═══════ */
  function generateNextId(category) {
    let p = 'CMP';
    const c = (category || '').toLowerCase();
    if (c.includes('media') || c.includes('av')) p = 'MED';
    else if (c.includes('lab')) p = 'LAB';
    else if (c.includes('robot')) p = 'ROB';
    else if (c.includes('audio')) p = 'AUD';
    else if (c.includes('other')) p = 'GEN';

    const existing = (S.equipment || []).map(e => (e.id || '').toUpperCase());
    let maxNum = 0;
    const re = new RegExp(`^EQP-${p}-(\\d+)`, 'i');
    existing.forEach(id => {
      const m = id.match(re);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    let nextId = `EQP-${p}-${String(nextNum).padStart(3, '0')}`;
    if (existing.includes(nextId)) {
      nextId = `EQP-${p}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }
    return nextId;
  }

  function updateEqImageForCategory(cat) {
    const c = (cat || '').toLowerCase();
    let img = 'assets/images/laptop.jpg';
    if (c.includes('media') || c.includes('av')) img = 'assets/images/camera.jpg';
    else if (c.includes('lab')) img = 'assets/images/lab.jpg';
    else if (c.includes('robot')) img = 'assets/images/drone.jpg';
    else if (c.includes('audio')) img = 'assets/images/camera.jpg';

    setCustomEquipmentPhoto(img);
  }

  function setCustomEquipmentPhoto(src) {
    if ($('eq-photo-data')) $('eq-photo-data').value = src;
    if ($('eq-preview-img')) $('eq-preview-img').src = src;
    if ($('eq-photo-preview-wrap')) $('eq-photo-preview-wrap').style.display = 'flex';
  }

  /* ═══════ EVENT BINDINGS ═══════ */
  function bindEvents() {
    $$('.nav-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('btn-logout').addEventListener('click', logout);
    $('chip-overdue').addEventListener('click', () => switchTab('overdue'));
    $('chip-pending').addEventListener('click', () => switchTab('requests'));
    $('btn-view-overdue').addEventListener('click', () => switchTab('overdue'));
    $('btn-view-all-loans').addEventListener('click', () => switchTab('returns'));
    if ($('btn-dashboard-refresh')) $('btn-dashboard-refresh').addEventListener('click', async () => { await refreshAll(); toast('Refreshed', 'Dashboard data reloaded.', 'success'); });
    if ($('btn-quick-request')) $('btn-quick-request').addEventListener('click', () => EV.openRequest());
    if ($('btn-new-request')) $('btn-new-request').addEventListener('click', () => EV.openRequest());
    
    // The single + Add Equipment button on the Equipment Catalog page
    if ($('btn-add-equipment')) $('btn-add-equipment').addEventListener('click', () => EV.openAdd());
    if ($('btn-gen-eq-id')) $('btn-gen-eq-id').addEventListener('click', () => {
      $('eq-id').value = generateNextId($('eq-category').value);
      toast('ID Re-generated', `Assigned: ${$('eq-id').value}`, 'info');
    });

    // ─── PHOTO PASTE FROM CLIPBOARD (Ctrl+V) ───
    window.addEventListener('paste', e => {
      const modal = $('modal-equipment');
      if (!modal || !modal.classList.contains('open')) return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
              setCustomEquipmentPhoto(evt.target.result);
              toast('Photo Attached', 'Pasted image from your clipboard!', 'success');
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    });

    // ─── PHOTO FILE BROWSE & DROPZONE ───
    const fileInp = $('eq-file-input');
    const browseBtn = $('btn-browse-photo');
    if (browseBtn && fileInp) {
      browseBtn.addEventListener('click', () => fileInp.click());
      fileInp.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(evt) {
            setCustomEquipmentPhoto(evt.target.result);
            toast('Photo Attached', `Loaded: ${file.name}`, 'success');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    const dropzone = $('eq-photo-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, e => {
          e.preventDefault(); e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, e => {
          e.preventDefault(); e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });
      dropzone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt ? dt.files : null;
        if (files && files[0] && files[0].type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = function(evt) {
            setCustomEquipmentPhoto(evt.target.result);
            toast('Photo Attached', 'Photo attached from drop!', 'success');
          };
          reader.readAsDataURL(files[0]);
        }
      });
    }

    // Toggle stock presets
    if ($('btn-toggle-presets')) {
      $('btn-toggle-presets').addEventListener('click', () => {
        const w = $('eq-photo-presets-wrap');
        if (w) w.style.display = (w.style.display === 'none' || !w.style.display) ? 'block' : 'none';
      });
    }
    if ($('eq-image-preset')) {
      $('eq-image-preset').addEventListener('change', function() {
        if (this.value) setCustomEquipmentPhoto(this.value);
      });
    }
    if ($('eq-custom-image-url')) {
      $('eq-custom-image-url').addEventListener('input', debounce(function() {
        if (this.value.trim()) setCustomEquipmentPhoto(this.value.trim());
      }, 300));
    }

    // Official User Profile Modal (Displays authenticated credentials)
    function openProfileModal() {
      if (!S.user) return;
      const parts = (S.user.name || 'Staff').split(' ');
      const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : (S.user.name || 'SA').slice(0,2).toUpperCase();
      if ($('modal-profile-avatar')) $('modal-profile-avatar').textContent = initials;
      if ($('modal-profile-name')) $('modal-profile-name').textContent = S.user.name;
      if ($('modal-profile-role')) $('modal-profile-role').textContent = S.user.role;
      if ($('modal-profile-id')) $('modal-profile-id').textContent = S.user.borrower_id || (S.user.role === 'Administrator' ? 'ADM-2026-001' : 'CST-2026-002');
      if ($('modal-profile-email')) $('modal-profile-email').textContent = S.user.email;
      if ($('modal-profile-dept')) $('modal-profile-dept').textContent = S.user.department || 'Equipment & Facilities IT';
      openModal('modal-profile');
    }

    if ($('header-user-btn')) $('header-user-btn').addEventListener('click', openProfileModal);
    if ($('sidebar-user-card')) $('sidebar-user-card').addEventListener('click', openProfileModal);
    if ($('btn-modal-logout')) $('btn-modal-logout').addEventListener('click', () => { closeModal('modal-profile'); logout(); });

    // Equipment filters
    $('eq-search').addEventListener('input', debounce(e => { S.filters.equipment.search = e.target.value; renderEquipment(); }, 250));
    $('eq-cat-filter').addEventListener('change', e => { S.filters.equipment.category = e.target.value; renderEquipment(); });
    $('eq-status-filter').addEventListener('change', e => { S.filters.equipment.status = e.target.value; renderEquipment(); });
    $('eq-cond-filter').addEventListener('change', e => { S.filters.equipment.condition = e.target.value; renderEquipment(); });
    $('btn-grid-view').addEventListener('click', () => { S.viewMode='grid'; $('btn-grid-view').classList.add('active'); $('btn-list-view').classList.remove('active'); renderEquipment(); });
    $('btn-list-view').addEventListener('click', () => { S.viewMode='list'; $('btn-list-view').classList.add('active'); $('btn-grid-view').classList.remove('active'); renderEquipment(); });

    // Equipment modal category change: auto updates ID and photo if new item
    $('eq-category').addEventListener('change', function() {
      if ($('eq-is-edit').value !== 'true') {
        $('eq-id').value = generateNextId(this.value);
        updateEqImageForCategory(this.value);
      }
    });

    // Request filters
    $('req-search').addEventListener('input', debounce(e => { S.filters.requests.search = e.target.value; renderRequests(); }, 250));
    $('req-status-filter').addEventListener('change', e => { S.filters.requests.status = e.target.value; renderRequests(); });

    // History filters
    $('hist-search').addEventListener('input', debounce(e => { S.filters.history.search = e.target.value; renderHistory(); }, 250));
    $('hist-cond-filter').addEventListener('change', e => { S.filters.history.condition = e.target.value; renderHistory(); });
    $('btn-export-csv').addEventListener('click', exportCSV);

    // Overdue reminders
    $('btn-send-reminders').addEventListener('click', () => {
      const od = S.dashboard ? (S.dashboard.active_requests||[]).filter(r=>r.is_overdue) : [];
      if (od.length === 0) { toast('Info', 'No overdue loans.', 'info'); return; }
      toast('Notifications Sent', `Reminders dispatched to ${od.length} borrower(s).`, 'warning');
    });

    // Modal close
    $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
    $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
    window.addEventListener('keydown', e => { if (e.key==='Escape') $$('.modal-backdrop.open').forEach(m => closeModal(m.id)); });

    // Form submits
    $('form-equipment').addEventListener('submit', handleSaveEquipment);
    $('form-request').addEventListener('submit', handleSubmitRequest);
    $('form-approval').addEventListener('submit', handleApproval);
    $('form-return').addEventListener('submit', handleReturn);
    $('btn-print-receipt').addEventListener('click', () => window.print());
  }

  /* ═══════ FORM HANDLERS ═══════ */
  async function handleSaveEquipment(e) {
    e.preventDefault();
    const isEdit = $('eq-is-edit').value === 'true';
    let id = $('eq-id').value.trim();
    if (!id && !isEdit) {
      id = generateNextId($('eq-category').value);
    }
    const name = $('eq-name').value.trim();
    if (!name) { toast('Error', 'Equipment name is required.', 'error'); return; }

    const photoSrc = ($('eq-photo-data') && $('eq-photo-data').value) || 'assets/images/laptop.jpg';

    const totalUnits = Math.max(1, parseInt($('eq-total-units').value, 10) || 1);
    let availableUnits = totalUnits;
    if (isEdit && $('eq-available-units') && $('eq-available-units').value !== '') {
      availableUnits = Math.max(0, Math.min(totalUnits, parseInt($('eq-available-units').value, 10) || 0));
    } else if ($('eq-status').value === 'Borrowed' || $('eq-status').value === 'Under Maintenance') {
      availableUnits = 0;
    }

    const data = {
      id: id,
      name: name,
      category: $('eq-category').value,
      condition: $('eq-condition').value,
      status: $('eq-status').value,
      serial_number: $('eq-serial').value.trim(),
      total_units: totalUnits,
      available_units: availableUnits,
      location: $('eq-location').value.trim() || 'Main IT Cage',
      image_url: photoSrc,
      description: $('eq-description').value.trim(),
      performed_by: (S.user ? S.user.name : S.role)
    };

    try {
      await StorageService.saveEquipment(data, isEdit);
      closeModal('modal-equipment');
      toast('Equipment Saved', isEdit ? `Equipment [${data.id}] updated (Stock limit: ${totalUnits} units).` : `New equipment [${data.id}] ${data.name} registered with ${totalUnits} unit(s) stock limitation!`, 'success');
      await refreshAll();
      switchTab('equipment');
    } catch(err) { toast('Error', err.message, 'error'); }
  }

  async function handleSubmitRequest(e) {
    e.preventDefault();
    const bDate = $('req-borrow-date').value;
    const rDate = $('req-return-date').value;
    if (new Date(rDate) <= new Date(bDate)) { toast('Error', 'Return date must be after borrow date.', 'error'); return; }
    const units = Math.max(1, parseInt($('req-units') ? $('req-units').value : 1, 10) || 1);
    try {
      const res = await StorageService.createRequest({
        equipment_id: $('req-equipment-id').value,
        units: units,
        borrower_name: $('req-borrower-name').value.trim(),
        borrower_id_number: $('req-borrower-id').value.trim(),
        borrower_email: $('req-email').value.trim(),
        contact_number: $('req-phone').value.trim(),
        department: $('req-dept').value.trim(),
        borrow_date: bDate.replace('T',' ')+':00',
        expected_return_date: rDate.replace('T',' ')+':00',
        purpose: $('req-purpose').value.trim()
      });
      closeModal('modal-request');
      toast('Request Submitted', `Request ${res.id} for ${units} unit(s) is pending approval.`, 'success');
      await refreshAll(); switchTab('requests');
    } catch(err) { toast('Error', err.message, 'error'); }
  }

  async function handleApproval(e) {
    e.preventDefault();
    const id = $('approval-req-id').value;
    const action = $('approval-action-type').value;
    const notes = $('approval-notes').value.trim();
    try {
      if (action === 'approve') {
        await StorageService.approveRequest(id, notes || 'Approved.', S.role);
        toast('Approved', `Request [${id}] approved.`, 'success');
      } else {
        await StorageService.rejectRequest(id, notes || 'Rejected.', S.role);
        toast('Rejected', `Request [${id}] rejected.`, 'warning');
      }
      closeModal('modal-approval'); await refreshAll();
    } catch(err) { toast('Error', err.message, 'error'); }
  }

  async function handleReturn(e) {
    e.preventDefault();
    try {
      const res = await StorageService.processReturn({
        request_id: $('return-req-id').value,
        actual_return_date: $('return-actual-date').value.replace('T',' ')+':00',
        condition_on_return: $('return-condition').value,
        custodian_notes: $('return-notes').value.trim() || 'All items inspected.',
        received_by: S.role
      });
      closeModal('modal-return');
      toast('Return Recorded', `Return ${res.return_id} processed. Status: ${res.new_equipment_status}.`, 'success');
      await refreshAll();
      EV.viewRetReceipt(res.return_id);
    } catch(err) { toast('Error', err.message, 'error'); }
  }

  /* ═══════ CSV EXPORT ═══════ */
  function exportCSV() {
    if (!S.returns || S.returns.length === 0) { toast('Info', 'No records to export.', 'info'); return; }
    const h = ['Return ID','Request ID','Equipment ID','Borrower','Borrow Date','Due Date','Return Date','Overdue','Days Late','Condition','Received By','Notes'];
    const rows = S.returns.map(r => [q(r.id),q(r.request_id),q(r.equipment_id),q(r.borrower_name),q(r.borrow_date),q(r.expected_return_date),q(r.actual_return_date),r.is_overdue?'YES':'NO',r.days_overdue||0,q(r.condition_on_return),q(r.received_by),q((r.custodian_notes||'').replace(/"/g,'""'))]);
    const csv = 'data:text/csv;charset=utf-8,' + [h.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `equipvault_report_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Exported', 'CSV report downloaded.', 'success');
  }
  function q(s) { return `"${s||''}"`; }

  /* ═══════ MODALS ═══════ */
  function openModal(id) { const m = $(id); if (m) m.classList.add('open'); }
  function closeModal(id) { const m = $(id); if (m) m.classList.remove('open'); }

  /* ═══════ GLOBAL API ═══════ */
  window.EV = {
    openAdd() {
      if (S.role === 'Borrower') {
        toast('Access Denied', 'Administrative or Custodian authority required to register equipment.', 'error');
        return;
      }
      $('modal-eq-title').textContent = 'Register New Equipment';
      $('eq-is-edit').value = 'false';
      $('eq-id').disabled = false;
      const cat = $('eq-category').value || 'Computing';
      $('eq-id').value = generateNextId(cat);
      $('eq-name').value = '';
      $('eq-serial').value = '';
      if ($('eq-total-units')) $('eq-total-units').value = 1;
      if ($('wrap-eq-available-units')) $('wrap-eq-available-units').style.display = 'none';
      $('eq-location').value = 'Main IT Cage - Shelf A1';
      $('eq-description').value = '';
      $('eq-status').value = 'Available';
      $('eq-condition').value = 'Good';
      $('eq-category').value = cat;
      if ($('eq-photo-presets-wrap')) $('eq-photo-presets-wrap').style.display = 'none';
      updateEqImageForCategory(cat);
      openModal('modal-equipment');
      setTimeout(() => { if ($('eq-name')) $('eq-name').focus(); }, 120);
    },
    async openEdit(id) {
      const item = await StorageService.getEquipmentById(id); if (!item) return;
      $('modal-eq-title').textContent = `Edit [${item.id}]`;
      $('eq-is-edit').value = 'true'; $('eq-id').value = item.id; $('eq-id').disabled = true;
      $('eq-name').value = item.name; $('eq-category').value = item.category; $('eq-condition').value = item.condition;
      $('eq-status').value = item.status; $('eq-serial').value = item.serial_number||'';
      if ($('eq-total-units')) $('eq-total-units').value = item.total_units || 1;
      if ($('wrap-eq-available-units')) {
        $('wrap-eq-available-units').style.display = 'block';
        $('eq-available-units').value = item.available_units != null ? item.available_units : (item.status === 'Available' ? (item.total_units || 1) : 0);
      }
      $('eq-location').value = item.location||''; $('eq-description').value = item.description||'';
      if ($('eq-photo-presets-wrap')) $('eq-photo-presets-wrap').style.display = 'none';
      setCustomEquipmentPhoto(item.image_url || 'assets/images/laptop.jpg');
      openModal('modal-equipment');
    },
    async deleteEq(id) {
      if (!confirm(`Permanently delete equipment [${id}]?`)) return;
      try { await StorageService.deleteEquipment(id); toast('Deleted', `[${id}] removed.`, 'warning'); await refreshAll(); }
      catch(err) { toast('Error', err.message, 'error'); }
    },
    openRequest(preId='') {
      const sel = $('req-equipment-id');
      const avail = S.equipment.filter(e => {
        const a = e.available_units != null ? e.available_units : (e.status === 'Available' ? 1 : 0);
        return a > 0 && e.status !== 'Under Maintenance';
      });
      sel.innerHTML = '<option value="">— Select Available Equipment —</option>' + avail.map(e => {
        const a = e.available_units != null ? e.available_units : 1;
        const tot = e.total_units || 1;
        return `<option value="${e.id}" data-avail="${a}" data-total="${tot}" ${e.id===preId?'selected':''}>[${e.id}] ${esc(e.name)} (${a}/${tot} available)</option>`;
      }).join('');

      function syncStockLimit() {
        const opt = sel.options[sel.selectedIndex];
        const uInp = $('req-units');
        const hint = $('req-stock-hint');
        if (opt && opt.value) {
          const a = parseInt(opt.getAttribute('data-avail') || '1', 10);
          const tot = parseInt(opt.getAttribute('data-total') || '1', 10);
          if (uInp) {
            uInp.max = a;
            if (parseInt(uInp.value, 10) > a) uInp.value = a;
            if (parseInt(uInp.value, 10) < 1) uInp.value = 1;
          }
          if (hint) hint.innerHTML = `<span style="color:var(--status-available);">Stock Limit: ${a} of ${tot} available</span>`;
        } else {
          if (uInp) uInp.max = 1;
          if (hint) hint.textContent = 'Stock Limit: Select equipment above';
        }
      }

      sel.onchange = syncStockLimit;
      syncStockLimit();

      const now = new Date(); const ret = new Date(Date.now() + 3*86400000);
      $('req-borrow-date').value = now.toISOString().slice(0,16);
      $('req-return-date').value = ret.toISOString().slice(0,16);
      if (S.user) {
        $('req-borrower-name').value = S.user.name||'';
        $('req-borrower-id').value = S.user.borrower_id||'';
        $('req-email').value = S.user.email||'';
        $('req-phone').value = S.user.phone||'';
        $('req-dept').value = S.user.department||'';
      }
      $('req-purpose').value = '';
      openModal('modal-request');
    },
    openRequestWith(id) { this.openRequest(id); },
    async openApproval(reqId, action) {
      const req = S.requests.find(r => r.id === reqId); if (!req) return;
      $('approval-req-id').value = reqId; $('approval-action-type').value = action;
      const isA = action === 'approve';
      $('modal-approval-title').textContent = isA ? `Approve [${reqId}]` : `Reject [${reqId}]`;
      $('label-approval-notes').textContent = isA ? 'Approval Notes' : 'Rejection Reason';
      const cb = $('btn-confirm-approval');
      cb.className = isA ? 'btn btn-success' : 'btn btn-danger';
      cb.textContent = isA ? 'Confirm Approval' : 'Confirm Rejection';
      $('approval-req-summary').innerHTML = `<div style="display:flex;gap:10px;align-items:center;"><img src="${req.equipment_image||'assets/images/laptop.jpg'}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--border-subtle);"><div><div class="table-name">${esc(req.equipment_name)}</div><div class="table-sub">Borrower: <strong>${esc(req.borrower_name)}</strong> (${esc(req.borrower_id_number)}) &bull; <strong style="color:var(--gold-400);">${req.units || 1} unit(s)</strong></div><div class="table-sub" style="margin-top:2px;">Purpose: ${esc(req.purpose)}</div></div></div>`;
      $('approval-notes').value = isA ? 'Approved for academic project use.' : 'Equipment reserved for maintenance.';
      openModal('modal-approval');
    },
    async release(reqId) {
      const req = S.requests.find(r => r.id === reqId);
      const unitsText = req ? ` (${req.units || 1} unit(s))` : '';
      if (!confirm(`Confirm equipment release for request [${reqId}]${unitsText}?`)) return;
      try { await StorageService.releaseEquipment(reqId, S.role); toast('Released', `Equipment marked as Borrowed${unitsText}.`, 'success'); await refreshAll(); }
      catch(err) { toast('Error', err.message, 'error'); }
    },
    async openReturn(reqId) {
      const req = S.requests.find(r => r.id === reqId); if (!req) return;
      $('return-req-id').value = reqId;
      $('return-actual-date').value = new Date().toISOString().slice(0,16);
      $('return-condition').value = 'Good';
      $('return-notes').value = 'All accessories accounted for.';
      const od = req.is_overdue;
      $('return-req-summary').innerHTML = `<div style="display:flex;gap:10px;align-items:center;"><img src="${req.equipment_image||'assets/images/laptop.jpg'}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--border-subtle);"><div><div class="table-name">${esc(req.equipment_name)}</div><div class="table-sub">Borrower: <strong>${esc(req.borrower_name)}</strong> &bull; <strong style="color:var(--gold-400);">${req.units || 1} unit(s)</strong></div><div style="font-size:0.76rem;color:${od?'#f43f5e':'var(--text-dim)'};font-weight:${od?700:'normal'}">Due: ${fmtDateTime(req.expected_return_date)} ${od?'(OVERDUE)':''}</div></div></div>`;
      openModal('modal-return');
    },
    async openDetails(id) {
      const item = await StorageService.getEquipmentById(id); if (!item) return;
      $('modal-details-name').textContent = item.name;
      const bb = $('btn-details-borrow');
      if (bb) bb.style.display = 'none';
      const tot = item.total_units || 1;
      const av = item.available_units != null ? item.available_units : (item.status === 'Available' ? tot : 0);
      const out = Math.max(0, tot - av);
      const sb = statusBadge(item.status, av, tot);
      $('modal-details-body').innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;"><div style="position:relative;width:100%;height:220px;border-radius:var(--radius-lg);overflow:hidden;"><img src="${item.image_url||'assets/images/laptop.jpg'}" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;top:10px;right:10px;">${sb}</div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">${[['ID Code',item.id,'text-gold'],['Category',item.category,''],['Stock Limitation',tot+' units total','text-gold'],['Available Stock',av+' units free',av>0?'color:var(--status-available)':'color:#ef4444'],['Currently Loaned',out+' units',''],['Condition',item.condition,''],['Serial',item.serial_number||'N/A',''],['Location',item.location||'Main Storage',''],['Total Loans',(item.total_borrows||0)+' times','']].map(([l,v,c])=>`<div><div class="eq-meta-label">${l}</div><div class="eq-meta-val" style="${c.startsWith('color:')?c:''}" class="${!c.startsWith('color:')?c:''}">${esc(v)}</div></div>`).join('')}</div><div><h4 style="font-size:0.88rem;margin-bottom:4px;">Description</h4><p style="color:var(--text-dim);font-size:0.82rem;line-height:1.6;">${esc(item.description||'No specifications.')}</p></div></div>`;
      openModal('modal-details');
    },
    viewReceipt(reqId) {
      const req = S.requests.find(r => r.id === reqId); if (!req) return;
      $('modal-receipt-content').innerHTML = `
        <div class="receipt-sheet receipt-printable" style="color:var(--text-primary, #f1f5f9);background:var(--bg-surface, #13161d);padding:24px;border:1px solid var(--border-medium, rgba(255,255,255,0.12));border-radius:14px;">
          <div class="receipt-header" style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid var(--border-medium, rgba(255,255,255,0.12));">
            <div>
              <h2 style="color:var(--text-primary, #ffffff);font-size:1.15rem;font-weight:800;margin:0 0 4px 0;">EQUIPVAULT LOAN RECORD</h2>
              <p style="color:var(--text-secondary, #94a3b8);font-size:0.8rem;margin:0;">Equipment Management Office &bull; University Official Slip</p>
            </div>
            <div style="text-align:right;">
              <strong style="color:var(--gold-400, #fbbf24);font-size:0.95rem;">Ref: ${esc(req.id)}</strong>
            </div>
          </div>
          <table class="receipt-table" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;width:32%;">Borrower</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--text-primary, #ffffff);">${esc(req.borrower_name)}</strong> (${esc(req.borrower_id_number)})</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Department</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${esc(req.department||'General')}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Contact</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${esc(req.borrower_email||'—')} &bull; ${esc(req.contact_number||'—')}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Equipment</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--text-primary, #ffffff);">[${esc(req.equipment_id)}] ${esc(req.equipment_name)}</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Units Borrowed</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--gold-400, #fbbf24);">${req.units || 1} unit(s)</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Borrow Date</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${fmtDateTime(req.borrow_date)}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Due Date</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--gold-400, #fbbf24);">${fmtDateTime(req.expected_return_date)}</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Purpose</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${esc(req.purpose)}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Status</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--gold-400, #fbbf24);">${esc(req.status)}</strong> (Approved by: ${esc(req.approved_by||'Admin')})</td></tr>
          </table>
          <div class="receipt-signatures" style="display:flex;gap:32px;margin-top:24px;padding-top:14px;">
            <div class="signature-line" style="flex:1;padding-top:10px;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.2));font-size:0.78rem;color:var(--text-secondary, #94a3b8);"><strong style="display:block;font-size:0.88rem;color:var(--text-primary, #ffffff);margin-bottom:3px;">${esc(req.borrower_name)}</strong>Borrower Signature</div>
            <div class="signature-line" style="flex:1;padding-top:10px;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.2));font-size:0.78rem;color:var(--text-secondary, #94a3b8);"><strong style="display:block;font-size:0.88rem;color:var(--text-primary, #ffffff);margin-bottom:3px;">${esc(req.released_by||req.approved_by||'Equipment Custodian')}</strong>Custodian Signature</div>
          </div>
        </div>`;
      openModal('modal-receipt');
    },
    viewRetReceipt(retId) {
      const ret = S.returns.find(r => r.id === retId); if (!ret) return;
      $('modal-receipt-content').innerHTML = `
        <div class="receipt-sheet receipt-printable" style="color:var(--text-primary, #f1f5f9);background:var(--bg-surface, #13161d);padding:24px;border:1px solid var(--border-medium, rgba(255,255,255,0.12));border-radius:14px;">
          <div class="receipt-header" style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid var(--border-medium, rgba(255,255,255,0.12));">
            <div>
              <h2 style="color:var(--text-primary, #ffffff);font-size:1.15rem;font-weight:800;margin:0 0 4px 0;">EQUIPVAULT RETURN CLEARANCE</h2>
              <p style="color:var(--text-secondary, #94a3b8);font-size:0.8rem;margin:0;">Official Equipment Handover Document &bull; Clearance Audit</p>
            </div>
            <div style="text-align:right;">
              <strong style="color:var(--status-available, #10b981);font-size:0.95rem;">CLEARED</strong><br>
              <span style="font-size:0.8rem;color:var(--text-secondary, #94a3b8);font-weight:600;">${esc(ret.id)}</span>
            </div>
          </div>
          <table class="receipt-table" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;width:32%;">Borrower</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--text-primary, #ffffff);">${esc(ret.borrower_name)}</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Equipment</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--text-primary, #ffffff);">[${esc(ret.equipment_id)}] ${esc(ret.equipment_name||ret.equipment_id)}</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Units Returned</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--status-available, #10b981);">${ret.units || 1} unit(s)</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Due Date</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${fmtDateTime(ret.expected_return_date)}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Actual Return</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${fmtDateTime(ret.actual_return_date)}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Compliance</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${ret.is_overdue ? `<span style="color:#ef4444;font-weight:700;">${ret.days_overdue}d Late</span>` : '<span style="color:var(--status-available, #10b981);font-weight:700;">On Time</span>'}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Condition</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--status-available, #10b981);font-weight:700;">${esc(ret.condition_on_return)}</strong></td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Remarks</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">${esc(ret.custodian_notes||'All components accounted for.')}</td></tr>
            <tr><th style="background:var(--bg-elevated, #22263a);color:var(--gold-400, #fbbf24);font-weight:600;padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));text-align:left;">Received By</th><td style="background:var(--bg-card, #1a1d27);color:var(--text-primary, #f1f5f9);padding:10px 14px;border:1px solid var(--border-subtle, rgba(255,255,255,0.08));"><strong style="color:var(--text-primary, #ffffff);">${esc(ret.received_by)}</strong></td></tr>
          </table>
          <div class="receipt-signatures" style="display:flex;gap:32px;margin-top:24px;padding-top:14px;">
            <div class="signature-line" style="flex:1;padding-top:10px;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.2));font-size:0.78rem;color:var(--text-secondary, #94a3b8);"><strong style="display:block;font-size:0.88rem;color:var(--text-primary, #ffffff);margin-bottom:3px;">${esc(ret.borrower_name)}</strong>Borrower Verification</div>
            <div class="signature-line" style="flex:1;padding-top:10px;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.2));font-size:0.78rem;color:var(--text-secondary, #94a3b8);"><strong style="display:block;font-size:0.88rem;color:var(--text-primary, #ffffff);margin-bottom:3px;">${esc(ret.received_by)}</strong>Custodian Clearance</div>
          </div>
        </div>`;
      openModal('modal-receipt');
    },
    sendReminder(borrower, item) { toast('Reminder Sent', `Overdue notice sent to ${borrower} for [${item}].`, 'warning'); },
    clearEqFilters() {
      $('eq-search').value = ''; $('eq-cat-filter').value = 'All'; $('eq-status-filter').value = 'All'; $('eq-cond-filter').value = 'All';
      S.filters.equipment = { category:'All', status:'All', condition:'All', search:'' };
      renderEquipment();
    }
  };

  /* ═══════ HELPERS ═══════ */
  function statusBadge(s, avail, total) {
    if (s === 'Under Maintenance') return '<span class="badge badge-maintenance">Maintenance</span>';
    // Always show unit count in badge
    const a = parseInt(avail, 10);
    const t = parseInt(total, 10);
    if (!isNaN(a) && !isNaN(t)) {
      if (a <= 0) return `<span class="badge badge-borrowed">Borrowed (0/${t} units)</span>`;
      return `<span class="badge badge-available"><span class="pulse-dot"></span> ${a}/${t} Available</span>`;
    }
    switch(s) {
      case 'Available': return '<span class="badge badge-available"><span class="pulse-dot"></span> Available</span>';
      case 'Borrowed': return '<span class="badge badge-borrowed">Borrowed</span>';
      case 'Under Maintenance': return '<span class="badge badge-maintenance">Maintenance</span>';
      default: return `<span class="badge">${esc(s)}</span>`;
    }
  }
  function reqStatusBadge(s, od, days) {
    if (s==='Active' && od) return `<span class="badge badge-overdue">Overdue (${days}d)</span>`;
    switch(s) {
      case 'Pending': return '<span class="badge badge-pending">Pending</span>';
      case 'Approved': return '<span class="badge badge-approved">Approved</span>';
      case 'Active': return '<span class="badge badge-borrowed">Active Loan</span>';
      case 'Returned': return '<span class="badge badge-returned">Returned</span>';
      case 'Rejected': return '<span class="badge badge-rejected">Rejected</span>';
      default: return `<span class="badge">${esc(s)}</span>`;
    }
  }
  function condClass(c) {
    switch(c) {
      case 'Excellent': return 'cond-excellent';
      case 'Good': return 'cond-good';
      case 'Fair': return 'cond-fair';
      case 'Needs Repair': case 'Damaged': return 'cond-repair';
      default: return '';
    }
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); } catch { return d; }
  }
  function fmtDateTime(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return d; }
  }
  function esc(s) {
    if (s==null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function toast(title, msg, type='success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    t.innerHTML = `<div class="toast-icon">${icons[type]||'✓'}</div><div class="toast-content"><div class="toast-title">${esc(title)}</div><div class="toast-msg">${esc(msg)}</div></div>`;
    $('toast-container').appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(20px)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(),300); }, 4000);
  }

  // BOOT
  await init();
});
