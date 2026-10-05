#!/usr/bin/env python3
"""Build data/oscars.json and data/goyas.json from data-src/*.txt

Usage:  python3 tools/build.py
Run it from the project root (the folder that contains index.html).
Prints warnings for anything that looks wrong (missing directors, duplicate winners...).
"""
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def C(k, label, short, t="person", **kw):
    d = {"k": k, "label": label, "short": short, "t": t}
    d.update(kw)
    return d


FILM_CATS = lambda pic: [
    C("PIC", pic, "Picture", "title", main=True),
    C("DIR", "Best Director", "Director", director=True),
    C("ACTOR", "Best Actor", "Actor"),
    C("ACTRESS", "Best Actress", "Actress"),
    C("SUPACTOR", "Best Supporting Actor", "Supp. Actor"),
    C("SUPACTRESS", "Best Supporting Actress", "Supp. Actress"),
    C("SCORE", "Best Original Score", "Score", music=True),
    C("SONG", "Best Original Song", "Song", "song", music=True),
]

_o = FILM_CATS("Best Picture")
_g = FILM_CATS("Best Film")
_g[2]["label"], _g[3]["label"] = "Best Leading Actor", "Best Leading Actress"
_g[6]["label"], _g[7]["label"] = "Best Original Music", "Best Original Song"

AWARDS = {
    "oscars": {"file": "oscars.txt", "prefix": "o", "name": "Oscars", "long": "Academy Awards", "kind": "film", "cats": _o},
    "goyas": {"file": "goyas.txt", "prefix": "g", "name": "Goyas", "long": "Goya Awards", "kind": "film", "cats": _g},
    "emmys": {"file": "emmys.txt", "prefix": "e", "name": "Emmys", "long": "Primetime Emmy Awards", "kind": "tv", "cats": [
        C("SER_D", "Drama Series", "Drama", "title", main=True),
        C("SER_C", "Comedy Series", "Comedy", "title", main=True),
        C("SER_L", "Limited or Anthology Series / TV Movie", "Limited", "title", main=True),
        C("ACT_D", "Lead Actor, Drama", "Actor · Drama"),
        C("ACTR_D", "Lead Actress, Drama", "Actress · Drama"),
        C("ACT_C", "Lead Actor, Comedy", "Actor · Comedy"),
        C("ACTR_C", "Lead Actress, Comedy", "Actress · Comedy"),
        C("ACT_L", "Lead Actor, Limited / Movie", "Actor · Limited"),
        C("ACTR_L", "Lead Actress, Limited / Movie", "Actress · Limited"),
        C("SUPACT_D", "Supporting Actor, Drama", "Supp. Actor · Drama"),
        C("SUPACTR_D", "Supporting Actress, Drama", "Supp. Actress · Drama"),
        C("SUPACT_C", "Supporting Actor, Comedy", "Supp. Actor · Comedy"),
        C("SUPACTR_C", "Supporting Actress, Comedy", "Supp. Actress · Comedy"),
        C("SUPACT_L", "Supporting Actor, Limited / Movie", "Supp. Actor · Limited"),
        C("SUPACTR_L", "Supporting Actress, Limited / Movie", "Supp. Actress · Limited"),
        C("DIR_D", "Directing, Drama", "Directing · Drama"),
        C("DIR_C", "Directing, Comedy", "Directing · Comedy"),
        C("DIR_L", "Directing, Limited / Movie", "Directing · Limited"),
        C("SCORE", "Music Composition, Series", "Score", music=True),
        C("SCORE_L", "Music Composition, Limited / Movie", "Score · Limited", music=True),
        C("THEME", "Main Title Theme Music", "Theme", music=True),
        C("SONG", "Original Music and Lyrics", "Song", "song", music=True),
    ]},
    "globes": {"file": "globes.txt", "prefix": "gg", "name": "Globes", "long": "Golden Globe Awards", "kind": "tv", "cats": [
        C("SER_D", "Series, Drama", "Drama", "title", main=True),
        C("SER_C", "Series, Musical or Comedy", "Comedy", "title", main=True),
        C("SER_L", "Limited Series / TV Movie", "Limited", "title", main=True),
        C("ACT_D", "Actor, Drama Series", "Actor · Drama"),
        C("ACTR_D", "Actress, Drama Series", "Actress · Drama"),
        C("ACT_C", "Actor, Musical or Comedy Series", "Actor · Comedy"),
        C("ACTR_C", "Actress, Musical or Comedy Series", "Actress · Comedy"),
        C("ACT_L", "Actor, Limited Series / TV Movie", "Actor · Limited"),
        C("ACTR_L", "Actress, Limited Series / TV Movie", "Actress · Limited"),
        C("SUPACT", "Supporting Actor, Television", "Supp. Actor"),
        C("SUPACTR", "Supporting Actress, Television", "Supp. Actress"),
    ]},
}
CATS = sorted({c["k"] for a in AWARDS.values() for c in a["cats"]}, key=len, reverse=True)


def slug(text):
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t or "film"


def parse_items(line):
    items = []
    for raw in line.split(";"):
        raw = raw.strip()
        if not raw:
            continue
        won = raw.endswith("*")
        if won:
            raw = raw[:-1].strip()
        items.append((raw, won))
    return items


