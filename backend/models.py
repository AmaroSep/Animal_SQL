from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Boolean, Float, Text, Enum as SqlEnum
from datetime import datetime
from sqlalchemy.orm import relationship
import enum
from database import Base

class AnimalStatus(str, enum.Enum):
    # Stored values stay in Spanish (existing data and CSV format); the UI shows English labels
    ALIVE = "Vivo"
    ELIMINATED = "Eliminado"
    DEAD = "Muerto"

class AnimalSex(str, enum.Enum):
    MALE = "M"
    FEMALE = "F"

class ColonyResponsibleRole(str, enum.Enum):
    RESPONSIBLE = "Responsable"
    COLLABORATOR = "Colaborador"
    OBSERVER = "Observador"


class ColonyResponsible(Base):
    __tablename__ = "colony_responsibles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
    role = Column(SqlEnum(ColonyResponsibleRole), default=ColonyResponsibleRole.RESPONSIBLE)
    active = Column(Boolean, default=True)

    racks = relationship("Rack", back_populates="responsible")


class Rack(Base):
    __tablename__ = "racks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    responsible_id = Column(Integer, ForeignKey("colony_responsibles.id"), nullable=True)

    cages = relationship("Cage", back_populates="rack")
    responsible = relationship("ColonyResponsible", back_populates="racks")


class Cage(Base):
    __tablename__ = "cages"

    id = Column(Integer, primary_key=True, index=True)
    row = Column(Integer)
    column = Column(Integer)
    rack_id = Column(Integer, ForeignKey("racks.id"))
    is_breeding_pair = Column(Boolean, default=False)
    cage_number = Column(Integer, nullable=True)
    # Responsible user: only they (or an admin) may change the cage and its animals.
    # Empty cages have none; whoever puts animals in one takes it (see ownership.py).
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    rack = relationship("Rack", back_populates="cages")
    owner = relationship("User")
    animals = relationship("Animal", back_populates="cage", foreign_keys="Animal.cage_id")

    @property
    def display_id(self):
        if self.cage_number is not None:
            return str(self.cage_number)
        rack_num = self.rack.name.split()[-1] if self.rack else self.rack_id
        col_letter = chr(64 + self.column)
        return f"{col_letter}{self.row}-R{rack_num}"


class Animal(Base):
    __tablename__ = "animals"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    sex = Column(SqlEnum(AnimalSex))
    dob = Column(Date)
    mark = Column(String)
    genotype = Column(String)
    status = Column(SqlEnum(AnimalStatus), default=AnimalStatus.ALIVE)
    elimination_reason = Column(String, nullable=True)
    status_changed_at = Column(DateTime, nullable=True)
    cage_id = Column(Integer, ForeignKey("cages.id"))
    previous_cage_id = Column(Integer, ForeignKey("cages.id"), nullable=True)
    genotype_validated = Column(Boolean, default=False)
    genotype_validated_at = Column(DateTime, nullable=True)

    cage = relationship("Cage", back_populates="animals", foreign_keys=[cage_id])


# ── EM Grids inventory ─────────────────────────────────────────────────────

class EMGridStatus(str, enum.Enum):
    # Grids never leave their box: every status keeps its slot. Only deleting the
    # record frees the position.
    # Stored values stay in Spanish; the UI shows English labels
    STORED = "Almacenada"
    IMAGED = "Imageada"
    USED = "Usada"
    DISCARDED = "Descartada"


class EMGridBox(Base):
    __tablename__ = "em_grid_boxes"

    id = Column(Integer, primary_key=True, index=True)
    box_number = Column(String, unique=True, index=True, nullable=False)
    box_type = Column(String, nullable=False)          # e.g. "Quantifoil", "EMS"
    row_labels = Column(String, nullable=False)        # comma-separated, e.g. "A,B,C,D,E"
    columns = Column(Integer, nullable=False)
    lot = Column(String, nullable=True)
    default_grid_type = Column(String, nullable=True)
    location = Column(String, nullable=True)           # where the box is physically stored
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    grids = relationship("EMGrid", back_populates="box", cascade="all, delete-orphan")


