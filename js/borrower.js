/**
 * EquipVault — Dedicated Borrower Portal JavaScript
 * Handles catalog browsing, request submission, active loan tracking, and return history.
 */
(() => {
  'use strict';

  /* ═══════ STATE ═══════ */
  const S = {
    user: null,
    tab: 'dashboard',
    viewMode: 'grid',
    equipment: [],
    requests: [],
    returns: [],
    dashboard: null,
    filters: {
      catalog: { category: 'All', status: 'Available', search: '' },
      requests: { status: 'All', search: '' },
      history: { search: '' }
    }
  };

  /* ═══════ DOM HELPERS ═══════ */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const esc = str => String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function fmtDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    } catch { return d; }
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch { return d; }
  }

  function debounce(fn, ms) {
    let t;
    return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  /* ═══════ INIT ═══════ */
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const conn = await StorageService.init();
    
    checkSession();
    await refreshAll();
    bindEvents();
    switchTab('dashboard');
  });

  /* ═══════ SESSION ═══════ */
  function checkSession() {
    const raw = localStorage.getItem('equipvault_auth_user');
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.role !== 'Borrower') {
          // Administrators and Custodians are kept strictly in the Admin & Custodian Portal
          window.location.replace('index.html');
          return;
        }
        loginUser(user, false);
        return;
      } catch (e) {
        localStorage.removeItem('equipvault_auth_user');
      }
    }
    window.location.replace('login.html');
  }

  function loginUser(user, notify) {
    S.user = user;
    localStorage.setItem('equipvault_auth_user', JSON.stringify(user));

    const name = user.name || 'Student Borrower';
    const parts = name.split(' ');
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();

    // Update Header & Sidebar display
    if ($('sidebar-avatar')) $('sidebar-avatar').textContent = initials;
    if ($('sidebar-user-name')) $('sidebar-user-name').textContent = name;
    if ($('sidebar-user-role')) $('sidebar-user-role').textContent = user.role || 'Borrower';
    if ($('header-avatar')) $('header-avatar').textContent = initials;
    if ($('header-user-name')) $('header-user-name').textContent = name;
    if ($('header-user-role')) $('header-user-role').textContent = user.role || 'Borrower';

    // Hero banner display
    if ($('hero-borrower-name')) $('hero-borrower-name').textContent = name;
    if ($('hero-borrower-id')) $('hero-borrower-id').textContent = user.borrower_id || 'STU-2026-001';
    if ($('hero-borrower-dept')) $('hero-borrower-dept').textContent = user.department || 'Information Technology';

    // Pre-fill request modal display
    if ($('req-prefill-display-name')) $('req-prefill-display-name').textContent = name;
    if ($('req-prefill-display-id')) $('req-prefill-display-id').textContent = user.borrower_id || 'STU-2026-001';
    if ($('req-prefill-display-email')) $('req-prefill-display-email').textContent = user.email || 'borrower@equipvault.edu';

    // Pre-fill request form hidden values
    if ($('req-b-name')) $('req-b-name').value = name;
    if ($('req-b-id')) $('req-b-id').value = user.borrower_id || 'STU-2026-001';
    if ($('req-b-email')) $('req-b-email').value = user.email || 'borrower@equipvault.edu';
    if ($('req-b-dept')) $('req-b-dept').value = user.department || 'Information Technology';
    if ($('req-b-phone')) $('req-b-phone').value = user.phone || '+1 (555) 014-3829';

    if (notify) toast('Welcome', `Signed in as ${name}`, 'success');
  }

  function logout() {
    if (!confirm('Sign out of EquipVault Borrower Portal?')) return;
    localStorage.removeItem('equipvault_auth_user');
    window.location.href = 'login.html';
  }

  /* ═══════ DATA FETCHING ═══════ */
  async function refreshAll() {
    try {
      const borrowerParams = S.user ? { borrower_email: S.user.email, borrower_id: S.user.borrower_id } : null;
      const [allEq, allReqs, allRets, dash] = await Promise.all([
        StorageService.getEquipment(),
        StorageService.getRequests(borrowerParams),
        StorageService.getReturns(borrowerParams),
        StorageService.getDashboard(borrowerParams)
      ]);

      S.equipment = allEq;
      S.dashboard = dash;

      // Filter requests strictly for this borrower
      const uEmail = (S.user?.email || '').toLowerCase();
      const uId = (S.user?.borrower_id || '').toLowerCase();

      S.requests = allReqs.filter(r => {
        const re = (r.borrower_email || '').toLowerCase();
        const rid = (r.borrower_id_number || '').toLowerCase();
        return (uEmail && re === uEmail) || (uId && rid === uId);
      });

      // Filter returns strictly for this borrower
      S.returns = allRets.filter(r => {
        const re = (r.borrower_email || '').toLowerCase();
        const rid = (r.borrower_id_number || '').toLowerCase();
        const rn = (r.borrower_name || '').toLowerCase();
        return (uEmail && re === uEmail) || (uId && rid === uId) || (S.user?.name && rn === S.user.name.toLowerCase());
      });

      updateBadges();
      checkOverdueNotifications();
      renderTab();
    } catch (err) {
      console.error('[BorrowerPortal] Data Load Error:', err);
      toast('Error', 'Failed to load data: ' + err.message, 'error');
    }
  }

  /* ═══════ BADGES & NOTIFICATIONS ═══════ */
  function updateBadges() {
    const activeLoans = S.requests.filter(r => r.status === 'Active');
    const pendingReqs = S.requests.filter(r => r.status === 'Pending');
    const approvedReqs = S.requests.filter(r => r.status === 'Approved');

    // Check overdue loans
    const now = new Date();
    let overdueCount = 0;
    activeLoans.forEach(l => {
      if (now > new Date(l.expected_return_date)) overdueCount++;
    });

    // Header Chips
    if (pendingReqs.length > 0) {
      $('chip-my-pending').style.display = 'inline-flex';
      $('chip-my-pending-text').textContent = `${pendingReqs.length} Pending`;
    } else {
      $('chip-my-pending').style.display = 'none';
    }

    if (overdueCount > 0) {
      $('chip-my-overdue').style.display = 'inline-flex';
      $('chip-my-overdue-text').textContent = `${overdueCount} Overdue!`;
    } else {
      $('chip-my-overdue').style.display = 'none';
    }

    // Sidebar Badges
    const badgeCatalog = $('badge-catalog');
    if (badgeCatalog) {
      const availCount = S.equipment.filter(e => e.status === 'Available').length;
      badgeCatalog.style.display = 'inline-block';
      badgeCatalog.textContent = availCount;
      badgeCatalog.style.background = 'var(--status-available-bg)';
      badgeCatalog.style.color = 'var(--status-available)';
      badgeCatalog.style.border = '1px solid rgba(16,185,129,0.3)';
    }

    const badgeReqs = $('badge-requests');
    if (badgeReqs) {
      if (pendingReqs.length > 0) {
        badgeReqs.style.display = 'inline-block';
        badgeReqs.textContent = pendingReqs.length;
      } else {
        badgeReqs.style.display = 'none';
      }
    }

    const badgeLoans = $('badge-loans');
    if (badgeLoans) {
      if (activeLoans.length > 0) {
        badgeLoans.style.display = 'inline-block';
        badgeLoans.textContent = activeLoans.length;
        badgeLoans.style.background = overdueCount > 0 ? 'var(--status-overdue-bg)' : 'var(--status-borrowed-bg)';
        badgeLoans.style.color = overdueCount > 0 ? 'var(--status-overdue)' : 'var(--status-borrowed)';
      } else {
        badgeLoans.style.display = 'none';
      }
    }
  }

  /* ═══════ OVERDUE & DUE-SOON NOTIFICATIONS ═══════ */
  function checkOverdueNotifications() {
    const activeLoans = S.requests.filter(r => r.status === 'Active');
    if (activeLoans.length === 0) return;

    const now = new Date();
    // Track which notifications we've already shown this session to avoid spamming
    const shownKey = 'equipvault_overdue_notified';
    let shownIds = [];
    try { shownIds = JSON.parse(sessionStorage.getItem(shownKey) || '[]'); } catch(e) { shownIds = []; }

    let newNotifs = false;

    activeLoans.forEach(loan => {
      const due = new Date(loan.expected_return_date);
      const diffMs = due - now;
      const eqName = loan.equipment_name || loan.equipment_id || 'Equipment';
      const loanKey = `${loan.id}_overdue`;
      const dueSoonKey = `${loan.id}_duesoon`;

      if (diffMs < 0) {
        // OVERDUE — past due date
        const daysOverdue = Math.ceil(Math.abs(diffMs) / 86400000);
        if (!shownIds.includes(loanKey)) {
          toast(
            '⚠️ Overdue Item!',
            `"${eqName}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue. Please return immediately to avoid penalties.`,
            'error'
          );
          shownIds.push(loanKey);
          newNotifs = true;
        }
      } else if (diffMs > 0 && diffMs <= 86400000) {
        // DUE WITHIN 24 HOURS — warning
        const hoursLeft = Math.round(diffMs / 3600000);
        if (!shownIds.includes(dueSoonKey)) {
          toast(
            '⏰ Due Soon!',
            `"${eqName}" is due in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Please prepare to return it on time.`,
            'warning'
          );
          shownIds.push(dueSoonKey);
          newNotifs = true;
        }
      }
    });

    if (newNotifs) {
      sessionStorage.setItem(shownKey, JSON.stringify(shownIds));
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
    switch (S.tab) {
      case 'dashboard': renderDashboard(); break;
      case 'catalog':   renderCatalog();   break;
      case 'requests':  renderRequests();  break;
      case 'loans':     renderLoans();     break;
      case 'history':   renderHistory();   break;
      case 'policy':    /* Static policy text */ break;
    }
  }

  /* ═══════ 1. BORROWER DASHBOARD ═══════ */
  function renderDashboard() {
    const activeLoans = S.requests.filter(r => r.status === 'Active');
    const pendingReqs = S.requests.filter(r => r.status === 'Pending');
    const approvedReqs = S.requests.filter(r => r.status === 'Approved');
    const completedLoans = S.requests.filter(r => r.status === 'Returned');
    const availableItems = S.equipment.filter(e => e.status === 'Available');

    // Overdue calculation
    const now = new Date();
    let overdueCount = 0;
    activeLoans.forEach(l => {
      if (now > new Date(l.expected_return_date)) overdueCount++;
    });

    // Update KPI Cards
    $('kpi-my-active').textContent = activeLoans.length;
    $('kpi-my-active-bar').style.width = `${Math.min(100, (activeLoans.length / 3) * 100)}%`;

    $('kpi-my-pending').textContent = pendingReqs.length;
    $('kpi-my-pending-bar').style.width = `${Math.min(100, pendingReqs.length * 33)}%`;

    $('kpi-avail-items').textContent = availableItems.length;
    $('kpi-avail-bar').style.width = '100%';

    $('kpi-my-completed').textContent = completedLoans.length + S.returns.length;
    $('kpi-my-completed-bar').style.width = '100%';

    // Pickup Banner (if items approved)
    const pickupBanner = $('banner-approved-pickup');
    if (approvedReqs.length > 0) {
      pickupBanner.style.display = 'flex';
      $('banner-approved-text').textContent = `You have ${approvedReqs.length} approved request(s) waiting for collection! Please head to IT Vault / Media Depot to pick up your gear.`;
    } else {
      pickupBanner.style.display = 'none';
    }

    // Overdue Alert Banner
    const overdueBanner = $('banner-borrower-overdue');
    if (overdueCount > 0) {
      overdueBanner.style.display = 'flex';
      $('banner-overdue-title').textContent = `⚠️ Action Required: ${overdueCount} Item(s) Overdue`;
      $('banner-overdue-desc').textContent = 'Please return the item(s) to the Equipment Depot immediately to prevent borrowing suspension.';
    } else {
      overdueBanner.style.display = 'none';
    }

    // Active possessions container
    const loanContainer = $('dash-my-loans-container');
    if (activeLoans.length === 0) {
      loanContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <h3>No Items Currently Borrowed</h3>
          <p>Browse our catalog and submit a request to borrow laptops, cameras, oscilloscopes, or lab gear.</p>
          <button class="btn btn-primary btn-sm mt-1" onclick="EV.switchTab('catalog')">Browse Equipment</button>
        </div>`;
    } else {
      loanContainer.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Due Date</th>
                <th>Time Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${activeLoans.map(l => {
                const due = new Date(l.expected_return_date);
                const diffMs = due - now;
                const isOverdue = diffMs < 0;
                let timeStatus = '';
                if (isOverdue) {
                  const days = Math.max(1, Math.ceil(Math.abs(diffMs) / 86400000));
                  timeStatus = `<span class="time-tag time-tag-overdue">⚠️ Overdue by ${days} day${days > 1 ? 's' : ''}</span>`;
                } else {
                  const days = Math.ceil(diffMs / 86400000);
                  if (days <= 1) {
                    const hours = Math.max(1, Math.round(diffMs / 3600000));
                    timeStatus = `<span class="time-tag time-tag-warning">⏰ Due in 1 day (~${hours}h left)</span>`;
                  } else {
                    timeStatus = `<span class="time-tag time-tag-ok">✓ Due in ${days} days</span>`;
                  }
                }
                const loanUnits = l.units || 1;
                return `
                  <tr class="${isOverdue ? 'overdue-row' : ''}">
                    <td>
                      <div class="table-item-cell">
                        <img class="table-item-img" src="${l.equipment_image || 'assets/images/laptop.jpg'}" alt="">
                        <div>
                          <div class="table-name">${esc(l.equipment_name)} ${loanUnits > 1 ? `<span class="badge badge-subtle" style="font-size:0.7rem; margin-left:4px;">${loanUnits} units</span>` : ''}</div>
                          <div class="table-sub">${esc(l.equipment_id)}</div>
                        </div>
                      </div>
                    </td>
                    <td style="font-size:0.78rem;">${fmtDateTime(l.expected_return_date)}</td>
                    <td>${timeStatus}</td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="EV.viewReceipt('${l.id}')">Receipt</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Recent Requests stream
    const reqStream = $('dash-my-requests-stream');
    const recent = S.requests.slice(0, 6);
    if (recent.length === 0) {
      reqStream.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No requests submitted yet.</p>';
    } else {
      reqStream.innerHTML = recent.map(r => {
        let badge = '';
        let hint = '';
        if (r.status === 'Pending') {
          badge = '<span class="badge badge-pending">Pending Review</span>';
          hint = '<span style="font-size:0.7rem; color:var(--text-dim);">Awaiting custodian approval</span>';
        } else if (r.status === 'Approved') {
          badge = '<span class="badge badge-approved">Approved (Ready)</span>';
          hint = `<span style="font-size:0.7rem; color:var(--status-available); font-weight:600;">Ready for pickup at Depot</span>`;
        } else if (r.status === 'Active') {
          badge = '<span class="badge badge-borrowed">Active Loan</span>';
          hint = `<span style="font-size:0.7rem; color:var(--gold-400);">Due: ${fmtDate(r.expected_return_date)}</span>`;
        } else if (r.status === 'Returned') {
          badge = '<span class="badge badge-returned">Returned</span>';
        } else if (r.status === 'Rejected') {
          badge = '<span class="badge badge-rejected">Declined</span>';
          if (r.rejection_reason) hint = `<div class="rejection-reason-box" style="margin-top:4px;"><b>Note:</b> ${esc(r.rejection_reason)}</div>`;
        }

        const reqUnits = r.units || 1;
        return `
          <div style="padding:10px 0; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div>
              <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${esc(r.equipment_name || r.equipment_id)} ${reqUnits > 1 ? `<span class="badge badge-subtle" style="font-size:0.7rem; margin-left:4px;">${reqUnits} units</span>` : ''}</div>
              <div style="font-size:0.72rem; color:var(--text-dim);">Requested on ${fmtDate(r.created_at || r.borrow_date)} &bull; ${esc(r.id)}</div>
              ${hint}
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              ${badge}
              <button class="btn btn-secondary btn-sm" style="font-size:0.78rem; padding:4px 10px;" onclick="EV.viewReceipt('${r.id}')">Receipt</button>
            </div>
          </div>`;
      }).join('');
    }
  }

  /* ═══════ 2. CATALOG BROWSE & REQUEST ═══════ */
  async function renderCatalog() {
    const f = S.filters.catalog;
    let items = S.equipment;

    if (f.category && f.category !== 'All') {
      items = items.filter(e => e.category === f.category);
    }
    if (f.status === 'Available') {
      // Treat equipment with 0 available units as not available, even if DB status says 'Available'
      items = items.filter(e => {
        const avail = e.available_units !== undefined ? parseInt(e.available_units, 10) : (e.status === 'Available' ? 1 : 0);
        return e.status === 'Available' && avail > 0;
      });
    }
    if (f.search) {
      const q = f.search.toLowerCase();
      items = items.filter(e => (e.name && e.name.toLowerCase().includes(q)) || (e.id && e.id.toLowerCase().includes(q)) || (e.category && e.category.toLowerCase().includes(q)));
    }

    const c = $('catalog-container');
    if (items.length === 0) {
      c.className = 'equipment-grid';
      c.style.padding = '16px';
      c.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          <h3>No Matching Equipment Found</h3>
          <p>Try adjusting your category filter or search keywords.</p>
          <button class="btn btn-secondary btn-sm mt-1" onclick="EV.clearCatalogFilters()">Reset Filters</button>
        </div>`;
      return;
    }

    if (S.viewMode === 'grid') {
      c.className = 'equipment-grid';
      c.style.padding = '16px';
      c.innerHTML = items.map(item => {
        const totalUnits = item.total_units !== undefined ? parseInt(item.total_units, 10) : 1;
        const availUnits = item.available_units !== undefined ? parseInt(item.available_units, 10) : (item.status === 'Available' ? 1 : 0);
        // An item is available only if its DB status is Available AND there is stock
        const isAvail = item.status === 'Available' && availUnits > 0;
        // Effective status: if available_units=0, treat as Borrowed regardless of DB status
        const effectiveStatus = availUnits <= 0 && item.status !== 'Under Maintenance' ? 'Borrowed' : item.status;
        const condClass = item.condition === 'Excellent' ? 'cond-exc' : (item.condition === 'Good' ? 'cond-good' : 'cond-fair');
        const statusClass = isAvail ? 'badge-available' : (effectiveStatus === 'Borrowed' ? 'badge-borrowed' : 'badge-maintenance');
        // Stock badge: always show unit count clearly on the badge
        let stockBadgeText;
        if (effectiveStatus === 'Under Maintenance') {
          stockBadgeText = 'Under Maintenance';
        } else if (effectiveStatus === 'Borrowed' || availUnits <= 0) {
          stockBadgeText = `Borrowed (0/${totalUnits} units)`;
        } else {
          stockBadgeText = `${availUnits}/${totalUnits} Available`;
        }
        // Stock progress bar percentage
        const stockPct = totalUnits > 0 ? Math.round((availUnits / totalUnits) * 100) : 0;
        const stockBarColor = isAvail ? (stockPct > 50 ? 'var(--status-available)' : 'var(--gold-400)') : 'var(--status-borrowed)';

        return `
          <article class="equipment-card">
            <div class="equipment-card-media">
              <img src="${item.image_url || 'assets/images/laptop.jpg'}" alt="${esc(item.name)}" loading="lazy">
              <div class="badge-float"><span class="badge ${statusClass}">${stockBadgeText}</span></div>
              <div class="cat-float">${esc(item.category)}</div>
            </div>
            <div class="equipment-card-body">
              <div class="eq-id-tag">
                <span class="eq-id">${esc(item.id)}</span>
                <span class="cond-pill ${condClass}">${esc(item.condition)}</span>
              </div>
              <h3 class="equipment-card-title">${esc(item.name)}</h3>
              <p class="equipment-card-desc">${esc(item.description || 'Institutional laboratory and academic equipment.')}</p>
              
              <!-- Prominent Stock Box -->
              <div style="margin:8px 0 4px; padding:9px 12px; background:rgba(255,255,255,0.035); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                  <span style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">Units Available</span>
                  <span style="font-size:0.86rem; font-weight:800; color:${isAvail ? 'var(--status-available)' : 'var(--status-borrowed)'};"><b>${availUnits}</b> / ${totalUnits} available</span>
                </div>
                <div style="height:6px; background:var(--bg-elevated); border-radius:99px; overflow:hidden;">
                  <div style="height:100%; width:${stockPct}%; background:${stockBarColor}; border-radius:99px; transition:width 0.4s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.68rem; color:var(--text-dim); margin-top:4px;">
                  <span>${availUnits <= 0 ? '<strong style="color:#f43f5e;">All units borrowed</strong>' : `${availUnits} unit${availUnits > 1 ? 's' : ''} in stock`}</span>
                  <span>Limit: ${totalUnits} total</span>
                </div>
              </div>

              <div class="eq-meta-row" style="margin-top:auto; padding-top:8px;">
                <div class="eq-meta-item">
                  <div class="eq-meta-label">Depot Location</div>
                  <div class="eq-meta-val">${esc(item.location || 'Central Depot')}</div>
                </div>
                <div class="eq-meta-item">
                  <div class="eq-meta-label">Stock Units</div>
                  <div class="eq-meta-val" style="font-weight:700; color:${isAvail ? 'var(--status-available)' : 'var(--status-borrowed)'};">${availUnits} / ${totalUnits}</div>
                </div>
                <div class="eq-meta-item">
                  <div class="eq-meta-label">Serial No.</div>
                  <div class="eq-meta-val">${esc(item.serial_number || 'Tag-Verified')}</div>
                </div>
              </div>
            </div>
            <div class="equipment-card-actions">
              ${isAvail ? `
                <button class="btn btn-primary btn-sm" style="flex:1" onclick="EV.openRequestWith('${item.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Request to Borrow
                </button>` : `
                <button class="btn btn-secondary btn-sm" style="flex:1; opacity:0.55; cursor:not-allowed;" disabled>
                  ${effectiveStatus === 'Under Maintenance' ? 'Under Maintenance' : (availUnits <= 0 ? `All ${totalUnits} Unit${totalUnits>1?'s':''} Borrowed` : effectiveStatus)}
                </button>`
              }
              <button class="btn btn-secondary btn-sm" onclick="EV.openDetails('${item.id}')" title="View Full Specifications">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </button>
            </div>
          </article>`;
      }).join('');
    } else {
      c.className = 'table-wrapper';
      c.style.padding = '0';
      c.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Category</th>
              <th>Condition</th>
              <th>Stock Status</th>
              <th>Depot Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const totalUnits = item.total_units !== undefined ? parseInt(item.total_units, 10) : 1;
              const availUnits = item.available_units !== undefined ? parseInt(item.available_units, 10) : (item.status === 'Available' ? 1 : 0);
              const isAvail = item.status === 'Available' && availUnits > 0;
              const effectiveStatus = availUnits <= 0 && item.status !== 'Under Maintenance' ? 'Borrowed' : item.status;
              const condClass = item.condition === 'Excellent' ? 'cond-exc' : (item.condition === 'Good' ? 'cond-good' : 'cond-fair');
              const statusClass = isAvail ? 'badge-available' : (effectiveStatus === 'Borrowed' ? 'badge-borrowed' : 'badge-maintenance');
              let stockBadgeText;
              if (item.status === 'Under Maintenance') {
                stockBadgeText = 'Under Maintenance';
              } else if (availUnits <= 0) {
                stockBadgeText = totalUnits > 1 ? `Borrowed (0/${totalUnits})` : 'Borrowed';
              } else {
                stockBadgeText = totalUnits > 1 ? `In Stock (${availUnits}/${totalUnits})` : 'Available';
              }
              return `
                <tr>
                  <td>
                    <div class="table-item-cell">
                      <img class="table-item-img" src="${item.image_url || 'assets/images/laptop.jpg'}" alt="">
                      <div>
                        <div class="table-name">${esc(item.name)}</div>
                        <div class="table-sub table-mono">${esc(item.id)}</div>
                      </div>
                    </div>
                  </td>
                  <td>${esc(item.category)}</td>
                  <td><span class="cond-pill ${condClass}">${esc(item.condition)}</span></td>
                  <td>
                    <span class="badge ${statusClass}">${stockBadgeText}</span>
                    ${totalUnits > 1 ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:3px;">${availUnits}/${totalUnits} units available</div>` : ''}
                  </td>
                  <td>${esc(item.location || 'Central Depot')}</td>
                  <td>
                    <div class="table-actions">
                      ${isAvail ? `<button class="btn btn-primary btn-sm" onclick="EV.openRequestWith('${item.id}')">Borrow</button>` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="EV.openDetails('${item.id}')">Specs</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
  }

  /* ═══════ 3. MY REQUESTS & STATUS ═══════ */
  function renderRequests() {
    let reqs = S.requests;
    const f = S.filters.requests;

    if (f.status && f.status !== 'All') {
      reqs = reqs.filter(r => r.status === f.status);
    }
    if (f.search) {
      const q = f.search.toLowerCase();
      reqs = reqs.filter(r => (r.equipment_name && r.equipment_name.toLowerCase().includes(q)) || (r.id && r.id.toLowerCase().includes(q)) || (r.purpose && r.purpose.toLowerCase().includes(q)));
    }

    const tbody = $('my-requests-tbody');
    if (reqs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem;"><p class="text-muted">No borrowing requests found matching your filter.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = reqs.map(r => {
      let statusBadge = '';
      let notesBox = '';

      if (r.status === 'Pending') {
        statusBadge = '<span class="badge badge-pending">Pending Review</span>';
      } else if (r.status === 'Approved') {
        statusBadge = '<span class="badge badge-approved">Approved (Ready for Pickup)</span>';
        if (r.approval_notes) {
          notesBox = `<div class="approval-note-box"><b>Admin Note:</b> ${esc(r.approval_notes)}</div>`;
        }
      } else if (r.status === 'Active') {
        statusBadge = '<span class="badge badge-borrowed">Active Loan (In Hand)</span>';
      } else if (r.status === 'Returned') {
        statusBadge = '<span class="badge badge-returned">Returned & Closed</span>';
      } else if (r.status === 'Rejected') {
        statusBadge = '<span class="badge badge-rejected">Declined</span>';
        if (r.rejection_reason) {
          notesBox = `<div class="rejection-reason-box"><b>Reason:</b> ${esc(r.rejection_reason)}</div>`;
        }
      }

      const canCancel = r.status === 'Pending';
      const reqUnits = r.units || 1;

      return `
        <tr>
          <td class="table-mono">${esc(r.id)}</td>
          <td>
            <div class="table-item-cell">
              <img class="table-item-img" src="${r.equipment_image || 'assets/images/laptop.jpg'}" alt="">
              <div>
                <div class="table-name">${esc(r.equipment_name || r.equipment_id)} ${reqUnits > 1 ? `<span class="badge badge-subtle" style="font-size:0.7rem; margin-left:4px;">${reqUnits} units</span>` : ''}</div>
                <div class="table-sub">${esc(r.equipment_id)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.78rem;">
            <div><b>Pickup:</b> ${fmtDateTime(r.borrow_date)}</div>
            <div><b>Due:</b> ${fmtDateTime(r.expected_return_date)}</div>
          </td>
          <td>
            <div style="max-width:220px; font-size:0.78rem; color:var(--text-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${esc(r.purpose)}">
              ${esc(r.purpose)}
            </div>
          </td>
          <td>
            ${statusBadge}
            ${notesBox}
          </td>
          <td>
            <div class="table-actions">
              ${canCancel ? `
                <button class="btn btn-danger btn-sm" onclick="EV.cancelRequest('${r.id}')" title="Cancel this pending request">
                  Cancel
                </button>` : ''
              }
              <button class="btn btn-secondary btn-sm" onclick="EV.viewReceipt('${r.id}')" title="View Digital Receipt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Receipt
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  /* ═══════ 4. MY ACTIVE LOANS ═══════ */
  function renderLoans() {
    const active = S.requests.filter(r => r.status === 'Active');
    const tbody = $('my-loans-tbody');
    const now = new Date();

    if (active.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem;"><p class="text-muted">You do not currently have any active equipment loans checked out.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = active.map(r => {
      const due = new Date(r.expected_return_date);
      const diffMs = due - now;
      const isOverdue = diffMs < 0;
      const loanUnits = r.units || 1;
      let timeTag = '';
      if (isOverdue) {
        const days = Math.max(1, Math.ceil(Math.abs(diffMs) / 86400000));
        timeTag = `<span class="time-tag time-tag-overdue">⚠️ Overdue by ${days} day${days > 1 ? 's' : ''}</span>`;
      } else {
        const days = Math.ceil(diffMs / 86400000);
        if (days <= 1) {
          const hours = Math.max(1, Math.round(diffMs / 3600000));
          timeTag = `<span class="time-tag time-tag-warning">⏰ Due in 1 day (~${hours}h left)</span>`;
        } else {
          timeTag = `<span class="time-tag time-tag-ok">✓ Due in ${days} days</span>`;
        }
      }

      return `
        <tr class="${isOverdue ? 'overdue-row' : ''}">
          <td class="table-mono">${esc(r.id)}</td>
          <td>
            <div class="table-item-cell">
              <img class="table-item-img" src="${r.equipment_image || 'assets/images/laptop.jpg'}" alt="">
              <div>
                <div class="table-name">${esc(r.equipment_name || r.equipment_id)} ${loanUnits > 1 ? `<span class="badge badge-subtle" style="font-size:0.7rem; margin-left:4px;">${loanUnits} units</span>` : ''}</div>
                <div class="table-sub">${esc(r.equipment_id)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.78rem;">${fmtDateTime(r.borrow_date)}</td>
          <td style="font-size:0.78rem; font-weight:700; color:${isOverdue ? '#f43f5e' : 'inherit'};">
            ${fmtDateTime(r.expected_return_date)}
          </td>
          <td>${timeTag}</td>
          <td style="font-size:0.75rem; color:var(--text-secondary);">
            Return to <b>Central Equipment Depot (Room 104)</b> with all power cords & accessories.
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="EV.viewReceipt('${r.id}')">Receipt</button>
          </td>
        </tr>`;
    }).join('');
  }

  /* ═══════ 5. BORROWING HISTORY ═══════ */
  function renderHistory() {
    let hist = S.returns;
    const q = (S.filters.history.search || '').toLowerCase();
    if (q) {
      hist = hist.filter(r => (r.equipment_name && r.equipment_name.toLowerCase().includes(q)) || (r.id && r.id.toLowerCase().includes(q)));
    }

    const tbody = $('my-history-tbody');
    if (hist.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem;"><p class="text-muted">No completed return records found.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = hist.map(r => {
      const condClass = r.condition_on_return === 'Excellent' ? 'cond-exc' : (r.condition_on_return === 'Good' ? 'cond-good' : 'cond-fair');
      const isOverdue = r.is_overdue == 1;
      const retUnits = r.units || 1;

      return `
        <tr>
          <td class="table-mono" style="color:var(--gold-400)">${esc(r.id)}</td>
          <td>
            <div class="table-item-cell">
              <img class="table-item-img" src="${r.equipment_image || 'assets/images/laptop.jpg'}" alt="">
              <div>
                <div class="table-name">${esc(r.equipment_name || r.equipment_id)} ${retUnits > 1 ? `<span class="badge badge-subtle" style="font-size:0.7rem; margin-left:4px;">${retUnits} units</span>` : ''}</div>
                <div class="table-sub">${esc(r.equipment_id)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.78rem;">${fmtDate(r.borrow_date)}</td>
          <td style="font-size:0.78rem;">
            <div>${fmtDateTime(r.actual_return_date)}</div>
            ${isOverdue ? `<span style="font-size:0.68rem; color:#f43f5e; font-weight:700;">(${r.days_overdue}d late)</span>` : '<span style="font-size:0.68rem; color:var(--status-available);">On Time</span>'}
          </td>
          <td><span class="cond-pill ${condClass}">${esc(r.condition_on_return)}</span></td>
          <td style="font-size:0.8rem;">${esc(r.received_by || 'Custodian')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="EV.viewRetReceipt('${r.id}')" title="Return Slip">
              Slip
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  /* ═══════ EVENT BINDINGS ═══════ */
  function bindEvents() {
    // Navigation
    $$('.nav-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('btn-logout').addEventListener('click', logout);
    $('chip-my-pending').addEventListener('click', () => switchTab('requests'));
    $('chip-my-overdue').addEventListener('click', () => switchTab('loans'));

    // Dashboard CTAs
    if ($('btn-dash-browse')) $('btn-dash-browse').addEventListener('click', () => switchTab('catalog'));
    if ($('btn-dash-request')) $('btn-dash-request').addEventListener('click', () => EV.openRequest());
    if ($('btn-catalog-custom-req')) $('btn-catalog-custom-req').addEventListener('click', () => EV.openRequest());
    if ($('btn-new-borrow-req')) $('btn-new-borrow-req').addEventListener('click', () => EV.openRequest());

    // Catalog search & filters
    if ($('cat-search')) $('cat-search').addEventListener('input', debounce(e => { S.filters.catalog.search = e.target.value; renderCatalog(); }, 250));
    if ($('cat-category-filter')) $('cat-category-filter').addEventListener('change', e => { S.filters.catalog.category = e.target.value; renderCatalog(); });
    if ($('cat-status-filter')) $('cat-status-filter').addEventListener('change', e => { S.filters.catalog.status = e.target.value; renderCatalog(); });
    if ($('btn-cat-grid')) $('btn-cat-grid').addEventListener('click', () => { S.viewMode = 'grid'; $('btn-cat-grid').classList.add('active'); $('btn-cat-list').classList.remove('active'); renderCatalog(); });
    if ($('btn-cat-list')) $('btn-cat-list').addEventListener('click', () => { S.viewMode = 'list'; $('btn-cat-list').classList.add('active'); $('btn-cat-grid').classList.remove('active'); renderCatalog(); });

    // Requests search & filter
    if ($('my-req-search')) $('my-req-search').addEventListener('input', debounce(e => { S.filters.requests.search = e.target.value; renderRequests(); }, 250));
    if ($('my-req-status-filter')) $('my-req-status-filter').addEventListener('change', e => { S.filters.requests.status = e.target.value; renderRequests(); });

    // History search
    if ($('my-hist-search')) $('my-hist-search').addEventListener('input', debounce(e => { S.filters.history.search = e.target.value; renderHistory(); }, 250));

    // Official Borrower Profile Modal (Displays authenticated credentials)
    function openProfileModal() {
      if (!S.user) return;
      const name = S.user.name || 'Student Borrower';
      const parts = name.split(' ');
      const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
      if ($('modal-profile-avatar')) $('modal-profile-avatar').textContent = initials;
      if ($('modal-profile-name')) $('modal-profile-name').textContent = name;
      if ($('modal-profile-id')) $('modal-profile-id').textContent = S.user.borrower_id || 'STU-2026-001';
      if ($('modal-profile-email')) $('modal-profile-email').textContent = S.user.email || 'borrower@equipvault.edu';
      if ($('modal-profile-dept')) $('modal-profile-dept').textContent = S.user.department || 'Information Technology';
      openModal('modal-profile');
    }

    if ($('header-user-btn')) $('header-user-btn').addEventListener('click', openProfileModal);
    if ($('sidebar-user-card')) $('sidebar-user-card').addEventListener('click', openProfileModal);
    if ($('btn-modal-logout')) $('btn-modal-logout').addEventListener('click', () => { closeModal('modal-profile'); logout(); });

    // Duration preset chips in request modal
    $$('.duration-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.duration-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const days = parseInt(chip.dataset.days, 10);
        const borrowInp = $('req-b-borrow-date');
        const baseDate = borrowInp.value ? new Date(borrowInp.value) : new Date();
        const retDate = new Date(baseDate.getTime() + days * 86400000);
        $('req-b-return-date').value = retDate.toISOString().slice(0, 16);
        updateDurationCalc();
      });
    });

    if ($('req-b-return-date')) $('req-b-return-date').addEventListener('change', updateDurationCalc);
    if ($('req-b-borrow-date')) $('req-b-borrow-date').addEventListener('change', updateDurationCalc);

    // Request Form Submission
    $('form-borrower-request').addEventListener('submit', handleBorrowerRequestSubmit);

    // Modal Close
    $$('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    $$('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', e => { if (e.target === bd) closeModal(bd.id); });
    });

    // Print Receipt
    if ($('btn-print-receipt')) $('btn-print-receipt').addEventListener('click', () => window.print());
  }

  function updateDurationCalc() {
    const b = $('req-b-borrow-date').value;
    const r = $('req-b-return-date').value;
    const calcEl = $('req-duration-calc');
    if (!b || !r || !calcEl) return;
    const ms = new Date(r) - new Date(b);
    if (ms <= 0) {
      calcEl.textContent = 'Invalid duration';
      calcEl.style.color = 'var(--status-overdue)';
    } else {
      const days = Math.round(ms / 86400000);
      const hours = Math.round(ms / 3600000);
      calcEl.textContent = days >= 1 ? `${days} day${days > 1 ? 's' : ''}` : `${hours} hours`;
      calcEl.style.color = 'var(--gold-400)';
    }
  }

  /* ═══════ SUBMIT REQUEST ═══════ */
  async function handleBorrowerRequestSubmit(e) {
    e.preventDefault();
    const btn = $('btn-submit-borrow-req');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const eqId = $('req-equipment-select').value;
      const units = Math.max(1, parseInt($('req-b-units')?.value || '1', 10));
      const bDate = $('req-b-borrow-date').value;
      const rDate = $('req-b-return-date').value;
      const purpose = $('req-b-purpose').value.trim();
      const phone = $('req-b-phone').value.trim();

      if (!eqId) throw new Error('Please select an equipment item.');
      
      const item = S.equipment.find(e => e.id === eqId);
      const avail = item && item.available_units !== undefined ? parseInt(item.available_units, 10) : 1;
      if (item && units > avail) {
        throw new Error(`Requested units (${units}) exceed available stock (${avail}).`);
      }

      if (!purpose) throw new Error('Please provide an academic purpose / description.');
      if (new Date(rDate) <= new Date(bDate)) throw new Error('Expected return date must be after borrow date.');

      const reqData = {
        equipment_id: eqId,
        units: units,
        borrower_name: S.user?.name || 'Student Borrower',
        borrower_email: S.user?.email || 'borrower@equipvault.edu',
        borrower_id_number: S.user?.borrower_id || 'STU-2026-001',
        department: S.user?.department || 'Information Technology',
        contact_number: phone,
        borrow_date: bDate ? bDate.replace('T', ' ') + ':00' : new Date().toISOString().slice(0, 19).replace('T', ' '),
        expected_return_date: rDate.replace('T', ' ') + ':00',
        purpose: purpose
      };

      const result = await StorageService.createRequest(reqData);
      closeModal('modal-borrower-request');
      toast('Request Submitted!', `Your borrow request was created for ${units} unit(s). ID: ${result.id || ''}`, 'success');
      await refreshAll();
      switchTab('requests');
    } catch (err) {
      toast('Submission Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Submit Request to Admin';
    }
  }

  /* ═══════ CANCEL REQUEST ═══════ */
  async function cancelRequest(id) {
    if (!confirm(`Are you sure you want to cancel request ${id}?`)) return;
    try {
      await StorageService.cancelRequest(id, S.user?.name);
      toast('Request Cancelled', `Borrowing request ${id} has been cancelled.`, 'info');
      await refreshAll();
    } catch (err) {
      toast('Error', err.message, 'error');
    }
  }

  /* ═══════ MODALS & ACTIONS ═══════ */
  function openModal(id) {
    const m = $(id);
    if (m) m.classList.add('open');
  }

  function closeModal(id) {
    const m = $(id);
    if (m) m.classList.remove('open');
  }

  function updateBorrowerStockLimitation() {
    const sel = $('req-equipment-select');
    const unitsInp = $('req-b-units');
    const hintEl = $('req-b-stock-hint');
    if (!sel) return;

    const item = S.equipment.find(e => e.id === sel.value);
    if (item) {
      const avail = item.available_units !== undefined ? parseInt(item.available_units, 10) : 1;
      const total = item.total_units !== undefined ? parseInt(item.total_units, 10) : 1;
      if (unitsInp) {
        unitsInp.max = Math.max(1, avail);
        if (parseInt(unitsInp.value, 10) > avail) unitsInp.value = Math.max(1, avail);
      }
      if (hintEl) {
        hintEl.textContent = `Stock Limit: ${avail} of ${total} units currently available in depot stock`;
        hintEl.style.color = avail > 0 ? 'var(--status-available)' : 'var(--status-borrowed)';
      }
    } else {
      if (unitsInp) unitsInp.max = 99;
      if (hintEl) {
        hintEl.textContent = 'Maximum units available depends on current depot inventory';
        hintEl.style.color = 'var(--text-dim)';
      }
    }
  }

  function openRequest(preSelectEqId) {
    // Populate equipment select with Available items
    const sel = $('req-equipment-select');
    sel.innerHTML = '<option value="">— Select Available Equipment —</option>';
    S.equipment.forEach(e => {
      const avail = e.available_units !== undefined ? parseInt(e.available_units, 10) : (e.status === 'Available' ? 1 : 0);
      const total = e.total_units !== undefined ? parseInt(e.total_units, 10) : 1;
      const isAvail = e.status === 'Available' && avail > 0;
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.id}) — ${avail}/${total} units in stock`;
      if (!isAvail) {
        opt.disabled = true;
        opt.textContent += ' [Out of Stock]';
        opt.style.color = 'var(--text-dim)';
      }
      if (preSelectEqId && e.id === preSelectEqId) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.onchange = updateBorrowerStockLimitation;

    // Reset units input
    const unitsInp = $('req-b-units');
    if (unitsInp) unitsInp.value = 1;
    updateBorrowerStockLimitation();

    // Default dates: now and +3 days
    const now = new Date();
    const future = new Date(now.getTime() + 3 * 86400000);
    $('req-b-borrow-date').value = now.toISOString().slice(0, 16);
    $('req-b-return-date').value = future.toISOString().slice(0, 16);
    updateDurationCalc();

    openModal('modal-borrower-request');
  }

  function openRequestWith(eqId) {
    openRequest(eqId);
  }

  function openDetails(eqId) {
    const item = S.equipment.find(e => e.id === eqId);
    if (!item) return;

    $('modal-details-name').textContent = item.name;
    const totalUnits = item.total_units !== undefined ? parseInt(item.total_units, 10) : 1;
    const availUnits = item.available_units !== undefined ? parseInt(item.available_units, 10) : (item.status === 'Available' ? 1 : 0);
    const isAvail = item.status === 'Available' && availUnits > 0;
    const statusClass = isAvail ? 'badge-available' : (item.status === 'Borrowed' ? 'badge-borrowed' : 'badge-maintenance');
    const stockBadgeText = isAvail ? `${availUnits} of ${totalUnits} In Stock` : (totalUnits > 1 && availUnits === 0 ? `Out of Stock (0/${totalUnits})` : item.status);

    $('modal-details-body').innerHTML = `
      <div style="text-align:center; margin-bottom:16px;">
        <img src="${item.image_url || 'assets/images/laptop.jpg'}" alt="${esc(item.name)}" style="max-height:200px; border-radius:var(--radius-md); object-fit:contain; border:1px solid var(--border-medium);">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.8rem; margin-bottom:16px;">
        <div><b>ID:</b> <span class="table-mono text-gold">${esc(item.id)}</span></div>
        <div><b>Category:</b> ${esc(item.category)}</div>
        <div><b>Condition:</b> ${esc(item.condition)}</div>
        <div><b>Status:</b> <span class="badge ${statusClass}">${stockBadgeText}</span></div>
        <div><b>Stock Capacity:</b> <span style="font-weight:700;">${totalUnits} unit${totalUnits > 1 ? 's' : ''}</span></div>
        <div><b>Available Units:</b> <span style="color:var(--status-available); font-weight:700;">${availUnits} available</span></div>
        <div><b>Serial Number:</b> ${esc(item.serial_number || 'None')}</div>
        <div><b>Storage Location:</b> ${esc(item.location || 'Central Depot')}</div>
      </div>
      <div style="font-size:0.82rem; line-height:1.5; color:var(--text-secondary); background:var(--bg-elevated); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
        <b>Specifications & Notes:</b>
        <p style="margin-top:6px;">${esc(item.description || 'No additional specifications provided for this unit.')}</p>
      </div>`;

    const borrowBtn = $('btn-details-borrow');
    if (borrowBtn) {
      if (isAvail) {
        borrowBtn.style.display = 'inline-flex';
        borrowBtn.onclick = () => {
          closeModal('modal-details');
          openRequestWith(item.id);
        };
      } else {
        borrowBtn.style.display = 'none';
      }
    }

    openModal('modal-details');
  }

  function viewReceipt(reqId) {
    const req = S.requests.find(r => r.id === reqId);
    if (!req) return;
    const reqUnits = req.units || 1;

    $('modal-receipt-content').innerHTML = `
      <div class="receipt-box receipt-printable" style="color:var(--text-primary, #f1f5f9);background:var(--bg-surface, #13161d);padding:22px;border:1px solid var(--border-gold, rgba(245,158,11,0.3));border-radius:12px;">
        <div class="receipt-box-header" style="text-align:center;border-bottom:1px dashed var(--border-medium, rgba(255,255,255,0.12));padding-bottom:14px;margin-bottom:14px;">
          <div class="receipt-box-title" style="color:var(--gold-400, #fbbf24);font-size:1.15rem;font-weight:800;letter-spacing:0.03em;">EQUIPVAULT BORROWING VOUCHER</div>
          <div class="receipt-box-sub" style="color:var(--text-secondary, #94a3b8);font-size:0.78rem;margin-top:3px;">UNIVERSITY EQUIPMENT MANAGEMENT SYSTEM &bull; Official Digital Record</div>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Request ID:</span>
          <b style="color:var(--text-primary, #ffffff);">${esc(req.id)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Status:</span>
          <b style="color:var(--gold-400, #fbbf24);">${esc(req.status)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Borrower:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(req.borrower_name)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Student ID:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(req.borrower_id_number)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Department:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(req.department)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Contact:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(req.contact_number || '—')}</span>
        </div>
        <div class="receipt-divider" style="border-top:1px dashed var(--border-medium, rgba(255,255,255,0.12));margin:12px 0;"></div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Equipment:</span>
          <b style="color:var(--text-primary, #ffffff);">${esc(req.equipment_name || req.equipment_id)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Asset Tag:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(req.equipment_id)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Units Borrowed:</span>
          <b style="color:var(--gold-400, #fbbf24);">${reqUnits} unit${reqUnits > 1 ? 's' : ''}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Pickup Date:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${fmtDateTime(req.borrow_date)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Due Date:</span>
          <b style="color:var(--gold-400, #fbbf24);">${fmtDateTime(req.expected_return_date)}</b>
        </div>
        <div class="receipt-divider" style="border-top:1px dashed var(--border-medium, rgba(255,255,255,0.12));margin:12px 0;"></div>
        <div style="font-size:0.84rem; color:var(--text-secondary, #94a3b8); line-height:1.5;">
          <b style="color:var(--text-primary, #ffffff);">Purpose:</b> ${esc(req.purpose)}
        </div>
        ${req.approval_notes ? `
          <div style="margin-top:8px; font-size:0.84rem; color:var(--status-available, #10b981);">
            <b>Admin Notes:</b> ${esc(req.approval_notes)}
          </div>` : ''
        }
        ${req.rejection_reason ? `
          <div style="margin-top:8px; font-size:0.84rem; color:var(--status-rejected, #ef4444);">
            <b>Rejection Reason:</b> ${esc(req.rejection_reason)}
          </div>` : ''
        }
        <div class="receipt-footer" style="text-align:center;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.12));padding-top:12px;margin-top:14px;font-size:0.76rem;color:var(--text-secondary, #94a3b8);">
          EquipVault Digital Tracking &bull; Central Depot Room 104
        </div>
      </div>`;
    openModal('modal-receipt');
  }

  function viewRetReceipt(retId) {
    const ret = S.returns.find(r => r.id === retId);
    if (!ret) return;
    const retUnits = ret.units || 1;

    $('modal-receipt-content').innerHTML = `
      <div class="receipt-box receipt-printable" style="color:var(--text-primary, #f1f5f9);background:var(--bg-surface, #13161d);padding:22px;border:1px solid var(--status-available, #10b981);border-radius:12px;">
        <div class="receipt-box-header" style="text-align:center;border-bottom:1px dashed var(--border-medium, rgba(255,255,255,0.12));padding-bottom:14px;margin-bottom:14px;">
          <div class="receipt-box-title" style="color:var(--status-available, #10b981);font-size:1.15rem;font-weight:800;letter-spacing:0.03em;">RETURN CLEARANCE CERTIFICATE</div>
          <div class="receipt-box-sub" style="color:var(--text-secondary, #94a3b8);font-size:0.78rem;margin-top:3px;">EQUIPVAULT DEPOT AUDIT RECORD &bull; Official Clearance Slip</div>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Return Slip ID:</span>
          <b style="color:var(--text-primary, #ffffff);">${esc(ret.id)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Original Request:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(ret.request_id)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Borrower:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(ret.borrower_name)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Equipment:</span>
          <b style="color:var(--text-primary, #ffffff);">${esc(ret.equipment_name || ret.equipment_id)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Units Returned:</span>
          <b style="color:var(--status-available, #10b981);">${retUnits} unit${retUnits > 1 ? 's' : ''}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Returned On:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${fmtDateTime(ret.actual_return_date)}</span>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Condition Verified:</span>
          <b style="color:var(--status-available, #10b981);font-weight:700;">${esc(ret.condition_on_return)}</b>
        </div>
        <div class="receipt-row" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary, #94a3b8);font-size:0.84rem;">
          <span>Received By:</span>
          <span class="val" style="color:var(--text-primary, #ffffff);font-weight:600;">${esc(ret.received_by)}</span>
        </div>
        <div class="receipt-footer" style="color:var(--status-available, #10b981);font-weight:600;text-align:center;border-top:1px dashed var(--border-medium, rgba(255,255,255,0.12));padding-top:12px;margin-top:14px;font-size:0.78rem;">
          ✓ Item safely inspected and checked into storage.
        </div>
      </div>`;
    openModal('modal-receipt');
  }

  function clearCatalogFilters() {
    S.filters.catalog = { category: 'All', status: 'Available', search: '' };
    if ($('cat-search')) $('cat-search').value = '';
    if ($('cat-category-filter')) $('cat-category-filter').value = 'All';
    if ($('cat-status-filter')) $('cat-status-filter').value = 'Available';
    renderCatalog();
  }

  /* ═══════ THEME & TOASTS ═══════ */
  function initTheme() {
    const saved = localStorage.getItem('ev_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = $('btn-theme');
    if (btn) {
      btn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ev_theme', next);
      });
    }
  }

  function toast(title, msg, type = 'success') {
    const tc = $('toast-container');
    if (!tc) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    t.innerHTML = `
      <div class="toast-icon">${icons[type] || '✓'}</div>
      <div class="toast-content">
        <div class="toast-title">${esc(title)}</div>
        <div class="toast-msg">${esc(msg)}</div>
      </div>`;
    tc.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = 'all 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }

  /* ═══════ EXPOSE GLOBAL API ═══════ */
  window.EV = {
    switchTab,
    openRequest,
    openRequestWith,
    openDetails,
    cancelRequest,
    viewReceipt,
    viewRetReceipt,
    clearCatalogFilters
  };

})();
