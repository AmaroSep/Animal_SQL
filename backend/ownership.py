"""Bioterio cage ownership: everyone can read everything, but only the cage's
responsible user (or an admin) may change the cage and its animals.

- An empty cage has no responsible user; whoever puts animals in it takes it.
- A cage is released when it no longer holds live animals, is not a breeding cage
  and is not the home cage of an animal currently in a breeding session.
"""
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

import models

# Palette users pick their colour from (distinct on dark backgrounds)
PALETTE = [
    "#22d3ee", "#f472b6", "#a3e635", "#facc15", "#fb923c", "#a78bfa",
    "#34d399", "#f87171", "#60a5fa", "#e879f9", "#2dd4bf", "#fde047",
]


def acting_user(request: Request, db: Session) -> models.User:
    user_id = getattr(request.state, "user_id", None)
    user = db.query(models.User).filter(models.User.id == user_id).first() if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


def is_admin(user: models.User) -> bool:
    return user.role == models.UserRole.ADMIN


def _live_count(db: Session, cage_id: int) -> int:
    return db.query(models.Animal).filter(
        models.Animal.cage_id == cage_id, models.Animal.status == models.AnimalStatus.ALIVE
    ).count()


def _owner_name(cage: models.Cage) -> str:
    o = cage.owner
    return (o.full_name or o.username) if o else "nobody"


def cage_label(cage: models.Cage) -> str:
    return f"#{cage.cage_number}" if cage.cage_number is not None else cage.display_id


def check_cage(db: Session, user: models.User, cage: models.Cage, claim: bool = False):
    """Raise 403 unless `user` may change `cage`. With claim=True an unowned cage
    becomes the user's (used when animals are put into it)."""
    if cage.owner_id == user.id:
        return
    if cage.owner_id is None:
        occupied = _live_count(db, cage.id) > 0 or cage.is_breeding_pair
        if occupied and not is_admin(user):
            raise HTTPException(status_code=403,
                                detail=f"Cage {cage_label(cage)} has no responsible person yet; ask an administrator")
        if claim:
            cage.owner_id = user.id
        return
    if is_admin(user):
        return
    raise HTTPException(status_code=403, detail=f"Cage {cage_label(cage)} belongs to {_owner_name(cage)}")


def check_animal(db: Session, user: models.User, animal: models.Animal):
    cage = db.query(models.Cage).filter(models.Cage.id == animal.cage_id).first()
    if cage:
        check_cage(db, user, cage)


def release_if_empty(db: Session, cage: models.Cage):
    """Free the cage's responsible user once nothing of theirs is left in it."""
    if cage.owner_id is None or cage.is_breeding_pair:
        return
    db.flush()  # the session does not autoflush: make pending moves visible to the counts
    waiting_home = db.query(models.Animal).filter(
        models.Animal.previous_cage_id == cage.id, models.Animal.status == models.AnimalStatus.ALIVE
    ).count()
    if _live_count(db, cage.id) == 0 and waiting_home == 0:
        cage.owner_id = None
