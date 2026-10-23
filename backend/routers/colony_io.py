"""Import / export of Bioterio animals in the lab's shared Excel format
("Colony" sheet: Cage Position, BCM Cage, Animal Code, ID, DOB, Sex, Genotype,
Age, Status, Parents, Parents2, Responsible, Elimination Reason; plus a
"Breeders" section). The browser parses / writes the workbook; this router
works with plain rows.
"""
import re
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

import models, schemas
from database import get_db
from ownership import acting_user, is_admin
from utils import calculate_age_display, calculate_age_months

router = APIRouter(tags=["colony exchange"])

ALIVE, DEAD, ELIMINATED = models.AnimalStatus.ALIVE, models.AnimalStatus.DEAD, models.AnimalStatus.ELIMINATED
STATUS_WORDS = {
    "alive": ALIVE, "vivo": ALIVE, "": ALIVE,
    "dead": DEAD, "muerto": DEAD, "found dead": DEAD,
    "eliminated": ELIMINATED, "eliminado": ELIMINATED, "euthanized": ELIMINATED, "sacrificed": ELIMINATED,
}
STATUS_LABEL = {ALIVE: "Alive", DEAD: "Dead", ELIMINATED: "Eliminated"}
WEAN_AGE_DAYS = 21


def _position(cage: Optional[models.Cage]):
    if not cage or not cage.rack:
        return None
    return f"Rack {cage.rack.name.split()[-1]}: {chr(64 + cage.column)}{cage.row}"


# ── Export ─────────────────────────────────────────────────────────────────

