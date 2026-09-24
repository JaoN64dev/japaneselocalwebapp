// Anime search (AniList)

import { el } from "./core/dom.js";
import { escapeHtml, getJson } from "./core/utils.js";
import { selectAnime } from "./subtitles/browser.js";

const ANILIST_QUERY = `
query ($q: String) {
  Page(perPage: 18) {
    media(search: $q, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      synonyms
      coverImage { large }
      episodes
      seasonYear
      format
    }
  }
}`;

async function search(q) {
    el.searchStatus.textContent = "探しています…";
    el.results.innerHTML = "";
    try {
        const data = await getJson("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: ANILIST_QUERY, variables: { q } }),
        });
        const list = data.data.Page.media;
        el.searchStatus.textContent = list.length ? "" : "nothing found :(";
        renderResults(list);
    } catch (err) {
        el.searchStatus.textContent = "search failed: " + err.message;
    }
}

function renderResults(list) {
    el.results.innerHTML = "";
    for (const anime of list) {
        const card = document.createElement("button");
        card.className = "card";
        card.innerHTML = `
            <img src="${escapeHtml(anime.coverImage.large)}" alt="" loading="lazy">
            <span class="card-native" lang="ja">${escapeHtml(anime.title.native || "")}</span>
            <span class="card-romaji">${escapeHtml(anime.title.romaji || anime.title.english || "")}</span>
            <span class="card-meta">${[anime.format, anime.seasonYear, anime.episodes && anime.episodes + " eps"].filter(Boolean).join(" · ")}</span>`;
        card.addEventListener("click", () => selectAnime(anime));
        el.results.appendChild(card);
    }
}

export function init() {
    el.searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = el.searchInput.value.trim();
        if (q) search(q);
    });
}