def parse_file(path):
    ceremonies = []
    directors = {}
    english = {}
    section = "main"
    cur = None
    with open(path, encoding="utf-8") as fh:
        for ln, line in enumerate(fh, 1):
            line = line.rstrip("\n")
            if not line.strip() or line.startswith("# "):
                continue
            if line.startswith("#DIRECTORS"):
                section = "directors"
                continue
            if line.startswith("#EN"):
                section = "en"
                continue
            if section == "directors":
                if "|" in line:
                    t, d = [x.strip() for x in line.split("|", 1)]
                    directors[t] = d
                continue
            if section == "en":
                if "|" in line:
                    t, e = [x.strip() for x in line.split("|", 1)]
                    english[t] = e
                continue
            if line.startswith("@"):
                year, ordinal, film_year = line[1:].split("|")
                cur = {"year": int(year), "ceremony": ordinal, "filmYear": int(film_year), "cats": {}}
                ceremonies.append(cur)
                continue
            m = re.match(r"^([A-Z_]+):\s*(.*)$", line)
            if m and m.group(1) in CATS and cur is not None:
                cur["cats"][m.group(1)] = parse_items(m.group(2))
            else:
                print(f"WARN {path}:{ln}: cannot parse line: {line[:60]}")
    return ceremonies, directors, english


def build(key):
    cfg = AWARDS[key]
    tv = cfg["kind"] == "tv"
    cats = cfg["cats"]
    src = os.path.join(ROOT, "data-src", cfg["file"])
    ceremonies, extra_directors, english = parse_file(src)
    ceremonies.sort(key=lambda c: c["year"])
    warnings = []
    missing = []
    out_years = []
    seen_titles = {}

    for c in ceremonies:
        films = {}
        order = []

        def film(title):
            if title not in films:
                films[title] = {"title": title, "noms": [], "director": None, "pic": None}
                order.append(title)
            return films[title]

        for cd in cats:
            cat = cd["k"]
            items = c["cats"].get(cat, [])
            winners = [i for i in items if i[1]]
            if items and len(winners) != 1 and not (key == "goyas" and c["year"] == 2025 and cat == "PIC"):
                warnings.append(f"{key} {c['year']} {cat}: {len(winners)} winners")
            for raw, won in items:
                if cd["t"] == "title":
                    f = film(raw)
                    if cd.get("main") and f["pic"] != "winner":
                        f["pic"] = "winner" if won else "nominee"
                    f["noms"].append({"c": cat, "w": won})
                elif cd["t"] == "song":
                    parts = raw.split("=")
                    if len(parts) != 3:
                        warnings.append(f"{key} {c['year']} {cat} malformed: {raw}")
                        continue
                    song, title, by = parts
                    f = film(title)
                    f["noms"].append({"c": cat, "p": song, "by": by, "w": won})
                else:
                    if "=" not in raw:
                        warnings.append(f"{key} {c['year']} {cat} malformed: {raw}")
                        continue
                    person, title = raw.split("=", 1)
                    f = film(title)
                    if cd.get("director"):
                        f["director"] = person
                    f["noms"].append({"c": cat, "p": person, "w": won})

        film_list = []
        for title in order:
            f = films[title]
            if not tv and not f["director"]:
                f["director"] = extra_directors.get(title)
            if not tv and not f["director"]:
                missing.append(f"{c['year']}: {title}")
            if tv and not f["director"]:
                f["director"] = extra_directors.get(title)
            en = english.get(title)
            fid = f"{cfg['prefix']}-{c['year']}-{slug(title)}"
            entry = {
                "id": fid,
                "title": title,
                "year": c["filmYear"],
                "director": f["director"],
                "pic": f["pic"],
                "noms": f["noms"],
            }
            if tv:
                entry["sid"] = "tv-" + slug(title)
            if en and en != title:
                entry["titleEn"] = en
            film_list.append(entry)
            seen_titles.setdefault(title, []).append(c["year"])

        def sort_key(f):
            rank = {"winner": 0, "nominee": 1, None: 2}[f["pic"]]
            wins = sum(1 for n in f["noms"] if n["w"])
            return (rank, -wins, -len(f["noms"]), f["title"])

        film_list.sort(key=sort_key)
        y = {"year": c["year"], "ceremony": c["ceremony"], "filmYear": c["filmYear"], "films": film_list}
        if not c["cats"]:
            y["upcoming"] = True
        out_years.append(y)

    if not tv:
        dup = {t: y for t, y in seen_titles.items() if len(y) > 1}
        if dup:
            warnings.append(f"{key}: same title in several years (directors map is per title): {dup}")

    data = {"id": key, "name": cfg["name"], "long": cfg["long"], "kind": cfg["kind"], "cats": cats, "years": out_years}
    out_path = os.path.join(ROOT, "data", f"{key}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(y["films"]) for y in out_years)
    print(f"{key}: {len(out_years)} ceremonies, {total} entries -> {os.path.relpath(out_path, ROOT)}")
    return warnings, missing


if __name__ == "__main__":
    all_missing = []
    all_warn = []
    for k in AWARDS:
        w, m = build(k)
        all_warn += w
        all_missing += [f"[{k}] {x}" for x in m]
    for w in all_warn:
        print("WARN", w)
    if all_missing:
        print(f"\n{len(all_missing)} films without a director:")
        for m in all_missing:
            print("  ", m)
        sys.exit(0)
    print("All films have a director.")
