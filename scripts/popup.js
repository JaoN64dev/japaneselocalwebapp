// The dictionary popup: click a word (or drag-select text) to look it up. Works on every page.
//
// A page calls enableWordClicks(container, lineSelector, contextFor) for each area with words,
// and may call setPopupHooks({onOpen, onClose, media}) to pause/resume its player and
// provide audio/screenshot for Anki.

import { $ } from "./core/dom.js";
import { store, escapeHtml, getJson } from "./core/utils.js";
import { STATUSES, wordStatus, setWordStatus } from "./words/status.js";
import { plainText } from "./words/render.js";
import * as mining from "./mining.js";
import * as anki from "./anki/client.js";

const popup = $("#popup");
let ctx = null;   // { word, lemma, sentence, info, resume } for the open popup

const hooks = {
    onOpen: () => null,          // returns something handed back to onClose (e.g. "was playing")
    onClose: () => {},
    media: () => null,           // (info) -> media for Anki (see anki/client.js)
};
export const setPopupHooks = (h) => Object.assign(hooks, h);

export const isOpen = () => !popup.hidden;

// word = what was clicked (食べられなかった), lemma = its dictionary form (食べる) if known,
// info = what it came from ({source, time, videoName, cueStart, cueEnd}) for mined cards
async function lookup(word, { sentence = "", anchor, lemma, info = {} }) {
    const resume = hooks.onOpen();
    ctx = { word, lemma, sentence, info, resume };

    // in full screen only the full-screen element is visible, so the popup has to live inside it
    const host = document.fullscreenElement || home;
    if (popup.parentElement !== host) host.appendChild(popup);
    place(anchor);
    popup.hidden = false;
    popup.innerHTML = `<div class="popup-head"><b lang="ja">${escapeHtml(word)}</b><button class="close" title="close">✕</button></div><p class="muted">辞書を引いています…</p>`;

    try {
        const qs = new URLSearchParams();
        [...new Set([lemma, word].filter(Boolean))].forEach((q) => qs.append("q", q));
        qs.set("form", word);                    // so the server can explain the conjugation
        const result = await getJson("/api/dict?" + qs);
        if (!ctx || ctx.word !== word) return;   // another lookup started
        if (!ctx.lemma) ctx.lemma = result.query;
        render(word, result);
    } catch (err) {
        popup.querySelector("p").textContent = "lookup failed: " + err.message;
    }
}

// ---------- word status buttons ----------

function statusButtons(lemma) {
    const cur = wordStatus(lemma);
    return `<div class="status-buttons" title="how well you know ${escapeHtml(lemma)} (keys 1 2 3 4). ignored words never count as unknown">`
        + STATUSES.map(([s, label], i) =>
            `<button class="st st-${s}${s === cur ? " on" : ""}" data-status="${s}">${i + 1} ${label}</button>`).join("")
        + `</div>`;
}

export function setPopupStatus(status) {
    if (!ctx || !ctx.lemma) return;
    setWordStatus(ctx.lemma, status);
    const box = popup.querySelector(".status-buttons");
    if (box) box.outerHTML = statusButtons(ctx.lemma);
}

// ---------- pitch accent ----------

// "きょう" -> ["きょ", "う"]: small kana belong to the mora before them
const morae = (kana) => kana.match(/.[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]?/g) || [];

const PATTERN = (n, count) => (n === 0 ? "heiban: low, then stays high"
    : n === 1 ? "atamadaka: high, then drops"
    : n === count ? "odaka: rises, drops after the word"
    : `nakadaka: rises, drops after mora ${n}`);

// Draw a reading with a line over the high morae and a tick where the pitch drops
function pitchHtml(reading, n) {
    const m = morae(reading);
    const high = (i) => (n === 0 ? i > 0 : n === 1 ? i === 0 : i >= 1 && i < n);
    return `<span class="pitch" title="[${n}] ${PATTERN(n, m.length)}">`
        + m.map((mora, i) => `<span class="${[high(i) && "h", n > 0 && i === n - 1 && "drop"].filter(Boolean).join(" ")}">${escapeHtml(mora)}</span>`).join("")
        + `<sup>${n}</sup></span>`;
}

