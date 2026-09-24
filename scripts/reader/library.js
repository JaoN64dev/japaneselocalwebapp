// Saved texts (IndexedDB "texts"): {id, title, paragraphs, chars, position, pct, created, updated}

import { idbAll, idbGet, idbPut, idbDelete } from "../core/idb.js";
import { escapeHtml } from "../core/utils.js";
import { pctLevel } from "../words/status.js";

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));

export async function addText(title, paragraphs) {
    const now = Date.now();
    const rec = {
        id: newId(), title: title || "untitled", paragraphs,
        chars: paragraphs.reduce((n, p) => n + p.length, 0),
        position: 0, pct: null, created: now, updated: now,
    };
    await idbPut("texts", rec);
    return rec;
}

export const getText = (id) => idbGet("texts", id);
export const removeText = (id) => idbDelete("texts", id);

// Save reading position / % known on the stored record
export async function updateText(id, fields) {
    const rec = await idbGet("texts", id);
    if (rec) await idbPut("texts", { ...rec, ...fields, updated: Date.now() });
}

export async function renderLibrary(list, { onOpen, onDelete }) {
    const texts = (await idbAll("texts")).sort((a, b) => b.updated - a.updated);
    if (!texts.length) {
        list.innerHTML = `<li class="empty">nothing here yet. paste some text or open a book (.epub / .txt).</li>`;
        return;
    }
    list.innerHTML = texts.map((t) => {
        const read = t.paragraphs.length > 1 ? Math.round((t.position / (t.paragraphs.length - 1)) * 100) : 0;
        return `<li class="note library-item" data-id="${escapeHtml(t.id)}">
            <div class="library-main">
                <b lang="ja">${escapeHtml(t.title)}</b>
                <span class="library-meta">${t.chars.toLocaleString()} characters · ${t.paragraphs.length.toLocaleString()} paragraphs
                    ${t.pct != null ? ` · <span class="pct ${pctLevel(t.pct)}">${t.pct}% 理解</span>` : ""}</span>
                <div class="bar" title="${read}% read"><i style="width:${read}%"></i></div>
            </div>
            <button class="open">read</button>
            <button class="remove" title="delete">✕</button>
        </li>`;
    }).join("");
    list.onclick = (e) => {
        const item = e.target.closest(".library-item");
        if (!item) return;
        if (e.target.closest(".remove")) onDelete(item.dataset.id, item.querySelector("b").textContent);
        else onOpen(item.dataset.id);
    };
}
