"""Daily Practice (PRC). Almost everything lives on the device (prayer
times, qibla, city, reminders, habits). The server keeps only what is the
same for everyone: published moon-sighting announcements (PRC-04 R2)."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin


class Sighting(IdMixin, Base):
    """PRC-04 R2: the announced first day of a Hijri month in one country."""

    __tablename__ = "prc_sightings"
    __table_args__ = (UniqueConstraint("country", "hijri_year", "hijri_month"),)
    country: Mapped[str] = mapped_column(String(2))
    hijri_year: Mapped[int] = mapped_column(Integer)
    hijri_month: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    source_url: Mapped[str] = mapped_column(String(400))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
