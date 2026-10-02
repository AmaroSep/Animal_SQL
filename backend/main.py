from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import date, datetime
from fastapi.responses import StreamingResponse
import io, csv, os
import models, schemas, database
from database import engine, get_db
from routers import responsibles, em_grids, ln2, m80, auth, colony_io
from security import auth_guard
import record_tracking  # noqa: F401  (registers the created_by / updated_by hooks)
from ownership import acting_user, check_animal, check_cage, is_admin, release_if_empty
from utils import calculate_age_display, calculate_age_months

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bioterio Management System API")

app.include_router(auth.router)
app.include_router(responsibles.router)
app.include_router(em_grids.router)
app.include_router(ln2.router)
app.include_router(m80.router)
app.include_router(colony_io.router)

# Every request needs a signed-in user (see security.py). Registered before CORS so
# that CORS stays the outermost layer and also decorates 401/403 responses.
app.middleware("http")(auth_guard)

# Browsers only send the session cookie to origins listed here (comma separated)
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_migrations():
    """
    Safe ALTER TABLE migrations for columns added in v2.
    Uses IF NOT EXISTS so it's always safe to run on existing DBs.
    """
    migrations = [
        # v2: genotype validation tracking on animals
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS genotype_validated BOOLEAN DEFAULT FALSE",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS genotype_validated_at TIMESTAMP",
        # v2: colony responsible assignment on racks
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='racks' AND column_name='responsible_id'
            ) THEN
                ALTER TABLE racks ADD COLUMN responsible_id INTEGER
                    REFERENCES colony_responsibles(id) ON DELETE SET NULL;
            END IF;
        END$$;
        """,
        # v3: correlative cage number — historical, never reused
        "ALTER TABLE cages ADD COLUMN IF NOT EXISTS cage_number INTEGER",
        # v3: create global sequence for new cages if it doesn't exist yet
        # (assignment of existing cages is handled manually or via seed)
        """
        DO $$
        DECLARE max_num INTEGER;
        BEGIN
            SELECT COALESCE(MAX(cage_number), 0) INTO max_num FROM cages;
            IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'cage_number_seq') THEN
                EXECUTE format('CREATE SEQUENCE cage_number_seq START %s', max_num + 1);
            END IF;
        END$$;
        """,
        # v3: migrate animals.id from VARCHAR (user-provided) to SERIAL (auto-int)
        # Only runs if the column is still VARCHAR type
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='animals' AND column_name='id' AND data_type='character varying'
            ) THEN
                -- Drop dependent FKs
                ALTER TABLE experiment_animals DROP CONSTRAINT IF EXISTS experiment_animals_animal_id_fkey;
                ALTER TABLE gel_lanes DROP CONSTRAINT IF EXISTS gel_lanes_animal_id_fkey;
                ALTER TABLE extractions DROP CONSTRAINT IF EXISTS extractions_animal_id_fkey;

                -- Add new integer PK column
                ALTER TABLE animals ADD COLUMN IF NOT EXISTS new_id SERIAL;

                -- Migrate FK columns to integer (set to new_id mapping via rownum)
                ALTER TABLE experiment_animals ADD COLUMN IF NOT EXISTS new_animal_id INTEGER;
                ALTER TABLE gel_lanes ADD COLUMN IF NOT EXISTS new_animal_id INTEGER;
                ALTER TABLE extractions ADD COLUMN IF NOT EXISTS new_animal_id INTEGER;

                -- Drop old PK and rename
                ALTER TABLE animals DROP CONSTRAINT animals_pkey;
                ALTER TABLE animals DROP COLUMN id;
                ALTER TABLE animals RENAME COLUMN new_id TO id;
                ALTER TABLE animals ADD PRIMARY KEY (id);

                -- Drop old FK columns (data lost for previous experiment links, acceptable)
                ALTER TABLE experiment_animals DROP COLUMN IF EXISTS animal_id;
                ALTER TABLE experiment_animals RENAME COLUMN new_animal_id TO animal_id;

                ALTER TABLE gel_lanes DROP COLUMN IF EXISTS animal_id;
                ALTER TABLE gel_lanes RENAME COLUMN new_animal_id TO animal_id;

                ALTER TABLE extractions DROP COLUMN IF EXISTS animal_id;
                ALTER TABLE extractions RENAME COLUMN new_animal_id TO animal_id;

                -- Re-add NOT NULL constraint on extractions.animal_id
                ALTER TABLE extractions ALTER COLUMN animal_id SET NOT NULL;

                -- Restore FKs
                ALTER TABLE experiment_animals ADD CONSTRAINT experiment_animals_animal_id_fkey
                    FOREIGN KEY (animal_id) REFERENCES animals(id);
                ALTER TABLE gel_lanes ADD CONSTRAINT gel_lanes_animal_id_fkey
                    FOREIGN KEY (animal_id) REFERENCES animals(id);
                ALTER TABLE extractions ADD CONSTRAINT extractions_animal_id_fkey
                    FOREIGN KEY (animal_id) REFERENCES animals(id);
            END IF;
        END$$;
        """,
        # v9: -80 sample types with their own fields; access to restricted (clinical) fields
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS sample_type_id INTEGER REFERENCES m80_sample_types(id)",
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS data JSONB",
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS aliquot_number INTEGER",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_access BOOLEAN NOT NULL DEFAULT FALSE",
        # v8: removed animals keep their responsible user and cage card
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS last_cage_card VARCHAR",
        # v7: parents and wean date (shared colony format)
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS parent_1 VARCHAR",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS parent_2 VARCHAR",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS wean_date DATE",
        # v6: extra animal / cage information (cage card, lineage, notes)
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS external_id VARCHAR",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS origin_cage VARCHAR",
        "ALTER TABLE animals ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE cages ADD COLUMN IF NOT EXISTS card_id VARCHAR",
        # v5: responsible user per cage, colour per user
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS color VARCHAR",
        "ALTER TABLE cages ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_cages_owner_id ON cages (owner_id)",
        # v4: who created / last edited each record
        "ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS created_by VARCHAR",
        "ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        "ALTER TABLE em_grids ADD COLUMN IF NOT EXISTS updated_by VARCHAR",
        "ALTER TABLE ln_vials ADD COLUMN IF NOT EXISTS created_by VARCHAR",
        "ALTER TABLE ln_vials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        "ALTER TABLE ln_vials ADD COLUMN IF NOT EXISTS updated_by VARCHAR",
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS created_by VARCHAR",
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        "ALTER TABLE m80_tubes ADD COLUMN IF NOT EXISTS updated_by VARCHAR",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(database.text(sql))
            except Exception as e:
                print(f"Migration warning (safe to ignore if already applied): {e}")
        conn.commit()


