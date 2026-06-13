from dataclasses import dataclass
import logging
import re
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    Document,
    DocumentChunk,
    DocumentStatus,
    ProcessingJob,
    ProcessingJobStatus,
)
from app.models.mixins import utc_now
from app.services.vector import VectorService

logger = logging.getLogger(__name__)
DEFAULT_CHUNK_TARGET_TOKENS = 1000
DEFAULT_CHUNK_OVERLAP_TOKENS = 150


class NoExtractableTextError(RuntimeError):
    pass


class MaxPagesExceededError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


class PdfTextExtractor:
    def __init__(self, storage_service=None):
        self.storage_service = storage_service

    def extract_pages(self, document: Document) -> list[ExtractedPage]:
        if self.storage_service is None:
            return []

        import fitz

        pdf_bytes = self.storage_service.download_pdf(document)
        if not pdf_bytes:
            return []

        pages: list[ExtractedPage] = []
        with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
            document.page_count = pdf.page_count
            for index, page in enumerate(pdf, start=1):
                pages.append(ExtractedPage(page_number=index, text=page.get_text("text")))
        return pages


def _text_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def chunk_pages(
    document: Document,
    pages: list[ExtractedPage],
    *,
    target_tokens: int = DEFAULT_CHUNK_TARGET_TOKENS,
    overlap_tokens: int = DEFAULT_CHUNK_OVERLAP_TOKENS,
) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    chunk_index = 0
    for page in pages:
        tokens = _text_tokens(page.text)
        if not tokens:
            continue

        start = 0
        step = max(1, target_tokens - overlap_tokens)
        while start < len(tokens):
            window = tokens[start : start + target_tokens]
            text = " ".join(window)
            chunks.append(
                DocumentChunk(
                    user_id=document.user_id,
                    document_id=document.id,
                    chunk_index=chunk_index,
                    page_start=page.page_number,
                    page_end=page.page_number,
                    text=text,
                    text_excerpt=text[:500],
                    token_count=len(window),
                    pinecone_vector_id=f"doc_{document.id}_chunk_{chunk_index}",
                )
            )
            chunk_index += 1
            if start + target_tokens >= len(tokens):
                break
            start += step
    return chunks


def _latest_job(document: Document) -> ProcessingJob:
    if not document.processing_jobs:
        raise RuntimeError("document has no processing job")
    return document.processing_jobs[-1]


def _fail_no_text(db: Session, document: Document, job: ProcessingJob) -> None:
    message = "This PDF appears to be scanned or image-based. Phase 1 supports text-based PDFs only."
    document.status = DocumentStatus.FAILED
    document.failure_code = "no_extractable_text"
    document.failure_message = message
    job.status = ProcessingJobStatus.FAILED
    job.current_step = "failed"
    job.error_code = "no_extractable_text"
    job.error_message = message
    job.finished_at = utc_now()
    db.commit()


def _fail_max_pages(db: Session, document: Document, job: ProcessingJob, page_count: int, max_pdf_pages: int) -> None:
    message = f"PDF has {page_count} pages, which exceeds the configured limit of {max_pdf_pages} pages."
    document.status = DocumentStatus.FAILED
    document.failure_code = "max_pdf_pages_exceeded"
    document.failure_message = message
    job.status = ProcessingJobStatus.FAILED
    job.current_step = "failed"
    job.error_code = "max_pdf_pages_exceeded"
    job.error_message = message
    job.finished_at = utc_now()
    db.commit()


def process_document(
    db: Session,
    document_id: UUID,
    *,
    extractor: PdfTextExtractor,
    vector_service: VectorService,
    max_pdf_pages: int | None = None,
) -> None:
    document = db.get(Document, document_id)
    if document is None:
        raise ValueError("document not found")

    job = _latest_job(document)
    job.status = ProcessingJobStatus.RUNNING
    job.started_at = utc_now()
    job.attempt_count += 1
    document.status = DocumentStatus.EXTRACTING
    job.current_step = "extracting"
    db.commit()

    pages = extractor.extract_pages(document)
    page_count = document.page_count or len(pages)
    if max_pdf_pages is not None and page_count > max_pdf_pages:
        logger.info(
            "Document exceeded page limit",
            extra={
                "document_id": str(document.id),
                "page_count": page_count,
                "max_pdf_pages": max_pdf_pages,
            },
        )
        _fail_max_pages(db, document, job, page_count, max_pdf_pages)
        raise MaxPagesExceededError("max pdf pages exceeded")

    pages = [page for page in pages if page.text.strip()]
    if not pages:
        logger.info("Document has no extractable text", extra={"document_id": str(document.id)})
        _fail_no_text(db, document, job)
        raise NoExtractableTextError("no extractable text")

    document.status = DocumentStatus.CHUNKING
    job.current_step = "chunking"
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    chunks = chunk_pages(document, pages)
    db.add_all(chunks)
    document.chunk_count = len(chunks)
    db.commit()

    document.status = DocumentStatus.EMBEDDING
    job.current_step = "embedding"
    vectors = vector_service.embed_texts([chunk.text for chunk in chunks])
    db.commit()

    document.status = DocumentStatus.INDEXING
    job.current_step = "indexing"
    vector_service.upsert_document_chunks(document.user, document, chunks, vectors)

    document.status = DocumentStatus.READY
    document.failure_code = None
    document.failure_message = None
    document.processed_at = utc_now()
    job.status = ProcessingJobStatus.SUCCEEDED
    job.current_step = "ready"
    job.finished_at = utc_now()
    db.commit()
