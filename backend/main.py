from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from fastapi.responses import StreamingResponse
import io, csv
import models, schemas, database
from database import engine, get_db

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bioterio Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def calculate_age_display(dob: date) -> str:
    today = date.today()
    months = (today.year - dob.year) * 12 + today.month - dob.month
    if today.day < dob.day:
        months -= 1
        import calendar
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_year = today.year if today.month > 1 else today.year - 1
        _, days_in_prev = calendar.monthrange(prev_year, prev_month)
        days = days_in_prev - dob.day + today.day
    else:
        days = today.day - dob.day
    return f"{months}m {days}d"

def calculate_age_months(dob: date) -> int:
    today = date.today()
    months = (today.year - dob.year) * 12 + today.month - dob.month
    if today.day < dob.day:
        months -= 1
    return months

@app.on_event("startup")
def startup_event():
    db = database.SessionLocal()
    try:
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
                animal.age_display = calculate_age_display(animal.dob)
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
            animal.age_display = calculate_age_display(animal.dob)
    return rack

@app.get("/cages/{cage_id}/animals", response_model=List[schemas.Animal])
def get_cage_animals(cage_id: int, db: Session = Depends(get_db)):
    # Feature B: Return ONLY "Vivo" animals
    animals = db.query(models.Animal).filter(
        models.Animal.cage_id == cage_id,
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()
    for animal in animals:
        animal.age_display = calculate_age_display(animal.dob)
    return animals

@app.patch("/cages/{cage_id}/breeding_status", response_model=schemas.Cage)
def update_cage_breeding_status(cage_id: int, status_update: schemas.CageUpdate, db: Session = Depends(get_db)):
    db_cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not db_cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    
    db_cage.is_breeding_pair = status_update.is_breeding_pair
    try:
        db.commit()
        db.refresh(db_cage)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    db_cage.animals = [a for a in db_cage.animals if a.status == models.AnimalStatus.ALIVE]
    for animal in db_cage.animals:
        animal.age_display = calculate_age_display(animal.dob)
        
    return db_cage

@app.get("/animals/history", response_model=List[schemas.Animal])
def get_animals_history(db: Session = Depends(get_db)):
    # Feature C: Return "Muerto" or "Eliminado" animals
    animals = db.query(models.Animal).filter(
        models.Animal.status != models.AnimalStatus.ALIVE
    ).all()
    for animal in animals:
        animal.age_display = calculate_age_display(animal.dob)
    return animals

@app.get("/statistics")
def get_statistics(db: Session = Depends(get_db)):
    # Feature B: Inventory statistics (Only live animals)
    animals = db.query(models.Animal).filter(
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()
    
    stats = {}
    age_distribution = {}
    live_animals = []
    
    for animal in animals:
        gen = animal.genotype or "Unknown"
        # Map sex to canonical keys (M/F) for the dashboard
        sex = "M" if animal.sex == models.AnimalSex.MALE else "F"
        
        months = calculate_age_months(animal.dob)
        
        # Age distribution (counts per month)
        age_distribution[months] = age_distribution.get(months, 0) + 1
        
        # Live animals summary for detailed lookup
        cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
        cage_display = cage.display_id if cage else "N/A"
        
        live_animals.append({
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
def create_animal(animal: schemas.AnimalCreate, db: Session = Depends(get_db)):
    db_animal = models.Animal(**animal.dict())
    db.add(db_animal)
    try:
        db.commit()
        db.refresh(db_animal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
    db_animal.age_display = calculate_age_display(db_animal.dob)
    return db_animal

@app.patch("/animals/{animal_id}/status", response_model=schemas.Animal)
def update_animal_status(animal_id: str, status_update: schemas.StatusUpdate, db: Session = Depends(get_db)):
    animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    
    animal.status = status_update.status
    animal.elimination_reason = status_update.reason # Store the reason
    db.commit()
    db.refresh(animal)
    
    animal.age_display = calculate_age_display(animal.dob)
    return animal

@app.put("/animals/{animal_id}", response_model=schemas.Animal)
def update_animal(animal_id: str, animal_update: schemas.AnimalUpdate, db: Session = Depends(get_db)):
    db_animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    
    update_data = animal_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_animal, key, value)
    
    try:
        db.commit()
        db.refresh(db_animal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
    db_animal.age_display = calculate_age_display(db_animal.dob)
    return db_animal

@app.post("/breeding/create")
def create_breeding_group(breeding: schemas.BreedingCreate, db: Session = Depends(get_db)):
    # 1. Find target cage
    target_cage = db.query(models.Cage).filter(models.Cage.id == breeding.target_cage_id).first()
    if not target_cage:
        raise HTTPException(status_code=404, detail="Target cage not found")
    
    # 2. Mark cage as breeding
    target_cage.is_breeding_pair = True
    
    # 3. Move animals
    for animal_id in breeding.animal_ids:
        animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
        if animal:
            # Save original home if not already in one (prevent nested breeding loss)
            if not animal.previous_cage_id:
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
def end_breeding_session(cage_id: int, end_data: schemas.BreedingEnd, db: Session = Depends(get_db)):
    cage = db.query(models.Cage).filter(models.Cage.id == cage_id).first()
    if not cage:
        raise HTTPException(status_code=404, detail="Cage not found")
    
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
        elif end_data.target_option == "New" and end_data.new_cage_id:
            animal.cage_id = end_data.new_cage_id
            
        # Clear previous home
        animal.previous_cage_id = None
        
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": "Breeding ended and animals relocated"}

@app.post("/cages/merge")
def merge_cages(merge_data: schemas.CageMerge, db: Session = Depends(get_db)):
    source_cage = db.query(models.Cage).filter(models.Cage.id == merge_data.source_cage_id).first()
    dest_cage = db.query(models.Cage).filter(models.Cage.id == merge_data.destination_cage_id).first()
    
    if not source_cage or not dest_cage:
        raise HTTPException(status_code=404, detail="Source or destination cage not found")
    
    # 1. Relocate all live animals from source to destination
    animals = db.query(models.Animal).filter(
        models.Animal.cage_id == merge_data.source_cage_id,
        models.Animal.status == models.AnimalStatus.ALIVE
    ).all()
    
    for animal in animals:
        animal.previous_cage_id = merge_data.source_cage_id
        animal.cage_id = merge_data.destination_cage_id
        
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
        "Animal ID", "Rack", "Cage", "Sex", 
        "Date of Birth", "Mark", "Genotype", "Status", "Age", "Elimination Reason"
    ])
    
    for animal in animals:
        # Get rack and cage info
        # We need the relationship joined for efficiency but for now simple query is fine
        cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
        rack_name = db.query(models.Rack).filter(models.Rack.id == cage.rack_id).first().name if cage else "N/A"
        cage_label = cage.display_id if cage else "N/A"
        
        writer.writerow([
            animal.id,
            rack_name,
            cage_label,
            animal.sex,
            animal.dob,
            animal.mark or "",
            animal.genotype,
            animal.status,
            calculate_age_display(animal.dob),
            animal.elimination_reason or ""
        ])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=animals_export.csv"}
    )

@app.post("/import/animals/csv")
async def import_animals_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
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
    
    for raw_row in reader:
        # Clean row: strip spaces from both keys and values
        # Handle cases where key might be None (extra columns in CSV)
        row = {k.strip(): v.strip() if v else v for k, v in raw_row.items() if k is not None}
        
        animal_id = row.get("Animal ID")
        if not animal_id: continue
        
        # Parse data
        sex_str = row.get("Sex", "M")
        sex = models.AnimalSex.MALE if sex_str == "M" else models.AnimalSex.FEMALE
        
        dob_str = row.get("Date of Birth")
        dob = parse_date(dob_str)
            
        genotype = row.get("Genotype", "")
        mark = row.get("Mark", "")
        status_str = row.get("Status", "Vivo")
        status = models.AnimalStatus(status_str)
        
        # Find the cage if provided (e.g. "A1-R3")
        cage_label = row.get("Cage", "")
        db_cage = None
        if cage_label:
            # We search for the cage that matches this display_id
            # Note: models.Cage.display_id is a @property, so we can't query it effectively via DB
            # We must parse it: A1-R3 -> col=1, row=1, rack_num=3
            try:
                parts = cage_label.split("-") # ["A1", "R3"]
                col_row = parts[0] # "A1"
                rack_part = parts[1] # "R3"
                
                col_letter = col_row[0] # "A"
                row_num = int(col_row[1:]) # "1"
                rack_num = rack_part[1:] # "3"
                
                col_num = ord(col_letter.upper()) - 64
                
                # Find Rack by name suffix
                target_rack_name = f"RACK {rack_num}"
                db_rack = db.query(models.Rack).filter(models.Rack.name == target_rack_name).first()
                if db_rack:
                    db_cage = db.query(models.Cage).filter(
                        models.Cage.rack_id == db_rack.id,
                        models.Cage.row == row_num,
                        models.Cage.column == col_num
                    ).first()
            except:
                pass

        # Check for existing animal
        db_animal = db.query(models.Animal).filter(models.Animal.id == animal_id).first()
        
        if db_animal:
            # Update
            db_animal.sex = sex
            db_animal.dob = dob
            db_animal.genotype = genotype
            db_animal.mark = mark
            db_animal.status = status
            if db_cage:
                db_animal.cage_id = db_cage.id
            updated_count += 1
        else:
            # Create (Requires Cage)
            if db_cage:
                new_animal = models.Animal(
                    id=animal_id,
                    sex=sex,
                    dob=dob,
                    genotype=genotype,
                    mark=mark,
                    status=status,
                    cage_id=db_cage.id
                )
                db.add(new_animal)
                created_count += 1
                
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"IMPORT DATABASE ERROR: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Database error during import: {str(e)}")
        
    return {"message": "Import completed", "updated": updated_count, "created": created_count}
