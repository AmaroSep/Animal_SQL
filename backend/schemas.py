from pydantic import BaseModel
from datetime import date, datetime
from typing import List, Optional
import models
from models import (
    AnimalStatus, AnimalSex, ExperimentStatus, AnimalExperimentStatus,
    CalledGenotype, ExtractionType, ColonyResponsibleRole, StatTest, EffectSize
)

# ── Animal ─────────────────────────────────────────────────────────────────

class AnimalBase(BaseModel):
    id: str
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
    genotype_validated: bool = False
    genotype_validated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── Cage & Rack ────────────────────────────────────────────────────────────

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
    animal_ids: List[str]
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

# ── Experiment ─────────────────────────────────────────────────────────────

class ExperimentGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    n_required: int = 0

class ExperimentGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    n_required: Optional[int] = None

class ExperimentGroup(BaseModel):
    id: int
    experiment_id: int
    name: str
    description: Optional[str] = None
    n_required: int
    assigned_count: int = 0
    validated_count: int = 0

    class Config:
        from_attributes = True

class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    objective: Optional[str] = None
    stat_test: Optional[StatTest] = None
    alpha: float = 0.05
    power: float = 0.80
    effect_size: Optional[EffectSize] = None
    effect_size_custom: Optional[float] = None
    dropout_rate: float = 0.10

class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    objective: Optional[str] = None
    status: Optional[ExperimentStatus] = None
    stat_test: Optional[StatTest] = None
    alpha: Optional[float] = None
    power: Optional[float] = None
    effect_size: Optional[EffectSize] = None
    effect_size_custom: Optional[float] = None
    dropout_rate: Optional[float] = None

class ExperimentAnimalAssign(BaseModel):
    animal_id: str
    group_id: Optional[int] = None

class ExperimentAnimalUpdate(BaseModel):
    group_id: Optional[int] = None
    status: Optional[AnimalExperimentStatus] = None

class ExperimentAnimalOut(BaseModel):
    id: int
    experiment_id: int
    animal_id: str
    group_id: Optional[int] = None
    assigned_at: datetime
    status: AnimalExperimentStatus
    animal: Optional[Animal] = None

    class Config:
        from_attributes = True

class Experiment(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    objective: Optional[str] = None
    status: ExperimentStatus
    created_at: datetime
    updated_at: datetime
    stat_test: Optional[StatTest] = None
    alpha: float
    power: float
    effect_size: Optional[EffectSize] = None
    effect_size_custom: Optional[float] = None
    dropout_rate: float
    n_per_group: Optional[int] = None
    n_recommended: Optional[int] = None
    groups: List[ExperimentGroup] = []

    class Config:
        from_attributes = True

# ── Gel ────────────────────────────────────────────────────────────────────

class GelLaneCreate(BaseModel):
    lane_number: int
    animal_id: Optional[str] = None
    marker_lane: bool = False
    called_genotype: Optional[CalledGenotype] = None

class GelLaneUpdate(BaseModel):
    animal_id: Optional[str] = None
    marker_lane: Optional[bool] = None
    called_genotype: Optional[CalledGenotype] = None

class GelLane(BaseModel):
    id: int
    gel_id: int
    lane_number: int
    animal_id: Optional[str] = None
    marker_lane: bool
    called_genotype: Optional[CalledGenotype] = None
    confirmed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class GenotypeGelCreate(BaseModel):
    experiment_id: Optional[int] = None
    notes: Optional[str] = None
    validated_by: Optional[str] = None
    lane_count: int = 12

class GenotypeGelUpdate(BaseModel):
    notes: Optional[str] = None
    validated_by: Optional[str] = None

class GenotypeGel(BaseModel):
    id: int
    experiment_id: Optional[int] = None
    uploaded_at: datetime
    image_path: str
    notes: Optional[str] = None
    validated_by: Optional[str] = None
    lanes: List[GelLane] = []

    class Config:
        from_attributes = True

# ── Extraction ─────────────────────────────────────────────────────────────

class ExtractionCreate(BaseModel):
    animal_id: str
    experiment_id: Optional[int] = None
    extraction_type: ExtractionType
    date: date
    quantity: Optional[float] = None
    unit: Optional[str] = None
    storage_location: Optional[str] = None
    storage_box: Optional[str] = None
    storage_position: Optional[str] = None
    notes: Optional[str] = None
    extracted_by: Optional[str] = None

class ExtractionUpdate(BaseModel):
    extraction_type: Optional[ExtractionType] = None
    date: Optional[date] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    storage_location: Optional[str] = None
    storage_box: Optional[str] = None
    storage_position: Optional[str] = None
    notes: Optional[str] = None
    extracted_by: Optional[str] = None

class Extraction(BaseModel):
    id: int
    animal_id: str
    experiment_id: Optional[int] = None
    extraction_type: ExtractionType
    date: date
    quantity: Optional[float] = None
    unit: Optional[str] = None
    storage_location: Optional[str] = None
    storage_box: Optional[str] = None
    storage_position: Optional[str] = None
    notes: Optional[str] = None
    extracted_by: Optional[str] = None

    class Config:
        from_attributes = True

# ── N Calculator ───────────────────────────────────────────────────────────

class NCalcRequest(BaseModel):
    stat_test: StatTest
    alpha: float = 0.05
    power: float = 0.80
    effect_size: Optional[EffectSize] = None
    effect_size_custom: Optional[float] = None
    dropout_rate: float = 0.10
    n_groups: int = 2

class NCalcResult(BaseModel):
    n_per_group: int
    n_recommended: int
    n_total: int
    cohen_d: float
    formula_used: str
    justification_text: str

# ── EM Grids ───────────────────────────────────────────────────────────────

class EMGridBase(BaseModel):
    position: str
    sample: str
    grid_type: Optional[str] = None
    sample_volume_ul: Optional[float] = None
    sample_time_s: Optional[float] = None
    stain_type: Optional[str] = None
    stain_time_s: Optional[float] = None
    prep_date: Optional[date] = None
    status: models.EMGridStatus = EMGridStatus.STORED
    notes: Optional[str] = None

class EMGridCreate(EMGridBase):
    box_id: int

class EMGridUpdate(BaseModel):
    box_id: Optional[int] = None
    position: Optional[str] = None
    sample: Optional[str] = None
    grid_type: Optional[str] = None
    sample_volume_ul: Optional[float] = None
    sample_time_s: Optional[float] = None
    stain_type: Optional[str] = None
    stain_time_s: Optional[float] = None
    prep_date: Optional[date] = None
    status: Optional[models.EMGridStatus] = None
    notes: Optional[str] = None

class EMGrid(EMGridBase):
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
