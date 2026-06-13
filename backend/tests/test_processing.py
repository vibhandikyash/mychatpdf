from app.models import Document, DocumentStatus, ProcessingJob, ProcessingJobStatus, User
from app.services.processing import NoExtractableTextError, process_document


class NoTextExtractor:
    def extract_pages(self, _document):
        return []


class UnusedVectorService:
    def embed_texts(self, _texts):
        raise AssertionError("embedding should not run without extracted text")

    def upsert_document_chunks(self, _user, _document, _chunks, _vectors):
        raise AssertionError("indexing should not run without extracted text")


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
