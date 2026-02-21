(function () {
  const tokenKey = 'admin_token';
  const page = document.body.dataset.adminPage;
  const isLocalHost = /(^localhost$)|(^127\.0\.0\.1$)|(^\[::1\]$)|(^::1$)/.test(window.location.hostname);
  const token = sessionStorage.getItem(tokenKey) || '';

  const api = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (isLocalHost && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    if (response.status === 401) {
      if (isLocalHost) {
        sessionStorage.removeItem(tokenKey);
        window.location.href = '/admin/login/';
      }
      throw new Error('Unauthorized');
    }

    if (response.status === 403) {
      throw new Error('Forbidden');
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
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

  const nav = document.querySelector('[data-admin-nav]');
  if (nav) {
    nav.querySelectorAll('a').forEach((link) => {
      if (link.getAttribute('href') === window.location.pathname) {
        link.classList.add('active');
      }
    });

    const logout = nav.querySelector('[data-admin-logout]');
    if (logout && !isLocalHost) {
      logout.style.display = 'none';
    }
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
        await api('/api/admin/dashboard');
        window.location.href = '/admin/';
      } catch {
        const error = document.querySelector('[data-login-error]');
        if (error) error.textContent = 'Invalid token';
      }
    });
    return;
  }

  if (!requireAuth()) return;

  const logout = document.querySelector('[data-admin-logout]');
  logout?.addEventListener('click', () => {
    sessionStorage.removeItem(tokenKey);
    window.location.href = '/admin/login/';
  });

  const renderRows = (container, items, fields) => {
    container.innerHTML = items.map((item) => `<tr>${fields.map((f) => `<td>${item[f] ?? ''}</td>`).join('')}</tr>`).join('');
  };

  const wireCrud = async ({ listPath, tableFields, tableBodySelector, formSelector, idField = 'id' }) => {
    const tableBody = document.querySelector(tableBodySelector);
    const form = document.querySelector(formSelector);

    const load = async () => {
      const payload = await api(listPath);
      const data = Array.isArray(payload.data) ? payload.data : [];
      if (tableBody) {
        tableBody.innerHTML = data
          .map((item) => `<tr data-row-id="${item[idField]}">${tableFields.map((f) => `<td>${item[f] ?? ''}</td>`).join('')}<td><button type="button" data-edit='${JSON.stringify(item).replace(/'/g, '&apos;')}'>Edit</button></td></tr>`)
          .join('');
      }

      tableBody?.querySelectorAll('[data-edit]').forEach((btn) => {
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
      const formData = new FormData(form);
      const id = String(formData.get(idField) || '').trim();
      const payload = Object.fromEntries(formData.entries());
      ['collections', 'actions', 'results', 'next_steps', 'data'].forEach((key) => {
        if (typeof payload[key] === 'string' && payload[key]) {
          try {
            payload[key] = JSON.parse(payload[key]);
          } catch {
            payload[key] = [];
          }
        }
      });

      if (id) {
        await api(`${listPath}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api(listPath, { method: 'POST', body: JSON.stringify(payload) });
      }
      form.reset();
      await load();
    });

    await load();
  };

  if (page === 'dashboard') {
    api('/api/admin/dashboard').then((payload) => {
      const root = document.querySelector('[data-dashboard-counts]');
      if (!root) return;
      root.innerHTML = Object.entries(payload.counts || {})
        .map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`)
        .join('');
    });
  }

  if (page === 'projects') {
    wireCrud({ listPath: '/api/admin/projects', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  }
  if (page === 'services') {
    wireCrud({ listPath: '/api/admin/services', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  }
  if (page === 'certifications') {
    wireCrud({ listPath: '/api/admin/certifications', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  }
  if (page === 'labs') {
    wireCrud({ listPath: '/api/admin/labs', tableFields: ['id', 'title', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  }
  if (page === 'site') {
    wireCrud({ listPath: '/api/admin/site-blocks', tableFields: ['id', 'page', 'block_key', 'status', 'updated_at'], tableBodySelector: '#admin-table-body', formSelector: '#admin-form' });
  }
  if (page === 'inquiries') {
    api('/api/admin/inquiries').then((payload) => {
      renderRows(document.querySelector('#admin-table-body'), payload.data || [], ['id', 'inquiry_type', 'email', 'status', 'created_at']);
    });
  }

  if (page === 'media') {
    const tableBody = document.querySelector('#admin-media-table-body');
    const uploadForm = document.querySelector('#admin-media-upload-form');
    const searchForm = document.querySelector('#admin-media-search-form');
    const uploadStatus = document.querySelector('#admin-media-upload-status');

    const loadMedia = async (q = '') => {
      const path = q ? `/api/admin/media?q=${encodeURIComponent(q)}` : '/api/admin/media';
      const payload = await api(path, { headers: {} });
      const data = payload.data || [];
      tableBody.innerHTML = data.map((item) => `<tr><td>${item.id ?? ''}</td><td><code>${item.key ?? ''}</code></td><td><input data-url readonly value="${item.public_url ?? ''}"></td><td>${item.mime_type ?? ''}</td><td>${item.visibility ?? ''}</td><td><input data-alt-id="${item.id}" value="${item.alt_text ?? ''}"></td><td><button data-copy-url="${item.public_url ?? ''}">Copy URL</button><button data-copy-key="${item.key ?? ''}">Copy Key</button><button data-save-id="${item.id}">Save</button></td></tr>`).join('');

      tableBody.querySelectorAll('[data-copy-url]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-url') || '')));
      tableBody.querySelectorAll('[data-copy-key]').forEach((btn) => btn.addEventListener('click', async () => navigator.clipboard.writeText(btn.getAttribute('data-copy-key') || '')));
      tableBody.querySelectorAll('[data-save-id]').forEach((btn) => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-id');
        const alt = tableBody.querySelector(`[data-alt-id="${id}"]`)?.value || '';
        await api(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ alt_text: alt }) });
      }));
    };

    uploadForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(uploadForm);
      const headers = {};
      if (isLocalHost && token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch('/api/admin/media', { method: 'POST', body: formData, headers });
      if (!response.ok) {
        uploadStatus.textContent = `Upload failed (${response.status})`;
        return;
      }
      uploadStatus.textContent = 'Uploaded';
      uploadForm.reset();
      await loadMedia();
    });

    searchForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const q = new FormData(searchForm).get('q')?.toString() || '';
      await loadMedia(q);
    });

    loadMedia();
  }

  if (page === 'projects') {
    const attachForm = document.querySelector('#project-media-form');
    const mediaTbody = document.querySelector('#project-media-table-body');

    const loadProjectMedia = async (projectId) => {
      if (!projectId) return;
      const payload = await api(`/api/admin/projects/${encodeURIComponent(projectId)}/media`);
      const items = payload.data || [];
      mediaTbody.innerHTML = items.map((item) => `<tr><td>${item.project_id}</td><td>${item.media_asset_id}</td><td>${item.key ?? ''}</td><td>${item.sort_order ?? 0}</td><td><button data-detach-project='${item.project_id}' data-detach-media='${item.media_asset_id}'>Detach</button></td></tr>`).join('');
      mediaTbody.querySelectorAll('[data-detach-project]').forEach((btn) => btn.addEventListener('click', async () => {
        await api(`/api/admin/projects/${encodeURIComponent(btn.getAttribute('data-detach-project'))}/media/${encodeURIComponent(btn.getAttribute('data-detach-media'))}`, { method: 'DELETE' });
        await loadProjectMedia(btn.getAttribute('data-detach-project'));
      }));
    };

    attachForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(attachForm).entries());
      await api(`/api/admin/projects/${encodeURIComponent(String(data.project_id || ''))}/media`, { method: 'POST', body: JSON.stringify(data) });
      await loadProjectMedia(String(data.project_id || ''));
    });

    const projectIdInput = attachForm?.querySelector('[name="project_id"]');
    projectIdInput?.addEventListener('change', () => loadProjectMedia(projectIdInput.value));
  }

  if (page === 'audit') {
    api('/api/admin/audit').then((payload) => {
      renderRows(document.querySelector('#admin-table-body'), payload.data || [], ['id', 'action', 'entity_type', 'entity_id', 'created_at']);
    });
  }
})();
