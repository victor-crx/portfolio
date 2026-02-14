(function () {
  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  const firstMain = document.querySelector('main') || document.querySelector('section');
  if (firstMain && !firstMain.id) firstMain.id = 'main-content';
  if (!document.querySelector('.skip-link') && firstMain) {
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#main-content';
    skip.textContent = 'Skip to content';
    document.body.insertBefore(skip, document.body.firstChild);
  }

  let navBackdrop;
  let navLastFocused;
  let scrollLockCount = 0;

  function focusMainFromHash() {
    if (window.location.hash !== '#main-content' || !firstMain) return;
    firstMain.tabIndex = -1;
    firstMain.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const skipLink = event.target.closest('.skip-link');
    if (!skipLink) return;
    window.setTimeout(focusMainFromHash, 0);
  });
  window.addEventListener('hashchange', focusMainFromHash);
  focusMainFromHash();

  function lockScroll() {
    scrollLockCount += 1;
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) document.body.style.overflow = '';
  }

  function closeNav(returnFocus = true) {
    if (!navLinks || !navToggle) return;
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    if (navBackdrop) navBackdrop.classList.remove('open');
    unlockScroll();
    if (returnFocus && navLastFocused) navLastFocused.focus();
  }

  if (navToggle && navLinks) {
    navBackdrop = document.createElement('button');
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.type = 'button';
    navBackdrop.setAttribute('aria-label', 'Close menu');
    document.body.appendChild(navBackdrop);

    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navBackdrop.classList.toggle('open', isOpen);

      if (isOpen) {
        navLastFocused = document.activeElement;
        lockScroll();
        const firstLink = navLinks.querySelector('a');
        if (firstLink) firstLink.focus();
      } else {
        closeNav();
      }
    });

    navBackdrop.addEventListener('click', () => closeNav(false));
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => closeNav(false));
    });
  }

  let scrollTicking = false;
  function onScroll() {
    if (!header) return;
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      header.classList.toggle('scrolled', window.scrollY > 12);
      scrollTicking = false;
    });
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });


  const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

  function prefersReducedMotion() {
    return reduceMotionMedia.matches;
  }

  function initPageEnter() {
    if (prefersReducedMotion()) return;
    document.body.classList.add('page-enter');
    const clear = () => document.body.classList.remove('page-enter');
    window.setTimeout(clear, 260);
    document.body.addEventListener('animationend', clear, { once: true });
  }

  function isInternalNavigableLink(link) {
    if (!link) return false;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return false;
    if (link.hasAttribute('download')) return false;
    if (link.target && link.target !== '_self') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return true;
  }

  function initPageLeaveNavigation() {
    document.addEventListener('click', (event) => {
      if (prefersReducedMotion()) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest('a');
      if (!isInternalNavigableLink(link)) return;

      const nextUrl = new URL(link.href, window.location.href);
      const samePath = nextUrl.pathname === window.location.pathname;
      const sameSearch = nextUrl.search === window.location.search;
      if (samePath && sameSearch && nextUrl.hash) return;

      event.preventDefault();
      document.body.classList.add('page-leave');
      window.setTimeout(() => {
        window.location.assign(nextUrl.href);
      }, 200);
    });
  }

  function initSmartPrefetch() {
    const routeSet = new Set(['/work/', '/about/', '/contact/', '/systems/', '/collab/', '/delivery/', '/creative/']);
    const prefetched = new Set();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = connection && connection.effectiveType ? String(connection.effectiveType).toLowerCase() : '';
    const shouldSkipPrefetch = Boolean(connection && connection.saveData)
      || effectiveType.includes('slow-2g')
      || effectiveType.includes('2g');
    if (shouldSkipPrefetch) return;

    const link = document.createElement('link');
    const supportsPrefetch = !!(link.relList && link.relList.supports && link.relList.supports('prefetch'));

    function maybePrefetch(urlString) {
      const url = new URL(urlString, window.location.href);
      const normalizedPath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      if (url.origin !== window.location.origin) return;
      if (!routeSet.has(normalizedPath)) return;
      if (normalizedPath === window.location.pathname) return;
      if (prefetched.has(url.href)) return;
      prefetched.add(url.href);

      if (supportsPrefetch) {
        const prefetchLink = document.createElement('link');
        prefetchLink.rel = 'prefetch';
        prefetchLink.as = 'document';
        prefetchLink.href = url.href;
        document.head.appendChild(prefetchLink);
        return;
      }

      fetch(url.href, { credentials: 'same-origin' }).catch(() => {
        prefetched.delete(url.href);
      });
    }

    document.querySelectorAll('.nav-links a').forEach((navLink) => {
      navLink.addEventListener('pointerenter', () => maybePrefetch(navLink.href), { passive: true });
      navLink.addEventListener('focus', () => maybePrefetch(navLink.href));
    });

    const idlePrefetch = () => {
      ['/work/', '/about/'].forEach((route) => maybePrefetch(route));
    };
    const requestIdle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 180));
    requestIdle(idlePrefetch);
  }

  initPageEnter();
  initPageLeaveNavigation();
  initSmartPrefetch();
  const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const normalized = href.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    const normalizedPath = path.replace(/\/$/, '') || '/';
    if (normalizedPath === normalized) link.classList.add('active');
  });

  let reveal;
  if (prefersReducedMotion()) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
  } else {
    reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));
  }


  function applyNoWidow(scope = document) {
    scope.querySelectorAll('.no-widow').forEach((node) => {
      if (!node || node.dataset.widowLocked === 'true') return;
      const text = node.textContent;
      if (!text || text.trim().split(/\s+/).length < 3) return;
      node.textContent = text.replace(/\s+([^\s]+)\s*$/, ' $1');
      node.dataset.widowLocked = 'true';
    });
  }

  function hydrateMediaFrames(scope = document) {
    scope.querySelectorAll('.media-frame img, .media-frame [data-media-img]').forEach((media) => {
      if (media.complete) {
        media.classList.add('is-loaded');
      } else {
        media.addEventListener('load', () => media.classList.add('is-loaded'), { once: true });
        media.addEventListener('error', () => media.classList.add('is-loaded'), { once: true });
      }
    });
  }

  applyNoWidow();
  hydrateMediaFrames();

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
  const modalPrev = document.querySelector('[data-modal-prev]');
  const modalNext = document.querySelector('[data-modal-next]');

  let projects = [];
  let filtered = [];
  let currentModalIndex = -1;
  let lastFocused;

  const customSelects = [];

  function clearTransientClasses(node) {
    if (!node) return;
    const classNames = Array.from(node.classList);
    classNames.forEach((className) => {
      const lowered = className.toLowerCase();
      if (
        lowered.includes('leave')
        || lowered.includes('enter')
        || lowered.includes('loading')
        || lowered.includes('transition')
        || lowered.includes('nav-open')
        || lowered.includes('menu-open')
        || lowered.includes('modal-open')
      ) {
        node.classList.remove(className);
      }
    });
    node.classList.remove('page-enter', 'page-leave', 'loading', 'transition', 'nav-open', 'menu-open', 'modal-open');
  }

  function hardResetUI(reason) {
    void reason;
    clearTransientClasses(document.documentElement);
    clearTransientClasses(document.body);

    ['opacity', 'transform'].forEach((property) => {
      document.documentElement.style.removeProperty(property);
      document.body.style.removeProperty(property);
    });

    document.documentElement.style.opacity = '1';
    document.documentElement.style.transform = 'none';
    document.body.style.opacity = '1';
    document.body.style.transform = 'none';

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    if (navLinks) navLinks.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    if (navBackdrop) {
      navBackdrop.classList.remove('open');
      navBackdrop.style.removeProperty('display');
    }

    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.removeProperty('display');
    }

    closeAllCustomSelects();

    scrollLockCount = 0;
  }

  function clearPageLeavingState() {
    clearTransientClasses(document.documentElement);
    clearTransientClasses(document.body);
    document.documentElement.style.removeProperty('opacity');
    document.documentElement.style.removeProperty('transform');
    document.body.style.removeProperty('opacity');
    document.body.style.removeProperty('transform');
    document.body.style.opacity = '1';
  }

  function closeAllCustomSelects(except) {
    customSelects.forEach((item) => {
      if (item !== except) item.close(false);
    });
  }

  function createCustomSelect(root) {
    const nativeSelect = root.querySelector('select');
    const trigger = root.querySelector('[data-select-trigger]');
    const label = root.querySelector('[data-select-label]');
    const listbox = root.querySelector('[data-select-listbox]');
    const options = Array.from(root.querySelectorAll('[data-select-option]'));
    if (!nativeSelect || !trigger || !listbox || !options.length || !label) return null;

    let activeIndex = Math.max(0, options.findIndex((option) => option.dataset.selectOption === nativeSelect.value));

    function syncSelection(value, emitChange = false) {
      const selectedValue = value || options[0].dataset.selectOption;
      nativeSelect.value = selectedValue;
      options.forEach((option, index) => {
        const isSelected = option.dataset.selectOption === selectedValue;
        option.setAttribute('aria-selected', String(isSelected));
        option.tabIndex = index === activeIndex ? 0 : -1;
        option.classList.toggle('is-selected', isSelected);
      });

      const selectedOption = options.find((option) => option.dataset.selectOption === selectedValue) || options[0];
      if (selectedOption) {
        activeIndex = options.indexOf(selectedOption);
        selectedOption.tabIndex = 0;
        label.textContent = selectedOption.textContent;
      }

      if (emitChange) {
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    function open() {
      closeAllCustomSelects(api);
      root.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      const activeOption = options[activeIndex] || options[0];
      if (activeOption) activeOption.focus();
    }

    function close(returnFocus = false) {
      root.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    }

    function chooseByIndex(index) {
      const normalized = Math.max(0, Math.min(options.length - 1, index));
      activeIndex = normalized;
      syncSelection(options[normalized].dataset.selectOption, true);
      close(true);
    }

    function moveActive(step) {
      activeIndex = (activeIndex + step + options.length) % options.length;
      options.forEach((option, index) => {
        option.tabIndex = index === activeIndex ? 0 : -1;
      });
      options[activeIndex].focus();
    }

    trigger.addEventListener('click', () => {
      if (root.classList.contains('open')) close();
      else open();
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (root.classList.contains('open')) close();
        else open();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!root.classList.contains('open')) open();
        else moveActive(1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!root.classList.contains('open')) open();
        else moveActive(-1);
      }
      if (event.key === 'Escape') {
        close();
      }
    });

    listbox.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        activeIndex = 0;
        options[0].focus();
      }
      if (event.key === 'End') {
        event.preventDefault();
        activeIndex = options.length - 1;
        options[activeIndex].focus();
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseByIndex(activeIndex);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
      if (event.key === 'Tab') {
        close(false);
      }
    });

    options.forEach((option, index) => {
      option.addEventListener('click', () => chooseByIndex(index));
      option.addEventListener('mousemove', () => {
        activeIndex = index;
        option.tabIndex = 0;
      });
    });

    nativeSelect.addEventListener('change', () => {
      syncSelection(nativeSelect.value, false);
    });

    syncSelection(nativeSelect.value || nativeSelect.options[0].value, false);

    const api = {
      root,
      close,
      isOpen: () => root.classList.contains('open')
    };
    return api;
  }



  function enforceA11yLabels() {
    if (navToggle && !navToggle.getAttribute('aria-label')) {
      navToggle.setAttribute('aria-label', 'Toggle navigation menu');
    }
    if (modalClose && !modalClose.getAttribute('aria-label')) {
      modalClose.setAttribute('aria-label', 'Close dialog');
    }
    document.querySelectorAll('[data-select-trigger]').forEach((trigger) => {
      if (!trigger.hasAttribute('aria-haspopup')) trigger.setAttribute('aria-haspopup', 'listbox');
      if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  document.querySelectorAll('[data-custom-select]').forEach((root) => {
    const customSelect = createCustomSelect(root);
    if (customSelect) customSelects.push(customSelect);
  });

  document.addEventListener('click', (event) => {
    customSelects.forEach((item) => {
      if (!item.root.contains(event.target)) item.close(false);
    });
  });

  window.addEventListener('pageshow', () => {
    document.documentElement.classList.add('bfcache-restore');
    hardResetUI('pageshow');
    requestAnimationFrame(() => hardResetUI('pageshow-rAF'));
    window.setTimeout(() => hardResetUI('pageshow-timeout'), 50);
    window.setTimeout(() => {
      document.documentElement.classList.remove('bfcache-restore');
    }, 200);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') hardResetUI('visibilitychange');
  });

  window.addEventListener('popstate', () => {
    hardResetUI('popstate');
  });

  window.addEventListener('pagehide', () => {
    clearPageLeavingState();
  });

  const projectsUrl = '/projects.json';

  fetch(projectsUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while requesting ${projectsUrl}`);
      }
      return response.json();
    })
    .then((data) => {
      projects = data.projects || [];
      if (collectionSelect) collectionSelect.value = bodyDefault;
      runFilters();
    })
    .catch((error) => {
      const detail = error && error.message ? error.message : `Request failed for ${projectsUrl}`;
      grid.innerHTML = `<p>Unable to load projects.json. <small>${detail}</small></p>`;
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

    grid.innerHTML = items.map((item) => {
      const preview = buildPlaceholder(item);
      return `
      <article class="project-card reveal">
        <button type="button" class="project-tile" data-open-id="${item.id}">
          <div class="project-image-shell"><div class="media-frame ratio-4x3"><img class="project-image" data-media-img src="${preview}" alt="${item.title} abstract preview" loading="lazy"><span class="accent-tick" aria-hidden="true"></span></div></div>
          <div class="caption-bar">
            <div class="caption-meta">${item.type.replace('_', ' ')} • ${item.date}</div>
            <h3 class="caption-title balance no-widow">${item.title}</h3>
            <p class="caption-summary">${item.summary}</p>
          </div>
        </button>
      </article>`;
    }).join('');

    hydrateMediaFrames(grid);
    applyNoWidow(grid);

    document.querySelectorAll('[data-open-id]').forEach((btn) => {
      btn.addEventListener('click', () => openModalById(btn.dataset.openId));
    });
    if (reveal) document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));
  }

  function buildPlaceholder(item) {
    const safeType = (item.type || 'project').replace(/[^a-z_]/gi, '');
    const label = encodeURIComponent((item.type || 'Project').replace('_', ' ').toUpperCase());
    return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${safeType} placeholder"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#16161d"/><stop offset="100%" stop-color="#0f0f13"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g opacity="0.6"><rect x="64" y="84" width="672" height="2" fill="#C1121F"/><rect x="64" y="102" width="420" height="2" fill="rgba(245,245,245,0.45)"/></g><g opacity="0.3"><circle cx="640" cy="180" r="120" fill="#C1121F"/></g><text x="64" y="540" fill="rgba(245,245,245,0.75)" font-family="Inter,Arial,sans-serif" font-size="28" letter-spacing="5">${decodeURIComponent(label)}</text></svg>`)}`;
  }

  function openModalById(id) {
    currentModalIndex = filtered.findIndex((p) => p.id === id);
    openModalAtIndex(currentModalIndex);
  }

  function openModalAtIndex(index) {
    if (!modal || index < 0 || index >= filtered.length) return;
    const item = filtered[index];
    if (!item) return;
    currentModalIndex = index;
    lastFocused = document.activeElement;

    modalTitle.textContent = item.title;
    modalMeta.textContent = `${item.type} • ${item.date} • ${item.collections.join(', ')}`;
    const modalPreview = buildPlaceholder(item);

    modalBody.innerHTML = `
      <div class="media-frame ratio-16x9"><img data-media-img src="${modalPreview}" alt="${item.title} detail preview" loading="lazy"><span class="accent-tick" aria-hidden="true"></span></div>
      <p>${item.summary}</p>
      <h3>Problem</h3><p>${item.sections.problem}</p>
      <h3>Constraints</h3><p>${item.sections.constraints}</p>
      <h3>Actions</h3><ul class="list">${item.sections.actions.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Results</h3><ul class="list">${item.sections.results.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Next Steps</h3><ul class="list">${item.sections.next_steps.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Tools</h3><p>${item.tools.join(', ')}</p>
    `;

    if (modalPrev) modalPrev.disabled = currentModalIndex <= 0;
    if (modalNext) modalNext.disabled = currentModalIndex >= filtered.length - 1;

    applyNoWidow(modalBody);
    hydrateMediaFrames(modalBody);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
    lockScroll();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    unlockScroll();
    if (lastFocused) lastFocused.focus();
  }

  function stepModal(direction) {
    if (!modal || !modal.classList.contains('open')) return;
    const nextIndex = currentModalIndex + direction;
    if (nextIndex < 0 || nextIndex >= filtered.length) return;
    openModalAtIndex(nextIndex);
  }

  function trapFocus(event) {
    if (!modal || !modal.classList.contains('open') || event.key !== 'Tab') return;
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
  if (modalPrev) modalPrev.addEventListener('click', () => stepModal(-1));
  if (modalNext) modalNext.addEventListener('click', () => stepModal(1));

  enforceA11yLabels();

  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.addEventListener('keydown', trapFocus);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeNav();
      closeAllCustomSelects();
    }
    if (e.key === 'ArrowLeft') stepModal(-1);
    if (e.key === 'ArrowRight') stepModal(1);
  });
})();
