// Podcast RSS feeds and episode transcripts (both fetched through /api/podcasts/fetch)

import { getJson } from "../core/utils.js";
import { parseSubtitle } from "../subtitles/parse.js";

export const fetchText = (url) => getJson("/api/podcasts/fetch?" + new URLSearchParams({ url }));

// "1:02:03" / "02:03" / "3723" -> seconds
function seconds(d) {
    if (!d) return null;
    const parts = String(d).trim().split(":").map(Number);
    if (parts.some(isNaN)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const stripHtml = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();

export async function loadFeed(feedUrl) {
    const { text } = await fetchText(feedUrl);
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("that feed isn't valid RSS");
    const channel = xml.querySelector("channel");
    const get = (node, tag) => node.getElementsByTagName(tag)[0];
    const val = (node, tag) => get(node, tag)?.textContent.trim() || "";

    const episodes = [...channel.getElementsByTagName("item")].map((item) => {
        const enc = get(item, "enclosure");
        return {
            guid: val(item, "guid") || enc?.getAttribute("url") || val(item, "title"),
            title: val(item, "title"),
            date: val(item, "pubDate") ? new Date(val(item, "pubDate")) : null,
            duration: seconds(val(item, "itunes:duration")),
            audio: enc?.getAttribute("url") || "",
            description: stripHtml(val(item, "description") || val(item, "itunes:summary")).slice(0, 220),
            transcripts: [...item.getElementsByTagName("podcast:transcript")].map((t) => ({
                url: t.getAttribute("url"), type: t.getAttribute("type") || "", lang: t.getAttribute("language") || "",
            })),
        };
    }).filter((ep) => ep.audio);

    return {
        title: val(channel, "title"),
        author: val(channel, "itunes:author"),
        image: get(channel, "itunes:image")?.getAttribute("href") || val(get(channel, "image") || channel, "url"),
        episodes,
    };
}

// ---------- transcripts ----------

const JA = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆〜、。！？「」『』（）・…]";
const JA_GAP = new RegExp(`(?<=${JA})\\s+(?=${JA})`, "gu");
const isJa = (ch) => new RegExp(JA, "u").test(ch);

// Auto-generated transcripts often put a space between every character: み な さ ん
const tidy = (text) => text.replace(JA_GAP, "").replace(/[ \t]+/g, " ").trim();

// Glue cues into whole sentences (auto transcripts cut words in half between cues).
// Each sentence starts when its first cue starts and ends when its last cue ends.
function sentences(cues) {
    const chars = [];                              // [char, cue index]
    cues.forEach((c, i) => {
        const text = tidy(c.text.replace(/\n/g, " "));
        const prev = chars[chars.length - 1];
        if (prev && !(isJa(prev[0]) && isJa(text[0] || ""))) chars.push([" ", i]);
        for (const ch of text) chars.push([ch, i]);
    });

    const out = [];
    let cur = [];
    const flush = () => {
        const text = cur.map((c) => c[0]).join("").trim();
        if (text) out.push({ start: cues[cur[0][1]].start, end: cues[cur[cur.length - 1][1]].end, text });
        cur = [];
    };
    chars.forEach((c, k) => {
        cur.push(c);
        const next = chars[k + 1];
        const endsSentence = /[。！？!?]/.test(c[0]) && !(next && /[」』）)！？!?]/.test(next[0]));
        const tooLong = cur.length > 120 && next && next[1] !== c[1];    // no punctuation: cut at a cue boundary
        if (endsSentence || tooLong) flush();
    });
    if (cur.length) flush();
    return out;
}

// Text + type -> cues ({start, end, text}; start is null for untimed transcripts)
export function parseTranscript(text, type = "", name = "") {
    const kind = /vtt/.test(type) || /\.vtt$/i.test(name) ? "vtt"
        : /subrip|srt/.test(type) || /\.srt$/i.test(name) ? "srt"
        : /\.(ass|ssa)$/i.test(name) ? "ass"
        : /json/.test(type) || /\.json$/i.test(name) ? "json"
        : /html/.test(type) ? "html" : "text";

    let cues;
    if (kind === "json") {
        const j = JSON.parse(text);
        cues = (j.segments || []).map((s) => ({ start: Number(s.startTime), end: Number(s.endTime), text: s.body || "" }));
    } else if (kind === "vtt" || kind === "srt" || kind === "ass") {
        cues = parseSubtitle(text, kind);
    } else {
        const plain = kind === "html" ? stripHtml(text.replace(/<\/(p|div|br)>/gi, "\n")) : text;
        return plain.split(/\n+|(?<=[。！？])/).map(tidy).filter(Boolean).map((t) => ({ start: null, end: null, text: t }));
    }
    return sentences(cues.filter((c) => c.text.trim()));
}

// Best transcript for an episode: timed formats first
export function pickTranscript(transcripts) {
    const rank = (t) => [/vtt/, /subrip|srt/, /json/, /html/, /text/].findIndex((re) => re.test(t.type || t.url));
    return [...transcripts].sort((a, b) => (rank(a) + 1 || 9) - (rank(b) + 1 || 9))[0];
}
