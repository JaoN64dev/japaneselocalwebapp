// Pitch accent: n = the mora the pitch drops after (0 = never drops). Used by the popup and
// for Anki cards.

import { escapeHtml } from "../core/utils.js";

// "きょう" -> ["きょ", "う"]: small kana belong to the mora before them
export const morae = (kana) => kana.match(/.[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]?/g) || [];

export const pattern = (n, count) => (n === 0 ? "heiban: low, then stays high"
    : n === 1 ? "atamadaka: high, then drops"
    : n === count ? "odaka: rises, drops after the word"
    : `nakadaka: rises, drops after mora ${n}`);

export const isHigh = (n, i) => (n === 0 ? i > 0 : n === 1 ? i === 0 : i >= 1 && i < n);

const katakana = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// For Anki: inline styles only (the app's CSS isn't there), katakana like Kaishi's own cards
export function pitchCardHtml(reading, n) {
    const line = "border-color:currentColor;display:block;user-select:none;pointer-events:none;position:absolute;"
        + "top:0.1em;left:0;right:0;height:0;border-top-width:0.1em;border-top-style:solid;";
    const drop = "right:-0.1em;height:0.4em;border-right-width:0.1em;border-right-style:solid;";
    // one line over each run of high morae, with a tick at its end if the pitch drops there
    const runs = [];
    morae(katakana(reading)).forEach((mora, i) => {
        const last = runs[runs.length - 1];
        if (last && last.high === isHigh(n, i)) last.text += mora;
        else runs.push({ high: isHigh(n, i), text: mora, falls: false });
        if (n > 0 && i === n - 1) runs[runs.length - 1].falls = true;
    });
    return runs.map(({ high, text, falls }) => !high ? escapeHtml(text)
        : `<span style="display:inline-block;position:relative;${falls ? "padding-right:0.1em;margin-right:0.1em;" : ""}">`
            + `<span style="display:inline;">${escapeHtml(text)}</span><span style="${line}${falls ? drop : ""}"></span></span>`).join("");
}

export const pitchNotes = (reading, n) => `[${n}] ${pattern(n, morae(reading).length)}`;
