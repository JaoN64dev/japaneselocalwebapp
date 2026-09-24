// Small message in the corner ("added 食べる to Anki ✓"), optionally with a link

let box = null;
let timer = null;

// action: { label, href } shows a link after the text; timeout in ms (default 3.5 s, 6 s if bad)
export function toast(text, bad = false, { action = null, timeout = bad ? 6000 : 3500 } = {}) {
    if (!box) {
        box = document.createElement("div");
        box.className = "toast";
        box.setAttribute("role", "status");
    }
    // in full screen only the full-screen element is visible (but a <video> can't show children)
    const fs = document.fullscreenElement;
    const host = fs && !(fs instanceof HTMLMediaElement) ? fs : document.body;
    if (box.parentElement !== host) host.appendChild(box);
    box.textContent = text;
    if (action) {
        const a = document.createElement("a");
        a.href = action.href;
        a.textContent = action.label;
        box.append(" ", a);
    }
    box.classList.toggle("bad", bad);
    box.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => box.classList.remove("show"), timeout);
}
