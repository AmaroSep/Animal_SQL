"""Parse the lab's LN2 tank spreadsheets ("Rack N_CLR lab_LN2 tank.xlsx", one sheet per
box, 81 wells each) into the LN2 module's import format.

Usage:
    python3 scripts/import_ln2_excel.py <folder>              # dry run: summary + JSON
    python3 scripts/import_ln2_excel.py <folder> --post URL   # also send to URL/ln2/import

Requires openpyxl. Nothing is lost: text that cannot be parsed into a field is kept
in the vial's freeze_note / comments or in the box notes.
"""
import argparse
import glob
import json
import os
import re
import sys
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta

import openpyxl

MONTHS = {m: i for i, names in enumerate([
    (), ("jan", "january", "ene", "enero"), ("feb", "february", "febrero"), ("mar", "march", "marzo"),
    ("apr", "april", "abr", "abril"), ("may", "mayo"), ("jun", "june", "junio"), ("jul", "july", "julio"),
    ("aug", "august", "ago", "agosto"), ("sep", "sept", "september", "septiembre"),
    ("oct", "october", "octubre"), ("nov", "november", "noviembre"), ("dec", "december", "dic", "diciembre"),
]) for m in names}

# Wells with vial data but an empty "Cells" column, resolved case by case with the lab
# (rack, box, well) -> name and comment to use
NAMELESS_OVERRIDES = {
    (3, 3, 35): dict(cell_line="Healthy Control HU IPSC Line SCTI003-A", comment="Batch 2411401002; Received 1-30-26",
                     clear=("protein", "derived")),
    (2, 10, 61): dict(cell_line="Unnamed (CFP 2024-04)"),
    (2, 10, 62): dict(cell_line="Unnamed (CFP 2024-04)"),
    (2, 10, 63): dict(cell_line="Unnamed (CFP 2024-04)"),
}

BOILERPLATE = re.compile(r"please don.t change the format", re.I)
RESTRICTION = re.compile(r"exclusively|only|do not stor|do not add|don.t add|please do not store", re.I)
# A note saying the vial has left the tank. "Thaw, expand and freeze from..." (how the
# stock was made) and "Please don't thaw" do not match.
REMOVED = re.compile(r"\b(thawed|removed?|gave to|given to)\b|\bthaw\s+(on|for)\b", re.I)
MASTER = re.compile(r"master stock|do not thaw|don.t thaw", re.I)
PASSAGE_LIKE = re.compile(r"^\s*p\s*(\d|unknown)", re.I)
INITIALS_BEFORE = re.compile(r"\b([A-Z]{2,4})\s+(?:removed|thawed|remove)\b")
INITIALS_AFTER = re.compile(r"\b(?:removed|thawed|remove)\s+(?:on\s+\S+\s+)?(?:by\s+)?([A-Z]{2,4})\b|\(([A-Za-z]{2,10})\)|\bby\s+([A-Z]{2,4})\b")
PREP_INITIALS = re.compile(r"\b([A-Z]{2,3})\s+(?:prep|frozen)\b")
# Cells per vial: 2x106 (= 2x10^6 with the superscript lost), 2.56*106, 2E5, 10e6, 10^6 cells
CELLS = re.compile(
    r"(?<![\w.])(\d+(?:\.\d+)?)\s*[xX×*]\s*10\^?\s*(\d)(?!\d)(?!\s*/\s*well)"
    r"|(?<![\w.])(\d+(?:\.\d+)?)\s*[eE](\d+)(?!\s*/\s*well)"
    r"|(?<![\w.])10\^(\d+)\s*cells"
)


def excel_serial(n):
    return date(1899, 12, 30) + timedelta(days=int(n))


def year4(y):
    y = int(y)
    return y + 2000 if y < 100 else y


