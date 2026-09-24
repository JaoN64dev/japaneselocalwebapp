// 観る Watch page (index.html): anime + Japanese subtitles.
// Modules only define things when imported; their init() wires the page, run here in order.

import { el } from "../core/dom.js";
import { state } from "../core/state.js";
import { timeFormatter } from "../core/utils.js";
import * as settings from "../player/settings.js";
import * as search from "../search.js";
import * as subtitles from "../subtitles/browser.js";
import * as video from "../player/video.js";
import * as dualAudio from "../player/dual-audio.js";
import * as fullscreen from "../player/fullscreen.js";
import * as cues from "../player/cues.js";
import * as render from "../player/render.js";
import * as popup from "../popup.js";
import * as mining from "../mining.js";
import * as ankiPanel from "../anki/panel.js";
import * as progress from "../progress.js";
import * as backup from "../backup.js";
import { watchHover } from "../words/hover.js";
import { initKeys } from "../keys.js";
import { remindBackup } from "../core/reminder.js";

for (const mod of [settings, search, subtitles, video, dualAudio, fullscreen, cues, render, popup, ankiPanel, progress, backup]) {
    mod.init();
}

// ---------- words in the subtitles ----------

// What a clicked line is: the sentence, and where it's from (for mined cards)
function cueContext(cue) {
    return {
        sentence: cue ? cue.text.replace(/\n/g, " ") : undefined,
        info: {
            source: [state.anime && (state.anime.title.native || state.anime.title.romaji), state.videoName].filter(Boolean).join(" — "),
            time: timeFormatter(el.video.currentTime),
            videoName: state.videoName,
            cueStart: cue ? cues.cueStart(cue) : null,
            cueEnd: cue ? cues.cueEnd(cue) : null,
        },
    };
}
popup.enableWordClicks(el.overlay, ".line", (line) => cueContext(state.cues[Number(line.dataset.cue)]));
popup.enableWordClicks(el.transcript, "li", (li) => cueContext(state.cues[[...el.transcript.children].indexOf(li)]));
watchHover(el.overlay, el.transcript);

// Anki can grab a screenshot + the line's audio when the card's video is the one loaded
function mediaFor(info) {
    if (!info.videoName || info.videoName !== state.videoName || !el.video.currentSrc) return null;
    return { player: el.video, audioFrom: dualAudio.isActive() ? dualAudio.audio : el.video, screenshot: true };
}

// looking a word up pauses the video; closing the popup resumes it
popup.setPopupHooks({
    onOpen: () => { const wasPlaying = !el.video.paused; el.video.pause(); return wasPlaying; },
    onClose: (wasPlaying) => { if (wasPlaying && !el.autoPause.checked && !state.recording) el.video.play(); },
    media: mediaFor,
});
mining.initList({ media: mediaFor });

// ---------- keys ----------

initKeys({
    " ": (e) => {
        if (e.target === el.video) return;     // the video's own controls handle it
        e.preventDefault();
        el.video.paused ? el.video.play() : el.video.pause();
    },
    a: cues.prevLine,
    s: cues.replayLine,
    d: cues.nextLine,
    h: settings.toggleHideSubs,
    f: fullscreen.toggleFullscreen,
    "[": () => cues.nudgeOffset(-0.1),
    "]": () => cues.nudgeOffset(0.1),
});

remindBackup();
