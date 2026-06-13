from io import BytesIO
from uuid import UUID, uuid4

from app.models import Document, DocumentStatus, User


def test_upload_rejects_non_pdf(authenticated_client):
    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only PDF uploads are supported"


def test_upload_rejects_oversized_pdf(authenticated_client, app):
    settings = app.state.settings
    settings.max_upload_mb = 1

    response = authenticated_client.post(
        "/api/documents",
        files={
            "file": (
                "large.pdf",
                BytesIO(b"%PDF-" + b"x" * (1024 * 1024 + 1)),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "PDF exceeds the configured upload limit"


def test_upload_creates_document_and_processing_job(authenticated_client, db_session):
    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7\ntext"), "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "uploaded"
    assert body["processing_job_id"]

    document = db_session.get(Document, UUID(body["id"]))
    assert document is not None
    assert document.original_filename == "paper.pdf"
    assert document.wasabi_object_key == (
        f"users/{document.user_id}/documents/{document.id}/original.pdf"
    )
    assert document.processing_jobs[0].id.hex == body["processing_job_id"].replace("-", "")


def test_document_ownership_denial_returns_404(authenticated_client, db_session):
    owner = User(clerk_user_id="owner", email="owner@example.com")
    other_document = Document(
        user=owner,
        original_filename="private.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/owner/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([owner, other_document])
    db_session.commit()

    response = authenticated_client.get(f"/api/documents/{other_document.id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found"


def test_file_url_requires_ownership(authenticated_client, db_session):
    owner = User(clerk_user_id="owner_2", email="owner2@example.com")
    other_document = Document(
        user=owner,
        original_filename="private.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/owner/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([owner, other_document])
    db_session.commit()

    response = authenticated_client.get(f"/api/documents/{other_document.id}/file-url")

    assert response.status_code == 404


def test_missing_document_id_returns_404(authenticated_client):
    response = authenticated_client.get(f"/api/documents/{uuid4()}")

    assert response.status_code == 404


def test_retry_failed_document_enqueues_processing(authenticated_client, db_session, monkeypatch):
    calls = []
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="failed.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.FAILED,
        failure_code="no_extractable_text",
        failure_message="No text",
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([user, document])
    db_session.commit()

    def record_enqueue(_settings, document_id):
        calls.append(document_id)

    monkeypatch.setattr("app.api.routes.enqueue_document_processing", record_enqueue)

    response = authenticated_client.post(f"/api/documents/{document.id}/retry")

    assert response.status_code == 200
    assert calls == [document.id]
