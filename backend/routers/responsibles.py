from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from database import get_db

router = APIRouter(prefix="/responsibles", tags=["responsibles"])


@router.get("", response_model=List[schemas.ColonyResponsible])
def list_responsibles(db: Session = Depends(get_db)):
    return db.query(models.ColonyResponsible).filter(models.ColonyResponsible.active == True).all()


@router.post("", response_model=schemas.ColonyResponsible, status_code=201)
def create_responsible(data: schemas.ColonyResponsibleCreate, db: Session = Depends(get_db)):
    existing = db.query(models.ColonyResponsible).filter(models.ColonyResponsible.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    obj = models.ColonyResponsible(**data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{responsible_id}", response_model=schemas.ColonyResponsible)
def update_responsible(responsible_id: int, data: schemas.ColonyResponsibleUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.ColonyResponsible).filter(models.ColonyResponsible.id == responsible_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Responsible not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/racks/{rack_id}/responsible", response_model=schemas.Rack)
def assign_rack_responsible(rack_id: int, data: schemas.RackResponsibleUpdate, db: Session = Depends(get_db)):
    rack = db.query(models.Rack).filter(models.Rack.id == rack_id).first()
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")
    if data.responsible_id is not None:
        resp = db.query(models.ColonyResponsible).filter(models.ColonyResponsible.id == data.responsible_id).first()
        if not resp:
            raise HTTPException(status_code=404, detail="Responsible not found")
    rack.responsible_id = data.responsible_id
    db.commit()
    db.refresh(rack)
    return rack
