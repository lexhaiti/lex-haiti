"""Enums shared between SQLAlchemy ORM models and Pydantic schemas.

Internal keys are English; UI display strings are translated via the
frontend's i18n layer (web/src/i18n/).
"""
from enum import Enum


class LegalCategory(str, Enum):
    """Top-level taxonomy of a corpus document. Used both by the public
    site (filter chips, breadcrumb) and the editorial pipeline (parser
    profile selection, domain-rule enforcement).

    ``ordonnance``, ``communique``, ``avis``, ``other_regulatory`` were
    added in 0016 to align with MoniteurDocumentType and to cover acts
    that the original enum couldn't represent (1916 ordonnances, post-
    2010 CSPJ communiqués, ministerial avis).
    """

    constitution = "constitution"
    code = "code"
    loi = "loi"
    decret = "decret"
    arrete = "arrete"
    circulaire = "circulaire"
    convention = "convention"
    ordonnance = "ordonnance"
    communique = "communique"
    avis = "avis"
    other_regulatory = "other_regulatory"


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
    """Legal status of the whole legal text (not the editorial workflow).

    The first three values cover all domestic legislation (lois,
    décrets, arrêtés, codes, constitutions). The treaty-specific
    values track the lifecycle of international agreements, which is
    distinct from domestic abrogation:

      - ``signed``: signature deposited but not yet ratified
      - ``ratified``: ratified by the legislator, not yet promulgated
      - ``denounced``: a party (Haiti or another signatory) has
        formally withdrawn from the treaty

    Treaties that are in_force after ratification + promulgation use
    the same ``in_force`` value as domestic legislation.
    """

    in_force = "in_force"
    abrogated = "abrogated"
    partially_abrogated = "partially_abrogated"
    signed = "signed"
    ratified = "ratified"
    denounced = "denounced"


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
    correspondance = "correspondance"
    promulgation = "promulgation"
    errata = "errata"
    # Deliberation of a constituted body (CPT, Assemblée nationale,
    # Sénat). Distinct from a regulatory act — the resolution itself
    # records the decision; an accompanying ``arrete`` typically
    # executes it. Not in PROMOTABLE_TYPES because resolutions don't
    # need to live in the LegalText corpus on their own.
    resolution = "resolution"
    # Editor-set short annotation or footnote attached to a primary
    # entry (translator's note, transcription gap, deviation from the
    # printed source, etc.). Distinct from ``communique`` (official
    # public notice) and ``correspondance`` (private letter); ``note``
    # is internal editorial commentary that still belongs in the
    # sommaire so readers see why a section reads the way it does.
    note = "note"
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
    """Structural depth of a TOC node, in increasing fineness.

    ``part`` (Partie) was added in 0016 — the 1987 Constitution and
    several historical codes use it above ``book``. Older texts that
    only have Livre / Titre / Chapitre keep working unchanged.
    """

    part = "part"        # Partie — above Livre, used by some constitutions
    book = "book"        # Livre
    title = "title"      # Titre
    chapter = "chapter"  # Chapitre
    section = "section"
    subsection = "subsection"


# ---------------------------------------------------------------------------
# Phase 1 — refactor enums (added 0016+)
# ---------------------------------------------------------------------------


class AuthorityType(str, Enum):
    """Classification of an authority record. Drives rendering ("le Sénat"
    vs. "Mme la Ministre") and aggregation queries ("toutes les autorités
    de type executive_body")."""

    person = "person"
    institution = "institution"
    ministry = "ministry"
    parliamentary_body = "parliamentary_body"
    executive_body = "executive_body"
    collective_body = "collective_body"
    administrative_body = "administrative_body"
    judicial_body = "judicial_body"
    unknown = "unknown"


class BlockKind(str, Enum):
    """Kind of TocNode block.

    ``structural`` nodes carry a ``HeadingLevel`` (part/book/title/...).
    All other kinds describe formal blocks that today live as flat
    columns on LegalText (preamble, visas, considérants, etc.) and will
    be migrated into TocNode rows in Phase 2.
    """

    sovereignty_formula = "sovereignty_formula"   # "Au nom de la République"
    preamble = "preamble"
    visa = "visa"
    considerant = "considerant"
    enacting_formula = "enacting_formula"         # "Décrète :", "Le Corps législatif a voté la loi suivante :"
    structural = "structural"                     # uses `level` for depth
    annex = "annex"
    closing_formula = "closing_formula"
    signature_block = "signature_block"           # pointer block; signers live on legal_signers
    promulgation_block = "promulgation_block"     # pointer block; promulgation lives on promulgations
    prose_body = "prose_body"                     # for communiqués/avis: a single block of free prose


class ContentSource(str, Enum):
    """Provenance of a TocNode body or an ArticleVersion content_ast."""

    parser = "parser"
    editor = "editor"
    import_draft = "import_draft"
    amendment = "amendment"
    machine_translation = "machine_translation"
    ocr = "ocr"


class ChangeKind(str, Enum):
    """Kind of legal change recorded in LegalChange."""

    amend = "amend"
    abrogate = "abrogate"
    replace = "replace"
    add = "add"
    renumber = "renumber"
    suspend = "suspend"
    restore = "restore"


class ImportJobStatus(str, Enum):
    """Lifecycle of an ImportJob row.

    running → parsed → reviewing → committed
                                ↘ rejected
                                ↘ failed
    """

    running = "running"
    parsed = "parsed"
    reviewing = "reviewing"
    committed = "committed"
    rejected = "rejected"
    failed = "failed"


class ParserProfile(str, Enum):
    """Which parser strategy to run on a normalised document."""

    generic = "generic"
    constitution = "constitution"
    code = "code"
    loi = "loi"
    executive_act = "executive_act"
    circulaire = "circulaire"
    communique = "communique"
    traite = "traite"


class Language(str, Enum):
    """Languages supported by the corpus. Add to this enum + migration
    when a third language becomes a real requirement."""

    fr = "fr"
    ht = "ht"


class TranslatableEntity(str, Enum):
    """What kind of entity a Translation row points at. Stored
    alongside the entity_id; not a real FK (PostgreSQL doesn't do
    polymorphic FKs cleanly, and the cardinality stays small)."""

    legal_text = "legal_text"
    article_version = "article_version"
    toc_node = "toc_node"
    promulgation = "promulgation"


class TranslatorKind(str, Enum):
    human = "human"
    machine = "machine"
    mixed = "mixed"


class SigningCapacity(str, Enum):
    """How a `LegalSigner` is signing — the legal *kind* of signature.

    Distinguishes the role-on-the-page from the role-in-government,
    which `function_fr` already carries (e.g. "Sénateur", "Ministre de
    la Justice"). Two people with `function_fr = 'Ministre'` can be
    signing in different capacities: one *authoring* the arrêté they
    co-issued, another *countersigning* a presidential décret because
    its execution falls in their portfolio.
    """

    authoring = "authoring"           # signs as the issuing authority itself
    presiding = "presiding"           # bureau président of a voting chamber
    attesting = "attesting"           # bureau secrétaire — attests the vote
    promulgating = "promulgating"     # Pres signs a loi to make it enforceable, didn't author it
    countersigning = "countersigning" # ministers contresignataires on a presidential décret
    other = "other"


class SignatoryChamber(str, Enum):
    """Which body the signer belongs to. Drives the SignatureGrid grouping
    on the frontend (Sénat block, Chambre block, Executive block, joint
    ministerial block)."""

    senat = "senat"
    chambre = "chambre"
    executive = "executive"
    ministerial = "ministerial"


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
