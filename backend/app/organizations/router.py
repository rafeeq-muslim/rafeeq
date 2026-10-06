"""Organisations (ORG) API: ORG-01 links (learner side), ORG-02 mentors and
ORG-03 dashboard (coordinator side), and organisation creation (team).
Importing this module also registers the domain's event handlers."""

from fastapi import APIRouter

from app.organizations import events, links, manage  # noqa: F401  (events registers handlers)

router = APIRouter()
for _r in (links.router, manage.router, manage.admin):
    router.include_router(_r)
