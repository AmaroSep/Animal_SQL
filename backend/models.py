from sqlalchemy import Column, Integer, String, Date, DateTime, Float, ForeignKey, Boolean, Text, Enum as SqlEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from sqlalchemy.sql import func
import enum
from database import Base

class AnimalStatus(str, enum.Enum):
    ALIVE = "Vivo"
    ELIMINATED = "Eliminado"
    DEAD = "Muerto"

class AnimalSex(str, enum.Enum):
    MALE = "M"
    FEMALE = "F"

class ExperimentStatus(str, enum.Enum):
    DESIGN = "Diseño"
    ACTIVE = "Activo"
    COMPLETED = "Completado"
    ARCHIVED = "Archivado"

class AnimalExperimentStatus(str, enum.Enum):
    ASSIGNED = "Asignado"
    VALIDATED = "Validado"
    EXCLUDED = "Excluido"

class CalledGenotype(str, enum.Enum):
    WT = "WT"
    HET = "HET"
    KO = "KO"
    FAIL = "FAIL"

class ExtractionType(str, enum.Enum):
    BLOOD = "Sangre"
    TISSUE = "Tejido"
    DNA = "DNA"
    RNA = "RNA"
    OTHER = "Otro"

class ColonyResponsibleRole(str, enum.Enum):
    RESPONSIBLE = "Responsable"
    COLLABORATOR = "Colaborador"
    OBSERVER = "Observador"

class StatTest(str, enum.Enum):
    TTEST = "t-test"
    ANOVA = "ANOVA"
    MANN_WHITNEY = "Mann-Whitney"
    KRUSKAL = "Kruskal-Wallis"

class EffectSize(str, enum.Enum):
    SMALL = "pequeño"
    MEDIUM = "mediano"
    LARGE = "grande"


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

    rack = relationship("Rack", back_populates="cages")
    animals = relationship("Animal", back_populates="cage", foreign_keys="Animal.cage_id")

    @property
    def display_id(self):
        rack_num = self.rack.name.split()[-1] if self.rack else self.rack_id
        col_letter = chr(64 + self.column)
        return f"{col_letter}{self.row}-R{rack_num}"


class Animal(Base):
    __tablename__ = "animals"

    id = Column(String, primary_key=True, index=True)
    sex = Column(SqlEnum(AnimalSex))
    dob = Column(Date)
    mark = Column(String)
    genotype = Column(String)
    status = Column(SqlEnum(AnimalStatus), default=AnimalStatus.ALIVE)
    elimination_reason = Column(String, nullable=True)
    cage_id = Column(Integer, ForeignKey("cages.id"))
    previous_cage_id = Column(Integer, ForeignKey("cages.id"), nullable=True)
    genotype_validated = Column(Boolean, default=False)
    genotype_validated_at = Column(DateTime, nullable=True)

    cage = relationship("Cage", back_populates="animals", foreign_keys=[cage_id])
    experiment_assignments = relationship("ExperimentAnimal", back_populates="animal")
    gel_lanes = relationship("GelLane", back_populates="animal")
    extractions = relationship("Extraction", back_populates="animal")


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    objective = Column(Text, nullable=True)
    status = Column(SqlEnum(ExperimentStatus), default=ExperimentStatus.DESIGN)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Statistical design fields
    stat_test = Column(SqlEnum(StatTest), nullable=True)
    alpha = Column(Float, default=0.05)
    power = Column(Float, default=0.80)
    effect_size = Column(SqlEnum(EffectSize), nullable=True)
    effect_size_custom = Column(Float, nullable=True)
    dropout_rate = Column(Float, default=0.10)
    n_per_group = Column(Integer, nullable=True)
    n_recommended = Column(Integer, nullable=True)

    groups = relationship("ExperimentGroup", back_populates="experiment", cascade="all, delete-orphan")
    animals = relationship("ExperimentAnimal", back_populates="experiment", cascade="all, delete-orphan")
    gels = relationship("GenotypeGel", back_populates="experiment")
    extractions = relationship("Extraction", back_populates="experiment")


class ExperimentGroup(Base):
    __tablename__ = "experiment_groups"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    n_required = Column(Integer, default=0)

    experiment = relationship("Experiment", back_populates="groups")
    animals = relationship("ExperimentAnimal", back_populates="group")


class ExperimentAnimal(Base):
    __tablename__ = "experiment_animals"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=False)
    animal_id = Column(String, ForeignKey("animals.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("experiment_groups.id"), nullable=True)
    assigned_at = Column(DateTime, server_default=func.now())
    status = Column(SqlEnum(AnimalExperimentStatus), default=AnimalExperimentStatus.ASSIGNED)

    experiment = relationship("Experiment", back_populates="animals")
    animal = relationship("Animal", back_populates="experiment_assignments")
    group = relationship("ExperimentGroup", back_populates="animals")


class GenotypeGel(Base):
    __tablename__ = "genotype_gels"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())
    image_path = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    validated_by = Column(String, nullable=True)

    experiment = relationship("Experiment", back_populates="gels")
    lanes = relationship("GelLane", back_populates="gel", cascade="all, delete-orphan")


class GelLane(Base):
    __tablename__ = "gel_lanes"

    id = Column(Integer, primary_key=True, index=True)
    gel_id = Column(Integer, ForeignKey("genotype_gels.id"), nullable=False)
    lane_number = Column(Integer, nullable=False)
    animal_id = Column(String, ForeignKey("animals.id"), nullable=True)
    marker_lane = Column(Boolean, default=False)
    called_genotype = Column(SqlEnum(CalledGenotype), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)

    gel = relationship("GenotypeGel", back_populates="lanes")
    animal = relationship("Animal", back_populates="gel_lanes")


class Extraction(Base):
    __tablename__ = "extractions"

    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(String, ForeignKey("animals.id"), nullable=False)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=True)
    extraction_type = Column(SqlEnum(ExtractionType), nullable=False)
    date = Column(Date, nullable=False)
    quantity = Column(Float, nullable=True)
    unit = Column(String, nullable=True)
    storage_location = Column(String, nullable=True)
    storage_box = Column(String, nullable=True)
    storage_position = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    extracted_by = Column(String, nullable=True)

    animal = relationship("Animal", back_populates="extractions")
    experiment = relationship("Experiment", back_populates="extractions")


# ── EM Grids inventory ─────────────────────────────────────────────────────

class EMGridStatus(str, enum.Enum):
    # STORED / IMAGED grids physically occupy their slot; USED / DISCARDED free it
    # but stay in the database as history.
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
    sample_volume_ul = Column(Float, nullable=True)
    sample_time_s = Column(Float, nullable=True)       # sample application time
    stain_type = Column(String, nullable=True)
    stain_time_s = Column(Float, nullable=True)        # stain incubation time
    prep_date = Column(Date, nullable=True)
    status = Column(SqlEnum(EMGridStatus), default=EMGridStatus.STORED)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    box = relationship("EMGridBox", back_populates="grids")
