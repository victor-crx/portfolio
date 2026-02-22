(function () {
  const tokenKey = 'admin_token';
  const meCacheKey = 'admin_me';
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
    let payload = null;
    try {
      payload = await response.json();
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

    await load();
  };

  if (page === 'dashboard') {
    fetchJSON('/api/admin/dashboard').then((payload) => {
      const root = document.querySelector('[data-dashboard-counts]');
      if (!root) return;
      root.innerHTML = Object.entries(payload.counts || {}).map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</li>`).join('');
    });
  }

  if (page === 'projects') wireCrud({ listPath: '/api/admin/projects', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'services') wireCrud({ listPath: '/api/admin/services', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'certifications') wireCrud({ listPath: '/api/admin/certifications', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'labs') wireCrud({ listPath: '/api/admin/labs', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  if (page === 'site') wireCrud({ listPath: '/api/admin/site-blocks', tableFields: ['id', 'page', 'block_key', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });

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
      detail.querySelector('[data-assign-email]').value = row.assigned_to_email || '';
      detail.querySelectorAll('[data-next-status]').forEach((btn) => { btn.dataset.inquiryId = String(id); });
      detail.querySelector('[data-save-assign]').dataset.inquiryId = String(id);
      detail.querySelector('[data-save-note]').dataset.inquiryId = String(id);
      await loadNotes(id);
      detail.classList.add('open');
      detail.querySelector('[data-close-detail]')?.focus();
    };

    const load = async () => {
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
      renderTableState(tableBody, 'loading', 7);
      const path = q ? `/api/admin/media?q=${encodeURIComponent(q)}` : '/api/admin/media';
      const payload = await fetchJSON(path, { headers: {} });
      const data = payload.data || [];
      if (!data.length) {
        renderTableState(tableBody, 'empty', 7);
        return;
      }
      tableBody.innerHTML = data.map((item) => {
        const url = buildPublicUrl(item);
        return `<tr><td>${item.id ?? ''}</td><td><code>${item.key ?? ''}</code></td><td><input class='admin-media-url-input' data-url readonly value="${url}" title="${url}"></td><td>${item.mime_type ?? ''}</td><td>${item.visibility ?? ''}</td><td><input data-alt-id="${item.id}" value="${item.alt_text ?? ''}"></td><td><button data-copy-url="${url}">Copy URL</button><button data-copy-key="${item.key ?? ''}">Copy Key</button><button data-save-id="${item.id}">Save</button></td></tr>`;
      }).join('');
      tableBody.querySelectorAll('[data-copy-url]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-url') || '')));
      tableBody.querySelectorAll('[data-copy-key]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-key') || '')));
      tableBody.querySelectorAll('[data-save-id]').forEach((btn) => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-id');
        const alt = tableBody.querySelector(`[data-alt-id="${id}"]`)?.value || '';
        await fetchJSON(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ alt_text: alt }) });
        toast('Media updated', 'success');
      }));
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

    loadMedia();
  }

  if (page === 'audit') {
    const tbody = document.querySelector('#admin-table-body');
    renderTableState(tbody, 'loading', 5);
    fetchJSON('/api/admin/audit').then((payload) => {
      const rows = payload.data || [];
      if (!rows.length) return renderTableState(tbody, 'empty', 5);
      tbody.innerHTML = rows.map((item) => `<tr><td>${item.id}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity_type)}</td><td>${escapeHtml(item.entity_id)}</td><td>${escapeHtml(item.created_at)}</td></tr>`).join('');
    });
  }
})();
