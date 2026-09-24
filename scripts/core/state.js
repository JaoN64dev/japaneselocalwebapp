// State shared between modules. Anything only one module needs lives in that module.

export const state = {
    anime: null,          // selected AniList entry
    cues: [],             // parsed subtitle lines {start, end, text, tokens?}
    subName: "",
    subRaw: null,         // {text, ext, name} of the loaded subtitle, for saving progress
    subRestored: false,   // subs came from a saved session rather than a fresh pick
    videoName: "",
    offset: 0,            // seconds added to every cue
    activeIdx: -1,        // transcript line that's playing
    recording: false,     // true while grabbing audio/screenshot for Anki
};