@app.on_event("startup")
def startup_event():
    # 1. Create all new tables (no-op for existing ones)
    models.Base.metadata.create_all(bind=engine)

    # 2. Apply column-level migrations for existing tables
    run_migrations()

    # 3. Seed racks/cages if first run, and the default -80 sample types
    db = database.SessionLocal()
    try:
        m80.seed_sample_types(db)
        if db.query(models.Rack).count() == 0:
            for i in [3, 4, 5]:
                rack = models.Rack(name=f"RACK {i}")
                db.add(rack)
                db.flush()
                for row in range(1, 11):
                    for col in range(1, 8):
                        cage = models.Cage(rack_id=rack.id, row=row, column=col)
                        db.add(cage)
            db.commit()
            # Assign historical correlatives and align sequence to next available number
            db.execute(database.text("UPDATE cages SET cage_number = id WHERE cage_number IS NULL"))
            max_num = db.execute(database.text("SELECT COALESCE(MAX(cage_number), 0) FROM cages")).scalar()
            db.execute(database.text(f"SELECT setval('cage_number_seq', {max_num})"))
            db.commit()
    finally:
        db.close()

@app.get("/racks", response_model=List[schemas.Rack])
def get_racks(db: Session = Depends(get_db)):
    racks = db.query(models.Rack).all()
    # Populate age_days and filter for live animals
    for rack in racks:
        for cage in rack.cages:
            # Filter live animals for the rack view
            cage.animals = [a for a in cage.animals if a.status == models.AnimalStatus.ALIVE]
            for animal in cage.animals:
                animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return racks