function readingHtml(e) {
    const p = (e.pitch || []).find((x) => x.reading === e.reading);
    if (p) return `<span class="reading" lang="ja">${p.accents.map((n) => pitchHtml(e.reading, n)).join(" ")}</span>`;
    return e.reading && e.reading !== e.word ? `<span class="reading" lang="ja">${escapeHtml(e.reading)}</span>` : "";
}

// ---------- conjugation + kanji ----------

function inflectionHtml(lemma, labels) {
    if (!labels || !labels.length) return "";
    return `<div class="inflection" title="how the word you clicked is conjugated">
        <span lang="ja">${escapeHtml(lemma)}</span> +
        ${labels.map((l) => `<span class="chip-sm">${escapeHtml(l)}</span>`).join("")}
    </div>`;
}

const KANJI_OPEN = "akko-kanji-open";

function kanjiHtml(list) {
    if (!list || !list.length) return "";
    const open = store.get(KANJI_OPEN, false);
    return `<details class="kanji-box"${open ? " open" : ""}>
        <summary>漢字 <small>${list.map((k) => escapeHtml(k.char)).join(" ")}</small></summary>
        <ul class="kanji-list">${list.map((k) => `
            <li>
                <span class="kanji-char" lang="ja">${escapeHtml(k.char)}</span>
                <div>
                    <b>${escapeHtml(k.meanings.join(", "))}</b>
                    ${k.on.length ? `<span lang="ja"><small>音</small> ${escapeHtml(k.on.join("、"))}</span>` : ""}
                    ${k.kun.length ? `<span lang="ja"><small>訓</small> ${escapeHtml(k.kun.join("、"))}</span>` : ""}
                    <span class="kanji-meta">${[k.jlpt, k.strokes && `${k.strokes} strokes`, k.grade && (k.grade <= 6 ? `grade ${k.grade}` : "secondary school")].filter(Boolean).join(" · ")}</span>
                </div>
            </li>`).join("")}
        </ul>
    </details>`;
}

// ---------- drawing ----------

function render(word, { entries, inflection, kanji }) {
    const body = entries.length ? entries.map((e, i) => {
        const senses = e.senses.slice(0, 5).map((s) =>
            `<li>${escapeHtml(s.gloss.join("; "))}`
            + (s.pos.length ? ` <small>${escapeHtml(s.pos.join(", "))}</small>` : "")
            + (s.misc.length ? ` <small class="misc">${escapeHtml(s.misc.join(", "))}</small>` : "")
            + `</li>`).join("");
        return `<div class="entry">
            <div class="entry-head">
                <span class="headword" lang="ja">${escapeHtml(e.word)}</span>
                ${readingHtml(e)}
                ${e.common ? `<span class="tag">common</span>` : ""}
                <button class="mine" data-i="${i}">+ mine</button>
            </div>
            ${e.forms.length ? `<div class="forms" lang="ja">also: ${escapeHtml(e.forms.join("、"))}</div>` : ""}
            <ol>${senses}</ol>
        </div>`;
    }).join("") : `<p class="muted">no dictionary entry for this. try selecting a longer or shorter bit of text.</p>`;

    const lemma = ctx && ctx.lemma;
    popup.innerHTML = `<div class="popup-head"><b lang="ja">${escapeHtml(word)}</b>
        ${lemma && lemma !== word ? `<span class="lemma" lang="ja">→ ${escapeHtml(lemma)}</span>` : ""}
        <a href="https://jisho.org/search/${encodeURIComponent(lemma || word)}" target="_blank" rel="noopener">jisho ↗</a>
        <button class="close" title="close">✕</button></div>
        ${inflectionHtml(lemma || word, inflection)}
        ${lemma ? statusButtons(lemma) : ""}${body}${kanjiHtml(kanji)}`;

    popup.querySelectorAll(".mine").forEach((btn) => btn.addEventListener("click", () =>
        mineEntry(entries[Number(btn.dataset.i)], btn)));
    // remember whether the kanji section is open
    const box = popup.querySelector(".kanji-box");
    if (box) box.addEventListener("toggle", () => store.set(KANJI_OPEN, box.open));
}

