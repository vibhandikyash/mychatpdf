from app.models import Chat, Document, DocumentStatus, User


def test_get_chat_creates_empty_chat_for_owned_document(authenticated_client, db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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

    response = authenticated_client.get(f"/api/documents/{document.id}/chat")

    assert response.status_code == 200
    body = response.json()
    assert body["chat"]["document_id"] == str(document.id)
    assert body["chat"]["title"] == "paper.pdf"
    assert body["messages"] == []
    assert db_session.query(Chat).filter_by(document_id=document.id).count() == 1


def test_chat_stream_emits_phase_1_sse_event_names(authenticated_client, db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "Summarize this document."},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: message_start" in body
    assert "event: token" in body
    assert "event: sources" in body
    assert "event: message_done" in body


def test_chat_stream_for_non_ready_document_returns_error_event(
    authenticated_client,
    db_session,
):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="paper.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([user, document])
    db_session.commit()

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "Can I chat now?"},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: error" in body
