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
  let scrollLocked = false;
  let savedScrollY = 0;
  let savedBodyPaddingRight = '';
  let viewportUpdateRaf = 0;

  function setViewportUnits() {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
  }

  function queueViewportUnitSync() {
    if (viewportUpdateRaf) return;
    viewportUpdateRaf = window.requestAnimationFrame(() => {
      viewportUpdateRaf = 0;
      setViewportUnits();
    });
  }

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
    if (scrollLockCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      savedBodyPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.documentElement.classList.add('is-scroll-locked');
      document.body.classList.add('is-scroll-locked');
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      scrollLocked = true;
    }
    scrollLockCount += 1;
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.documentElement.classList.remove('is-scroll-locked');
      document.body.classList.remove('is-scroll-locked');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('left');
      document.body.style.removeProperty('right');
      document.body.style.removeProperty('width');
      if (savedBodyPaddingRight) {
        document.body.style.paddingRight = savedBodyPaddingRight;
      } else {
        document.body.style.removeProperty('padding-right');
      }
      window.scrollTo(0, savedScrollY);
      scrollLocked = false;
    }
  }

  const focusableSelector = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

  function setElementInert(node, isInert) {
    if (!node) return;
    if ('inert' in node) {
      node.inert = isInert;
      return;
    }
    if (isInert) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
  }

  function setFocusableState(container, disabled) {
    if (!container) return;
    container.querySelectorAll(focusableSelector).forEach((element) => {
      if (disabled) {
        if (!element.hasAttribute('data-prev-tabindex')) {
          const prev = element.getAttribute('tabindex');
          element.setAttribute('data-prev-tabindex', prev === null ? '' : prev);
        }
        element.setAttribute('tabindex', '-1');
      } else if (element.hasAttribute('data-prev-tabindex')) {
        const prev = element.getAttribute('data-prev-tabindex');
        if (prev === '') element.removeAttribute('tabindex');
        else element.setAttribute('tabindex', prev);
        element.removeAttribute('data-prev-tabindex');
      }
    });
  }

  function isCompactNav() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function closeNav(returnFocus = true) {
    if (!navLinks || !navToggle) return;
    navLinks.classList.remove('open');
    if (isCompactNav()) {
      navLinks.setAttribute('aria-hidden', 'true');
      navLinks.hidden = true;
      setElementInert(navLinks, true);
      setFocusableState(navLinks, true);
    } else {
      navLinks.setAttribute('aria-hidden', 'false');
      navLinks.hidden = false;
      setElementInert(navLinks, false);
      setFocusableState(navLinks, false);
    }
    navToggle.setAttribute('aria-expanded', 'false');
    if (navBackdrop) {
      navBackdrop.classList.remove('open');
      navBackdrop.setAttribute('aria-hidden', 'true');
      navBackdrop.disabled = true;
      navBackdrop.tabIndex = -1;
    }
    unlockScroll();
    if (returnFocus && navLastFocused) navLastFocused.focus({ preventScroll: true });
  }

  function trapFocusInContainer(container, event) {
    if (!container || event.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll(focusableSelector))
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  if (navToggle && navLinks) {
    navBackdrop = document.createElement('button');
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.type = 'button';
    navBackdrop.setAttribute('aria-label', 'Close menu');
    navBackdrop.setAttribute('aria-hidden', 'true');
    navBackdrop.disabled = true;
    navBackdrop.tabIndex = -1;
    if (isCompactNav()) {
      navLinks.setAttribute('aria-hidden', 'true');
      navLinks.hidden = true;
      setElementInert(navLinks, true);
      setFocusableState(navLinks, true);
    } else {
      navLinks.setAttribute('aria-hidden', 'false');
      navLinks.hidden = false;
      setElementInert(navLinks, false);
      setFocusableState(navLinks, false);
    }
    document.body.appendChild(navBackdrop);

    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navBackdrop.classList.toggle('open', isOpen);

      if (isOpen) {
        navLastFocused = document.activeElement;
        if (isCompactNav()) {
          navLinks.setAttribute('aria-hidden', 'false');
          navLinks.hidden = false;
          setElementInert(navLinks, false);
          setFocusableState(navLinks, false);
          navBackdrop.setAttribute('aria-hidden', 'false');
          navBackdrop.disabled = false;
          navBackdrop.tabIndex = 0;
          lockScroll();
          const firstLink = navLinks.querySelector('a');
          if (firstLink) firstLink.focus({ preventScroll: true });
        }
      } else {
        closeNav(true);
      }
    });

    navBackdrop.addEventListener('click', () => closeNav(false));
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => closeNav(false));
    });

    navLinks.addEventListener('keydown', (event) => {
      if (!navLinks.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNav(true);
        return;
      }
      trapFocusInContainer(navLinks, event);
    });

    window.addEventListener('resize', () => {
      if (isCompactNav()) {
        if (!navLinks.classList.contains('open')) {
          navLinks.setAttribute('aria-hidden', 'true');
          navLinks.hidden = true;
          setElementInert(navLinks, true);
          setFocusableState(navLinks, true);
        }
      } else {
        navLinks.classList.remove('open');
        navLinks.setAttribute('aria-hidden', 'false');
        navLinks.hidden = false;
        setElementInert(navLinks, false);
        setFocusableState(navLinks, false);
        navBackdrop.classList.remove('open');
        navBackdrop.setAttribute('aria-hidden', 'true');
        navBackdrop.disabled = true;
        navBackdrop.tabIndex = -1;
        if (scrollLocked) unlockScroll();
      }
    });
  }

  setViewportUnits();
  window.addEventListener('resize', queueViewportUnitSync, { passive: true });
  window.addEventListener('orientationchange', queueViewportUnitSync, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueViewportUnitSync, { passive: true });
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

  const revealSelector = '[data-reveal], .reveal';

  function prepareRevealStaggers(scope = document) {
    scope.querySelectorAll('[data-reveal-stagger]').forEach((container) => {
      const children = Array.from(container.children).filter((child) => child.matches(revealSelector));
      children.forEach((child, index) => {
        child.style.setProperty('--reveal-delay', `${index * 60}ms`);
      });
    });
  }

  let reveal;
  if (prefersReducedMotion()) {
    document.querySelectorAll(revealSelector).forEach((el) => {
      el.classList.add('visible', 'is-revealed');
    });
  } else {
    reveal = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible', 'is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll(revealSelector).forEach((el) => reveal.observe(el));
  }

  prepareRevealStaggers();


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
    scope.querySelectorAll('.feature-media .media-frame').forEach((frame) => {
      if (frame.querySelector('.media-placeholder')) return;
      const isPortrait = frame.classList.contains('ratio-3x4') || frame.classList.contains('media-frame--portrait');
      const placeholderType = isPortrait ? 'portrait' : 'featured';
      const label = isPortrait ? 'Portrait' : 'Featured';
      frame.insertAdjacentHTML('beforeend', `<span class="media-placeholder media-placeholder--${placeholderType}" aria-hidden="true"><span class="media-placeholder__caption">${label}</span></span>`);
    });

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

  const FILTER_DEFINITIONS = {
    collection: [
      { value: 'all', label: 'All collections' },
      { value: 'systems', label: 'Systems' },
      { value: 'collab', label: 'Collaboration & Live' },
      { value: 'delivery', label: 'Delivery' },
      { value: 'creative', label: 'Creative' }
    ],
    type: [
      { value: 'all', label: 'All types' },
      { value: 'case_study', label: 'Case Study' },
      { value: 'lab', label: 'Lab' },
      { value: 'template', label: 'Template' },
      { value: 'gallery', label: 'Gallery' },
      { value: 'writing', label: 'Writing' }
    ]
  };


  function populateNativeFilterSelect(select, kind) {
    if (!select) return;
    const definitions = FILTER_DEFINITIONS[kind] || [];
    select.innerHTML = '';
    definitions.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    });
  }

  populateNativeFilterSelect(collectionSelect, 'collection');
  populateNativeFilterSelect(typeSelect, 'type');

  let modal = null;
  let modalTitle = null;
  let modalMeta = null;
  let modalSummary = null;
  let modalHeroMedia = null;
  let modalBody = null;
  let modalScroller = null;
  let modalClose = null;
  let modalPrev = null;
  let modalNext = null;
  let modalPanel = null;

  let projects = [];
  let filtered = [];
  let currentModalIndex = -1;
  let currentMediaIndex = 0;
  let lastFocused;
  let syncingModalFromHash = false;
  const BIND_GUARD_KEY = '__portfolioWorkBindings';

  function ensureModalElements() {
    if (modal && document.body.contains(modal)) return;
    const container = document.createElement('div');
    container.innerHTML = `<div class="modal-overlay" data-modal hidden inert aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-panel"><div class="modal-header"><h2 class="modal-title" id="modal-title" data-modal-title></h2><div class="modal-actions"><button class="modal-nav" type="button" data-modal-prev aria-label="Previous project"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10.5 3.5L6 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="modal-nav" type="button" data-modal-next aria-label="Next project"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.5 3.5L10 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="modal-close" type="button" data-modal-close aria-label="Close dialog"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div></div><div class="modal-scroller" data-modal-scroller><div class="modal-body"><section class="modal-hero" aria-label="Project overview"><div class="modal-hero-copy"><p class="meta-line" data-modal-meta></p><p class="modal-summary" data-modal-summary></p></div><div class="modal-hero-media" data-modal-hero-media></div></section><div class="modal-content" data-modal-body></div></div></div></div></div>`;
    modal = container.firstElementChild;
    document.body.appendChild(modal);
    modalTitle = modal.querySelector('[data-modal-title]');
    modalMeta = modal.querySelector('[data-modal-meta]');
    modalSummary = modal.querySelector('[data-modal-summary]');
    modalHeroMedia = modal.querySelector('[data-modal-hero-media]');
    modalBody = modal.querySelector('[data-modal-body]');
    modalScroller = modal.querySelector('[data-modal-scroller]');
    modalClose = modal.querySelector('[data-modal-close]');
    modalPrev = modal.querySelector('[data-modal-prev]');
    modalNext = modal.querySelector('[data-modal-next]');
    modalPanel = modal.querySelector('.modal-panel');

    if (modalClose) modalClose.addEventListener('click', () => closeModal());
    if (modalPrev) modalPrev.addEventListener('click', () => stepModal(-1));
    if (modalNext) modalNext.addEventListener('click', () => stepModal(1));

    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.addEventListener('keydown', trapFocus);
    if (modalHeroMedia) modalHeroMedia.addEventListener('click', (event) => {
      const thumb = event.target.closest('[data-gallery-thumb]');
      if (!thumb || currentModalIndex < 0 || currentModalIndex >= filtered.length) return;
      const nextIndex = Number(thumb.dataset.galleryThumb);
      if (Number.isNaN(nextIndex)) return;
      renderModalGallery(filtered[currentModalIndex], nextIndex);
      applyNoWidow(modalHeroMedia);
      hydrateMediaFrames(modalHeroMedia);
    });

    let touchStartX = 0;
    let touchStartY = 0;
    if (modalPanel) {
      modalPanel.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }, { passive: true });

      modalPanel.addEventListener('touchend', (event) => {
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const swipeThreshold = 48;
        if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaY) > Math.abs(deltaX) * 0.75) return;
        stepModal(deltaX < 0 ? 1 : -1);
      }, { passive: true });
    }

    setModalOpenState(false);
    enforceA11yLabels();
  }

  function isModalOpen() {
    return Boolean(modal && modal.classList.contains('open'));
  }

  function getCurrentModalItemId() {
    if (currentModalIndex < 0 || currentModalIndex >= filtered.length) return '';
    const item = filtered[currentModalIndex];
    return item && item.id ? item.id : '';
  }

  function getModalHashId() {
    const rawHash = window.location.hash || '';
    if (!rawHash.startsWith('#p=')) return '';
    const encoded = rawHash.slice(3);
    if (!encoded) return '';
    try {
      return decodeURIComponent(encoded);
    } catch (error) {
      void error;
      return '';
    }
  }

  function replaceHashlessUrl() {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }

  function writeModalHash(itemId, shouldReplace = false) {
    if (!itemId) return;
    const nextHash = `#p=${encodeURIComponent(itemId)}`;
    if (window.location.hash === nextHash) return;
    if (shouldReplace) {
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
      return;
    }
    window.location.hash = `p=${encodeURIComponent(itemId)}`;
  }

  function setModalOpenState(isOpen) {
    if (!modal) return;
    modal.classList.toggle('open', isOpen);
    if (!isOpen) modal.classList.remove('opening', 'closing');
    document.body.classList.toggle('is-modal-open', isOpen);
    modal.hidden = !isOpen;
    modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    setElementInert(modal, !isOpen);
    setFocusableState(modal, !isOpen);
  }

  function resolveAssetPath(path) {
    if (typeof path !== 'string') return path;
    if (path.startsWith('./')) return `/${path.slice(2)}`;
    return path;
  }

  function getModalImages(item) {
    if (Array.isArray(item.images) && item.images.length) {
      const valid = item.images.filter((src) => typeof src === 'string' && src.trim()).map((src) => resolveAssetPath(src.trim()));
      if (valid.length) return { images: valid, hasGallery: true };
    }
    return { images: [buildPlaceholder(item)], hasGallery: false };
  }

  function renderModalGallery(item, mediaIndex = 0) {
    if (!modalHeroMedia) return;
    const { images: galleryImages, hasGallery } = getModalImages(item);
    const safeIndex = Math.min(Math.max(mediaIndex, 0), galleryImages.length - 1);
    currentMediaIndex = safeIndex;

    const thumbs = galleryImages.map((src, index) => {
      const selected = index === safeIndex;
      return `<button type="button" class="modal-thumb${selected ? ' is-active' : ''}" data-gallery-thumb="${index}" aria-label="Show image ${index + 1}" aria-pressed="${selected ? 'true' : 'false'}"><img data-media-img src="${src}" alt="${item.title} thumbnail ${index + 1}" loading="lazy"></button>`;
    }).join('');

    const showThumbs = hasGallery && galleryImages.length > 1;

    modalHeroMedia.innerHTML = `
      <section class="modal-gallery" aria-label="Project gallery">
        <div class="media-frame media-frame--landscape ratio-16x9 modal-gallery__hero"><img data-media-img src="${galleryImages[safeIndex]}" alt="${item.title} detail preview" loading="lazy"><span class="media-placeholder media-placeholder--featured" aria-hidden="true"><span class="media-placeholder__caption">Featured</span></span><span class="accent-tick" aria-hidden="true"></span></div>
        ${showThumbs ? `<div class="modal-gallery__thumbs" role="list">${thumbs}</div>` : ''}
      </section>
    `;

    if (modalPrev) modalPrev.disabled = !showThumbs;
    if (modalNext) modalNext.disabled = !showThumbs;
  }

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
    document.documentElement.classList.remove('is-scroll-locked');
    document.body.classList.remove('is-scroll-locked');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('left');
    document.body.style.removeProperty('right');
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('padding-right');

    if (navLinks && navToggle) closeNav(false);
    if (navBackdrop) {
      navBackdrop.style.removeProperty('display');
    }

    if (modal) {
      setModalOpenState(false);
      modal.remove();
      modal = null;
    }

    closeAllCustomSelects();

    currentModalIndex = -1;
    currentMediaIndex = 0;
    scrollLockCount = 0;
    savedBodyPaddingRight = '';
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
    const kind = root.dataset.selectKind;
    const definitions = FILTER_DEFINITIONS[kind] || [];
    if (!nativeSelect || !trigger || !listbox || !label || !definitions.length) return null;

    const listboxId = listbox.id || `listbox-${Math.random().toString(36).slice(2, 9)}`;
    listbox.id = listboxId;
    trigger.setAttribute('aria-controls', listboxId);
    listbox.hidden = true;
    listbox.setAttribute('aria-hidden', 'true');
    setElementInert(listbox, true);
    setFocusableState(listbox, true);

    const labelMap = new Map(definitions.map((entry) => [entry.value, entry.label]));
    let options = [];
    let activeIndex = Math.max(0, definitions.findIndex((entry) => entry.value === nativeSelect.value));

    function renderOptions() {
      if (options.length) return;
      listbox.innerHTML = '';
      options = definitions.map((entry, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'custom-select-option';
        option.id = `${kind || 'select'}-filter-option-${entry.value.replace(/_/g, '-')}`;
        option.setAttribute('role', 'option');
        option.dataset.selectOption = entry.value;
        option.setAttribute('aria-selected', 'false');
        option.tabIndex = -1;
        option.textContent = entry.label;
        option.addEventListener('click', () => chooseByIndex(index));
        option.addEventListener('mousemove', () => {
          activeIndex = index;
          option.tabIndex = 0;
        });
        listbox.appendChild(option);
        return option;
      });
    }

    function unrenderOptions() {
      options = [];
      listbox.innerHTML = '';
    }

    function syncSelection(value, emitChange = false) {
      const selectedValue = value || definitions[0].value;
      nativeSelect.value = selectedValue;

      if (options.length) {
        options.forEach((option, index) => {
          const isSelected = option.dataset.selectOption === selectedValue;
          option.setAttribute('aria-selected', String(isSelected));
          option.tabIndex = index === activeIndex ? 0 : -1;
          option.classList.toggle('is-selected', isSelected);
          if (isSelected && option.id) trigger.setAttribute('aria-activedescendant', option.id);
        });
      }

      const selectedIndex = Math.max(0, definitions.findIndex((entry) => entry.value === selectedValue));
      activeIndex = selectedIndex;
      label.textContent = labelMap.get(selectedValue) || definitions[0].label;

      if (emitChange) nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function open() {
      closeAllCustomSelects(api);
      renderOptions();
      syncSelection(nativeSelect.value || definitions[0].value, false);
      root.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      listbox.hidden = false;
      listbox.setAttribute('aria-hidden', 'false');
      setElementInert(listbox, false);
      setFocusableState(listbox, false);
      const activeOption = options[activeIndex] || options[0];
      if (activeOption) activeOption.focus({ preventScroll: true });
    }

    function close(returnFocus = false) {
      root.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      listbox.hidden = true;
      listbox.setAttribute('aria-hidden', 'true');
      setElementInert(listbox, true);
      setFocusableState(listbox, true);
      unrenderOptions();
      if (returnFocus) trigger.focus({ preventScroll: true });
    }

    function chooseByIndex(index) {
      const normalized = Math.max(0, Math.min(definitions.length - 1, index));
      activeIndex = normalized;
      syncSelection(definitions[normalized].value, true);
      close(true);
    }

    function moveActive(step) {
      activeIndex = (activeIndex + step + definitions.length) % definitions.length;
      if (options[activeIndex]) {
        options.forEach((option, index) => {
          option.tabIndex = index === activeIndex ? 0 : -1;
        });
        options[activeIndex].focus({ preventScroll: true });
      }
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
      if (event.key === 'Escape') close();
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
        if (options[0]) options[0].focus({ preventScroll: true });
      }
      if (event.key === 'End') {
        event.preventDefault();
        activeIndex = definitions.length - 1;
        if (options[activeIndex]) options[activeIndex].focus({ preventScroll: true });
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseByIndex(activeIndex);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
      if (event.key === 'Tab') close(false);
    });

    nativeSelect.addEventListener('change', () => {
      syncSelection(nativeSelect.value, false);
    });

    syncSelection(nativeSelect.value || definitions[0].value, false);

    return {
      root,
      close,
      isOpen: () => root.classList.contains('open')
    };
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

  function safeRehydrateUI(reason) {
    clearPageLeavingState();
    hardResetUI(reason);
  }

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
    if (isModalOpen()) {
      const activeItem = filtered[currentModalIndex];
      if (!activeItem) closeModal({ fromHashSync: true });
    }
    syncModalFromHash('filters');
  }

  function renderCards(items) {
    if (!items.length) {
      grid.innerHTML = '<p>No matching projects. Try clearing one or more filters.</p>';
      return;
    }

    grid.innerHTML = items.map((item) => {
      const preview = buildPlaceholder(item);
      return `
      <article class="project-card reveal" data-reveal>
        <button type="button" class="project-tile" data-open-id="${item.id}">
          <div class="project-image-shell"><div class="media-frame media-frame--landscape ratio-4x3"><img class="project-image" data-media-img src="${preview}" alt="${item.title} abstract preview" loading="lazy"><span class="media-placeholder media-placeholder--featured" aria-hidden="true"><span class="media-placeholder__caption">Featured</span></span><span class="accent-tick" aria-hidden="true"></span></div></div>
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
    if (reveal) document.querySelectorAll(revealSelector).forEach((el) => reveal.observe(el));
    prepareRevealStaggers(grid);
  }

  function buildPlaceholder(item) {
    const safeType = (item.type || 'project').replace(/[^a-z_]/gi, '');
    const label = encodeURIComponent((item.type || 'Project').replace('_', ' ').toUpperCase());
    return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${safeType} placeholder"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#16161d"/><stop offset="100%" stop-color="#0f0f13"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g opacity="0.6"><rect x="64" y="84" width="672" height="2" fill="#C1121F"/><rect x="64" y="102" width="420" height="2" fill="rgba(245,245,245,0.45)"/></g><g opacity="0.3"><circle cx="640" cy="180" r="120" fill="#C1121F"/></g><text x="64" y="540" fill="rgba(245,245,245,0.75)" font-family="Inter,Arial,sans-serif" font-size="28" letter-spacing="5">${decodeURIComponent(label)}</text></svg>`)}`;
  }

  function openModal(id, options = {}) {
    const { replace = isModalOpen() } = options;
    writeModalHash(id, replace);
    if (syncingModalFromHash) return;

    const expectedHash = `#p=${encodeURIComponent(id)}`;
    if (window.location.hash === expectedHash) syncModalFromHash('openModal');
  }

  function openModalById(id) {
    if (!id) return;
    openModal(id);
  }

  function openModalAtIndex(index, options = {}) {
    const { fromHashSync = false } = options;
    if (index < 0 || index >= filtered.length) return;
    ensureModalElements();
    if (!modal) return;
    const item = filtered[index];
    if (!item) return;
    const wasOpen = isModalOpen();
    currentModalIndex = index;
    lastFocused = document.activeElement;

    modalTitle.textContent = item.title;
    modalMeta.textContent = `${item.type} • ${item.date} • ${item.collections.join(', ')}`;
    if (modalSummary) modalSummary.textContent = item.summary;
    renderModalGallery(item, 0);

    modalBody.innerHTML = `
      <h3>Problem</h3><p>${item.sections.problem}</p>
      <h3>Constraints</h3><p>${item.sections.constraints}</p>
      <h3>Actions</h3><ul class="list">${item.sections.actions.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Results</h3><ul class="list">${item.sections.results.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Next Steps</h3><ul class="list">${item.sections.next_steps.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Tools</h3><p>${item.tools.join(', ')}</p>
    `;

    applyNoWidow(modalBody);
    if (modalSummary) applyNoWidow(modalSummary);
    if (modalHeroMedia) applyNoWidow(modalHeroMedia);
    hydrateMediaFrames(modalBody);
    if (modalHeroMedia) hydrateMediaFrames(modalHeroMedia);

    if (modalScroller) modalScroller.scrollTop = 0;

    setModalOpenState(true);
    modal.classList.add('opening');
    requestAnimationFrame(() => {
      if (modal) modal.classList.remove('opening');
    });
    modal.dataset.galleryMode = 'true';
    modalClose.focus({ preventScroll: true });
    if (!wasOpen) lockScroll();
    if (!fromHashSync) openModal(item.id, { replace: wasOpen });
  }

  function closeModal(options = {}) {
    const { fromHashSync = false } = options;
    if (!modal) return;
    const wasOpen = isModalOpen();
    if (!wasOpen) {
      unlockScroll();
      return;
    }
    if (!fromHashSync && getModalHashId()) {
      window.history.back();
      return;
    }
    try {
      modal.classList.add('closing');
      setModalOpenState(false);
      modal.removeAttribute('data-gallery-mode');
      if (modalScroller) modalScroller.scrollTop = 0;
      modal.remove();
      modal = null;
    } finally {
      unlockScroll();
    }
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus({ preventScroll: true });
  }

  function stepModal(direction) {
    if (!modal || !modal.classList.contains('open')) return;
    const item = filtered[currentModalIndex];
    if (!item) return;
    const { images } = getModalImages(item);
    if (images.length <= 1) return;
    const nextIndex = (currentMediaIndex + direction + images.length) % images.length;
    renderModalGallery(item, nextIndex);
    applyNoWidow(modalHeroMedia);
    hydrateMediaFrames(modalHeroMedia);
  }

  function trapFocus(event) {
    if (!modal || !modal.classList.contains('open')) return;
    trapFocusInContainer(modal, event);
  }

  if (collectionSelect) collectionSelect.addEventListener('change', (e) => { state.collection = e.target.value; runFilters(); });
  if (typeSelect) typeSelect.addEventListener('change', (e) => { state.type = e.target.value; runFilters(); });
  if (searchInput) searchInput.addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); runFilters(); });
  enforceA11yLabels();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeNav(true);
      closeAllCustomSelects();
    }
    if (modal && modal.classList.contains('open') && e.key === 'ArrowLeft') stepModal(-1);
    if (modal && modal.classList.contains('open') && e.key === 'ArrowRight') stepModal(1);
  });

  function syncModalFromHash(fromEvent) {
    void fromEvent;
    syncingModalFromHash = true;
    try {
      const hasModalHash = (window.location.hash || '').startsWith('#p=');
      const hashId = getModalHashId();
      if (hasModalHash && !hashId) {
        replaceHashlessUrl();
        closeModal({ fromHashSync: true });
        unlockScroll();
        return;
      }
      if (hashId) {
        const nextIndex = filtered.findIndex((project) => project.id === hashId);
        if (nextIndex === -1) {
          replaceHashlessUrl();
          closeModal({ fromHashSync: true });
          unlockScroll();
          return;
        }

        const currentId = getCurrentModalItemId();
        if (!isModalOpen() || currentId !== hashId) {
          openModalAtIndex(nextIndex, { fromHashSync: true });
        }
        return;
      }

      if (isModalOpen()) closeModal({ fromHashSync: true });
      else unlockScroll();
    } finally {
      syncingModalFromHash = false;
    }
  }

  if (!window[BIND_GUARD_KEY]) {
    window[BIND_GUARD_KEY] = true;
    window.addEventListener('pageshow', (event) => {
      document.documentElement.classList.add('bfcache-restore');
      safeRehydrateUI(event.persisted ? 'pageshow-bfcache' : 'pageshow');
      syncModalFromHash('pageshow');
      requestAnimationFrame(() => safeRehydrateUI('pageshow-rAF'));
      window.setTimeout(() => safeRehydrateUI('pageshow-timeout'), 50);
      window.setTimeout(() => {
        syncModalFromHash('pageshow-timeout');
        document.documentElement.classList.remove('bfcache-restore');
      }, 200);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        safeRehydrateUI('visibilitychange');
        syncModalFromHash('visibility');
      }
    });

    window.addEventListener('pagehide', () => {
      if (scrollLocked) unlockScroll();
      clearPageLeavingState();
    });

    window.addEventListener('resize', () => {
      if (!isModalOpen() && scrollLocked) unlockScroll();
    });

    window.addEventListener('hashchange', () => syncModalFromHash('hashchange'));
  }

  syncModalFromHash('init');
})();
