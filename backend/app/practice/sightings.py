"""PRC-04 R2: moon-sighting announcements.

The start of Ramadan and Shawwal is «expected» (Umm al-Qura calendar) until
an announcement is published. Announcements are published without team
approval, but one that is more than one day away from the expected date is
rejected and the date stays expected. Saudi Arabia only in v1.

R6: the published list is the same file for everyone; reading it carries no
city or country.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.practice import umalqura
from app.practice.models import Sighting

COUNTRIES = ("SA",)
MAX_DAYS_FROM_EXPECTED = 1


def validate(expected: date, announced: date) -> bool:
    return abs((announced - expected).days) <= MAX_DAYS_FROM_EXPECTED


def expected_start(hijri_year: int, hijri_month: int) -> date | None:
    """The Umm al-Qura date of day 1 of the month, computed here: a caller's "expected" is never trusted."""
    return umalqura.month_start(hijri_year, hijri_month)


async def publish(session: AsyncSession, *, country: str, hijri_year: int, hijri_month: int, start: date, source_url: str) -> Sighting:
    if country not in COUNTRIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "country_not_supported")
    expected = expected_start(hijri_year, hijri_month)
    if expected is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "expected_date_unknown")
    if not validate(expected, start):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "too_far_from_expected")
    row = await session.scalar(
        select(Sighting).where(Sighting.country == country, Sighting.hijri_year == hijri_year, Sighting.hijri_month == hijri_month)
    )
    if row is None:
        row = Sighting(country=country, hijri_year=hijri_year, hijri_month=hijri_month)
        session.add(row)
    row.start_date, row.source_url = start, source_url
    await session.commit()
    return row


async def remove(session: AsyncSession, *, country: str, hijri_year: int, hijri_month: int) -> bool:
    row = await session.scalar(
        select(Sighting).where(Sighting.country == country, Sighting.hijri_year == hijri_year, Sighting.hijri_month == hijri_month)
    )
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True


async def published(session: AsyncSession) -> list[dict]:
    rows = await session.scalars(select(Sighting).order_by(Sighting.hijri_year, Sighting.hijri_month))
    return [
        {
            "country": r.country,
            "hijri_year": r.hijri_year,
            "hijri_month": r.hijri_month,
            "start": r.start_date.isoformat(),
            "source_url": r.source_url,
        }
        for r in rows
    ]
