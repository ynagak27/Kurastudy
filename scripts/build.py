#!/usr/bin/env python3
"""Validate everything in content/ and write public/data/library.json (the one file the site reads).
Run after adding or changing any file in content/:  python3 scripts/build.py"""
import json, sys, re, datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
errs = []
def load(kind):
    out = []
    for p in sorted((ROOT / "content" / kind).glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            errs.append(f"{p.name}: not valid JSON ({e})"); continue
        if not isinstance(d, dict):
            errs.append(f"{p.name}: must be a JSON object"); continue
        d["id"] = p.stem
        out.append(d)
    return out
def need(d, name, keys):
    for k in keys:
        if d.get(k) in (None, "", []):
            errs.append(f"{name}: missing '{k}'")
def isdate(s): return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s or "")))

topics, lessons, news = load("topics"), load("lessons"), load("news")
tids = {t["id"] for t in topics}
for t in topics:
    need(t, f"topics/{t['id']}", ["name", "lang", "day", "syllabus"])
for l in lessons:
    nm = f"lessons/{l['id']}"
    need(l, nm, ["topic", "n", "title", "published", "body", "quiz"])
    if l.get("topic") not in tids: errs.append(f"{nm}: unknown topic {l.get('topic')!r}")
    if l["id"] != f"{l.get('topic')}-{int(l.get('n') or 0):02d}": errs.append(f"{nm}: file name must be <topic>-<NN>.json matching topic and n")
    if not isdate(l.get("published")): errs.append(f"{nm}: published must be YYYY-MM-DD")
    if re.search(r"^#{1,2} ", l.get("body") or "", re.M): errs.append(f"{nm}: body headings must be '### '")
    for i, q in enumerate(l.get("quiz") or []):
        if not (isinstance(q, dict) and q.get("q") and isinstance(q.get("options"), list) and len(q["options"]) == 4
                and isinstance(q.get("answer"), int) and 0 <= q["answer"] <= 3 and q.get("why")):
            errs.append(f"{nm}: quiz question {i+1} needs q, 4 options, answer 0-3, why")
    for s in l.get("sources") or []:
        if not str(s.get("url", "")).startswith("http"): errs.append(f"{nm}: source without http url")
for n in news:
    nm = f"news/{n['id']}"
    need(n, nm, ["topic", "added", "headline", "url"])
    if n.get("topic") not in tids: errs.append(f"{nm}: unknown topic {n.get('topic')!r}")
    if not isdate(n.get("added")): errs.append(f"{nm}: added must be YYYY-MM-DD")
if errs:
    print("BUILD FAILED:\n- " + "\n- ".join(errs)); sys.exit(1)
out = {"built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
       "topics": topics, "lessons": lessons, "news": news}
dst = ROOT / "public" / "data" / "library.json"
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"OK: {len(topics)} topics, {len(lessons)} lessons, {len(news)} news -> {dst.relative_to(ROOT)} ({dst.stat().st_size//1024} KB)")