@router.get("/animals/export")
def export_animals(request: Request, scope: str = "mine", db: Session = Depends(get_db)):
    """Animals of the user's cages (and the user's removed animals), or every animal
    for an admin with scope=all."""
    user = acting_user(request, db)
    everyone = scope == "all" and is_admin(user)
    q = db.query(models.Animal).options(joinedload(models.Animal.cage).joinedload(models.Cage.rack),
                                         joinedload(models.Animal.cage).joinedload(models.Cage.owner),
                                         joinedload(models.Animal.responsible))
    out = []
    for a in q.order_by(models.Animal.id).all():
        cage = a.cage
        # A removed animal stays with whoever had it, even if its cage was released or reused
        owner = a.responsible if a.status != ALIVE and a.responsible_id else (cage.owner if cage else None)
        if not everyone and (not owner or owner.id != user.id):
            continue
        out.append({
            "id": a.id, "animal_code": a.external_id, "mark": a.mark, "dob": a.dob.isoformat() if a.dob else None,
            "sex": a.sex.value if a.sex else None, "genotype": a.genotype,
            "status": STATUS_LABEL.get(a.status, str(a.status)),
            "status_date": a.status_changed_at.date().isoformat() if a.status_changed_at else None,
            "age_weeks": ((((a.status_changed_at.date() if a.status_changed_at and a.status != ALIVE else date.today()) - a.dob).days) // 7) if a.dob else None,
            "age_months": calculate_age_months(a.dob, a.status_changed_at, a.status) if a.dob else None,
            "age_display": calculate_age_display(a.dob, a.status_changed_at, a.status) if a.dob else None,  # "2m 4d"
            "parent_1": a.parent_1, "parent_2": a.parent_2,
            "wean_date": a.wean_date.isoformat() if a.wean_date else None,
            "elimination_reason": a.elimination_reason, "notes": a.notes, "origin_cage": a.origin_cage,
            "position": _position(cage), "rack": int(cage.rack.name.split()[-1]) if cage and cage.rack else None,
            "row": cage.row if cage else None, "column": chr(64 + cage.column) if cage else None,
            "cage_card": (a.last_cage_card or (cage.card_id if cage else None)) if a.status != ALIVE
                         else (cage.card_id if cage else None), "cage_number": cage.cage_number if cage else None,
            "breeding": bool(cage and cage.is_breeding_pair),
            "breeding_since": cage.breeding_since.isoformat() if cage and cage.breeding_since else None,
            "litter_dob": cage.litter_dob.isoformat() if cage and cage.litter_dob else None,
            "wean_due": (cage.litter_dob + timedelta(days=WEAN_AGE_DAYS)).isoformat() if cage and cage.litter_dob else None,
            "responsible": (owner.full_name or owner.username) if owner else None,
            "responsible_username": owner.username if owner else None,
        })
    return out


# ── Import ─────────────────────────────────────────────────────────────────

def _find_user(db: Session, text: Optional[str]) -> Optional[models.User]:
    t = (text or "").strip().lower()
    if not t:
        return None
    for u in db.query(models.User).filter(models.User.active == True).all():
        if t in {u.username.lower(), (u.full_name or "").strip().lower(), (u.initials or "").lower()}:
            return u
    return None


@router.post("/import/animals/rows")
def import_rows(data: schemas.ColonyImport, request: Request, dry_run: bool = True, db: Session = Depends(get_db)):
    """Create or update animals from colony-format rows. With dry_run (default) nothing is saved:
    the response says what would happen, row by row."""
    importer = acting_user(request, db)
    if not is_admin(importer):
        raise HTTPException(status_code=403, detail="Only administrators can import animals in bulk")
    default_owner = _find_user(db, data.default_responsible) or importer

    racks = {int(r.name.split()[-1]): r for r in db.query(models.Rack).all() if r.name.split()[-1].isdigit()}
    created, updated, skipped, cages_used = 0, 0, [], {}
    # (rack,row,col) -> card claimed by this import, to catch two cards on one position
    claimed: Dict[Tuple[int, int, str], Optional[str]] = {}

    def skip(r: schemas.ColonyRow, reason: str):
        skipped.append({"line": r.line, "animal_code": r.animal_code, "mark": r.mark, "reason": reason})

    for r in data.rows:
        status = STATUS_WORDS.get((r.status or "").strip().lower())
        if status is None:
            status = ELIMINATED if r.elimination_reason else ALIVE
        if status == ALIVE and r.elimination_reason:
            status = ELIMINATED
        sex = (r.sex or "").strip().upper()[:1]
        if sex not in ("M", "F"):
            skip(r, f"Unknown sex '{r.sex}'")
            continue
        if not r.dob:
            skip(r, "Missing date of birth")
            continue
        owner = _find_user(db, r.responsible) or default_owner

        cage = None
        if status == ALIVE:
            if not (r.rack and r.row and r.column):
                skip(r, "Missing cage position")
                continue
            rack = racks.get(r.rack)
            col = ord(r.column.upper()) - 64
            cage = db.query(models.Cage).filter(models.Cage.rack_id == rack.id, models.Cage.row == r.row,
                                                models.Cage.column == col).first() if rack else None
            label = f"Rack {r.rack}: {r.column.upper()}{r.row}"
            if not cage:
                skip(r, f"{label} does not exist")
                continue
            key = (r.rack, r.row, r.column.upper())
            if key in claimed and (claimed[key] or "") != (r.cage_card or ""):
                skip(r, f"{label} is used by another cage ({claimed[key]}) in this file")
                continue
            if key not in claimed:
                db.flush()
                live_here = db.query(models.Animal).filter(models.Animal.cage_id == cage.id,
                                                           models.Animal.status == ALIVE).all()
                same_card = cage.card_id and r.cage_card and cage.card_id == r.cage_card
                # Re-importing your own export: the cage has no card yet but is yours
                own_uncarded = not cage.card_id and cage.owner_id == owner.id
                if cage.owner_id not in (None, owner.id):
                    skip(r, f"{label} belongs to {cage.owner.full_name or cage.owner.username}")
                    continue
                if live_here and not (same_card or own_uncarded):
                    skip(r, f"{label} already holds {len(live_here)} animal(s) of another cage")
                    continue
                claimed[key] = r.cage_card
            cage.owner_id = cage.owner_id or owner.id
            if r.cage_card:
                cage.card_id = r.cage_card
            if r.breeder:
                cage.is_breeding_pair = True
                cage.breeding_since = r.breeding_since or cage.breeding_since
                # Breeders' "Wean Date" is the litter's: a date still ahead gives the litter's birth
                litter = r.litter_dob or (r.wean_date - timedelta(days=WEAN_AGE_DAYS)
                                          if r.wean_date and r.wean_date >= date.today() else None)
                cage.litter_dob = litter or cage.litter_dob
            cages_used[label] = r.cage_card

        animal = None
        if r.animal_code:
            animal = db.query(models.Animal).filter(models.Animal.external_id == r.animal_code.strip()).first()
        else:
            # No code: recognise the same animal by mark + sex + date of birth —
            # in the same cage if alive, or in the history (same genotype) if removed
            same = db.query(models.Animal).filter(
                models.Animal.mark == (r.mark or "-").strip(), models.Animal.dob == r.dob,
                models.Animal.sex == (models.AnimalSex.MALE if sex == "M" else models.AnimalSex.FEMALE))
            if cage:
                animal = same.filter(models.Animal.cage_id == cage.id, models.Animal.status == ALIVE).first()
            else:
                animal = same.filter(models.Animal.status != ALIVE,
                                     models.Animal.genotype == ((r.genotype or "").strip() or "Unknown")).first()
        fields = dict(
            sex=models.AnimalSex.MALE if sex == "M" else models.AnimalSex.FEMALE, dob=r.dob,
            mark=(r.mark or "-").strip() or "-", genotype=(r.genotype or "").strip() or "Unknown",
            external_id=(r.animal_code or "").strip() or None, parent_1=r.parent_1, parent_2=r.parent_2,
            wean_date=r.wean_date, elimination_reason=r.elimination_reason if status != ALIVE else None,
        )
        if r.notes:
            fields["notes"] = r.notes
        if status != ALIVE:
            fields["responsible_id"] = owner.id
            if r.cage_card:
                fields["last_cage_card"] = r.cage_card
        when = datetime.combine(r.status_date, datetime.min.time()) if r.status_date else datetime.utcnow()
        if animal:
            if animal.cage_id and animal.cage and animal.cage.owner_id not in (None, owner.id) and not is_admin(importer):
                skip(r, "Animal belongs to another user's cage")
                continue
            for k, v in fields.items():
                if v is not None or k in ("elimination_reason",):
                    setattr(animal, k, v)
            if animal.status != status:
                animal.status_changed_at = None if status == ALIVE else when
            animal.status = status
            if cage:
                animal.cage_id = cage.id
            updated += 1
        else:
            db.add(models.Animal(**fields, status=status, cage_id=cage.id if cage else None,
                                 status_changed_at=None if status == ALIVE else when))
            created += 1

    result = {"dry_run": dry_run, "created": created, "updated": updated, "skipped": skipped,
              "cages": len(cages_used), "default_responsible": default_owner.username}
    if dry_run:
        db.rollback()
    else:
        db.commit()
    return result


# ── Family tree ────────────────────────────────────────────────────────────
# Parents are stored as text with the parent's Animal Code ("BN 447"). They can
# carry notes ("BN 516 (NH)"), name two possible parents ("BN 463/462") or a
# supplier instead of an animal ("Jackson Lab").

def _code_key(text: Optional[str]) -> str:
    t = re.sub(r"\(.*?\)", "", text or "")
    return re.sub(r"\s+", "", t).upper()


def _parent_options(text: Optional[str]) -> List[str]:
    """'BN 463/462' -> ['BN463', 'BN462'] (a bare number takes the first option's prefix)."""
    parts = [p.strip() for p in re.sub(r"\(.*?\)", "", text or "").split("/") if p.strip()]
    keys = []
    for p in parts:
        k = _code_key(p)
        if keys and k.isdigit():
            prefix = re.match(r"^\D*", keys[0]).group(0)
            k = prefix + k
        keys.append(k)
    return keys


@router.get("/animals/family")
def animal_family(animal_id: Optional[int] = None, code: Optional[str] = None, db: Session = Depends(get_db)):
    """The animal, its parents and grandparents, and its offspring."""
    animals = db.query(models.Animal).options(
        joinedload(models.Animal.cage).joinedload(models.Cage.rack),
        joinedload(models.Animal.cage).joinedload(models.Cage.owner),
        joinedload(models.Animal.responsible)).all()
    by_code: Dict[str, models.Animal] = {}
    for a in sorted(animals, key=lambda a: a.id):
        if a.external_id:
            by_code.setdefault(_code_key(a.external_id), a)

    if animal_id is not None:
        root = next((a for a in animals if a.id == animal_id), None)
    else:
        root = by_code.get(_code_key(code))
    if not root:
        raise HTTPException(status_code=404, detail=f"No animal with code '{code}'" if code else "Animal not found")

    def node(a: models.Animal) -> dict:
        owner = a.responsible if a.status != ALIVE and a.responsible_id else (a.cage.owner if a.cage else None)
        return {
            "kind": "animal", "id": a.id, "code": a.external_id, "mark": a.mark,
            "sex": a.sex.value if a.sex else None, "genotype": a.genotype,
            "dob": a.dob.isoformat() if a.dob else None, "status": STATUS_LABEL.get(a.status, str(a.status)),
            "age": calculate_age_display(a.dob, a.status_changed_at, a.status) if a.dob else None,
            "position": _position(a.cage) if a.status == ALIVE else None,
            "responsible": (owner.full_name or owner.username) if owner else None,
            "color": owner.color if owner else None,
        }

    def parents_of(a: models.Animal, depth: int) -> List[dict]:
        out = []
        for text in (a.parent_1, a.parent_2):
            if not (text or "").strip():
                out.append({"kind": "unknown", "label": None})
                continue
            options = _parent_options(text)
            found = [by_code[k] for k in options if k in by_code]
            if len(options) == 1 and found:
                n = node(found[0])
                n["note"] = text.strip() if _code_key(text) != _code_key(found[0].external_id) or "(" in text else None
                n["parents"] = parents_of(found[0], depth - 1) if depth > 1 else []
                out.append(n)
            elif len(options) > 1:
                out.append({"kind": "uncertain", "label": text.strip(),
                            "options": [node(f) for f in found]})
            elif re.search(r"\d", text):
                out.append({"kind": "unregistered", "label": text.strip()})
            else:
                out.append({"kind": "origin", "label": text.strip()})
        return out

    root_key = _code_key(root.external_id) if root.external_id else None
    children = []
    if root_key:
        for a in animals:
            if a.id != root.id and any(root_key in _parent_options(p) for p in (a.parent_1, a.parent_2) if p):
                children.append(node(a))
        children.sort(key=lambda n: (n["dob"] or "", n["code"] or ""))

    me = node(root)
    me["parents"] = parents_of(root, 2)
    return {"animal": me, "children": children}


@router.get("/animals/codes")
def animal_codes(db: Session = Depends(get_db)):
    """Every Animal Code (live and removed), to suggest parents in the animal form."""
    rows = db.query(models.Animal).filter(models.Animal.external_id.isnot(None), models.Animal.external_id != "").all()
    return sorted(({"code": a.external_id, "sex": a.sex.value if a.sex else None, "genotype": a.genotype,
                    "status": STATUS_LABEL.get(a.status, str(a.status))} for a in rows),
                  key=lambda r: r["code"])
