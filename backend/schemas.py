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
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

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

# ── LN2 tank ───────────────────────────────────────────────────────────────

class LNVialData(BaseModel):
    cell_line: str
    protein_expression: Optional[str] = None
    culture_method: Optional[str] = None
    freeze_date: Optional[date] = None
    frozen_by: Optional[str] = None
    freeze_note: Optional[str] = None
    cells_per_vial: Optional[str] = None
    comment: Optional[str] = None
    additional_comment: Optional[str] = None
    master_stock: bool = False

class LNVialBatchCreate(BaseModel):
    box_id: int
    wells: List[int]
    data: LNVialData

class LNVialUpdate(BaseModel):
    box_id: Optional[int] = None
    well: Optional[int] = None
    cell_line: Optional[str] = None
    protein_expression: Optional[str] = None
    culture_method: Optional[str] = None
    freeze_date: Optional[date] = None
    frozen_by: Optional[str] = None
    freeze_note: Optional[str] = None
    cells_per_vial: Optional[str] = None
    comment: Optional[str] = None
    additional_comment: Optional[str] = None
    master_stock: Optional[bool] = None
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None

class LNVialRemove(BaseModel):
    status: models.LNVialStatus
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None

class LNVial(LNVialData):
    id: int
    box_id: int
    well: int
    status: models.LNVialStatus
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None
    rack_number: Optional[int] = None
    box_number: Optional[int] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class LNBoxUpdate(BaseModel):
    label: Optional[str] = None
    restriction: Optional[str] = None
    notes: Optional[str] = None

class LNBoxSummary(BaseModel):
    id: int
    rack_number: int
    number: int
    label: Optional[str] = None
    restriction: Optional[str] = None
    notes: Optional[str] = None
    rows: int
    columns: int
    capacity: int
    occupied: int

class LNBoxDetail(LNBoxSummary):
    vials: List[LNVial] = []

class LNRackSummary(BaseModel):
    id: int
    number: int
    boxes: List[LNBoxSummary] = []

class LNImportBox(BaseModel):
    rack: int
    box: int
    label: Optional[str] = None
    restriction: Optional[str] = None
    notes: Optional[str] = None

class LNImportVial(LNVialData):
    rack: int
    box: int
    well: int
    status: models.LNVialStatus = models.LNVialStatus.IN_TANK
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None

class LNImport(BaseModel):
    boxes: List[LNImportBox] = []
    vials: List[LNImportVial] = []

# ── -80 °C freezers ────────────────────────────────────────────────────────

class M80FreezerCreate(BaseModel):
    name: str
    room: Optional[str] = None
    notes: Optional[str] = None
    compartments: int = 2          # created empty, numbered from the top

class M80FreezerUpdate(BaseModel):
    name: Optional[str] = None
    room: Optional[str] = None
    notes: Optional[str] = None

class M80CompartmentCreate(BaseModel):
    freezer_id: int
    name: Optional[str] = None

class M80CompartmentUpdate(BaseModel):
    name: Optional[str] = None

class M80RackCreate(BaseModel):
    compartment_id: int
    levels: int
    depth: int
    label: Optional[str] = None

class M80RackUpdate(BaseModel):
    levels: Optional[int] = None
    depth: Optional[int] = None
    label: Optional[str] = None

class M80BoxCreate(BaseModel):
    rack_id: int
    level: int
    slot: int
    rows: int = 9
    columns: int = 9
    label: Optional[str] = None

class M80BoxUpdate(BaseModel):
    rack_id: Optional[int] = None
    level: Optional[int] = None
    slot: Optional[int] = None
    rows: Optional[int] = None
    columns: Optional[int] = None
    label: Optional[str] = None
    restriction: Optional[str] = None
    notes: Optional[str] = None

class M80TubeData(BaseModel):
    sample_name: str
    sample_type: Optional[str] = None
    source: Optional[str] = None
    concentration: Optional[str] = None
    volume: Optional[str] = None
    frozen_date: Optional[date] = None
    frozen_by: Optional[str] = None
    comment: Optional[str] = None
    reserved: bool = False

class M80TubeBatchCreate(BaseModel):
    box_id: int
    wells: List[int]
    data: M80TubeData

class M80TubeUpdate(BaseModel):
    box_id: Optional[int] = None
    well: Optional[int] = None
    sample_name: Optional[str] = None
    sample_type: Optional[str] = None
    source: Optional[str] = None
    concentration: Optional[str] = None
    volume: Optional[str] = None
    frozen_date: Optional[date] = None
    frozen_by: Optional[str] = None
    comment: Optional[str] = None
    reserved: Optional[bool] = None
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None

class M80TubeRemove(BaseModel):
    status: models.M80TubeStatus
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None

class M80Location(BaseModel):
    freezer: str
    room: Optional[str] = None
    compartment: int
    compartment_name: Optional[str] = None
    rack: int
    level: int
    slot: int

class M80Tube(M80TubeData):
    id: int
    box_id: int
    well: int
    status: models.M80TubeStatus
    removed_date: Optional[date] = None
    removed_by: Optional[str] = None
    removed_note: Optional[str] = None
    location: Optional[M80Location] = None
    box_label: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class M80BoxSummary(BaseModel):
    id: int
    rack_id: int
    level: int
    slot: int
    rows: int
    columns: int
    label: Optional[str] = None
    restriction: Optional[str] = None
    notes: Optional[str] = None
    capacity: int
    occupied: int

class M80BoxDetail(M80BoxSummary):
    location: M80Location
    tubes: List[M80Tube] = []

class M80RackOut(BaseModel):
    id: int
    compartment_id: int
    number: int
    label: Optional[str] = None
    levels: int
    depth: int
    boxes: List[M80BoxSummary] = []

class M80CompartmentOut(BaseModel):
    id: int
    freezer_id: int
    number: int
    name: Optional[str] = None
    racks: List[M80RackOut] = []

class M80FreezerOut(BaseModel):
    id: int
    name: str
    room: Optional[str] = None
    notes: Optional[str] = None
    compartments: List[M80CompartmentOut] = []

# ── Users & access ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    initials: Optional[str] = None
    role: models.UserRole
    active: bool
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    initials: Optional[str] = None
    role: models.UserRole = models.UserRole.VIEWER

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    initials: Optional[str] = None
    role: Optional[models.UserRole] = None
    active: Optional[bool] = None
    password: Optional[str] = None      # admin reset

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class AuditEntry(BaseModel):
    id: int
    username: Optional[str] = None
    method: str
    path: str
    status_code: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
