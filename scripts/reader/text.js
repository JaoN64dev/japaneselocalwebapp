// Reading a saved text: paragraphs with clickable words, furigana, % known, and the
// reading position remembered. Long books are split into words in batches, starting
// where you left off, so the page is usable right away.

import { $ } from "../core/dom.js";
import { store, escapeHtml } from "../core/utils.js";
import { pctLevel } from "../words/status.js";
import { tokenize, tokensHtml, recolor, comprehension, sentenceAround } from "../words/render.js";
import { bindWordDisplay } from "../words/display.js";
import { watchHover } from "../words/hover.js";
import { enableWordClicks } from "../popup.js";
import { updateText } from "./library.js";

const BATCH = 150;             // paragraphs per /api/tokenize request
const SETTINGS = "akko-reader";

const ui = {
    section: $("#reader-section"), text: $("#reader-text"), title: $("#reader-title"),
    stats: $("#reader-stats"), badge: $("#reader-badge"), back: $("#reader-back"),
    size: $("#reader-size"), vertical: $("#reader-vertical"),
};

let rec = null;                // the open text
let tokens = [];               // tokens per paragraph (undefined until analysed)
let job = 0;                   // bumps when another text opens, so old batches are dropped
let onClose = () => {};

export const isOpen = () => rec !== null;

export function openText(text) {
    job++;
    rec = text;
    tokens = new Array(text.paragraphs.length);
    ui.title.textContent = text.title;
    ui.text.innerHTML = text.paragraphs.map((p, i) => `<p data-i="${i}">${escapeHtml(p)}</p>`).join("");
    ui.section.hidden = false;
    renderStats();
    requestAnimationFrame(() => goTo(text.position || 0));
    tokenizeAll(job);
}

function close() {
    job++;
    rec = null;
    ui.section.hidden = true;
    ui.text.innerHTML = "";
    onClose();
}

// Scroll the reader (not the page) to paragraph i
function goTo(i) {
    const p = ui.text.children[i];
    if (!p) return;
    const y = window.scrollY;
    p.scrollIntoView({ block: "start", inline: "start", behavior: "instant" });
    window.scrollTo({ top: y, behavior: "instant" });
}

// ---------- splitting into words ----------

async function tokenizeAll(myJob) {
    const n = rec.paragraphs.length;
    const first = Math.floor((rec.position || 0) / BATCH) * BATCH;
    const starts = [];
    for (let s = first; s < n; s += BATCH) starts.push(s);
    for (let s = 0; s < first; s += BATCH) starts.push(s);

    for (const s of starts) {
        let batch;
        try { batch = await tokenize(rec.paragraphs.slice(s, s + BATCH)); } catch { return; }
        if (myJob !== job) return;
        batch.forEach((t, k) => {
            tokens[s + k] = t;
            ui.text.children[s + k].innerHTML = tokensHtml(t, { offsets: true });
        });
        renderStats();
    }
    savePct();
}

// ---------- % known ----------

function renderStats() {
    const done = tokens.filter(Boolean);
    if (!done.length) {
        ui.stats.textContent = "analysing…";
        ui.badge.hidden = true;
        return;
    }
    const c = comprehension(done);
    const analysed = Math.round((done.length / tokens.length) * 100);
    ui.stats.textContent = `${c.unknown} unknown words` + (analysed < 100 ? ` · analysing ${analysed}%` : "");
    ui.badge.hidden = false;
    ui.badge.className = "comp-badge inline " + pctLevel(c.pct);
    ui.badge.innerHTML = `<b>${c.pct}%</b> 理解`;
    ui.badge.title = `you know ${c.known} of the ${c.total} words in this text (ignored words don't count)`;
    return c.pct;
}

function savePct() {
    const done = tokens.filter(Boolean);
    if (rec && done.length === tokens.length) updateText(rec.id, { pct: comprehension(done).pct });
}

// ---------- reading position ----------

let saveTimer = null;
function trackPosition() {
    if (!rec) return;
    const r = ui.text.getBoundingClientRect();
    const vertical = ui.vertical.checked;
    const hit = document.elementFromPoint(vertical ? r.right - 30 : r.left + r.width / 2, vertical ? r.top + r.height / 2 : r.top + 16);
    const p = hit && hit.closest("#reader-text p[data-i]");
    if (!p) return;
    rec.position = Number(p.dataset.i);
    clearTimeout(saveTimer);
    const { id, position } = rec;
    saveTimer = setTimeout(() => updateText(id, { position }), 600);
}

// ---------- settings ----------

function applySettings(save = true) {
    ui.text.style.setProperty("--reader-size", ui.size.value + "px");
    ui.text.classList.toggle("vertical", ui.vertical.checked);
    if (save) store.set(SETTINGS, { size: Number(ui.size.value), vertical: ui.vertical.checked });
}

export function init({ onBack }) {
    onClose = onBack;
    const s = { size: 22, vertical: false, ...store.get(SETTINGS, {}) };
    ui.size.value = s.size;
    ui.vertical.checked = s.vertical;
    applySettings(false);
    ui.size.addEventListener("input", () => applySettings());
    ui.vertical.addEventListener("input", () => {
        const at = rec && rec.position;
        applySettings();
        if (rec) requestAnimationFrame(() => goTo(at));
    });
    bindWordDisplay($("#furigana-mode"), $("#color-words"));

    ui.back.addEventListener("click", close);
    ui.text.addEventListener("scroll", trackPosition, { passive: true });

    enableWordClicks(ui.text, "p[data-i]", (p, w) => {
        const text = rec.paragraphs[Number(p.dataset.i)];
        return {
            sentence: w && w.dataset.o !== undefined ? sentenceAround(text, Number(w.dataset.o)) : text,
            info: { source: rec.title },
        };
    });
    watchHover(ui.text);

    window.addEventListener("akko-words-changed", () => {
        if (!rec) return;
        recolor(ui.text);
        renderStats();
        savePct();
    });
}