class EMGrid(Base):
    __tablename__ = "em_grids"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(Integer, ForeignKey("em_grid_boxes.id", ondelete="CASCADE"), nullable=False)
    position = Column(String, nullable=False)          # e.g. "C4"
    sample = Column(String, nullable=False)
    grid_type = Column(String, nullable=True)
    fixed = Column(Boolean, nullable=True)             # None = not recorded
    fixative = Column(String, nullable=True)           # e.g. "Glutaraldehyde 2.5%"
    sample_volume_ul = Column(Float, nullable=True)
    dilution_factor = Column(Float, nullable=True)     # X in 1:X; 1 = undiluted
    sample_time_s = Column(Float, nullable=True)       # sample application time
    prep_date = Column(Date, nullable=True)
    status = Column(SqlEnum(EMGridStatus), default=EMGridStatus.STORED)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)         # username, filled automatically (record_tracking.py)
    updated_at = Column(DateTime, nullable=True)
    updated_by = Column(String, nullable=True)

    box = relationship("EMGridBox", back_populates="grids")
    stain_steps = relationship(
        "EMGridStainStep", back_populates="grid",
        order_by="EMGridStainStep.step_order", cascade="all, delete-orphan",
    )


class EMGridStainStep(Base):
    """One staining round, in order: washes -> stain incubation -> drying."""
    __tablename__ = "em_grid_stain_steps"

    id = Column(Integer, primary_key=True, index=True)
    grid_id = Column(Integer, ForeignKey("em_grids.id", ondelete="CASCADE"), nullable=False, index=True)
    step_order = Column(Integer, nullable=False)
    wash_count = Column(Integer, nullable=True)        # washes before this stain
    wash_volume_ul = Column(Float, nullable=True)      # volume per wash
    stain_type = Column(String, nullable=True)
    stain_time_s = Column(Float, nullable=True)        # stain incubation time
    drying_method = Column(String, nullable=True)      # after this stain

    grid = relationship("EMGrid", back_populates="stain_steps")


# ── LN2 tank ───────────────────────────────────────────────────────────────

class LNVialStatus(str, enum.Enum):
    IN_TANK = "In tank"
    THAWED = "Thawed"
    DISCARDED = "Discarded"


class LNRack(Base):
    """One cane of the LN2 tank."""
    __tablename__ = "ln_racks"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer, unique=True, nullable=False)
    notes = Column(Text, nullable=True)

    boxes = relationship("LNBox", back_populates="rack", order_by="LNBox.number")


class LNBox(Base):
    __tablename__ = "ln_boxes"

    id = Column(Integer, primary_key=True, index=True)
    rack_id = Column(Integer, ForeignKey("ln_racks.id"), nullable=False)
    number = Column(Integer, nullable=False)           # position in the rack, 1 = top
    label = Column(String, nullable=True)              # e.g. "iPSCs", "HP"
    restriction = Column(Text, nullable=True)          # e.g. "Use exclusively for primary cells"
    notes = Column(Text, nullable=True)
    rows = Column(Integer, nullable=False, default=9)
    columns = Column(Integer, nullable=False, default=9)

    rack = relationship("LNRack", back_populates="boxes")
    vials = relationship("LNVial", back_populates="box", order_by="LNVial.well")


class LNVial(Base):
    __tablename__ = "ln_vials"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(Integer, ForeignKey("ln_boxes.id"), nullable=False, index=True)
    well = Column(Integer, nullable=False)             # 1..rows*columns, row by row
    cell_line = Column(String, nullable=False, index=True)
    protein_expression = Column(String, nullable=True)
    culture_method = Column(String, nullable=True)
    freeze_date = Column(Date, nullable=True)
    frozen_by = Column(String, nullable=True)          # initials
    freeze_note = Column(String, nullable=True)        # original free-text date, e.g. "Placed in -80: ..."
    cells_per_vial = Column(String, nullable=True)     # e.g. "2E6"
    comment = Column(Text, nullable=True)              # "Comment (passage #)" in the lab sheet
    additional_comment = Column(Text, nullable=True)
    master_stock = Column(Boolean, default=False)      # do not thaw without asking
    status = Column(SqlEnum(LNVialStatus, values_callable=lambda e: [m.value for m in e]),
                    default=LNVialStatus.IN_TANK, nullable=False)
    removed_date = Column(Date, nullable=True)
    removed_by = Column(String, nullable=True)
    removed_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)         # username, filled automatically (record_tracking.py)
    updated_at = Column(DateTime, nullable=True)
    updated_by = Column(String, nullable=True)

    box = relationship("LNBox", back_populates="vials")


