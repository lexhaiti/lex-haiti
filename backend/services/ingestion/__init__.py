"""Ingestion bounded context.

Owns the OCR pipeline, source parsing, and candidate management for
all document types (Moniteur, standalone laws, Cassation decisions).

The ingestion context reads from and writes to corpus models (LegalText,
Article, etc.) but the reverse dependency is forbidden: corpus must not
import from ingestion.
"""
