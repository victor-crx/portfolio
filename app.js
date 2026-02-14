(function () {
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const normalized = href.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    const normalizedPath = path.replace(/\/$/, '') || '/';
    if (normalizedPath === normalized) link.classList.add('active');
  });

  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

  const grid = document.querySelector('[data-project-grid]');
  if (!grid) return;

  const bodyDefault = document.body.dataset.defaultCollection || 'all';
  const state = {
    collection: bodyDefault,
    type: 'all',
    search: ''
  };

  const collectionSelect = document.querySelector('[data-filter-collection]');
  const typeSelect = document.querySelector('[data-filter-type]');
  const searchInput = document.querySelector('[data-filter-search]');
  const countNode = document.querySelector('[data-results-count]');
  const modal = document.querySelector('[data-modal]');
  const modalTitle = document.querySelector('[data-modal-title]');
  const modalMeta = document.querySelector('[data-modal-meta]');
  const modalBody = document.querySelector('[data-modal-body]');
  const modalClose = document.querySelector('[data-modal-close]');

  let projects = [];
  let filtered = [];
  let lastFocused;

  const jsonPath = '/projects.json';

  fetch(jsonPath)
    .then((r) => r.json())
    .then((data) => {
      projects = data.projects || [];
      if (collectionSelect) collectionSelect.value = bodyDefault;
      runFilters();
    })
    .catch(() => {
      grid.innerHTML = '<p>Unable to load projects.json in this browser context.</p>';
    });

  function runFilters() {
    filtered = projects.filter((item) => {
      const collectionMatch = state.collection === 'all' || (item.collections || []).includes(state.collection);
      const typeMatch = state.type === 'all' || item.type === state.type;
      const haystack = [item.title, item.summary, ...(item.tags || []), ...(item.tools || [])].join(' ').toLowerCase();
      const searchMatch = !state.search || haystack.includes(state.search);
      return collectionMatch && typeMatch && searchMatch;
    }).sort((a, b) => b.date.localeCompare(a.date));

    renderCards(filtered);
    if (countNode) countNode.textContent = `${filtered.length} projects`;
  }

  function renderCards(items) {
    if (!items.length) {
      grid.innerHTML = '<p>No matching projects. Try clearing one or more filters.</p>';
      return;
    }
    grid.innerHTML = items.map((item) => `
      <article class="project-card reveal">
        <button type="button" data-open-id="${item.id}" style="all:unset;cursor:pointer;display:block;width:100%;">
          <img class="project-image" src="${resolveAsset(item)}" alt="${item.title} preview" loading="lazy">
          <div class="caption-bar">
            <div class="caption-meta">${item.type.replace('_', ' • ')} • ${item.date}</div>
            <h3 class="caption-title">${item.title}</h3>
            <p class="caption-summary">${item.summary}</p>
          </div>
        </button>
      </article>
    `).join('');
    document.querySelectorAll('[data-open-id]').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.openId));
    });
    document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));
  }

  function resolveAsset(item) {
    const first = item.artifacts && item.artifacts[0] ? item.artifacts[0].path : '/assets/project-placeholder.svg';
    if (first.startsWith('./assets')) return first.replace('./assets', '/assets');
    if (first.startsWith('../assets')) return first.replace('../assets', '/assets');
    return first;
  }

  function openModal(id) {
    const item = projects.find((p) => p.id === id);
    if (!item || !modal) return;
    lastFocused = document.activeElement;
    modalTitle.textContent = item.title;
    modalMeta.textContent = `${item.type} • ${item.date} • ${item.collections.join(', ')}`;
    modalBody.innerHTML = `
      <p>${item.summary}</p>
      <h3>Problem</h3><p>${item.sections.problem}</p>
      <h3>Constraints</h3><p>${item.sections.constraints}</p>
      <h3>Actions</h3><ul class="list">${item.sections.actions.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Results</h3><ul class="list">${item.sections.results.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Next Steps</h3><ul class="list">${item.sections.next_steps.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Tools</h3><p>${item.tools.join(', ')}</p>
    `;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  function trapFocus(event) {
    if (!modal.classList.contains('open') || event.key !== 'Tab') return;
    const focusables = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (collectionSelect) collectionSelect.addEventListener('change', (e) => { state.collection = e.target.value; runFilters(); });
  if (typeSelect) typeSelect.addEventListener('change', (e) => { state.type = e.target.value; runFilters(); });
  if (searchInput) searchInput.addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); runFilters(); });
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.addEventListener('keydown', trapFocus);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();
