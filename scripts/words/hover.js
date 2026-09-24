// Hover a word and press 1-4 to set its status

import { STATUSES, setWordStatus } from "./status.js";

let hoveredLemma = null;

export const hovered = () => hoveredLemma;

export function setHoveredStatus(status) {
    const lemma = hoveredLemma;
    if (!lemma) return;
    setWordStatus(lemma, status);      // pages re-colour on "akko-words-changed"
    // flash every copy of the word so it's clear what changed
    document.querySelectorAll(`.w[data-b="${CSS.escape(lemma)}"]`).forEach((w) => {
        w.classList.remove("flash");
        void w.offsetWidth;          // restart the animation
        w.classList.add("flash");
        w.dataset.flash = STATUSES.find(([s]) => s === status)[1];
    });
}

// Track the word under the mouse inside these elements
export function watchHover(...containers) {
    for (const box of containers) {
        box.addEventListener("mouseover", (e) => {
            const w = e.target.closest(".w[data-b]");
            if (w) hoveredLemma = w.dataset.b;
        });
        // re-rendering swaps the element under the mouse without a mouseout, so only
        // forget the word when the pointer really leaves it for something else
        box.addEventListener("mouseout", (e) => {
            const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".w[data-b]");
            if (!to && e.target.closest(".w[data-b]")) hoveredLemma = null;
        });
    }
}
