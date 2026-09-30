from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from database import get_db, engine, text

router = APIRouter(prefix="/em", tags=["em-grids"])


@router.on_event("startup")
def migrate_single_stain_columns():
    """v1 stored one stain per grid in em_grids.stain_type / stain_time_s.
    Move those values to step 1 of em_grid_stain_steps and drop the columns."""
    sql = """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='em_grids' AND column_name='stain_type'
        ) THEN
            INSERT INTO em_grid_stain_steps (grid_id, step_order, stain_type, stain_time_s)
            SELECT g.id, 1, g.stain_type, g.stain_time_s FROM em_grids g
            WHERE (g.stain_type IS NOT NULL OR g.stain_time_s IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM em_grid_stain_steps s WHERE s.grid_id = g.id);
            ALTER TABLE em_grids DROP COLUMN stain_type;
            ALTER TABLE em_grids DROP COLUMN IF EXISTS stain_time_s;
        END IF;
    END$$;
    """
    with engine.begin() as conn:
        conn.execute(text(sql))
        # v3: sample fixation
        conn.execute(text("ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS fixed BOOLEAN"))
        conn.execute(text("ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS fixative VARCHAR"))
        # v4: sample dilution
        conn.execute(text("ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS dilution_factor FLOAT"))

# Discarded grids are kept physically in the box (shown red), so they still occupy their slot
IN_BOX_STATUSES = (models.EMGridStatus.STORED, models.EMGridStatus.IMAGED, models.EMGridStatus.DISCARDED)


# Fixed layouts of the commercial boxes (must match frontend boxLayouts.js).
# Quantifoil: two halves A–J / K–T, columns 1–10, staggered (diamond) slots:
# each row holds only odd or only even columns, 5 grids per row, 100 per box.
QUANTIFOIL_ODD_ROWS = set("ACEGILNPRT")
QUANTIFOIL_POSITIONS = [
    f"{r}{c}"
    for r in "ABCDEFGHIJKLMNOPQRST"
    for c in range(1, 11)
    if (c % 2 == 1) == (r in QUANTIFOIL_ODD_ROWS)
]
# EMS: rows A–E, columns 1–5 on one half and 6–10 on the other, 50 per box.
EMS_POSITIONS = [f"{r}{c}" for r in "ABCDE" for c in range(1, 11)]


def _positions(box: models.EMGridBox) -> List[str]:
    if box.box_type == "Quantifoil":
        return QUANTIFOIL_POSITIONS
    if box.box_type == "EMS":
        return EMS_POSITIONS
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


def _set_stain_steps(grid: models.EMGrid, steps: List[schemas.EMGridStainStepIn]):
    # Steps are replaced as a whole; empty rows are dropped and the rest renumbered
    kept = [st for st in steps if any(v not in (None, "") for v in st.model_dump().values())]
    grid.stain_steps = [
        models.EMGridStainStep(step_order=i, **st.model_dump()) for i, st in enumerate(kept, start=1)
    ]


def _get_box(db: Session, box_id: int) -> models.EMGridBox:
    box = db.query(models.EMGridBox).filter(models.EMGridBox.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    return box


def _check_slot(db: Session, box: models.EMGridBox, position: str, status, exclude_grid_id: Optional[int] = None):
    if position not in _positions(box):
        raise HTTPException(status_code=400, detail=f"Position {position} does not exist in box {box.box_number}")
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
        raise HTTPException(status_code=400, detail=f"Position {position} in box {box.box_number} is already occupied")


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
        raise HTTPException(status_code=400, detail="A box with that number already exists")
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
        raise HTTPException(status_code=400, detail=f"The new layout would leave out grids at: {', '.join(orphans)}")
    db.commit()
    db.refresh(box)
    return _box_summary(box)


@router.delete("/boxes/{box_id}", status_code=204)
def delete_box(box_id: int, db: Session = Depends(get_db)):
    box = _get_box(db, box_id)
    if box.grids:
        raise HTTPException(status_code=400, detail="The box still has grids; delete or move them first")
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
            | models.EMGrid.stain_steps.any(models.EMGridStainStep.stain_type.ilike(like))
            | models.EMGrid.stain_steps.any(models.EMGridStainStep.drying_method.ilike(like))
            | models.EMGrid.grid_type.ilike(like)
            | models.EMGrid.fixative.ilike(like)
            | models.EMGrid.notes.ilike(like)
            | models.EMGridBox.box_number.ilike(like)
        )
    grids = query.order_by(models.EMGrid.prep_date.desc().nullslast(), models.EMGrid.id.desc()).all()
    return [_grid_out(g) for g in grids]


@router.post("/grids", response_model=schemas.EMGrid, status_code=201)
def create_grid(data: schemas.EMGridCreate, db: Session = Depends(get_db)):
    box = _get_box(db, data.box_id)
    _check_slot(db, box, data.position, data.status)
    grid = models.EMGrid(**data.model_dump(exclude={"stain_steps"}))
    if not grid.fixed:
        grid.fixative = None
    _set_stain_steps(grid, data.stain_steps)
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
        raise HTTPException(status_code=404, detail="Grid not found")
    changes = data.model_dump(exclude_unset=True)
    box = _get_box(db, changes.get("box_id", grid.box_id))
    _check_slot(db, box, changes.get("position", grid.position), changes.get("status", grid.status), exclude_grid_id=grid.id)
    if "stain_steps" in changes:
        changes.pop("stain_steps")
        _set_stain_steps(grid, data.stain_steps or [])
    for k, v in changes.items():
        setattr(grid, k, v)
    if not grid.fixed:
        grid.fixative = None
    db.commit()
    db.refresh(grid)
    return _grid_out(grid)


@router.delete("/grids/{grid_id}", status_code=204)
def delete_grid(grid_id: int, db: Session = Depends(get_db)):
    grid = db.query(models.EMGrid).filter(models.EMGrid.id == grid_id).first()
    if not grid:
        raise HTTPException(status_code=404, detail="Grid not found")
    db.delete(grid)
    db.commit()
