"""Enqueueable jobs.

Each function takes simple JSON-serializable arguments and opens its own
DB session. Don't pass ORM objects across the queue — they detach from
the session that loaded them.
"""

from __future__ import annotations

import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from api.config import get_settings
from services.ingestion.moniteur.repository import MoniteurRepository

_log = logging.getLogger(__name__)


def _build_session_factory():
    """Build the SQLAlchemy sessionmaker once per worker process."""
    engine = create_engine(get_settings().database_url, future=True)
    return sessionmaker(bind=engine, autoflush=False, future=True)


# Initialize at module-import time. The worker process imports this
# module on startup, so the engine is ready before the first dequeue.
_SESSION_FACTORY = _build_session_factory()


def _make_session() -> Session:
    """Per-job session — caller is responsible for commit / rollback /
    close. Each job opens its own session; ORM rows don't survive across
    queue boundaries anyway."""
    return _SESSION_FACTORY()


def parse_moniteur_issue(issue_id: int) -> dict:
    """OCR + parse a Moniteur issue. Idempotent — safe to re-run.

    Returns a small status dict for RQ result storage. The DB row is the
    source of truth; this dict is just for the worker dashboard.
    """
    sess = _make_session()
    try:
        repo = MoniteurRepository(sess)
        issue = repo.get_issue(issue_id)
        if issue is None:
            return {"ok": False, "error": f"issue {issue_id} not found"}
        repo.run_parse_for_issue(issue)
        sess.commit()
        full = repo.get_issue_with_candidates(issue_id)
        return {
            "ok": True,
            "issue_id": issue_id,
            "candidates": len(full.candidates) if full else 0,
            "status": (full.processing_status.value if full else None),
        }
    except Exception as e:  # noqa: BLE001
        _log.exception("parse_moniteur_issue failed for issue %s", issue_id)
        sess.rollback()
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    finally:
        sess.close()
