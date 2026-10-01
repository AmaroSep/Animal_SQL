from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models, schemas
from database import get_db

router = APIRouter(prefix="/m80", tags=["-80 freezers"])

IN_FREEZER = models.M80TubeStatus.IN_FREEZER
BOX_SIZES = {(9, 9), (10, 10)}


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


def _tube_out(t: models.M80Tube, with_location: bool = True) -> schemas.M80Tube:
    out = schemas.M80Tube.model_validate(t)
    if with_location:
        out.location = _location(t.box)
        out.box_label = t.box.label
    return out


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

def _box_detail(box: models.M80Box) -> schemas.M80BoxDetail:
    return schemas.M80BoxDetail(**_box_summary(box).model_dump(), location=_location(box),
                                tubes=[_tube_out(t, with_location=False) for t in box.tubes])


@router.get("/boxes/{box_id}", response_model=schemas.M80BoxDetail)
def get_box(box_id: int, db: Session = Depends(get_db)):
    return _box_detail(_get(db, models.M80Box, box_id, "Box"))


@router.post("/boxes", response_model=schemas.M80BoxDetail, status_code=201)
def create_box(data: schemas.M80BoxCreate, db: Session = Depends(get_db)):
    rack = _get(db, models.M80Rack, data.rack_id, "Rack")
    if (data.rows, data.columns) not in BOX_SIZES:
        raise HTTPException(status_code=400, detail="Box size must be 9x9 (81) or 10x10 (100)")
    _check_slot(db, rack, data.level, data.slot)
    box = models.M80Box(**data.model_dump())
    box.label = box.label or None
    db.add(box)
    db.commit()
    db.refresh(box)
    return _box_detail(box)


@router.put("/boxes/{box_id}", response_model=schemas.M80BoxDetail)
def update_box(box_id: int, data: schemas.M80BoxUpdate, db: Session = Depends(get_db)):
    box = _get(db, models.M80Box, box_id, "Box")
    changes = data.model_dump(exclude_unset=True)
    if {"rack_id", "level", "slot"} & changes.keys():  # moving the box
        rack = _get(db, models.M80Rack, changes.get("rack_id", box.rack_id), "Rack")
        _check_slot(db, rack, changes.get("level", box.level), changes.get("slot", box.slot), exclude_box_id=box.id)
    if {"rows", "columns"} & changes.keys():
        size = (changes.get("rows", box.rows), changes.get("columns", box.columns))
        if size not in BOX_SIZES:
            raise HTTPException(status_code=400, detail="Box size must be 9x9 (81) or 10x10 (100)")
        if size != (box.rows, box.columns) and any(t.status == IN_FREEZER for t in box.tubes):
            raise HTTPException(status_code=400, detail="The box size can only change while the box is empty")
    for k, v in changes.items():
        setattr(box, k, v if k in ("rack_id", "level", "slot", "rows", "columns") else (v or None))
    db.commit()
    db.refresh(box)
    return _box_detail(box)


@router.delete("/boxes/{box_id}", status_code=204)
def delete_box(box_id: int, db: Session = Depends(get_db)):
    box = _get(db, models.M80Box, box_id, "Box")
    if box.tubes:
        raise HTTPException(status_code=400, detail="The box has tube records (including used ones); it cannot be deleted")
    db.delete(box)
    db.commit()


# ── Tubes ──────────────────────────────────────────────────────────────────

@router.get("/tubes", response_model=List[schemas.M80Tube])
def list_tubes(q: Optional[str] = None, status: Optional[models.M80TubeStatus] = None, db: Session = Depends(get_db)):
    query = db.query(models.M80Tube).options(
        joinedload(models.M80Tube.box).joinedload(models.M80Box.rack)
        .joinedload(models.M80Rack.compartment).joinedload(models.M80Compartment.freezer)
    )
    if status:
        query = query.filter(models.M80Tube.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            models.M80Tube.sample_name.ilike(like) | models.M80Tube.sample_type.ilike(like)
            | models.M80Tube.source.ilike(like) | models.M80Tube.comment.ilike(like)
            | models.M80Tube.frozen_by.ilike(like)
        )
    return [_tube_out(t) for t in query.order_by(models.M80Tube.sample_name, models.M80Tube.id).all()]


@router.post("/tubes/batch", response_model=List[schemas.M80Tube], status_code=201)
def create_tubes(data: schemas.M80TubeBatchCreate, db: Session = Depends(get_db)):
    if not data.wells:
        raise HTTPException(status_code=400, detail="Select at least one position")
    if not data.data.sample_name.strip():
        raise HTTPException(status_code=400, detail="Sample name is required")
    box = _get(db, models.M80Box, data.box_id, "Box")
    _check_wells_free(db, box, data.wells)
    tubes = [models.M80Tube(box_id=box.id, well=w, **data.data.model_dump()) for w in sorted(data.wells)]
    db.add_all(tubes)
    db.commit()
    return [_tube_out(t) for t in tubes]


@router.put("/tubes/{tube_id}", response_model=schemas.M80Tube)
def update_tube(tube_id: int, data: schemas.M80TubeUpdate, db: Session = Depends(get_db)):
    tube = _get(db, models.M80Tube, tube_id, "Tube")
    changes = data.model_dump(exclude_unset=True)
    if "sample_name" in changes and not (changes["sample_name"] or "").strip():
        raise HTTPException(status_code=400, detail="Sample name is required")
    if ("box_id" in changes or "well" in changes) and tube.status == IN_FREEZER:
        box = _get(db, models.M80Box, changes.get("box_id", tube.box_id), "Box")
        _check_wells_free(db, box, [changes.get("well", tube.well)], exclude_tube_id=tube.id)
    for k, v in changes.items():
        setattr(tube, k, v)
    db.commit()
    db.refresh(tube)
    return _tube_out(tube)


@router.post("/tubes/{tube_id}/remove", response_model=schemas.M80Tube)
def remove_tube(tube_id: int, data: schemas.M80TubeRemove, db: Session = Depends(get_db)):
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
    return _tube_out(tube)


@router.post("/tubes/{tube_id}/restore", response_model=schemas.M80Tube)
def restore_tube(tube_id: int, db: Session = Depends(get_db)):
    tube = _get(db, models.M80Tube, tube_id, "Tube")
    if tube.status == IN_FREEZER:
        return _tube_out(tube)
    _check_wells_free(db, tube.box, [tube.well], exclude_tube_id=tube.id)
    tube.status = IN_FREEZER
    tube.removed_date = tube.removed_by = tube.removed_note = None
    db.commit()
    db.refresh(tube)
    return _tube_out(tube)


@router.delete("/tubes/{tube_id}", status_code=204)
def delete_tube(tube_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, models.M80Tube, tube_id, "Tube"))
    db.commit()
