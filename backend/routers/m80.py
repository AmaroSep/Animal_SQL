import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

import models, schemas
from database import get_db
from ownership import acting_user, is_admin

router = APIRouter(prefix="/m80", tags=["-80 freezers"])

IN_FREEZER = models.M80TubeStatus.IN_FREEZER
# Any box layout: rows are lettered A–Z in the box maps, columns numbered
MAX_ROWS, MAX_COLUMNS = 26, 30


def _check_box_size(rows: int, columns: int):
    if not (1 <= rows <= MAX_ROWS and 1 <= columns <= MAX_COLUMNS):
        raise HTTPException(status_code=400, detail=f"Box size must be 1–{MAX_ROWS} rows by 1–{MAX_COLUMNS} columns")


# ── Helpers ────────────────────────────────────────────────────────────────

def _get(db: Session, model, obj_id: int, what: str):
    obj = db.query(model).filter(model.id == obj_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return obj


def _location(box: models.M80Box) -> schemas.M80Location:
    rack = box.rack
    comp = rack.compartment
    return schemas.M80Location(
        freezer=comp.freezer.name, room=comp.freezer.room, compartment=comp.number,
        compartment_name=comp.name, rack=rack.number, level=box.level, slot=box.slot,
    )


def can_see_restricted(request: Request, db: Session = Depends(get_db)) -> bool:
    """Admins and users given access see restricted (clinical) sample fields."""
    user = acting_user(request, db)
    return is_admin(user) or bool(user.restricted_access)


def _restricted_keys(stype: Optional[models.M80SampleType]) -> set:
    return {f["key"] for f in (stype.fields or []) if f.get("restricted")} if stype else set()


def _animal_map(db: Session, tubes) -> Dict[str, models.Animal]:
    """Bioterio animals named in the tubes' "animal" fields, by Animal Code."""
    codes = set()
    for t in tubes:
        for f in (t.type.fields if t.type else []):
            if f.get("type") == "animal" and (t.data or {}).get(f["key"]):
                codes.add(str(t.data[f["key"]]).strip())
    if not codes:
        return {}
    animals = db.query(models.Animal).filter(models.Animal.external_id.in_(codes)).all()
    return {a.external_id: a for a in animals}


def _tube_out(t: models.M80Tube, with_location: bool = True, can_see: bool = True,
              animals: Optional[Dict[str, models.Animal]] = None) -> schemas.M80Tube:
    out = schemas.M80Tube.model_validate(t)
    hidden = set() if can_see else _restricted_keys(t.type)
    out.data = {k: v for k, v in (t.data or {}).items() if k not in hidden} if t.data else None
    if t.type and animals:
        for f in t.type.fields or []:
            a = animals.get(str((t.data or {}).get(f["key"]) or "").strip()) if f.get("type") == "animal" else None
            if a:
                out.animal = {
                    "id": a.id, "code": a.external_id, "genotype": a.genotype, "mark": a.mark,
                    "sex": a.sex.value if a.sex else None, "dob": a.dob.isoformat() if a.dob else None,
                    "status": a.status.value if a.status else None,
                    "removed_on": a.status_changed_at.date().isoformat() if a.status_changed_at else None,
                }
                break
    if with_location:
        out.location = _location(t.box)
        out.box_label = t.box.label
    return out


# ── Sample types ───────────────────────────────────────────────────────────

DEFAULT_TYPES = [
    {"name": "CSF", "color": "#38bdf8", "description": "Human cerebrospinal fluid aliquots", "fields": [
        {"key": "study_id", "label": "Study ID", "type": "text"},
        {"key": "collection_date", "label": "Collection Date", "type": "date"},
        {"key": "visit", "label": "Visit", "type": "text"},
        {"key": "original_aliquot_id", "label": "Original Aliquot ID", "type": "text"},
        {"key": "mci_dx", "label": "mci_dx", "type": "number", "restricted": True},
        {"key": "age", "label": "Age", "type": "number", "unit": "years", "restricted": True},
        {"key": "gender", "label": "Gender", "type": "choice", "options": ["Female", "Male"], "restricted": True},
        {"key": "race", "label": "Race", "type": "text", "restricted": True},
        {"key": "ab42", "label": "AB42_ele", "type": "number", "restricted": True},
        {"key": "tau", "label": "Tau_ele", "type": "number", "restricted": True},
        {"key": "ptau", "label": "pTau_ele", "type": "number", "restricted": True},
        {"key": "ptau_ab42", "label": "pTau_AB42_ele", "type": "formula", "formula": "ptau / ab42", "restricted": True},
    ]},
    {"name": "Brain", "color": "#f472b6", "description": "Mouse brain tissue, linked to the Bioterio animal", "fields": [
        {"key": "animal", "label": "Animal Code", "type": "animal"},
        {"key": "collection_date", "label": "Collection Date", "type": "date"},
        {"key": "region", "label": "Region", "type": "choice",
         "options": ["Whole brain", "Hemibrain", "Cortex", "Hippocampus", "Striatum", "Thalamus", "Cerebellum", "Brainstem", "Other"]},
        {"key": "hemisphere", "label": "Hemisphere", "type": "choice", "options": ["Left", "Right", "Both"]},
        {"key": "processing", "label": "Processing", "type": "choice", "options": ["Fresh-frozen", "Fixed", "Homogenate", "Lysate"]},
        {"key": "weight", "label": "Weight", "type": "number", "unit": "mg"},
        {"key": "collected_by", "label": "Collected by", "type": "text"},
    ]},
    {"name": "General", "color": "#a3a3a3", "description": "Anything else: name and conditions", "fields": [
        {"key": "conditions", "label": "Conditions", "type": "text"},
        {"key": "source", "label": "Source", "type": "text"},
        {"key": "concentration", "label": "Concentration", "type": "text"},
    ]},
]
FIELD_TYPES = {"text", "number", "date", "choice", "animal", "formula"}
FORMULA = re.compile(r"^\s*(\w+)\s*([-+*/])\s*(\w+)\s*$")


def seed_sample_types(db: Session):
    if db.query(models.M80SampleType).count() == 0:
        db.add_all(models.M80SampleType(**t) for t in DEFAULT_TYPES)
        db.commit()


def _type_out(t: models.M80SampleType, db: Session) -> schemas.M80SampleTypeOut:
    out = schemas.M80SampleTypeOut.model_validate(t)
    out.tubes = db.query(models.M80Tube).filter(models.M80Tube.sample_type_id == t.id).count()
    return out


def _check_type(db: Session, data: schemas.M80SampleTypeIn, type_id: Optional[int] = None):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    q = db.query(models.M80SampleType).filter(models.M80SampleType.name.ilike(name))
    if type_id:
        q = q.filter(models.M80SampleType.id != type_id)
    if q.first():
        raise HTTPException(status_code=400, detail="A sample type with that name already exists")
    keys = [f.key for f in data.fields]
    if len(set(keys)) != len(keys) or any(not re.fullmatch(r"[a-z][a-z0-9_]*", k) for k in keys):
        raise HTTPException(status_code=400, detail="Field keys must be unique, lowercase letters, digits and _")
    for f in data.fields:
        if f.type not in FIELD_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown field type '{f.type}'")
        if f.type == "choice" and not f.options:
            raise HTTPException(status_code=400, detail=f"'{f.label}' needs its list of options")
        if f.type == "formula":
            m = FORMULA.match(f.formula or "")
            if not m or m.group(1) not in keys or m.group(3) not in keys:
                raise HTTPException(status_code=400, detail=f"'{f.label}': formula must look like 'field_a / field_b'")
    return name


def _admin(request: Request, db: Session):
    if not is_admin(acting_user(request, db)):
        raise HTTPException(status_code=403, detail="Only administrators can change sample types")


@router.get("/sample-types", response_model=List[schemas.M80SampleTypeOut])
def list_sample_types(db: Session = Depends(get_db)):
    return [_type_out(t, db) for t in db.query(models.M80SampleType).order_by(models.M80SampleType.name).all()]


@router.post("/sample-types", response_model=schemas.M80SampleTypeOut, status_code=201)
def create_sample_type(data: schemas.M80SampleTypeIn, request: Request, db: Session = Depends(get_db)):
    _admin(request, db)
    name = _check_type(db, data)
    t = models.M80SampleType(name=name, color=data.color or None, description=data.description or None,
                             fields=[f.model_dump(exclude_none=True) for f in data.fields])
    db.add(t)
    db.commit()
    db.refresh(t)
    return _type_out(t, db)


@router.put("/sample-types/{type_id}", response_model=schemas.M80SampleTypeOut)
def update_sample_type(type_id: int, data: schemas.M80SampleTypeIn, request: Request, db: Session = Depends(get_db)):
    """Removing a field hides it but keeps the values already stored in the tubes."""
    _admin(request, db)
    t = _get(db, models.M80SampleType, type_id, "Sample type")
    t.name = _check_type(db, data, type_id)
    t.color, t.description = data.color or None, data.description or None
    t.fields = [f.model_dump(exclude_none=True) for f in data.fields]
    db.query(models.M80Tube).filter(models.M80Tube.sample_type_id == t.id).update({"sample_type": t.name})
    db.commit()
    db.refresh(t)
    return _type_out(t, db)


@router.delete("/sample-types/{type_id}", status_code=204)
def delete_sample_type(type_id: int, request: Request, db: Session = Depends(get_db)):
    _admin(request, db)
    t = _get(db, models.M80SampleType, type_id, "Sample type")
    if db.query(models.M80Tube).filter(models.M80Tube.sample_type_id == t.id).first():
        raise HTTPException(status_code=400, detail="Tubes of this type exist; it cannot be deleted")
    db.delete(t)
    db.commit()


def _number(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        n = float(str(v).replace(",", "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"'{v}' is not a number")
    return int(n) if n.is_integer() else n


def _date(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, (date, datetime)):
        return (v.date() if isinstance(v, datetime) else v).isoformat()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19] if "T" in s else s, fmt).date().isoformat()
        except ValueError:
            pass
    raise HTTPException(status_code=400, detail=f"'{v}' is not a date")


def clean_data(stype: Optional[models.M80SampleType], data: Optional[Dict[str, Any]],
               old: Optional[Dict[str, Any]] = None, can_see: bool = True) -> Optional[Dict[str, Any]]:
    """Keep the type's fields only, with proper value types, and compute formulas.
    Users without access to restricted fields cannot change them."""
    if not stype:
        return None
    data, old = data or {}, old or {}
    out = {k: v for k, v in old.items() if k not in {f["key"] for f in stype.fields}}  # values of removed fields
    for f in stype.fields:
        k, kind = f["key"], f.get("type", "text")
        if f.get("restricted") and not can_see:
            if k in old:
                out[k] = old[k]
            continue
        v = data.get(k)
        if kind == "formula":
            continue
        if kind == "number":
            v = _number(v)
        elif kind == "date":
            v = _date(v)
        else:
            v = str(v).strip() if v is not None and str(v).strip() else None
            if v and kind == "choice" and f.get("options"):
                match = next((o for o in f["options"] if o.lower() == v.lower()), None)
                v = match or v
        if v is not None:
            out[k] = v
    for f in stype.fields:
        if f.get("type") == "formula" and not (f.get("restricted") and not can_see):
            m = FORMULA.match(f.get("formula") or "")
            a, b = (out.get(m.group(1)), out.get(m.group(3))) if m else (None, None)
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not (m.group(2) == "/" and b == 0):
                out[f["key"]] = round({"+": a + b, "-": a - b, "*": a * b, "/": a / b if b else 0}[m.group(2)], 6)
            else:
                out.pop(f["key"], None)
    return out or None


def _box_summary(box: models.M80Box) -> schemas.M80BoxSummary:
    return schemas.M80BoxSummary(
        id=box.id, rack_id=box.rack_id, level=box.level, slot=box.slot, rows=box.rows, columns=box.columns,
        label=box.label, restriction=box.restriction, notes=box.notes, capacity=box.rows * box.columns,
        occupied=sum(1 for t in box.tubes if t.status == IN_FREEZER),
    )


def _freezer_out(f: models.M80Freezer) -> schemas.M80FreezerOut:
    return schemas.M80FreezerOut(
        id=f.id, name=f.name, room=f.room, notes=f.notes,
        compartments=[
            schemas.M80CompartmentOut(
                id=c.id, freezer_id=f.id, number=c.number, name=c.name,
                racks=[
                    schemas.M80RackOut(
                        id=r.id, compartment_id=c.id, number=r.number, label=r.label, levels=r.levels,
                        depth=r.depth, boxes=[_box_summary(b) for b in r.boxes],
                    )
                    for r in c.racks
                ],
            )
            for c in f.compartments
        ],
    )


def _check_rack_size(levels: int, depth: int):
    if not (1 <= levels <= 20 and 1 <= depth <= 20):
        raise HTTPException(status_code=400, detail="Levels and depth must be between 1 and 20")


def _check_slot(db: Session, rack: models.M80Rack, level: int, slot: int, exclude_box_id: Optional[int] = None):
    if not (1 <= level <= rack.levels and 1 <= slot <= rack.depth):
        raise HTTPException(status_code=400, detail=f"Rack {rack.number} has {rack.levels} levels and {rack.depth} boxes per level")
    q = db.query(models.M80Box).filter(models.M80Box.rack_id == rack.id, models.M80Box.level == level, models.M80Box.slot == slot)
    if exclude_box_id is not None:
        q = q.filter(models.M80Box.id != exclude_box_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"Level {level}, position {slot} of rack {rack.number} already has a box")


def _check_wells_free(db: Session, box: models.M80Box, wells: List[int], exclude_tube_id: Optional[int] = None):
    capacity = box.rows * box.columns
    bad = [w for w in wells if w < 1 or w > capacity]
    if bad:
        raise HTTPException(status_code=400, detail=f"Positions {bad} do not exist in a {capacity}-position box")
    if len(set(wells)) != len(wells):
        raise HTTPException(status_code=400, detail="The same position was selected twice")
    q = db.query(models.M80Tube.well).filter(
        models.M80Tube.box_id == box.id, models.M80Tube.well.in_(wells), models.M80Tube.status == IN_FREEZER,
    )
    if exclude_tube_id is not None:
        q = q.filter(models.M80Tube.id != exclude_tube_id)
    taken = sorted(w for (w,) in q.all())
    if taken:
        raise HTTPException(status_code=400, detail=f"Position(s) {', '.join(map(str, taken))} are occupied")


# ── Freezers ───────────────────────────────────────────────────────────────

@router.get("/freezers", response_model=List[schemas.M80FreezerOut])
def list_freezers(db: Session = Depends(get_db)):
    freezers = (
        db.query(models.M80Freezer)
        .options(joinedload(models.M80Freezer.compartments).joinedload(models.M80Compartment.racks)
                 .joinedload(models.M80Rack.boxes).joinedload(models.M80Box.tubes))
        .order_by(models.M80Freezer.name)
        .all()
    )
    return [_freezer_out(f) for f in freezers]


@router.post("/freezers", response_model=schemas.M80FreezerOut, status_code=201)
def create_freezer(data: schemas.M80FreezerCreate, db: Session = Depends(get_db)):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if db.query(models.M80Freezer).filter(models.M80Freezer.name == data.name.strip()).first():
        raise HTTPException(status_code=400, detail="A freezer with that name already exists")
    if not 1 <= data.compartments <= 10:
        raise HTTPException(status_code=400, detail="Compartments must be between 1 and 10")
    f = models.M80Freezer(name=data.name.strip(), room=data.room or None, notes=data.notes or None)
    f.compartments = [models.M80Compartment(number=i) for i in range(1, data.compartments + 1)]
    db.add(f)
    db.commit()
    db.refresh(f)
    return _freezer_out(f)


@router.put("/freezers/{freezer_id}", response_model=schemas.M80FreezerOut)
def update_freezer(freezer_id: int, data: schemas.M80FreezerUpdate, db: Session = Depends(get_db)):
    f = _get(db, models.M80Freezer, freezer_id, "Freezer")
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        if db.query(models.M80Freezer).filter(models.M80Freezer.name == name, models.M80Freezer.id != f.id).first():
            raise HTTPException(status_code=400, detail="A freezer with that name already exists")
        changes["name"] = name
    for k, v in changes.items():
        setattr(f, k, v if k == "name" else (v or None))
    db.commit()
    db.refresh(f)
    return _freezer_out(f)


def _has_boxes(racks) -> bool:
    return any(r.boxes for r in racks)


@router.delete("/freezers/{freezer_id}", status_code=204)
def delete_freezer(freezer_id: int, db: Session = Depends(get_db)):
    f = _get(db, models.M80Freezer, freezer_id, "Freezer")
    if _has_boxes([r for c in f.compartments for r in c.racks]):
        raise HTTPException(status_code=400, detail="The freezer still has boxes; remove them first")
    db.delete(f)
    db.commit()


# ── Compartments ───────────────────────────────────────────────────────────

@router.post("/compartments", response_model=schemas.M80FreezerOut, status_code=201)
def create_compartment(data: schemas.M80CompartmentCreate, db: Session = Depends(get_db)):
    f = _get(db, models.M80Freezer, data.freezer_id, "Freezer")
    number = max((c.number for c in f.compartments), default=0) + 1
    db.add(models.M80Compartment(freezer_id=f.id, number=number, name=data.name or None))
    db.commit()
    db.refresh(f)
    return _freezer_out(f)


@router.put("/compartments/{comp_id}", response_model=schemas.M80FreezerOut)
def update_compartment(comp_id: int, data: schemas.M80CompartmentUpdate, db: Session = Depends(get_db)):
    c = _get(db, models.M80Compartment, comp_id, "Compartment")
    c.name = data.name or None
    db.commit()
    db.refresh(c.freezer)
    return _freezer_out(c.freezer)


@router.delete("/compartments/{comp_id}", status_code=204)
def delete_compartment(comp_id: int, db: Session = Depends(get_db)):
    c = _get(db, models.M80Compartment, comp_id, "Compartment")
    if _has_boxes(c.racks):
        raise HTTPException(status_code=400, detail="The compartment still has boxes; remove them first")
    freezer = c.freezer
    freezer.compartments.remove(c)  # delete-orphan removes it; keeps the collection consistent for renumbering
    db.flush()
    for i, comp in enumerate(sorted(freezer.compartments, key=lambda x: x.number), start=1):
        comp.number = i
    db.commit()


# ── Racks ──────────────────────────────────────────────────────────────────

@router.post("/racks", response_model=schemas.M80RackOut, status_code=201)
def create_rack(data: schemas.M80RackCreate, db: Session = Depends(get_db)):
    c = _get(db, models.M80Compartment, data.compartment_id, "Compartment")
    _check_rack_size(data.levels, data.depth)
    number = max((r.number for r in c.racks), default=0) + 1
    r = models.M80Rack(compartment_id=c.id, number=number, levels=data.levels, depth=data.depth, label=data.label or None)
    db.add(r)
    db.commit()
    db.refresh(r)
    return schemas.M80RackOut(id=r.id, compartment_id=c.id, number=r.number, label=r.label, levels=r.levels, depth=r.depth)


@router.put("/racks/{rack_id}", response_model=schemas.M80RackOut)
def update_rack(rack_id: int, data: schemas.M80RackUpdate, db: Session = Depends(get_db)):
    r = _get(db, models.M80Rack, rack_id, "Rack")
    changes = data.model_dump(exclude_unset=True)
    levels, depth = changes.get("levels", r.levels), changes.get("depth", r.depth)
    _check_rack_size(levels, depth)
    outside = [b for b in r.boxes if b.level > levels or b.slot > depth]
    if outside:
        where = ", ".join(f"level {b.level} position {b.slot}" for b in outside)
        raise HTTPException(status_code=400, detail=f"Boxes would be left outside the rack ({where}); move them first")
    r.levels, r.depth = levels, depth
    if "label" in changes:
        r.label = changes["label"] or None
    db.commit()
    db.refresh(r)
    return schemas.M80RackOut(id=r.id, compartment_id=r.compartment_id, number=r.number, label=r.label,
                              levels=r.levels, depth=r.depth, boxes=[_box_summary(b) for b in r.boxes])


@router.delete("/racks/{rack_id}", status_code=204)
def delete_rack(rack_id: int, db: Session = Depends(get_db)):
    r = _get(db, models.M80Rack, rack_id, "Rack")
    if r.boxes:
        raise HTTPException(status_code=400, detail="The rack still has boxes; remove them first")
    comp = r.compartment
    comp.racks.remove(r)
    db.flush()
    for i, rack in enumerate(sorted(comp.racks, key=lambda x: x.number), start=1):
        rack.number = i
    db.commit()


# ── Boxes ──────────────────────────────────────────────────────────────────

def _box_detail(box: models.M80Box, db: Session, can_see: bool = True) -> schemas.M80BoxDetail:
    animals = _animal_map(db, box.tubes)
    return schemas.M80BoxDetail(**_box_summary(box).model_dump(), location=_location(box),
                                tubes=[_tube_out(t, with_location=False, can_see=can_see, animals=animals) for t in box.tubes])


@router.get("/boxes/{box_id}", response_model=schemas.M80BoxDetail)
def get_box(box_id: int, db: Session = Depends(get_db), can_see: bool = Depends(can_see_restricted)):
    return _box_detail(_get(db, models.M80Box, box_id, "Box"), db, can_see)


@router.post("/boxes", response_model=schemas.M80BoxDetail, status_code=201)
def create_box(data: schemas.M80BoxCreate, db: Session = Depends(get_db)):
    rack = _get(db, models.M80Rack, data.rack_id, "Rack")
    _check_box_size(data.rows, data.columns)
    _check_slot(db, rack, data.level, data.slot)
    box = models.M80Box(**data.model_dump())
    box.label = box.label or None
    db.add(box)
    db.commit()
    db.refresh(box)
    return _box_detail(box, db)


@router.put("/boxes/{box_id}", response_model=schemas.M80BoxDetail)
def update_box(box_id: int, data: schemas.M80BoxUpdate, db: Session = Depends(get_db)):
    box = _get(db, models.M80Box, box_id, "Box")
    changes = data.model_dump(exclude_unset=True)
    if {"rack_id", "level", "slot"} & changes.keys():  # moving the box
        rack = _get(db, models.M80Rack, changes.get("rack_id", box.rack_id), "Rack")
        _check_slot(db, rack, changes.get("level", box.level), changes.get("slot", box.slot), exclude_box_id=box.id)
    if {"rows", "columns"} & changes.keys():
        size = (changes.get("rows", box.rows), changes.get("columns", box.columns))
        _check_box_size(*size)
        if size != (box.rows, box.columns) and any(t.status == IN_FREEZER for t in box.tubes):
            raise HTTPException(status_code=400, detail="The box size can only change while the box is empty")
    for k, v in changes.items():
        setattr(box, k, v if k in ("rack_id", "level", "slot", "rows", "columns") else (v or None))
    db.commit()
    db.refresh(box)
    return _box_detail(box, db)


@router.delete("/boxes/{box_id}", status_code=204)
def delete_box(box_id: int, db: Session = Depends(get_db)):
    box = _get(db, models.M80Box, box_id, "Box")
    if box.tubes:
        raise HTTPException(status_code=400, detail="The box has tube records (including used ones); it cannot be deleted")
    db.delete(box)
    db.commit()


# ── Tubes ──────────────────────────────────────────────────────────────────

def _searchable(t: models.M80Tube, can_see: bool) -> str:
    hidden = set() if can_see else _restricted_keys(t.type)
    values = [t.sample_name, t.sample_type, t.source, t.comment, t.frozen_by, t.box.label if t.box else None]
    values += [str(v) for k, v in (t.data or {}).items() if k not in hidden]
    return " ".join(v for v in values if v).lower()


@router.get("/tubes", response_model=List[schemas.M80Tube])
def list_tubes(q: Optional[str] = None, status: Optional[models.M80TubeStatus] = None,
               sample_type_id: Optional[int] = None,
               db: Session = Depends(get_db), can_see: bool = Depends(can_see_restricted)):
    query = db.query(models.M80Tube).options(
        joinedload(models.M80Tube.box).joinedload(models.M80Box.rack)
        .joinedload(models.M80Rack.compartment).joinedload(models.M80Compartment.freezer),
        joinedload(models.M80Tube.type),
    )
    if status:
        query = query.filter(models.M80Tube.status == status)
    if sample_type_id:
        query = query.filter(models.M80Tube.sample_type_id == sample_type_id)
    tubes = query.order_by(models.M80Tube.sample_name, models.M80Tube.id).all()
    if q:
        words = q.lower().split()
        tubes = [t for t in tubes if all(w in _searchable(t, can_see) for w in words)]
    animals = _animal_map(db, tubes)
    return [_tube_out(t, can_see=can_see, animals=animals) for t in tubes]


def _apply_type(db: Session, tube_fields: Dict[str, Any], old: Optional[models.M80Tube], can_see: bool):
    """Resolve sample_type_id and clean the type data in a create/update payload."""
    type_id = tube_fields.get("sample_type_id", old.sample_type_id if old else None)
    stype = _get(db, models.M80SampleType, type_id, "Sample type") if type_id else None
    if stype:
        tube_fields["sample_type"] = stype.name
    if "data" in tube_fields or "sample_type_id" in tube_fields:
        tube_fields["data"] = clean_data(stype, tube_fields.get("data", old.data if old else None),
                                         old.data if old else None, can_see)
    return tube_fields


@router.post("/tubes/batch", response_model=List[schemas.M80Tube], status_code=201)
def create_tubes(data: schemas.M80TubeBatchCreate, db: Session = Depends(get_db),
                 can_see: bool = Depends(can_see_restricted)):
    if not data.wells:
        raise HTTPException(status_code=400, detail="Select at least one position")
    if not data.data.sample_name.strip():
        raise HTTPException(status_code=400, detail="Sample name is required")
    box = _get(db, models.M80Box, data.box_id, "Box")
    _check_wells_free(db, box, data.wells)
    fields = _apply_type(db, data.data.model_dump(), None, can_see)
    per_well = {i.well: i for i in (data.items or [])}
    tubes = []
    for w in sorted(data.wells):
        item = per_well.get(w)
        extra = {}
        if item:
            extra = {"aliquot_number": item.aliquot_number, "volume": item.volume or fields.get("volume")}
        tubes.append(models.M80Tube(box_id=box.id, well=w, **{**fields, **extra}))
    db.add_all(tubes)
    db.commit()
    animals = _animal_map(db, tubes)
    return [_tube_out(t, can_see=can_see, animals=animals) for t in tubes]


@router.put("/tubes/{tube_id}", response_model=schemas.M80Tube)
def update_tube(tube_id: int, data: schemas.M80TubeUpdate, db: Session = Depends(get_db),
                can_see: bool = Depends(can_see_restricted)):
    tube = _get(db, models.M80Tube, tube_id, "Tube")
    changes = data.model_dump(exclude_unset=True)
    if "sample_name" in changes and not (changes["sample_name"] or "").strip():
        raise HTTPException(status_code=400, detail="Sample name is required")
    if ("box_id" in changes or "well" in changes) and tube.status == IN_FREEZER:
        box = _get(db, models.M80Box, changes.get("box_id", tube.box_id), "Box")
        _check_wells_free(db, box, [changes.get("well", tube.well)], exclude_tube_id=tube.id)
    changes = _apply_type(db, changes, tube, can_see)
    for k, v in changes.items():
        setattr(tube, k, v)
    db.commit()
    db.refresh(tube)
    return _tube_out(tube, can_see=can_see, animals=_animal_map(db, [tube]))


@router.post("/tubes/{tube_id}/remove", response_model=schemas.M80Tube)
def remove_tube(tube_id: int, data: schemas.M80TubeRemove, db: Session = Depends(get_db),
                can_see: bool = Depends(can_see_restricted)):
    """Use up or discard a tube: it leaves the freezer but stays in the history."""
    tube = _get(db, models.M80Tube, tube_id, "Tube")
    if data.status == IN_FREEZER:
        raise HTTPException(status_code=400, detail="Use restore to put a tube back in the freezer")
    if tube.status != IN_FREEZER:
        raise HTTPException(status_code=400, detail="This tube is no longer in the freezer")
    tube.status = data.status
    tube.removed_date = data.removed_date or date.today()
    tube.removed_by = data.removed_by
    tube.removed_note = data.removed_note
    db.commit()
    db.refresh(tube)
    return _tube_out(tube, can_see=can_see)


@router.post("/tubes/{tube_id}/restore", response_model=schemas.M80Tube)
def restore_tube(tube_id: int, db: Session = Depends(get_db), can_see: bool = Depends(can_see_restricted)):
    tube = _get(db, models.M80Tube, tube_id, "Tube")
    if tube.status == IN_FREEZER:
        return _tube_out(tube, can_see=can_see)
    _check_wells_free(db, tube.box, [tube.well], exclude_tube_id=tube.id)
    tube.status = IN_FREEZER
    tube.removed_date = tube.removed_by = tube.removed_note = None
    db.commit()
    db.refresh(tube)
    return _tube_out(tube, can_see=can_see)


@router.delete("/tubes/{tube_id}", status_code=204)
def delete_tube(tube_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, models.M80Tube, tube_id, "Tube"))
    db.commit()


# ── Excel import (one sample type per file) ────────────────────────────────
# Columns: the type's field labels, plus the common ones and the location the lab
# already uses: Freezer | Compartment | Rack | Level | Depth | Box Name | Location in Box
# ("4 (Bottom)" -> 4; "1-3" = row 1, column 3).

COMMON_COLUMNS = {
    "sample_name": ["name on tube", "sample", "sample name", "name"],
    "aliquot_number": ["aliquot #", "aliquot", "aliquot number"],
    "volume": ["aliquot size (ul)", "volume (ul)", "volume"],
    "frozen_date": ["date received", "frozen date", "date frozen"],
    "frozen_by": ["frozen by", "received by"],
    "comment": ["notes", "comment"],
    "status": ["status"],
    "freezer": ["freezer"], "compartment": ["compartment"], "rack": ["rack"], "level": ["level"],
    "slot": ["depth", "box position"], "box": ["box name", "box"], "well": ["location in box", "position in box", "well"],
}


def _norm(h) -> str:
    return re.sub(r"\s+", " ", str(h or "")).strip().lower()


def _lead_int(v) -> Optional[int]:
    m = re.match(r"\s*(\d+)", str(v if v is not None else ""))
    return int(m.group(1)) if m else None


def _volume(v) -> Optional[str]:
    """A bare number is a volume in µL (the lab's "Aliquot size (ul)" column)."""
    if v in (None, ""):
        return None
    s = str(v).strip()
    return f"{_number(s)} µL" if re.fullmatch(r"[\d.]+", s) else s


# "Finished by Armando", "Used", "Empty": the aliquot was used up and is no longer in the box
USED_NOTE = re.compile(r"^\s*(finished|used|empty|gone|consumed)\b(?:\s+by\s+(.+?))?\s*[.;]?\s*$", re.I)
STATUS_WORDS = {"in freezer": IN_FREEZER, "used": models.M80TubeStatus.USED, "discarded": models.M80TubeStatus.DISCARDED}


def _row_status(status_text, note):
    """(status, removed_by) from a Status column or a "Finished by X" note."""
    st = STATUS_WORDS.get(_norm(status_text)) if status_text else None
    m = USED_NOTE.match(str(note or ""))
    if st is None:
        st = models.M80TubeStatus.USED if m else IN_FREEZER
    return st, (m.group(2).strip() if m and m.group(2) else None)


def _find_freezer(freezers, text) -> Optional[models.M80Freezer]:
    t = _norm(text)
    exact = [f for f in freezers if _norm(f.name) == t]
    if exact:
        return exact[0]
    part = [f for f in freezers if re.search(rf"\b{re.escape(t)}\b", _norm(f.name))] if t else []
    return part[0] if len(part) == 1 else None


@router.post("/import")
def import_tubes(data: schemas.M80Import, dry_run: bool = True, db: Session = Depends(get_db),
                 can_see: bool = Depends(can_see_restricted)):
    """Create tubes from spreadsheet rows. With dry_run nothing is saved; the answer
    says what would happen row by row."""
    stype = _get(db, models.M80SampleType, data.sample_type_id, "Sample type")
    freezers = db.query(models.M80Freezer).all()
    created, used, skipped, new_boxes = 0, 0, [], {}
    taken = set()  # (box key, well) used by earlier rows of this file

    def skip(line, name, reason):
        skipped.append({"line": line, "name": name, "reason": reason})

    # Box sizes for boxes to create: from the file (largest column used), unless given
    widest: Dict[tuple, int] = {}
    for r in data.rows:
        row = {_norm(k): v for k, v in r.items()}
        w = str(next((row[c] for c in COMMON_COLUMNS["well"] if row.get(c) not in (None, "")), "") or "")
        m = re.match(r"\s*(\d+)\s*[-,.]\s*(\d+)", w)
        if m:
            key = tuple(str(next((row[c] for c in COMMON_COLUMNS[k] if c in row), "")) for k in ("freezer", "compartment", "rack", "level", "slot", "box"))
            widest[key] = max(widest.get(key, 0), int(m.group(2)))

    for i, r in enumerate(data.rows):
        line = r.get("_line", i + 2)
        row = {_norm(k): v for k, v in r.items() if not str(k).startswith("_")}
        col = lambda k: next((row[c] for c in COMMON_COLUMNS[k] if row.get(c) not in (None, "")), None)
        name = str(col("sample_name") or "").strip()
        if not name:
            skip(line, None, "No name on tube")
            continue
        try:
            values = clean_data(stype, {f["key"]: row.get(_norm(f["label"]), row.get(f["key"])) for f in stype.fields},
                                None, can_see)
            frozen = _date(col("frozen_date"))
            aliquot = _lead_int(col("aliquot_number"))
        except HTTPException as e:
            skip(line, name, e.detail)
            continue

        freezer = _find_freezer(freezers, col("freezer"))
        if not freezer:
            skip(line, name, f"Freezer '{col('freezer')}' not found")
            continue
        comp = next((c for c in freezer.compartments if c.number == _lead_int(col("compartment"))), None)
        if not comp:
            skip(line, name, f"{freezer.name} has no compartment '{col('compartment')}'")
            continue
        rack = next((x for x in comp.racks if x.number == _lead_int(col("rack"))), None)
        if not rack:
            skip(line, name, f"{freezer.name} compartment {comp.number} has no rack {col('rack')} (it has {len(comp.racks)}); set the racks up first")
            continue
        level, slot = _lead_int(col("level")), _lead_int(col("slot")) or 1
        if not level or not (1 <= level <= rack.levels and 1 <= slot <= rack.depth):
            skip(line, name, f"Rack {rack.number} has {rack.levels} levels × {rack.depth} positions; level {col('level')}, position {col('slot')} does not exist")
            continue
        label = str(col("box") or "").strip() or None
        box = next((b for b in rack.boxes if b.level == level and b.slot == slot), None)
        box_key = (freezer.id, comp.number, rack.number, level, slot)
        if not box:
            if box_key not in new_boxes:
                file_key = tuple(str(next((row[c] for c in COMMON_COLUMNS[k] if c in row), "")) for k in ("freezer", "compartment", "rack", "level", "slot", "box"))
                cols = data.box_columns or max(widest.get(file_key, 9), 9)
                rows_n = data.box_rows or cols
                _check_box_size(rows_n, cols)
                box = models.M80Box(rack_id=rack.id, level=level, slot=slot, rows=rows_n, columns=cols, label=label)
                db.add(box)
                db.flush()
                rack.boxes.append(box)
                new_boxes[box_key] = f"{freezer.name} · C{comp.number} · R{rack.number} · L{level} · P{slot}: {label or 'box'} ({rows_n}×{cols})"
            else:
                box = next(b for b in rack.boxes if b.level == level and b.slot == slot)
        elif label and box.label and _norm(box.label) != _norm(label):
            skip(line, name, f"That position holds box '{box.label}', not '{label}'")
            continue

        note = str(col("comment")).strip() if col("comment") else None
        status, used_by = _row_status(col("status"), note)
        w = str(col("well") or "").strip()
        m = re.match(r"(\d+)\s*[-,.]\s*(\d+)$", w)
        well = (int(m.group(1)) - 1) * box.columns + int(m.group(2)) if m and int(m.group(2)) <= box.columns else _lead_int(w) if not m else None
        if not well or not 1 <= well <= box.rows * box.columns:
            skip(line, name, f"Position '{w}' does not exist in a {box.rows}×{box.columns} box")
            continue
        same = db.query(models.M80Tube).filter(models.M80Tube.box_id == box.id, models.M80Tube.well == well,
                                               models.M80Tube.sample_name == name)
        if aliquot is not None:
            same = same.filter(models.M80Tube.aliquot_number == aliquot)
        if same.first():
            skip(line, name, "Already imported")
            continue
        # Used-up aliquots are history only: they do not take the position
        if status == IN_FREEZER:
            if (box.id, well) in taken:
                skip(line, name, f"Position {w} is used twice in the file")
                continue
            here = db.query(models.M80Tube).filter(models.M80Tube.box_id == box.id, models.M80Tube.well == well,
                                                   models.M80Tube.status == IN_FREEZER).first()
            if here:
                skip(line, name, f"Position {w} holds {here.sample_name}")
                continue
            taken.add((box.id, well))
        db.add(models.M80Tube(
            box_id=box.id, well=well, sample_name=name, sample_type=stype.name, sample_type_id=stype.id,
            data=values, aliquot_number=aliquot,
            volume=_volume(col("volume")),
            frozen_date=date.fromisoformat(frozen) if frozen else None, frozen_by=(str(col("frozen_by")).strip().upper() if col("frozen_by") else None),
            comment=note, status=status,
            removed_by=used_by if status != IN_FREEZER else None,
            removed_note=note if status != IN_FREEZER else None,
        ))
        created += 1
        if status != IN_FREEZER:
            used += 1

    result = {"dry_run": dry_run, "created": created, "used": used, "skipped": skipped,
              "new_boxes": list(new_boxes.values())}
    if dry_run:
        db.rollback()
    else:
        db.commit()
    return result
