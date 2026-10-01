"""Fill created_by / updated_by / updated_at automatically on tracked records.

The request guard (security.auth_guard) stores the signed-in username in
`current_username`; every flush then stamps new and modified records with it.
Changes to child rows (e.g. the staining steps of an EM grid) count as an edit
of their parent record.
"""
from contextvars import ContextVar
from datetime import datetime

from sqlalchemy import event
from sqlalchemy.orm import Session

import models

current_username: ContextVar = ContextVar("current_username", default=None)

TRACKED = (models.EMGrid, models.LNVial, models.M80Tube)


def _parent(obj):
    if isinstance(obj, models.EMGridStainStep):
        return obj.grid
    return None


@event.listens_for(Session, "before_flush")
def stamp_records(session, flush_context, instances):
    username = current_username.get()
    now = datetime.utcnow()
    edited = set()

    for obj in session.new:
        if isinstance(obj, TRACKED):
            if obj.created_by is None:
                obj.created_by = username
        elif _parent(obj) is not None and _parent(obj) not in session.new:
            edited.add(_parent(obj))

    for obj in list(session.dirty) + list(session.deleted):
        if isinstance(obj, TRACKED) and obj in session.dirty and session.is_modified(obj, include_collections=False):
            edited.add(obj)
        elif _parent(obj) is not None:
            edited.add(_parent(obj))

    for obj in edited:
        if obj in session.deleted:
            continue
        obj.updated_by = username
        obj.updated_at = now
