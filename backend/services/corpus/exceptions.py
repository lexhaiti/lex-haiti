"""Domain exceptions raised by the corpus service.

Routes catch these and translate to HTTP errors. Services never raise
HTTPException directly (per the layered architecture in CLAUDE.md).
"""


class CorpusError(Exception):
    """Base for corpus-domain errors."""


class NotFound(CorpusError):
    """The requested artifact does not exist."""


class AlreadyExists(CorpusError):
    """An artifact with the given identifier already exists."""


class InvalidInput(CorpusError):
    """The provided input is invalid for domain reasons."""
