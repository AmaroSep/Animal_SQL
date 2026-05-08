from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from database import get_db

router = APIRouter(prefix="/extractions", tags=["extractions"])


@router.get("", response_model=List[schemas.Extraction])
def list_extractions(
    animal_id: Optional[str] = None,
    experiment_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Extraction)
    if animal_id:
        q = q.filter(models.Extraction.animal_id == animal_id)
    if experiment_id is not None:
        q = q.filter(models.Extraction.experiment_id == experiment_id)
    return q.order_by(models.Extraction.date.desc()).all()


@router.post("", response_model=schemas.Extraction, status_code=201)
def create_extraction(data: schemas.ExtractionCreate, db: Session = Depends(get_db)):
    animal = db.query(models.Animal).filter(models.Animal.id == data.animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    obj = models.Extraction(**data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{extraction_id}", response_model=schemas.Extraction)
def update_extraction(extraction_id: int, data: schemas.ExtractionUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Extraction).filter(models.Extraction.id == extraction_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Extraction not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{extraction_id}", status_code=204)
def delete_extraction(extraction_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Extraction).filter(models.Extraction.id == extraction_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Extraction not found")
    db.delete(obj)
    db.commit()
