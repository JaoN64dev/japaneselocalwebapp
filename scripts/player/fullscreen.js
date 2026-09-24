// Full screen for the whole player box (video + subtitles + % badge), not just the <video>,
// so the subtitles stay clickable. popup.js and toast.js follow into full screen by themselves.

import { $, el } from "../core/dom.js";
import { toast } from "../core/toast.js";

const stage = $("#stage");
const button = $("#fullscreen");

export const isFullscreen = () => document.fullscreenElement === stage;

export function toggleFullscreen() {
    if (isFullscreen()) document.exitFullscreen();
    else stage.requestFullscreen().catch(() => {});
}

export function init() {
    // (index.html also sets controlslist="nofullscreen": the video's own full-screen button
    // would leave the subtitles behind)
    el.video.addEventListener("dblclick", (e) => { e.preventDefault(); toggleFullscreen(); });
    button.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", () => {
        // Browsers that ignore controlslist (Firefox) can still put just the <video> in full
        // screen, without the subtitles. Swapping needs a fresh click, so leave it and explain.
        if (document.fullscreenElement === el.video) {
            const hint = () => toast("use the site's “full screen” button (or F) to keep the subtitles in full screen");
            document.exitFullscreen().then(hint, hint);
            return;
        }
        button.textContent = isFullscreen() ? "exit full screen" : "full screen";
    });
}
