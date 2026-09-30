from pydantic import BaseModel
from datetime import date, datetime
from typing import List, Optional
import models
from models import AnimalStatus, AnimalSex, ColonyResponsibleRole, EMGridStatus

# ── Animal ─────────────────────────────────────────────────────────────────

class AnimalBase(BaseModel):
    sex: AnimalSex
    dob: date
    mark: str
    genotype: str
    status: AnimalStatus = AnimalStatus.ALIVE
    elimination_reason: Optional[str] = None

class AnimalCreate(AnimalBase):
    cage_id: int

class AnimalUpdate(BaseModel):
    sex: Optional[AnimalSex] = None
    dob: Optional[date] = None
    mark: Optional[str] = None
    genotype: Optional[str] = None
    cage_id: Optional[int] = None

class Animal(AnimalBase):
    id: int
    cage_id: int
    previous_cage_id: Optional[int] = None
    age_display: str
    status_changed_at: Optional[datetime] = None
    genotype_validated: bool = False
    genotype_validated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── Cage & Rack ────────────────────────────────────────────────────────────

class CageCreate(BaseModel):
    row: int
    column: int
    rack_id: int

class CageBase(BaseModel):
    row: int
    column: int
    rack_id: int
    is_breeding_pair: bool = False
    cage_number: Optional[int] = None

class Cage(CageBase):
    id: int
    display_id: str
    animals: List[Animal] = []

    class Config:
        from_attributes = True

class CageUpdate(BaseModel):
    is_breeding_pair: bool

class CageNumberUpdate(BaseModel):
    cage_number: Optional[int] = None

class CageSwapPositions(BaseModel):
    cage_a_id: int
    cage_b_id: int

class RackBase(BaseModel):
    name: str

class RackResponsibleUpdate(BaseModel):
    responsible_id: Optional[int] = None

class ColonyResponsibleSimple(BaseModel):
    id: int
    name: str
    email: str
    role: ColonyResponsibleRole

    class Config:
        from_attributes = True

class Rack(RackBase):
    id: int
    cages: List[Cage] = []
    responsible: Optional[ColonyResponsibleSimple] = None

    class Config:
        from_attributes = True

# ── Status / Breeding / Merge ──────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: AnimalStatus
    reason: Optional[str] = None

class BreedingCreate(BaseModel):
    animal_ids: List[int]
    target_cage_id: int
    type: str

class BreedingEnd(BaseModel):
    target_option: str
    new_cage_id: Optional[int] = None

class CageMerge(BaseModel):
    source_cage_id: int
    destination_cage_id: int

# ── Colony Responsible ─────────────────────────────────────────────────────

class ColonyResponsibleCreate(BaseModel):
    name: str
    email: str
    role: ColonyResponsibleRole = ColonyResponsibleRole.RESPONSIBLE

class ColonyResponsibleUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[ColonyResponsibleRole] = None
    active: Optional[bool] = None

class ColonyResponsible(BaseModel):
    id: int
    name: str
    email: str
    role: ColonyResponsibleRole
    active: bool

    class Config:
        from_attributes = True

# ── EM Grids ───────────────────────────────────────────────────────────────

class EMGridStainStepIn(BaseModel):
    wash_count: Optional[int] = None
    wash_volume_ul: Optional[float] = None
    stain_type: Optional[str] = None
    stain_time_s: Optional[float] = None
    drying_method: Optional[str] = None

class EMGridStainStep(EMGridStainStepIn):
    id: int
    step_order: int

    class Config:
        from_attributes = True

class EMGridBase(BaseModel):
    position: str
    sample: str
    grid_type: Optional[str] = None
    fixed: Optional[bool] = None
    fixative: Optional[str] = None
    sample_volume_ul: Optional[float] = None
    dilution_factor: Optional[float] = None
    sample_time_s: Optional[float] = None
    stain_steps: List[EMGridStainStepIn] = []
    prep_date: Optional[date] = None
    status: EMGridStatus = EMGridStatus.STORED
    notes: Optional[str] = None

class EMGridCreate(EMGridBase):
    box_id: int

class EMGridUpdate(BaseModel):
    box_id: Optional[int] = None
    position: Optional[str] = None
    sample: Optional[str] = None
    grid_type: Optional[str] = None
    fixed: Optional[bool] = None
    fixative: Optional[str] = None
    sample_volume_ul: Optional[float] = None
    dilution_factor: Optional[float] = None
    sample_time_s: Optional[float] = None
    stain_steps: Optional[List[EMGridStainStepIn]] = None
    prep_date: Optional[date] = None
    status: Optional[EMGridStatus] = None
    notes: Optional[str] = None

class EMGrid(EMGridBase):
    stain_steps: List[EMGridStainStep] = []
    id: int
    box_id: int
    box_number: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class EMGridBoxBase(BaseModel):
    box_number: str
    box_type: str
    row_labels: str
    columns: int
    lot: Optional[str] = None
    default_grid_type: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None

class EMGridBoxCreate(EMGridBoxBase):
    pass

class EMGridBoxUpdate(BaseModel):
    box_number: Optional[str] = None
    box_type: Optional[str] = None
    row_labels: Optional[str] = None
    columns: Optional[int] = None
    lot: Optional[str] = None
    default_grid_type: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None

class EMGridBoxSummary(EMGridBoxBase):
    id: int
    capacity: int
    occupied: int

    class Config:
        from_attributes = True

class EMGridBoxDetail(EMGridBoxSummary):
    grids: List[EMGrid] = []
