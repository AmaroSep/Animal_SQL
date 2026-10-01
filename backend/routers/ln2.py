from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models, schemas
from database import get_db, SessionLocal

router = APIRouter(prefix="/ln2", tags=["ln2-tank"])

# Tank layout: 4 canes (racks) with 10 boxes of 9x9 vials each
N_RACKS = 4
BOXES_PER_RACK = 10

IN_TANK = models.LNVialStatus.IN_TANK


@router.on_event("startup")
def seed_tank():
    """Create the rack/box structure the first time the module runs."""
    db = SessionLocal()
    try:
        if db.query(models.LNRack).count() == 0:
            for r in range(1, N_RACKS + 1):
                rack = models.LNRack(number=r)
                db.add(rack)
                db.flush()
                for b in range(1, BOXES_PER_RACK + 1):
                    db.add(models.LNBox(rack_id=rack.id, number=b, rows=9, columns=9))
            db.commit()
    finally:
        db.close()


def _vial_out(v: models.LNVial) -> schemas.LNVial:
    out = schemas.LNVial.model_validate(v)
    out.box_number = v.box.number
    out.rack_number = v.box.rack.number
    return out


def _box_summary(box: models.LNBox, detail: bool = False):
    data = dict(
        id=box.id, rack_number=box.rack.number, number=box.number, label=box.label,
        restriction=box.restriction, notes=box.notes, rows=box.rows, columns=box.columns,
        capacity=box.rows * box.columns,
        occupied=sum(1 for v in box.vials if v.status == IN_TANK),
    )
    if detail:
        return schemas.LNBoxDetail(**data, vials=[_vial_out(v) for v in box.vials])
    return schemas.LNBoxSummary(**data)


