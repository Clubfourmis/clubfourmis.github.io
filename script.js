/**
 * club fourmis — Chargement des 4 prochains ateliers depuis workshops.csv,
 * popup détail et accordéon FAQ (JavaScript pur)
 */

(() => {
  const DEFAULT_WORKSHOPS_LIMIT = 4;

  /**
   * Calcule la largeur de la ligne de points des titres afin que le dernier
   * point soit toujours entier même si le mot se termine avant.
   */
  function syncDottedHeadings() {
    const dotSize = 5;
    const step = 11;
    document.querySelectorAll('.dotted-heading').forEach((heading) => {
      const textWidth = heading.getBoundingClientRect().width;
      if (textWidth <= 0) return;
      const dotCount = Math.max(1, Math.ceil((textWidth - dotSize) / step) + 1);
      heading.style.setProperty('--dots-width', `${dotCount * step}px`);
      heading.style.setProperty('--dots-repeat', 'repeat-x');
    });
  }

  syncDottedHeadings();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncDottedHeadings);
  }
  window.addEventListener('resize', syncDottedHeadings);

  // Bascule mode nuit au clic sur le logo club fourmis
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const THEME_STORAGE_KEY = 'club-fourmis-night-mode';

  function applyNightMode(enabled) {
    document.documentElement.classList.toggle('night-mode', enabled);
    if (themeToggleBtn) {
      themeToggleBtn.setAttribute('aria-pressed', String(enabled));
      themeToggleBtn.setAttribute(
        'aria-label',
        enabled ? 'Désactiver le mode nuit' : 'Activer le mode nuit'
      );
    }
  }

  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === '1') {
      applyNightMode(true);
    }
  } catch {
    // Ignore si le stockage local est bloqué
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const next = !document.documentElement.classList.contains('night-mode');
      applyNightMode(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore si le stockage local est bloqué
      }
    });
  }

  /**
   * Affiche les images locales dès qu'elles existent,
   * sinon conserve le carré gris avec son libellé de repère.
   */
  function bindImageFallback(img) {
    const updateLoaded = () => {
      img.classList.remove('is-missing');
      img.classList.add('is-loaded');
    };
    const updateMissing = () => {
      img.classList.add('is-missing');
      img.classList.remove('is-loaded');
    };

    img.addEventListener('load', updateLoaded);
    img.addEventListener('error', updateMissing);

    if (img.getAttribute('src')) {
      if (img.complete) {
        if (img.naturalWidth > 0) updateLoaded();
        else updateMissing();
      }
    } else {
      updateMissing();
    }
  }

  document.querySelectorAll('.slot-img').forEach(bindImageFallback);

  /**
   * Normalise un nom de colonne (sans accents, minuscules, underscores).
   */
  function normalizeHeader(value) {
    return value
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_');
  }

  /**
   * Détecte automatiquement le séparateur CSV (';' pour Excel FR ou ',' standard).
   */
  function detectDelimiter(headerLine) {
    let semicolons = 0;
    let commas = 0;
    let inQuotes = false;

    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === ';') semicolons++;
        else if (ch === ',') commas++;
      }
    }

    return semicolons > commas ? ';' : ',';
  }

  /**
   * Parseur CSV complet gérant les guillemets, retours à la ligne internes et ';' / ','.
   */
  function parseCsv(text) {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstNewline = clean.indexOf('\n');
    const headerLine = firstNewline === -1 ? clean : clean.slice(0, firstNewline);
    const delimiter = detectDelimiter(headerLine);

    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];

      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((cols) => {
      const entry = {};
      headers.forEach((key, idx) => {
        if (key) entry[key] = cols[idx] ?? '';
      });
      return entry;
    });
  }

  /**
   * Analyse une date au format AAAA-MM-JJ ou JJ/MM/AAAA (ou JJ/MM/AA).
   * Retourne un objet Date local à minuit, ou null si la date n'est pas fixée.
   */
  function parseWorkshopDate(rawDate) {
    if (!rawDate) return null;
    const str = rawDate.trim();

    let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
      return null;
    }

    match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(str);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      let year = Number(match[3]);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
      return null;
    }

    return null;
  }

  const frenchDateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
  });

  function formatDisplayDate(dateObj, explicitLabel) {
    if (explicitLabel) return explicitLabel;
    if (!dateObj) return 'à venir...';
    return frenchDateFormatter.format(dateObj);
  }

  // Popup des cartes ateliers
  const modal = document.getElementById('workshopModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalImg = document.getElementById('modalImg');
  const modalPlaceholder = document.getElementById('modalPlaceholder');
  const modalDate = document.getElementById('modalDate');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = document.getElementById('modalMeta');
  const modalLocationLink = document.getElementById('modalLocationLink');
  const modalMetaSep = document.getElementById('modalMetaSep');
  const modalPrice = document.getElementById('modalPrice');
  const modalDesc = document.getElementById('modalDesc');
  const modalActions = document.getElementById('modalActions');
  const modalRegisterLink = document.getElementById('modalRegisterLink');

  let lastTrigger = null;

  function sanitizeExternalUrl(rawUrl) {
    if (!rawUrl) return '';
    const trimmed = rawUrl.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    return '';
  }

  function buildFallbackMailto(workshop) {
    const mailLink = document.getElementById('contactMailLink');
    const user = mailLink?.dataset.user || '';
    const domain = mailLink?.dataset.domain || '';
    if (!user || !domain) return '';
    const email = `${user}\u0040${domain}`;
    const subjectParts = [workshop.title, workshop.displayDate].filter(Boolean);
    const subject = encodeURIComponent(`Inscription atelier — ${subjectParts.join(' - ')}`);
    return `mailto:${email}?subject=${subject}`;
  }

  function openWorkshopModal(workshop, triggerBtn) {
    if (!modal || !modalImg || !modalPlaceholder || !modalDate || !modalTitle || !modalDesc) {
      return;
    }

    lastTrigger = triggerBtn;

    modalTitle.textContent = workshop.title;
    modalDesc.textContent = workshop.description;
    modalPlaceholder.textContent = workshop.placeholder;

    // Date et heure sur la même ligne
    const dateTimeParts = [workshop.displayDate, workshop.time].filter(Boolean);
    if (dateTimeParts.length > 0) {
      modalDate.textContent = dateTimeParts.join(' · ');
      modalDate.hidden = false;
    } else {
      modalDate.textContent = '';
      modalDate.hidden = true;
    }

    // Lieu (lien) et tarif
    if (modalMeta && modalLocationLink && modalMetaSep && modalPrice) {
      const hasLocation = Boolean(workshop.location);
      const hasPrice = Boolean(workshop.price);

      if (hasLocation) {
        const locationHref =
          sanitizeExternalUrl(workshop.locationUrl) ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(workshop.location)}`;
        modalLocationLink.textContent = workshop.location;
        modalLocationLink.href = locationHref;
        modalLocationLink.hidden = false;
      } else {
        modalLocationLink.textContent = '';
        modalLocationLink.removeAttribute('href');
        modalLocationLink.hidden = true;
      }

      if (hasPrice) {
        modalPrice.textContent = workshop.price;
        modalPrice.hidden = false;
      } else {
        modalPrice.textContent = '';
        modalPrice.hidden = true;
      }

      modalMetaSep.hidden = !(hasLocation && hasPrice);
      modalMeta.hidden = !(hasLocation || hasPrice);
    }

    // Lien d'inscription (URL du CSV ou mailto pré-rempli en repli)
    if (modalActions && modalRegisterLink) {
      const explicitRegisterUrl = sanitizeExternalUrl(workshop.registerUrl);
      const fallbackMailto = explicitRegisterUrl ? '' : buildFallbackMailto(workshop);
      const targetHref = explicitRegisterUrl || fallbackMailto;

      if (targetHref) {
        modalRegisterLink.href = targetHref;
        if (explicitRegisterUrl && !/^mailto:/i.test(explicitRegisterUrl)) {
          modalRegisterLink.target = '_blank';
          modalRegisterLink.rel = 'noopener noreferrer';
        } else {
          modalRegisterLink.removeAttribute('target');
          modalRegisterLink.removeAttribute('rel');
        }
        modalActions.hidden = false;
      } else {
        modalRegisterLink.removeAttribute('href');
        modalActions.hidden = true;
      }
    }

    modalImg.classList.remove('is-loaded', 'is-missing');
    modalImg.alt = workshop.displayDate
      ? `${workshop.title} — ${workshop.displayDate}`
      : workshop.title;

    if (modalImg.getAttribute('src') === workshop.image && modalImg.complete) {
      modalImg.classList.add(modalImg.naturalWidth > 0 ? 'is-loaded' : 'is-missing');
    } else {
      modalImg.src = workshop.image;
    }

    modal.hidden = false;
    document.body.classList.add('modal-open');
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  function closeWorkshopModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeWorkshopModal);
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeWorkshopModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeWorkshopModal();
    }
  });

  const CSV_CANDIDATES = ['workshops.csv', 'public/workshops.csv'];

  /**
   * Construit le DOM des 4 prochains ateliers à venir dans #workshopsGrid.
   */
  function renderWorkshops(workshops, emptyText = 'Prochains ateliers bientôt annoncés.') {
    const grid = document.getElementById('workshopsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (workshops.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'workshops-empty';
      emptyMsg.textContent = emptyText;
      grid.appendChild(emptyMsg);
      return;
    }

    const fragment = document.createDocumentFragment();

    workshops.forEach((workshop, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'workshop-card image-slot';

      const img = document.createElement('img');
      img.className = 'slot-img';
      img.src = workshop.image;
      img.alt = workshop.displayDate
        ? `Atelier ${workshop.title} — ${workshop.displayDate}`
        : `Atelier ${workshop.title}`;
      bindImageFallback(img);

      const placeholder = document.createElement('span');
      placeholder.className = 'slot-placeholder';
      placeholder.textContent = workshop.placeholder || `atelier ${index + 1}`;

      const dateEl = document.createElement('span');
      dateEl.className = 'workshop-date';
      dateEl.textContent = workshop.displayDate;

      const titleEl = document.createElement('span');
      titleEl.className = 'workshop-title';
      titleEl.textContent = workshop.title;

      card.appendChild(img);
      card.appendChild(placeholder);
      if (workshop.displayDate) card.appendChild(dateEl);
      card.appendChild(titleEl);

      card.addEventListener('click', () => openWorkshopModal(workshop, card));
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  }

  /**
   * Charge le premier fichier CSV accessible parmi CSV_CANDIDATES.
   */
  async function fetchFirstAvailableCsv() {
    for (const path of CSV_CANDIDATES) {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) continue;
        const text = await response.text();
        // Évite un fallback HTML (ex. page 404 SPA renvoyée en 200)
        if (/^\s*<!doctype|^\s*<html/i.test(text)) continue;
        return text;
      } catch {
        // Essaie le chemin suivant
      }
    }
    throw new Error('CSV_UNREACHABLE');
  }

  const workshopsActions = document.getElementById('workshopsActions');
  const workshopsMoreBtn = document.getElementById('workshopsMoreBtn');
  let allUpcomingWorkshops = [];
  let isWorkshopsExpanded = false;

  function updateWorkshopsView() {
    const visibleWorkshops = isWorkshopsExpanded
      ? allUpcomingWorkshops
      : allUpcomingWorkshops.slice(0, DEFAULT_WORKSHOPS_LIMIT);

    renderWorkshops(visibleWorkshops);

    if (workshopsActions && workshopsMoreBtn) {
      const hasMore = allUpcomingWorkshops.length > DEFAULT_WORKSHOPS_LIMIT;
      workshopsActions.hidden = !hasMore;
      workshopsMoreBtn.textContent = isWorkshopsExpanded ? 'afficher moins' : 'afficher plus';
      workshopsMoreBtn.setAttribute('aria-expanded', String(isWorkshopsExpanded));
    }
  }

  if (workshopsMoreBtn) {
    workshopsMoreBtn.addEventListener('click', () => {
      isWorkshopsExpanded = !isWorkshopsExpanded;
      updateWorkshopsView();
    });
  }

  /**
   * Charge workshops.csv, exclut les lignes sans date ou déjà passées,
   * trie par ordre chronologique et affiche 4 ateliers par défaut (+ bouton afficher plus).
   */
  async function loadUpcomingWorkshops() {
    try {
      const csvText = await fetchFirstAvailableCsv();
      const rawRows = parseCsv(csvText);

      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      allUpcomingWorkshops = rawRows
        .map((row) => {
          const title = row.titre || row.title || '';
          const rawDate = row.date || '';
          const parsedDate = parseWorkshopDate(rawDate);
          const explicitLabel = row.date_affichage || row.affichage_date || '';
          const image = row.image || '';
          const description = row.description || '';
          const time = row.horaire || row.heure || '';
          const location = row.lieu || '';
          const locationUrl =
            row.lien_lieu || row.url_lieu || row.lien_maps || row.maps || '';
          const price = row.prix || row.tarif || '';
          const registerUrl =
            row.lien_inscription ||
            row.inscription ||
            row.url_inscription ||
            row.billetterie ||
            row.reservation ||
            row.lien ||
            row.url ||
            '';

          return {
            title,
            parsedDate,
            displayDate: formatDisplayDate(
              parsedDate,
              explicitLabel || (!parsedDate && rawDate ? rawDate : '')
            ),
            image,
            placeholder: title || 'img',
            description,
            time,
            location,
            locationUrl,
            price,
            registerUrl,
          };
        })
        .filter((item) => {
          if (!item.title || !item.parsedDate) return false;
          return item.parsedDate.getTime() >= todayMidnight.getTime();
        })
        .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

      isWorkshopsExpanded = false;
      updateWorkshopsView();
    } catch {
      allUpcomingWorkshops = [];
      if (workshopsActions) workshopsActions.hidden = true;
      if (window.location.protocol === 'file:') {
        renderWorkshops(
          [],
          'Lecture de workshops.csv bloquée en local (file://). Ouvrez le site via un serveur local (ex. Live Server dans VS Code ou en ligne).'
        );
      } else {
        renderWorkshops([]);
      }
    }
  }

  loadUpcomingWorkshops();

  // Accordéon FAQ : ouvre / ferme la réponse sous chaque question
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answerId = btn.getAttribute('aria-controls');
      const answerEl = answerId ? document.getElementById(answerId) : null;
      if (!answerEl) return;

      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isExpanded));
      answerEl.hidden = isExpanded;
    });
  });

  // Protection anti-scraping : reconstruit l'adresse mail uniquement en JS
  const mailLink = document.getElementById('contactMailLink');
  if (mailLink) {
    const user = mailLink.dataset.user || '';
    const domain = mailLink.dataset.domain || '';
    if (user && domain) {
      const email = `${user}\u0040${domain}`;
      mailLink.textContent = email;

      const activateMailto = () => {
        mailLink.href = `mailto:${email}`;
      };

      mailLink.addEventListener('mouseenter', activateMailto, { once: true });
      mailLink.addEventListener('focus', activateMailto, { once: true });
      mailLink.addEventListener('touchstart', activateMailto, { once: true, passive: true });
      mailLink.addEventListener('click', activateMailto);
    }
  }
})();
