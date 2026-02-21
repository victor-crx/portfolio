(function () {
  const tokenKey = 'admin_token';
  const page = document.body.dataset.adminPage;
  const token = sessionStorage.getItem(tokenKey) || '';

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem(tokenKey) || ''}`,
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      sessionStorage.removeItem(tokenKey);
      window.location.href = '/admin/login/';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  };

  const requireAuth = () => {
    if (!token && page !== 'login') {
      window.location.href = '/admin/login/';
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
  }

  if (page === 'login') {
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
    wireCrud({
      listPath: '/api/admin/projects',
      tableFields: ['id', 'title', 'status', 'updated_at'],
      tableBodySelector: '#admin-table-body',
      formSelector: '#admin-form'
    });
  }

  if (page === 'services') {
    wireCrud({
      listPath: '/api/admin/services',
      tableFields: ['id', 'title', 'status', 'updated_at'],
      tableBodySelector: '#admin-table-body',
      formSelector: '#admin-form'
    });
  }

  if (page === 'certifications') {
    wireCrud({
      listPath: '/api/admin/certifications',
      tableFields: ['id', 'title', 'status', 'updated_at'],
      tableBodySelector: '#admin-table-body',
      formSelector: '#admin-form'
    });
  }

  if (page === 'labs') {
    wireCrud({
      listPath: '/api/admin/labs',
      tableFields: ['id', 'title', 'status', 'updated_at'],
      tableBodySelector: '#admin-table-body',
      formSelector: '#admin-form'
    });
  }

  if (page === 'site') {
    wireCrud({
      listPath: '/api/admin/site-blocks',
      tableFields: ['id', 'page', 'block_key', 'status', 'updated_at'],
      tableBodySelector: '#admin-table-body',
      formSelector: '#admin-form'
    });
  }

  if (page === 'inquiries') {
    api('/api/admin/inquiries').then((payload) => {
      renderRows(document.querySelector('#admin-table-body'), payload.data || [], ['id', 'inquiry_type', 'email', 'status', 'created_at']);
    });
  }

  if (page === 'audit') {
    api('/api/admin/audit').then((payload) => {
      renderRows(document.querySelector('#admin-table-body'), payload.data || [], ['id', 'action', 'entity_type', 'entity_id', 'created_at']);
    });
  }
})();
