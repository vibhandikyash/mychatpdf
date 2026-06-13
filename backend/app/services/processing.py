from dataclasses import dataclass
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


class NoExtractableTextError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


class PdfTextExtractor:
    def extract_pages(self, document: Document) -> list[ExtractedPage]:
        _ = document
        return []


def chunk_pages(document: Document, pages: list[ExtractedPage]) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for index, page in enumerate(pages):
        text = " ".join(page.text.split())
        if not text:
            continue
        chunks.append(
            DocumentChunk(
                user_id=document.user_id,
                document_id=document.id,
                chunk_index=index,
                page_start=page.page_number,
                page_end=page.page_number,
                text=text,
                text_excerpt=text[:500],
                token_count=None,
                pinecone_vector_id=f"doc_{document.id}_chunk_{index}",
            )
        )
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


def process_document(
    db: Session,
    document_id: UUID,
    *,
    extractor: PdfTextExtractor,
    vector_service: VectorService,
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
    pages = [page for page in pages if page.text.strip()]
    if not pages:
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
