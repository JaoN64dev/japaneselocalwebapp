// Manga: pages from images / a folder / .cbz, read right-to-left. With mokuro OCR
// (a .mokuro file, or mokuro's older per-page .json files) the text boxes sit on the
// page, invisible until hovered, with clickable words.

import { $ } from "../core/dom.js";
import { store, escapeHtml } from "../core/utils.js";
import { pctLevel } from "../words/status.js";
import { tokenize, tokensHtml, recolor, comprehension } from "../words/render.js";
import { watchHover } from "../words/hover.js";
import { enableWordClicks } from "../popup.js";
import { getJSZip } from "./import.js";

const PROGRESS = "akko-manga";
const IMAGE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp" };

const ui = {
    viewer: $("#manga-viewer"), stage: $("#manga-stage"), title: $("#manga-title"),
    page: $("#manga-page"), slider: $("#manga-slider"), next: $("#manga-next"), prev: $("#manga-prev"),
    double: $("#manga-double"), showText: $("#manga-showtext"),
    stats: $("#manga-stats"), badge: $("#manga-badge"), status: $("#manga-status"),
    recentWrap: $("#manga-recent-wrap"), recent: $("#manga-recent"), files: $("#manga-files"),
};

let book = null;               // {title, key, pages: [{name, url, ocr}]}
let index = 0;                 // first page of the current spread
let tokens = new Map();        // page -> block -> line -> tokens
let job = 0;

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const base = (name) => name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").toLowerCase();
const ext = (name) => (name.split(".").pop() || "").toLowerCase();

// ---------- opening ----------

export async function openFiles(fileList) {
    const files = [...fileList];
    const images = [];
    let volume = null;          // .mokuro file: {title, volume, pages: [{img_path, img_width, img_height, blocks}]}
    const pageOcr = {};         // older mokuro: one .json per page
    let archiveName = null;

    ui.status.textContent = "opening…";
    for (const f of files) {
        const e = ext(f.name);
        if (IMAGE.test(f.name)) {
            images.push({ name: f.webkitRelativePath || f.name, blob: f });
        } else if (e === "cbz" || e === "zip") {
            archiveName = f.name.replace(/\.[^.]+$/, "");
            const zip = await (await getJSZip()).loadAsync(f);
            for (const entry of Object.values(zip.files)) {
                if (entry.dir) continue;
                if (IMAGE.test(entry.name)) {
                    images.push({ name: entry.name, blob: new Blob([await entry.async("arraybuffer")], { type: MIME[ext(entry.name)] }) });
                } else if (/\.mokuro$/i.test(entry.name)) {
                    volume = JSON.parse(await entry.async("string"));
                }
            }
        } else if (e === "mokuro" || e === "json") {
            try {
                const j = JSON.parse(await f.text());
                if (Array.isArray(j.pages)) volume = j;
                else if (Array.isArray(j.blocks)) pageOcr[base(f.name)] = j;
            } catch { /* not OCR data */ }
        }
    }
    if (!images.length) {
        ui.status.textContent = "no images found there";
        return;
    }
    images.sort((a, b) => natural(a.name, b.name));

    const ocrByPage = { ...pageOcr };
    if (volume) volume.pages.forEach((p) => { ocrByPage[base(p.img_path || "")] = p; });
    const folder = images[0].name.includes("/") ? images[0].name.split("/")[0] : null;
    const title = (volume && (volume.volume || volume.title)) || folder || archiveName || base(images[0].name);

    if (book) book.pages.forEach((p) => URL.revokeObjectURL(p.url));
    book = {
        title,
        key: `${title}:${images.length}`,
        pages: images.map((img) => ({ name: img.name, url: URL.createObjectURL(img.blob), ocr: ocrByPage[base(img.name)] || null })),
    };
    const withText = book.pages.filter((p) => p.ocr && p.ocr.blocks.length).length;
    ui.status.textContent = `${images.length} pages` + (withText ? ` · text on ${withText} pages` : " · no OCR file, so no clickable text");

    job++;
    tokens = new Map();
    ui.title.textContent = title;
    ui.slider.max = book.pages.length - 1;
    ui.viewer.hidden = false;
    const saved = store.get(PROGRESS, {})[book.key];
    show(saved ? saved.page : 0);
    renderStats();
    if (withText) tokenizeVolume(job);
    ui.viewer.scrollIntoView({ behavior: "smooth" });
}

// ---------- showing pages ----------

// In two-page mode the cover is alone, then 1+2, 3+4, …
function spreadAt(i) {
    const n = book.pages.length;
    if (!ui.double.checked || i === 0) return [i];
    const start = i % 2 === 1 ? i : i - 1;
    return start + 1 < n ? [start, start + 1] : [start];
}

function blockHtml(p, b, block, page) {
    const w = page.ocr.img_width, h = page.ocr.img_height;
    const [x1, y1, x2, y2] = block.box;
    const lines = tokens.get(p)?.[b];
    const text = lines ? lines.map((t) => tokensHtml(t)).join("<br>") : block.lines.map(escapeHtml).join("<br>");
    return `<div class="ocr-block${block.vertical ? " v" : ""}" data-p="${p}" data-b="${b}"
        style="left:${(x1 / w) * 100}%;top:${(y1 / h) * 100}%;width:${((x2 - x1) / w) * 100}%;height:${((y2 - y1) / h) * 100}%;--fs:${block.font_size / h}">${text}</div>`;
}

