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

    rack = relationship("Rack", back_populates="cages")
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
    # STORED / IMAGED / DISCARDED grids physically occupy their slot; USED frees it
    # but stays in the database as history.
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