def _get_box(db: Session, box_id: int) -> models.LNBox:
    box = db.query(models.LNBox).filter(models.LNBox.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    return box


def _get_vial(db: Session, vial_id: int) -> models.LNVial:
    vial = db.query(models.LNVial).filter(models.LNVial.id == vial_id).first()
    if not vial:
        raise HTTPException(status_code=404, detail="Vial not found")
    return vial


def _check_wells_free(db: Session, box: models.LNBox, wells: List[int], exclude_vial_id: Optional[int] = None):
    capacity = box.rows * box.columns
    bad = [w for w in wells if w < 1 or w > capacity]
    if bad:
        raise HTTPException(status_code=400, detail=f"Positions {bad} do not exist in a {capacity}-position box")
    if len(set(wells)) != len(wells):
        raise HTTPException(status_code=400, detail="The same position was selected twice")
    q = db.query(models.LNVial.well).filter(
        models.LNVial.box_id == box.id,
        models.LNVial.well.in_(wells),
        models.LNVial.status == IN_TANK,
    )
    if exclude_vial_id is not None:
        q = q.filter(models.LNVial.id != exclude_vial_id)
    taken = sorted(w for (w,) in q.all())
    if taken:
        raise HTTPException(
            status_code=400,
            detail=f"Position(s) {', '.join(map(str, taken))} in rack {box.rack.number} box {box.number} are occupied",
        )


# ── Tank & boxes ───────────────────────────────────────────────────────────

@router.get("/tank", response_model=List[schemas.LNRackSummary])
def get_tank(db: Session = Depends(get_db)):
    racks = (
        db.query(models.LNRack)
        .options(joinedload(models.LNRack.boxes).joinedload(models.LNBox.vials))
        .order_by(models.LNRack.number)
        .all()
    )
    return [
        schemas.LNRackSummary(id=r.id, number=r.number, boxes=[_box_summary(b) for b in r.boxes])
        for r in racks
    ]


@router.get("/boxes/{box_id}", response_model=schemas.LNBoxDetail)
def get_box(box_id: int, db: Session = Depends(get_db)):
    return _box_summary(_get_box(db, box_id), detail=True)


@router.put("/boxes/{box_id}", response_model=schemas.LNBoxSummary)
def update_box(box_id: int, data: schemas.LNBoxUpdate, db: Session = Depends(get_db)):
    box = _get_box(db, box_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(box, k, v or None)
    db.commit()
    db.refresh(box)
    return _box_summary(box)


# ── Vials ──────────────────────────────────────────────────────────────────

@router.get("/vials", response_model=List[schemas.LNVial])
def list_vials(q: Optional[str] = None, status: Optional[models.LNVialStatus] = None, db: Session = Depends(get_db)):
    query = db.query(models.LNVial).options(joinedload(models.LNVial.box).joinedload(models.LNBox.rack))
    if status:
        query = query.filter(models.LNVial.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            models.LNVial.cell_line.ilike(like)
            | models.LNVial.protein_expression.ilike(like)
            | models.LNVial.comment.ilike(like)
            | models.LNVial.additional_comment.ilike(like)
            | models.LNVial.frozen_by.ilike(like)
        )
    return [_vial_out(v) for v in query.order_by(models.LNVial.cell_line, models.LNVial.id).all()]


@router.post("/vials/batch", response_model=List[schemas.LNVial], status_code=201)
def create_vials(data: schemas.LNVialBatchCreate, db: Session = Depends(get_db)):
    """Freeze a batch: the same data in several positions of one box."""
    if not data.wells:
        raise HTTPException(status_code=400, detail="Select at least one position")
    if not data.data.cell_line.strip():
        raise HTTPException(status_code=400, detail="Cell line is required")
    box = _get_box(db, data.box_id)
    _check_wells_free(db, box, data.wells)
    vials = [models.LNVial(box_id=box.id, well=w, **data.data.model_dump()) for w in sorted(data.wells)]
    db.add_all(vials)
    db.commit()
    return [_vial_out(v) for v in vials]


@router.put("/vials/{vial_id}", response_model=schemas.LNVial)
def update_vial(vial_id: int, data: schemas.LNVialUpdate, db: Session = Depends(get_db)):
    vial = _get_vial(db, vial_id)
    changes = data.model_dump(exclude_unset=True)
    if "cell_line" in changes and not (changes["cell_line"] or "").strip():
        raise HTTPException(status_code=400, detail="Cell line is required")
    if ("box_id" in changes or "well" in changes) and vial.status == IN_TANK:
        box = _get_box(db, changes.get("box_id", vial.box_id))
        _check_wells_free(db, box, [changes.get("well", vial.well)], exclude_vial_id=vial.id)
    for k, v in changes.items():
        setattr(vial, k, v)
    db.commit()
    db.refresh(vial)
    return _vial_out(vial)


@router.post("/vials/{vial_id}/remove", response_model=schemas.LNVial)
def remove_vial(vial_id: int, data: schemas.LNVialRemove, db: Session = Depends(get_db)):
    """Thaw or discard a vial: it leaves the tank but stays in the history."""
    vial = _get_vial(db, vial_id)
    if data.status == IN_TANK:
        raise HTTPException(status_code=400, detail="Use restore to put a vial back in the tank")
    if vial.status != IN_TANK:
        raise HTTPException(status_code=400, detail="This vial is no longer in the tank")
    vial.status = data.status
    vial.removed_date = data.removed_date or date.today()
    vial.removed_by = data.removed_by
    vial.removed_note = data.removed_note
    db.commit()
    db.refresh(vial)
    return _vial_out(vial)


@router.post("/vials/{vial_id}/restore", response_model=schemas.LNVial)
def restore_vial(vial_id: int, db: Session = Depends(get_db)):
    """Undo a removal (e.g. recorded by mistake) if its position is still free."""
    vial = _get_vial(db, vial_id)
    if vial.status == IN_TANK:
        return _vial_out(vial)
    _check_wells_free(db, vial.box, [vial.well], exclude_vial_id=vial.id)
    vial.status = IN_TANK
    vial.removed_date = vial.removed_by = vial.removed_note = None
    db.commit()
    db.refresh(vial)
    return _vial_out(vial)


@router.delete("/vials/{vial_id}", status_code=204)
def delete_vial(vial_id: int, db: Session = Depends(get_db)):
    db.delete(_get_vial(db, vial_id))
    db.commit()


# ── One-time import from the lab spreadsheets ─────────────────────────────

@router.post("/import")
def import_tank(data: schemas.LNImport, db: Session = Depends(get_db)):
    """Load box notes and vials parsed from the Excel files. Refused if the tank already has vials."""
    if db.query(models.LNVial).count() > 0:
        raise HTTPException(status_code=400, detail="The tank already has vials; import only works on an empty tank")
    boxes = {
        (b.rack.number, b.number): b
        for b in db.query(models.LNBox).options(joinedload(models.LNBox.rack)).all()
    }
    for ib in data.boxes:
        box = boxes.get((ib.rack, ib.box))
        if not box:
            raise HTTPException(status_code=400, detail=f"Rack {ib.rack} box {ib.box} does not exist")
        box.label, box.restriction, box.notes = ib.label, ib.restriction, ib.notes
    seen = set()
    for iv in data.vials:
        box = boxes.get((iv.rack, iv.box))
        if not box:
            raise HTTPException(status_code=400, detail=f"Rack {iv.rack} box {iv.box} does not exist")
        if not 1 <= iv.well <= box.rows * box.columns:
            raise HTTPException(status_code=400, detail=f"Rack {iv.rack} box {iv.box}: invalid position {iv.well}")
        if iv.status == IN_TANK:
            key = (box.id, iv.well)
            if key in seen:
                raise HTTPException(status_code=400, detail=f"Rack {iv.rack} box {iv.box} position {iv.well} is duplicated")
            seen.add(key)
        db.add(models.LNVial(box_id=box.id, **iv.model_dump(exclude={"rack", "box"})))
    db.commit()
    return {"boxes": len(data.boxes), "vials": len(data.vials)}