function pageHtml(p) {
    const page = book.pages[p];
    const blocks = page.ocr ? page.ocr.blocks.map((b, i) => blockHtml(p, i, b, page)).join("") : "";
    return `<div class="manga-page" data-p="${p}"><img src="${page.url}" alt="page ${p + 1}" draggable="false"><div class="ocr-layer">${blocks}</div></div>`;
}

// OCR font sizes are relative to the page height
function sizeText() {
    ui.stage.querySelectorAll(".manga-page").forEach((el) => {
        const img = el.querySelector("img");
        if (img.clientHeight) el.style.setProperty("--page-h", img.clientHeight + "px");
    });
}

function show(i) {
    if (!book) return;
    const spread = spreadAt(Math.max(0, Math.min(i, book.pages.length - 1)));
    index = spread[0];
    ui.stage.innerHTML = spread.map(pageHtml).join("");
    ui.stage.querySelectorAll("img").forEach((img) => img.addEventListener("load", sizeText, { once: true }));
    sizeText();
    const last = spread[spread.length - 1];
    ui.page.textContent = `${index + 1}${last !== index ? "–" + (last + 1) : ""} / ${book.pages.length}`;
    ui.slider.value = index;

    const all = store.get(PROGRESS, {});
    all[book.key] = { title: book.title, total: book.pages.length, page: index, updated: Date.now() };
    store.set(PROGRESS, all);
}

export const nextPage = () => book && show(spreadAt(index).slice(-1)[0] + 1);
export const prevPage = () => book && show(index === 0 ? 0 : spreadAt(index - 1)[0]);
export const toggleText = () => { ui.showText.checked = !ui.showText.checked; applyShowText(); };
const applyShowText = () => ui.stage.classList.toggle("show-text", ui.showText.checked);

// ---------- words ----------

async function tokenizeVolume(myJob) {
    const lines = [];             // [page, block, line, text]
    book.pages.forEach((page, p) => page.ocr && page.ocr.blocks.forEach((block, b) =>
        block.lines.forEach((text, l) => lines.push([p, b, l, text]))));

    for (let s = 0; s < lines.length; s += 400) {
        const chunk = lines.slice(s, s + 400);
        let result;
        try { result = await tokenize(chunk.map((x) => x[3])); } catch { return; }
        if (myJob !== job) return;
        chunk.forEach(([p, b, l], k) => {
            if (!tokens.has(p)) tokens.set(p, []);
            const blocks = tokens.get(p);
            (blocks[b] = blocks[b] || [])[l] = result[k];
        });
        show(index);
        renderStats();
    }
}

function renderStats() {
    const lines = [...tokens.values()].flatMap((blocks) => blocks.flatMap((b) => b || []).filter(Boolean));
    if (!lines.length) { ui.stats.textContent = ""; ui.badge.hidden = true; return; }
    const c = comprehension(lines);
    ui.stats.textContent = `${c.unknown} unknown words`;
    ui.badge.hidden = false;
    ui.badge.className = "comp-badge inline " + pctLevel(c.pct);
    ui.badge.innerHTML = `<b>${c.pct}%</b> 理解`;
    ui.badge.title = `you know ${c.known} of the ${c.total} words in this volume (ignored words don't count)`;
}

// ---------- continue reading ----------

function renderRecent() {
    const recs = Object.values(store.get(PROGRESS, {})).sort((a, b) => b.updated - a.updated).slice(0, 8);
    ui.recentWrap.hidden = !recs.length;
    ui.recent.innerHTML = recs.map((r) => `
        <div class="resume-card" data-title="${escapeHtml(r.title)}">
            <div class="noimg">漫</div>
            <div class="info">
                <b lang="ja">${escapeHtml(r.title)}</b>
                <span>page ${r.page + 1} / ${r.total}</span>
                <div class="bar"><i style="width:${Math.round(((r.page + 1) / r.total) * 100)}%"></i></div>
            </div>
        </div>`).join("");
}

export function init() {
    ui.next.addEventListener("click", nextPage);
    ui.prev.addEventListener("click", prevPage);
    ui.slider.addEventListener("input", () => show(Number(ui.slider.value)));
    ui.double.addEventListener("input", () => { store.set("akko-manga-double", ui.double.checked); show(index); });
    ui.double.checked = store.get("akko-manga-double", false);
    ui.showText.addEventListener("input", applyShowText);
    window.addEventListener("resize", sizeText);

    // click the left half for the next page, the right half for the previous one (right-to-left)
    ui.stage.addEventListener("click", (e) => {
        if (e.target.closest(".ocr-block") || !book) return;
        const r = ui.stage.getBoundingClientRect();
        (e.clientX < r.left + r.width / 2 ? nextPage : prevPage)();
    });

    enableWordClicks(ui.stage, ".ocr-block", (el) => {
        const p = Number(el.dataset.p);
        return {
            sentence: book.pages[p].ocr.blocks[Number(el.dataset.b)].lines.join(""),
            info: { source: `${book.title} p.${p + 1}` },
        };
    });
    watchHover(ui.stage);

    window.addEventListener("akko-words-changed", () => {
        if (!book) return;
        recolor(ui.stage);
        renderStats();
    });

    ui.recent.addEventListener("click", (e) => {
        const card = e.target.closest(".resume-card");
        if (!card) return;
        ui.status.textContent = `open the pages of “${card.dataset.title}” to continue`;
        ui.files.value = "";
        ui.files.click();
    });
    window.addEventListener("akko-saved", renderRecent);
    renderRecent();
}
