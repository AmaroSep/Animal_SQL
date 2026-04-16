from pydantic import BaseModel
from datetime import date
from typing import List, Optional
import models
from models import AnimalStatus, AnimalSex

class AnimalBase(BaseModel):
    id: str # MOUSE-001
    sex: AnimalSex
    dob: date
    mark: str
    genotype: str
    status: AnimalStatus = AnimalStatus.ALIVE
    elimination_reason: Optional[str] = None

class AnimalCreate(AnimalBase):
    cage_id: int

class AnimalUpdate(BaseModel):
    id: Optional[str] = None
    sex: Optional[AnimalSex] = None
    dob: Optional[date] = None
    mark: Optional[str] = None
    genotype: Optional[str] = None

class Animal(AnimalBase):
    cage_id: int
    previous_cage_id: Optional[int] = None
    age_display: str

    class Config:
        from_attributes = True

class CageBase(BaseModel):
    row: int
    column: int
    rack_id: int
    is_breeding_pair: bool = False

class Cage(CageBase):
    id: int
    display_id: str
    animals: List[Animal] = []

    class Config:
        from_attributes = True

class CageUpdate(BaseModel):
    is_breeding_pair: bool

class RackBase(BaseModel):
    name: str

class Rack(RackBase):
    id: int
    cages: List[Cage] = []

    class Config:
        from_attributes = True

class StatusUpdate(BaseModel):
    status: AnimalStatus
    reason: Optional[str] = None

class BreedingCreate(BaseModel):
    animal_ids: List[str]
    target_cage_id: int
    type: str # "Pair" or "Trio"

class BreedingEnd(BaseModel):
    target_option: str # "Home" or "New"
    new_cage_id: Optional[int] = None

class CageMerge(BaseModel):
    source_cage_id: int
    destination_cage_id: int
