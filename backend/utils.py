import calendar
from datetime import date, datetime
from typing import Optional


def _age_reference_date(status_changed_at: Optional[datetime], status: Optional[str]) -> date:
    """Animals no longer alive stop aging at the moment their status changed."""
    if status is not None and str(status) != "Vivo" and status_changed_at is not None:
        return status_changed_at.date()
    return date.today()


def calculate_age_display(dob: date, status_changed_at: Optional[datetime] = None, status: Optional[str] = None) -> str:
    reference = _age_reference_date(status_changed_at, status)
    months = (reference.year - dob.year) * 12 + reference.month - dob.month
    if reference.day < dob.day:
        months -= 1
        prev_month = reference.month - 1 if reference.month > 1 else 12
        prev_year = reference.year if reference.month > 1 else reference.year - 1
        _, days_in_prev = calendar.monthrange(prev_year, prev_month)
        days = days_in_prev - dob.day + reference.day
    else:
        days = reference.day - dob.day
    return f"{months}m {days}d"


def calculate_age_months(dob: date, status_changed_at: Optional[datetime] = None, status: Optional[str] = None) -> int:
    reference = _age_reference_date(status_changed_at, status)
    months = (reference.year - dob.year) * 12 + reference.month - dob.month
    if reference.day < dob.day:
        months -= 1
    return months
