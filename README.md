# Film Awards — Oscars, Goyas, Emmys & Golden Globes

A phone-friendly site listing every nominee and winner of the **Oscars** and **Goyas** (under the *Films* tab) and the **Emmys** and **Golden Globes (TV)** (under the *Series* tab), ceremonies 2000–2026, plus empty *2027* entries ready to fill in. For each film or series you can tick **Seen**, give your own star rating, write comments, and open a detail page with all its nominations.

* Static site: plain HTML/CSS/JS, hosted for free on **GitHub Pages**. No server, no build step for the site itself.
* Works as a home-screen app and offline after the first visit.
* Your marks live **on your phone** (browser storage). A one-tap **backup/restore** is in Settings.

## What's in the data

| | |
|---|---|
| Ceremonies | Oscars 72nd–98th, Goyas 14th–40th, Emmys 52nd–78th, Globes 57th–83rd (all 2000–2026), plus 2027 (not held yet: shown as "coming up") |
| Film categories | Picture/Film, Director, Actor, Actress, Supporting Actor, Supporting Actress, Original Score, Original Song |
| Emmy categories | Drama/Comedy/Limited series, lead and supporting acting (drama, comedy, limited/movie), directing, music (score, limited score, main theme, song) |
| Globes (TV) categories | Drama/Comedy/Limited series, lead acting in each, supporting actor and actress |
| Year convention | "2026" = the year the ceremony was held (the films are from 2025) |
| Titles | Oscars: English title. Goyas: Spanish title with the English title underneath |

Notes:
* The 2025 Goyas (39th) had **two** Best Film winners (*El 47* and *La infiltrada*); the site shows both.
* Directors are included for every Best Director nominee and for most other films. The 31 films without one in the data (almost all of them only nominated for Original Song or Score) get the director from TMDB when you open them, if you've set up a TMDB key.
* Series: the *creator*, seasons, network, cast and where to watch come from TMDB when you open the series. A series keeps one "seen"/rating/comment across all its years and both awards.
* Emmys: the year is the end of the TV season (the 75th Emmys, held in January 2024, are listed as **2023**). The "Limited / Movie" categories include TV movies.
* Golden Globes: in 2023 two supporting categories (series vs limited/TV film) were merged into one list per gender, so each has two winners.
* The data was assembled from Wikipedia and the official Goya site. It was cross-checked, but if you spot a mistake, fix it in `data-src/` (see below) and it will be right for good.

## 1. Put it on GitHub Pages

1. Create a new **public** repository on github.com (e.g. `film-awards`).
2. Upload everything in this folder to it (on github.com: *Add file → Upload files*, drag the contents in, including the hidden `.nojekyll` and `.github` if your browser shows them).
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and Save.
4. After a minute your site is at `https://YOUR-USERNAME.github.io/film-awards/`.

On your phone open that link, then:
* **iPhone (Safari):** Share → *Add to Home Screen*.
* **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*.

> **Heads-up for iPhone:** the Home Screen app and Safari keep **separate** storage. Pick one (the Home Screen app is best), do your TMDB setup and marking there, and use *Export backup* if you ever want to move your data.

## 2. Posters, public ratings and synopsis (TMDB)

The site works without this (placeholders instead of posters), but TMDB adds posters, the public rating, synopsis, cast and "where to watch".

1. Make a free account at <https://www.themoviedb.org>.
2. Go to **Settings → API** and request an API key (choose "Developer", personal use). Copy the **API Key** (the short one).
3. In the app: **Settings → paste the key → Save & test**.

The key is saved only in your phone's browser; it is never part of the repo or of your backup. Posters load as you scroll and are cached; *Load all posters & ratings* fetches everything in one go. If a film gets the wrong poster, open it and use **Fix the match** to paste the right TMDB link.

## 3. Updating each year

All the data lives in plain-text files in `data-src/` (`oscars.txt`, `goyas.txt`, `emmys.txt`, `globes.txt`). The 2027 blocks already exist, empty: just add the category lines under them (header lines like `@2027|99th|2026`). Each year add one block **above** the `#EN` / `#DIRECTORS` sections at the bottom:

```
@2027|99th|2026
PIC: Film A*; Film B; Film C
DIR: Jane Doe=Film A*; John Roe=Film B
ACTOR: Some Actor=Film A*; Other Actor=Film C
ACTRESS: ...
SUPACTOR: ...
SUPACTRESS: ...
SCORE: Composer Name=Film A*; Other Composer=Film B
SONG: Song Title=Film C=Songwriter One, Songwriter Two*; Another Song=Film B=Writer
```

* `@ceremony year | ordinal | film year`
* The winner is marked with a trailing `*`; items are separated by `;`
* In the Goya file use Spanish titles, and add `Spanish title | English title` lines under `#EN`.
* Films with no Best Director nomination can get a line under `#DIRECTORS` (`Title | Director`), or leave them out and TMDB will fill it in.
* Spell a film's title the same way in every category.

Emmys / Globes use the same format with their own category keys (see the comment at the top of each file), e.g. `SER_D: Show A*; Show B`, `ACT_D: Actor=Show*`, `DIR_D: Director (Episode)=Show*`, `SONG: Song=Show=Writers*`.

Then rebuild the JSON:

* **On a computer:** `python3 tools/build.py`, then commit the four `data/*.json` files. It prints warnings for anything odd (a category with no winner, a malformed line).
* **From the phone / github.com:** edit the `.txt` file in the GitHub web editor and commit. The included workflow (`.github/workflows/build-data.yml`) rebuilds the JSON automatically — check the *Actions* tab if the site doesn't update after a couple of minutes.

New ceremonies show up on their own (the year list is built from the data).

**Please don't rename the title of an existing film** — your "seen" marks and comments are linked to the film by its ceremony year + title, so a rename would detach them.

## Files

```
index.html            the page
css/app.css           styles (dark/light follow the phone)
js/store.js           your marks, ratings, comments, backup/import
js/tmdb.js            TMDB lookups and caching
js/app.js             screens and navigation
sw.js, manifest…      offline + home-screen install
data/*.json           generated — don't edit by hand
data-src/*.txt        the real source of the data — edit these
tools/build.py        turns data-src into data/
```

## Credits

Film data and images: [TMDB](https://www.themoviedb.org). *This product uses the TMDB API but is not endorsed or certified by TMDB.* Streaming availability: JustWatch (via TMDB). Nominee data compiled from Wikipedia and premiosgoya.com.
