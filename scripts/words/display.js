// Furigana mode + word colouring, shared by every page (saved in "akko-settings")

import { store } from "../core/utils.js";

const KEY = "akko-settings";

export function wordDisplay() {
    const s = store.get(KEY, {});
    return { furigana: s.furigana || "unknown", colors: s.colors ?? true };
}

// furigana: always | unknown (only on words you don't know) | hover | off
export function applyWordDisplay() {
    const d = wordDisplay();
    document.body.dataset.furigana = d.furigana;
    document.body.classList.toggle("color-words", d.colors);
}

// Wire a furigana <select> and a colour checkbox
export function bindWordDisplay(select, checkbox) {
    const d = wordDisplay();
    select.value = d.furigana;
    checkbox.checked = d.colors;
    const save = () => {
        store.set(KEY, { ...store.get(KEY, {}), furigana: select.value, colors: checkbox.checked });
        applyWordDisplay();
    };
    select.addEventListener("input", save);
    checkbox.addEventListener("input", save);
    applyWordDisplay();
}
