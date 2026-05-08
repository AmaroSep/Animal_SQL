import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import models, schemas
from database import get_db

router = APIRouter(prefix="/experiments", tags=["experiments"])


# ── N Calculator ───────────────────────────────────────────────────────────

EFFECT_SIZES = {
    models.EffectSize.SMALL: 0.2,
    models.EffectSize.MEDIUM: 0.5,
    models.EffectSize.LARGE: 0.8,
}


def _z(p: float) -> float:
    """Approximate inverse normal CDF (Beasley-Springer-Moro)."""
    a = [2.515517, 0.802853, 0.010328]
    b = [1.432788, 0.189269, 0.001308]
    if p < 0.5:
        sign = -1
        t = math.sqrt(-2 * math.log(p))
    else:
        sign = 1
        t = math.sqrt(-2 * math.log(1 - p))
    num = a[0] + a[1]*t + a[2]*t*t
    den = 1 + b[0]*t + b[1]*t*t + b[2]*t*t*t
    return sign * (t - num/den)


def calculate_n(stat_test: models.StatTest, alpha: float, power: float,
                cohen_d: float, n_groups: int, dropout_rate: float):
    z_alpha = _z(1 - alpha / 2)
    z_beta = _z(power)

    if stat_test in (models.StatTest.TTEST, models.StatTest.MANN_WHITNEY):
        n_raw = 2 * ((z_alpha + z_beta) / cohen_d) ** 2
        formula = "n = 2·((z_α/2 + z_β) / d)²"
    else:
        # ANOVA / Kruskal: use f = d/2 approximation, Cohen (1988)
        f = cohen_d / 2
        n_raw = ((z_alpha + z_beta) / f) ** 2 + 1
        n_raw = n_raw * n_groups / n_groups  # per group
        formula = "n = ((z_α/2 + z_β) / f)² + 1  [Cohen 1988]"

    n_min = math.ceil(n_raw)
    n_recommended = math.ceil(n_min / (1 - dropout_rate))

    justification = (
        f"Para detectar un efecto de d={cohen_d:.2f} con poder={power:.0%} y α={alpha} "
        f"usando {stat_test.value} se requieren n={n_min} animales por grupo. "
        f"Considerando una tasa de pérdida estimada del {dropout_rate:.0%}, "
        f"se recomienda iniciar con n={n_recommended} animales por grupo "
        f"(n total = {n_recommended * n_groups})."
    )

    return n_min, n_recommended, formula, justification


@router.post("/calculate-n", response_model=schemas.NCalcResult)
def calculate_sample_size(req: schemas.NCalcRequest):
    if req.effect_size_custom is not None:
        cohen_d = req.effect_size_custom
    elif req.effect_size is not None:
        cohen_d = EFFECT_SIZES[req.effect_size]
    else:
        raise HTTPException(status_code=400, detail="Provide effect_size or effect_size_custom")

    n_min, n_rec, formula, justification = calculate_n(
        req.stat_test, req.alpha, req.power, cohen_d, req.n_groups, req.dropout_rate
    )
    return schemas.NCalcResult(
        n_per_group=n_min,
        n_recommended=n_rec,
        n_total=n_rec * req.n_groups,
        cohen_d=cohen_d,
        formula_used=formula,
        justification_text=justification,
    )


# ── Experiments CRUD ───────────────────────────────────────────────────────

@router.get("", response_model=List[schemas.Experiment])
def list_experiments(db: Session = Depends(get_db)):
    experiments = db.query(models.Experiment).all()
    return [_enrich_experiment(e) for e in experiments]


