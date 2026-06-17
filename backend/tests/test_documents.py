from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

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


def test_upload_rejects_oversized_pdf_without_content_length(authenticated_client, app):
    settings = app.state.settings
    settings.max_upload_mb = 1

    response = authenticated_client.post(
        "/api/documents",
        headers={"content-length": ""},
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


def test_list_documents_paginates_owned_documents(authenticated_client, db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    base_time = datetime(2026, 6, 17, 10, 0, tzinfo=timezone.utc)
    documents = [
        Document(
            user=user,
            original_filename=f"paper-{index}.pdf",
            content_type="application/pdf",
            file_size_bytes=100 + index,
            status=DocumentStatus.READY,
            wasabi_bucket="bucket",
            wasabi_object_key=f"users/user/documents/doc-{index}/original.pdf",
            pinecone_namespace="test",
            created_at=base_time - timedelta(minutes=index),
        )
        for index in range(3)
    ]
    db_session.add_all([user, *documents])
    db_session.commit()

    first_page = authenticated_client.get("/api/documents?limit=2")

    assert first_page.status_code == 200
    first_body = first_page.json()
    assert [item["original_filename"] for item in first_body["items"]] == ["paper-0.pdf", "paper-1.pdf"]
    assert first_body["next_cursor"]

    second_page = authenticated_client.get(f"/api/documents?limit=2&cursor={first_body['next_cursor']}")

    assert second_page.status_code == 200
    second_body = second_page.json()
    assert [item["original_filename"] for item in second_body["items"]] == ["paper-2.pdf"]
    assert second_body["next_cursor"] is None


def test_list_documents_rejects_invalid_cursor(authenticated_client):
    response = authenticated_client.get("/api/documents?cursor=not-a-valid-cursor")

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid document cursor"


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


class _FailingStorage:
    def upload_pdf(self, *_args, **_kwargs):
        raise RuntimeError("wasabi down")

    def delete_pdf(self, *_args, **_kwargs):
        raise RuntimeError("wasabi down")


def test_upload_storage_failure_returns_502_and_creates_no_document(
    authenticated_client, db_session, monkeypatch
):
    monkeypatch.setattr("app.api.routes.get_storage_service", lambda _settings: _FailingStorage())

    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7\ntext"), "application/pdf")},
    )

    assert response.status_code == 502
    assert "store" in response.json()["detail"].lower()
    # The document was flushed but never committed, so a rollback (which the
    # real get_db performs on session close) discards it: no orphan record.
    db_session.rollback()
    assert db_session.query(Document).count() == 0


def test_delete_is_resilient_to_external_cleanup_failure(
    authenticated_client, db_session, monkeypatch
):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document = Document(
        user=user,
        original_filename="paper.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([user, document])
    db_session.commit()

    monkeypatch.setattr("app.api.routes.get_storage_service", lambda _settings: _FailingStorage())

    def failing_vectors(_settings):
        class _V:
            def delete_document_vectors(self, *_a, **_k):
                raise RuntimeError("pinecone down")

        return _V()

    monkeypatch.setattr("app.api.routes.get_vector_service", failing_vectors)

    response = authenticated_client.delete(f"/api/documents/{document.id}")

    assert response.status_code == 200
    assert response.json()["status"] == "deleting"
    db_session.refresh(document)
    assert document.status == DocumentStatus.DELETING
    assert document.deleted_at is not None


def test_unhandled_error_returns_sanitized_500(app, authenticated_client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("unexpected boom with secret details")

    monkeypatch.setattr("app.api.routes.get_owned_document", boom)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get(f"/api/documents/{uuid4()}")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "secret" not in response.text
