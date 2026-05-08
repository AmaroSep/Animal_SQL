import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from database import get_db

router = APIRouter(prefix="/gels", tags=["gels"])

UPLOAD_DIR = "/app/uploads/gels"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


@router.post("", response_model=schemas.GenotypeGel, status_code=201)
async def upload_gel(
    file: UploadFile = File(...),
    experiment_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    validated_by: Optional[str] = Form(None),
    lane_count: int = Form(12),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    gel = models.GenotypeGel(
        experiment_id=experiment_id,
        image_path=f"uploads/gels/{filename}",
        notes=notes,
        validated_by=validated_by,
    )
    db.add(gel)
    db.flush()

    for i in range(1, lane_count + 1):
        lane = models.GelLane(gel_id=gel.id, lane_number=i)
        db.add(lane)

    db.commit()
    db.refresh(gel)
    return gel


@router.get("", response_model=List[schemas.GenotypeGel])
def list_gels(experiment_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.GenotypeGel)
    if experiment_id is not None:
        q = q.filter(models.GenotypeGel.experiment_id == experiment_id)
    return q.order_by(models.GenotypeGel.uploaded_at.desc()).all()


@router.get("/{gel_id}", response_model=schemas.GenotypeGel)
def get_gel(gel_id: int, db: Session = Depends(get_db)):
    gel = db.query(models.GenotypeGel).filter(models.GenotypeGel.id == gel_id).first()
    if not gel:
        raise HTTPException(status_code=404, detail="Gel not found")
    return gel


@router.put("/{gel_id}", response_model=schemas.GenotypeGel)
def update_gel(gel_id: int, data: schemas.GenotypeGelUpdate, db: Session = Depends(get_db)):
    gel = db.query(models.GenotypeGel).filter(models.GenotypeGel.id == gel_id).first()
    if not gel:
        raise HTTPException(status_code=404, detail="Gel not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(gel, k, v)
    db.commit()
    db.refresh(gel)
    return gel


@router.patch("/{gel_id}/lanes/{lane_id}", response_model=schemas.GelLane)
def update_lane(gel_id: int, lane_id: int, data: schemas.GelLaneUpdate, db: Session = Depends(get_db)):
    lane = db.query(models.GelLane).filter(
        models.GelLane.id == lane_id,
        models.GelLane.gel_id == gel_id
    ).first()
    if not lane:
        raise HTTPException(status_code=404, detail="Lane not found")

    old_genotype = lane.called_genotype
    for k, v in data.dict(exclude_unset=True).items():
        setattr(lane, k, v)

    # Auto-confirm and update animal genotype when called_genotype is set
    if data.called_genotype is not None and lane.animal_id:
        lane.confirmed_at = datetime.utcnow()
        animal = db.query(models.Animal).filter(models.Animal.id == lane.animal_id).first()
        if animal and data.called_genotype != models.CalledGenotype.FAIL:
            animal.genotype = data.called_genotype.value
            animal.genotype_validated = True
            animal.genotype_validated_at = datetime.utcnow()

    db.commit()
    db.refresh(lane)
    return lane


@router.delete("/{gel_id}", status_code=204)
def delete_gel(gel_id: int, db: Session = Depends(get_db)):
    gel = db.query(models.GenotypeGel).filter(models.GenotypeGel.id == gel_id).first()
    if not gel:
        raise HTTPException(status_code=404, detail="Gel not found")
    # Remove file from disk
    full_path = os.path.join("/app", gel.image_path)
    if os.path.exists(full_path):
        os.remove(full_path)
    db.delete(gel)
    db.commit()
