from sqlalchemy import Column, Integer, String, Date, ForeignKey, Boolean, Enum as SqlEnum
from sqlalchemy.orm import relationship
import enum
from database import Base

class AnimalStatus(str, enum.Enum):
    ALIVE = "Vivo"
    ELIMINATED = "Eliminado"
    DEAD = "Muerto"

class AnimalSex(str, enum.Enum):
    MALE = "M"
    FEMALE = "F"

class Rack(Base):
    __tablename__ = "racks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

    cages = relationship("Cage", back_populates="rack")

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
        # Format: [Letter A-G][Row 1-10]-R[RackNum]
        # self.rack.name is "RACK 3", "RACK 4", etc.
        rack_num = self.rack.name.split()[-1] if self.rack else self.rack_id
        col_letter = chr(64 + self.column) # 1->A, 2->B...
        return f"{col_letter}{self.row}-R{rack_num}"

class Animal(Base):
    __tablename__ = "animals"

    id = Column(String, primary_key=True, index=True) # e.g. MOUSE-001
    sex = Column(SqlEnum(AnimalSex))
    dob = Column(Date)
    mark = Column(String)
    genotype = Column(String)
    status = Column(SqlEnum(AnimalStatus), default=AnimalStatus.ALIVE)
    elimination_reason = Column(String, nullable=True)
    cage_id = Column(Integer, ForeignKey("cages.id"))
    previous_cage_id = Column(Integer, ForeignKey("cages.id"), nullable=True)

    cage = relationship("Cage", back_populates="animals", foreign_keys=[cage_id])
