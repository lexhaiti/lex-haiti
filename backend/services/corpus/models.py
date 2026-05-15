"""SQLAlchemy ORM models for the public_corpus schema.

These are infrastructure detail of the corpus service. Repositories return
Pydantic schemas (see packages/schemas/), not raw ORM rows — this preserves
the layered architecture from ADR-001.

The schema (DDL — tables, enums, indexes, generated columns, FKs) is owned
by Alembic migrations under backend/migrations/. These ORM models mirror that
schema so repositories can read/write rows. Generated columns (search_vector_*)
are intentionally not modeled here — the repository uses raw SQL for FTS.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)

from schemas.enums import (
    ArticleStatus,
    AuthorityType,
    BlockKind,
    ChangeKind,
    CitationNodeType,
    CitationRelation,
    CodeSubcategory,
    ContentSource,
    CourtType,
    EditorialStatus,
    ExtractionMethod,
    HeadingLevel,
    ImportJobStatus,
    Language,
    LegalCategory,
    MoniteurDocumentType,
    LegalTheme,
    MoniteurCandidateStatus,
    MoniteurIssueStatus,
    ParserProfile,
    SignatoryChamber,
    SigningCapacity,
    ThemeSource,
    LegalStatus,
    RawDocumentStatus,
    RawDocumentType,
    RawPageStatus,
    TranslatableEntity,
    TranslatorKind,
)

PUBLIC_CORPUS_SCHEMA = "public_corpus"

# multilingual-e5-large produces 1024-dim vectors
EMBEDDING_DIM = 1024

metadata_obj = MetaData(schema=PUBLIC_CORPUS_SCHEMA)


class Base(DeclarativeBase):
    metadata = metadata_obj


def _enum(py_enum: type, name: str) -> SAEnum:
    """Wrap a Python enum as a Postgres enum in the public_corpus schema.

    create_type=False because the migration creates the types; SQLAlchemy must
    not try to re-create them when reflecting or running tests.
    """
    return SAEnum(
        py_enum,
        name=name,
        schema=PUBLIC_CORPUS_SCHEMA,
        values_callable=lambda x: [e.value for e in x],
        create_type=False,
    )


# ---------------------------------------------------------------------------
# Provenance: raw_documents → raw_pages
# ---------------------------------------------------------------------------


class RawDocument(Base):
    __tablename__ = "raw_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_type: Mapped[RawDocumentType] = mapped_column(
        _enum(RawDocumentType, "raw_document_type"), nullable=False
    )
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(Text)
    sha256_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    mime_type: Mapped[Optional[str]] = mapped_column(Text)
    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    status: Mapped[RawDocumentStatus] = mapped_column(
        _enum(RawDocumentStatus, "raw_document_status"),
        nullable=False,
        default=RawDocumentStatus.pending,
    )

    pages: Mapped[list["RawPage"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
    )


class RawPage(Base):
    __tablename__ = "raw_pages"
    __table_args__ = (
        UniqueConstraint("raw_document_id", "page_number", name="uq_raw_pages_doc_page"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    raw_document_id: Mapped[int] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.raw_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    image_path: Mapped[Optional[str]] = mapped_column(Text)
    ocr_text: Mapped[Optional[str]] = mapped_column(Text)
    ocr_blocks: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    ocr_engine: Mapped[Optional[str]] = mapped_column(Text)
    ocr_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    ocr_status: Mapped[RawPageStatus] = mapped_column(
        _enum(RawPageStatus, "raw_page_status"),
        nullable=False,
        default=RawPageStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    document: Mapped[RawDocument] = relationship(back_populates="pages")


# ---------------------------------------------------------------------------
# Legal text containers: legal_texts → legal_headings (tree) → legal_signers
# ---------------------------------------------------------------------------


class LegalText(Base):
    __tablename__ = "legal_texts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    category: Mapped[LegalCategory] = mapped_column(
        _enum(LegalCategory, "legal_category"), nullable=False, index=True
    )
    code_subcategory: Mapped[Optional[CodeSubcategory]] = mapped_column(
        _enum(CodeSubcategory, "code_subcategory"), index=True
    )
    jurisdiction: Mapped[str] = mapped_column(Text, nullable=False, default="HT")

    title_fr: Mapped[str] = mapped_column(Text, nullable=False)
    title_ht: Mapped[Optional[str]] = mapped_column(Text)
    description_fr: Mapped[Optional[str]] = mapped_column(Text)
    description_ht: Mapped[Optional[str]] = mapped_column(Text)
    preamble_fr: Mapped[Optional[str]] = mapped_column(Text)
    preamble_ht: Mapped[Optional[str]] = mapped_column(Text)
    visas_fr: Mapped[Optional[str]] = mapped_column(Text)
    visas_ht: Mapped[Optional[str]] = mapped_column(Text)
    considerants_fr: Mapped[Optional[str]] = mapped_column(Text)
    considerants_ht: Mapped[Optional[str]] = mapped_column(Text)
    enacting_formula_fr: Mapped[Optional[str]] = mapped_column(Text)
    enacting_formula_ht: Mapped[Optional[str]] = mapped_column(Text)
    # Display alignment for the enacting-formula block on the reader.
    # ``left`` (default) or ``center``. Stored as a short string
    # rather than a Postgres enum so the value set can grow cheaply.
    enacting_formula_align: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="left",
        server_default="left",
    )

    promulgation_date: Mapped[Optional[date]] = mapped_column(Date)
    publication_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    moniteur_ref: Mapped[Optional[str]] = mapped_column(Text)

    # Page-1 official metadata. Populated by the import parser
    # (services/ingestion/header_split.py) when the document carries
    # the standard Haitian legal-act header; editor can correct via the
    # MetadataEditor UI. All three are nullable — old corpus rows
    # predate the columns and many older laws lack the modern header
    # structure entirely.
    official_number: Mapped[Optional[str]] = mapped_column(
        String(64), index=True
    )  # e.g. "CL-007-09-09"
    issuing_authority: Mapped[Optional[str]] = mapped_column(
        Text
    )  # multi-line for joint authorities or CPT
    # Verbatim post-dispositif block (Votée + LIBERTÉ banner + Donné).
    # Stored as raw text; the structured names live in `signers`.
    official_formula: Mapped[Optional[str]] = mapped_column(Text)

    status: Mapped[LegalStatus] = mapped_column(
        _enum(LegalStatus, "legal_status"),
        nullable=False,
        default=LegalStatus.in_force,
        index=True,
    )
    editorial_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
        index=True,
    )

    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.raw_documents.id", ondelete="SET NULL")
    )

    # Phase 1 refactor — authority graph FKs. All three nullable; the
    # Phase 1 backfill script resolves the free-text issuing_authority
    # column into issuing_authority_id where confidence ≥ 0.85, leaves
    # the rest at NULL. Free-text column survives as
    # ``legacy_issuing_authority_text`` for audit during the transition.
    issuing_authority_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )
    adopting_body_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )
    promulgating_authority_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )
    legacy_issuing_authority_text: Mapped[Optional[str]] = mapped_column(Text)

    # Optional FK to the structured Moniteur issue this text was published in.
    # New ingestions populate this; the legacy free-text `moniteur_ref` field
    # above is kept for back-compat with the existing rows.
    moniteur_issue_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_issues.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_legal_texts_moniteur_issue",
        )
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    headings: Mapped[list["LegalHeading"]] = relationship(
        back_populates="legal_text",
        cascade="all, delete-orphan",
        order_by="LegalHeading.position",
    )
    articles: Mapped[list["Article"]] = relationship(
        back_populates="legal_text",
        cascade="all, delete-orphan",
        order_by="Article.position",
        foreign_keys="Article.legal_text_id",
    )
    signers: Mapped[list["LegalSigner"]] = relationship(
        back_populates="legal_text",
        cascade="all, delete-orphan",
        order_by="LegalSigner.position",
    )
    theme_tags: Mapped[list["LegalThemeTag"]] = relationship(
        back_populates="legal_text",
        cascade="all, delete-orphan",
    )
    moniteur_issue: Mapped[Optional["MoniteurIssue"]] = relationship(
        foreign_keys=[moniteur_issue_id],
        lazy="joined",
    )

    # FK to the Kreyòl supplement issue (e.g. N° 36-A for the Constitution).
    # NULL for most laws; set only when an official Kreyòl version was
    # published in a distinct Moniteur issue.
    moniteur_issue_id_ht: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_issues.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_legal_texts_moniteur_issue_ht",
        )
    )
    moniteur_issue_ht: Mapped[Optional["MoniteurIssue"]] = relationship(
        foreign_keys=[moniteur_issue_id_ht],
        lazy="joined",
    )


class LegalThemeTag(Base):
    """Many-to-many tag mapping a `LegalText` to a `LegalTheme`.

    A text may carry multiple themes (Code Civil → famille + successions +
    sociétés). Tags are produced either by an editor (`source = editor`) or
    by the keyword auto-suggester (`source = auto`); the public API can
    filter by source for stricter views. `confidence` is only meaningful for
    `source = auto` rows — 0.0–1.0 weight from the suggester.
    """

    __tablename__ = "legal_theme_tags"
    __table_args__ = (
        UniqueConstraint(
            "legal_text_id", "theme", name="uq_legal_theme_tags_text_theme"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    theme: Mapped[LegalTheme] = mapped_column(
        _enum(LegalTheme, "legal_theme"), nullable=False, index=True
    )
    source: Mapped[ThemeSource] = mapped_column(
        _enum(ThemeSource, "theme_source"),
        nullable=False,
        default=ThemeSource.auto,
    )
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    legal_text: Mapped["LegalText"] = relationship(back_populates="theme_tags")


class LegalHeading(Base):
    """TOC node — Livre / Titre / Chapitre / Section / Subsection.

    Self-referential tree; root nodes have parent_id=NULL.
    """

    __tablename__ = "legal_headings"
    __table_args__ = (
        UniqueConstraint("legal_text_id", "key", name="uq_legal_headings_text_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_headings.id", ondelete="CASCADE"),
        index=True,
    )
    level: Mapped[HeadingLevel] = mapped_column(
        _enum(HeadingLevel, "heading_level"), nullable=False
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)

    number: Mapped[Optional[str]] = mapped_column(Text)
    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    title_ht: Mapped[Optional[str]] = mapped_column(Text)
    content_fr: Mapped[Optional[str]] = mapped_column(Text)
    content_ht: Mapped[Optional[str]] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    legal_text: Mapped[LegalText] = relationship(back_populates="headings")

    parent: Mapped[Optional["LegalHeading"]] = relationship(
        back_populates="children",
        remote_side="LegalHeading.id",
    )
    children: Mapped[list["LegalHeading"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="LegalHeading.position",
    )


class LegalSigner(Base):
    """A person who signs a legal text.

    `function_fr` carries the human-readable position ("Sénateur",
    "Ministre de la Justice", "Président Provisoire de la République").
    `signing_capacity` carries the legal *kind* of signature — distinct
    from the position. See `SigningCapacity` enum for the rationale.

    `chamber` groups the SignatureGrid on the frontend so Sénat
    bureau members render together, Chambre bureau separately, and
    executive (President / ministers) in their own block.

    `signed_at` is per-signer because the two chambers vote on
    different dates and the President signs months/years later — the
    SignatureGrid renders each date next to the signer.
    """

    __tablename__ = "legal_signers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    function_fr: Mapped[str] = mapped_column(Text, nullable=False)
    function_ht: Mapped[Optional[str]] = mapped_column(Text)
    signing_capacity: Mapped[SigningCapacity] = mapped_column(
        _enum(SigningCapacity, "signing_capacity"),
        nullable=False,
        default=SigningCapacity.other,
    )
    chamber: Mapped[Optional[SignatoryChamber]] = mapped_column(
        _enum(SignatoryChamber, "signatory_chamber"),
    )
    signed_at: Mapped[Optional[date]] = mapped_column(Date)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Optional link to the normalised Authority record (Phase 1). When
    # set, the public renderer can hyperlink the signer's function to
    # the authority's page.
    authority_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )

    legal_text: Mapped[LegalText] = relationship(back_populates="signers")


# ---------------------------------------------------------------------------
# Articles + ArticleVersions (the versioned content)
# ---------------------------------------------------------------------------


class Article(Base):
    """Stable atomic unit of a LegalText.

    The article ID and slug are stable forever. The actual text lives in
    ArticleVersion rows; current_version_id is a denormalized pointer to the
    one currently in force, for fast reads.
    """

    __tablename__ = "articles"
    # Note: NO uniqueness on (legal_text_id, number). Some historical
    # constitutions reset article numbering per chapter — same number can
    # legitimately appear multiple times. See migration 0003. The slug
    # uniqueness is what enforces URL stability.
    __table_args__ = (
        UniqueConstraint("legal_text_id", "slug", name="uq_articles_text_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    heading_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_headings.id", ondelete="SET NULL"),
        index=True,
    )
    number: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False)

    # Denormalized pointer to the in-force version (FK loop with article_versions
    # — handled in migration with ALTER TABLE after both tables exist).
    current_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.article_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_articles_current_version",
        ),
    )

    domain_tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    legal_text: Mapped[LegalText] = relationship(
        back_populates="articles", foreign_keys=[legal_text_id]
    )
    heading: Mapped[Optional[LegalHeading]] = relationship(foreign_keys=[heading_id])
    versions: Mapped[list["ArticleVersion"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        order_by="ArticleVersion.version_number",
        foreign_keys="ArticleVersion.article_id",
    )
    current_version: Mapped[Optional["ArticleVersion"]] = relationship(
        foreign_keys=[current_version_id],
        post_update=True,
    )


class ArticleVersion(Base):
    """The actual bilingual text of an article, valid for a given period.

    search_vector_fr / search_vector_ht are generated columns at the DB level
    (see migration). They are not modeled here; the repository uses raw SQL
    for FTS.
    """

    __tablename__ = "article_versions"
    __table_args__ = (
        UniqueConstraint("article_id", "version_number", name="uq_article_versions_article_n"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    article_id: Mapped[int] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.articles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    title_ht: Mapped[Optional[str]] = mapped_column(Text)
    text_fr: Mapped[str] = mapped_column(Text, nullable=False)
    text_ht: Mapped[Optional[str]] = mapped_column(Text)

    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)

    # Per-article legal status (Légifrance-style). Defaults to in_force on
    # ingestion; editors flip to abrogated/suspended/etc. as the corpus is
    # cleaned. The current_version's status is what the public site shows.
    status: Mapped[ArticleStatus] = mapped_column(
        _enum(ArticleStatus, "article_status"),
        nullable=False,
        default=ArticleStatus.in_force,
        server_default=ArticleStatus.in_force.value,
        index=True,
    )

    # When `status == transferred`, points at the article that supersedes
    # this one. Lets us render a "renumbered to Article X" stub instead of
    # the abrogated body. Cross-text transfers are allowed.
    transferred_to_article_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.articles.id", ondelete="SET NULL")
    )

    source_amendment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="SET NULL")
    )
    # Read-only relationship — lets the API embed the amending law's
    # slug + title alongside an article version without an N+1 lookup.
    # ``foreign_keys`` is required because ArticleVersion already has
    # an unrelated FK to legal_texts via ``transferred_to_article_id``
    # walking through articles (so SA can't infer the join).
    source_amendment: Mapped[Optional["LegalText"]] = relationship(
        "LegalText",
        foreign_keys=[source_amendment_id],
        # Lazy-load on demand. Bulk read paths (LegalTextRead with
        # articles embedded) opt-in to ``selectinload`` so the embed
        # builder doesn't fan out N+1.
    )

    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    editorial_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
    )

    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))

    # Structured article-body AST (Phase 4 of the refactor — see ADR). When
    # populated, the rich-text renderer prefers it over text_fr/_ht. The
    # flat text columns remain the source of truth until the AST is filled
    # in by the parser or rich-text editor; once an AST exists, text_fr is
    # a regenerated mirror produced by the deterministic flattener.
    content_ast_fr: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    content_ast_ht: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    article: Mapped[Article] = relationship(
        back_populates="versions", foreign_keys=[article_id]
    )


# ---------------------------------------------------------------------------
# Decisions (jurisprudence)
# ---------------------------------------------------------------------------


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    court: Mapped[CourtType] = mapped_column(
        _enum(CourtType, "court_type"), nullable=False, index=True
    )
    chamber: Mapped[Optional[str]] = mapped_column(Text)
    formation: Mapped[Optional[str]] = mapped_column(Text)
    case_number: Mapped[Optional[str]] = mapped_column(Text)
    decision_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    parties_anonymized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    summary_ht: Mapped[Optional[str]] = mapped_column(Text)
    headnotes_fr: Mapped[Optional[str]] = mapped_column(Text)
    headnotes_ht: Mapped[Optional[str]] = mapped_column(Text)
    full_text_fr: Mapped[Optional[str]] = mapped_column(Text)
    full_text_ht: Mapped[Optional[str]] = mapped_column(Text)
    outcome: Mapped[Optional[str]] = mapped_column(Text)

    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(f"{PUBLIC_CORPUS_SCHEMA}.raw_documents.id", ondelete="SET NULL")
    )

    editorial_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
        index=True,
    )

    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Citations (the legal graph) — polymorphic edges
# ---------------------------------------------------------------------------


class Citation(Base):
    """Polymorphic edge between two legal artifacts.

    (source_node_type, source_node_id) → (target_node_type, target_node_id)

    Polymorphic FKs are not enforced by Postgres; the application layer is
    responsible for integrity. Accepted at our scale because the alternative
    (N specialized join tables) gets ugly fast.
    """

    __tablename__ = "citations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_node_type: Mapped[CitationNodeType] = mapped_column(
        _enum(CitationNodeType, "citation_node_type"), nullable=False
    )
    source_node_id: Mapped[int] = mapped_column(Integer, nullable=False)
    target_node_type: Mapped[CitationNodeType] = mapped_column(
        _enum(CitationNodeType, "citation_node_type"), nullable=False
    )
    target_node_id: Mapped[int] = mapped_column(Integer, nullable=False)
    relation: Mapped[CitationRelation] = mapped_column(
        _enum(CitationRelation, "citation_relation"), nullable=False, index=True
    )

    source_paragraph: Mapped[Optional[str]] = mapped_column(Text)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    extraction_method: Mapped[Optional[ExtractionMethod]] = mapped_column(
        _enum(ExtractionMethod, "extraction_method")
    )
    validated_by: Mapped[Optional[str]] = mapped_column(Text)
    editorial_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ---------------------------------------------------------------------------
# Editorial actions (audit log)
# ---------------------------------------------------------------------------


class EditorialAction(Base):
    __tablename__ = "editorial_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    # FK to auth.users(id) is enforced at the DB level (see migration 0002).
    # We don't declare it here as a SQLAlchemy ForeignKey because auth tables
    # live on a separate MetaData, and cross-MetaData FK resolution doesn't
    # work in SQLAlchemy. Read this column as a plain int; load the User
    # via AuthRepository when needed.
    actor_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    diff: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ---------------------------------------------------------------------------
# Moniteur ingestion pipeline (option B) — see migration 0006
# ---------------------------------------------------------------------------


class MoniteurIssue(Base):
    """A single Moniteur publication (issue number + date + uploaded PDF).

    Replaces the free-text `LegalText.moniteur_ref` with a real entity.
    Drives the `MoniteurRecentSection` on the homepage and the `/moniteur`
    archive page once published.
    """

    __tablename__ = "moniteur_issues"
    __table_args__ = (
        UniqueConstraint("year", "number", name="uq_moniteur_issues_year_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    publication_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    edition_label: Mapped[Optional[str]] = mapped_column(Text)
    director: Mapped[Optional[str]] = mapped_column(
        Text, doc="Director of Le Moniteur for this issue"
    )
    # Director's institutional title — what appears in parens after the
    # name on the cover page (e.g. "Major Forces Armées d'Haïti",
    # "Secrétaire d'État à la Communication"). Optional: not every issue
    # carries one, and older issues sometimes only have the name.
    director_role: Mapped[Optional[str]] = mapped_column(
        Text, doc="Director's institutional title (role in parens after name)"
    )

    # Where the source PDF lives. Local path during dev; should become an
    # s3:// URL when MinIO/B2 wiring is added.
    file_url: Mapped[Optional[str]] = mapped_column(Text)
    # Pre-transcribed version of the file (clean PDF/DOCX). When present,
    # the parse pipeline reads text from this instead of running OCR.
    transcript_url: Mapped[Optional[str]] = mapped_column(Text)
    page_count: Mapped[Optional[int]] = mapped_column(Integer)

    processing_status: Mapped[MoniteurIssueStatus] = mapped_column(
        _enum(MoniteurIssueStatus, "moniteur_issue_status"),
        nullable=False,
        default=MoniteurIssueStatus.uploaded,
        index=True,
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text)

    uploaded_by: Mapped[Optional[int]] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    parsed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    entries: Mapped[list["MoniteurEntry"]] = relationship(
        back_populates="issue",
        cascade="all, delete-orphan",
        order_by="MoniteurEntry.position",
        # MoniteurEntry has two FKs to MoniteurIssue (issue_id and the
        # translation_issue_id companion pointer); the sommaire-style
        # `entries` collection follows the original-publication FK only.
        foreign_keys="[MoniteurEntry.issue_id]",
    )


class MoniteurEntry(Base):
    """One entry (document) inside a Moniteur issue.

    Produced by the heuristic parser after OCR. An editor reviews each
    entry on the `/editorial/moniteur/[id]/review` page; accepting one
    promotes it to a real `LegalText` (and stamps `promoted_legal_text_id`
    so we can track the ingestion provenance).
    """

    __tablename__ = "moniteur_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_issues.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # What the parser thinks this candidate is. All optional — review can
    # correct any of them.
    detected_category: Mapped[Optional[MoniteurDocumentType]] = mapped_column(
        _enum(MoniteurDocumentType, "moniteur_document_type")
    )
    detected_title: Mapped[Optional[str]] = mapped_column(Text)
    display_title: Mapped[Optional[str]] = mapped_column(Text)
    detected_number: Mapped[Optional[str]] = mapped_column(Text)
    detected_date: Mapped[Optional[date]] = mapped_column(Date)

    summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    summary_ht: Mapped[Optional[str]] = mapped_column(Text)

    # Self-FK: promulgation letters / cover pages belong to their parent entry
    parent_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_entries.id",
            ondelete="SET NULL",
        ),
        index=True,
    )

    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2))
    page_from: Mapped[Optional[int]] = mapped_column(Integer)
    page_to: Mapped[Optional[int]] = mapped_column(Integer)

    # Which parser profile to run on this entry's raw_text. NULL means
    # "auto-pick from detected_category". The editor sets this explicitly
    # when the classification is off (e.g. a décret that's structurally
    # closer to a code, or an arrêté that should be treated as a
    # circulaire). Persisted so re-parses stay deterministic.
    parser_profile: Mapped[Optional[ParserProfile]] = mapped_column(
        _enum(ParserProfile, "parser_profile")
    )
    # Full typed parser output (ParserOutput serialised) — TOC nodes,
    # articles, signatures, parser metadata, warnings. Populated at parse
    # time by the typ-specific parser, consumed by the editor's review
    # preview and (later) by promote_entry as the source of truth instead
    # of re-running the legacy parse_document on raw_text.
    content_ast: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)

    review_status: Mapped[MoniteurCandidateStatus] = mapped_column(
        _enum(MoniteurCandidateStatus, "moniteur_candidate_status"),
        nullable=False,
        default=MoniteurCandidateStatus.pending,
        index=True,
    )
    promoted_legal_text_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="SET NULL"
        )
    )
    review_notes: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Translation source — when the Kreyòl version of this content is
    # published in a companion Moniteur issue (e.g. 36 → 36-a), the editor
    # attaches those pointers here instead of re-ingesting that issue's
    # sommaire as duplicate candidates. The actual translation content
    # lives on the promoted legal_text's article_versions.text_ht.
    translation_issue_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_issues.id", ondelete="SET NULL"
        ),
        index=True,
    )
    translation_detected_number: Mapped[Optional[str]] = mapped_column(Text)
    translation_title_ht: Mapped[Optional[str]] = mapped_column(Text)
    translation_page_from: Mapped[Optional[int]] = mapped_column(Integer)
    translation_page_to: Mapped[Optional[int]] = mapped_column(Integer)
    translation_summary_ht: Mapped[Optional[str]] = mapped_column(Text)
    # Side documents that come with the translation — e.g.
    # [{"kind": "promulgation_letter", "pages": "1-3"}, ...]
    companion_documents: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    issue: Mapped[MoniteurIssue] = relationship(
        back_populates="entries", foreign_keys=[issue_id]
    )
    translation_issue: Mapped[Optional[MoniteurIssue]] = relationship(
        foreign_keys=[translation_issue_id]
    )
    parent_entry: Mapped[Optional["MoniteurEntry"]] = relationship(
        remote_side="MoniteurEntry.id",
        foreign_keys=[parent_entry_id],
    )
    children: Mapped[list["MoniteurEntry"]] = relationship(
        back_populates="parent_entry",
        foreign_keys="MoniteurEntry.parent_entry_id",
    )
    # ↗ to the LegalText that was created when an editor accepted this
    # candidate. Nullable — pending / rejected candidates have no draft yet.
    # Lets the review page link straight to /loi/{slug} for inspection.
    promoted_legal_text: Mapped[Optional["LegalText"]] = relationship(
        foreign_keys=[promoted_legal_text_id],
    )


class Promulgation(Base):
    """The executive act ordering a law to be sealed, printed, published,
    and executed.

    Appears in *Le Moniteur* after the law text but is neither a sommaire
    entry nor part of the law body itself.  Only laws adopted by Parliament
    require promulgation; décrets and arrêtés do not.

    See ADR-002 for the full rationale.
    """

    __tablename__ = "promulgations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    moniteur_issue_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.moniteur_issues.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    legal_text_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="SET NULL"
        ),
        unique=True,  # one promulgation per law
    )
    content_fr: Mapped[str] = mapped_column(Text, nullable=False)
    content_ht: Mapped[Optional[str]] = mapped_column(Text)
    promulgation_date: Mapped[Optional[date]] = mapped_column(Date)
    location: Mapped[Optional[str]] = mapped_column(Text)
    page_from: Mapped[Optional[int]] = mapped_column(Integer)
    page_to: Mapped[Optional[int]] = mapped_column(Integer)
    # Phase 1: link the promulgating authority directly (the President /
    # Conseil des Ministres etc.). Distinct from the signers (who may
    # countersign).
    promulgating_authority_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    issue: Mapped["MoniteurIssue"] = relationship()
    legal_text: Mapped[Optional["LegalText"]] = relationship()
    signers: Mapped[list["PromulgationSigner"]] = relationship(
        back_populates="promulgation",
        cascade="all, delete-orphan",
        order_by="PromulgationSigner.position",
    )


class PromulgationSigner(Base):
    """A signatory of a promulgation act — the head of state and/or ministers
    who countersign the executive order."""

    __tablename__ = "promulgation_signers"
    __table_args__ = (
        UniqueConstraint("promulgation_id", "position", name="uq_promulgation_signer_pos"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    promulgation_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.promulgations.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    function_fr: Mapped[Optional[str]] = mapped_column(Text)
    function_ht: Mapped[Optional[str]] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    authority_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )

    promulgation: Mapped["Promulgation"] = relationship(back_populates="signers")


# ---------------------------------------------------------------------------
# Phase 1 refactor — additive entities. See migration 0016 and the
# refactor proposal in docs/. These models map to the new tables but do
# NOT yet replace anything; old shapes keep working until Phase 2.
# ---------------------------------------------------------------------------


class Authority(Base):
    """A legal or administrative entity that issues, adopts, promulgates,
    or signs legal acts.

    Self-referential tree (parent_id) so we can model hierarchies like
    Ministère de la Justice ⊃ Direction des Affaires Civiles. The
    authority_type drives rendering and aggregation queries.
    """

    __tablename__ = "authorities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    name_fr: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name_ht: Mapped[Optional[str]] = mapped_column(String(255))
    short_name: Mapped[Optional[str]] = mapped_column(String(100))
    authority_type: Mapped[AuthorityType] = mapped_column(
        _enum(AuthorityType, "authority_type"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="SET NULL"
        ),
        index=True,
    )
    founded_on: Mapped[Optional[date]] = mapped_column(Date)
    dissolved_on: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    parent: Mapped[Optional["Authority"]] = relationship(
        back_populates="children", remote_side="Authority.id"
    )
    children: Mapped[list["Authority"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    role_assignments: Mapped[list["AuthorityRoleAssignment"]] = relationship(
        back_populates="authority",
        cascade="all, delete-orphan",
        order_by="AuthorityRoleAssignment.started_on",
    )


class AuthorityRoleAssignment(Base):
    """Who occupied an authority's leadership role between which dates.

    Lets us answer "who was Président de la République on 1987-04-28?"
    without hard-coding it on every signer row. Multiple assignments
    over time per authority.
    """

    __tablename__ = "authority_role_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    authority_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.authorities.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    person_name: Mapped[str] = mapped_column(Text, nullable=False)
    role_title_fr: Mapped[str] = mapped_column(Text, nullable=False)
    role_title_ht: Mapped[Optional[str]] = mapped_column(Text)
    started_on: Mapped[Optional[date]] = mapped_column(Date)
    ended_on: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    authority: Mapped[Authority] = relationship(back_populates="role_assignments")


class TocNode(Base):
    """Unified TOC + formal-block tree node.

    Replaces the flat ``preamble_fr``/``visas_fr``/``considerants_fr``/
    ``enacting_formula_fr`` columns on LegalText (Phase 2 migrates them
    in). For ``block_kind='structural'`` rows, ``level`` is set to one
    of the HeadingLevel values; for other kinds, ``level`` is null and
    ``body_fr``/``body_ht`` carry the block text.

    Articles continue to link via the existing ``Article.heading_id``
    column to ``legal_headings`` during the transition. Phase 2 flips
    that FK to ``toc_nodes``.
    """

    __tablename__ = "toc_nodes"
    __table_args__ = (
        UniqueConstraint("legal_text_id", "key", name="uq_toc_nodes_text_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.toc_nodes.id", ondelete="CASCADE"
        ),
        index=True,
    )
    block_kind: Mapped[BlockKind] = mapped_column(
        _enum(BlockKind, "block_kind"), nullable=False
    )
    level: Mapped[Optional[HeadingLevel]] = mapped_column(
        _enum(HeadingLevel, "heading_level"),
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)
    number: Mapped[Optional[str]] = mapped_column(Text)
    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    title_ht: Mapped[Optional[str]] = mapped_column(Text)
    body_fr: Mapped[Optional[str]] = mapped_column(Text)
    body_ht: Mapped[Optional[str]] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[ContentSource] = mapped_column(
        _enum(ContentSource, "content_source"),
        nullable=False,
        default=ContentSource.editor,
    )
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    parent: Mapped[Optional["TocNode"]] = relationship(
        back_populates="children", remote_side="TocNode.id"
    )
    children: Mapped[list["TocNode"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="TocNode.position",
    )


class LegalTextBlockVersion(Base):
    """Versioned content of a formal block (preamble / visas /
    considérants / enacting formula) on a legal text.

    Parallels ``ArticleVersion`` for the four flat columns that today
    live on ``LegalText``. The text's columns stay in place as the
    denormalised "current" content (so the public read path stays
    unchanged); each amendment writes a new row here AND updates the
    column, in one transaction.

    ``block_kind`` is restricted (by convention; the enum allows more
    values for the TocNode usage) to: preamble, visa, considerant,
    enacting_formula.
    """

    __tablename__ = "legal_text_block_versions"
    __table_args__ = (
        UniqueConstraint(
            "legal_text_id",
            "block_kind",
            "version_number",
            name="uq_block_versions_text_kind_n",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_text_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    block_kind: Mapped[BlockKind] = mapped_column(
        _enum(BlockKind, "block_kind"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    text_fr: Mapped[Optional[str]] = mapped_column(Text)
    text_ht: Mapped[Optional[str]] = mapped_column(Text)
    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    source_amendment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="SET NULL"
        )
    )
    # Read-only relationship for the API embed — mirrors the one on
    # ArticleVersion. Bulk read paths opt-in via selectinload so the
    # "Modifié par X" line on the formal-block accordion comes back
    # without N+1.
    source_amendment: Mapped[Optional["LegalText"]] = relationship(
        "LegalText",
        foreign_keys=[source_amendment_id],
    )
    editorial_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def source_amendment_slug(self) -> Optional[str]:
        """Convenience accessor used by ``BlockVersionRead`` so the
        API embeds the amending law's slug without a separate lookup.
        Returns ``None`` when ``source_amendment`` isn't eager-loaded
        or no amending text is set."""
        if self.source_amendment_id is None:
            return None
        try:
            return self.source_amendment.slug if self.source_amendment else None
        except Exception:
            return None

    @property
    def source_amendment_title_fr(self) -> Optional[str]:
        if self.source_amendment_id is None:
            return None
        try:
            return self.source_amendment.title_fr if self.source_amendment else None
        except Exception:
            return None


class LegalChange(Base):
    """Explicit graph row: this amending act changed something in this
    amended act.

    Replaces the magic ``article_versions.source_amendment_id`` with a
    typed table that supports bidirectional graph queries:
    - all laws amended by X
    - all amending acts that touched article Y
    - article history timeline

    Three target shapes share this table — the populated FK indicates
    which one:
    - ``amended_article_id`` + ``new_version_id`` for article edits
    - ``amended_block_kind`` + ``new_block_version_id`` for formal-block
      edits (preamble / visas / considérants / enacting formula)
    - neither set for whole-text events (e.g. "abrogé en bloc")
    """

    __tablename__ = "legal_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amending_text_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    amended_text_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    amended_article_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.articles.id", ondelete="CASCADE"
        ),
        index=True,
    )
    new_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.article_versions.id", ondelete="SET NULL"
        ),
    )
    amended_block_kind: Mapped[Optional[BlockKind]] = mapped_column(
        _enum(BlockKind, "block_kind")
    )
    new_block_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_text_block_versions.id",
            ondelete="SET NULL",
        ),
    )
    change_kind: Mapped[ChangeKind] = mapped_column(
        _enum(ChangeKind, "change_kind"), nullable=False, index=True
    )
    effective_on: Mapped[Optional[date]] = mapped_column(Date)
    text_fr: Mapped[Optional[str]] = mapped_column(Text)
    text_ht: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ImportJob(Base):
    """One execution of the parser pipeline.

    Persistent (not in-memory) so the editor can review, re-run, compare
    runs, or roll back. Joined to RawDocument for traceability, and to
    LegalText once the editor commits the draft.
    """

    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.raw_documents.id", ondelete="SET NULL"
        ),
        index=True,
    )
    target_legal_text_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.legal_texts.id", ondelete="SET NULL"
        ),
        index=True,
    )
    parser_profile: Mapped[ParserProfile] = mapped_column(
        _enum(ParserProfile, "parser_profile"), nullable=False
    )
    classifier_decision: Mapped[Optional[LegalCategory]] = mapped_column(
        _enum(LegalCategory, "legal_category"),
    )
    status: Mapped[ImportJobStatus] = mapped_column(
        _enum(ImportJobStatus, "import_job_status"),
        nullable=False,
        default=ImportJobStatus.running,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error: Mapped[Optional[str]] = mapped_column(Text)
    config: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_by: Mapped[Optional[int]] = mapped_column(Integer)

    drafts: Mapped[list["ImportDraft"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ImportDraft.created_at",
    )


class ImportDraft(Base):
    """Structured parser output for one ImportJob, persisted as JSONB
    until the editor commits it into live tables."""

    __tablename__ = "import_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_job_id: Mapped[int] = mapped_column(
        ForeignKey(
            f"{PUBLIC_CORPUS_SCHEMA}.import_jobs.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    title_ht: Mapped[Optional[str]] = mapped_column(Text)
    category_guess: Mapped[Optional[LegalCategory]] = mapped_column(
        _enum(LegalCategory, "legal_category"),
    )
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    toc_json: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)
    articles_json: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)
    promulgation_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    signatures_json: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)
    warnings: Mapped[Optional[list[str]]] = mapped_column(JSONB)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    job: Mapped[ImportJob] = relationship(back_populates="drafts")


class Translation(Base):
    """Audit + provenance row for a translation.

    Doesn't store the translated text — that lives on the target
    entity's ``*_ht`` columns. Stores who/when/how-translated and the
    review state of the translation. The (entity_type, entity_id)
    discriminator is enforced at the service layer, not by FK.
    """

    __tablename__ = "translations"
    __table_args__ = (
        UniqueConstraint(
            "entity_type", "entity_id", "language",
            name="uq_translations_entity_language",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[TranslatableEntity] = mapped_column(
        _enum(TranslatableEntity, "translatable_entity"), nullable=False
    )
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[Language] = mapped_column(
        _enum(Language, "language"), nullable=False
    )
    source_version_id: Mapped[Optional[int]] = mapped_column(Integer)
    translator_kind: Mapped[TranslatorKind] = mapped_column(
        _enum(TranslatorKind, "translator_kind"), nullable=False
    )
    translator_id: Mapped[Optional[int]] = mapped_column(Integer)
    machine_engine: Mapped[Optional[str]] = mapped_column(Text)
    translated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    review_status: Mapped[EditorialStatus] = mapped_column(
        _enum(EditorialStatus, "editorial_status"),
        nullable=False,
        default=EditorialStatus.draft,
        index=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


__all__ = [
    "Base",
    "PUBLIC_CORPUS_SCHEMA",
    "EMBEDDING_DIM",
    "RawDocument",
    "RawPage",
    "LegalText",
    "LegalHeading",
    "LegalSigner",
    "Article",
    "ArticleVersion",
    "Decision",
    "Citation",
    "EditorialAction",
    "LegalThemeTag",
    "MoniteurIssue",
    "MoniteurEntry",
    "Promulgation",
    "PromulgationSigner",
]
