#!/usr/bin/env python3
"""Split bar-exam PDFs in 'Questions Content/' into question + selected answers.
Output: data/raw_questions.json   (requires: pip install pymupdf)"""
import glob, json, os, re, sys
import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBJECTS = ["Contracts", "Torts", "Criminal Law", "Criminal Procedure", "Civil Procedure", "Evidence",
            "Professional Responsibility", "Community Property", "Constitutional Law",
            "Real Property", "Wills and Trusts", "Remedies", "Business Associations", "Not Included"]

Q_HEAD = re.compile(r"(?im)^[ \t]*QUESTION[ \t]+(\d)[ \t]*$")
A_HEAD = re.compile(r"(?im)^[ \t]*(?:QUESTION[ \t]+(\d)[ \t]*[:\u2013\u2014-][ \t]*SELECTED[ \t]+ANSWER[ \t]+([A-Z])"
                    r"|ANSWER[ \t]+([A-Z])[ \t]+TO[ \t]+QUESTION[ \t]+(\d))[ \t]*$")
TAIL = re.compile(r"(?is)\n[^\n]*(?:ESSAY\s+QUESTION\s+\d\s+OF\s+\d|Answer\s+all\s+(?:four\s+\(4\)|4)\s+questions).*$")


def clean(txt):
    lines = [l.rstrip() for l in txt.replace(" ", " ").split("\n")]
    lines = [l for l in lines if not re.fullmatch(r"\s*\d{1,3}\s*", l)]  # page numbers
    paras, cur = [], ""
    for l in lines:
        if not l.strip():
            if cur: paras.append(cur); cur = ""
        else:
            s = l.strip()
            cur = cur + s if cur.endswith("-") else (cur + " " + s if cur else s)
    if cur: paras.append(cur)
    return "\n\n".join(paras).strip()


def exam_label(head):
    m = re.search(r"(?i)\b(January|February|March|June|July|October|November)\s+(\d{4})", head)
    return f"{m.group(1).title()} {m.group(2)}" if m else "Unknown"


def subject_map(head):
    i = head.find("Subject")
    j = re.search(r"(?i)your answer should|answer all|instructions", head[i:])
    seg = head[i: i + j.start()] if j else head[i:i + 800]
    found = re.findall("|".join(SUBJECTS), seg)
    return {n + 1: (s if s != "Not Included" else None) for n, s in enumerate(found)}


def parse(path):
    t = "\n".join(p.get_text() for p in pymupdf.open(path))
    ah = [(m.start(), m.end(), int(m.group(1) or m.group(4)), (m.group(2) or m.group(3)).upper())
          for m in A_HEAD.finditer(t)]
    qh = {}
    for m in Q_HEAD.finditer(t):
        qh.setdefault(int(m.group(1)), (m.start(), m.end()))
    first_q = min(s for s, _ in qh.values()) if qh else len(t)
    exam = exam_label(t[:1500])
    subj = subject_map(t[:first_q])
    out = []
    for n in sorted(qh):
        s, e = qh[n]
        nxt = [a[0] for a in ah if a[0] > e and a[2] == n]
        qend = min(nxt) if nxt else len(t)
        qtext = TAIL.sub("", t[e:qend])
        answers = []
        for k, (a_s, a_e, an, label) in enumerate(ah):
            if an != n: continue
            end = ah[k + 1][0] if k + 1 < len(ah) else len(t)
            nq = [v[0] for q, v in qh.items() if v[0] > a_e]
            if nq: end = min(end, min(nq))
            body = TAIL.sub("", t[a_e:end])
            answers.append({"label": label, "text": clean(body)})
        out.append({"id": f"{exam.lower().replace(' ', '')}-q{n}", "exam": exam, "number": n,
                    "subject": subj.get(n), "facts": clean(qtext), "answers": answers,
                    "source": os.path.basename(path)})
    return out


if __name__ == "__main__":
    res = []
    for f in sorted(glob.glob(os.path.join(ROOT, "Questions Content", "*.pdf"))):
        qs = parse(f); res += qs
        print(f"{os.path.basename(f)[:48]:50} {len(qs)} questions", [(q['number'], q['subject'], len(q['answers'])) for q in qs], file=sys.stderr)
    json.dump(res, open(os.path.join(ROOT, "data", "raw_questions.json"), "w"), indent=1, ensure_ascii=False)
    print(len(res), "questions total")