@router.post("", response_model=schemas.Experiment, status_code=201)
def create_experiment(data: schemas.ExperimentCreate, db: Session = Depends(get_db)):
    obj = models.Experiment(**data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _enrich_experiment(obj)


@router.get("/{experiment_id}", response_model=schemas.Experiment)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return _enrich_experiment(obj)


@router.put("/{experiment_id}", response_model=schemas.Experiment)
def update_experiment(experiment_id: int, data: schemas.ExperimentUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Experiment not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return _enrich_experiment(obj)


@router.delete("/{experiment_id}", status_code=204)
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.delete(obj)
    db.commit()


# ── Groups ─────────────────────────────────────────────────────────────────

@router.post("/{experiment_id}/groups", response_model=schemas.ExperimentGroup, status_code=201)
def create_group(experiment_id: int, data: schemas.ExperimentGroupCreate, db: Session = Depends(get_db)):
    exp = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    obj = models.ExperimentGroup(experiment_id=experiment_id, **data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _enrich_group(obj)


@router.put("/{experiment_id}/groups/{group_id}", response_model=schemas.ExperimentGroup)
def update_group(experiment_id: int, group_id: int, data: schemas.ExperimentGroupUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.ExperimentGroup).filter(
        models.ExperimentGroup.id == group_id,
        models.ExperimentGroup.experiment_id == experiment_id
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Group not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return _enrich_group(obj)


@router.delete("/{experiment_id}/groups/{group_id}", status_code=204)
def delete_group(experiment_id: int, group_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ExperimentGroup).filter(
        models.ExperimentGroup.id == group_id,
        models.ExperimentGroup.experiment_id == experiment_id
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(obj)
    db.commit()


# ── Animal assignments ─────────────────────────────────────────────────────

@router.get("/{experiment_id}/animals", response_model=List[schemas.ExperimentAnimalOut])
def list_experiment_animals(experiment_id: int, db: Session = Depends(get_db)):
    assignments = db.query(models.ExperimentAnimal).filter(
        models.ExperimentAnimal.experiment_id == experiment_id
    ).all()
    result = []
    for a in assignments:
        out = schemas.ExperimentAnimalOut.model_validate(a)
        if a.animal:
            from utils import calculate_age_display
            a.animal.age_display = calculate_age_display(a.animal.dob)
            out.animal = schemas.Animal.model_validate(a.animal)
        result.append(out)
    return result


@router.post("/{experiment_id}/animals", response_model=schemas.ExperimentAnimalOut, status_code=201)
def assign_animal(experiment_id: int, data: schemas.ExperimentAnimalAssign, db: Session = Depends(get_db)):
    exp = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    animal = db.query(models.Animal).filter(models.Animal.id == data.animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    existing = db.query(models.ExperimentAnimal).filter(
        models.ExperimentAnimal.experiment_id == experiment_id,
        models.ExperimentAnimal.animal_id == data.animal_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Animal already assigned to this experiment")
    obj = models.ExperimentAnimal(experiment_id=experiment_id, **data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{experiment_id}/animals/{assignment_id}", response_model=schemas.ExperimentAnimalOut)
def update_animal_assignment(experiment_id: int, assignment_id: int,
                              data: schemas.ExperimentAnimalUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.ExperimentAnimal).filter(
        models.ExperimentAnimal.id == assignment_id,
        models.ExperimentAnimal.experiment_id == experiment_id
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Assignment not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{experiment_id}/animals/{assignment_id}", status_code=204)
def remove_animal(experiment_id: int, assignment_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ExperimentAnimal).filter(
        models.ExperimentAnimal.id == assignment_id,
        models.ExperimentAnimal.experiment_id == experiment_id
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(obj)
    db.commit()


# ── Helpers ────────────────────────────────────────────────────────────────

def _enrich_group(group: models.ExperimentGroup) -> schemas.ExperimentGroup:
    assigned = sum(1 for a in group.animals if a.status != models.AnimalExperimentStatus.EXCLUDED)
    validated = sum(1 for a in group.animals if a.status == models.AnimalExperimentStatus.VALIDATED)
    out = schemas.ExperimentGroup.model_validate(group)
    out.assigned_count = assigned
    out.validated_count = validated
    return out


def _enrich_experiment(exp: models.Experiment) -> schemas.Experiment:
    out = schemas.Experiment.model_validate(exp)
    out.groups = [_enrich_group(g) for g in exp.groups]
    return out
