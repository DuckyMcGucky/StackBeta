/**
 * Stack — lasting life projects, ranked + researched with Grok.
 */

(() => {
  "use strict";

  const STORAGE_KEY = "stack.projects.v1";
  const META_KEY = "stack.meta.v1";
  const SETTINGS_KEY = "stack.settings.v1";

  /** @typedef {'home'|'yard'|'auto'|'finance'|'health'|'admin'|'creative'|'other'} Category */
  /**
   * @typedef {Object} Supply
   * @property {string} id
   * @property {string} name
   * @property {string} quantity
   * @property {number} unitCost
   * @property {string} store
   * @property {string} notes
   * @property {boolean} included  — count toward cost estimate
   * @property {boolean} acquired  — ticked off shopping list
   */
  /**
   * @typedef {Object} ProjectStep
   * @property {string} id
   * @property {string} text
   * @property {boolean} done
   */
  /**
   * @typedef {Object} Project
   * @property {string} id
   * @property {string} title
   * @property {string} notes
   * @property {string} summary
   * @property {number} estimatedCost
   * @property {number} estimatedHours
   * @property {Supply[]} supplies
   * @property {ProjectStep[]} steps
   * @property {number} importance
   * @property {number} urgency
   * @property {number} effort
   * @property {Category} category
   * @property {number} rank
   * @property {boolean} done
   * @property {boolean} researched
   * @property {number} createdAt
   * @property {number} updatedAt
   */

  const CATEGORY_LABELS = {
    home: "Home",
    yard: "Yard",
    auto: "Auto",
    finance: "Finance",
    health: "Health",
    admin: "Admin",
    creative: "Creative",
    other: "Other",
  };

  const PRESETS = {
    balanced: { importance: 35, urgency: 25, cost: 15, effort: 15, time: 10 },
    crisis: { importance: 25, urgency: 50, cost: 5, effort: 10, time: 10 },
    budget: { importance: 20, urgency: 15, cost: 40, effort: 15, time: 10 },
    momentum: { importance: 20, urgency: 15, cost: 15, effort: 25, time: 25 },
    /** Prefer short estimated hours over “easy feeling” effort alone */
    speed: { importance: 15, urgency: 20, cost: 10, effort: 15, time: 40 },
  };

  const DEFAULT_RESEARCH_CREDITS = 12;

  const RESEARCH_SYSTEM = `You are Grok, estimating a real homeowner DIY/hire project for the Stack backlog app.

Return ONLY valid JSON (no markdown fences) with this schema:
{
  "summary": "2-4 sentences: what the job involves, ballpark hours, and materials total",
  "estimatedHours": number,
  "hoursAssumptions": "1-3 sentences: skill level assumed, weather/access, whether dry time is included, DIY vs pro, etc.",
  "hoursBreakdown": [
    { "phase": "Prep / cleaning", "hours": number, "note": "why this many hours" },
    { "phase": "Main work", "hours": number, "note": "why" }
  ],
  "estimatedCost": number,
  "category": "home|yard|auto|finance|health|admin|creative|other",
  "importanceHint": 1-10,
  "urgencyHint": 1-10,
  "effortHint": 1-10,
  "steps": ["string — ordered actionable checklist, 4–10 steps, start with a tiny first action"],
  "tips": ["string"],
  "supplies": [
    {
      "name": "string",
      "quantityLabel": "string e.g. 10 gallons",
      "qty": number,
      "unitPrice": number,
      "lineTotal": number,
      "store": "string",
      "notes": "string optional"
    }
  ]
}

CRITICAL MONEY RULES (follow exactly):
1. unitPrice = USD price for ONE unit (e.g. one gallon costs 42 → unitPrice 42, not 4.2 or 0.42).
2. qty = how many of that unit to buy (whole numbers preferred; allow 0.5).
3. lineTotal MUST equal unitPrice × qty (e.g. 42 × 10 = 420). Never put only the unit price in lineTotal when qty > 1.
4. estimatedCost MUST equal the sum of every supplies[].lineTotal. Double-check the arithmetic before answering.
5. Use full dollar amounts (e.g. 600 not 6 for a six-hundred-dollar total). Prices are USD ballparks for US big-box stores 2025–2026.
6. If they already own an item, still list market price so they can uncheck it; mention ownership in notes.

CRITICAL HOURS RULES:
1. estimatedHours MUST equal the sum of hoursBreakdown[].hours.
2. Break work into concrete phases (prep, repairs, main install/paint coats, cleanup, buffer).
3. Prefer active work time for a competent DIY homeowner unless they hire out.
4. Call out drying/cure waits in hoursAssumptions if those dominate calendar time but are NOT counted as labor hours.
5. Be realistic from the brief (sq footage, coats, complexity) — not generic round numbers without reason.

RANKING HINTS (1–10, from the brief — not defaults unless the brief is truly vague):
- importanceHint = how much this matters long-term if ignored (safety, home value, daily life impact, cost of delay). 1–3 nice-to-have, 4–6 solid backlog item, 7–8 really should happen, 9–10 critical / major quality-of-life or damage risk.
- urgencyHint = how soon it needs attention (active leak, broken essential, deadline, season, worsening problem). 1–3 whenever, 4–6 this season/month, 7–8 soon, 9–10 ASAP / time-sensitive.
- effortHint = how heavy the job is for the person doing it (hours, skill, mess, multi-day). Align roughly with estimatedHours and complexity — not a flat 5. Quick fix 1–3, half-day–weekend 4–6, multi-day/hard DIY 7–9, major project 10.
- Use the user's own language as a signal ("must", "before winter", "annoying drip", "whole patio", "I've put this off"). Don't cluster everything at 5–6 when the brief gives clear cues.
- Skip-research / empty briefs aren't your job; for real briefs, pick intentional numbers that fit the story.

STEPS / CHECKLIST RULES:
1. steps is an ordered do-this-then-that guide to finish the project (not vague advice).
2. Prefer 4–10 steps. First step should be a tiny easy win (buy, measure, clear area, shut off power, etc.).
3. Each step is one concrete action a tired human can check off in a sitting when possible.
4. Order by real workflow (prep → materials → main work → cleanup/verify).
5. No fluff like "stay safe" alone — fold safety into the relevant action.

Other rules:
- Prefer durable mid-grade products when they ask for quality brands.
- Include prep materials when relevant (sealer, cleaner, primer, tape, tools).
- Keep the list practical, not padded.`;

  // ─── DOM ────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    list: $("#project-list"),
    empty: $("#empty-state"),
    statCount: $("#stat-count"),
    statCost: $("#stat-cost"),
    statTop: $("#stat-top"),
    showDone: $("#show-done"),
    toastRegion: $("#toast-region"),
    serverBanner: $("#server-banner"),
    dumpModal: $("#dump-modal"),
    dumpText: $("#dump-text"),
    dumpPreview: $("#dump-preview"),
    dumpCommit: $("#dump-commit"),
    wizardModal: $("#wizard-modal"),
    wizardTitle: $("#wizard-title"),
    wizardKicker: $("#wizard-kicker"),
    wizardSteps: $("#wizard-steps"),
    wizTitle: $("#wiz-title"),
    wizBrief: $("#wiz-brief"),
    researchStatus: $("#research-status"),
    researchError: $("#research-error"),
    researchActions: $("#research-actions"),
    researchTicks: $("#research-ticks"),
    findSummary: $("#find-summary"),
    findHours: $("#find-hours"),
    findTotal: $("#find-total"),
    findCategory: $("#find-category"),
    findImportance: $("#find-importance"),
    findUrgency: $("#find-urgency"),
    findEffort: $("#find-effort"),
    findImportanceVal: $("#find-importance-val"),
    findUrgencyVal: $("#find-urgency-val"),
    findEffortVal: $("#find-effort-val"),
    hoursExplain: $("#hours-explain"),
    hoursAssumptions: $("#hours-assumptions"),
    hoursBreakdown: $("#hours-breakdown"),
    stepsBody: $("#steps-body"),
    suppliesBody: $("#supplies-body"),
    suppliesTotal: $("#supplies-total"),
    editModal: $("#edit-modal"),
    editForm: $("#edit-form"),
    editId: $("#edit-id"),
    editTitle: $("#edit-title"),
    editNotes: $("#edit-notes"),
    editSummary: $("#edit-summary"),
    editCost: $("#edit-cost"),
    editHours: $("#edit-hours"),
    editCategory: $("#edit-category"),
    editSuppliesBody: $("#edit-supplies-body"),
    editImportance: $("#edit-importance"),
    editUrgency: $("#edit-urgency"),
    editEffort: $("#edit-effort"),
    editImportanceVal: $("#edit-importance-val"),
    editUrgencyVal: $("#edit-urgency-val"),
    editEffortVal: $("#edit-effort-val"),
    detailModal: $("#detail-modal"),
    detailTitle: $("#detail-title"),
    detailCategory: $("#detail-category"),
    detailBody: $("#detail-body"),
    confirmModal: $("#confirm-modal"),
    confirmMessage: $("#confirm-message"),
    confirmProjectName: $("#confirm-project-name"),
    confirmOk: $("#confirm-ok"),
    settingsModal: $("#settings-modal"),
    settingsApiKey: $("#settings-api-key"),
    settingsModel: $("#settings-model"),
    settingsStatus: $("#settings-status"),
    creditsModal: $("#credits-modal"),
    creditsModalBalance: $("#credits-modal-balance"),
    settingsCreditsBalance: $("#settings-credits-balance"),
    statCredits: $("#stat-credits"),
    statCreditsCard: $("#stat-credits-card"),
    wizardCreditsBar: $("#wizard-credits-bar"),
    wizardCreditsStatus: $("#wizard-credits-status"),
    wizardGetCredits: $("#wizard-get-credits"),
    prefFocusLimit: $("#pref-focus-limit"),
    prefTheme: $("#pref-theme"),
    prefCompact: $("#pref-compact"),
    prefReduceMotion: $("#pref-reduce-motion"),
    focusBanner: $("#focus-banner"),
    focusLimitLabel: $("#focus-limit-label"),
    focusHiddenCount: $("#focus-hidden-count"),
    btnFocusShowAll: $("#btn-focus-show-all"),
    rerankModal: $("#rerank-modal"),
    previewList: $("#preview-list"),
    weightSum: $("#weight-sum"),
    wImportance: $("#w-importance"),
    wUrgency: $("#w-urgency"),
    wCost: $("#w-cost"),
    wEffort: $("#w-effort"),
    wTime: $("#w-time"),
    wImportanceVal: $("#w-importance-val"),
    wUrgencyVal: $("#w-urgency-val"),
    wCostVal: $("#w-cost-val"),
    wEffortVal: $("#w-effort-val"),
    wTimeVal: $("#w-time-val"),
    fxLayer: $("#fx-layer"),
  };

  // ─── State ──────────────────────────────────────────────
  /** @type {Project[]} */
  let projects = [];
  /** @type {ReturnType<typeof defaultSettings>} */
  let settings = {
    apiKey: "",
    model: "grok-4-1-fast-reasoning",
    focusLimit: 0,
    theme: "ember",
    compactCards: false,
    reduceMotion: false,
    researchCredits: DEFAULT_RESEARCH_CREDITS,
  };
  let sortMode = "manual";
  /** When true, disk store via local server is source of truth */
  let fileStoreEnabled = false;
  let saveTimer = null;
  /** @type {null | {
   *   id: string,
   *   li: HTMLElement,
   *   placeholder: HTMLElement,
   *   offsetX: number,
   *   offsetY: number,
   *   width: number,
   *   height: number,
   *   moved: boolean,
   *   pointerId: number
   * }} */
  let dragState = null;
  let detailProjectId = null;
  /** When set, wizard research/approve updates this project instead of creating one */
  let researchTargetId = null;
  let researchAbort = null;
  let tickTimer = null;

  /** Wizard draft */
  let wiz = {
    step: "name",
    title: "",
    brief: "",
    /** @type {Supply[]} */
    supplies: [],
    /** @type {ProjectStep[]} */
    steps: [],
    summary: "",
    estimatedHours: 0,
    estimatedCost: 0,
    hoursAssumptions: "",
    /** @type {{phase:string,hours:number,note:string}[]} */
    hoursBreakdown: [],
    category: "home",
    importance: 5,
    urgency: 5,
    effort: 5,
    skippedResearch: false,
  };

  /** Edit draft supplies */
  let editSupplies = [];

  // ─── Persistence ────────────────────────────────────────
  const THEMES = ["ember", "ocean", "forest", "violet", "slate"];
  const FOCUS_LIMITS = [0, 1, 3, 5];

  function defaultSettings() {
    return {
      apiKey: "",
      model: "grok-4-1-fast-reasoning",
      focusLimit: 0,
      theme: "ember",
      compactCards: false,
      reduceMotion: false,
      researchCredits: DEFAULT_RESEARCH_CREDITS,
    };
  }

  function normalizeSettingsObject(s) {
    const base = defaultSettings();
    if (!s || typeof s !== "object") return base;
    const theme = THEMES.includes(s.theme) ? s.theme : base.theme;
    const focusLimit = FOCUS_LIMITS.includes(Number(s.focusLimit))
      ? Number(s.focusLimit)
      : base.focusLimit;
    const creditsRaw = Number(s.researchCredits);
    const researchCredits = Number.isFinite(creditsRaw)
      ? Math.max(0, Math.min(99999, Math.floor(creditsRaw)))
      : base.researchCredits;
    return {
      apiKey: String(s.apiKey || ""),
      model: String(s.model || base.model),
      focusLimit,
      theme,
      compactCards: Boolean(s.compactCards),
      reduceMotion: Boolean(s.reduceMotion),
      researchCredits,
    };
  }

  function loadProjectsFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.map(normalizeProject).sort((a, b) => a.rank - b.rank);
    } catch {
      return null;
    }
  }

  function loadMetaFromLocal() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function loadSettingsFromLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return normalizeSettingsObject(s);
    } catch {
      return defaultSettings();
    }
  }

  function writeLocalCache() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      localStorage.setItem(
        META_KEY,
        JSON.stringify({ sortMode, updatedAt: Date.now() })
      );
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* private mode / quota */
    }
  }

  async function probeFileStore() {
    if (!location.protocol.startsWith("http")) return false;
    try {
      const res = await fetch(`${location.origin}/api/health`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.ok && data.fileStore);
    } catch {
      return false;
    }
  }

  async function fetchDiskStore() {
    const res = await fetch(`${location.origin}/api/store`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("store fetch failed");
    return res.json();
  }

  async function persistDiskStore() {
    if (!fileStoreEnabled) return;
    const res = await fetch(`${location.origin}/api/store`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projects,
        settings,
        meta: { sortMode, updatedAt: Date.now() },
      }),
    });
    if (!res.ok) {
      console.warn("Stack: disk save failed", await res.text());
    }
  }

  function scheduleDiskSave() {
    if (!fileStoreEnabled) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistDiskStore().catch((err) =>
        console.warn("Stack: disk save error", err)
      );
    }, 100);
  }

  /**
   * Load projects/settings. Prefers disk store (desktop / local server),
   * migrates browser localStorage once, falls back to demo seed.
   */
  async function hydrateStore() {
    fileStoreEnabled = await probeFileStore();

    if (fileStoreEnabled) {
      try {
        const disk = await fetchDiskStore();

        // Disk already initialized (including intentionally empty stack)
        if (Array.isArray(disk.projects) && Number(disk.updatedAt) > 0) {
          projects = disk.projects
            .map(normalizeProject)
            .sort((a, b) => a.rank - b.rank);
          settings = normalizeSettingsObject(disk.settings);
          sortMode = disk.meta?.sortMode || "manual";
          writeLocalCache();
          return;
        }

        // No disk data yet — migrate browser cache if present
        const localProjects = loadProjectsFromLocal();
        if (localProjects && localProjects.length) {
          projects = localProjects;
          settings = loadSettingsFromLocal();
          sortMode = loadMetaFromLocal().sortMode || "manual";
          await persistDiskStore();
          writeLocalCache();
          return;
        }

        // First run ever
        projects = seedProjects();
        settings = defaultSettings();
        sortMode = "manual";
        await persistDiskStore();
        writeLocalCache();
        return;
      } catch (err) {
        console.warn("Stack: file store unavailable, using local cache", err);
        fileStoreEnabled = false;
      }
    }

    const localProjects = loadProjectsFromLocal();
    if (localProjects) {
      projects = localProjects;
    } else {
      projects = seedProjects();
    }
    settings = loadSettingsFromLocal();
    sortMode = loadMetaFromLocal().sortMode || "manual";
    writeLocalCache();
  }

  function saveSettings() {
    writeLocalCache();
    scheduleDiskSave();
  }

  /** Apply visual prefs to the document (theme, motion, density). */
  function applyPreferences(prefs = settings) {
    const theme = THEMES.includes(prefs.theme) ? prefs.theme : "ember";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.reduceMotion = prefs.reduceMotion
      ? "1"
      : "0";
    document.body.classList.toggle("compact-cards", !!prefs.compactCards);
  }

  function save() {
    writeLocalCache();
    scheduleDiskSave();
  }

  function parseQty(value, fallback = 1) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    if (typeof value === "string") {
      const m = value.match(/(\d+(?:\.\d+)?)/);
      if (m) return Math.max(0, Number(m[1]) || fallback);
    }
    return fallback;
  }

  function normalizeStep(s, index = 0) {
    if (typeof s === "string") {
      return {
        id: uid(),
        text: s.trim().slice(0, 240),
        done: false,
      };
    }
    return {
      id: String(s.id || uid()),
      text: String(s.text || s.title || s.step || `Step ${index + 1}`).slice(
        0,
        240
      ),
      done: Boolean(s.done),
    };
  }

  function normalizeSteps(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((s, i) => normalizeStep(s, i))
      .filter((s) => s.text.trim().length > 0);
  }

  function getNextStep(project) {
    return (project.steps || []).find((s) => !s.done) || null;
  }

  function stepProgress(project) {
    const steps = project.steps || [];
    const done = steps.filter((s) => s.done).length;
    return { done, total: steps.length };
  }

  function normalizeSupply(s) {
    const qty = parseQty(s.qty ?? s.quantity, 1);
    const unitPrice = Math.max(
      0,
      Number(s.unitPrice ?? s.unit_price ?? s.price) || 0
    );
    // Prefer explicit lineTotal; else unitPrice * qty; else legacy unitCost as line total
    let lineTotal = Number(s.lineTotal ?? s.line_total);
    if (!Number.isFinite(lineTotal) || lineTotal < 0) {
      if (unitPrice > 0) lineTotal = unitPrice * qty;
      else lineTotal = Math.max(0, Number(s.unitCost) || 0);
    }
    // If model put unit price in unitCost and qty>1 without multiplying, detect & fix:
    // when unitPrice missing but unitCost * qty is much closer to estimated scale
    const legacyUnit = Math.max(0, Number(s.unitCost) || 0);
    if (!s.lineTotal && !s.unitPrice && legacyUnit > 0 && qty > 1) {
      // unitCost was often "per unit" — prefer product
      lineTotal = legacyUnit * qty;
    }

    const quantityLabel = String(
      s.quantityLabel || s.quantity || (qty === 1 ? "1" : String(qty))
    ).slice(0, 80);

    const resolvedUnitPrice =
      unitPrice > 0 ? unitPrice : qty > 0 ? lineTotal / qty : lineTotal;

    return {
      id: String(s.id || uid()),
      name: String(s.name || "Item").slice(0, 160),
      quantity: quantityLabel,
      qty: qty,
      unitPrice: Math.round(resolvedUnitPrice * 100) / 100,
      unitCost: Math.round(lineTotal * 100) / 100, // stored line total
      store: String(s.store || "").slice(0, 80),
      notes: String(s.notes || "").slice(0, 200),
      included: s.included !== false,
      acquired: Boolean(s.acquired),
    };
  }

  function supplyProgress(project) {
    const needed = (project.supplies || []).filter((s) => s.included);
    const got = needed.filter((s) => s.acquired).length;
    return { got, total: needed.length };
  }

  function normalizeProject(p) {
    const supplies = Array.isArray(p.supplies)
      ? p.supplies.map(normalizeSupply)
      : [];
    const hoursBreakdown = Array.isArray(p.hoursBreakdown)
      ? p.hoursBreakdown
          .map((h) => ({
            phase: String(h.phase || "Phase").slice(0, 80),
            hours: Math.max(0, Number(h.hours) || 0),
            note: String(h.note || "").slice(0, 240),
          }))
          .filter((h) => h.hours > 0 || h.phase)
      : [];
    const steps = normalizeSteps(p.steps);
    return {
      id: String(p.id || uid()),
      title: String(p.title || "Untitled").slice(0, 120),
      notes: String(p.notes || "").slice(0, 4000),
      summary: String(p.summary || "").slice(0, 2000),
      estimatedCost: Math.max(0, Number(p.estimatedCost) || 0),
      estimatedHours: Math.max(0, Number(p.estimatedHours) || 0),
      hoursAssumptions: String(p.hoursAssumptions || "").slice(0, 800),
      hoursBreakdown,
      supplies,
      steps,
      importance: clamp(Number(p.importance) || 5, 1, 10),
      urgency: clamp(Number(p.urgency) || 5, 1, 10),
      effort: clamp(Number(p.effort) || 5, 1, 10),
      category: CATEGORY_LABELS[p.category] ? p.category : "other",
      rank: Math.max(1, Number(p.rank) || 1),
      done: Boolean(p.done),
      researched: Boolean(p.researched) || supplies.length > 0 || Boolean(p.summary),
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    };
  }

  function seedProjects() {
    const now = Date.now();
    const seeds = [
      {
        title: "Repaint the patio",
        notes:
          "1,500 sqft around a pool. White main + salmon trim. DIY. Seal hairline cracks first. Prefer durable Lowe's / Sherwin-Williams.",
        estimatedCost: 420,
        estimatedHours: 28,
        importance: 7,
        urgency: 4,
        effort: 7,
        category: "yard",
        summary:
          "DIY concrete patio recoating: prep cracks, prime, two-tone finish. Ballpark ~28 hours and ~$420 in materials.",
        researched: true,
        steps: [
          "Measure patio and sketch white field vs salmon trim zones",
          "Buy sealer, primer, paint, and roller kit",
          "Clear furniture and sweep/degrease surface",
          "Seal hairline cracks and let cure",
          "Apply bonding primer",
          "Paint white field (two coats)",
          "Paint salmon trim around pool",
          "Cleanup tools and reinstall furniture after cure",
        ],
        supplies: [
          {
            name: "Concrete crack sealer",
            quantity: "2 tubes",
            unitCost: 14,
            store: "Lowe's",
            included: true,
          },
          {
            name: "Concrete primer / bonding agent",
            quantity: "2 gal",
            unitCost: 38,
            store: "Lowe's",
            included: true,
          },
          {
            name: "Exterior concrete paint — white",
            quantity: "10 gal",
            unitCost: 220,
            store: "Lowe's",
            included: true,
          },
          {
            name: "Exterior concrete paint — salmon trim",
            quantity: "3 gal",
            unitCost: 72,
            store: "Lowe's",
            included: true,
          },
          {
            name: "Rollers, trays, tape, brushes kit",
            quantity: "1",
            unitCost: 45,
            store: "Lowe's",
            included: true,
          },
        ],
      },
      {
        title: "Fix pool light",
        notes: "Niche light is out — check gasket, replace bulb or fixture.",
        estimatedCost: 95,
        importance: 6,
        urgency: 8,
        effort: 4,
        category: "yard",
      },
      {
        title: "Replace kitchen faucet",
        notes: "Dripping at night. Measure spread before buying.",
        estimatedCost: 140,
        importance: 5,
        urgency: 6,
        effort: 3,
        category: "home",
      },
    ];

    return seeds.map((s, i) =>
      normalizeProject({
        ...s,
        id: uid(),
        rank: i + 1,
        done: false,
        createdAt: now - i * 1000,
        updatedAt: now - i * 1000,
      })
    );
  }

  // ─── Helpers ────────────────────────────────────────────
  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function formatMoney(n, digits = 0) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(Number(n) || 0);
  }

  function supplyLineTotal(s) {
    // unitCost stores line total; recompute from unitPrice × qty when available
    const qty = parseQty(s.qty ?? s.quantity, 1);
    const unitPrice = Math.max(0, Number(s.unitPrice) || 0);
    if (unitPrice > 0) return Math.round(unitPrice * qty * 100) / 100;
    return Math.max(0, Number(s.unitCost) || 0);
  }

  function suppliesIncludedTotal(list) {
    return list
      .filter((s) => s.included)
      .reduce((sum, s) => sum + supplyLineTotal(s), 0);
  }

  function activeProjects() {
    return projects.filter((p) => !p.done).sort((a, b) => a.rank - b.rank);
  }

  function visibleProjects() {
    const showDone = els.showDone.checked;
    let list = projects
      .filter((p) => showDone || !p.done)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.rank - b.rank;
      });

    const limit = Number(settings.focusLimit) || 0;
    if (limit > 0) {
      const active = list.filter((p) => !p.done);
      const done = list.filter((p) => p.done);
      list = [...active.slice(0, limit), ...(showDone ? done : [])];
    }
    return list;
  }

  function focusHiddenCount() {
    const limit = Number(settings.focusLimit) || 0;
    if (limit <= 0) return 0;
    return Math.max(0, activeProjects().length - limit);
  }

  function updateFocusBanner() {
    if (!els.focusBanner) return;
    const limit = Number(settings.focusLimit) || 0;
    const hidden = focusHiddenCount();
    const show = limit > 0 && hidden > 0;
    els.focusBanner.hidden = !show;
    if (els.focusLimitLabel) els.focusLimitLabel.textContent = String(limit);
    if (els.focusHiddenCount) els.focusHiddenCount.textContent = String(hidden);
  }

  function renumberRanks() {
    const active = projects.filter((p) => !p.done).sort((a, b) => a.rank - b.rank);
    active.forEach((p, i) => {
      p.rank = i + 1;
    });
    const done = projects.filter((p) => p.done);
    done.forEach((p, i) => {
      p.rank = active.length + i + 1;
    });
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    els.toastRegion.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  function isLocalServer() {
    return location.protocol.startsWith("http") && location.port === "3847";
  }

  // ─── Scoring / Rerank ───────────────────────────────────
  const WEIGHT_KEYS = ["importance", "urgency", "cost", "effort", "time"];
  /** @type {Record<string, boolean>} */
  let weightLocks = {
    importance: false,
    urgency: false,
    cost: false,
    effort: false,
    time: false,
  };

  function getWeights() {
    return {
      importance: Number(els.wImportance.value) || 0,
      urgency: Number(els.wUrgency.value) || 0,
      cost: Number(els.wCost.value) || 0,
      effort: Number(els.wEffort.value) || 0,
      time: Number(els.wTime?.value) || 0,
    };
  }

  function setWeightInputs(w) {
    els.wImportance.value = String(Math.round(w.importance));
    els.wUrgency.value = String(Math.round(w.urgency));
    els.wCost.value = String(Math.round(w.cost));
    els.wEffort.value = String(Math.round(w.effort));
    if (els.wTime) els.wTime.value = String(Math.round(w.time || 0));
  }

  function lockedSum(exceptKey = null) {
    return WEIGHT_KEYS.reduce((s, k) => {
      if (k === exceptKey) return s;
      if (!weightLocks[k]) return s;
      return s + (Number(WEIGHT_EL_VALUE(k)) || 0);
    }, 0);
  }

  function WEIGHT_EL_VALUE(key) {
    const map = {
      importance: els.wImportance,
      urgency: els.wUrgency,
      cost: els.wCost,
      effort: els.wEffort,
      time: els.wTime,
    };
    return map[key]?.value;
  }

  function unlockedKeys(exceptKey = null) {
    return WEIGHT_KEYS.filter((k) => k !== exceptKey && !weightLocks[k]);
  }

  /**
   * Keep weights at 100%. Locked criteria never change when others move.
   * Moving a slider only redistributes among unlocked peers.
   */
  function redistributeWeights(changedKey, rawValue) {
    const current = getWeights();
    const lockedOthers = lockedSum(changedKey);
    const maxForChanged = 100 - lockedOthers;
    let next = Math.max(0, Math.min(100, Math.round(Number(rawValue) || 0)));
    next = Math.min(next, maxForChanged);

    const updated = { ...current, [changedKey]: next };
    const pool = unlockedKeys(changedKey);
    const remaining = 100 - next - lockedOthers;

    // Preserve locked values exactly
    WEIGHT_KEYS.forEach((k) => {
      if (k !== changedKey && weightLocks[k]) {
        updated[k] = current[k];
      }
    });

    if (pool.length === 0) {
      // Everything else locked — changed key takes whatever is left
      updated[changedKey] = Math.max(0, 100 - lockedOthers);
      setWeightInputs(updated);
      return;
    }

    if (remaining <= 0) {
      pool.forEach((k) => {
        updated[k] = 0;
      });
    } else {
      const poolSum = pool.reduce((s, k) => s + current[k], 0);
      if (poolSum <= 0) {
        const base = Math.floor(remaining / pool.length);
        let leftover = remaining - base * pool.length;
        pool.forEach((k) => {
          updated[k] = base + (leftover > 0 ? 1 : 0);
          if (leftover > 0) leftover -= 1;
        });
      } else {
        let assigned = 0;
        pool.forEach((k, i) => {
          if (i === pool.length - 1) {
            updated[k] = Math.max(0, remaining - assigned);
          } else {
            const share = Math.round((current[k] / poolSum) * remaining);
            updated[k] = share;
            assigned += share;
          }
        });
        const sumPool = pool.reduce((s, k) => s + updated[k], 0);
        const drift = remaining - sumPool;
        if (drift !== 0) {
          const adjustKey =
            pool.find((k) => updated[k] + drift >= 0) || pool[0];
          updated[adjustKey] = Math.max(0, updated[adjustKey] + drift);
        }
      }
    }

    // Exact 100 safety (prefer adjusting the unlocked pool, not locks)
    const total = WEIGHT_KEYS.reduce((s, k) => s + (updated[k] || 0), 0);
    if (total !== 100) {
      const fixPool = pool.length ? pool : [changedKey];
      const fixKey = fixPool[fixPool.length - 1];
      updated[fixKey] = Math.max(0, updated[fixKey] + (100 - total));
    }

    setWeightInputs(updated);
  }

  function weightSumOf(w) {
    return WEIGHT_KEYS.reduce((s, k) => s + (Number(w[k]) || 0), 0);
  }

  function normalizeWeightsTo100() {
    const w = getWeights();
    const sum = weightSumOf(w);
    if (sum === 100) return;
    if (sum <= 0) {
      setWeightInputs({ ...PRESETS.balanced });
      return;
    }
    const scaled = {};
    WEIGHT_KEYS.forEach((k) => {
      scaled[k] = Math.round((w[k] / sum) * 100);
    });
    // Fix rounding drift on the last key
    const drift =
      100 - WEIGHT_KEYS.reduce((s, k) => s + scaled[k], 0);
    scaled.time = Math.max(0, (scaled.time || 0) + drift);
    setWeightInputs(scaled);
  }

  function syncLockButtons() {
    $$("[data-lock]").forEach((btn) => {
      const key = btn.dataset.lock;
      const on = Boolean(weightLocks[key]);
      btn.classList.toggle("is-locked", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const label = key.replace(/([A-Z])/g, " $1").toLowerCase();
      btn.title = on ? `Unlock ${label}` : `Lock ${label}`;
      btn.setAttribute("aria-label", btn.title);

      const row = btn.closest(".weight-row");
      if (row) row.classList.toggle("is-locked", on);
    });
  }

  function toggleWeightLock(key) {
    if (!WEIGHT_KEYS.includes(key)) return;
    const willLock = !weightLocks[key];
    if (willLock) {
      const othersLocked = lockedSum(key);
      if (othersLocked >= 100) {
        toast("Unlock another criterion first");
        return;
      }
    }
    weightLocks[key] = willLock;

    const btn = $(`[data-lock="${key}"]`);
    if (btn) {
      // Fast snap animation when locking (and a softer pop when unlocking)
      btn.classList.remove("is-locking", "is-unlocking");
      void btn.offsetWidth;
      btn.classList.add(willLock ? "is-locking" : "is-unlocking");
      setTimeout(() => {
        btn.classList.remove("is-locking", "is-unlocking");
      }, willLock ? 280 : 200);
    }

    syncLockButtons();
  }

  function clearWeightLocks() {
    WEIGHT_KEYS.forEach((k) => {
      weightLocks[k] = false;
    });
    syncLockButtons();
  }

  function scoreProject(project, weights, costMax, hoursMax) {
    const wSum = weightSumOf(weights) || 1;
    const imp = (project.importance - 1) / 9;
    const urg = (project.urgency - 1) / 9;
    const costScore = costMax <= 0 ? 1 : 1 - project.estimatedCost / costMax;
    const effortScore = 1 - (project.effort - 1) / 9;
    // Lower estimated hours = higher score (fast finish). Unknown/0 hours → mid score.
    const hours = Math.max(0, Number(project.estimatedHours) || 0);
    const timeScore =
      hoursMax <= 0
        ? 0.5
        : hours <= 0
          ? 0.55
          : 1 - hours / hoursMax;
    const raw =
      (weights.importance / wSum) * imp +
      (weights.urgency / wSum) * urg +
      (weights.cost / wSum) * costScore +
      (weights.effort / wSum) * effortScore +
      ((weights.time || 0) / wSum) * timeScore;
    return raw * 100;
  }

  function computeRankedOrder(weights) {
    const pool = activeProjects();
    if (pool.length === 0) return [];
    const costMax = Math.max(...pool.map((p) => p.estimatedCost), 1);
    const hoursMax = Math.max(
      ...pool.map((p) => Math.max(0, Number(p.estimatedHours) || 0)),
      1
    );
    return pool
      .map((p) => ({
        project: p,
        score: scoreProject(p, weights, costMax, hoursMax),
      }))
      .sort((a, b) => b.score - a.score || a.project.rank - b.project.rank);
  }

  // ─── Juice helpers ──────────────────────────────────────
  function spawnRipple(e, el) {
    if (!el || el.disabled) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  function spawnSparks(x, y, { count = 12, green = false } = {}) {
    if (!els.fxLayer) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      s.className = green ? "spark green" : "spark";
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 28 + Math.random() * 48;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      els.fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 750);
    }
  }

  function animateNumber(el, to, { money = false, duration = 500 } = {}) {
    if (!el) return;
    const from = money
      ? Number(String(el.dataset.raw || 0))
      : Number(String(el.dataset.raw || el.textContent).replace(/[^\d.-]/g, "")) || 0;
    const target = Number(to) || 0;
    el.dataset.raw = String(target);
    if (from === target) {
      el.textContent = money ? formatMoney(target) : String(target);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (target - from) * eased;
      el.textContent = money
        ? formatMoney(Math.round(val))
        : String(Math.round(val));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ─── Render list ────────────────────────────────────────
  function render() {
    renumberRanks();
    save();
    renderStats();
    renderList();
  }

  function renderStats() {
    const active = activeProjects();
    const total = active.reduce((s, p) => s + p.estimatedCost, 0);
    animateNumber(els.statCount, active.length);
    animateNumber(els.statCost, total, { money: true });
    els.statTop.textContent = active[0]?.title || "—";
    els.statTop.title = active[0]?.title || "";
    syncCreditsBalanceUI();
  }

  function renderList() {
    const items = visibleProjects();
    els.list.innerHTML = "";
    // Don't show "empty stack" when focus mode is just hiding projects
    const trulyEmpty = projects.filter((p) => !p.done).length === 0;
    els.empty.hidden = items.length > 0 || !trulyEmpty;
    updateFocusBanner();
    items.forEach((project, index) => {
      els.list.appendChild(createCard(project, index));
    });
    requestAnimationFrame(() => {
      $$(".meter-fill", els.list).forEach((fill) => {
        fill.style.width = fill.dataset.value + "%";
      });
    });
  }

  function createCard(project, index) {
    const li = document.createElement("li");
    li.className = "project-card entering";
    if (project.done) li.classList.add("is-done");
    if (!project.done && project.rank === 1) li.classList.add("top-rank");
    li.dataset.id = project.id;
    li.dataset.rank = String(project.rank);
    li.draggable = false;
    li.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
    // Entrance animation uses transform + fill-mode; clear it when done
    // so later drag FLIP slides can own transform.
    li.addEventListener(
      "animationend",
      (ev) => {
        if (ev.animationName && ev.animationName !== "card-in") return;
        li.classList.remove("entering");
        li.style.animation = "none";
        li.style.animationDelay = "";
      },
      { once: true }
    );

    const costClass = project.estimatedCost > 0 ? "cost" : "cost zero";
    const costText =
      project.estimatedCost > 0
        ? formatMoney(project.estimatedCost)
        : "No cost";
    const supplyProg = supplyProgress(project);

    li.innerHTML = `
      <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
        <span></span><span></span><span></span>
      </div>
      <div class="rank-badge" title="Rank ${project.rank}">${
        project.done ? "✓" : project.rank
      }</div>
      <div class="project-main">
        <div class="project-title-row">
          <h3 class="project-title"></h3>
          <span class="category-pill"></span>
        </div>
        <p class="project-notes"></p>
        <div class="meta-row"></div>
        <div class="meters">
          <div class="meter">
            <div class="meter-label"><span>Importance</span><span>${project.importance}/10</span></div>
            <div class="meter-track"><div class="meter-fill importance" data-value="${project.importance * 10}"></div></div>
          </div>
          <div class="meter">
            <div class="meter-label"><span>Urgency</span><span>${project.urgency}/10</span></div>
            <div class="meter-track"><div class="meter-fill urgency" data-value="${project.urgency * 10}"></div></div>
          </div>
          <div class="meter">
            <div class="meter-label"><span>Effort</span><span>${project.effort}/10</span></div>
            <div class="meter-track"><div class="meter-fill effort" data-value="${project.effort * 10}"></div></div>
          </div>
        </div>
      </div>
      <div class="project-side">
        <div class="${costClass}">${costText}</div>
        <div class="card-actions">
          <button type="button" class="icon-btn done-btn" data-action="toggle-done" title="${
            project.done ? "Mark active" : "Mark done"
          }" aria-label="${project.done ? "Mark active" : "Mark done"}">
            ${
              project.done
                ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.25"/></svg>`
            }
          </button>
          <button type="button" class="icon-btn" data-action="edit" title="Edit" aria-label="Edit project">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete project">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;

    $(".project-title", li).textContent = project.title;
    $(".category-pill", li).textContent =
      CATEGORY_LABELS[project.category] || "Other";

    const notesEl = $(".project-notes", li);
    const preview = project.summary || project.notes;
    if (preview) {
      notesEl.textContent = preview;
    } else {
      notesEl.remove();
    }

    const meta = $(".meta-row", li);
    if (project.researched) {
      const chip = document.createElement("span");
      chip.className = "meta-chip researched";
      chip.textContent = "Grok researched";
      meta.appendChild(chip);
    } else if (!project.done) {
      const chip = document.createElement("span");
      chip.className = "meta-chip needs-research";
      chip.textContent = "Needs research";
      meta.appendChild(chip);
    }
    if (project.estimatedHours > 0) {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = `~${project.estimatedHours} hrs`;
      meta.appendChild(chip);
    }
    if (supplyProg.total > 0) {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent =
        supplyProg.got > 0
          ? `${supplyProg.got}/${supplyProg.total} supplies`
          : `${supplyProg.total} supplies`;
      meta.appendChild(chip);
    }
    const prog = stepProgress(project);
    if (prog.total > 0) {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = `${prog.done}/${prog.total} steps`;
      meta.appendChild(chip);
    }
    if (!meta.children.length) meta.remove();

    const next = !project.done ? getNextStep(project) : null;
    if (next) {
      const nextEl = document.createElement("p");
      nextEl.className = "next-step-line";
      nextEl.innerHTML = `<span class="next-step-label">Next</span> `;
      const text = document.createElement("span");
      text.className = "next-step-text";
      text.textContent = next.text;
      nextEl.appendChild(text);
      const main = $(".project-main", li);
      const meters = $(".meters", li);
      if (main && meters) main.insertBefore(nextEl, meters);
      else if (main) main.appendChild(nextEl);
    }

    li.addEventListener("pointermove", (e) => {
      const r = li.getBoundingClientRect();
      li.style.setProperty("--mx", `${e.clientX - r.left}px`);
      li.style.setProperty("--my", `${e.clientY - r.top}px`);
    });

    li.addEventListener("click", (e) => {
      // Swallow only the synthetic click that follows a drag on THIS card
      if (
        dragState?.moved ||
        li.dataset.suppressClick === "1" ||
        li.classList.contains("is-dragging") ||
        li.classList.contains("is-dropping")
      ) {
        e.preventDefault();
        e.stopPropagation();
        li.dataset.suppressClick = "";
        return;
      }
      const btn = e.target.closest("[data-action]");
      if (btn) {
        e.stopPropagation();
        spawnRipple(e, btn);
        const action = btn.dataset.action;
        if (action === "edit") openEditModal(project, btn);
        if (action === "delete") deleteProject(project.id, e);
        if (action === "toggle-done") {
          toggleDone(project.id);
        }
        return;
      }
      openDetailModal(project, li);
    });

    // Drag from anywhere on the card (buttons excluded). Small move
    // threshold keeps tap-to-open-detail snappy.
    if (!project.done) {
      li.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest("[data-action]")) return;
        armListDrag(e, li);
      });
    }

    return li;
  }

  // ─── Smooth list drag (vertical only, stable iOS-style) ─
  //
  // Stability rules that stop "spazzing":
  // 1. Only swap with the immediate neighbor of the gap (one step at a time)
  // 2. Require ≥50% surface cover AND drag-center past the neighbor's midline
  // 3. Ignore further swaps until the current slide animation finishes
  //
  // Touch / pen: long-press ~500ms to lift (so pan-y scroll works on iPhone).
  // Mouse: small move threshold (desktop UX).
  //
  /** Pending press that becomes a drag after long-press or move threshold. */
  let dragArm = null;
  const TOUCH_LONG_PRESS_MS = 500;
  const TOUCH_CANCEL_MOVE_PX = 12;
  const MOUSE_DRAG_MOVE_PX = 6;

  /**
   * Block only the browser's synthetic click right after a drag release.
   * One-shot + same-turn cleanup so the next real click still works.
   */
  function suppressGhostClickAfterDrag(li) {
    if (li) li.dataset.suppressClick = "1";

    const kill = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener("click", kill, true);
      if (li?.dataset?.suppressClick === "1") {
        li.dataset.suppressClick = "";
      }
    };

    document.addEventListener("click", kill, true);
    // Ghost click (if any) is dispatched right after pointerup handlers.
    // Clear on next task so we never eat a later intentional click.
    setTimeout(cleanup, 0);
  }

  function onSelectStartWhileArming(e) {
    // Kill iOS/Android blue text-selection during long-press reorder
    if (dragArm?.touchLike || dragState || document.body.classList.contains("is-dragging-card")) {
      e.preventDefault();
    }
  }

  function armListDrag(e, li) {
    if (
      dragState ||
      dragArm ||
      li.classList.contains("is-done") ||
      li.classList.contains("is-dropping")
    )
      return;

    const touchLike =
      e.pointerType === "touch" || e.pointerType === "pen";

    dragArm = {
      li,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      pointerId: e.pointerId,
      touchLike,
      timer: null,
    };

    // Do NOT setPointerCapture during arm on touch — that steals the gesture
    // from page scroll and freezes the main page on iOS.
    if (!touchLike) {
      try {
        li.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    } else {
      // Suppress system text-selection / callout while holding a card
      document.addEventListener("selectstart", onSelectStartWhileArming, true);
      document.addEventListener("selectionchange", clearNativeSelection, true);
      try {
        window.getSelection?.()?.removeAllRanges?.();
      } catch {
        /* ignore */
      }
    }

    if (touchLike) {
      dragArm.timer = setTimeout(() => {
        commitTouchLongPressDrag();
      }, TOUCH_LONG_PRESS_MS);
      // passive:true so the browser can scroll freely until we cancel/commit
      window.addEventListener("pointermove", onListDragArmMove, {
        passive: true,
      });
    } else {
      window.addEventListener("pointermove", onListDragArmMove, {
        passive: false,
      });
    }
    window.addEventListener("pointerup", onListDragArmEnd);
    window.addEventListener("pointercancel", onListDragArmEnd);
  }

  function clearNativeSelection() {
    try {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount) sel.removeAllRanges();
    } catch {
      /* ignore */
    }
  }

  function clearDragArm() {
    if (dragArm?.timer) {
      clearTimeout(dragArm.timer);
      dragArm.timer = null;
    }
    if (dragArm?.li) {
      dragArm.li.classList.remove("is-drag-armed");
    }
    document.removeEventListener("selectstart", onSelectStartWhileArming, true);
    document.removeEventListener("selectionchange", clearNativeSelection, true);
    window.removeEventListener("pointermove", onListDragArmMove);
    window.removeEventListener("pointerup", onListDragArmEnd);
    window.removeEventListener("pointercancel", onListDragArmEnd);
    dragArm = null;
  }

  function onListDragArmMove(e) {
    if (!dragArm) return;
    if (e.pointerId !== dragArm.pointerId) return;

    dragArm.lastX = e.clientX;
    dragArm.lastY = e.clientY;
    const dx = e.clientX - dragArm.startX;
    const dy = e.clientY - dragArm.startY;
    const dist = Math.hypot(dx, dy);

    if (dragArm.touchLike) {
      // Finger moved enough → user is scrolling, abort reorder arm
      if (dist > TOUCH_CANCEL_MOVE_PX) {
        clearDragArm();
      }
      return;
    }

    // Mouse: start reorder after a small drag (desktop)
    if (dist < MOUSE_DRAG_MOVE_PX) return;
    e.preventDefault();
    const li = dragArm.li;
    clearDragArm();
    startListDrag(e, li);
  }

  function onListDragArmEnd() {
    clearDragArm();
  }

  /** Touch/pen held still long enough → begin reorder. */
  function commitTouchLongPressDrag() {
    if (!dragArm || !dragArm.touchLike) return;
    const arm = dragArm;
    const li = arm.li;
    if (
      !li ||
      li.classList.contains("is-done") ||
      li.classList.contains("is-dropping")
    ) {
      clearDragArm();
      return;
    }

    const fakeEvent = {
      clientX: arm.lastX,
      clientY: arm.lastY,
      pointerId: arm.pointerId,
      pointerType: "touch",
      preventDefault() {},
      stopPropagation() {},
    };

    clearDragArm();
    li.classList.add("is-drag-armed");
    // Brief armed flash, then lift
    requestAnimationFrame(() => {
      startListDrag(fakeEvent, li);
      li.classList.remove("is-drag-armed");
    });
  }

  function startListDrag(e, li) {
    if (
      dragState ||
      li.classList.contains("is-done") ||
      li.classList.contains("is-dropping")
    )
      return;
    e.preventDefault();
    e.stopPropagation();

    const rect = li.getBoundingClientRect();
    const placeholder = document.createElement("li");
    placeholder.className = "drag-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.height = `${rect.height}px`;

    // Slot stays in the list; card floats on <body> (avoids overflow/fixed bugs)
    li.parentNode.insertBefore(placeholder, li);
    document.body.appendChild(li);

    [...els.list.querySelectorAll(".project-card")].forEach((c) => {
      c.classList.remove("entering", "is-sliding", "just-dropped");
      c.getAnimations?.().forEach((a) => a.cancel());
      c.style.animation = "none";
      c.style.transform = "";
    });

    li.classList.remove("is-drag-armed");
    li.classList.add("is-dragging");
    document.body.classList.add("is-dragging-card");

    const originLeft = rect.left;
    const offsetY = e.clientY - rect.top;

    Object.assign(li.style, {
      position: "fixed",
      left: `${originLeft}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "2000",
      opacity: "0.9",
      pointerEvents: "none",
      transition: "none",
      transform: "scale(1.015)",
      transformOrigin: "center center",
      boxShadow: "0 22px 48px rgba(0,0,0,0.5)",
      boxSizing: "border-box",
    });

    dragState = {
      id: li.dataset.id,
      li,
      placeholder,
      originLeft,
      offsetY,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      moved: true, // crossed threshold to start — always a reorder gesture
      animating: false,
      /** After a swap, block reverse with that card until coverage drops (anti-thrash) */
      cooldownId: null,
      cooldownDir: null, // 'down' | 'up'
      pointerId: e.pointerId,
    };

    try {
      li.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    window.addEventListener("pointermove", onListDragMove, { passive: false });
    window.addEventListener("pointerup", onListDragEnd);
    window.addEventListener("pointercancel", onListDragEnd);
  }

  function onListDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const { li, placeholder, originLeft, offsetY } = dragState;

    li.style.left = `${originLeft}px`;
    li.style.top = `${e.clientY - offsetY}px`;

    if (Math.abs(e.clientY - dragState.startY) > 3 || Math.abs(e.movementY) > 0) {
      dragState.moved = true;
    }

    // Auto-scroll near edges (list-wrap on desktop; window/document on mobile)
    const wrap = els.list.closest(".list-wrap") || els.list;
    const wr = wrap.getBoundingClientRect();
    const edge = 48;
    const scrollUp = e.clientY < edge + 12;
    const scrollDown = e.clientY > window.innerHeight - edge - 12;
    const wrapScrollable = wrap.scrollHeight > wrap.clientHeight + 4;

    if (wrapScrollable) {
      if (e.clientY < wr.top + edge) {
        wrap.scrollTop -= Math.max(6, (edge - (e.clientY - wr.top)) * 0.4);
      } else if (e.clientY > wr.bottom - edge) {
        wrap.scrollTop += Math.max(6, (edge - (wr.bottom - e.clientY)) * 0.4);
      }
    } else if (scrollUp) {
      window.scrollBy(0, -Math.max(8, (edge + 12 - e.clientY) * 0.5));
    } else if (scrollDown) {
      window.scrollBy(
        0,
        Math.max(8, (e.clientY - (window.innerHeight - edge - 12)) * 0.5)
      );
    }

    if (!dragState.animating) {
      maybeShiftPlaceholder(li, placeholder);
    }
  }

  /** Fraction of target's area covered by the drag ghost. */
  function coverageOfTarget(dragRect, targetRect) {
    const xOverlap = Math.max(
      0,
      Math.min(dragRect.right, targetRect.right) -
        Math.max(dragRect.left, targetRect.left)
    );
    const yOverlap = Math.max(
      0,
      Math.min(dragRect.bottom, targetRect.bottom) -
        Math.max(dragRect.top, targetRect.top)
    );
    const targetArea = targetRect.width * targetRect.height;
    if (targetArea <= 0) return 0;
    return (xOverlap * yOverlap) / targetArea;
  }

  function neighborCards(placeholder) {
    let prev = placeholder.previousElementSibling;
    while (prev && !prev.classList.contains("project-card")) {
      prev = prev.previousElementSibling;
    }
    let next = placeholder.nextElementSibling;
    while (next && !next.classList.contains("project-card")) {
      next = next.nextElementSibling;
    }
    return { prev, next };
  }

  function maybeShiftPlaceholder(li, placeholder) {
    if (!dragState || dragState.animating) return;

    const dragRect = li.getBoundingClientRect();
    const { prev, next } = neighborCards(placeholder);
    const COVER = 0.5; // slide when ≥ half of the under card is covered
    const RELEASE = 0.32; // must uncover this much before reverse swap is allowed

    // Clear reverse-swap cooldown once the last swapped card is mostly uncovered
    if (dragState.cooldownId) {
      const cooled = els.list.querySelector(
        `.project-card[data-id="${dragState.cooldownId}"]`
      );
      if (!cooled) {
        dragState.cooldownId = null;
        dragState.cooldownDir = null;
      } else {
        const cov = coverageOfTarget(dragRect, cooled.getBoundingClientRect());
        if (cov < RELEASE) {
          dragState.cooldownId = null;
          dragState.cooldownDir = null;
        }
      }
    }

    // One step only: immediate neighbor. Pure 50% coverage (no midline).
    if (next) {
      const cov = coverageOfTarget(dragRect, next.getBoundingClientRect());
      const blocked =
        dragState.cooldownId === next.dataset.id &&
        dragState.cooldownDir === "up";
      if (cov >= COVER && !blocked) {
        const swappedId = next.dataset.id;
        flipSiblings(() => {
          const after = next.nextElementSibling;
          if (after) els.list.insertBefore(placeholder, after);
          else els.list.appendChild(placeholder);
        });
        dragState.cooldownId = swappedId;
        dragState.cooldownDir = "down";
        return;
      }
    }

    if (prev) {
      const cov = coverageOfTarget(dragRect, prev.getBoundingClientRect());
      const blocked =
        dragState.cooldownId === prev.dataset.id &&
        dragState.cooldownDir === "down";
      if (cov >= COVER && !blocked) {
        const swappedId = prev.dataset.id;
        flipSiblings(() => {
          els.list.insertBefore(placeholder, prev);
        });
        dragState.cooldownId = swappedId;
        dragState.cooldownDir = "up";
      }
    }
  }

  /**
   * Classic FLIP (no flash):
   * 1) measure  2) move gap  3) invert with transform (same frame)
   * 4) next frame → transition transform back to 0
   */
  function flipSiblings(mutate) {
    if (!dragState || dragState.animating) return;

    const cards = [...els.list.querySelectorAll(".project-card")];
    if (!cards.length) {
      mutate();
      return;
    }

    dragState.animating = true;

    // FIRST
    const firstTops = new Map(
      cards.map((c) => [c, c.getBoundingClientRect().top])
    );

    // MUTATE
    mutate();

    // INVERT in the same JS turn (browser hasn't painted the snap yet)
    const movers = [];
    cards.forEach((c) => {
      if (!c.isConnected) return;
      const firstTop = firstTops.get(c);
      if (firstTop === undefined) return;
      const dy = firstTop - c.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;

      c.classList.add("is-sliding");
      c.style.transition = "none";
      c.style.transform = `translateY(${dy}px)`;
      movers.push(c);
    });

    if (movers.length === 0) {
      dragState.animating = false;
      return;
    }

    // Force invert styles to apply before the next paint
    void els.list.offsetHeight;

    requestAnimationFrame(() => {
      let remaining = movers.length;

      const unlock = () => {
        if (dragState) dragState.animating = false;
      };

      movers.forEach((c) => {
        if (!c.isConnected) {
          remaining -= 1;
          if (remaining <= 0) unlock();
          return;
        }

        // PLAY — slide from inverted pose to natural layout
        c.style.transition =
          "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
        c.style.transform = "translateY(0)";

        const done = (ev) => {
          if (ev && ev.propertyName && ev.propertyName !== "transform") return;
          c.style.transition = "";
          c.style.transform = "";
          c.classList.remove("is-sliding");
          c.removeEventListener("transitionend", done);
          remaining -= 1;
          if (remaining <= 0) unlock();
        };
        c.addEventListener("transitionend", done);
        setTimeout(done, 340);
      });

      setTimeout(unlock, 360);
    });
  }

  function onListDragEnd() {
    if (!dragState) return;
    const { li, placeholder, id, moved } = dragState;
    dragState = null;

    window.removeEventListener("pointermove", onListDragMove);
    window.removeEventListener("pointerup", onListDragEnd);
    window.removeEventListener("pointercancel", onListDragEnd);

    // Kill only the ghost click from this pointerup — not the next real click
    if (moved) suppressGhostClickAfterDrag(li);

    // Where the finger left the floating card (visual "from")
    const first = li.getBoundingClientRect();

    // Finish any in-flight sibling slides immediately (commit final gap)
    [...els.list.querySelectorAll(".project-card")].forEach((c) => {
      c.getAnimations?.().forEach((a) => {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      });
      c.classList.remove("is-sliding");
      c.style.transition = "";
      c.style.transform = "";
    });

    // Seat the card in the list at the placeholder (layout "to")
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(li, placeholder);
      placeholder.remove();
    } else if (!li.parentNode || li.parentNode === document.body) {
      els.list.appendChild(li);
    }

    li.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-card");
    document.removeEventListener("selectstart", onSelectStartWhileArming, true);
    document.removeEventListener("selectionchange", clearNativeSelection, true);
    clearNativeSelection();
    li.removeAttribute("style");

    const last = li.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const dist = Math.hypot(dx, dy);

    const finishDrop = () => {
      li.style.transition = "";
      li.style.transform = "";
      li.style.opacity = "";
      li.style.zIndex = "";
      li.style.boxShadow = "";
      li.style.willChange = "";
      li.classList.remove("is-sliding", "is-dropping");
      if (moved) commitDomOrder(id);
    };

    // Already sitting on the slot — no travel needed
    if (dist < 1.5) {
      finishDrop();
      return;
    }

    // FLIP: keep the card visually where you released, then ease into the slot
    li.classList.add("is-sliding", "is-dropping");
    Object.assign(li.style, {
      transition: "none",
      transform: `translate(${dx}px, ${dy}px) scale(1.015)`,
      opacity: "0.92",
      zIndex: "40",
      boxShadow: "0 18px 40px rgba(0,0,0,0.42)",
      willChange: "transform, opacity",
    });
    void li.offsetHeight;

    // Faster when close to the slot, a bit longer when farther
    const duration = Math.round(Math.min(280, Math.max(160, dist * 0.55)));

    requestAnimationFrame(() => {
      if (!li.isConnected) {
        finishDrop();
        return;
      }
      li.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms ease, box-shadow ${duration}ms ease`;
      li.style.transform = "translate(0px, 0px) scale(1)";
      li.style.opacity = "1";
      li.style.boxShadow = "";

      let settled = false;
      const settle = (ev) => {
        if (ev && ev.propertyName && ev.propertyName !== "transform") return;
        if (settled) return;
        settled = true;
        li.removeEventListener("transitionend", settle);
        finishDrop();
      };
      li.addEventListener("transitionend", settle);
      setTimeout(settle, duration + 60);
    });
  }

  function commitDomOrder(droppedId) {
    const ids = [...els.list.querySelectorAll(".project-card")]
      .map((c) => c.dataset.id)
      .filter(Boolean);

    // Preserve relative order of done items; reorder actives as they appear in DOM
    const activeOrder = ids
      .map((id) => projects.find((p) => p.id === id))
      .filter((p) => p && !p.done);

    activeOrder.forEach((p, i) => {
      p.rank = i + 1;
      p.updatedAt = Date.now();
    });

    sortMode = "manual";
    save();
    renderStats();

    updateRankBadgesInPlace();
    pulseRanks();

    const dropped = $(`.project-card[data-id="${droppedId}"]`, els.list);
    if (dropped) {
      dropped.classList.add("just-dropped");
      setTimeout(() => dropped.classList.remove("just-dropped"), 450);
      const r = dropped.getBoundingClientRect();
      spawnSparks(r.left + r.width / 2, r.top + 12, { count: 8 });
    }
    toast("Stack reordered");
  }

  function pulseRanks() {
    $$(".project-card", els.list).forEach((card) => {
      card.classList.add("rank-pulse");
      setTimeout(() => card.classList.remove("rank-pulse"), 600);
    });
  }

  // ─── Wizard ─────────────────────────────────────────────
  function openWizard(origin) {
    researchTargetId = null;
    wiz = {
      step: "name",
      title: "",
      brief: "",
      supplies: [],
      summary: "",
      estimatedHours: 0,
      estimatedCost: 0,
      hoursAssumptions: "",
      hoursBreakdown: [],
      steps: [],
      category: "home",
      importance: 5,
      urgency: 5,
      effort: 5,
      skippedResearch: false,
    };
    els.wizTitle.value = "";
    els.wizBrief.value = "";
    setWizardStep("name");
    openModal(els.wizardModal, origin || $("#btn-add"));
    setTimeout(() => els.wizTitle.focus(), 40);
  }

  /** Open wizard describe → research flow for an existing stack item. */
  function openReresearch(project, origin) {
    if (!project) return;
    researchTargetId = project.id;
    closeModal(els.detailModal, { instant: true });
    wiz = {
      step: "describe",
      title: project.title,
      brief: project.notes || project.summary || "",
      supplies: [],
      summary: "",
      estimatedHours: 0,
      estimatedCost: 0,
      hoursAssumptions: "",
      hoursBreakdown: [],
      steps: [],
      category: project.category || "home",
      importance: project.importance || 5,
      urgency: project.urgency || 5,
      effort: project.effort || 5,
      skippedResearch: false,
    };
    els.wizTitle.value = wiz.title;
    els.wizBrief.value = wiz.brief;
    setWizardStep("describe");
    openModal(
      els.wizardModal,
      origin || $("#detail-research") || $("#btn-add")
    );
    setTimeout(() => els.wizBrief.focus(), 40);
    toast("Edit the brief if needed, then research");
  }

  function closeWizard() {
    if (researchAbort) {
      researchAbort.abort();
      researchAbort = null;
    }
    stopResearchTicks();
    researchTargetId = null;
    closeModal(els.wizardModal);
  }

  function setWizardStep(step) {
    wiz.step = step;
    if (step === "describe") syncCreditsBalanceUI();
    const order = ["name", "describe", "research", "findings"];
    const idx = order.indexOf(step);

    $$(".wizard-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== step;
    });

    $$(".wstep", els.wizardSteps).forEach((el) => {
      const s = el.dataset.step;
      const si = order.indexOf(s);
      el.classList.toggle("active", s === step);
      el.classList.toggle("done", si < idx);
    });

    const isRefresh = Boolean(researchTargetId);
    const titles = {
      name: "Name your project",
      describe: isRefresh
        ? "Update the brief for research"
        : "Describe what needs doing",
      research: "Grok is on it",
      findings: wiz.skippedResearch
        ? "Add details & approve"
        : isRefresh
          ? "Review refreshed research"
          : "Review Grok’s findings",
    };
    const kickers = {
      name: "Step 1 of 4",
      describe: isRefresh ? "Research existing project" : "Step 2 of 4",
      research: isRefresh ? "Researching your project" : "Step 3 of 4",
      findings: wiz.skippedResearch
        ? "Manual entry · no Grok research"
        : isRefresh
          ? "Apply when it looks right"
          : "Step 4 of 4 · editable",
    };
    els.wizardTitle.textContent = titles[step] || "New project";
    els.wizardKicker.textContent = kickers[step] || "New project";

    const approveBtn = $("#wiz-approve");
    if (approveBtn) {
      approveBtn.innerHTML = isRefresh
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Apply research`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Approve &amp; add to stack`;
    }

    // When skipping research, mark research step as skipped (not active)
    if (step === "findings" && wiz.skippedResearch) {
      const researchStep = $('.wstep[data-step="research"]', els.wizardSteps);
      if (researchStep) {
        researchStep.classList.remove("active", "done");
        researchStep.classList.add("skipped");
      }
    } else {
      $$(".wstep", els.wizardSteps).forEach((el) =>
        el.classList.remove("skipped")
      );
    }

    if (step === "findings") {
      paintFindingsForm();
    }
  }

  function wizardNextFromName() {
    const title = els.wizTitle.value.trim();
    if (!title) {
      els.wizTitle.focus();
      toast("Give the project a name");
      return;
    }
    wiz.title = title;
    setWizardStep("describe");
    setTimeout(() => els.wizBrief.focus(), 40);
  }

  function wizardBackToName() {
    setWizardStep("name");
  }

  function wizardStartResearch() {
    const brief = els.wizBrief.value.trim();
    if (brief.length < 20) {
      els.wizBrief.focus();
      toast("Add more detail — Grok needs a real brief");
      return;
    }
    wiz.brief = brief;
    wiz.title = els.wizTitle.value.trim() || wiz.title;
    wiz.skippedResearch = false;
    setWizardStep("research");
    runResearch();
  }

  /** Jump to findings without calling Grok — manual cost/hours/supplies. */
  function wizardSkipResearch() {
    const title = (els.wizTitle.value.trim() || wiz.title || "").trim();
    if (!title) {
      toast("Give the project a name first");
      setWizardStep("name");
      return;
    }
    wiz.title = title;
    wiz.brief = els.wizBrief.value.trim();
    wiz.skippedResearch = true;
    wiz.supplies = [];
    wiz.steps = [];
    wiz.summary = wiz.brief
      ? wiz.brief
      : "Added without Grok research — fill in cost and hours below.";
    wiz.estimatedHours = 0;
    wiz.estimatedCost = 0;
    wiz.hoursAssumptions = "";
    wiz.hoursBreakdown = [];
    wiz.category = "home";
    wiz.importance = 5;
    wiz.urgency = 5;
    wiz.effort = 5;
    setWizardStep("findings");
    toast("Skipped research — enter details yourself");
    setTimeout(() => els.findTotal?.focus(), 60);
  }

  function startResearchTicks() {
    stopResearchTicks();
    const items = $$("#research-ticks li");
    items.forEach((li) => li.classList.remove("on", "done"));
    let i = 0;
    const tick = () => {
      items.forEach((li, idx) => {
        li.classList.toggle("on", idx === i);
        li.classList.toggle("done", idx < i);
      });
      i = (i + 1) % items.length;
    };
    tick();
    tickTimer = setInterval(tick, 1400);
  }

  function stopResearchTicks() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  async function runResearch(useDemo = false) {
    els.researchError.hidden = true;
    els.researchActions.hidden = true;
    els.researchStatus.textContent =
      "Scoping the job and building a materials list";
    startResearchTicks();

    if (!useDemo && !settings.apiKey) {
      stopResearchTicks();
      els.researchError.hidden = false;
      els.researchError.textContent =
        "No xAI API key yet. Open Settings to add one, or try a demo estimate.";
      els.researchActions.hidden = false;
      els.researchStatus.textContent = "Waiting on API key";
      return;
    }

    if (!useDemo && getResearchCredits() <= 0) {
      stopResearchTicks();
      els.researchError.hidden = false;
      els.researchError.textContent =
        "You’re out of research credits. Top up to research with Grok, or use a demo estimate / skip.";
      els.researchActions.hidden = false;
      els.researchStatus.textContent = "No research credits left";
      toast("Out of research credits");
      return;
    }

    try {
      const result = useDemo
        ? await demoResearch(wiz.title, wiz.brief)
        : await callGrokResearch(wiz.title, wiz.brief);

      wiz.skippedResearch = false;
      applyResearchResult(result);
      stopResearchTicks();
      if (!useDemo) {
        consumeResearchCredit();
        toast(`Research complete · ${getResearchCredits()} credits left`);
      } else {
        toast("Demo estimate ready — edit freely");
      }
      setWizardStep("findings");
    } catch (err) {
      stopResearchTicks();
      els.researchError.hidden = false;
      els.researchError.textContent = err.message || String(err);
      els.researchActions.hidden = false;
      els.researchStatus.textContent = "Research hit a snag";
    }
  }

  function applyResearchResult(result) {
    wiz.summary = String(result.summary || "").trim();
    wiz.category = CATEGORY_LABELS[result.category]
      ? result.category
      : "other";
    wiz.importance = clamp(Number(result.importanceHint) || 5, 1, 10);
    wiz.urgency = clamp(Number(result.urgencyHint) || 5, 1, 10);
    wiz.effort = clamp(Number(result.effortHint) || 5, 1, 10);

    wiz.supplies = (result.supplies || []).map((s) =>
      normalizeSupply({ ...s, included: true })
    );

    // Always trust the sum of line items for money (fixes $600 vs $6 mismatches)
    const suppliesTotal = suppliesIncludedTotal(wiz.supplies);
    const modelCost = Math.max(0, Number(result.estimatedCost) || 0);
    if (suppliesTotal > 0) {
      // If model total is ~100x too small (missing zeros), prefer supply math
      if (modelCost > 0 && modelCost * 50 < suppliesTotal) {
        wiz.estimatedCost = suppliesTotal;
      } else if (modelCost > 0 && Math.abs(modelCost - suppliesTotal) / suppliesTotal > 0.15) {
        wiz.estimatedCost = suppliesTotal;
      } else {
        wiz.estimatedCost = suppliesTotal;
      }
    } else {
      wiz.estimatedCost = modelCost;
    }

    wiz.hoursBreakdown = Array.isArray(result.hoursBreakdown)
      ? result.hoursBreakdown
          .map((h) => ({
            phase: String(h.phase || "Phase").slice(0, 80),
            hours: Math.max(0, Number(h.hours) || 0),
            note: String(h.note || h.rationale || "").slice(0, 240),
          }))
          .filter((h) => h.phase)
      : [];
    wiz.hoursAssumptions = String(result.hoursAssumptions || "").trim();

    const hoursSum = wiz.hoursBreakdown.reduce((s, h) => s + h.hours, 0);
    const modelHours = Math.max(0, Number(result.estimatedHours) || 0);
    wiz.estimatedHours =
      hoursSum > 0 ? Math.round(hoursSum * 10) / 10 : modelHours;

    wiz.steps = normalizeSteps(result.steps || []);
  }

  async function callGrokResearch(title, brief) {
    if (researchAbort) researchAbort.abort();
    researchAbort = new AbortController();

    const userContent = `Project name: ${title}\n\nBrief:\n${brief}`;

    const body = {
      apiKey: settings.apiKey,
      model: settings.model || "grok-4-1-fast-reasoning",
      temperature: 0.3,
      messages: [
        { role: "system", content: RESEARCH_SYSTEM },
        { role: "user", content: userContent },
      ],
    };

    // Prefer local proxy (avoids CORS); fall back to direct xAI
    const endpoints = [];
    if (location.protocol.startsWith("http")) {
      endpoints.push(`${location.origin}/api/research`);
    }
    // If opened via file:// or different port, try default Stack server
    if (!isLocalServer()) {
      endpoints.push("http://localhost:3847/api/research");
    }
    endpoints.push("direct");

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        if (endpoint === "direct") {
          return await callXaiDirect(body, researchAbort.signal);
        }
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: researchAbort.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || `Research proxy failed (${res.status})`
          );
        }
        return parseModelJson(extractContent(data));
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastError = err;
        // try next endpoint
      }
    }

    throw new Error(
      lastError?.message ||
        "Could not reach Grok. Run `node server.js` and open http://localhost:3847, and check your API key."
    );
  }

  async function callXaiDirect(body, signal) {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${body.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model,
        temperature: body.temperature,
        messages: body.messages,
      }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error?.message || data.error || `xAI error ${res.status}`
      );
    }
    return parseModelJson(extractContent(data));
  }

  function extractContent(data) {
    return (
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      ""
    );
  }

  function parseModelJson(text) {
    if (!text) throw new Error("Grok returned an empty response");
    let cleaned = String(text).trim();
    // Strip markdown fences if present
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) cleaned = fence[1].trim();
    // Grab outermost object
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error("Could not parse Grok’s research JSON. Try again.");
    }
  }

  function demoResearch(title, brief) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const lower = `${title} ${brief}`.toLowerCase();
        const isPatio = /patio|paint|pool|concrete/.test(lower);
        if (isPatio) {
          resolve({
            summary:
              "Okay — for a ~1,500 sqft pool patio with white field and salmon trim, I estimate about 24–32 DIY hours (prep, seal cracks, prime, two coats). Materials should land around $380–$520 depending on paint brand and how much crack repair you need. Breakdown below uses mid-grade exterior concrete coatings from a big-box store.",
            estimatedHours: 28,
            hoursAssumptions:
              "Assumes competent DIY homeowner, mild weather, and labor hours only (not multi-day dry time between coats). Dry/cure waits add calendar days but are excluded from labor hours.",
            hoursBreakdown: [
              {
                phase: "Clean & degrease",
                hours: 4,
                note: "Large patio; scrub and rinse before sealer.",
              },
              {
                phase: "Crack repair",
                hours: 3,
                note: "Hairline cracks around pool edge and field.",
              },
              {
                phase: "Prime / bonding coat",
                hours: 5,
                note: "~1,500 sqft coverage with roller.",
              },
              {
                phase: "White field coats (×2)",
                hours: 10,
                note: "Two coats over ~1,200 sqft usable field.",
              },
              {
                phase: "Salmon trim + cleanup",
                hours: 6,
                note: "Cut-in around pool and tool cleanup.",
              },
            ],
            estimatedCost: 497,
            category: "yard",
            importanceHint: 7,
            urgencyHint: 4,
            effortHint: 7,
            steps: [
              "Clean and degrease patio",
              "Seal hairline cracks",
              "Prime / bonding coat",
              "Two coats white field",
              "Salmon trim around pool",
            ],
            tips: [
              "Paint in cooler morning hours",
              "Mask pool edge carefully",
              "Allow full cure before furniture",
            ],
            supplies: [
              {
                name: "Concrete cleaner / degreaser",
                quantityLabel: "1 gal",
                qty: 1,
                unitPrice: 18,
                lineTotal: 18,
                store: "Lowe's",
              },
              {
                name: "Concrete crack sealer",
                quantityLabel: "3 tubes",
                qty: 3,
                unitPrice: 7,
                lineTotal: 21,
                store: "Lowe's",
              },
              {
                name: "Concrete bonding primer",
                quantityLabel: "2 gal",
                qty: 2,
                unitPrice: 21,
                lineTotal: 42,
                store: "Lowe's",
              },
              {
                name: "Exterior concrete coating — white",
                quantityLabel: "10 gal",
                qty: 10,
                unitPrice: 26,
                lineTotal: 260,
                store: "Lowe's / SW",
              },
              {
                name: "Exterior concrete coating — salmon",
                quantityLabel: "3 gal",
                qty: 3,
                unitPrice: 26,
                lineTotal: 78,
                store: "Lowe's / SW",
              },
              {
                name: "Roller covers, frames, trays, brushes",
                quantityLabel: "1 kit",
                qty: 1,
                unitPrice: 48,
                lineTotal: 48,
                store: "Lowe's",
              },
              {
                name: "Painter’s tape + plastic sheeting",
                quantityLabel: "1 pack",
                qty: 1,
                unitPrice: 16,
                lineTotal: 16,
                store: "Lowe's",
              },
              {
                name: "Stiff broom / scrub brush",
                quantityLabel: "1",
                qty: 1,
                unitPrice: 14,
                lineTotal: 14,
                store: "Lowe's",
                notes: "Skip if you already own",
              },
            ],
          });
        } else {
          resolve({
            summary: `Rough plan for “${title}”: about 8 hours DIY and ~$180 in parts/supplies, based on your brief. Tweak the list for anything you already own.`,
            estimatedHours: 8,
            hoursAssumptions:
              "Generic DIY estimate — replace with a detailed brief for tighter phase times.",
            hoursBreakdown: [
              {
                phase: "Prep",
                hours: 2,
                note: "Clear area, measure, protect surroundings.",
              },
              {
                phase: "Main work",
                hours: 4.5,
                note: "Core install/repair from your description.",
              },
              {
                phase: "Cleanup & check",
                hours: 1.5,
                note: "Tools away and final walkthrough.",
              },
            ],
            estimatedCost: 180,
            category: "home",
            importanceHint: 5,
            urgencyHint: 5,
            effortHint: 5,
            steps: ["Prep area", "Acquire materials", "Execute", "Cleanup"],
            tips: ["Measure twice", "Buy 10% extra consumables"],
            supplies: [
              {
                name: "Primary materials",
                quantityLabel: "1 lot",
                qty: 1,
                unitPrice: 120,
                lineTotal: 120,
                store: "Lowe's",
              },
              {
                name: "Consumables / fasteners / misc",
                quantityLabel: "1",
                qty: 1,
                unitPrice: 35,
                lineTotal: 35,
                store: "Lowe's",
              },
              {
                name: "Safety / cleanup supplies",
                quantityLabel: "1",
                qty: 1,
                unitPrice: 25,
                lineTotal: 25,
                store: "Any",
              },
            ],
          });
        }
      }, 1600);
    });
  }

  function paintFindingsForm() {
    const summaryLabel = $("#find-summary-label");
    if (summaryLabel) {
      summaryLabel.innerHTML = wiz.skippedResearch
        ? "Notes / summary <em>optional</em>"
        : "Grok’s summary <em>editable</em>";
    }
    const costHint = $("#cost-sync-hint");
    if (costHint) {
      costHint.textContent = wiz.skippedResearch
        ? "Enter a total cost, or add supply lines and use Sync total from list."
        : "Total stays in sync with the included supplies list below (or edit freely).";
    }
    const rejectBtn = $("#wiz-reject");
    if (rejectBtn) {
      rejectBtn.textContent = wiz.skippedResearch
        ? "Back to description"
        : "Reject & edit brief";
    }

    els.findSummary.value = wiz.summary;
    els.findHours.value = wiz.estimatedHours || "";
    els.findTotal.value =
      wiz.estimatedCost > 0 ? String(Math.round(wiz.estimatedCost)) : "";
    els.findCategory.value = wiz.category || "home";
    els.findImportance.value = String(wiz.importance);
    els.findUrgency.value = String(wiz.urgency);
    els.findEffort.value = String(wiz.effort);
    syncFindSliders();
    renderHoursExplain();
    renderStepsEditor(els.stepsBody, wiz.steps);
    renderSuppliesTable(els.suppliesBody, wiz.supplies, {
      onChange: () => {
        updateSuppliesTotalDisplay();
        // Keep project total locked to included supplies when there are any
        const total = suppliesIncludedTotal(wiz.supplies);
        if (wiz.supplies.some((s) => s.included)) {
          els.findTotal.value = String(Math.round(total));
          wiz.estimatedCost = total;
        }
      },
    });
    updateSuppliesTotalDisplay();
  }

  function renderStepsEditor(container, list) {
    if (!container) return;
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML =
        '<p class="muted steps-empty">No steps yet. Add a few small actions in order.</p>';
    }
    list.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "step-edit-row";
      row.innerHTML = `
        <span class="step-edit-num">${index + 1}</span>
        <input type="text" class="step-edit-input" maxlength="240" />
        <button type="button" class="icon-btn danger step-edit-del" title="Remove step">×</button>
      `;
      const input = $(".step-edit-input", row);
      input.value = step.text;
      input.addEventListener("input", () => {
        step.text = input.value;
      });
      $(".step-edit-del", row).addEventListener("click", () => {
        list.splice(index, 1);
        renderStepsEditor(container, list);
      });
      container.appendChild(row);
    });
  }

  function addWizardStep() {
    wiz.steps.push(normalizeStep("New step"));
    renderStepsEditor(els.stepsBody, wiz.steps);
    const inputs = $$(".step-edit-input", els.stepsBody);
    const last = inputs[inputs.length - 1];
    if (last) {
      last.focus();
      last.select();
    }
  }

  function renderHoursExplain() {
    if (!els.hoursExplain) return;
    const hasBreakdown = wiz.hoursBreakdown && wiz.hoursBreakdown.length > 0;
    const hasAssumptions = Boolean(wiz.hoursAssumptions);
    if (!hasBreakdown && !hasAssumptions) {
      els.hoursExplain.hidden = true;
      return;
    }
    els.hoursExplain.hidden = false;
    els.hoursAssumptions.textContent =
      wiz.hoursAssumptions ||
      "Labor estimate for a competent DIY homeowner based on your brief (phases below).";
    els.hoursBreakdown.innerHTML = "";
    (wiz.hoursBreakdown || []).forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="phase"></span>
        <span class="hrs"></span>
        <span class="why"></span>
      `;
      $(".phase", li).textContent = h.phase;
      $(".hrs", li).textContent = `${h.hours}h`;
      const why = $(".why", li);
      if (h.note) why.textContent = h.note;
      else why.remove();
      els.hoursBreakdown.appendChild(li);
    });
  }

  function syncFindSliders() {
    els.findImportanceVal.textContent = els.findImportance.value;
    els.findUrgencyVal.textContent = els.findUrgency.value;
    els.findEffortVal.textContent = els.findEffort.value;
  }

  function updateSuppliesTotalDisplay() {
    const total = suppliesIncludedTotal(wiz.supplies);
    els.suppliesTotal.textContent = formatMoney(total);
  }

  function readFindingsIntoWiz() {
    wiz.summary = els.findSummary.value.trim();
    wiz.estimatedHours = Math.max(0, Number(els.findHours.value) || 0);
    wiz.estimatedCost = Math.max(0, Number(els.findTotal.value) || 0);
    wiz.category = els.findCategory.value;
    wiz.importance = Number(els.findImportance.value);
    wiz.urgency = Number(els.findUrgency.value);
    wiz.effort = Number(els.findEffort.value);
    // supplies already mutated in place via table inputs
  }

  function wizardSyncTotal() {
    const total = suppliesIncludedTotal(wiz.supplies);
    els.findTotal.value = String(Math.round(total));
    wiz.estimatedCost = total;
    toast("Total synced from included supplies");
  }

  function wizardReject() {
    // Back to describe with brief intact
    els.wizBrief.value = wiz.brief;
    els.wizTitle.value = wiz.title;
    setWizardStep("describe");
    toast(
      wiz.skippedResearch
        ? "Back to description"
        : "Rejected — edit the brief and research again"
    );
  }

  function wizardApprove() {
    readFindingsIntoWiz();
    if (!wiz.title) {
      toast("Missing project name");
      setWizardStep("name");
      return;
    }

    // Prefer supply sum when there are included lines; otherwise keep typed total
    const supplyTotal = suppliesIncludedTotal(wiz.supplies);
    const hasIncludedSupplies = wiz.supplies.some((s) => s.included);
    if (hasIncludedSupplies) {
      wiz.estimatedCost = supplyTotal;
    }

    const steps = wiz.steps
      .map((s) => normalizeStep(s))
      .filter((s) => s.text.trim());

    const targetId = researchTargetId;
    if (targetId) {
      const existing = projects.find((p) => p.id === targetId);
      if (!existing) {
        researchTargetId = null;
        toast("That project is gone — adding as new instead");
      } else {
        // Preserve acquired flags on supplies when names match
        const oldByName = Object.fromEntries(
          (existing.supplies || []).map((s) => [s.name.toLowerCase(), s])
        );
        const supplies = wiz.supplies.map((s) => {
          const prev = oldByName[String(s.name || "").toLowerCase()];
          return normalizeSupply({
            ...s,
            acquired: prev ? prev.acquired : false,
          });
        });
        // Preserve step completion when text matches (case-insensitive)
        const oldSteps = Object.fromEntries(
          (existing.steps || []).map((s) => [s.text.toLowerCase().trim(), s])
        );
        const mergedSteps = steps.map((s) => {
          const prev = oldSteps[s.text.toLowerCase().trim()];
          return { ...s, done: prev ? prev.done : false };
        });

        Object.assign(existing, {
          title: wiz.title,
          notes: wiz.brief,
          summary: wiz.summary,
          estimatedCost: wiz.estimatedCost,
          estimatedHours: wiz.estimatedHours,
          hoursAssumptions: wiz.hoursAssumptions,
          hoursBreakdown: wiz.hoursBreakdown,
          supplies,
          steps: mergedSteps,
          category: wiz.category,
          importance: wiz.importance,
          urgency: wiz.urgency,
          effort: wiz.effort,
          researched: !wiz.skippedResearch,
          updatedAt: Date.now(),
        });

        researchTargetId = null;
        closeWizard();
        render();
        pulseRanks();
        toast("Research applied to project");
        return;
      }
    }

    const maxRank = activeProjects().length;
    projects.push(
      normalizeProject({
        id: uid(),
        title: wiz.title,
        notes: wiz.brief,
        summary: wiz.summary,
        estimatedCost: wiz.estimatedCost,
        estimatedHours: wiz.estimatedHours,
        hoursAssumptions: wiz.hoursAssumptions,
        hoursBreakdown: wiz.hoursBreakdown,
        supplies: wiz.supplies,
        steps,
        category: wiz.category,
        importance: wiz.importance,
        urgency: wiz.urgency,
        effort: wiz.effort,
        rank: maxRank + 1,
        done: false,
        researched: !wiz.skippedResearch,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    closeWizard();
    render();
    pulseRanks();
    spawnSparks(window.innerWidth / 2, 120, { count: 18, green: true });
    toast("Approved — added to your stack");
  }

  // ─── Brain dump ─────────────────────────────────────────
  function openDumpModal(origin) {
    if (els.dumpText) els.dumpText.value = "";
    updateDumpPreview();
    openModal(els.dumpModal, origin || $("#btn-dump"));
    setTimeout(() => els.dumpText?.focus(), 40);
  }

  function closeDumpModal() {
    closeModal(els.dumpModal);
  }

  /**
   * Split a free-form dump into project seeds.
   * One idea per line; bullets/numbers stripped; long lines become title + notes.
   */
  function segmentBrainDump(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n");
    const lines = text
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*[-*•–—]+\s*/, "")
          .replace(/^\s*\d+[.)]\s*/, "")
          .trim()
      )
      .filter((line) => line.length > 0);

    const items = [];
    const seen = new Set();
    lines.forEach((line) => {
      let title = line;
      let notes = "";
      // "Title: more detail" or "Title - more detail"
      const split = line.match(/^(.{2,80}?)(?:\s*[:\-–—]\s+)(.+)$/);
      if (split) {
        title = split[1].trim();
        notes = split[2].trim();
      } else if (line.length > 90) {
        title = line.slice(0, 80).trim();
        notes = line;
      }
      title = title.slice(0, 120);
      const key = title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ title, notes });
    });
    return items;
  }

  function updateDumpPreview() {
    const items = segmentBrainDump(els.dumpText?.value || "");
    if (els.dumpPreview) {
      els.dumpPreview.textContent =
        items.length === 0
          ? "0 projects ready"
          : items.length === 1
            ? "1 project ready"
            : `${items.length} projects ready`;
    }
    if (els.dumpCommit) els.dumpCommit.disabled = items.length === 0;
  }

  function commitBrainDump() {
    const items = segmentBrainDump(els.dumpText?.value || "");
    if (!items.length) {
      toast("Add at least one line");
      return;
    }

    let rankBase = activeProjects().length;
    const now = Date.now();
    items.forEach((item, i) => {
      projects.push(
        normalizeProject({
          id: uid(),
          title: item.title,
          notes: item.notes,
          summary: "",
          estimatedCost: 0,
          estimatedHours: 0,
          supplies: [],
          steps: [],
          category: "other",
          importance: 5,
          urgency: 5,
          effort: 5,
          rank: rankBase + i + 1,
          done: false,
          researched: false,
          createdAt: now + i,
          updatedAt: now + i,
        })
      );
    });

    closeDumpModal();
    render();
    pulseRanks();
    toast(
      items.length === 1
        ? "1 project dumped onto your stack"
        : `${items.length} projects dumped onto your stack`
    );
  }

  // ─── Supplies table ─────────────────────────────────────
  function renderSuppliesTable(tbody, list, { onChange } = {}) {
    tbody.innerHTML = "";
    list.forEach((item, index) => {
      const tr = document.createElement("tr");
      if (!item.included) tr.classList.add("is-excluded");
      tr.innerHTML = `
        <td class="col-check"><input type="checkbox" data-f="included" ${
          item.included ? "checked" : ""
        } title="Include in project" /></td>
        <td><input type="text" data-f="name" maxlength="160" /></td>
        <td class="col-qty"><input type="text" data-f="quantity" maxlength="80" title="Qty label" /></td>
        <td class="col-money"><input type="number" data-f="unitPrice" min="0" step="0.01" title="Price each" /></td>
        <td class="line-total"></td>
        <td class="col-store"><input type="text" data-f="store" maxlength="80" /></td>
        <td class="col-del"><button type="button" class="icon-btn danger" data-del title="Remove">×</button></td>
      `;
      const nameIn = $('[data-f="name"]', tr);
      const qtyIn = $('[data-f="quantity"]', tr);
      const priceIn = $('[data-f="unitPrice"]', tr);
      const storeIn = $('[data-f="store"]', tr);
      const check = $('[data-f="included"]', tr);
      const lineEl = $(".line-total", tr);

      nameIn.value = item.name;
      qtyIn.value = item.quantity;
      priceIn.value = item.unitPrice || "";
      storeIn.value = item.store;
      lineEl.textContent = formatMoney(supplyLineTotal(item), 0);

      const sync = () => {
        item.name = nameIn.value;
        item.quantity = qtyIn.value;
        item.qty = parseQty(qtyIn.value, item.qty || 1);
        item.unitPrice = Math.max(0, Number(priceIn.value) || 0);
        item.unitCost = supplyLineTotal(item);
        item.store = storeIn.value;
        item.included = check.checked;
        lineEl.textContent = formatMoney(supplyLineTotal(item), 0);
        tr.classList.toggle("is-excluded", !item.included);
        onChange?.();
      };

      [nameIn, qtyIn, priceIn, storeIn, check].forEach((el) =>
        el.addEventListener("input", sync)
      );
      check.addEventListener("change", sync);

      $("[data-del]", tr).addEventListener("click", () => {
        list.splice(index, 1);
        renderSuppliesTable(tbody, list, { onChange });
        onChange?.();
      });

      tbody.appendChild(tr);
    });
  }

  function addSupplyLine(list, tbody, onChange) {
    list.push(
      normalizeSupply({
        name: "New item",
        quantityLabel: "1",
        qty: 1,
        unitPrice: 0,
        lineTotal: 0,
        store: "",
        included: true,
      })
    );
    renderSuppliesTable(tbody, list, { onChange });
    onChange?.();
  }

  // ─── Edit / Detail ──────────────────────────────────────
  function openEditModal(project, origin) {
    els.editId.value = project.id;
    els.editTitle.value = project.title;
    els.editNotes.value = project.notes;
    els.editSummary.value = project.summary;
    els.editCost.value = project.estimatedCost || "";
    els.editHours.value = project.estimatedHours || "";
    els.editCategory.value = project.category;
    els.editImportance.value = String(project.importance);
    els.editUrgency.value = String(project.urgency);
    els.editEffort.value = String(project.effort);
    syncEditSliders();
    editSupplies = project.supplies.map((s) => ({ ...s }));
    renderSuppliesTable(els.editSuppliesBody, editSupplies);
    openModal(els.editModal, origin);
  }

  function closeEditModal() {
    closeModal(els.editModal);
  }

  function syncEditSliders() {
    els.editImportanceVal.textContent = els.editImportance.value;
    els.editUrgencyVal.textContent = els.editUrgency.value;
    els.editEffortVal.textContent = els.editEffort.value;
  }

  function saveEdit(e) {
    e.preventDefault();
    const id = els.editId.value;
    const existing = projects.find((p) => p.id === id);
    if (!existing) return;

    const title = els.editTitle.value.trim();
    if (!title) {
      toast("Name is required");
      return;
    }

    Object.assign(existing, {
      title,
      notes: els.editNotes.value.trim(),
      summary: els.editSummary.value.trim(),
      estimatedCost: Math.max(0, Number(els.editCost.value) || 0),
      estimatedHours: Math.max(0, Number(els.editHours.value) || 0),
      category: els.editCategory.value,
      importance: Number(els.editImportance.value),
      urgency: Number(els.editUrgency.value),
      effort: Number(els.editEffort.value),
      supplies: editSupplies.map(normalizeSupply),
      researched:
        existing.researched ||
        editSupplies.length > 0 ||
        Boolean(els.editSummary.value.trim()),
      updatedAt: Date.now(),
    });

    closeEditModal();
    render();
    toast("Project updated");
  }

  function openDetailModal(project, origin) {
    detailProjectId = project.id;
    const live = projects.find((p) => p.id === project.id) || project;
    els.detailTitle.textContent = live.title;
    els.detailCategory.textContent =
      CATEGORY_LABELS[live.category] || "Project";

    const hoursHtml =
      live.hoursBreakdown?.length || live.hoursAssumptions
        ? `<div class="detail-block hours-block">
            <h3>Time estimate</h3>
            ${
              live.hoursAssumptions
                ? `<p class="hours-assumptions-detail"></p>`
                : ""
            }
            ${
              live.hoursBreakdown?.length
                ? `<ul class="hours-breakdown detail-hours"></ul>`
                : ""
            }
          </div>`
        : "";

    els.detailBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-metrics">
          <div class="detail-metric"><span>Est. cost</span><strong>${formatMoney(
            live.estimatedCost
          )}</strong></div>
          <div class="detail-metric"><span>Est. hours</span><strong>${
            live.estimatedHours || "—"
          }</strong></div>
          <div class="detail-metric"><span>Rank</span><strong>#${
            live.rank
          }</strong></div>
        </div>
        ${
          live.summary
            ? `<div class="detail-block"><h3>Research summary</h3><p class="block-summary"></p></div>`
            : ""
        }
        ${
          live.notes
            ? `<div class="detail-block"><h3>Your brief</h3><p class="block-notes"></p></div>`
            : ""
        }
        ${hoursHtml}
        <div class="detail-block guide-block" id="detail-guide-block">
          <div class="guide-header">
            <div>
              <h3>Project guide</h3>
              <p class="muted guide-progress" id="guide-progress"></p>
            </div>
          </div>
          <ul class="guide-checklist" id="guide-checklist"></ul>
          <div class="guide-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-add-detail-step">+ Add step</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-finish-project" hidden>
              Mark project done
            </button>
          </div>
          <p class="muted guide-empty" id="guide-empty" hidden>
            No steps yet — add a few small actions in order.
          </p>
        </div>
        <div class="detail-block supplies-block">
          <div class="guide-header">
            <div>
              <h3>Supplies checklist</h3>
              <p class="muted guide-progress" id="supplies-progress"></p>
            </div>
          </div>
          <ul class="guide-checklist supplies-checklist" id="supplies-checklist"></ul>
          <p class="muted guide-empty" id="supplies-empty" hidden>
            No supplies listed for this project.
          </p>
        </div>
      </div>
    `;

    const summaryP = $(".block-summary", els.detailBody);
    if (summaryP) summaryP.textContent = live.summary;
    const notesP = $(".block-notes", els.detailBody);
    if (notesP) notesP.textContent = live.notes;
    const assumpP = $(".hours-assumptions-detail", els.detailBody);
    if (assumpP) assumpP.textContent = live.hoursAssumptions;
    const hoursList = $(".detail-hours", els.detailBody);
    if (hoursList && live.hoursBreakdown?.length) {
      live.hoursBreakdown.forEach((h) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="phase"></span><span class="hrs"></span><span class="why"></span>`;
        $(".phase", li).textContent = h.phase;
        $(".hrs", li).textContent = `${h.hours}h`;
        if (h.note) $(".why", li).textContent = h.note;
        else $(".why", li).remove();
        hoursList.appendChild(li);
      });
    }

    const researchBtn = $("#detail-research");
    if (researchBtn) {
      researchBtn.textContent = live.researched
        ? "Re-research with Grok"
        : "Research with Grok";
    }

    bindDetailChecklists(live);
    openModal(els.detailModal, origin);
  }

  function bindDetailChecklists(project) {
    const progress = $("#guide-progress", els.detailBody);
    const list = $("#guide-checklist", els.detailBody);
    const empty = $("#guide-empty", els.detailBody);
    const finishBtn = $("#btn-finish-project", els.detailBody);
    const addBtn = $("#btn-add-detail-step", els.detailBody);
    const suppliesList = $("#supplies-checklist", els.detailBody);
    const suppliesProgress = $("#supplies-progress", els.detailBody);
    const suppliesEmpty = $("#supplies-empty", els.detailBody);

    const live = () => projects.find((x) => x.id === project.id) || project;

    const refreshChrome = () => {
      const p = live();
      const prog = stepProgress(p);
      if (progress) {
        progress.textContent =
          prog.total === 0
            ? "No checklist yet"
            : `${prog.done} of ${prog.total} steps done`;
      }
      if (empty) empty.hidden = prog.total > 0;
      if (finishBtn) {
        finishBtn.hidden = !(
          prog.total > 0 &&
          prog.done >= prog.total &&
          !p.done
        );
      }
      const sp = supplyProgress(p);
      if (suppliesProgress) {
        suppliesProgress.textContent =
          sp.total === 0
            ? "Nothing on the shopping list"
            : `${sp.got} of ${sp.total} gathered`;
      }
      if (suppliesEmpty) suppliesEmpty.hidden = p.supplies.length > 0;
    };

    const renderSteps = () => {
      const p = live();
      if (!list) return;
      list.innerHTML = "";
      p.steps.forEach((step, index) => {
        const li = document.createElement("li");
        li.className = "guide-step" + (step.done ? " is-done" : "");
        li.innerHTML = `
          <div class="guide-step-label">
            <input type="checkbox" ${step.done ? "checked" : ""} title="Mark step done" />
            <span class="guide-step-num">${index + 1}</span>
            <span class="guide-step-text" contenteditable="true" spellcheck="true"></span>
          </div>
          <button type="button" class="icon-btn danger guide-step-del" title="Remove step">×</button>
        `;
        const textEl = $(".guide-step-text", li);
        textEl.textContent = step.text;
        textEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            textEl.blur();
          }
        });
        textEl.addEventListener("blur", () => {
          const next = textEl.textContent.trim();
          if (!next) {
            textEl.textContent = step.text;
            return;
          }
          if (next !== step.text) {
            step.text = next.slice(0, 240);
            p.updatedAt = Date.now();
            save();
            renderListSoftNextSteps();
          }
        });
        const cb = $("input", li);
        cb.addEventListener("change", () => {
          step.done = cb.checked;
          p.updatedAt = Date.now();
          li.classList.toggle("is-done", step.done);
          if (step.done) {
            li.classList.add("step-pop");
            setTimeout(() => li.classList.remove("step-pop"), 350);
            toast("Step done");
          }
          save();
          renderListSoftNextSteps();
          refreshChrome();
          const prog = stepProgress(p);
          if (step.done && prog.total > 0 && prog.done >= prog.total) {
            toast("All steps complete — mark the project done when ready");
          }
        });
        $(".guide-step-del", li).addEventListener("click", () => {
          p.steps.splice(index, 1);
          p.updatedAt = Date.now();
          save();
          renderSteps();
          renderListSoftNextSteps();
        });
        list.appendChild(li);
      });
      refreshChrome();
    };

    const renderSupplies = () => {
      const p = live();
      if (!suppliesList) return;
      suppliesList.innerHTML = "";
      p.supplies.forEach((item, index) => {
        // Only shopping-list items that still count for the project
        if (!item.included) return;
        const li = document.createElement("li");
        li.className =
          "guide-step supply-step" + (item.acquired ? " is-done" : "");
        li.innerHTML = `
          <div class="guide-step-label supply-label">
            <input type="checkbox" ${item.acquired ? "checked" : ""} title="Got this" />
            <span class="guide-step-text supply-text"></span>
            <span class="supply-meta"></span>
          </div>
        `;
        const nameBits = [item.name];
        if (item.quantity) nameBits.push(item.quantity);
        $(".supply-text", li).textContent = nameBits.join(" · ");
        const meta = $(".supply-meta", li);
        const metaBits = [];
        if (item.store) metaBits.push(item.store);
        if (supplyLineTotal(item) > 0)
          metaBits.push(formatMoney(supplyLineTotal(item)));
        meta.textContent = metaBits.join(" · ");
        if (!metaBits.length) meta.remove();

        $("input", li).addEventListener("change", (e) => {
          item.acquired = e.target.checked;
          p.updatedAt = Date.now();
          li.classList.toggle("is-done", item.acquired);
          if (item.acquired) {
            li.classList.add("step-pop");
            setTimeout(() => li.classList.remove("step-pop"), 350);
            toast("Got it");
          }
          save();
          renderListSoftNextSteps();
          refreshChrome();
        });
        suppliesList.appendChild(li);
      });
      // Show non-included as muted notes if any
      const excluded = p.supplies.filter((s) => !s.included);
      excluded.forEach((item) => {
        const li = document.createElement("li");
        li.className = "guide-step supply-step is-excluded";
        li.innerHTML = `<span class="supply-excluded-note"></span>`;
        $(".supply-excluded-note", li).textContent = `Skipped: ${item.name}`;
        suppliesList.appendChild(li);
      });
      refreshChrome();
    };

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const p = live();
        p.steps.push(normalizeStep("New step"));
        p.updatedAt = Date.now();
        save();
        renderSteps();
        renderListSoftNextSteps();
        const texts = $$(".guide-step-text", list);
        const last = texts[texts.length - 1];
        if (last) {
          last.focus();
          const range = document.createRange();
          range.selectNodeContents(last);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }

    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        closeModal(els.detailModal);
        const card = $(`.project-card[data-id="${project.id}"]`, els.list);
        if (card) playCompleteRitual(project.id, card);
        else toggleDone(project.id);
      });
    }

    renderSteps();
    renderSupplies();
  }

  /** Update next-step lines on cards without full re-render. */
  function renderListSoftNextSteps() {
    // Full list re-render is safer for next-step lines + chips
    const scroll = els.list.closest(".list-wrap");
    const top = scroll ? scroll.scrollTop : 0;
    renderList();
    if (scroll) scroll.scrollTop = top;
    renderStats();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Pending delete context for the in-app confirm dialog */
  let pendingDelete = null;

  function deleteProject(id, event) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;

    pendingDelete = {
      id,
      title: p.title,
      originEl: event?.target?.closest?.("[data-action]") || null,
    };

    if (els.confirmProjectName) {
      els.confirmProjectName.textContent = p.title;
    }
    if (els.confirmMessage) {
      els.confirmMessage.textContent =
        "This removes it from your stack. You can’t undo this.";
    }
    openModal(els.confirmModal, pendingDelete.originEl);
    setTimeout(() => els.confirmOk?.focus(), 40);
  }

  function closeConfirmModal() {
    pendingDelete = null;
    closeModal(els.confirmModal);
  }

  function confirmDeleteProject() {
    if (!pendingDelete) {
      closeConfirmModal();
      return;
    }
    const { id } = pendingDelete;
    pendingDelete = null;
    closeModal(els.confirmModal);

    const card = $(`.project-card[data-id="${id}"]`, els.list);
    if (!card) {
      projects = projects.filter((x) => x.id !== id);
      renumberRanks();
      save();
      renderStats();
      renderList();
      toast("Removed");
      return;
    }

    playCardDestroyAnimation(id, card);
  }

  /**
   * Full-card destroy: lift card to a fixed ghost → shrink whole box →
   * shatter into fragments → list closes the gap with FLIP.
   */
  function playCardDestroyAnimation(id, card) {
    const siblings = [...els.list.querySelectorAll(".project-card")].filter(
      (c) => c !== card
    );
    const rect = card.getBoundingClientRect();

    // Spacer holds the hole so the list doesn't jump during the effect
    const spacer = document.createElement("li");
    spacer.className = "delete-spacer";
    spacer.style.height = `${rect.height}px`;
    spacer.setAttribute("aria-hidden", "true");
    card.replaceWith(spacer);

    // Full visual clone on <body> so scale isn't clipped by list overflow
    const ghost = card.cloneNode(true);
    ghost.classList.add("delete-ghost");
    ghost.classList.remove("is-exploding", "entering", "is-sliding");
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[data-action]").forEach((el) => {
      el.removeAttribute("data-action");
    });
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "3000",
      pointerEvents: "none",
      boxSizing: "border-box",
      transformOrigin: "center center",
      transition: "none",
      opacity: "1",
    });
    document.body.appendChild(ghost);

    let finished = false;
    const runShatterAndClose = () => {
      if (finished) return;
      finished = true;

      // Use the ghost's current (shrunk) on-screen box so pieces continue from the whole card
      const box = ghost.isConnected ? ghost.getBoundingClientRect() : rect;
      if (ghost.isConnected) ghost.remove();

      shatterCardRect(box);
      spawnDeleteBurst(box.left + box.width / 2, box.top + box.height / 2, {
        count: 22,
      });
      collapseSpacerAndSlide(id, spacer, siblings);
    };

    // Phase 1 — whole card shrinks in place (visible full box)
    const shrink = ghost.animate(
      [
        { transform: "scale(1)", opacity: 1, offset: 0 },
        { transform: "scale(0.86)", opacity: 1, offset: 0.4 },
        { transform: "scale(0.5)", opacity: 0.98, offset: 1 },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        fill: "forwards",
      }
    );

    shrink.finished.catch(() => {}).then(runShatterAndClose);
    setTimeout(runShatterAndClose, 400);
  }

  /** Break a card-shaped rect into a grid of flying fragments. */
  function shatterCardRect(rect) {
    const layer = els.fxLayer || document.body;
    const cols = 5;
    const rows = 3;
    const fw = rect.width / cols;
    const fh = rect.height / rows;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const frag = document.createElement("div");
        frag.className = "card-fragment";
        const left = rect.left + col * fw;
        const top = rect.top + row * fh;
        const mx = left + fw / 2 - cx;
        const my = top + fh / 2 - cy;
        const rot = (Math.random() - 0.5) * 140;
        const boost = 1.6 + Math.random() * 1.4;

        Object.assign(frag.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${Math.max(4, fw - 1)}px`,
          height: `${Math.max(4, fh - 1)}px`,
        });

        // Slight color variation across the grid
        if ((row + col) % 3 === 0) frag.classList.add("frag-warm");
        if ((row + col) % 4 === 0) frag.classList.add("frag-edge");

        layer.appendChild(frag);

        const anim = frag.animate(
          [
            {
              transform: "translate(0px, 0px) scale(1) rotate(0deg)",
              opacity: 1,
            },
            {
              transform: `translate(${mx * boost}px, ${my * boost + 28}px) scale(${0.25 + Math.random() * 0.35}) rotate(${rot}deg)`,
              opacity: 0,
            },
          ],
          {
            duration: 480 + Math.random() * 160,
            easing: "cubic-bezier(0.15, 0.85, 0.35, 1)",
            fill: "forwards",
          }
        );
        anim.finished
          .catch(() => {})
          .then(() => frag.remove());
        setTimeout(() => frag.remove(), 700);
      }
    }
  }

  /**
   * Close a list gap with pure FLIP (transform only).
   * Never animate layout height — that reflows the whole stack every frame
   * and feels like a reload/shake on long scrollable lists.
   */
  function flipCloseGap(siblings, mutate, { duration = 320 } = {}) {
    const cards = siblings.filter((c) => c && c.isConnected);
    const wrap = els.list.closest(".list-wrap") || els.list;
    const scrollBefore = wrap.scrollTop;

    // FIRST
    const firstTops = new Map(
      cards.map((c) => [c, c.getBoundingClientRect().top])
    );

    // MUTATE (remove spacer / rearrange) — single layout pass
    mutate();

    // Keep scroll stable when content near the bottom shrinks
    wrap.scrollTop = scrollBefore;

    // INVERT in the same turn (before paint)
    const movers = [];
    cards.forEach((c) => {
      if (!c.isConnected) return;
      const firstTop = firstTops.get(c);
      if (firstTop === undefined) return;
      const dy = firstTop - c.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;

      c.classList.add("is-sliding");
      c.style.transition = "none";
      c.style.transform = `translateY(${dy}px)`;
      movers.push(c);
    });

    if (!movers.length) return;

    // Force invert styles before PLAY
    void els.list.offsetHeight;

    requestAnimationFrame(() => {
      movers.forEach((c) => {
        if (!c.isConnected) return;
        c.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        c.style.transform = "translateY(0)";
        const clear = (ev) => {
          if (ev && ev.propertyName && ev.propertyName !== "transform") return;
          c.style.transition = "";
          c.style.transform = "";
          c.classList.remove("is-sliding");
          c.removeEventListener("transitionend", clear);
        };
        c.addEventListener("transitionend", clear);
        setTimeout(clear, duration + 40);
      });
    });
  }

  function collapseSpacerAndSlide(id, spacer, siblings) {
    // Guard against double-invocation from animation + safety timer
    if (!spacer || spacer.dataset.closing === "1") return;
    spacer.dataset.closing = "1";

    // Update data once (no full list re-render)
    if (projects.some((p) => p.id === id)) {
      projects = projects.filter((x) => x.id !== id);
      renumberRanks();
      save();
    }

    flipCloseGap(siblings, () => {
      if (spacer.isConnected) spacer.remove();
    });

    // Soft in-place updates only — never rebuild cards.
    // Defer past the FLIP invert frame so badge text writes don't compete with layout.
    requestAnimationFrame(() => {
      updateRankBadgesInPlace();
      renderStats();
      els.empty.hidden = visibleProjects().length > 0;
    });
    toast("Removed");
  }

  function updateRankBadgesInPlace() {
    [...els.list.querySelectorAll(".project-card")].forEach((card) => {
      const p = projects.find((x) => x.id === card.dataset.id);
      if (!p) return;
      card.dataset.rank = String(p.rank);
      card.classList.toggle("top-rank", !p.done && p.rank === 1);
      card.classList.toggle("is-done", p.done);
      const badge = $(".rank-badge", card);
      if (badge) badge.textContent = p.done ? "✓" : String(p.rank);
    });
  }

  function spawnDeleteBurst(x, y, { count = 24 } = {}) {
    if (!els.fxLayer) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      const kind = i % 5;
      s.className =
        kind === 0
          ? "spark spark-rose"
          : kind === 1
            ? "spark green"
            : "spark";
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 40 + Math.random() * 80;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      const size = 4 + Math.random() * 7;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      els.fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 750);
    }
  }

  function toggleDone(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;

    // Un-complete: no ritual, just restore
    if (p.done) {
      p.done = false;
      p.updatedAt = Date.now();
      const othersActive = projects.filter(
        (x) => !x.done && x.id !== p.id
      ).length;
      p.rank = othersActive + 1;
      renumberRanks();
      save();
      render();
      pulseRanks();
      toast("Back on the stack");
      return;
    }

    const card = $(`.project-card[data-id="${id}"]`, els.list);
    if (!card || card.dataset.completing === "1") {
      // Fallback without animation
      p.done = true;
      p.updatedAt = Date.now();
      p.rank = projects.length + 1;
      renumberRanks();
      save();
      render();
      toast("Nice — one less thing hanging over you");
      return;
    }

    playCompleteRitual(id, card);
  }

  /**
   * Dopamine hit: rough pencil slash across the card → shrink to a singularity.
   */
  function playCompleteRitual(id, card) {
    card.dataset.completing = "1";
    card.style.pointerEvents = "none";

    const siblings = [...els.list.querySelectorAll(".project-card")].filter(
      (c) => c !== card
    );
    const rect = card.getBoundingClientRect();

    // Hold layout hole
    const spacer = document.createElement("li");
    spacer.className = "delete-spacer";
    spacer.style.height = `${rect.height}px`;
    spacer.setAttribute("aria-hidden", "true");
    card.replaceWith(spacer);

    // Floating full card for the ritual
    const ghost = card.cloneNode(true);
    ghost.classList.add("complete-ghost");
    ghost.classList.remove("entering", "is-sliding", "is-done");
    ghost.dataset.completing = "1";
    ghost.querySelectorAll("[data-action]").forEach((el) => {
      el.removeAttribute("data-action");
    });
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "3000",
      pointerEvents: "none",
      boxSizing: "border-box",
      transformOrigin: "center center",
      overflow: "visible",
    });
    document.body.appendChild(ghost);

    // Pencil slash overlay
    const slash = createPencilSlash();
    ghost.appendChild(slash);
    requestAnimationFrame(() => {
      slash.classList.add("is-drawing");
    });

    // After slash draws → singularity collapse
    const SLASH_MS = 420;
    const SINGULARITY_MS = 340;

    setTimeout(() => {
      ghost.classList.add("is-singularity");
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      spawnCompleteBurst(cx, cy);

      ghost.animate(
        [
          {
            transform: "scale(1)",
            borderRadius: "12px",
            opacity: 1,
            filter: "brightness(1)",
          },
          {
            transform: "scale(0.42)",
            borderRadius: "28px",
            opacity: 1,
            filter: "brightness(1.25)",
            offset: 0.55,
          },
          {
            transform: "scale(0)",
            borderRadius: "50%",
            opacity: 0,
            filter: "brightness(1.8)",
          },
        ],
        {
          duration: SINGULARITY_MS,
          easing: "cubic-bezier(0.55, 0.05, 0.85, 0.15)",
          fill: "forwards",
        }
      );

      setTimeout(() => {
        if (ghost.isConnected) ghost.remove();
        finishComplete(id, spacer, siblings);
      }, SINGULARITY_MS + 20);
    }, SLASH_MS);
  }

  function createPencilSlash() {
    const layer = document.createElement("div");
    layer.className = "pencil-slash-layer";
    const fid = `pencil-rough-${Math.random().toString(36).slice(2, 9)}`;
    // Wobbly hand-drawn paths + slight noise displacement for graphite texture
    layer.innerHTML = `
      <svg class="pencil-slash-svg" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="${fid}" x="-8%" y="-15%" width="116%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="4" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
        <!-- soft graphite under-stroke -->
        <path class="pencil-stroke pencil-under" pathLength="1" fill="none"
          stroke="#5c5750" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"
          d="M 6 54 L 50 46 L 100 40 L 150 30 L 196 22"/>
        <!-- main pencil graphite -->
        <path class="pencil-stroke pencil-main" pathLength="1" fill="none" filter="url(#${fid})"
          stroke="#c9c2b6" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"
          d="M 5 52 L 48 44 L 98 38 L 148 28 L 197 20"/>
        <!-- lighter edge scratch -->
        <path class="pencil-stroke pencil-hi" pathLength="1" fill="none"
          stroke="#ebe6dc" stroke-width="1.05" stroke-linecap="round" opacity="0.5"
          d="M 7 50 L 50 42 L 100 36 L 150 26 L 195 18"/>
        <!-- darker pressure line, slight offset -->
        <path class="pencil-stroke pencil-press" pathLength="1" fill="none"
          stroke="#3a3732" stroke-width="1.35" stroke-linecap="round" opacity="0.55"
          d="M 6 55 L 49 47 L 99 41 L 149 31 L 196 23"/>
      </svg>
    `;
    return layer;
  }

  function spawnCompleteBurst(x, y) {
    if (!els.fxLayer) return;
    for (let i = 0; i < 24; i++) {
      const s = document.createElement("span");
      s.className = i % 3 === 0 ? "spark spark-graphite" : "spark spark-mint";
      const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.35;
      const dist = 28 + Math.random() * 80;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      const size = 3 + Math.random() * 7;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      els.fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  function finishComplete(id, spacer, siblings) {
    if (!spacer || spacer.dataset.closing === "1") return;
    spacer.dataset.closing = "1";

    const p = projects.find((x) => x.id === id);
    if (p && !p.done) {
      p.done = true;
      p.updatedAt = Date.now();
      p.rank = projects.length + 1;
      renumberRanks();
      save();
    }

    flipCloseGap(siblings, () => {
      if (spacer.isConnected) spacer.remove();
    });

    updateRankBadgesInPlace();
    renderStats();

    if (els.showDone.checked && p) {
      const doneCard = createCard(p, siblings.length);
      // Append after FLIP invert has been applied so it doesn't thrash movers
      requestAnimationFrame(() => {
        els.list.appendChild(doneCard);
        requestAnimationFrame(() => {
          $$(".meter-fill", doneCard).forEach((fill) => {
            fill.style.width = fill.dataset.value + "%";
          });
        });
      });
    } else {
      els.empty.hidden = visibleProjects().length > 0;
    }

    toast("Nice — one less thing hanging over you");
  }

  // ─── Research credits ───────────────────────────────────
  function getResearchCredits() {
    const n = Number(settings.researchCredits);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : DEFAULT_RESEARCH_CREDITS;
  }

  function formatCreditsBalance(n = getResearchCredits()) {
    const count = Math.max(0, Number(n) || 0);
    return `${count} credit${count === 1 ? "" : "s"}`;
  }

  function syncCreditsBalanceUI() {
    const n = getResearchCredits();
    const short = formatCreditsBalance(n);
    const low = n > 0 && n <= 3;
    const empty = n <= 0;

    if (els.settingsCreditsBalance) {
      els.settingsCreditsBalance.textContent = short;
    }
    if (els.creditsModalBalance) {
      els.creditsModalBalance.textContent = `${short} remaining`;
    }
    if (els.statCredits) {
      els.statCredits.textContent = String(n);
    }
    if (els.statCreditsCard) {
      els.statCreditsCard.classList.toggle("is-low", low);
      els.statCreditsCard.classList.toggle("is-empty", empty);
      els.statCreditsCard.title = empty
        ? "Out of research credits — tap to top up"
        : low
          ? "Running low — tap to get more credits"
          : "Research credits — tap to top up";
      const hint = $(".stat-credits-hint", els.statCreditsCard);
      if (hint) {
        hint.textContent = empty
          ? "Out of credits — top up"
          : low
            ? "Running low — top up"
            : "Tap to top up";
      }
    }
    if (els.wizardCreditsStatus) {
      els.wizardCreditsStatus.textContent = empty
        ? "You’re out of research credits"
        : `You have ${n} remaining`;
    }
    if (els.wizardCreditsBar) {
      els.wizardCreditsBar.classList.toggle("is-low", low);
      els.wizardCreditsBar.classList.toggle("is-empty", empty);
    }
    const researchBtn = $("#wiz-run-research");
    if (researchBtn) {
      researchBtn.title = empty
        ? "Need research credits — top up or use demo / skip"
        : `Uses 1 research credit · ${n} left`;
    }
  }

  function setResearchCredits(n, { save = true } = {}) {
    settings.researchCredits = Math.max(0, Math.floor(Number(n) || 0));
    if (save) saveSettings();
    syncCreditsBalanceUI();
  }

  /** Spend one credit after a successful real Grok research run. */
  function consumeResearchCredit() {
    const n = getResearchCredits();
    if (n <= 0) return false;
    setResearchCredits(n - 1);
    return true;
  }

  function openCreditsModal(origin) {
    syncCreditsBalanceUI();
    openModal(els.creditsModal, origin || els.statCreditsCard);
  }

  function closeCreditsModal() {
    if (els.creditsModal) closeModal(els.creditsModal);
  }

  /** Dummy purchase — StoreKit lands in the Swift version. */
  function handleDummyCreditPurchase(tierLabel) {
    toast("Purchase flow coming in Swift version");
    void tierLabel;
  }

  // ─── Settings ───────────────────────────────────────────
  function syncSettingsForm() {
    if (els.settingsApiKey) els.settingsApiKey.value = settings.apiKey;
    if (els.settingsModel)
      els.settingsModel.value = settings.model || "grok-4-1-fast-reasoning";
    if (els.prefFocusLimit)
      els.prefFocusLimit.value = String(settings.focusLimit ?? 0);
    if (els.prefTheme) els.prefTheme.value = settings.theme || "ember";
    if (els.prefCompact) els.prefCompact.checked = !!settings.compactCards;
    if (els.prefReduceMotion)
      els.prefReduceMotion.checked = !!settings.reduceMotion;
    if (els.settingsStatus) {
      els.settingsStatus.textContent = settings.apiKey
        ? `API key saved (${maskKey(settings.apiKey)}). Model: ${settings.model}`
        : "No API key saved yet.";
    }
    syncCreditsBalanceUI();
    syncThemeSwatches(settings.theme || "ember");
  }

  function syncThemeSwatches(theme) {
    $$("[data-theme-pick]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.themePick === theme);
    });
  }

  function openSettings(origin) {
    syncSettingsForm();
    openModal(els.settingsModal, origin || $("#btn-settings"));
  }

  function closeSettingsModal() {
    // Revert live theme preview if user closed without saving
    applyPreferences(settings);
    closeModal(els.settingsModal);
  }

  function maskKey(key) {
    if (key.length < 10) return "••••";
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  }

  function readPreferencesFromForm() {
    const focusRaw = Number(els.prefFocusLimit?.value ?? 0);
    const focusLimit = FOCUS_LIMITS.includes(focusRaw) ? focusRaw : 0;
    const themeRaw = els.prefTheme?.value || "ember";
    const theme = THEMES.includes(themeRaw) ? themeRaw : "ember";
    return {
      focusLimit,
      theme,
      compactCards: !!els.prefCompact?.checked,
      reduceMotion: !!els.prefReduceMotion?.checked,
    };
  }

  function previewPreferencesFromForm() {
    const prefs = { ...settings, ...readPreferencesFromForm() };
    applyPreferences(prefs);
    syncThemeSwatches(prefs.theme);
  }

  function saveSettingsFromForm() {
    const prefs = readPreferencesFromForm();
    settings.apiKey = els.settingsApiKey.value.trim();
    settings.model = els.settingsModel.value;
    settings.focusLimit = prefs.focusLimit;
    settings.theme = prefs.theme;
    settings.compactCards = prefs.compactCards;
    settings.reduceMotion = prefs.reduceMotion;
    saveSettings();
    applyPreferences(settings);
    els.settingsStatus.textContent = settings.apiKey
      ? `Saved (${maskKey(settings.apiKey)}).`
      : "Key cleared.";
    renderList();
    renderStats();
    toast("Settings saved");
    closeModal(els.settingsModal);
  }

  function clearSettingsKey() {
    settings.apiKey = "";
    els.settingsApiKey.value = "";
    saveSettings();
    els.settingsStatus.textContent = "No API key saved yet.";
    toast("API key cleared");
  }

  function turnOffFocusMode() {
    settings.focusLimit = 0;
    saveSettings();
    if (els.prefFocusLimit) els.prefFocusLimit.value = "0";
    renderList();
    toast("Showing full stack");
  }

  // ─── Rerank ─────────────────────────────────────────────
  function openRerankModal(origin) {
    if (activeProjects().length < 2) {
      toast("Need at least two active projects to rerank");
      return;
    }
    normalizeWeightsTo100();
    syncLockButtons();
    // Highlight preset if current weights match one exactly
    const w = getWeights();
    const match = Object.keys(PRESETS).find((key) => {
      const p = PRESETS[key];
      return WEIGHT_KEYS.every((k) => p[k] === w[k]);
    });
    if (match) setActivePreset(match);
    else clearActivePreset();
    updateWeightLabels();
    renderPreview();
    openModal(els.rerankModal, origin || $("#btn-rerank"));
  }

  function closeRerankModal() {
    closeModal(els.rerankModal);
  }

  function updateWeightLabels() {
    const w = getWeights();
    els.wImportanceVal.textContent = `${w.importance}%`;
    els.wUrgencyVal.textContent = `${w.urgency}%`;
    els.wCostVal.textContent = `${w.cost}%`;
    els.wEffortVal.textContent = `${w.effort}%`;
    if (els.wTimeVal) els.wTimeVal.textContent = `${w.time}%`;
    const sum = weightSumOf(w);
    const lockedCount = WEIGHT_KEYS.filter((k) => weightLocks[k]).length;
    els.weightSum.textContent =
      sum === 100
        ? lockedCount
          ? `Totals 100% · ${lockedCount} locked`
          : "Totals 100% — lock a value to keep it while adjusting others"
        : `Weights total ${sum}%`;
    els.weightSum.classList.toggle("warn", sum !== 100);
  }

  function renderPreview() {
    const ranked = computeRankedOrder(getWeights());
    els.previewList.innerHTML = "";
    ranked.forEach((row, i) => {
      const li = document.createElement("li");
      li.className = "preview-item";
      li.style.animationDelay = `${i * 0.03}s`;
      const score = Math.round(row.score);
      li.innerHTML = `
        <span class="n" title="New rank">${i + 1}</span>
        <span class="t"></span>
        <span class="s" title="Weighted match score (0–100) from your criteria mix">
          <span class="s-value">${score}</span>
          <span class="s-unit">pts</span>
        </span>
      `;
      $(".t", li).textContent = row.project.title;
      els.previewList.appendChild(li);
    });
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    clearWeightLocks();
    setWeightInputs({
      importance: p.importance,
      urgency: p.urgency,
      cost: p.cost,
      effort: p.effort,
      time: p.time ?? 0,
    });
    setActivePreset(name);
    updateWeightLabels();
    renderPreview();
  }

  function setActivePreset(name) {
    $$("[data-preset]").forEach((btn) => {
      const on = btn.dataset.preset === name;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function clearActivePreset() {
    $$("[data-preset]").forEach((btn) => {
      btn.classList.remove("is-selected");
      btn.setAttribute("aria-pressed", "false");
    });
  }

  function applyRerank() {
    const ranked = computeRankedOrder(getWeights());
    if (ranked.length === 0) return;
    ranked.forEach((row, i) => {
      row.project.rank = i + 1;
      row.project.updatedAt = Date.now();
    });
    sortMode = "criteria";
    closeRerankModal();
    render();
    $$(".project-card", els.list).forEach((card, i) => {
      setTimeout(() => {
        card.classList.add("shuffling", "rank-pulse");
        setTimeout(
          () => card.classList.remove("shuffling", "rank-pulse"),
          700
        );
      }, i * 45);
    });
    toast("Stack reranked");
  }

  // ─── Modal helpers ──────────────────────────────────────
  const modalMap = {
    wizard: () => els.wizardModal,
    edit: () => els.editModal,
    detail: () => els.detailModal,
    dump: () => els.dumpModal,
    confirm: () => els.confirmModal,
    settings: () => els.settingsModal,
    credits: () => els.creditsModal,
    rerank: () => els.rerankModal,
  };

  /** @type {WeakMap<HTMLElement, Element | null>} */
  const modalOrigins = new WeakMap();
  /** @type {WeakMap<HTMLElement, ReturnType<typeof setTimeout>>} */
  const modalCloseTimers = new WeakMap();
  const MODAL_MOTION_MS = 145;

  /**
   * Open a modal. If originEl is a button/element, the panel flies from that
   * point (0 opacity, small) to center (full size) for a polished entrance.
   * @param {HTMLElement} root
   * @param {Element | Event | null} [origin]
   */
  function openModal(root, origin = null) {
    if (!root) return;
    // Cancel a pending close animation if reopening the same root
    clearModalCloseTimer(root);

    const originEl = resolveOriginEl(origin);
    modalOrigins.set(root, originEl);
    const panel = $(".modal", root);
    const backdrop = $(".modal-backdrop", root);

    root.hidden = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");

    if (panel) {
      const { dx, dy } = originOffsetFromCenter(originEl);
      panel.style.setProperty("--modal-from-x", `${dx}px`);
      panel.style.setProperty("--modal-from-y", `${dy}px`);
      panel.classList.remove("is-entering", "is-leaving");
      if (backdrop) backdrop.classList.remove("is-entering", "is-leaving");
      void panel.offsetWidth;
      panel.classList.add("is-entering");
      if (backdrop) backdrop.classList.add("is-entering");
    }
  }

  /** @param {Element | Event | null | undefined} origin */
  function resolveOriginEl(origin) {
    if (!origin) return null;
    if (origin instanceof Element) return origin;
    if (origin.currentTarget instanceof Element) return origin.currentTarget;
    if (origin.target instanceof Element) {
      return origin.target.closest("button, .btn, .stat-card, .icon-btn");
    }
    return null;
  }

  /** Vector from viewport center → origin (so translate starts at the button). */
  function originOffsetFromCenter(originEl) {
    if (!originEl || typeof originEl.getBoundingClientRect !== "function") {
      return { dx: 0, dy: 24 };
    }
    // Detached / display:none elements report 0×0 at 0,0 — fall back
    const r = originEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      return { dx: 0, dy: 24 };
    }
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return { dx: ox - cx, dy: oy - cy };
  }

  function prefersReducedMotion() {
    return (
      document.documentElement.getAttribute("data-reduce-motion") === "1" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
  }

  function clearModalCloseTimer(root) {
    const t = modalCloseTimers.get(root);
    if (t) {
      clearTimeout(t);
      modalCloseTimers.delete(root);
    }
  }

  function finishCloseModal(root) {
    clearModalCloseTimer(root);
    const panel = $(".modal", root);
    const backdrop = $(".modal-backdrop", root);
    if (panel) panel.classList.remove("is-entering", "is-leaving");
    if (backdrop) backdrop.classList.remove("is-entering", "is-leaving");
    root.hidden = true;
    const anyOpen = Object.values(modalMap).some((get) => {
      const el = get();
      return el && !el.hidden;
    });
    if (!anyOpen) {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    }
  }

  /**
   * Close a modal. Plays reverse origin zoom unless `instant` or reduce-motion.
   * @param {HTMLElement} root
   * @param {{ instant?: boolean }} [opts]
   */
  function closeModal(root, opts = {}) {
    if (!root || root.hidden) return;
    const panel = $(".modal", root);
    const backdrop = $(".modal-backdrop", root);
    const instant = Boolean(opts.instant) || prefersReducedMotion();

    // Already mid-exit
    if (panel?.classList.contains("is-leaving") && !instant) return;

    if (instant || !panel) {
      finishCloseModal(root);
      return;
    }

    // Refresh flight path to current button position (scroll/layout may change)
    const originEl = modalOrigins.get(root) || null;
    const { dx, dy } = originOffsetFromCenter(originEl);
    panel.style.setProperty("--modal-from-x", `${dx}px`);
    panel.style.setProperty("--modal-from-y", `${dy}px`);

    panel.classList.remove("is-entering");
    if (backdrop) backdrop.classList.remove("is-entering");
    void panel.offsetWidth;
    panel.classList.add("is-leaving");
    if (backdrop) backdrop.classList.add("is-leaving");

    const onEnd = (e) => {
      if (e.target !== panel) return;
      panel.removeEventListener("animationend", onEnd);
      finishCloseModal(root);
    };
    panel.addEventListener("animationend", onEnd);
    // Fallback if animationend is skipped (display:none mid-flight, etc.)
    const timer = setTimeout(() => {
      panel.removeEventListener("animationend", onEnd);
      finishCloseModal(root);
    }, MODAL_MOTION_MS + 40);
    modalCloseTimers.set(root, timer);
  }

  function anyModalOpen() {
    return Object.values(modalMap).some((get) => {
      const el = get();
      return el && !el.hidden;
    });
  }

  // ─── Export ─────────────────────────────────────────────
  function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      sortMode,
      projects,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded");
  }

  // ─── Events ─────────────────────────────────────────────
  function bindJuice() {
    // Click ripples on buttons (not preset chips — those use selected highlight instead)
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.closest(".chip[data-preset]")) return;
        const btn = e.target.closest(".btn, .icon-btn");
        if (!btn || btn.closest(".supplies-table")) return;
        spawnRipple(e, btn);
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 350);
      },
      true
    );

    // Cursor glow removed — was filling the viewport on some displays
  }

  function bindEvents() {
    bindJuice();

    $("#btn-add").addEventListener("click", (e) => openWizard(e.currentTarget));
    $("#btn-add-empty").addEventListener("click", (e) =>
      openWizard(e.currentTarget)
    );
    $("#btn-dump")?.addEventListener("click", (e) =>
      openDumpModal(e.currentTarget)
    );
    $("#btn-rerank").addEventListener("click", (e) =>
      openRerankModal(e.currentTarget)
    );
    $("#btn-export").addEventListener("click", exportBackup);
    $("#btn-settings").addEventListener("click", (e) =>
      openSettings(e.currentTarget)
    );
    els.statCreditsCard?.addEventListener("click", (e) =>
      openCreditsModal(e.currentTarget)
    );
    $("#btn-settings-credits")?.addEventListener("click", (e) => {
      openCreditsModal(e.currentTarget);
    });
    els.wizardGetCredits?.addEventListener("click", (e) =>
      openCreditsModal(e.currentTarget)
    );
    $$("[data-buy-tier]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleDummyCreditPurchase(btn.dataset.buyLabel || btn.dataset.buyTier);
      });
    });

    els.dumpText?.addEventListener("input", updateDumpPreview);
    els.dumpCommit?.addEventListener("click", commitBrainDump);
    $("#btn-apply-rerank").addEventListener("click", applyRerank);
    const dismissBanner = () => {
      if (!els.serverBanner) return;
      els.serverBanner.hidden = true;
      els.serverBanner.setAttribute("hidden", "");
      try {
        sessionStorage.setItem("stack.banner.dismissed", "1");
        localStorage.setItem("stack.banner.dismissed", "1");
      } catch {
        /* ignore */
      }
    };
    $("#dismiss-banner")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissBanner();
    });

    // Wizard
    $("#wiz-next-name").addEventListener("click", wizardNextFromName);
    $("#wiz-back-describe").addEventListener("click", wizardBackToName);
    $("#wiz-run-research").addEventListener("click", wizardStartResearch);
    $("#wiz-skip-research").addEventListener("click", wizardSkipResearch);
    $("#wiz-back-research").addEventListener("click", () => {
      setWizardStep("describe");
    });
    $("#wiz-retry-research").addEventListener("click", () => runResearch(false));
    $("#wiz-demo-research").addEventListener("click", () => runResearch(true));
    $("#wiz-reject").addEventListener("click", wizardReject);
    $("#wiz-approve").addEventListener("click", wizardApprove);
    $("#wiz-sync-total").addEventListener("click", wizardSyncTotal);
    $("#btn-add-supply").addEventListener("click", () =>
      addSupplyLine(wiz.supplies, els.suppliesBody, updateSuppliesTotalDisplay)
    );
    $("#btn-add-step")?.addEventListener("click", addWizardStep);

    els.wizTitle.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        wizardNextFromName();
      }
    });

    ["findImportance", "findUrgency", "findEffort"].forEach((key) => {
      els[key].addEventListener("input", syncFindSliders);
    });

    // Edit
    els.editForm.addEventListener("submit", saveEdit);
    $("#edit-add-supply").addEventListener("click", () =>
      addSupplyLine(editSupplies, els.editSuppliesBody)
    );
    ["editImportance", "editUrgency", "editEffort"].forEach((key) => {
      els[key].addEventListener("input", syncEditSliders);
    });

    $("#detail-edit").addEventListener("click", (e) => {
      const p = projects.find((x) => x.id === detailProjectId);
      closeModal(els.detailModal, { instant: true });
      if (p) openEditModal(p, e.currentTarget);
    });

    $("#detail-research")?.addEventListener("click", (e) => {
      const p = projects.find((x) => x.id === detailProjectId);
      if (p) openReresearch(p, e.currentTarget);
    });

    // Settings
    $("#settings-save").addEventListener("click", saveSettingsFromForm);
    $("#settings-clear").addEventListener("click", clearSettingsKey);
    els.prefTheme?.addEventListener("change", previewPreferencesFromForm);
    els.prefCompact?.addEventListener("change", previewPreferencesFromForm);
    els.prefReduceMotion?.addEventListener(
      "change",
      previewPreferencesFromForm
    );
    $$("[data-theme-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (els.prefTheme) els.prefTheme.value = btn.dataset.themePick;
        previewPreferencesFromForm();
      });
    });
    els.btnFocusShowAll?.addEventListener("click", turnOffFocusMode);

    els.showDone.addEventListener("change", () => {
      renderList();
      renderStats();
    });

    // Flush disk save when closing the desktop window / tab
    window.addEventListener("pagehide", () => {
      clearTimeout(saveTimer);
      if (fileStoreEnabled) {
        try {
          // keepalive helps finish the write as the window dies
          navigator.sendBeacon?.(
            `${location.origin}/api/store`,
            new Blob(
              [
                JSON.stringify({
                  projects,
                  settings,
                  meta: { sortMode, updatedAt: Date.now() },
                }),
              ],
              { type: "application/json" }
            )
          );
        } catch {
          /* ignore */
        }
        // Best-effort sync put as well (desktop close)
        persistDiskStore().catch(() => {});
      }
      writeLocalCache();
    });

    const weightKeyByEl = {
      wImportance: "importance",
      wUrgency: "urgency",
      wCost: "cost",
      wEffort: "effort",
      wTime: "time",
    };
    Object.keys(weightKeyByEl).forEach((elKey) => {
      const input = els[elKey];
      if (!input) return;
      input.addEventListener("input", () => {
        redistributeWeights(weightKeyByEl[elKey], input.value);
        clearActivePreset(); // manual tweak leaves presets unselected
        updateWeightLabels();
        renderPreview();
      });
    });

    $$("[data-lock]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleWeightLock(btn.dataset.lock);
        updateWeightLabels();
      });
    });

    $$("[data-preset]").forEach((btn) => {
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

    $("#confirm-ok")?.addEventListener("click", confirmDeleteProject);
    $("#confirm-cancel")?.addEventListener("click", closeConfirmModal);

    $$("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        const which = el.dataset.close;
        if (which === "wizard") closeWizard();
        if (which === "edit") closeEditModal();
        if (which === "detail") closeModal(els.detailModal);
        if (which === "dump") closeDumpModal();
        if (which === "confirm") closeConfirmModal();
        if (which === "settings") closeSettingsModal();
        if (which === "credits") closeCreditsModal();
        if (which === "rerank") closeRerankModal();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.confirmModal?.hidden) closeConfirmModal();
        else if (!els.wizardModal.hidden) closeWizard();
        else if (!els.dumpModal?.hidden) closeDumpModal();
        else if (!els.editModal.hidden) closeEditModal();
        else if (!els.detailModal.hidden) closeModal(els.detailModal);
        else if (els.creditsModal && !els.creditsModal.hidden) closeCreditsModal();
        else if (!els.settingsModal.hidden) closeSettingsModal();
        else if (!els.rerankModal.hidden) closeRerankModal();
      }
      // Enter confirms delete when that dialog is open
      if (
        e.key === "Enter" &&
        els.confirmModal &&
        !els.confirmModal.hidden &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        confirmDeleteProject();
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === "n" || e.key === "N") openWizard();
      if (e.key === "r" || e.key === "R") openRerankModal();
      if (e.key === "d" || e.key === "D") openDumpModal();
    });
  }

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }

  function maybeShowServerBanner() {
    if (!els.serverBanner) return;
    let dismissed = false;
    try {
      dismissed =
        sessionStorage.getItem("stack.banner.dismissed") === "1" ||
        localStorage.getItem("stack.banner.dismissed") === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed || isLocalServer()) {
      els.serverBanner.hidden = true;
      els.serverBanner.setAttribute("hidden", "");
      return;
    }
    els.serverBanner.hidden = false;
    els.serverBanner.removeAttribute("hidden");
  }

  // ─── Boot ───────────────────────────────────────────────
  async function boot() {
    await hydrateStore();
    applyPreferences(settings);
    bindEvents();
    maybeShowServerBanner();
    render();
  }

  boot().catch((err) => {
    console.error("Stack failed to start", err);
    try {
      document.body.innerHTML =
        "<pre style='padding:2rem;color:#f2ebe0;background:#12110f'>Stack failed to start.\n" +
        String(err && err.message ? err.message : err) +
        "</pre>";
    } catch {
      /* ignore */
    }
  });
})();