def find_date(text):
    """First date found anywhere in a free-text note, or None."""
    t = text.replace("//", "/")
    for m in re.finditer(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?![/\d])", t):
        try:
            return date(year4(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            continue
    # "25 nov23", "22Apr21", "5 Jan 22", "10 oct 2025"
    for m in re.finditer(r"(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{2,4})\b", t):
        mon = MONTHS.get(m.group(2).lower())
        if mon:
            try:
                return date(year4(m.group(3)), mon, int(m.group(1)))
            except ValueError:
                continue
    # "June-7-2018", "Dic-6-2018"
    for m in re.finditer(r"\b([A-Za-z]{3,9})[-\s](\d{1,2})[-,\s]+(\d{4})\b", t):
        mon = MONTHS.get(m.group(1).lower())
        if mon:
            try:
                return date(int(m.group(3)), mon, int(m.group(2)))
            except ValueError:
                continue
    return None


def parse_freeze(value):
    """-> (freeze_date, frozen_by, freeze_note, passage_text)"""
    if value in (None, ""):
        return None, None, None, None
    if isinstance(value, datetime):
        return value.date(), None, None, None
    if isinstance(value, date):
        return value, None, None, None
    if isinstance(value, (int, float)) and 30000 < value < 60000:
        return excel_serial(value), None, None, None
    s = str(value).strip()
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})\s+([A-Za-z]{2,4})", s)
    if m:  # "1/10/18 YJ"
        return date(year4(m.group(3)), int(m.group(1)), int(m.group(2))), m.group(4).upper(), None, None
    if PASSAGE_LIKE.match(s):
        return None, None, None, s
    m = re.search(r"placed in ln2:\s*([\d/]+)", s, re.I)
    d = find_date(m.group(1)) if m else None
    if d is None and not re.match(r"received", s, re.I) and not re.search(r"\d/\d+/\d+/", s):
        d = find_date(s)
    clean = d is not None and re.fullmatch(r"[\d/\-]+|[A-Za-z]+-\d{1,2}-\d{4}", s)
    return d, None, (None if clean else s), None


def cells_per_vial(texts):
    for t in texts:
        for m in CELLS.finditer(t):
            if m.group(1):
                return f"{m.group(1)}E{m.group(2)}"
            if m.group(3):
                return f"{m.group(3)}E{m.group(4)}"
            return f"1E{m.group(5)}"
    return None


def removed_by(text):
    m = INITIALS_BEFORE.search(text)
    if m:
        return m.group(1)
    m = INITIALS_AFTER.search(text)
    if m:
        return next(g for g in m.groups() if g)
    return None


