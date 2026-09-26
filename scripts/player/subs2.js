// Second subtitles (a translation in any language), shown above the Japanese line.
// Plain text, not clickable, with its own delay since it's often from another release.
// Shown always, only while paused, or never ("akko-subs2-mode").

import { $, el } from "../core/dom.js";
import { store } from "../core/utils.js";
import { parseSubtitle } from "../subtitles/parse.js";
import * as progress from "../progress.js";

const MODES = [["paused", "when paused"], ["always", "always"], ["off", "off"]];
const MODE_KEY = "akko-subs2-mode";

const ui = {
    file: $("#sub2-file"), bar: $("#sub2-bar"), name: $("#sub2-name"), mode: $("#sub2-mode"),
    minus: $("#sub2-minus"), plus: $("#sub2-plus"), offset: $("#sub2-offset"), remove: $("#sub2-remove"),
    overlay: $("#sub2-overlay"),
};

let cues = [];
let offset = 0;
let raw = null;           // {text, ext, name}, for saving with the video
let restored = false;     // came from the saved session of the loaded video
let shownKey = null;

const linesBetween = (from, to) => cues.filter((c) => c.start + offset < to && c.end + offset > from);

// The translation of a Japanese line (by its time on the video), for Anki cards
export const textFor = (start, end) => (start === null || start === undefined ? ""
    : linesBetween(start, end).map((c) => c.text.replace(/\n/g, " ")).join(" "));

export function render() {
    const show = cues.length && (ui.mode.value === "always" || (ui.mode.value === "paused" && el.video.paused));
    const t = el.video.currentTime;
    const active = show ? cues.filter((c) => t >= c.start + offset && t < c.end + offset) : [];
    const key = active.map((c) => c.start + c.text).join("|");
    if (key === shownKey) return;
    shownKey = key;
    ui.overlay.replaceChildren(...active.map((c) => {
        const div = document.createElement("div");
        div.className = "line";
        div.textContent = c.text;
        return div;
    }));
}

function setOffset(v, { save = true } = {}) {
    offset = Math.round(v * 10) / 10;
    ui.offset.textContent = (offset > 0 ? "+" : "") + offset.toFixed(1) + "s";
    if (save) progress.update({ offset2: offset });
    shownKey = null;
    render();
}

// restoring = reloading the translation saved for this video
export function load(text, ext, name, { restoring = false, savedOffset = 0 } = {}) {
    cues = parseSubtitle(text, ext);
    raw = { text, ext, name };
    restored = restoring;
    ui.name.textContent = name;
    ui.name.title = `${name} (${cues.length} lines)`;
    ui.bar.hidden = false;
    setOffset(savedOffset, { save: false });
    if (!restoring) progress.saveSub2(raw);
}

export function clear({ save = true } = {}) {
    cues = [];
    raw = null;
    restored = false;
    ui.bar.hidden = true;
    ui.file.value = "";
    shownKey = null;
    render();
    if (save) progress.saveSub2(null);
}

// A video was opened: bring back its translation, keep one picked before the video,
// or drop the previous video's
export function onVideoOpened(saved, savedOffset) {
    if (saved) load(saved.text, saved.ext, saved.name, { restoring: true, savedOffset });
    else if (raw && !restored) progress.saveSub2(raw);
    else if (raw) clear({ save: false });
}

export function cycleMode() {
    const i = MODES.findIndex(([m]) => m === ui.mode.value);
    ui.mode.value = MODES[(i + 1) % MODES.length][0];
    ui.mode.dispatchEvent(new Event("change"));
}

async function loadFile() {
    const file = ui.file.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch { text = new TextDecoder("windows-1252").decode(buf); }    // older Western-language files
    load(text.replace(/^﻿/, ""), file.name.split(".").pop().toLowerCase(), file.name);
}

export function init() {
    ui.mode.innerHTML = MODES.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
    ui.mode.value = store.get(MODE_KEY, "paused");
    ui.mode.addEventListener("change", () => { store.set(MODE_KEY, ui.mode.value); shownKey = null; render(); });
    ui.file.addEventListener("change", loadFile);
    ui.minus.addEventListener("click", () => setOffset(offset - 0.1));
    ui.plus.addEventListener("click", () => setOffset(offset + 0.1));
    ui.remove.addEventListener("click", () => clear());
    for (const ev of ["play", "pause", "seeked"]) el.video.addEventListener(ev, render);
}
