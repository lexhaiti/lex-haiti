"""Enums shared between SQLAlchemy ORM models and Pydantic schemas.

Internal keys are English; UI display strings are translated via the
frontend's i18n layer (web/src/i18n/).
"""
from enum import Enum


class LegalCategory(str, Enum):
    constitution = "constitution"
    code = "code"
    loi = "loi"
    decret = "decret"
    arrete = "arrete"
    circulaire = "circulaire"
    convention = "convention"


class CodeSubcategory(str, Enum):
    code_civil = "code_civil"
    code_penal = "code_penal"
    code_travail = "code_travail"
    code_commerce = "code_commerce"
    code_rural = "code_rural"
    code_procedure_civile = "code_procedure_civile"
    code_procedure_penale = "code_procedure_penale"
    autre = "autre"


class LegalStatus(str, Enum):
    """Legal status of the whole legal text (not the editorial workflow)."""

    in_force = "in_force"
    abrogated = "abrogated"
    partially_abrogated = "partially_abrogated"


class ArticleStatus(str, Enum):
    """Per-version legal status of a single article.

    Distinct from LegalStatus (whole-text) and EditorialStatus (workflow).
    Mirrors Légifrance's per-article state model: a Code may be `in_force`
    overall while one of its articles is `abrogated`, or one article may
    have an `effective_from`/`effective_to` window during which it was active.
    """

    in_force = "in_force"            # currently the binding text
    abrogated = "abrogated"          # explicitly repealed
    suspended = "suspended"          # paused (e.g. by emergency decree, awaiting council ruling)
    transferred = "transferred"      # renumbered/moved (see transferred_to_article_id)
    obsolete = "obsolete"            # superseded but not formally repealed


class EditorialStatus(str, Enum):
    """Editorial workflow status. Public site shows only `published`."""

    draft = "draft"
    pending_review = "pending_review"
    published = "published"
    rejected = "rejected"


class LegalTheme(str, Enum):
    """Cross-cutting legal-domain tags applied to a `LegalText` (many-to-many).

    Themes cut ACROSS categories: Code Civil might carry `droit_famille`,
    `successions`, and `droit_societes` simultaneously, while a 3-page décret
    might carry just `marches_publics`. They power the homepage "Thématiques"
    menu and the /lois?theme=... filter.

    Add new themes here, then update `THEME_KEYWORDS` (themes.py) so the
    auto-suggester recognises them on import.
    """

    droit_societes = "droit_societes"
    droit_fiscal = "droit_fiscal"
    droit_bancaire = "droit_bancaire"
    propriete_intellectuelle = "propriete_intellectuelle"
    droit_travail = "droit_travail"
    protection_sociale = "protection_sociale"
    droit_famille = "droit_famille"
    successions = "successions"
    droit_administratif = "droit_administratif"
    marches_publics = "marches_publics"
    environnement = "environnement"
    foncier = "foncier"


class MoniteurDocumentType(str, Enum):
    """Document type detected inside a Moniteur issue.

    Superset of LegalCategory — includes non-legal document types that
    appear in the official gazette (promulgation letters, communiqués,
    errata, etc.) but should not pollute the corpus-level category enum.
    """

    # Legal text types (mirrors LegalCategory)
    constitution = "constitution"
    code = "code"
    loi = "loi"
    decret = "decret"
    arrete = "arrete"
    circulaire = "circulaire"
    convention = "convention"
    ordonnance = "ordonnance"
    # Moniteur-only document types
    communique = "communique"
    promulgation = "promulgation"
    errata = "errata"
    autre = "autre"


PROMOTABLE_TYPES: frozenset[MoniteurDocumentType] = frozenset({
    MoniteurDocumentType.constitution,
    MoniteurDocumentType.code,
    MoniteurDocumentType.loi,
    MoniteurDocumentType.decret,
    MoniteurDocumentType.arrete,
    MoniteurDocumentType.convention,
    MoniteurDocumentType.ordonnance,
})


class MoniteurIssueStatus(str, Enum):
    """Lifecycle of a Moniteur issue in the ingestion pipeline.

    uploaded → ocr_pending → parsed → reviewed → published
                                     ↘ failed
    """

    uploaded = "uploaded"
    ocr_pending = "ocr_pending"
    parsed = "parsed"
    reviewed = "reviewed"
    published = "published"
    failed = "failed"


class MoniteurCandidateStatus(str, Enum):
    """Editor's verdict on a parsed law candidate."""

    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    deferred = "deferred"


class ThemeSource(str, Enum):
    """Provenance of a theme tag.

    - `editor`: an editor confirmed (or manually added) the tag.
    - `auto`:   produced by the keyword auto-suggester; awaiting review.

    The /legal-texts?theme=X filter returns both by default. Use
    `?theme_source=editor` for stricter editorial-only views.
    """

    editor = "editor"
    auto = "auto"


class HeadingLevel(str, Enum):
    book = "book"  # Livre
    title = "title"  # Titre
    chapter = "chapter"  # Chapitre
    section = "section"
    subsection = "subsection"


class CourtType(str, Enum):
    cassation = "cassation"
    appel = "appel"
    tpi = "tpi"
    tribunal_commerce = "tribunal_commerce"
    tribunal_enfants = "tribunal_enfants"
    autre = "autre"


class CitationNodeType(str, Enum):
    article = "article"
    decision = "decision"
    legal_text = "legal_text"


class CitationRelation(str, Enum):
    cites = "cites"
    applies = "applies"
    interprets = "interprets"
    distinguishes = "distinguishes"
    amends = "amends"
    abrogates = "abrogates"
    supersedes = "supersedes"


class RawDocumentType(str, Enum):
    moniteur = "moniteur"
    code_book = "code_book"
    decision = "decision"
    decree = "decree"
    other = "other"


class RawDocumentStatus(str, Enum):
    pending = "pending"
    extracting = "extracting"
    extracted = "extracted"
    failed = "failed"


class RawPageStatus(str, Enum):
    pending = "pending"
    ocr_done = "ocr_done"
    review_needed = "review_needed"
    reviewed = "reviewed"


class ExtractionMethod(str, Enum):
    regex = "regex"
    llm = "llm"
    manual = "manual"
