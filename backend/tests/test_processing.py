from app.models import Document, DocumentStatus, ProcessingJob, ProcessingJobStatus, User
from app.models import DocumentChunk
from app.services.processing import ExtractedPage, MaxPagesExceededError, NoExtractableTextError, process_document


class NoTextExtractor:
    def extract_pages(self, _document):
        return []


class UnusedVectorService:
    def embed_texts(self, _texts):
        raise AssertionError("embedding should not run without extracted text")

    def upsert_document_chunks(self, _user, _document, _chunks, _vectors):
        raise AssertionError("indexing should not run without extracted text")


class TextExtractor:
    def extract_pages(self, _document):
        return [
            ExtractedPage(page_number=1, text=" First page with useful text. "),
            ExtractedPage(page_number=2, text="Second page with more useful text."),
        ]


class TooManyPagesExtractor:
    def extract_pages(self, _document):
        return [
            ExtractedPage(page_number=1, text="Page one."),
            ExtractedPage(page_number=2, text="Page two."),
        ]


class RecordingVectorService:
    def __init__(self):
        self.upserted = []

    def embed_texts(self, texts):
        return [[float(index)] for index, _text in enumerate(texts)]

    def upsert_document_chunks(self, user, document, chunks, vectors):
        self.upserted.append(
            {
                "user_id": user.id,
                "document_id": document.id,
                "chunk_count": len(list(chunks)),
                "vector_count": len(vectors),
            }
        )


def test_no_text_processing_marks_document_and_job_failed(db_session):
    user = User(clerk_user_id="user_processing", email="processing@example.com")
    document = Document(
        user=user,
        original_filename="scan.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    try:
        process_document(
            db_session,
            document.id,
            extractor=NoTextExtractor(),
            vector_service=UnusedVectorService(),
        )
    except NoExtractableTextError:
        pass

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "no_extractable_text"
    assert "text-based PDFs" in document.failure_message
    assert job.status == ProcessingJobStatus.FAILED
    assert job.error_code == "no_extractable_text"


def test_text_processing_stores_chunks_indexes_vectors_and_marks_ready(db_session):
    user = User(clerk_user_id="user_ready", email="ready@example.com")
    document = Document(
        user=user,
        original_filename="text.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()
    vector_service = RecordingVectorService()

    process_document(
        db_session,
        document.id,
        extractor=TextExtractor(),
        vector_service=vector_service,
    )

    db_session.refresh(document)
    db_session.refresh(job)
    chunks = db_session.query(DocumentChunk).order_by(DocumentChunk.chunk_index).all()

    assert document.status == DocumentStatus.READY
    assert document.chunk_count == 2
    assert job.status == ProcessingJobStatus.SUCCEEDED
    assert [chunk.page_start for chunk in chunks] == [1, 2]
    assert vector_service.upserted == [
        {
            "user_id": user.id,
            "document_id": document.id,
            "chunk_count": 2,
            "vector_count": 2,
        }
    ]


def test_processing_fails_before_embedding_when_pdf_exceeds_page_limit(db_session):
    user = User(clerk_user_id="user_page_limit", email="limit@example.com")
    document = Document(
        user=user,
        original_filename="long.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    try:
        process_document(
            db_session,
            document.id,
            extractor=TooManyPagesExtractor(),
            vector_service=UnusedVectorService(),
            max_pdf_pages=1,
        )
    except MaxPagesExceededError:
        pass

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "max_pdf_pages_exceeded"
    assert job.status == ProcessingJobStatus.FAILED
    assert job.error_code == "max_pdf_pages_exceeded"
