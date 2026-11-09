/**
 * ReadyLaPlata Shared JavaScript Module
 * Consolidates common utilities, DOM helpers, and UI components
 */
(function(global) {
  'use strict';

  // ========== DOM HELPERS ==========
  const $ = id => document.getElementById(id);

  // ========== HTML ESCAPING ==========
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escHTML = s => String(s ?? '').replace(/[&<>"']/g, ch => ESC_MAP[ch]);

  // ========== QUERY ESCAPING (for ArcGIS where clauses) ==========
  const escapeQuery = s => String(s ?? '').replace(/'/g, "''");

  // ========== TIMESTAMP FORMATTING ==========
  const TIMESTAMP_OPTIONS = {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short'
  };

  const formatTimestamp = () => new Date().toLocaleString('en-US', TIMESTAMP_OPTIONS);

  const updateTimestamp = (el) => {
    if (el) el.textContent = 'Last loaded: ' + formatTimestamp();
  };

  // ========== INCIDENT CHIP CREATION ==========
  const createChip = (name, onClick) => {
    const chip = document.createElement('button');
    chip.className = 'incident-chip';
    chip.dataset.incident = name;

    const icon = document.createElement('span');
    icon.className = 'incident-chip-icon';
    icon.textContent = '!';

    const label = document.createElement('span');
    label.textContent = String(name ?? '');

    chip.append(icon, label);
    chip.addEventListener('click', onClick);
    return chip;
  };

  // ========== INCIDENT SORTING ==========
  const sortIncidents = (names, target) => {
    const targetLower = target?.toLowerCase();
    return names.sort((a, b) => {
      const al = a.toLowerCase(), bl = b.toLowerCase();
      if (targetLower) {
        if (al === targetLower) return -1;
        if (bl === targetLower) return 1;
      }
      return al.localeCompare(bl);
    });
  };

  // ========== URL PARAMETER PARSING ==========
  const getIncidentParam = () => {
    const params = new URLSearchParams(location.search);
    const raw = (params.get('incident') || params.get('Incident') || '').trim();
    const inc = raw.slice(0, 80);
    return inc && /^[a-z0-9 .,'\-()\/]+$/i.test(inc) ? inc : null;
  };

  // ========== OVERLAY FACTORY ==========
  // Track active overlays for unified escape handling
  const activeOverlays = new Set();
  let previousFocusElement = null;

  // Focus trap helper for modal dialogs
  const trapFocus = (container) => {
    const focusable = container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handler = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    container.addEventListener('keydown', handler);
    container._focusTrapHandler = handler;
    first.focus();
  };

  const releaseFocusTrap = (container) => {
    if (container._focusTrapHandler) {
      container.removeEventListener('keydown', container._focusTrapHandler);
      delete container._focusTrapHandler;
    }
  };

  const createOverlayToggle = (overlay) => {
    const toggle = (open) => {
      overlay.classList.toggle('is-open', open);
      overlay.setAttribute('aria-hidden', String(!open));
      if (open) {
        previousFocusElement = document.activeElement;
        activeOverlays.add(overlay);
        const dialog = overlay.querySelector('[role="dialog"]');
        if (dialog) requestAnimationFrame(() => trapFocus(dialog));
      } else {
        activeOverlays.delete(overlay);
        const dialog = overlay.querySelector('[role="dialog"]');
        if (dialog) releaseFocusTrap(dialog);
        if (previousFocusElement && previousFocusElement.focus) {
          previousFocusElement.focus();
          previousFocusElement = null;
        }
      }
    };
    return toggle;
  };

  // Single global escape handler for all overlays
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeOverlays.size > 0) {
      const overlay = Array.from(activeOverlays).pop();
      if (overlay) {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        const dialog = overlay.querySelector('[role="dialog"]');
        if (dialog) releaseFocusTrap(dialog);
        activeOverlays.delete(overlay);
        if (previousFocusElement && previousFocusElement.focus) {
          previousFocusElement.focus();
          previousFocusElement = null;
        }
      }
    }
  });

  // ========== LPC ALERTS OVERLAY INIT ==========
  const initCoderedOverlay = (elements) => {
    const { coderedButton, coderedOverlay, coderedClose } = elements;
    if (!coderedButton || !coderedOverlay) return;

    const toggle = createOverlayToggle(coderedOverlay);

    coderedButton.addEventListener('click', () => toggle(true));
    coderedClose?.addEventListener('click', () => toggle(false));
    coderedOverlay.addEventListener('click', e => { if (e.target === coderedOverlay) toggle(false); });
  };

  // ========== LPC ALERTS CALLER ID OVERLAY INIT ==========
  const initCallerIdOverlay = (elements) => {
    const { callerIdButton, callerIdOverlay, callerIdClose } = elements;
    if (!callerIdButton || !callerIdOverlay) return;

    const toggle = createOverlayToggle(callerIdOverlay);

    callerIdButton.addEventListener('click', () => toggle(true));
    callerIdClose?.addEventListener('click', () => toggle(false));
    callerIdOverlay.addEventListener('click', e => { if (e.target === callerIdOverlay) toggle(false); });

    // Dismiss button inside overlay
    const dismiss = callerIdOverlay.querySelector('#callerIdDismiss');
    dismiss?.addEventListener('click', () => toggle(false));
  };

  // ========== ANNOUNCEMENT OVERLAY INIT ==========
  const buildAnnouncementHTML = (data) => {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ESC_MAP[ch]);
    
    // Key message (the main alert shown at top)
    const keyMessage = data.keyMessage ? `
      <div class="announcement-key-message">
        <svg class="announcement-key-message-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="announcement-key-message-text">${data.keyMessage}</div>
      </div>` : '';

    // Primary CTA button (shown prominently below key message)
    const primaryCta = data.primaryButton ? `
      <a href="${esc(data.primaryButton.url)}" class="announcement-primary-cta" target="_blank" rel="noopener noreferrer">
        ${esc(data.primaryButton.text)}
      </a>` : '';

    // Build accordion sections
    const accordionSections = [];

    // Section 1: Why am I seeing this?
    if (data.accordion?.why) {
      accordionSections.push(`
        <div class="announcement-accordion-item">
          <button class="announcement-accordion-trigger" type="button" aria-expanded="false">
            <span class="announcement-accordion-trigger-left">
              <svg class="announcement-accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span class="announcement-accordion-label">${esc(data.accordion.why.title || 'Why am I seeing this?')}</span>
            </span>
            <svg class="announcement-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="announcement-accordion-content">
            ${(data.accordion.why.paragraphs || []).map(p => `<p class="announcement-accordion-text">${p}</p>`).join('')}
          </div>
        </div>`);
    }

    // Section 2: I don't have an account (or custom section)
    if (data.accordion?.noAccount) {
      accordionSections.push(`
        <div class="announcement-accordion-item">
          <button class="announcement-accordion-trigger" type="button" aria-expanded="false">
            <span class="announcement-accordion-trigger-left">
              <svg class="announcement-accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span class="announcement-accordion-label">${esc(data.accordion.noAccount.title || "I don't have an account")}</span>
            </span>
            <svg class="announcement-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="announcement-accordion-content">
            ${(data.accordion.noAccount.paragraphs || []).map(p => `<p class="announcement-accordion-text">${p}</p>`).join('')}
          </div>
        </div>`);
    }

    // Section 3: Need help / Contact
    if (data.contact) {
      accordionSections.push(`
        <div class="announcement-accordion-item">
          <button class="announcement-accordion-trigger" type="button" aria-expanded="false">
            <span class="announcement-accordion-trigger-left">
              <svg class="announcement-accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span class="announcement-accordion-label">${esc(data.contact.title || 'Need help?')}</span>
            </span>
            <svg class="announcement-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="announcement-accordion-content">
            <div class="announcement-accordion-contact-row">
              ${data.contact.email ? `<div class="announcement-accordion-contact-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <a href="mailto:${esc(data.contact.email)}">${esc(data.contact.email)}</a>
              </div>` : ''}
              ${data.contact.phone ? `<div class="announcement-accordion-contact-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <a href="tel:${esc(data.contact.phone.replace(/[^0-9]/g, ''))}">${esc(data.contact.phone)}</a>
              </div>` : ''}
            </div>
          </div>
        </div>`);
    }

    const accordion = accordionSections.length > 0 
      ? `<div class="announcement-accordion">${accordionSections.join('')}</div>` 
      : '';

    return `
      <div class="announcement-header">
        <img src="https://cms9files.revize.com/laplata/_assets_/images/logo.png" alt="La Plata County Logo" class="announcement-logo">
        <div class="announcement-header-text">
          <h2 id="announcementTitle" class="announcement-title">${esc(data.title)}</h2>
          <p class="announcement-subtitle">${esc(data.subtitle)}</p>
        </div>
        ${data.badge ? `<div class="announcement-badge">${esc(data.badge)}</div>` : ''}
      </div>
      <div class="announcement-body">
        ${keyMessage}
        ${primaryCta}
        ${accordion}
      </div>
      <div class="announcement-footer">
        <button id="announcementDismiss" class="secondary-pill" type="button">${esc(data.dismissButton || 'Close')}</button>
      </div>`;
  };

  // Initialize accordion functionality after content is injected
  const initAnnouncementAccordion = () => {
    document.querySelectorAll('.announcement-accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.announcement-accordion-item');
        const isOpen = item.classList.contains('is-open');
        item.classList.toggle('is-open', !isOpen);
        trigger.setAttribute('aria-expanded', !isOpen);
      });
    });
  };

  const initAnnouncement = async (elements, jsonUrl = 'announcement.json') => {
    const { announcementOverlay, announcementClose, announcementAlertBtn } = elements;
    if (!announcementOverlay) return;

    const toggle = (open) => {
      announcementOverlay.classList.toggle('is-open', open);
      announcementOverlay.setAttribute('aria-hidden', String(!open));
      if (!open && announcementAlertBtn) announcementAlertBtn.classList.add('is-viewed');
    };

    try {
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // If disabled, hide the button and exit
      if (!data.enabled) {
        if (announcementAlertBtn) announcementAlertBtn.style.display = 'none';
        return;
      }

      // Show the alert button
      if (announcementAlertBtn) announcementAlertBtn.classList.add('is-active');

      // Build and inject the content
      const dialog = announcementOverlay.querySelector('.announcement-dialog');
      if (dialog) {
        const closeBtn = dialog.querySelector('.announcement-close');
        dialog.innerHTML = '';
        if (closeBtn) dialog.appendChild(closeBtn);
        dialog.insertAdjacentHTML('beforeend', buildAnnouncementHTML(data));
        
        // Initialize accordion functionality
        initAnnouncementAccordion();
        
        // Bind dismiss button (just created)
        dialog.querySelector('#announcementDismiss')?.addEventListener('click', () => {
          toggle(false);
          sessionStorage.setItem('announcementDismissed', '1');
        });
      }

      // Bind events
      announcementAlertBtn?.addEventListener('click', () => toggle(true));
      announcementClose?.addEventListener('click', () => toggle(false));
      announcementOverlay.addEventListener('click', e => { if (e.target === announcementOverlay) toggle(false); });

      // Auto-open on first visit (session-based)
      if (data.autoOpen && !sessionStorage.getItem('announcementDismissed')) {
        toggle(true);
      }

    } catch (err) {
      console.warn('Announcement not loaded:', err.message);
      if (announcementAlertBtn) announcementAlertBtn.style.display = 'none';
    }
  };

  // ========== VCARD GENERATION & DOWNLOAD ==========
  const VCARD_DATA = {
    name: 'LPC Alerts',
    org: 'LPC Alerts',
    voiceNumber: '+19703858700',
    textNumber: '58339'
  };

  const generateVCard = () => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${VCARD_DATA.name}`,
      `ORG:${VCARD_DATA.org}`,
      `TEL;TYPE=VOICE:${VCARD_DATA.voiceNumber}`,
      `TEL;TYPE=MSG:${VCARD_DATA.textNumber}`,
      `NOTE:LPC alert system for La Plata County. Voice calls come from (970) 385-8700 and text messages come from 58339.`,
      'END:VCARD'
    ].join('\r\n');
    return vcard;
  };

  const downloadVCard = () => {
    const vcard = generateVCard();
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'LPC-Alerts.vcf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ========== DRILL BANNER INIT ==========
  const BANNER_ICONS = {
    'alert-triangle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'info': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    'megaphone': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>'
  };

  const initDrillBanner = async (elements, jsonUrl = 'drill-banner.json') => {
    const { siteBanner } = elements;
    if (!siteBanner) return;

    try {
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // If disabled, ensure banner is empty
      if (!data.enabled) {
        siteBanner.innerHTML = '';
        return;
      }

      // Build banner content
      const icon = BANNER_ICONS[data.icon] || BANNER_ICONS['alert-triangle'];
      const variantClass = data.variant ? `site-banner--${data.variant}` : '';
      
      siteBanner.className = `site-banner ${variantClass}`.trim();
      siteBanner.innerHTML = `
        <span class="site-banner-icon">${icon}</span>
        <span>${escHTML(data.message)}</span>
      `;

    } catch (err) {
      // Silently fail - banner just won't show
      console.warn('Drill banner not loaded:', err.message);
      siteBanner.innerHTML = '';
    }
  };

  // ========== SCROLL INDICATOR ==========
  const initScrollIndicator = () => {
    // Create the indicator element
    const indicator = document.createElement('div');
    indicator.className = 'scroll-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = `
      <span class="scroll-indicator-text">Scroll</span>
      <svg class="scroll-indicator-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M19 12l-7 7-7-7"/>
      </svg>
    `;
    document.body.appendChild(indicator);

    // Check if page has scrollable content
    const hasScrollableContent = () => {
      return document.documentElement.scrollHeight > window.innerHeight + 50;
    };

    // Check if user has scrolled past threshold
    const hasScrolled = () => {
      return window.scrollY > 100;
    };

    // Check if user is near the bottom of the page
    const isNearBottom = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const pageHeight = document.documentElement.scrollHeight;
      return scrollPosition >= pageHeight - 50; // Within 50px of bottom
    };

    // Update indicator visibility
    const updateVisibility = () => {
      if (hasScrollableContent() && !hasScrolled() && !isNearBottom()) {
        indicator.classList.add('is-visible');
      } else {
        indicator.classList.remove('is-visible');
      }
    };

    // Click to scroll down
    indicator.addEventListener('click', () => {
      window.scrollBy({
        top: window.innerHeight * 0.7,
        behavior: 'smooth'
      });
    });

    // Listen for scroll and resize
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateVisibility, 50);
    }, { passive: true });

    window.addEventListener('resize', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateVisibility, 100);
    }, { passive: true });

    // Initial check after a short delay (allows content to load)
    setTimeout(updateVisibility, 500);
  };

  // ========== BRAND COLORS (shared constants) ==========
  const BRAND = Object.freeze({
    blue: '#0b4da2',
    gray: '#64748b',
    grayLight: '#fafafa',
    text: '#000',
    textMuted: '#6e6e6e',
    border: 'rgba(0,0,0,0.15)',
    borderLight: 'rgba(0,0,0,0.08)'
  });

  // ========== EXPORT ==========
  global.ReadyLaPlata = {
    $,
    escHTML,
    escapeQuery,
    formatTimestamp,
    updateTimestamp,
    createChip,
    sortIncidents,
    getIncidentParam,
    initCoderedOverlay,
    initCallerIdOverlay,
    initDrillBanner,
    initAnnouncement,
    initScrollIndicator,
    downloadVCard,
    BRAND
  };

})(window);