@app.get("/racks/{rack_id}", response_model=schemas.Rack)
def get_rack(rack_id: int, db: Session = Depends(get_db)):
    rack = db.query(models.Rack).filter(models.Rack.id == rack_id).first()
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")
    for cage in rack.cages:
        # Filter live animals for the rack view
        cage.animals = [a for a in cage.animals if a.status == models.AnimalStatus.ALIVE]
        for animal in cage.animals:
            animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return rack

@app.get("/cages/{cage_id}/animals", response_model=List[schemas.Animal])
def get_cage_animals(cage_id: int, db: Session = Depends(get_db)):
    # Feature B: Return ONLY live animals
    animals = db.query(models.Animal).filter(
        models.Animal.cage_id == cage_id,
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()
    for animal in animals:
        animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return animals

@app.patch("/cages/{cage_id}/breeding_status", response_model=schemas.Cage)
def update_cage_breeding_status(cage_id: int, status_update: schemas.CageUpdate, request: Request, db: Session = Depends(get_db)):
    db_cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not db_cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    check_cage(db, acting_user(request, db), db_cage, claim=status_update.is_breeding_pair)

    db_cage.is_breeding_pair = status_update.is_breeding_pair
    if not db_cage.is_breeding_pair:
        release_if_empty(db, db_cage)
    try:
        db.commit()
        db.refresh(db_cage)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    db_cage.animals = [a for a in db_cage.animals if a.status == models.AnimalStatus.ALIVE]
    for animal in db_cage.animals:
        animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
        
    return db_cage

@app.post("/cages", response_model=schemas.Cage, status_code=status.HTTP_201_CREATED)
def create_cage(cage_data: schemas.CageCreate, db: Session = Depends(get_db)):
    next_num = db.execute(database.text("SELECT nextval('cage_number_seq')")).scalar()
    db_cage = models.Cage(
        row=cage_data.row,
        column=cage_data.column,
        rack_id=cage_data.rack_id,
        cage_number=next_num
    )
    db.add(db_cage)
    try:
        db.commit()
        db.refresh(db_cage)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db_cage.animals = []
    return db_cage

@app.patch("/cages/{cage_id}/number", response_model=schemas.Cage)
def update_cage_number(cage_id: int, update: schemas.CageNumberUpdate, request: Request, db: Session = Depends(get_db)):
    db_cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not db_cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    check_cage(db, acting_user(request, db), db_cage)
    db_cage.cage_number = update.cage_number
    try:
        db.commit()
        db.refresh(db_cage)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db_cage.animals = [a for a in db_cage.animals if a.status == models.AnimalStatus.ALIVE]
    for animal in db_cage.animals:
        animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return db_cage

@app.patch("/cages/{cage_id}/card", response_model=schemas.Cage)
def update_cage_card(cage_id: int, update: schemas.CageCardUpdate, request: Request, db: Session = Depends(get_db)):
    db_cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not db_cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    check_cage(db, acting_user(request, db), db_cage)
    db_cage.card_id = (update.card_id or "").strip() or None
    db.commit()
    db.refresh(db_cage)
    db_cage.animals = [a for a in db_cage.animals if a.status == models.AnimalStatus.ALIVE]
    for animal in db_cage.animals:
        animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return db_cage

@app.post("/cages/swap-positions")
def swap_cage_positions(swap: schemas.CageSwapPositions, request: Request, db: Session = Depends(get_db)):
    cage_a = db.query(models.Cage).filter(models.Cage.id == swap.cage_a_id).first()
    cage_b = db.query(models.Cage).filter(models.Cage.id == swap.cage_b_id).first()
    if not cage_a or not cage_b:
        raise HTTPException(status_code=404, detail="Cage not found")
    user = acting_user(request, db)
    check_cage(db, user, cage_a)
    check_cage(db, user, cage_b)
    cage_a.row, cage_b.row = cage_b.row, cage_a.row
    cage_a.column, cage_b.column = cage_b.column, cage_a.column
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Positions swapped"}

@app.post("/cages/{cage_id}/move")
def move_cage(cage_id: int, move: schemas.CageMove, request: Request, db: Session = Depends(get_db)):
    """Move a whole cage (animals, card, responsible person, breeding state) to a free
    position, in the same rack or another one. The empty slot takes the old position."""
    cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    user = acting_user(request, db)
    check_cage(db, user, cage)
    rack = db.query(models.Rack).filter(models.Rack.id == move.rack_id).first()
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")
    label = f"{rack.name} {chr(64 + move.column)}{move.row}"
    target = db.query(models.Cage).filter(models.Cage.rack_id == rack.id, models.Cage.row == move.row,
                                          models.Cage.column == move.column).first()
    if not target:
        raise HTTPException(status_code=400, detail=f"{label} does not exist")
    if target.id == cage.id:
        raise HTTPException(status_code=400, detail="The cage is already there")
    alive = models.AnimalStatus.ALIVE
    busy = (
        db.query(models.Animal).filter(models.Animal.cage_id == target.id, models.Animal.status == alive).count()
        or target.is_breeding_pair
        or db.query(models.Animal).filter(models.Animal.previous_cage_id == target.id, models.Animal.status == alive).count()
    )
    if busy:
        raise HTTPException(status_code=400, detail=f"{label} is not free")
    if target.owner_id not in (None, user.id) and not is_admin(user):
        raise HTTPException(status_code=403, detail=f"{label} is reserved by {target.owner.full_name or target.owner.username}")
    cage.rack_id, target.rack_id = target.rack_id, cage.rack_id
    cage.row, target.row = target.row, cage.row
    cage.column, target.column = target.column, cage.column
    db.commit()
    return {"message": f"Cage moved to {label}"}

@app.patch("/cages/owner")
def set_cage_owner(data: schemas.CageOwnerUpdate, request: Request, db: Session = Depends(get_db)):
    """Hand cages over to another user (their responsible person or an admin can)."""
    user = acting_user(request, db)
    new_owner = db.query(models.User).filter(models.User.id == data.owner_id, models.User.active == True).first()
    if not new_owner or new_owner.role == models.UserRole.VIEWER:
        raise HTTPException(status_code=400, detail="Cages can only be handed to an active editor or administrator")
    cages = db.query(models.Cage).filter(models.Cage.id.in_(data.cage_ids)).all()
    if len(cages) != len(set(data.cage_ids)):
        raise HTTPException(status_code=404, detail="Cage not found")
    for cage in cages:
        if not is_admin(user) and cage.owner_id != user.id:
            check_cage(db, user, cage)  # raises with the owner's name
            raise HTTPException(status_code=403, detail="Only the responsible person or an administrator can hand a cage over")
        cage.owner_id = new_owner.id
    db.commit()
    return {"message": f"{len(cages)} cage(s) assigned to {new_owner.full_name or new_owner.username}"}

@app.get("/animals/history", response_model=List[schemas.Animal])
def get_animals_history(limit: int = 500, offset: int = 0, db: Session = Depends(get_db)):
    # Feature C: Return dead or eliminated animals
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    animals = db.query(models.Animal).filter(
        models.Animal.status != models.AnimalStatus.ALIVE
    ).order_by(models.Animal.id.desc()).offset(offset).limit(limit).all()
    for animal in animals:
        animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return animals

@app.get("/statistics")
def get_statistics(request: Request, scope: str = "mine", db: Session = Depends(get_db)):
    # Inventory statistics of live animals. Each user sees their own cages;
    # admins can ask for the whole colony with scope=all.
    user = acting_user(request, db)
    query = db.query(models.Animal).filter(models.Animal.status == models.AnimalStatus.ALIVE)
    if not (scope == "all" and is_admin(user)):
        query = query.join(models.Cage, models.Cage.id == models.Animal.cage_id).filter(models.Cage.owner_id == user.id)
    animals = query.all()
    
    stats = {}
    age_distribution = {}
    live_animals = []
    
    for animal in animals:
        gen = animal.genotype or "Unknown"
        # Map sex to canonical keys (M/F) for the dashboard
        sex = "M" if animal.sex == models.AnimalSex.MALE else "F"
        
        months = calculate_age_months(animal.dob, animal.status_changed_at, animal.status)
        
        # Age distribution (counts per month)
        age_distribution[months] = age_distribution.get(months, 0) + 1
        
        # Live animals summary for detailed lookup
        cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
        cage_display = cage.display_id if cage else "N/A"
        
        live_animals.append({
            "rack": cage.rack.name if cage and cage.rack else None,
            "position": f"{chr(64 + cage.column)}{cage.row}" if cage else None,
            "id": animal.id,
            "sex": sex,
            "genotype": gen,
            "mark": animal.mark or "",
            "months": months,
            "dob": animal.dob.isoformat() if animal.dob else "N/A",
            "cage": cage_display
        })
        
        # Segment into ranges: 0-3m, 3-6m, 6-9m, >9m
        if months < 3: range_key = "0-3m"
        elif 3 <= months < 6: range_key = "3-6m"
        elif 6 <= months < 9: range_key = "6-9m"
        else: range_key = ">9m"
        
        # Initialize structure if genotype not present
        if gen not in stats:
            empty_ranges = {"0-3m": 0, "3-6m": 0, "6-9m": 0, ">9m": 0, "total": 0}
            stats[gen] = {
                "M": empty_ranges.copy(),
                "F": empty_ranges.copy(),
                "total_genotype": 0
            }
        
        # Update counts
        stats[gen][sex][range_key] += 1
        stats[gen][sex]["total"] += 1
        stats[gen]["total_genotype"] += 1
        
    return {
        "genotypes": stats,
        "age_distribution": age_distribution,
        "live_animals": live_animals
    }

@app.post("/animals", response_model=schemas.Animal, status_code=status.HTTP_201_CREATED)
def create_animal(animal: schemas.AnimalCreate, request: Request, db: Session = Depends(get_db)):
    cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
    if not cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    check_cage(db, acting_user(request, db), cage, claim=True)
    db_animal = models.Animal(**animal.dict())
    if db_animal.status != models.AnimalStatus.ALIVE:
        db_animal.status_changed_at = datetime.utcnow()
    db.add(db_animal)
    try:
        db.commit()
        db.refresh(db_animal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
    db_animal.age_display = calculate_age_display(db_animal.dob, db_animal.status_changed_at, db_animal.status)
    return db_animal

@app.patch("/animals/{animal_id}/status", response_model=schemas.Animal)
def update_animal_status(animal_id: int, status_update: schemas.StatusUpdate, request: Request, db: Session = Depends(get_db)):
    animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
    if cage:
        check_cage(db, acting_user(request, db), cage, claim=status_update.status == models.AnimalStatus.ALIVE)
    
    if status_update.status != models.AnimalStatus.ALIVE and not (status_update.reason and status_update.reason.strip()):
        raise HTTPException(status_code=400, detail="A reason is required when marking an animal as Dead or Eliminated")

    if status_update.status != animal.status:
        if status_update.status == models.AnimalStatus.ALIVE:
            animal.status_changed_at = None
        else:
            animal.status_changed_at = datetime.utcnow()
    animal.status = status_update.status
    animal.elimination_reason = status_update.reason # Store the reason
    if cage and animal.status != models.AnimalStatus.ALIVE:
        release_if_empty(db, cage)
    db.commit()
    db.refresh(animal)
    
    animal.age_display = calculate_age_display(animal.dob, animal.status_changed_at, animal.status)
    return animal

@app.put("/animals/{animal_id}", response_model=schemas.Animal)
def update_animal(animal_id: int, animal_update: schemas.AnimalUpdate, request: Request, db: Session = Depends(get_db)):
    db_animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    user = acting_user(request, db)
    old_cage = db.query(models.Cage).filter(models.Cage.id == db_animal.cage_id).first()
    if old_cage:
        check_cage(db, user, old_cage)

    update_data = animal_update.dict(exclude_unset=True)
    new_cage = None
    if update_data.get("cage_id") is None:
        update_data.pop("cage_id", None)
    elif update_data["cage_id"] != db_animal.cage_id:
        new_cage = db.query(models.Cage).filter(models.Cage.id == update_data["cage_id"]).first()
        if not new_cage:
            raise HTTPException(status_code=404, detail="Cage not found")
        check_cage(db, user, new_cage, claim=True)
    for key, value in update_data.items():
        setattr(db_animal, key, value)
    if new_cage and old_cage:
        release_if_empty(db, old_cage)
    
    try:
        db.commit()
        db.refresh(db_animal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
    db_animal.age_display = calculate_age_display(db_animal.dob, db_animal.status_changed_at, db_animal.status)
    return db_animal

@app.post("/breeding/create")
def create_breeding_group(breeding: schemas.BreedingCreate, request: Request, db: Session = Depends(get_db)):
    # 1. Find target cage
    target_cage = db.query(models.Cage).filter(models.Cage.id == breeding.target_cage_id).first()
    if not target_cage:
        raise HTTPException(status_code=404, detail="Target cage not found")
    # Only with your own animals (an admin may use any), into a cage you may take
    user = acting_user(request, db)
    for animal_id in breeding.animal_ids:
        animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
        if animal:
            check_animal(db, user, animal)
    check_cage(db, user, target_cage, claim=True)

    # 2. Mark cage as breeding
    target_cage.is_breeding_pair = True
    
    # 3. Move animals
    for animal_id in breeding.animal_ids:
        animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
        if animal:
            # Save current cage as the home to return to when this breeding session ends.
            # Always overwrite: a stale previous_cage_id from an unclosed prior session
            # must not survive into a new breeding assignment.
            if animal.cage_id != target_cage.id:
                animal.previous_cage_id = animal.cage_id
            # Move to new home
            animal.cage_id = target_cage.id
            
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": f"Breeding {breeding.type} created successfully"}

@app.post("/breeding/end/{cage_id}")
def end_breeding_session(cage_id: int, end_data: schemas.BreedingEnd, request: Request, db: Session = Depends(get_db)):
    cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    user = acting_user(request, db)
    check_cage(db, user, cage)
    
    if end_data.target_option not in ("Home", "New"):
        raise HTTPException(status_code=400, detail="target_option must be 'Home' or 'New'")
    if end_data.target_option == "New":
        if not end_data.new_cage_id:
            raise HTTPException(status_code=400, detail="Select the cage the animals will move to")
        if end_data.new_cage_id == cage_id:
            raise HTTPException(status_code=400, detail="The new cage must be different from the breeding cage")
        new_cage = db.query(models.Cage).filter(models.Cage.id == end_data.new_cage_id).first()
        if not new_cage:
            raise HTTPException(status_code=404, detail="Destination cage not found")
        check_cage(db, user, new_cage, claim=True)

    # 1. Unmark cage
    cage.is_breeding_pair = False
    
    # 2. Relocate animals (Only live ones)
    animals = db.query(models.Animal).filter(
        models.Animal.cage_id == cage_id,
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()
    
    for animal in animals:
        if end_data.target_option == "Home" and animal.previous_cage_id:
            animal.cage_id = animal.previous_cage_id
            animal.previous_cage_id = None
        elif end_data.target_option == "New":
            animal.cage_id = end_data.new_cage_id
            animal.previous_cage_id = None
        # else ("Home" without a recorded home cage): the animal stays where it is.
    release_if_empty(db, cage)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": "Breeding ended and animals relocated"}

@app.post("/cages/merge")
def merge_cages(merge_data: schemas.CageMerge, request: Request, db: Session = Depends(get_db)):
    source_cage = db.query(models.Cage).filter(models.Cage.id == merge_data.source_cage_id).first()
    dest_cage = db.query(models.Cage).filter(models.Cage.id == merge_data.destination_cage_id).first()
    
    if not source_cage or not dest_cage:
        raise HTTPException(status_code=404, detail="Source or destination cage not found")
    if source_cage.id == dest_cage.id:
        raise HTTPException(status_code=400, detail="Source and destination cages must be different")
    user = acting_user(request, db)
    check_cage(db, user, source_cage)
    check_cage(db, user, dest_cage, claim=True)

    # 1. Relocate all live animals from source to destination
    animals = db.query(models.Animal).filter(
        models.Animal.cage_id == merge_data.source_cage_id,
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()

    # previous_cage_id is the home an animal returns to when a breeding session ends.
    # Animals joining a breeding cage from a regular cage get that cage as home
    # (any older value is stale); animals already in a breeding session keep theirs.
    joins_breeding = dest_cage.is_breeding_pair and not source_cage.is_breeding_pair
    for animal in animals:
        if joins_breeding:
            animal.previous_cage_id = source_cage.id
        animal.cage_id = dest_cage.id

    # A breeding group moved to another cage stays a breeding group
    if source_cage.is_breeding_pair:
        dest_cage.is_breeding_pair = True
        source_cage.is_breeding_pair = False
    release_if_empty(db, source_cage)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": f"Successfully merged {len(animals)} animals into target cage"}

@app.get("/export/animals/csv")
def export_animals_csv(db: Session = Depends(get_db)):
    animals = db.query(models.Animal).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "ID", "Cage Number", "Rack", "Cage Position", "Cage Card", "Responsible", "Sex",
        "Date of Birth", "Mark", "Genotype", "Status", "Status Date", "Age", "Elimination Reason",
        "Individual ID", "Origin Cage", "Notes"
    ])

    for animal in animals:
        cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
        rack_name = db.query(models.Rack).filter(models.Rack.id == cage.rack_id).first().name if cage else "N/A"
        if cage:
            col_letter = chr(64 + cage.column)
            rack_num = rack_name.split()[-1]
            cage_label = f"{col_letter}{cage.row}-R{rack_num}"
        else:
            cage_label = "N/A"
        cage_number = cage.cage_number if cage and cage.cage_number is not None else ""

        writer.writerow([
            animal.id,
            cage_number,
            rack_name,
            cage_label,
            (cage.card_id or "") if cage else "",
            (cage.owner.username if cage.owner else "") if cage else "",
            animal.sex.value if animal.sex else "",
            animal.dob,
            animal.mark or "",
            animal.genotype,
            animal.status.value if animal.status else "",
            animal.status_changed_at.date().isoformat() if animal.status_changed_at else "",
            calculate_age_display(animal.dob, animal.status_changed_at, animal.status),
            animal.elimination_reason or "",
            animal.external_id or "",
            animal.origin_cage or "",
            animal.notes or "",
        ])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=animals_export.csv"}
    )

@app.post("/import/animals/csv")
async def import_animals_csv(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    importer = acting_user(request, db)
    if not is_admin(importer):
        raise HTTPException(status_code=403, detail="Only administrators can import animals in bulk")
    content = await file.read()
    try:
        string_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            string_content = content.decode("latin-1") # Fallback
        except:
            raise HTTPException(status_code=400, detail="Invalid file encoding. Please upload a standard UTF-8 CSV file.")
    
    stream = io.StringIO(string_content)
    reader = csv.DictReader(stream)
    
    # Helper to parse dates in different formats
    def parse_date(date_str: str) -> date:
        if not date_str:
            return date.today()
        date_str = date_str.strip()
        # Prioritized formats per user: Month/Day/Year (MM/DD/YYYY, MM/DD/YY)
        # Also keeping ISO (YYYY-MM-DD) and others for robustness
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%Y/%m/%d"):
            try:
                from datetime import datetime
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        # Fallback to date.fromisoformat or today
        try:
            return date.fromisoformat(date_str)
        except:
            # Final attempt: try split by / or -
            try:
                import re
                nums = re.findall(r'\d+', date_str)
                if len(nums) == 3:
                     # Assume MM/DD/YYYY or YYYY/MM/DD based on length
                     from datetime import datetime
                     if len(nums[0]) == 4: return datetime(int(nums[0]), int(nums[1]), int(nums[2])).date()
                     if len(nums[2]) == 4: return datetime(int(nums[2]), int(nums[0]), int(nums[1])).date()
            except:
                pass
            print(f"FAILED TO PARSE DATE: {date_str}")
            return date.today()

    updated_count = 0
    created_count = 0
    skipped_rows = []

    for line_num, raw_row in enumerate(reader, start=2):  # header is line 1
        row = {k.strip(): v.strip() if v else v for k, v in raw_row.items() if k is not None}

        mark = row.get("Mark", "").strip()
        if not mark:
            continue

        try:
            sex_str = (row.get("Sex") or "").strip().upper()
            if sex_str not in ("M", "MALE", "F", "FEMALE"):
                raise ValueError(f"Unknown sex '{row.get('Sex')}'")
            sex = models.AnimalSex.MALE if sex_str in ("M", "MALE") else models.AnimalSex.FEMALE

            dob_str = row.get("Date of Birth")
            dob = parse_date(dob_str)

            genotype = row.get("Genotype", "")
            status_str = row.get("Status", "Vivo").strip()
            # Accept the English labels shown in the UI as well as the stored values
            status_str = {"alive": "Vivo", "dead": "Muerto", "eliminated": "Eliminado"}.get(status_str.lower(), status_str)
            status = models.AnimalStatus(status_str)

            # Find cage by cage_number if provided, otherwise by position label
            db_cage = None
            cage_number_str = row.get("Cage Number", "").strip()
            if cage_number_str:
                try:
                    cn = int(cage_number_str)
                    db_cage = db.query(models.Cage).filter(models.Cage.cage_number == cn).first()
                except ValueError:
                    pass

            if not db_cage:
                cage_label = row.get("Cage Position", "")
                if cage_label:
                    try:
                        parts = cage_label.split("-")
                        col_row = parts[0]
                        rack_part = parts[1]
                        col_letter = col_row[0]
                        row_num = int(col_row[1:])
                        rack_num = rack_part[1:]
                        col_num = ord(col_letter.upper()) - 64
                        target_rack_name = f"RACK {rack_num}"
                        db_rack = db.query(models.Rack).filter(models.Rack.name == target_rack_name).first()
                        if db_rack:
                            db_cage = db.query(models.Cage).filter(
                                models.Cage.rack_id == db_rack.id,
                                models.Cage.row == row_num,
                                models.Cage.column == col_num
                            ).first()
                    except Exception:
                        pass

            # Optional columns
            status_date = parse_date(row.get("Status Date")) if row.get("Status Date") else None
            status_changed = (datetime.combine(status_date, datetime.min.time()) if status_date else datetime.utcnow())
            extra = {k: (row.get(col) or "").strip() or None for k, col in (
                ("elimination_reason", "Elimination Reason"), ("external_id", "Individual ID"),
                ("origin_cage", "Origin Cage"), ("notes", "Notes"))}
            if db_cage and status == models.AnimalStatus.ALIVE:
                card = (row.get("Cage Card") or "").strip()
                if card:
                    db_cage.card_id = card
                if db_cage.owner_id is None:
                    resp = (row.get("Responsible") or "").strip().lower()
                    owner = db.query(models.User).filter(models.User.username == resp).first() if resp else None
                    db_cage.owner_id = (owner or importer).id

            # Check for existing animal by internal ID
            animal_id_str = row.get("ID", "").strip()
            db_animal = None
            if animal_id_str:
                try:
                    db_animal = db.query(models.Animal).filter(models.Animal.id == int(animal_id_str)).first()
                except ValueError:
                    pass

            if db_animal:
                if status != db_animal.status:
                    db_animal.status_changed_at = None if status == models.AnimalStatus.ALIVE else status_changed
                for k, v in extra.items():
                    if v is not None:
                        setattr(db_animal, k, v)
                db_animal.sex = sex
                db_animal.dob = dob
                db_animal.genotype = genotype
                db_animal.mark = mark
                db_animal.status = status
                if db_cage:
                    db_animal.cage_id = db_cage.id
                updated_count += 1
            else:
                # Live animals need a cage; dead / eliminated ones may be recorded without one
                if db_cage or status != models.AnimalStatus.ALIVE:
                    new_animal = models.Animal(
                        sex=sex,
                        dob=dob,
                        genotype=genotype,
                        mark=mark,
                        status=status,
                        status_changed_at=None if status == models.AnimalStatus.ALIVE else status_changed,
                        cage_id=db_cage.id if db_cage and status == models.AnimalStatus.ALIVE else None,
                        **extra,
                    )
                    db.add(new_animal)
                    created_count += 1
                else:
                    skipped_rows.append({"line": line_num, "mark": mark, "reason": "No matching cage found"})

        except ValueError as e:
            skipped_rows.append({"line": line_num, "mark": mark, "reason": str(e)})
            continue

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"IMPORT DATABASE ERROR: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Database error during import: {str(e)}")

    return {
        "message": "Import completed",
        "updated": updated_count,
        "created": created_count,
        "skipped": skipped_rows,
    }
