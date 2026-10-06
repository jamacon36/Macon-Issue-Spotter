#!/usr/bin/env python3
"""Merge data/raw_questions.json + data/keys/*.json -> docs/patterns.json"""
import glob, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Key files whose drafter did NOT read the student answers: foundIn is unreliable -> dropped, flagged.
FACTS_ONLY = set()  # all keys now drafted from full reads of both student answers

raw = {q["id"]: q for q in json.load(open(f"{ROOT}/data/raw_questions.json"))}
out, missing = [], set(raw)
for f in sorted(glob.glob(f"{ROOT}/data/keys/*.json")):
    exam = os.path.basename(f)[:-5]
    for k in json.load(open(f)):
        q = raw.get(k["id"])
        if not q: print("unknown id", k["id"]); continue
        missing.discard(k["id"])
        issues = k["issues"]
        if exam in FACTS_ONLY:
            for i in issues: i.pop("foundIn", None)
        out.append({"id": q["id"], "exam": q["exam"], "number": q["number"], "subject": q["subject"],
                    "facts": q["facts"], "answers": q["answers"], "issues": issues,
                    "confidence": k.get("confidence", "medium"), "notes": k.get("notes", ""),
                    "keyQuality": "facts-only" if exam in FACTS_ONLY else "full"})
json.dump(out, open(f"{ROOT}/docs/patterns.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "patterns written;", "no key yet:", sorted(missing))