# ── -80 °C freezers ────────────────────────────────────────────────────────
# Configurable hierarchy: freezer -> compartment -> rack (levels x depth slots) -> box -> tubes

class M80TubeStatus(str, enum.Enum):
    IN_FREEZER = "In freezer"
    USED = "Used"
    DISCARDED = "Discarded"


class M80Freezer(Base):
    __tablename__ = "m80_freezers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    room = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    compartments = relationship("M80Compartment", back_populates="freezer", order_by="M80Compartment.number",
                                cascade="all, delete-orphan")


class M80Compartment(Base):
    """A shelf/door section of the freezer (e.g. top and bottom)."""
    __tablename__ = "m80_compartments"

    id = Column(Integer, primary_key=True, index=True)
    freezer_id = Column(Integer, ForeignKey("m80_freezers.id"), nullable=False)
    number = Column(Integer, nullable=False)           # 1 = top
    name = Column(String, nullable=True)

    freezer = relationship("M80Freezer", back_populates="compartments")
    racks = relationship("M80Rack", back_populates="compartment", order_by="M80Rack.number",
                         cascade="all, delete-orphan")


class M80Rack(Base):
    """A rack with `levels` shelves; each level holds `depth` boxes from front (1) to back."""
    __tablename__ = "m80_racks"

    id = Column(Integer, primary_key=True, index=True)
    compartment_id = Column(Integer, ForeignKey("m80_compartments.id"), nullable=False)
    number = Column(Integer, nullable=False)           # 1 = leftmost
    label = Column(String, nullable=True)
    levels = Column(Integer, nullable=False)
    depth = Column(Integer, nullable=False)

    compartment = relationship("M80Compartment", back_populates="racks")
    boxes = relationship("M80Box", back_populates="rack", order_by=lambda: [M80Box.level, M80Box.slot])


class M80Box(Base):
    __tablename__ = "m80_boxes"

    id = Column(Integer, primary_key=True, index=True)
    rack_id = Column(Integer, ForeignKey("m80_racks.id"), nullable=False)
    level = Column(Integer, nullable=False)            # 1 = top level of the rack
    slot = Column(Integer, nullable=False)             # 1 = front
    rows = Column(Integer, nullable=False, default=9)
    columns = Column(Integer, nullable=False, default=9)
    label = Column(String, nullable=True)
    restriction = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    rack = relationship("M80Rack", back_populates="boxes")
    tubes = relationship("M80Tube", back_populates="box", order_by="M80Tube.well")


class M80Tube(Base):
    __tablename__ = "m80_tubes"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(Integer, ForeignKey("m80_boxes.id"), nullable=False, index=True)
    well = Column(Integer, nullable=False)             # 1..rows*columns, row by row
    sample_name = Column(String, nullable=False, index=True)
    sample_type = Column(String, nullable=True)        # lysate, DNA, RNA, serum, tissue...
    source = Column(String, nullable=True)             # animal / subject / cell line it came from
    concentration = Column(String, nullable=True)
    volume = Column(String, nullable=True)
    frozen_date = Column(Date, nullable=True)
    frozen_by = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    reserved = Column(Boolean, default=False)          # do not use without asking
    status = Column(SqlEnum(M80TubeStatus, values_callable=lambda e: [m.value for m in e]),
                    default=M80TubeStatus.IN_FREEZER, nullable=False)
    removed_date = Column(Date, nullable=True)
    removed_by = Column(String, nullable=True)
    removed_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)         # username, filled automatically (record_tracking.py)
    updated_at = Column(DateTime, nullable=True)
    updated_by = Column(String, nullable=True)

    box = relationship("M80Box", back_populates="tubes")


# ── Users & access ─────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"      # everything, including user management
    EDITOR = "editor"    # create / modify records
    VIEWER = "viewer"    # read-only


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    initials = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(SqlEnum(UserRole, values_callable=lambda e: [m.value for m in e]), nullable=False, default=UserRole.VIEWER)
    active = Column(Boolean, default=True, nullable=False)
    color = Column(String, nullable=True)  # hex colour marking this user's cages
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)  # sha256 of the cookie value
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User")


class AuditLog(Base):
    """Every request that changes data: who, what and when."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String, nullable=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    status_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
