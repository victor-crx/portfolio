(function () {
  const tokenKey = 'admin_token';
  const meCacheKey = 'admin_me';
  const sessionExpiredMessage = 'Session expired. Open /api/admin/me in a new tab to re-auth, then refresh.';
  const page = document.body.dataset.adminPage;
  const isLocalHost = /(^localhost$)|(^127\.0\.0\.1$)|(^\[::1\]$)|(^::1$)/.test(window.location.hostname);
  const token = sessionStorage.getItem(tokenKey) || '';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));

  const toast = (message, type = 'info') => {
    const root = document.querySelector('[data-admin-toasts]') || (() => {
      const node = document.createElement('div');
      node.className = 'admin-toasts';
      node.setAttribute('data-admin-toasts', 'true');
      document.body.appendChild(node);
      return node;
    })();
    const item = document.createElement('div');
    item.className = `admin-toast admin-toast-${type}`;
    item.textContent = message;
    root.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  };

  const confirmModal = (title, body, confirmText = 'Confirm') => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <h3 id="admin-modal-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <div class="admin-modal-actions">
          <button type="button" data-modal-cancel>Cancel</button>
          <button type="button" data-modal-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const active = document.activeElement;
    document.body.appendChild(overlay);
    const cancelBtn = overlay.querySelector('[data-modal-cancel]');
    const confirmBtn = overlay.querySelector('[data-modal-confirm]');
    const focusables = () => overlay.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])');
    const cleanup = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      if (active && active.focus) active.focus();
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') cleanup(false);
      if (event.key === 'Tab') {
        const f = Array.from(focusables());
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    cancelBtn?.addEventListener('click', () => cleanup(false));
    confirmBtn?.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cleanup(false);
    });
    confirmBtn?.focus();
  });


  const confirmTypeModal = ({ title, lines = [], token = 'DELETE', confirmText = 'Delete' }) => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-type-modal-title">
        <h3 id="admin-type-modal-title">${escapeHtml(title)}</h3>
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
        <label>Type <code>${escapeHtml(token)}</code> to confirm</label>
        <input type="text" data-modal-typed-input autocomplete="off" spellcheck="false" />
        <div class="admin-modal-actions">
          <button type="button" data-modal-cancel>Cancel</button>
          <button type="button" data-modal-confirm disabled>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const active = document.activeElement;
    document.body.appendChild(overlay);
    const cancelBtn = overlay.querySelector('[data-modal-cancel]');
    const confirmBtn = overlay.querySelector('[data-modal-confirm]');
    const typedInput = overlay.querySelector('[data-modal-typed-input]');
    const focusables = () => overlay.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])');
    const cleanup = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      if (active && active.focus) active.focus();
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') cleanup(false);
      if (event.key === 'Tab') {
        const f = Array.from(focusables());
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const sync = () => {
      if (!confirmBtn || !typedInput) return;
      confirmBtn.disabled = typedInput.value !== token;
    };
    document.addEventListener('keydown', onKeyDown);
    cancelBtn?.addEventListener('click', () => cleanup(false));
    confirmBtn?.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      cleanup(true);
    });
    typedInput?.addEventListener('input', sync);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cleanup(false);
    });
    sync();
    typedInput?.focus();
  });

  const setLoading = (el, isLoading) => {
    if (!el) return;
    if (isLoading) {
      el.dataset.prevDisabled = el.disabled ? '1' : '0';
      el.disabled = true;
      if (el.tagName === 'BUTTON') {
        el.dataset.prevText = el.textContent || '';
        el.textContent = 'Loading...';
      }
    } else {
      el.disabled = el.dataset.prevDisabled === '1';
      if (el.tagName === 'BUTTON' && el.dataset.prevText) {
        el.textContent = el.dataset.prevText;
      }
    }
  };

  const fetchJSON = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (isLocalHost && token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    const isLikelyHtml = contentType.includes('text/html') || /^\s*</.test(raw || '');

    if (isLikelyHtml) {
      toast(sessionExpiredMessage, 'error');
      throw new Error(sessionExpiredMessage);
    }

    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      if (isLocalHost) {
        sessionStorage.removeItem(tokenKey);
        window.location.href = '/admin/login/';
      }
      throw new Error(payload?.error || 'Unauthorized');
    }
    if (response.status === 403) throw new Error(payload?.error || 'Forbidden');
    if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
    return payload;
  };

  const requireAuth = () => {
    if (isLocalHost && !token && page !== 'login') {
      window.location.href = '/admin/login/';
      return false;
    }
    if (!isLocalHost && page === 'login') {
      window.location.href = '/admin/';
      return false;
    }
    return true;
  };

  const renderTableState = (tbody, state, colSpan, message = '') => {
    if (!tbody) return;
    if (state === 'loading') {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="admin-state">Loading…</td></tr>`;
      return;
    }
    if (state === 'empty') {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="admin-state">${escapeHtml(message || 'No records found.')}</td></tr>`;
      return;
    }
    if (state === 'error') {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="admin-state">${escapeHtml(message || 'Failed to load data. Please retry.')}</td></tr>`;
    }
  };

  const renderPagination = (container, { total = 0, page = 1, pageSize = 25, onChange }) => {
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const disabledPrev = page <= 1 ? 'disabled' : '';
    const disabledNext = page >= totalPages ? 'disabled' : '';
    container.innerHTML = `
      <button type="button" data-page-prev ${disabledPrev}>Prev</button>
      <span>Page ${page} of ${totalPages} (${total} total)</span>
      <button type="button" data-page-next ${disabledNext}>Next</button>`;
    container.querySelector('[data-page-prev]')?.addEventListener('click', () => onChange(page - 1));
    container.querySelector('[data-page-next]')?.addEventListener('click', () => onChange(page + 1));
  };

  const nav = document.querySelector('[data-admin-nav]');
  if (nav) {
    nav.querySelectorAll('a').forEach((link) => {
      if (link.getAttribute('href') === window.location.pathname) link.classList.add('active');
    });
    const logoutButton = nav.querySelector('[data-admin-logout]');
    if (logoutButton && !isLocalHost) logoutButton.style.display = 'none';
    const reauthLink = document.createElement('a');
    reauthLink.href = '/api/admin/me';
    reauthLink.target = '_blank';
    reauthLink.rel = 'noopener noreferrer';
    reauthLink.textContent = 'Re-auth';
    logoutButton?.insertAdjacentElement('beforebegin', reauthLink);
  }

  if (page === 'login') {
    if (!isLocalHost) {
      window.location.href = '/admin/';
      return;
    }
    const form = document.querySelector('#admin-login-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const field = document.querySelector('#admin-token');
      const value = field?.value?.trim();
      if (!value) return;
      sessionStorage.setItem(tokenKey, value);
      try {
        await fetchJSON('/api/admin/dashboard');
        window.location.href = '/admin/';
      } catch {
        const error = document.querySelector('[data-login-error]');
        if (error) error.textContent = 'Invalid token';
      }
    });
    return;
  }

  if (!requireAuth()) return;

  const setCurrentUserBadge = async () => {
    if (!nav) return;
    let me = null;
    const cached = sessionStorage.getItem(meCacheKey);
    if (cached) {
      try { me = JSON.parse(cached); } catch { me = null; }
    }
    if (!me) {
      me = await fetchJSON('/api/admin/me');
      sessionStorage.setItem(meCacheKey, JSON.stringify(me));
    }
    const badge = document.createElement('p');
    badge.className = 'admin-user-badge';
    badge.textContent = `${me.email} (${me.role})`;
    nav.insertBefore(badge, nav.querySelector('[data-admin-logout]'));
  };

  setCurrentUserBadge().catch(() => {});

  document.querySelector('[data-admin-logout]')?.addEventListener('click', () => {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(meCacheKey);
    window.location.href = '/admin/login/';
  });

  const wireCrud = async ({ listPath, tableFields, tableBodySelector, formSelector, idField = 'id' }) => {
    const tableBody = document.querySelector(tableBodySelector);
    const form = document.querySelector(formSelector);

    const load = async () => {
      try {
        renderTableState(tableBody, 'loading', tableFields.length + 1);
        const payload = await fetchJSON(listPath);
        const data = Array.isArray(payload.data) ? payload.data : [];
        if (!data.length) {
          renderTableState(tableBody, 'empty', tableFields.length + 1);
          return;
        }
        tableBody.innerHTML = data.map((item) => `<tr data-row-id="${item[idField]}">${tableFields.map((f) => `<td>${escapeHtml(item[f] ?? '')}</td>`).join('')}<td><button type="button" data-edit='${JSON.stringify(item).replace(/'/g, '&apos;')}'>Edit</button></td></tr>`).join('');
        tableBody.querySelectorAll('[data-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const raw = btn.getAttribute('data-edit');
            if (!raw || !form) return;
            const item = JSON.parse(raw.replace(/&apos;/g, "'"));
            Object.entries(item).forEach(([key, value]) => {
              const input = form.querySelector(`[name="${key}"]`);
              if (!input) return;
              input.value = typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
            });
          });
        });
      } catch (error) {
        renderTableState(tableBody, 'error', tableFields.length + 1, error.message || 'Failed to load records.');
        throw error;
      }
    };

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]') || form.querySelector('button');
      setLoading(submitButton, true);
      try {
        const formData = new FormData(form);
        const id = String(formData.get(idField) || '').trim();
        const payload = Object.fromEntries(formData.entries());
        ['collections', 'actions', 'results', 'next_steps', 'data'].forEach((key) => {
          if (typeof payload[key] === 'string' && payload[key]) {
            try { payload[key] = JSON.parse(payload[key]); } catch { payload[key] = []; }
          }
        });
        if (id) await fetchJSON(`${listPath}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await fetchJSON(listPath, { method: 'POST', body: JSON.stringify(payload) });
        toast('Saved', 'success');
        form.reset();
        await load();
      } catch (error) {
        toast(error.message || 'Save failed', 'error');
      } finally {
        setLoading(submitButton, false);
      }
    });

    await load().catch((error) => toast(error.message || 'Failed to load records', 'error'));
  };

  const wireSiteBlocks = async () => {
    const listPath = '/api/admin/site-blocks';
    const tableFields = ['id', 'page', 'block_key', 'status', 'updated_at'];
    const tableBody = document.querySelector('#admin-table-body');
    const form = document.querySelector('#admin-form');
    const pageSelect = form?.querySelector('[data-site-page]');
    const blockSelect = form?.querySelector('[data-site-block-key]');
    const jsonInput = form?.querySelector('[data-site-json]');
    const jsonError = form?.querySelector('[data-site-json-error]');
    const viewLink = form?.querySelector('[data-site-view-link]');
    const blockOptions = {
      home: ['hero', 'press'],
      global: ['footer'],
      contact: ['intro']
    };

    const syncBlockOptions = () => {
      if (!pageSelect || !blockSelect) return;
      const pageValue = pageSelect.value || 'home';
      const allowed = blockOptions[pageValue] || [];
      const current = blockSelect.value;
      blockSelect.innerHTML = allowed.map((value) => `<option value="${value}">${value}</option>`).join('');
      blockSelect.value = allowed.includes(current) ? current : (allowed[0] || '');
      if (viewLink) viewLink.href = pageValue === 'contact' ? '/contact/' : '/';
    };

    const validateJson = () => {
      if (!jsonInput || !jsonError) return null;
      try {
        const parsed = JSON.parse(jsonInput.value || '{}');
        jsonError.hidden = true;
        jsonError.textContent = '';
        jsonInput.value = JSON.stringify(parsed, null, 2);
        return parsed;
      } catch (error) {
        jsonError.hidden = false;
        jsonError.textContent = `Invalid JSON: ${error.message || 'syntax error'}`;
        return null;
      }
    };

    const load = async () => {
      try {
        renderTableState(tableBody, 'loading', tableFields.length + 1);
        const payload = await fetchJSON(listPath);
        const data = Array.isArray(payload.data) ? payload.data : [];
        if (!data.length) return renderTableState(tableBody, 'empty', tableFields.length + 1);
        tableBody.innerHTML = data.map((item) => `<tr>${tableFields.map((f) => `<td>${escapeHtml(item[f] ?? '')}</td>`).join('')}<td><button type="button" data-edit='${JSON.stringify(item).replace(/'/g, '&apos;')}'>Edit</button></td></tr>`).join('');
        tableBody.querySelectorAll('[data-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const raw = btn.getAttribute('data-edit');
            if (!raw || !form) return;
            const item = JSON.parse(raw.replace(/&apos;/g, "'"));
            form.querySelector('[name="id"]').value = String(item.id || '');
            form.querySelector('[name="page"]').value = String(item.page || 'home');
            syncBlockOptions();
            form.querySelector('[name="block_key"]').value = String(item.block_key || '');
            form.querySelector('[name="title"]').value = String(item.title || '');
            form.querySelector('[name="body"]').value = String(item.body || '');
            form.querySelector('[name="status"]').value = String(item.status || 'draft');
            form.querySelector('[name="featured_order"]').value = item.featured_order == null ? '' : String(item.featured_order);
            const parsed = (() => { try { return JSON.parse(item.data_json || '{}'); } catch { return {}; } })();
            jsonInput.value = JSON.stringify(parsed, null, 2);
            validateJson();
          });
        });
      } catch (error) {
        renderTableState(tableBody, 'error', tableFields.length + 1, error.message || 'Failed to load site blocks.');
        throw error;
      }
    };

    pageSelect?.addEventListener('change', syncBlockOptions);
    jsonInput?.addEventListener('blur', validateJson);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]') || form.querySelector('button');
      const parsed = validateJson();
      if (parsed === null) return;
      setLoading(submitButton, true);
      try {
        const formData = new FormData(form);
        const id = String(formData.get('id') || '').trim();
        const payload = {
          page: String(formData.get('page') || 'home'),
          block_key: String(formData.get('block_key') || ''),
          title: String(formData.get('title') || ''),
          body: String(formData.get('body') || ''),
          status: String(formData.get('status') || 'draft'),
          featured_order: String(formData.get('featured_order') || ''),
          data: parsed
        };
        if (id) await fetchJSON(`${listPath}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await fetchJSON(listPath, { method: 'POST', body: JSON.stringify(payload) });
        toast('Saved', 'success');
        form.reset();
        syncBlockOptions();
        jsonInput.value = '{}';
        await load();
      } catch (error) {
        toast(error.message || 'Save failed', 'error');
      } finally {
        setLoading(submitButton, false);
      }
    });

    syncBlockOptions();
    if (jsonInput && !jsonInput.value) jsonInput.value = '{}';
    await load().catch((error) => toast(error.message || 'Failed to load site blocks', 'error'));
  };

  if (page === 'dashboard') {
    fetchJSON('/api/admin/dashboard').then((payload) => {
      const root = document.querySelector('[data-dashboard-counts]');
      if (!root) return;
      root.innerHTML = Object.entries(payload.counts || {}).map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</li>`).join('');
    }).catch((error) => toast(error.message || 'Failed to load dashboard', 'error'));
  }

  if (page === 'projects') wireCrud({ listPath: '/api/admin/projects', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'services') wireCrud({ listPath: '/api/admin/services', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'certifications') wireCrud({ listPath: '/api/admin/certifications', tableFields: ['id', 'title', 'progress_state', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'labs') wireCrud({ listPath: '/api/admin/labs', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'site') wireSiteBlocks();

  if (page === 'inquiries') {
    const tableBody = document.querySelector('#admin-table-body');
    const paginationEl = document.querySelector('[data-pagination]');
    const filtersForm = document.querySelector('#inquiry-filters-form');
    const detail = document.querySelector('#inquiry-detail-modal');
    const state = { page: 1, pageSize: 20, qTimer: null, items: [] };

    const buildQuery = () => {
      const f = new FormData(filtersForm);
      const params = new URLSearchParams();
      ['status', 'type', 'q', 'dateFrom', 'dateTo'].forEach((k) => { const v = String(f.get(k) || '').trim(); if (v) params.set(k, v); });
      params.set('page', String(state.page));
      params.set('pageSize', String(state.pageSize));
      return params.toString();
    };

    const closeDetail = () => detail?.classList.remove('open');
    detail?.querySelector('[data-close-detail]')?.addEventListener('click', closeDetail);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });

    const loadNotes = async (id) => {
      const notesList = detail.querySelector('[data-notes-list]');
      const payload = await fetchJSON(`/api/admin/inquiries/${id}/notes`);
      const notes = payload.data || [];
      if (!notes.length) {
        notesList.innerHTML = '<p class="admin-state">No notes yet.</p>';
        return;
      }
      notesList.innerHTML = notes.map((note) => `<div class="admin-note"><strong>${escapeHtml(note.actor_email)}</strong> <span>${escapeHtml(note.created_at)}</span><p>${escapeHtml(note.note_text)}</p></div>`).join('');
    };

    const openDetail = async (id) => {
      const payload = await fetchJSON(`/api/admin/inquiries/${id}`);
      const row = payload.data;
      detail.querySelector('[data-field="header"]').textContent = `Inquiry #${row.id}`;
      detail.querySelector('[data-field="name"]').textContent = row.name || '-';
      detail.querySelector('[data-field="email"]').textContent = row.email || '-';
      detail.querySelector('[data-field="subject"]').textContent = row.subject || '-';
      detail.querySelector('[data-field="message"]').textContent = row.message || '';
      detail.querySelector('[data-field="created_at"]').textContent = row.created_at || '';
      detail.querySelector('[data-field="metadata_json"]').textContent = row.metadata_json || row.payload_json || '{}';
      const serviceField = detail.querySelector('[data-field="selected_service"]');
      if (serviceField) {
        let serviceText = 'None';
        try {
          const meta = JSON.parse(row.metadata_json || row.payload_json || '{}');
          if (meta.service_id || meta.service_title || meta.service_slug) {
            const bits = [];
            if (meta.service_title) bits.push(String(meta.service_title));
            if (meta.service_slug) bits.push(`slug: ${String(meta.service_slug)}`);
            if (meta.service_id) bits.push(`id: ${String(meta.service_id)}`);
            serviceText = bits.join(' • ');
          }
        } catch {}
        serviceField.textContent = serviceText;
      }
      detail.querySelector('[data-assign-email]').value = row.assigned_to_email || '';
      detail.querySelectorAll('[data-next-status]').forEach((btn) => { btn.dataset.inquiryId = String(id); });
      detail.querySelector('[data-save-assign]').dataset.inquiryId = String(id);
      detail.querySelector('[data-save-note]').dataset.inquiryId = String(id);
      await loadNotes(id);
      detail.classList.add('open');
      detail.querySelector('[data-close-detail]')?.focus();
    };

    const load = async () => {
      try {
        renderTableState(tableBody, 'loading', 8);
        const payload = await fetchJSON(`/api/admin/inquiries?${buildQuery()}`);
        state.items = payload.data || [];
        if (!state.items.length) {
          renderTableState(tableBody, 'empty', 8, 'No inquiries match these filters.');
        } else {
          tableBody.innerHTML = state.items.map((item) => `<tr data-view-id="${item.id}"><td>${item.id}</td><td>${escapeHtml(item.inquiry_type)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.subject)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.created_at)}</td><td>${escapeHtml(item.assigned_to_email || '-')}</td><td><button data-open-id="${item.id}">View</button></td></tr>`).join('');
          tableBody.querySelectorAll('[data-open-id]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.openId)));
        }
        renderPagination(paginationEl, { ...payload.pagination, onChange: async (nextPage) => { state.page = nextPage; await load(); } });
      } catch (error) {
        renderTableState(tableBody, 'error', 8, error.message || 'Failed to load inquiries.');
        throw error;
      }
    };

    filtersForm?.addEventListener('submit', async (event) => { event.preventDefault(); state.page = 1; await load(); });
    filtersForm?.querySelector('[name="q"]')?.addEventListener('input', () => {
      clearTimeout(state.qTimer);
      state.qTimer = setTimeout(async () => { state.page = 1; await load(); }, 250);
    });

    detail?.querySelectorAll('[data-next-status]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.inquiryId;
      const status = btn.dataset.nextStatus;
      if (!id || !status) return;
      try {
        await fetchJSON(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        toast('Status updated', 'success');
        closeDetail();
        await load();
      } catch (error) { toast(error.message || 'Failed to update status', 'error'); }
    }));

    detail?.querySelector('[data-save-assign]')?.addEventListener('click', async (event) => {
      const id = event.currentTarget.dataset.inquiryId;
      const assigned_to_email = detail.querySelector('[data-assign-email]').value.trim();
      try {
        await fetchJSON(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ assigned_to_email }) });
        toast('Assignment updated', 'success');
        await loadNotes(id);
        await load();
      } catch (error) { toast(error.message || 'Assignment failed', 'error'); }
    });

    detail?.querySelector('[data-save-note]')?.addEventListener('click', async (event) => {
      const id = event.currentTarget.dataset.inquiryId;
      const textarea = detail.querySelector('[data-note-text]');
      const note_text = textarea.value.trim();
      if (!note_text) return;
      try {
        await fetchJSON(`/api/admin/inquiries/${id}/notes`, { method: 'POST', body: JSON.stringify({ note_text }) });
        textarea.value = '';
        toast('Note added', 'success');
        await loadNotes(id);
      } catch (error) { toast(error.message || 'Failed to add note', 'error'); }
    });

    load().catch((error) => toast(error.message || 'Failed to load inquiries', 'error'));
  }

  if (page === 'media') {
    const tableBody = document.querySelector('#admin-media-table-body');
    const uploadForm = document.querySelector('#admin-media-upload-form');
    const searchForm = document.querySelector('#admin-media-search-form');
    const uploadStatus = document.querySelector('#admin-media-upload-status');
    const mediaPublicBase = 'https://media.vrstech.dev/';

    const buildPublicUrl = (item) => String(item?.public_url || '').trim() || `${mediaPublicBase.replace(/\/+$/, '')}/${String(item?.key || '').replace(/^\/+/, '')}`;

    const loadMedia = async (q = '') => {
      try {
        renderTableState(tableBody, 'loading', 8);
        const path = q ? `/api/admin/media?q=${encodeURIComponent(q)}` : '/api/admin/media';
        const payload = await fetchJSON(path, { headers: {} });
        const data = payload.data || [];
        if (!data.length) {
          renderTableState(tableBody, 'empty', 8);
          return;
        }
        tableBody.innerHTML = data.map((item) => {
        const url = buildPublicUrl(item);
        const attachedCount = Number(item.attached_count || 0);
        return `<tr data-media-row-id="${item.id ?? ''}"><td>${item.id ?? ''}</td><td><code>${item.key ?? ''}</code></td><td><input class='admin-media-url-input' data-url readonly value="${url}" title="${url}"></td><td>${item.mime_type ?? ''}</td><td>${item.visibility ?? ''}</td><td>${attachedCount}</td><td><input data-alt-id="${item.id}" value="${item.alt_text ?? ''}"></td><td><button data-copy-url="${url}">Copy URL</button><button data-copy-key="${item.key ?? ''}">Copy Key</button><button data-save-id="${item.id}">Save</button><button data-delete-id="${item.id}" data-delete-key="${item.key ?? ''}" data-delete-url="${url}" data-delete-attached="${attachedCount}" data-delete-visibility="${item.visibility ?? ''}">Delete</button></td></tr>`;
      }).join('');
      tableBody.querySelectorAll('[data-copy-url]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-url') || '')));
      tableBody.querySelectorAll('[data-copy-key]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-key') || '')));
      tableBody.querySelectorAll('[data-save-id]').forEach((btn) => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-id');
        const alt = tableBody.querySelector(`[data-alt-id="${id}"]`)?.value || '';
        await fetchJSON(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ alt_text: alt }) });
        toast('Media updated', 'success');
      }));
        tableBody.querySelectorAll('[data-delete-id]').forEach((btn) => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-id') || '';
        const key = btn.getAttribute('data-delete-key') || '';
        const url = btn.getAttribute('data-delete-url') || '';
        const attachedCount = Number(btn.getAttribute('data-delete-attached') || 0);
        const visibility = btn.getAttribute('data-delete-visibility') || '';
        const lines = [
          `URL: ${url}`,
          `Key: ${key}`,
          `Attached to ${attachedCount} project(s)`
        ];
        if (visibility === 'public') lines.push('WARNING: This media is public and may be live on the site or externally linked.');
        const confirmed = await confirmTypeModal({ title: 'Delete media asset?', lines, token: 'DELETE', confirmText: 'Delete' });
        if (!confirmed) return;
        try {
          await fetchJSON(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
          tableBody.querySelector(`[data-media-row-id="${id}"]`)?.remove();
          if (!tableBody.querySelector('tr')) renderTableState(tableBody, 'empty', 8);
          toast('Deleted', 'success');
        } catch (error) {
          toast(error.message || 'Delete failed. Media was not removed from storage, so no database records were changed.', 'error');
        }
      }));
      } catch (error) {
        renderTableState(tableBody, 'error', 8, error.message || 'Failed to load media.');
        throw error;
      }
    };

    uploadForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(uploadForm);
      try {
        await fetchJSON('/api/admin/media', { method: 'POST', body: formData });
        uploadStatus.textContent = 'Uploaded';
        uploadForm.reset();
        await loadMedia();
      } catch (error) {
        uploadStatus.textContent = error.message || 'Upload failed';
      }
    });

    searchForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const q = new FormData(searchForm).get('q')?.toString() || '';
      await loadMedia(q);
    });

    loadMedia().catch((error) => toast(error.message || 'Failed to load media', 'error'));
  }


  const wireContentStudio = async () => {
    const loading = document.querySelector('[data-content-loading]');
    const roots = Array.from(document.querySelectorAll('[data-content-root]'));
    const heroForm = document.querySelector("[data-content-form='hero']");
    const pressList = document.querySelector('[data-press-list]');
    const pressSave = document.querySelector("[data-content-save='press']");
    const pressAdd = document.querySelector('[data-press-add]');
    const footerForm = document.querySelector("[data-content-form='footer']");
    const footerLinks = document.querySelector('[data-footer-links]');
    const footerAdd = document.querySelector('[data-footer-add-link]');
    const contactForm = document.querySelector("[data-content-form='contact']");
    const contactServices = document.querySelector('[data-contact-services-list]');
    const contactAdd = document.querySelector('[data-contact-add-service]');
    const mediaSelect = document.querySelector('[data-content-media-select]');
    const listPath = '/api/admin/site-blocks';
    const state = { hero: null, press: null, footer: null, contact: null };

    const getBlock = (list, pageName, key, fallbackTitle) => list.find((item) => item.page === pageName && item.block_key === key) || {
      page: pageName, block_key: key, title: fallbackTitle, body: '', status: 'published', featured_order: ''
    };

    const parseData = (item, fallback = {}) => {
      try { return JSON.parse(item?.data_json || '{}'); } catch { return fallback; }
    };

    const renderPressRows = (items = []) => {
      if (!pressList) return;
      if (!items.length) {
        pressList.innerHTML = '<p class="admin-state admin-state-left">No testimonials yet.</p>';
        return;
      }
      pressList.innerHTML = items.map((item, idx) => `<div class='admin-row-card' data-press-row='${idx}'>
        <label>Quote<textarea data-press-quote rows='2'>${escapeHtml(item.quote || '')}</textarea></label>
        <label>Author<input data-press-author value='${escapeHtml(item.source || item.author || '')}'></label>
        <label>Optional link<input data-press-link value='${escapeHtml(item.href || item.link || '')}'></label>
        <div class='admin-inline-form'><button type='button' data-press-up='${idx}'>↑</button><button type='button' data-press-down='${idx}'>↓</button><button type='button' data-press-remove='${idx}'>Remove</button></div>
      </div>`).join('');
    };

    const readPressRows = () => Array.from(pressList?.querySelectorAll('[data-press-row]') || []).map((row) => ({
      quote: row.querySelector('[data-press-quote]')?.value?.trim() || '',
      source: row.querySelector('[data-press-author]')?.value?.trim() || '',
      href: row.querySelector('[data-press-link]')?.value?.trim() || ''
    })).filter((item) => item.quote || item.source || item.href);

    const renderLinkRows = (items = []) => {
      if (!footerLinks) return;
      footerLinks.innerHTML = items.map((item, idx) => `<div class='admin-inline-form' data-footer-row='${idx}'><input data-footer-label placeholder='Label' value='${escapeHtml(item.label || '')}'><input data-footer-href placeholder='URL' value='${escapeHtml(item.href || '')}'><button type='button' data-footer-remove='${idx}'>Remove</button></div>`).join('') || '<p class="admin-state admin-state-left">No links yet.</p>';
    };

    const readLinkRows = () => Array.from(footerLinks?.querySelectorAll('[data-footer-row]') || []).map((row) => ({
      label: row.querySelector('[data-footer-label]')?.value?.trim() || '',
      href: row.querySelector('[data-footer-href]')?.value?.trim() || ''
    })).filter((item) => item.label && item.href);

    const renderServicesRows = (items = []) => {
      if (!contactServices) return;
      contactServices.innerHTML = items.map((item, idx) => `<div class='admin-inline-form' data-service-row='${idx}'><input data-service-item value='${escapeHtml(item || '')}'><button type='button' data-service-remove='${idx}'>Remove</button></div>`).join('') || '<p class="admin-state admin-state-left">No services listed.</p>';
    };

    const readServicesRows = () => Array.from(contactServices?.querySelectorAll('[data-service-row]') || []).map((row) => row.querySelector('[data-service-item]')?.value?.trim() || '').filter(Boolean);

    const saveBlock = async (item, data) => {
      const payload = {
        page: item.page,
        block_key: item.block_key,
        title: item.title || '',
        body: item.body || '',
        status: item.status || 'published',
        featured_order: item.featured_order || '',
        data
      };
      if (item.id) return fetchJSON(`${listPath}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      return fetchJSON(listPath, { method: 'POST', body: JSON.stringify(payload) });
    };

    const mediaPayload = await fetchJSON('/api/admin/media', { headers: {} }).catch(() => ({ data: [] }));
    const mediaItems = Array.isArray(mediaPayload.data) ? mediaPayload.data : [];
    if (mediaSelect) {
      mediaSelect.innerHTML = `<option value=''>None</option>${mediaItems.map((item) => `<option value='${item.id}'>${escapeHtml(item.key || item.public_url || `media-${item.id}`)}</option>`).join('')}`;
    }

    const payload = await fetchJSON(listPath);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    state.hero = getBlock(rows, 'home', 'hero', 'Homepage Hero');
    state.press = getBlock(rows, 'home', 'press', 'Home Press & Testimonials');
    state.footer = getBlock(rows, 'global', 'footer', 'Global Footer');
    state.contact = getBlock(rows, 'contact', 'intro', 'Contact Intro');

    const heroData = parseData(state.hero, {});
    heroForm.querySelector("[name='headline']").value = heroData.title || '';
    heroForm.querySelector("[name='subhead']").value = heroData.subtitle || '';
    heroForm.querySelector("[name='backgroundMediaId']").value = heroData.heroMediaId ? String(heroData.heroMediaId) : '';
    const heroPrimary = (heroData.ctaPrimary && typeof heroData.ctaPrimary === 'object') ? heroData.ctaPrimary : {};
    const heroSecondary = (heroData.ctaSecondary && typeof heroData.ctaSecondary === 'object') ? heroData.ctaSecondary : {};
    heroForm.querySelector("[name='primaryText']").value = heroPrimary.text || heroData.primaryCtaText || heroData.ctaText || 'View Work';
    heroForm.querySelector("[name='primaryHref']").value = heroPrimary.href || heroData.primaryCtaHref || heroData.ctaHref || '/work/';
    heroForm.querySelector("[name='secondaryText']").value = heroSecondary.text || heroData.secondaryCtaText || 'Contact Me';
    heroForm.querySelector("[name='secondaryHref']").value = heroSecondary.href || heroData.secondaryCtaHref || '/contact/';
    heroForm.querySelector("[name='alignment']").value = heroData.alignment || 'center';

    renderPressRows(parseData(state.press, { items: [] }).items || []);
    const footerData = parseData(state.footer, {});
    footerForm.querySelector("[name='blurb']").value = footerData.leftText || '';
    renderLinkRows(Array.isArray(footerData.links) ? footerData.links : []);

    const contactData = parseData(state.contact, {});
    contactForm.querySelector("[name='title']").value = contactData.title || '';
    contactForm.querySelector("[name='paragraph']").value = contactData.subtitle || '';
    contactForm.querySelector("[name='showServices']").checked = Boolean(contactData.showServicesPanel);
    contactForm.querySelector("[name='servicesTitle']").value = contactData.servicesTitle || 'Services';
    renderServicesRows(Array.isArray(contactData.services) ? contactData.services : []);

    loading?.setAttribute('hidden', 'hidden');
    roots.forEach((node) => node.removeAttribute('hidden'));

    heroForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = new FormData(heroForm);
      const mediaId = String(f.get('backgroundMediaId') || '');
      const media = mediaItems.find((item) => String(item.id) === mediaId);
      await saveBlock(state.hero, {
        title: String(f.get('headline') || ''),
        subtitle: String(f.get('subhead') || ''),
        ctaPrimary: {
          text: String(f.get('primaryText') || 'View Work'),
          href: String(f.get('primaryHref') || '/work/')
        },
        ctaSecondary: {
          text: String(f.get('secondaryText') || 'Contact Me'),
          href: String(f.get('secondaryHref') || '/contact/')
        },
        alignment: String(f.get('alignment') || 'center'),
        heroMediaId: mediaId || null,
        heroMediaUrl: media?.public_url || null
      });
      toast('Hero saved', 'success');
    });

    pressAdd?.addEventListener('click', () => {
      const items = readPressRows();
      items.push({ quote: '', source: '', href: '' });
      renderPressRows(items);
    });
    pressList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      let items = readPressRows();
      if (target.dataset.pressRemove != null) items.splice(Number(target.dataset.pressRemove), 1);
      if (target.dataset.pressUp != null) {
        const i = Number(target.dataset.pressUp); if (i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      }
      if (target.dataset.pressDown != null) {
        const i = Number(target.dataset.pressDown); if (i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      }
      renderPressRows(items);
    });
    pressSave?.addEventListener('click', async () => {
      await saveBlock(state.press, { items: readPressRows() });
      toast('Testimonials saved', 'success');
    });

    footerAdd?.addEventListener('click', () => {
      const items = readLinkRows(); items.push({ label: '', href: '' }); renderLinkRows(items);
    });
    footerLinks?.addEventListener('click', (event) => {
      const target = event.target; if (!(target instanceof HTMLElement)) return;
      if (target.dataset.footerRemove == null) return;
      const items = readLinkRows(); items.splice(Number(target.dataset.footerRemove), 1); renderLinkRows(items);
    });
    footerForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = new FormData(footerForm);
      await saveBlock(state.footer, { leftText: String(f.get('blurb') || ''), links: readLinkRows(), smallPrint: '© Victor Lane' });
      toast('Footer saved', 'success');
    });

    contactAdd?.addEventListener('click', () => {
      const items = readServicesRows(); items.push(''); renderServicesRows(items);
    });
    contactServices?.addEventListener('click', (event) => {
      const target = event.target; if (!(target instanceof HTMLElement)) return;
      if (target.dataset.serviceRemove == null) return;
      const items = readServicesRows(); items.splice(Number(target.dataset.serviceRemove), 1); renderServicesRows(items);
    });
    contactForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = new FormData(contactForm);
      await saveBlock(state.contact, {
        title: String(f.get('title') || ''),
        subtitle: String(f.get('paragraph') || ''),
        showServicesPanel: f.get('showServices') === 'on',
        servicesTitle: String(f.get('servicesTitle') || 'Services'),
        services: readServicesRows()
      });
      toast('Contact intro saved', 'success');
    });
  };

  if (page === 'content') wireContentStudio().catch((error) => toast(error.message || 'Failed to load content studio', 'error'));

  if (page === 'audit') {
    const tbody = document.querySelector('#admin-table-body');
    renderTableState(tbody, 'loading', 5);
    fetchJSON('/api/admin/audit').then((payload) => {
      const rows = payload.data || [];
      if (!rows.length) return renderTableState(tbody, 'empty', 5);
      tbody.innerHTML = rows.map((item) => `<tr><td>${item.id}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity_type)}</td><td>${escapeHtml(item.entity_id)}</td><td>${escapeHtml(item.created_at)}</td></tr>`).join('');
    }).catch((error) => {
      renderTableState(tbody, 'error', 5, error.message || 'Failed to load audit log.');
      toast(error.message || 'Failed to load audit log', 'error');
    });
  }
})();
