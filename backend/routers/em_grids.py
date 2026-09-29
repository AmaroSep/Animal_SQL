from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from database import get_db

router = APIRouter(prefix="/em", tags=["em-grids"])

IN_BOX_STATUSES = (models.EMGridStatus.STORED, models.EMGridStatus.IMAGED)


def _positions(box: models.EMGridBox) -> List[str]:
    rows = [r.strip() for r in box.row_labels.split(",") if r.strip()]
    return [f"{r}{c}" for r in rows for c in range(1, box.columns + 1)]


def _grid_out(grid: models.EMGrid) -> schemas.EMGrid:
    out = schemas.EMGrid.model_validate(grid)
    out.box_number = grid.box.box_number if grid.box else None
    return out


def _box_summary(box: models.EMGridBox, detail: bool = False):
    occupied = [g for g in box.grids if g.status in IN_BOX_STATUSES]
    data = dict(
        id=box.id, box_number=box.box_number, box_type=box.box_type,
        row_labels=box.row_labels, columns=box.columns, lot=box.lot,
        default_grid_type=box.default_grid_type, location=box.location, notes=box.notes,
        capacity=len(_positions(box)), occupied=len(occupied),
    )
    if detail:
        return schemas.EMGridBoxDetail(**data, grids=[_grid_out(g) for g in box.grids])
    return schemas.EMGridBoxSummary(**data)


def _get_box(db: Session, box_id: int) -> models.EMGridBox:
    box = db.query(models.EMGridBox).filter(models.EMGridBox.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail="Caja no encontrada")
    return box


def _check_slot(db: Session, box: models.EMGridBox, position: str, status, exclude_grid_id: Optional[int] = None):
    if position not in _positions(box):
        raise HTTPException(status_code=400, detail=f"Posición {position} no existe en la caja {box.box_number}")
    if status not in IN_BOX_STATUSES:
        return
    q = db.query(models.EMGrid).filter(
        models.EMGrid.box_id == box.id,
        models.EMGrid.position == position,
        models.EMGrid.status.in_(IN_BOX_STATUSES),
    )
    if exclude_grid_id is not None:
        q = q.filter(models.EMGrid.id != exclude_grid_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"La posición {position} de la caja {box.box_number} ya está ocupada")


# ── Boxes ──────────────────────────────────────────────────────────────────

@router.get("/boxes", response_model=List[schemas.EMGridBoxSummary])
def list_boxes(db: Session = Depends(get_db)):
    boxes = db.query(models.EMGridBox).order_by(models.EMGridBox.box_number).all()
    return [_box_summary(b) for b in boxes]


@router.get("/boxes/{box_id}", response_model=schemas.EMGridBoxDetail)
def get_box(box_id: int, db: Session = Depends(get_db)):
    return _box_summary(_get_box(db, box_id), detail=True)


@router.post("/boxes", response_model=schemas.EMGridBoxSummary, status_code=201)
def create_box(data: schemas.EMGridBoxCreate, db: Session = Depends(get_db)):
    if db.query(models.EMGridBox).filter(models.EMGridBox.box_number == data.box_number).first():
        raise HTTPException(status_code=400, detail="Ya existe una caja con ese número")
    box = models.EMGridBox(**data.model_dump())
    db.add(box)
    db.commit()
    db.refresh(box)
    return _box_summary(box)


@router.put("/boxes/{box_id}", response_model=schemas.EMGridBoxSummary)
def update_box(box_id: int, data: schemas.EMGridBoxUpdate, db: Session = Depends(get_db)):
    box = _get_box(db, box_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(box, k, v)
    # A layout change must not orphan grids that are still in the box
    valid = set(_positions(box))
    orphans = [g.position for g in box.grids if g.status in IN_BOX_STATUSES and g.position not in valid]
    if orphans:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"El nuevo formato deja fuera grids en: {', '.join(orphans)}")
    db.commit()
    db.refresh(box)
    return _box_summary(box)


@router.delete("/boxes/{box_id}", status_code=204)
def delete_box(box_id: int, db: Session = Depends(get_db)):
    box = _get_box(db, box_id)
    if box.grids:
        raise HTTPException(status_code=400, detail="La caja tiene grids registradas; elimínalas o muévelas primero")
    db.delete(box)
    db.commit()


# ── Grids ──────────────────────────────────────────────────────────────────

@router.get("/grids", response_model=List[schemas.EMGrid])
def list_grids(q: Optional[str] = None, status: Optional[models.EMGridStatus] = None, db: Session = Depends(get_db)):
    query = db.query(models.EMGrid).join(models.EMGridBox)
    if status:
        query = query.filter(models.EMGrid.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            models.EMGrid.sample.ilike(like)
            | models.EMGrid.stain_type.ilike(like)
            | models.EMGrid.grid_type.ilike(like)
            | models.EMGrid.notes.ilike(like)
            | models.EMGridBox.box_number.ilike(like)
        )
    grids = query.order_by(models.EMGrid.prep_date.desc().nullslast(), models.EMGrid.id.desc()).all()
    return [_grid_out(g) for g in grids]


@router.post("/grids", response_model=schemas.EMGrid, status_code=201)
def create_grid(data: schemas.EMGridCreate, db: Session = Depends(get_db)):
    box = _get_box(db, data.box_id)
    _check_slot(db, box, data.position, data.status)
    grid = models.EMGrid(**data.model_dump())
    if not grid.grid_type:
        grid.grid_type = box.default_grid_type
    db.add(grid)
    db.commit()
    db.refresh(grid)
    return _grid_out(grid)


@router.put("/grids/{grid_id}", response_model=schemas.EMGrid)
def update_grid(grid_id: int, data: schemas.EMGridUpdate, db: Session = Depends(get_db)):
    grid = db.query(models.EMGrid).filter(models.EMGrid.id == grid_id).first()
    if not grid:
        raise HTTPException(status_code=404, detail="Grid no encontrada")
    changes = data.model_dump(exclude_unset=True)
    box = _get_box(db, changes.get("box_id", grid.box_id))
    _check_slot(db, box, changes.get("position", grid.position), changes.get("status", grid.status), exclude_grid_id=grid.id)
    for k, v in changes.items():
        setattr(grid, k, v)
    db.commit()
    db.refresh(grid)
    return _grid_out(grid)


@router.delete("/grids/{grid_id}", status_code=204)
def delete_grid(grid_id: int, db: Session = Depends(get_db)):
    grid = db.query(models.EMGrid).filter(models.EMGrid.id == grid_id).first()
    if not grid:
        raise HTTPException(status_code=404, detail="Grid no encontrada")
    db.delete(grid)
    db.commit()
