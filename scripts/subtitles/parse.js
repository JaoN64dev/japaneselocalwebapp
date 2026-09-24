// Subtitle files -> [{start, end, text}] (seconds)

function parseTimestamp(t) {
    // 00:01:02,345 | 00:01:02.345 | 01:02.345 | 0:01:02.34 (ass)
    const parts = t.trim().replace(",", ".").split(":").map(Number);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseSrtVtt(text) {
    const cues = [];
    const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
    for (const block of blocks) {
        const lines = block.split("\n");
        const i = lines.findIndex((l) => l.includes("-->"));
        if (i === -1) continue;
        const [a, b] = lines[i].split("-->");
        const body = lines.slice(i + 1).join("\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\{\\[^}]*\}/g, "")
            .trim();
        if (body) cues.push({ start: parseTimestamp(a), end: parseTimestamp(b.trim().split(/\s/)[0]), text: body });
    }
    return cues;
}

function parseAss(text) {
    const cues = [];
    let format = null;
    let inEvents = false;
    for (const raw of text.replace(/\r/g, "").split("\n")) {
        const line = raw.trim();
        if (/^\[events\]/i.test(line)) { inEvents = true; continue; }
        if (/^\[/.test(line)) { inEvents = false; continue; }
        if (!inEvents) continue;
        if (/^format:/i.test(line)) {
            format = line.slice(7).split(",").map((s) => s.trim().toLowerCase());
            continue;
        }
        if (!/^dialogue:/i.test(line) || !format) continue;
        const fields = line.slice(9).split(",");
        const textField = fields.slice(format.length - 1).join(",");
        const get = (name) => fields[format.indexOf(name)];
        if (/\\p[1-9]/.test(textField)) continue;             // vector drawings
        const body = textField
            .replace(/\{[^}]*\}/g, "")
            .replace(/\\[Nn]/g, "\n")
            .replace(/\\h/g, " ")
            .trim();
        if (!body) continue;
        cues.push({ start: parseTimestamp(get("start")), end: parseTimestamp(get("end")), text: body });
    }
    return cues;
}

// Sorted cues, without empty ones or exact duplicates (common in ass files with multiple layers)
export function parseSubtitle(text, ext) {
    const cues = (ext === "ass" || ext === "ssa" ? parseAss(text) : parseSrtVtt(text))
        .filter((c) => c.end > c.start)
        .sort((a, b) => a.start - b.start);
    return cues.filter((c, i) => !(i && c.text === cues[i - 1].text && c.start === cues[i - 1].start));
}
