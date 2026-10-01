"""Account administration from the command line (inside the backend container).

    docker exec -it bioterio_backend python manage_users.py create <username> --role admin
    docker exec -it bioterio_backend python manage_users.py reset-password <username>
    docker exec -it bioterio_backend python manage_users.py list
    docker exec -it bioterio_backend python manage_users.py assign-cages <username>

Passwords are typed at a hidden prompt; they are never passed as arguments.
"""
import argparse
import getpass
import sys

import models
from database import SessionLocal, engine
from security import hash_password, password_problem


def ask_password() -> str:
    while True:
        pw = getpass.getpass("Password: ")
        problem = password_problem(pw)
        if problem:
            print(problem)
            continue
        if getpass.getpass("Repeat password: ") != pw:
            print("Passwords do not match")
            continue
        return pw


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("username")
    c.add_argument("--role", choices=[r.value for r in models.UserRole], default="viewer")
    c.add_argument("--name", default=None)
    c.add_argument("--initials", default=None)
    r = sub.add_parser("reset-password")
    r.add_argument("username")
    sub.add_parser("list")
    a = sub.add_parser("assign-cages", help="give every occupied cage without a responsible user to <username>")
    a.add_argument("username")
    args = ap.parse_args()

    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if args.cmd == "list":
            for u in db.query(models.User).order_by(models.User.username):
                print(f"{u.username:20} {u.role.value:7} {'active' if u.active else 'disabled':8} {u.full_name or ''}")
            return 0
        username = args.username.strip().lower()
        user = db.query(models.User).filter(models.User.username == username).first()
        if args.cmd == "assign-cages":
            if not user:
                print(f"User {username} not found")
                return 1
            alive = models.AnimalStatus.ALIVE
            occupied = {a.cage_id for a in db.query(models.Animal).filter(models.Animal.status == alive)}
            homes = {a.previous_cage_id for a in db.query(models.Animal).filter(
                models.Animal.status == alive, models.Animal.previous_cage_id.isnot(None))}
            n = 0
            for cage in db.query(models.Cage).filter(models.Cage.owner_id.is_(None)):
                if cage.id in occupied or cage.id in homes or cage.is_breeding_pair:
                    cage.owner_id = user.id
                    n += 1
            db.commit()
            print(f"Assigned {n} cage(s) to {username}")
            return 0
        if args.cmd == "create":
            if user:
                print(f"User {username} already exists")
                return 1
            db.add(models.User(username=username, full_name=args.name, initials=(args.initials or "").upper() or None,
                               role=models.UserRole(args.role), password_hash=hash_password(ask_password())))
            db.commit()
            print(f"Created {username} ({args.role})")
        elif args.cmd == "reset-password":
            if not user:
                print(f"User {username} not found")
                return 1
            user.password_hash = hash_password(ask_password())
            db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
            db.commit()
            print(f"Password reset for {username}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