async function mineEntry(entry, btn) {
    const auto = anki.auto();
    btn.disabled = true;
    btn.textContent = auto ? "→ Anki…" : "✓ mined";
    // mining a word means you're learning it (unless you already know it)
    const lemma = (ctx && ctx.lemma) || entry.word;
    if (wordStatus(lemma) === "new") {
        if (ctx && ctx.lemma) setPopupStatus("learning");
        else setWordStatus(lemma, "learning");
    }
    const c = ctx || {};
    const ok = await mining.mine(entry, { word: c.word, sentence: c.sentence, info: c.info || {}, media: hooks.media(c.info || {}) });
    if (auto) btn.textContent = ok ? "✓ in Anki" : "✓ mined (Anki failed)";
}

// Position next to the word. Normally relative to the page; in full screen relative to the
// full-screen element (the popup sits inside it then).
function place(anchor) {
    const rect = anchor.getBoundingClientRect();
    const fs = document.fullscreenElement;
    const origin = fs ? fs.getBoundingClientRect() : { left: -window.scrollX, top: -window.scrollY };
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
    popup.style.width = width + "px";
    popup.style.left = left - origin.left + "px";
    // prefer above the word (subs sit at the bottom of the video)
    const above = rect.top > 320;
    popup.style.top = (above ? rect.top - 8 : rect.bottom + 8) - origin.top + "px";
    popup.classList.toggle("above", above);
}

export function closePopup() {
    if (popup.hidden) return;
    popup.hidden = true;
    if (ctx) hooks.onClose(ctx.resume);
    ctx = null;
}

// where the popup normally lives in the page
const home = popup.parentElement;

// ---------- clicking in text ----------

// Make words inside `container` clickable. lineSelector finds the line/paragraph around a click;
// contextFor(lineEl, wordEl) returns {sentence, info} for it (sentence defaults to the line's text).
export function enableWordClicks(container, lineSelector, contextFor = () => ({})) {
    container.addEventListener("mouseup", (e) => {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        const lineEl = e.target.closest(lineSelector);
        if (!lineEl || !container.contains(lineEl)) return;
        const w = e.target.closest(".w");
        const c = contextFor(lineEl, w) || {};
        const sentence = c.sentence ?? plainText(lineEl).trim();

        // selected text, minus any furigana that got caught in the selection
        const frag = range && !range.collapsed ? range.cloneContents() : null;
        if (frag) frag.querySelectorAll("rt").forEach((rt) => rt.remove());
        const selected = frag ? frag.textContent.replace(/\s+/g, "") : "";

        if (selected && lineEl.contains(sel.anchorNode)) {
            lookup(selected, { sentence, info: c.info, anchor: { getBoundingClientRect: () => range.getBoundingClientRect() } });
        } else if (w) {
            lookup(plainText(w), { sentence, info: c.info, anchor: w, lemma: w.dataset.b });
        }
    });
}

export function init() {
    popup.addEventListener("click", (e) => {
        const btn = e.target.closest(".st");
        if (btn) setPopupStatus(btn.dataset.status);
        if (e.target.classList.contains("close")) closePopup();
    });
    document.addEventListener("mousedown", (e) => {
        if (!popup.hidden && !popup.contains(e.target) && !e.target.closest(".w")) closePopup();
    });
    // leaving full screen: close the popup and put it back in the page
    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) return;
        closePopup();
        if (popup.parentElement !== home) home.appendChild(popup);
    });
}
