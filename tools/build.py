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
CATS = ["PIC", "DIR", "ACTOR", "ACTRESS", "SUPACTOR", "SUPACTRESS", "SCORE", "SONG"]

AWARDS = {
    "oscars": {"file": "oscars.txt", "prefix": "o", "name": "Oscars"},
    "goyas": {"file": "goyas.txt", "prefix": "g", "name": "Goyas"},
}


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
            m = re.match(r"^([A-Z]+):\s*(.*)$", line)
            if m and m.group(1) in CATS and cur is not None:
                cur["cats"][m.group(1)] = parse_items(m.group(2))
            else:
                print(f"WARN {path}:{ln}: cannot parse line: {line[:60]}")
    return ceremonies, directors, english


def build(key):
    cfg = AWARDS[key]
    src = os.path.join(ROOT, "data-src", cfg["file"])
    ceremonies, extra_directors, english = parse_file(src)
    warnings = []
    missing = []
    out_years = []
    seen_titles = {}

    for c in ceremonies:
        films = {}  # title -> film dict
        order = []

        def film(title):
            if title not in films:
                films[title] = {"title": title, "noms": [], "director": None, "pic": None}
                order.append(title)
            return films[title]

        for cat in CATS:
            items = c["cats"].get(cat, [])
            winners = [i for i in items if i[1]]
            if items and len(winners) != 1 and not (key == "goyas" and c["year"] == 2025 and cat == "PIC"):
                warnings.append(f"{key} {c['year']} {cat}: {len(winners)} winners")
            for raw, won in items:
                if cat == "PIC":
                    f = film(raw)
                    f["pic"] = "winner" if won else "nominee"
                    f["noms"].append({"c": "PIC", "w": won})
                elif cat == "DIR":
                    person, title = raw.split("=", 1)
                    f = film(title)
                    f["director"] = person
                    f["noms"].append({"c": "DIR", "p": person, "w": won})
                elif cat == "SONG":
                    parts = raw.split("=")
                    if len(parts) != 3:
                        warnings.append(f"{key} {c['year']} SONG malformed: {raw}")
                        continue
                    song, title, by = parts
                    f = film(title)
                    f["noms"].append({"c": "SONG", "p": song, "by": by, "w": won})
                else:
                    if "=" not in raw:
                        warnings.append(f"{key} {c['year']} {cat} malformed: {raw}")
                        continue
                    person, title = raw.split("=", 1)
                    f = film(title)
                    f["noms"].append({"c": cat, "p": person, "w": won})

        film_list = []
        for title in order:
            f = films[title]
            if not f["director"]:
                f["director"] = extra_directors.get(title)
            if not f["director"]:
                missing.append(f"{c['year']}: {title}")
            f["year"] = c["filmYear"]
            en = english.get(title)
            f["id"] = f"{cfg['prefix']}-{c['year']}-{slug(title)}"
            entry = {
                "id": f["id"],
                "title": title,
                "year": c["filmYear"],
                "director": f["director"],
                "pic": f["pic"],
                "noms": f["noms"],
            }
            if en and en != title:
                entry["titleEn"] = en
            film_list.append(entry)
            seen_titles.setdefault(title, []).append(c["year"])

        def sort_key(f):
            rank = {"winner": 0, "nominee": 1, None: 2}[f["pic"]]
            wins = sum(1 for n in f["noms"] if n["w"])
            return (rank, -wins, -len(f["noms"]), f["title"])

        film_list.sort(key=sort_key)
        out_years.append({
            "year": c["year"],
            "ceremony": c["ceremony"],
            "filmYear": c["filmYear"],
            "films": film_list,
        })

    dup = {t: y for t, y in seen_titles.items() if len(y) > 1}
    if dup:
        warnings.append(f"{key}: same title in several years (directors map is per title): {dup}")

    data = {"id": key, "name": cfg["name"], "years": out_years}
    out_path = os.path.join(ROOT, "data", f"{key}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(y["films"]) for y in out_years)
    print(f"{key}: {len(out_years)} ceremonies, {total} films -> {os.path.relpath(out_path, ROOT)}")
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
