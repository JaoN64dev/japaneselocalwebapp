// Player toolbar settings (remembered between visits). Furigana + colours are shared
// with the other pages (words/display.js).

import { el } from "../core/dom.js";
import { store } from "../core/utils.js";
import { bindWordDisplay } from "../words/display.js";

const KEY = "akko-settings";

function current() {
    return { autoPause: false, hoverPause: true, blur: false, hide: false, size: 28, ...store.get(KEY, {}) };
}

export function applySettings() {
    const s = {
        autoPause: el.autoPause.checked,
        hoverPause: el.hoverPause.checked,
        blur: el.blurSubs.checked,
        hide: el.hideSubs.checked,
        size: Number(el.subSize.value),
    };
    el.overlay.classList.toggle("blurred", s.blur);
    el.overlay.classList.toggle("hidden", s.hide);
    el.overlay.style.setProperty("--sub-size", s.size + "px");
    document.getElementById("sub2-overlay").style.setProperty("--sub-size", s.size + "px");
    store.set(KEY, { ...store.get(KEY, {}), ...s });
}

export function toggleHideSubs() {
    el.hideSubs.checked = !el.hideSubs.checked;
    applySettings();
}

export function init() {
    const s = current();
    el.autoPause.checked = s.autoPause;
    el.hoverPause.checked = s.hoverPause;
    el.blurSubs.checked = s.blur;
    el.hideSubs.checked = s.hide;
    el.subSize.value = s.size;
    [el.autoPause, el.hoverPause, el.blurSubs, el.hideSubs, el.subSize].forEach((i) => i.addEventListener("input", applySettings));
    applySettings();
    bindWordDisplay(el.furigana, el.colorWords);
}
