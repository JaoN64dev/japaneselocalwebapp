// Turning Japanese text into clickable, coloured words (used by every page)

import { escapeHtml, postJson } from "../core/utils.js";
import { wordStatus, counts, isUnknown } from "./status.js";

const segmenter = "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

// A token from /api/tokenize: {s: surface, b: dictionary form, f: furigana parts, c: counts as a word, n: name}.
// offset (optional) = where the token starts in its line, kept as data-o for finding the sentence.
export function tokenHtml(t, offset) {
    if (t.s === "\n") return "<br>";
    if (!t.b) return escapeHtml(t.s);
    const inner = t.f
        ? t.f.map((p) => p.r ? `<ruby>${escapeHtml(p.t)}<rt>${escapeHtml(p.r)}</rt></ruby>` : escapeHtml(p.t)).join("")
        : escapeHtml(t.s);
    const cls = t.c ? `w s-${wordStatus(t.b)}` : t.n ? "w name" : "w g";
    return `<span class="${cls}" data-b="${escapeHtml(t.b)}"${t.c ? ` data-c="1"` : ""}${offset !== undefined ? ` data-o="${offset}"` : ""}>${inner}</span>`;
}

export function tokensHtml(tokens, { offsets = false } = {}) {
    let at = 0;
    return tokens.map((t) => {
        const html = tokenHtml(t, offsets ? at : undefined);
        at += t.s.length;
        return html;
    }).join("");
}

// Until the server has tokenized a line: split with Intl.Segmenter (clickable, no colours)
export function plainHtml(text) {
    return text.split("\n").map((line) => {
        if (!segmenter) return escapeHtml(line);
        return [...segmenter.segment(line)].map((s) => s.isWordLike
            ? `<span class="w">${escapeHtml(s.segment)}</span>`
            : escapeHtml(s.segment)).join("");
    }).join("<br>");
}

// Re-colour words in place after statuses change (cheaper than re-rendering)
export function recolor(root) {
    root.querySelectorAll(".w[data-c]").forEach((w) => {
        const flash = w.classList.contains("flash");
        w.className = `w s-${wordStatus(w.dataset.b)}${flash ? " flash" : ""}`;
    });
}

// text of an element without the furigana
export function plainText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("rt").forEach((rt) => rt.remove());
    return clone.textContent;
}

// The sentence around position `at` in `text`
export function sentenceAround(text, at) {
    const END = /[。！？!?…\n]/;
    let start = at;
    while (start > 0 && !END.test(text[start - 1])) start--;
    let end = at;
    while (end < text.length && !END.test(text[end])) end++;
    while (end < text.length && /[。！？!?…」』）)]/.test(text[end])) end++;    // keep the punctuation + closing quote
    return text.slice(start, end).trim();
}

// Split lines into words on the server; retries while its tokenizer is still starting up
export async function tokenize(lines, attempt = 0) {
    try {
        return (await postJson("/api/tokenize", { lines })).tokens;
    } catch (err) {
        if (attempt >= 20) throw err;
        await new Promise((r) => setTimeout(r, 3000));
        return tokenize(lines, attempt + 1);
    }
}

// content words in a line you don't know yet
export const unknownIn = (tokens) => new Set(tokens.filter((t) => t.c && isUnknown(t.b)).map((t) => t.b));

// How much of these lines you know (counting repeats); i+1 = lines with exactly one unknown word
export function comprehension(lines) {
    let total = 0, known = 0, iPlus1 = 0;
    const unknown = new Set();
    for (const tokens of lines) {
        for (const t of tokens) {
            if (!t.c || !counts(t.b)) continue;
            total++;
            if (wordStatus(t.b) === "known") known++; else unknown.add(t.b);
        }
        if (unknownIn(tokens).size === 1) iPlus1++;
    }
    return { pct: total ? Math.round((known / total) * 100) : 0, total, known, unknown: unknown.size, iPlus1 };
}
