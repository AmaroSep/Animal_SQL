import calendar
from datetime import date


def calculate_age_display(dob: date) -> str:
    today = date.today()
    months = (today.year - dob.year) * 12 + today.month - dob.month
    if today.day < dob.day:
        months -= 1
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