def s(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        v = v.date().isoformat()
    t = str(v).strip()
    return t or None


def join(*parts):
    parts = [p for p in parts if p]
    return "; ".join(parts) if parts else None


def parse_sheet(ws, rack, box_no):
    hdr = next(r for r in range(1, 10) if str(ws.cell(r, 1).value).strip().lower().startswith("well"))
    title_rest = ws.title.split(",", 1)[1].strip() if "," in ws.title else ""
    label = None
    m = re.search(r"\(([^)]+)\)", title_rest)
    if m:
        label = m.group(1).strip()
    elif title_rest and not re.fullmatch(r"rack \d+ box \d+", title_rest, re.I):
        label = title_rest

    restriction, notes = [], []
    merged_h = {}  # row -> text of a merged block in the comment column
    for rng in ws.merged_cells.ranges:
        text = s(ws.cell(rng.min_row, rng.min_col).value)
        if not text:
            continue
        if rng.max_row < hdr or rng.min_row == 1:
            (restriction if RESTRICTION.search(text) else notes).append(text)
        elif rng.min_col == rng.max_col:
            for r in range(rng.min_row, rng.max_row + 1):
                merged_h[r] = text
    merged_top = {(rng.min_row, rng.min_col) for rng in ws.merged_cells.ranges if rng.min_row == 1}
    for r in range(1, hdr):
        for c in range(1, ws.max_column + 1):
            text = s(ws.cell(r, c).value)
            if not text or (r, c) in merged_top or BOILERPLATE.search(text):
                continue
            (restriction if RESTRICTION.search(text) else notes).append(text)

    # Columns are read by header name: some sheets lack a column or rename one
    cols = {}
    for c in range(1, ws.max_column + 1):
        name = str(ws.cell(hdr, c).value or "").strip().lower()
        if name and name not in cols:
            cols[name] = c
    last_named = max(cols.values())

    def cell(r, *names):
        for n in names:
            if n in cols:
                return ws.cell(r, cols[n]).value
        return None

    # Well numbering: 1..81 (most sheets), 1..9 restarting per row (R3-B6), or blank (R3-B5)
    rows = [r for r in range(hdr + 1, ws.max_row + 1)]
    numbers = {}
    for r in rows:
        try:
            numbers[r] = int(ws.cell(r, 1).value)
        except (TypeError, ValueError):
            pass
    per_row = numbers and max(numbers.values()) <= 9 and "row" in cols
    explicit = set()
    for r, n in numbers.items():
        if per_row:
            try:
                n = (int(cell(r, "row")) - 1) * 9 + n
            except (TypeError, ValueError):
                continue
        numbers[r] = n
        explicit.add(n)

    vials, skipped, unplaced, placed = [], [], [], {}
    for r in rows:
        cell_line = s(cell(r, "cells"))
        protein = s(cell(r, "protein expression"))
        method = s(cell(r, "culture method"))
        derived = s(cell(r, "derived from"))
        raw_freeze = cell(r, "date of frozen")
        comment, add = s(cell(r, "comment (passage #)")), s(cell(r, "additional comment")) or merged_h.get(r)
        extra_i = s(ws.cell(r, last_named + 1).value)
        if r in numbers:
            well = numbers[r]
        else:
            well = r - hdr  # positional; ambiguous if that number is used explicitly elsewhere
            if well in explicit:
                well = None
        for c in range(last_named + 2, ws.max_column + 1):  # stray notes beyond the sheet's columns
            text = s(ws.cell(r, c).value)
            if text:
                notes.append(f"Well {well}, column {ws.cell(r, c).column_letter}: {text}")
        ov = NAMELESS_OVERRIDES.get((rack, box_no, well)) if not cell_line else None
        if ov:
            cell_line = ov["cell_line"]
            if "protein" in ov.get("clear", ()):
                protein = None
            if "derived" in ov.get("clear", ()):
                derived = None
            comment = join(ov.get("comment"), comment)
        if not cell_line:
            data = [v for v in (protein, method, derived, s(raw_freeze), comment, add, extra_i) if v]
            if data and not (len(data) == 1 and add is not None and add == merged_h.get(r)):
                skipped.append((well, join(*data)))
            continue
        if well is None or not 1 <= well <= 81 or well in placed:
            unplaced.append((well, join(cell_line, s(raw_freeze), comment, add, extra_i)))
            notes.append(f"Vial without a free position in the spreadsheet: {join(cell_line, s(raw_freeze), comment, add, extra_i)}")
            continue
        placed[well] = True

        freeze_date, frozen_by, freeze_note, passage = parse_freeze(raw_freeze)
        if passage:
            comment = join(passage, comment)
        if derived:
            comment = join(f"Derived from: {derived}", comment)
        add = join(add, extra_i)
        texts = [t for t in (comment, add, freeze_note) if t]
        if not frozen_by:
            m = PREP_INITIALS.search(" ".join(t for t in (comment, add) if t))
            frozen_by = m.group(1) if m else None

        vial = dict(
            rack=rack, box=box_no, well=well, cell_line=cell_line, protein_expression=protein,
            culture_method=method, freeze_date=freeze_date.isoformat() if freeze_date else None,
            frozen_by=frozen_by, freeze_note=freeze_note, cells_per_vial=cells_per_vial(texts),
            comment=comment, additional_comment=add,
            master_stock=bool(MASTER.search(" ".join(texts))), status="In tank",
        )
        note = next((t for t in (add, comment) if t and REMOVED.search(t)), None)
        if note:
            rd = find_date(note)
            vial.update(status="Thawed", removed_note=note, removed_by=removed_by(note),
                        removed_date=rd.isoformat() if rd else None)
        vials.append(vial)

    box = dict(rack=rack, box=box_no, label=label,
               restriction="\n".join(dict.fromkeys(restriction)) or None,
               notes="\n".join(dict.fromkeys(notes)) or None)
    return box, vials, skipped, unplaced


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--out", default="ln2_import.json")
    ap.add_argument("--post", help="API base URL, e.g. http://localhost:8000")
    args = ap.parse_args()

    boxes, vials, skipped, unplaced = [], [], [], []
    for path in sorted(glob.glob(os.path.join(args.folder, "Rack *.xlsx"))):
        rack = int(re.search(r"Rack (\d+)", os.path.basename(path)).group(1))
        wb = openpyxl.load_workbook(path, data_only=True)
        for ws in wb.worksheets:
            box_no = int(re.match(r"\s*\d+\s*-\s*(\d+)", ws.title).group(1))
            b, v, sk, up = parse_sheet(ws, rack, box_no)
            boxes.append(b)
            vials.extend(v)
            skipped.extend((rack, box_no, w, t) for w, t in sk)
            unplaced.extend((rack, box_no, w, t) for w, t in up)

    in_tank = [v for v in vials if v["status"] == "In tank"]
    thawed = [v for v in vials if v["status"] != "In tank"]
    print(f"Boxes: {len(boxes)}   Vials: {len(vials)}  (in tank {len(in_tank)}, thawed/removed {len(thawed)})")
    print(f"Freeze date parsed: {sum(1 for v in vials if v['freeze_date'])}   "
          f"kept as text only: {sum(1 for v in vials if v['freeze_note'] and not v['freeze_date'])}   "
          f"frozen_by: {sum(1 for v in vials if v['frozen_by'])}   "
          f"cells/vial: {sum(1 for v in vials if v['cells_per_vial'])}   "
          f"master stock: {sum(1 for v in vials if v['master_stock'])}")
    print(f"Distinct cell lines: {len(Counter(v['cell_line'] for v in vials))}")
    print("\nBoxes with label / restriction / notes:")
    for b in boxes:
        if b["label"] or b["restriction"] or b["notes"]:
            print(f"  R{b['rack']}-B{b['box']}: label={b['label']!r} restriction={(b['restriction'] or '')[:70]!r} "
                  f"notes={len((b['notes'] or '').splitlines())} line(s)")
    print("\nVials recorded as thawed/removed:")
    for v in thawed:
        print(f"  R{v['rack']}-B{v['box']} #{v['well']:<2} {v['cell_line'][:30]:30} "
              f"date={v['removed_date']} by={v['removed_by']}  «{v['removed_note'][:60]}»")
    if unplaced:
        print("\nVials without a position (kept in the box notes):")
        for rk, bx, w, t in unplaced:
            print(f"  R{rk}-B{bx} after #{w}: {t[:90]}")
    if skipped:
        print("\nWells with data but no cell name (not imported):")
        for rk, bx, w, t in skipped:
            print(f"  R{rk}-B{bx} #{w}: {t[:80]}")

    with open(args.out, "w") as f:
        json.dump({"boxes": boxes, "vials": vials}, f, indent=1, ensure_ascii=False)
    print(f"\nWrote {args.out}")

    if args.post:
        req = urllib.request.Request(
            args.post.rstrip("/") + "/ln2/import",
            data=json.dumps({"boxes": boxes, "vials": vials}).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            print("Import:", resp.read().decode())


if __name__ == "__main__":
    sys.exit(main())
