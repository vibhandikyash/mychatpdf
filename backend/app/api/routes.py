from typing import Annotated
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_owned_document
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import (
    Chat,
    Document,
    DocumentStatus,
    Message,
    ProcessingJob,
    ProcessingJobStatus,
    User,
)
from app.models.mixins import utc_now
from app.services.chat import get_or_create_chat, stream_chat_response
from app.services.storage import StorageService, build_document_object_key, get_storage_service
from app.services.vector import VectorService, get_vector_service
from app.worker import enqueue_document_processing

router = APIRouter()
logger = logging.getLogger(__name__)


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("select 1"))
    return {"status": "ready"}


@router.get("/api/me")
def me(current_user: User = Depends(get_current_user)) -> dict[str, str | None]:
    return {
        "id": str(current_user.id),
        "clerk_user_id": current_user.clerk_user_id,
        "email": current_user.email,
        "name": current_user.name,
    }


def _document_summary(document: Document) -> dict[str, object]:
    return {
        "id": str(document.id),
        "original_filename": document.original_filename,
        "status": _enum_value(document.status),
        "file_size_bytes": document.file_size_bytes,
        "page_count": document.page_count,
        "chunk_count": document.chunk_count,
        "created_at": document.created_at.isoformat(),
        "processed_at": document.processed_at.isoformat() if document.processed_at else None,
        "failure_code": document.failure_code,
        "failure_message": document.failure_message,
    }


@router.get("/api/documents")
def list_documents(
    status_filter: Annotated[DocumentStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    statement = (
        select(Document)
        .where(Document.user_id == current_user.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        statement = statement.where(Document.status == status_filter)
    documents = db.scalars(statement).all()
    return {"items": [_document_summary(document) for document in documents], "next_cursor": None}


def _validate_pdf_upload(file: UploadFile, content: bytes, settings: Settings) -> None:
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf") or file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="PDF exceeds the configured upload limit",
        )


@router.post("/api/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: Annotated[UploadFile, File()],
    content_length: Annotated[int | None, Header(alias="content-length")] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if content_length is not None and content_length > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="PDF exceeds the configured upload limit",
        )

    content = await file.read()
    _validate_pdf_upload(file, content, settings)

    document = Document(
        user_id=current_user.id,
        original_filename=file.filename or "upload.pdf",
        content_type=file.content_type or "application/pdf",
        file_size_bytes=len(content),
        status=DocumentStatus.UPLOADED,
        wasabi_bucket=settings.wasabi_bucket,
        wasabi_object_key="pending",
        pinecone_namespace=settings.pinecone_namespace,
    )
    db.add(document)
    db.flush()
    document.wasabi_object_key = build_document_object_key(current_user.id, document.id)

    storage_service = get_storage_service(settings)
    storage_service.upload_pdf(document.wasabi_object_key, content, document.content_type)

    job = ProcessingJob(
        user_id=current_user.id,
        document_id=document.id,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(document)
    db.refresh(job)
    enqueue_document_processing(settings, document.id)
    logger.info("Document uploaded", extra={"document_id": str(document.id), "user_id": str(current_user.id)})

    return {
        "id": str(document.id),
        "status": _enum_value(document.status),
        "processing_job_id": str(job.id),
    }


@router.get("/api/documents/{document_id}")
def document_detail(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_owned_document(db, current_user, document_id)
    return _document_summary(document)


@router.delete("/api/documents/{document_id}")
def delete_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    document.status = DocumentStatus.DELETING
    document.deleted_at = utc_now()
    get_storage_service(settings).delete_pdf(document)
    get_vector_service(settings).delete_document_vectors(current_user, document)
    db.commit()
    return {"status": DocumentStatus.DELETING.value}


@router.post("/api/documents/{document_id}/retry")
def retry_document_processing(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    if document.status != DocumentStatus.FAILED:
        raise HTTPException(status_code=409, detail="Only failed documents can be retried")
    document.status = DocumentStatus.UPLOADED
    document.failure_code = None
    document.failure_message = None
    job = ProcessingJob(
        user_id=current_user.id,
        document_id=document.id,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    enqueue_document_processing(settings, document.id)
    logger.info("Document processing retry enqueued", extra={"document_id": str(document.id)})
    return {"processing_job_id": str(job.id), "status": ProcessingJobStatus.QUEUED.value}


@router.get("/api/documents/{document_id}/file-url")
def document_file_url(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    return get_storage_service(settings).signed_file_url(document)


@router.get("/api/documents/{document_id}/processing-status")
def document_processing_status(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | None]:
    document = get_owned_document(db, current_user, document_id)
    job = document.processing_jobs[-1] if document.processing_jobs else None
    return {
        "document_id": str(document.id),
        "status": _enum_value(document.status),
        "current_step": job.current_step if job else _enum_value(document.status),
        "failure_code": document.failure_code,
        "failure_message": document.failure_message,
    }


def _message_payload(message: Message) -> dict[str, object]:
    return {
        "id": str(message.id),
        "role": _enum_value(message.role),
        "content": message.content,
        "created_at": message.created_at.isoformat(),
        "sources": [
            {
                "source_id": str(source.id),
                "chunk_id": str(source.chunk_id) if source.chunk_id else None,
                "page_start": source.page_start,
                "page_end": source.page_end,
                "excerpt": source.excerpt,
                "score": source.score,
            }
            for source in message.sources
        ],
    }


@router.get("/api/documents/{document_id}/chat")
def get_document_chat(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_owned_document(db, current_user, document_id)
    chat = get_or_create_chat(db, current_user, document)
    db.refresh(chat)
    return {
        "chat": {
            "id": str(chat.id),
            "document_id": str(document.id),
            "title": chat.title,
        },
        "messages": [_message_payload(message) for message in chat.messages],
    }


@router.post("/api/documents/{document_id}/chat/stream")
def stream_document_chat(
    document_id: UUID,
    payload: dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    document = get_owned_document(db, current_user, document_id)
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message content is required")

    vector_service = get_vector_service(settings)
    return StreamingResponse(
        stream_chat_response(db, current_user, document, content, vector_service),
        media_type="text/event-stream",
    )
