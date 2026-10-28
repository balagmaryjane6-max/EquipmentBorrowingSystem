/**
 * StorageService — Hybrid API / LocalStorage data layer
 */
const StorageService = {
  isApiMode: false,
  apiBase: 'api',

  async init() {
    try {
      const res = await fetch(this.apiBase + '/equipment.php', { method: 'GET' });
      if (res.ok) {
        this.isApiMode = true;
        return { mode: 'api' };
      }
    } catch (e) { /* fallback */ }
    this.isApiMode = false;
    this._seedLocalIfNeeded();
    return { mode: 'local' };
  },

  // ─── Equipment ───
  async getEquipment(filters) {
    let items = [];
    if (this.isApiMode) {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.category && filters.category !== 'All') params.set('category', filters.category);
        if (filters.status && filters.status !== 'All') params.set('status', filters.status);
        if (filters.condition && filters.condition !== 'All') params.set('condition', filters.condition);
        if (filters.search) params.set('search', filters.search);
      }
      const res = await fetch(`${this.apiBase}/equipment.php?${params}`);
      const json = await res.json();
      items = json.data || [];
    } else {
      items = this._getLocal('equipment') || [];
      if (filters) {
        if (filters.category && filters.category !== 'All') items = items.filter(i => i.category === filters.category);
        if (filters.status && filters.status !== 'All') items = items.filter(i => i.status === filters.status);
        if (filters.condition && filters.condition !== 'All') items = items.filter(i => i.condition === filters.condition);
        if (filters.search) {
          const s = filters.search.toLowerCase();
          items = items.filter(i => i.name.toLowerCase().includes(s) || i.id.toLowerCase().includes(s));
        }
      }
    }

    // Always normalize units and enforce: if available_units <= 0, status is Borrowed!
    return items.map(i => {
      const tot = Math.max(1, parseInt(i.total_units != null ? i.total_units : (i.units || 1), 10) || 1);
      const av = i.available_units != null ? Math.max(0, parseInt(i.available_units, 10)) : (i.status === 'Available' ? tot : 0);
      let st = i.status || 'Available';
      if (st !== 'Under Maintenance') {
        st = (av <= 0) ? 'Borrowed' : 'Available';
      }
      return {
        ...i,
        total_units: tot,
        available_units: av,
        status: st
      };
    });
  },

  async getEquipmentById(id) {
    let i = null;
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/equipment.php?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      i = json.data || null;
    } else {
      i = (this._getLocal('equipment') || []).find(e => e.id === id) || null;
    }
    if (!i) return null;
    const tot = Math.max(1, parseInt(i.total_units != null ? i.total_units : (i.units || 1), 10) || 1);
    const av = i.available_units != null ? Math.max(0, parseInt(i.available_units, 10)) : (i.status === 'Available' ? tot : 0);
    let st = i.status || 'Available';
    if (st !== 'Under Maintenance') {
      st = (av <= 0) ? 'Borrowed' : 'Available';
    }
    return { ...i, total_units: tot, available_units: av, status: st };
  },

  async saveEquipment(data, isEdit) {
    const totalUnits = Math.max(1, parseInt(data.total_units || data.units || 1, 10));
    let availableUnits = data.available_units != null 
      ? Math.max(0, Math.min(totalUnits, parseInt(data.available_units, 10))) 
      : ((data.status === 'Available') ? totalUnits : 0);
    let status = data.status || 'Available';
    if (status !== 'Under Maintenance') {
      status = (availableUnits <= 0) ? 'Borrowed' : 'Available';
    }

    const payload = {
      ...data,
      status: status,
      total_units: totalUnits,
      available_units: availableUnits
    };

    if (this.isApiMode) {
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(`${this.apiBase}/equipment.php`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      return await res.json();
    }
    let items = this._getLocal('equipment') || [];
    const eqData = { ...payload };

    if (isEdit) {
      items = items.map(i => i.id === data.id ? { ...i, ...eqData } : i);
    } else {
      eqData.total_borrows = 0;
      eqData.created_at = new Date().toISOString();
      items.push(eqData);
    }
    this._setLocal('equipment', items);
    return eqData;
  },

  async deleteEquipment(id) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/equipment.php`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      return await res.json();
    }
    let items = this._getLocal('equipment') || [];
    this._setLocal('equipment', items.filter(i => i.id !== id));
    return { success: true };
  },

  // ─── Requests ───
  async getRequests(filters) {
    if (this.isApiMode) {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.status && filters.status !== 'All') params.set('status', filters.status);
        if (filters.search) params.set('search', filters.search);
        if (filters.borrower_id) params.set('borrower_id', filters.borrower_id);
        if (filters.borrower_email) params.set('borrower_email', filters.borrower_email);
      }
      const res = await fetch(`${this.apiBase}/requests.php?${params}`);
      const json = await res.json();
      return json.data || [];
    }
    let reqs = this._getLocal('requests') || [];
    if (filters) {
      if (filters.status && filters.status !== 'All') reqs = reqs.filter(r => r.status === filters.status);
      if (filters.borrower_id) {
        const bid = filters.borrower_id.toLowerCase();
        reqs = reqs.filter(r => (r.borrower_id_number && r.borrower_id_number.toLowerCase() === bid));
      }
      if (filters.borrower_email) {
        const be = filters.borrower_email.toLowerCase();
        reqs = reqs.filter(r => (r.borrower_email && r.borrower_email.toLowerCase() === be));
      }
      if (filters.search) {
        const s = filters.search.toLowerCase();
        reqs = reqs.filter(r => (r.borrower_name && r.borrower_name.toLowerCase().includes(s)) || (r.equipment_name && r.equipment_name.toLowerCase().includes(s)) || (r.id && r.id.toLowerCase().includes(s)));
      }
    }
    return reqs;
  },

  async createRequest(data) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/requests.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json;
    }
    const reqs = this._getLocal('requests') || [];
    const eq = (this._getLocal('equipment') || []).find(e => e.id === data.equipment_id);
    const units = Math.max(1, parseInt(data.units || 1, 10));
    const avail = eq ? (eq.available_units != null ? eq.available_units : (eq.status === 'Available' ? 1 : 0)) : 0;
    if (avail < units) {
      throw new Error(`Insufficient stock. Only ${avail} unit(s) available.`);
    }

    const req = {
      ...data,
      units: units,
      id: 'REQ-' + Date.now().toString(36).toUpperCase(),
      status: 'Pending',
      equipment_name: eq?.name || data.equipment_id,
      equipment_image: eq?.image_url || '',
      created_at: new Date().toISOString()
    };
    reqs.push(req);
    this._setLocal('requests', reqs);
    return req;
  },

  async cancelRequest(id, borrowerName) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/requests.php`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'cancel' })
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to cancel request'); }
      return await res.json();
    }
    let reqs = this._getLocal('requests') || [];
    reqs = reqs.map(r => r.id === id ? { ...r, status: 'Rejected', rejection_reason: 'Cancelled by borrower' } : r);
    this._setLocal('requests', reqs);
    return { success: true };
  },

  async approveRequest(id, notes, approvedBy) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/requests.php`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve', approval_notes: notes, approved_by: approvedBy })
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      return await res.json();
    }
    let reqs = this._getLocal('requests') || [];
    reqs = reqs.map(r => r.id === id ? { ...r, status: 'Approved', approval_notes: notes, approved_by: approvedBy, approved_at: new Date().toISOString() } : r);
    this._setLocal('requests', reqs);
    return { success: true };
  },

  async rejectRequest(id, reason, rejectedBy) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/requests.php`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', rejection_reason: reason, approved_by: rejectedBy })
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      return await res.json();
    }
    let reqs = this._getLocal('requests') || [];
    reqs = reqs.map(r => r.id === id ? { ...r, status: 'Rejected', rejection_reason: reason, approved_by: rejectedBy } : r);
    this._setLocal('requests', reqs);
    return { success: true };
  },

  async releaseEquipment(reqId, releasedBy) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/requests.php`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reqId, action: 'release', released_by: releasedBy })
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      return await res.json();
    }
    let reqs = this._getLocal('requests') || [];
    let targetReq = null;
    reqs = reqs.map(r => {
      if (r.id === reqId) {
        targetReq = r;
        return { ...r, status: 'Active', released_by: releasedBy, released_at: new Date().toISOString() };
      }
      return r;
    });
    this._setLocal('requests', reqs);

    if (targetReq) {
      const reqUnits = Math.max(1, parseInt(targetReq.units || 1, 10));
      let items = this._getLocal('equipment') || [];
      items = items.map(e => {
        if (e.id === targetReq.equipment_id) {
          const curr = e.available_units != null ? e.available_units : (e.status === 'Available' ? (e.total_units || 1) : 0);
          const nextAvail = Math.max(0, curr - reqUnits);
          return {
            ...e,
            available_units: nextAvail,
            status: nextAvail <= 0 ? 'Borrowed' : 'Available',
            total_borrows: (e.total_borrows || 0) + reqUnits
          };
        }
        return e;
      });
      this._setLocal('equipment', items);
    }
    return { success: true };
  },

  // ─── Returns ───
  async getReturns(filters) {
    if (this.isApiMode) {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.condition && filters.condition !== 'All') params.set('condition', filters.condition);
        if (filters.search) params.set('search', filters.search);
        if (filters.borrower_id) params.set('borrower_id', filters.borrower_id);
        if (filters.borrower_email) params.set('borrower_email', filters.borrower_email);
      }
      const res = await fetch(`${this.apiBase}/returns.php?${params}`);
      const json = await res.json();
      return json.data || [];
    }
    let rets = this._getLocal('returns') || [];
    if (filters) {
      if (filters.condition && filters.condition !== 'All') rets = rets.filter(r => r.condition_on_return === filters.condition);
      if (filters.borrower_id) {
        const bid = filters.borrower_id.toLowerCase();
        rets = rets.filter(r => (r.borrower_id_number && r.borrower_id_number.toLowerCase() === bid) || (r.borrower_name && r.borrower_name.toLowerCase() === bid));
      }
      if (filters.borrower_email) {
        const be = filters.borrower_email.toLowerCase();
        rets = rets.filter(r => (r.borrower_email && r.borrower_email.toLowerCase() === be));
      }
      if (filters.search) {
        const s = filters.search.toLowerCase();
        rets = rets.filter(r => r.borrower_name.toLowerCase().includes(s) || r.equipment_id.toLowerCase().includes(s));
      }
    }
    return rets;
  },

  async processReturn(data) {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/returns.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json;
    }
    const reqs = this._getLocal('requests') || [];
    const req = reqs.find(r => r.id === data.request_id);
    if (!req) throw new Error('Request not found');
    const actualDate = new Date(data.actual_return_date);
    const dueDate = new Date(req.expected_return_date);
    const isOverdue = actualDate > dueDate;
    const daysOverdue = isOverdue ? Math.ceil((actualDate - dueDate) / 86400000) : 0;
    const retId = 'RET-' + Date.now().toString(36).toUpperCase();
    const reqUnits = Math.max(1, parseInt(req.units || 1, 10));
    const ret = {
      id: retId, request_id: data.request_id, equipment_id: req.equipment_id,
      equipment_name: req.equipment_name, borrower_name: req.borrower_name,
      borrow_date: req.borrow_date, expected_return_date: req.expected_return_date,
      actual_return_date: data.actual_return_date, is_overdue: isOverdue ? 1 : 0,
      days_overdue: daysOverdue, condition_on_return: data.condition_on_return,
      custodian_notes: data.custodian_notes, received_by: data.received_by,
      units: reqUnits,
      created_at: new Date().toISOString()
    };
    const rets = this._getLocal('returns') || [];
    rets.push(ret);
    this._setLocal('returns', rets);
    // Update request status
    const updReqs = reqs.map(r => r.id === data.request_id ? { ...r, status: 'Returned' } : r);
    this._setLocal('requests', updReqs);
    // Update equipment
    let items = this._getLocal('equipment') || [];
    let updatedStatus = 'Available';
    items = items.map(e => {
      if (e.id === req.equipment_id) {
        const totalUnits = e.total_units || 1;
        const curr = e.available_units != null ? e.available_units : 0;
        const nextAvail = Math.min(totalUnits, curr + reqUnits);
        updatedStatus = data.condition_on_return === 'Needs Repair' ? 'Under Maintenance' : (nextAvail > 0 ? 'Available' : 'Borrowed');
        return {
          ...e,
          available_units: nextAvail,
          status: updatedStatus,
          condition: data.condition_on_return
        };
      }
      return e;
    });
    this._setLocal('equipment', items);
    return { return_id: retId, new_equipment_status: updatedStatus };
  },

  // ─── Dashboard ───
  async getDashboard(borrowerParams) {
    if (this.isApiMode) {
      let url = `${this.apiBase}/dashboard.php`;
      if (borrowerParams) {
        const p = new URLSearchParams();
        if (borrowerParams.borrower_email) p.set('borrower_email', borrowerParams.borrower_email);
        if (borrowerParams.borrower_id) p.set('borrower_id', borrowerParams.borrower_id);
        url += `?${p.toString()}`;
      }
      const res = await fetch(url);
      return await res.json();
    }
    const eq = this._getLocal('equipment') || [];
    const reqs = this._getLocal('requests') || [];
    const now = new Date();
    const activeReqs = reqs.filter(r => r.status === 'Active').map(r => {
      const due = new Date(r.expected_return_date);
      const isOverdue = now > due;
      const overdueDays = isOverdue ? Math.ceil((now - due) / 86400000) : 0;
      return { ...r, is_overdue: isOverdue, overdue_days: overdueDays };
    });
    const cats = {};
    eq.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; });

    let borrowerData = null;
    if (borrowerParams) {
      const be = (borrowerParams.borrower_email || '').toLowerCase();
      const bid = (borrowerParams.borrower_id || '').toLowerCase();
      const bActive = activeReqs.filter(r => (be && (r.borrower_email||'').toLowerCase() === be) || (bid && (r.borrower_id_number||'').toLowerCase() === bid));
      const bPending = reqs.filter(r => r.status === 'Pending' && ((be && (r.borrower_email||'').toLowerCase() === be) || (bid && (r.borrower_id_number||'').toLowerCase() === bid))).length;
      const bCompleted = reqs.filter(r => r.status === 'Returned' && ((be && (r.borrower_email||'').toLowerCase() === be) || (bid && (r.borrower_id_number||'').toLowerCase() === bid))).length;
      const bRecent = reqs.filter(r => ((be && (r.borrower_email||'').toLowerCase() === be) || (bid && (r.borrower_id_number||'').toLowerCase() === bid)))
                          .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

      borrowerData = {
        active_count: bActive.length,
        pending_count: bPending,
        overdue_count: bActive.filter(r => r.is_overdue).length,
        completed_count: bCompleted,
        active_loans: bActive,
        recent_requests: bRecent
      };
    }

    return {
      metrics: {
        total_equipment: eq.length,
        available_equipment: eq.filter(e => e.status === 'Available').length,
        borrowed_equipment: eq.filter(e => e.status === 'Borrowed').length,
        active_loans: activeReqs.length,
        maintenance_equipment: eq.filter(e => e.status === 'Under Maintenance').length,
        overdue_count: activeReqs.filter(r => r.is_overdue).length,
        pending_requests: reqs.filter(r => r.status === 'Pending').length,
        availability_rate: eq.length > 0 ? Math.round((eq.filter(e => e.status === 'Available').length / eq.length) * 100) : 0
      },
      active_requests: activeReqs,
      categories_breakdown: Object.entries(cats).map(([category, count]) => ({ category, count })),
      recent_activities: [],
      borrower: borrowerData
    };
  },

  // ─── Users ───
  async getUsers() {
    if (this.isApiMode) {
      const res = await fetch(`${this.apiBase}/auth.php`);
      const json = await res.json();
      return json.data || [];
    }
    return [];
  },

  // ─── Local helpers ───
  _getLocal(key) {
    try { return JSON.parse(localStorage.getItem('ev_' + key)); } catch { return null; }
  },
  _setLocal(key, val) {
    localStorage.setItem('ev_' + key, JSON.stringify(val));
  },
  _seedLocalIfNeeded() {
    let eq = this._getLocal('equipment');
    if (!eq || !Array.isArray(eq) || eq.length === 0) {
      if (typeof SAMPLE_DATA !== 'undefined') {
        this._setLocal('equipment', SAMPLE_DATA.equipment);
        this._setLocal('requests', SAMPLE_DATA.requests);
        this._setLocal('returns', SAMPLE_DATA.returns);
      }
    } else {
      let updated = false;
      const migrated = eq.map(i => {
        if (i.total_units == null || i.available_units == null) {
          updated = true;
          const tot = Math.max(1, parseInt(i.total_units || i.units || 1, 10));
          const av = i.available_units != null ? parseInt(i.available_units, 10) : (i.status === 'Available' ? tot : 0);
          return { ...i, total_units: tot, available_units: av, status: (av <= 0 && i.status !== 'Under Maintenance') ? 'Borrowed' : i.status };
        }
        return i;
      });
      if (updated) this._setLocal('equipment', migrated);
    }
  }
};
