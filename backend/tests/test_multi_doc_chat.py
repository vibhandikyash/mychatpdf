from uuid import UUID

from app.models import (
    Chat,
    Document,
    DocumentChunk,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    User,
)
from app.services.chat import create_chat, stream_chat_response


def _authenticated_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def _ready_document(user: User, filename: str) -> Document:
    return Document(
        user=user,
        original_filename=filename,
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key=f"users/user/documents/{filename}/original.pdf",
        pinecone_namespace="test",
    )


def _chunk(user: User, document: Document, index: int, page: int, text: str, vector_id: str) -> DocumentChunk:
    return DocumentChunk(
        user=user,
        document=document,
        chunk_index=index,
        page_start=page,
        page_end=page,
        text=text,
        text_excerpt=text,
        pinecone_vector_id=vector_id,
    )


def test_multi_doc_stream_persists_sources_from_both_documents(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document_a = _ready_document(user, "contract-a.pdf")
    document_b = _ready_document(user, "contract-b.pdf")
    db_session.add_all(
        [
            document_a,
            document_b,
            _chunk(user, document_a, 0, 12, "Contract A requires a 30 day notice before termination.", "vec-a-0"),
            _chunk(user, document_b, 0, 4, "Contract B requires a 60 day notice before termination.", "vec-b-0"),
        ]
    )
    db_session.commit()
    chat = create_chat(db_session, user, [document_a, document_b])

    with authenticated_client.stream(
        "POST",
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": "Compare the termination clauses."},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: sources" in body
    assert '"document_filename": "contract-a.pdf"' in body
    assert '"document_filename": "contract-b.pdf"' in body
    source_document_ids = {source.document_id for source in db_session.query(MessageSource).all()}
    assert source_document_ids == {document_a.id, document_b.id}
    assistant_message = db_session.query(Message).filter_by(role=MessageRole.ASSISTANT).one()
    assert assistant_message.document_id is None

    detail = authenticated_client.get(f"/api/chats/{chat.id}")

    assert detail.status_code == 200
    filenames = {
        source["document_filename"]
        for message in detail.json()["messages"]
        for source in message["sources"]
    }
    assert filenames == {"contract-a.pdf", "contract-b.pdf"}


def test_multi_doc_stream_skips_single_doc_insight_shortcuts(db_session):
    user = _authenticated_user(db_session)
    document_a = _ready_document(user, "contract-a.pdf")
    document_b = _ready_document(user, "contract-b.pdf")
    db_session.add_all([document_a, document_b])
    db_session.commit()
    chat = create_chat(db_session, user, [document_a, document_b])

    class RecordingVectorService:
        def __init__(self):
            self.scope = None

        def generate_document_insight(self, _sources):
            raise AssertionError("multi-doc questions must not build single-doc insights")

        def query_scope(self, _user, documents, _question):
            self.scope = documents
            return []

        def stream_answer_tokens(self, _question, _sources):
            yield "ok"

    vector_service = RecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            [document_a, document_b],
            "Summarize this document.",
            vector_service,
            chat=chat,
        )
    )

    assert vector_service.scope == [document_a, document_b]


def test_create_chat_with_allowed_model_persists_it(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()

    # gpt-4.1-mini is in both the settings allowlist and the free plan's models.
    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "gpt-4.1-mini"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["model"] == "gpt-4.1-mini"
    chat = db_session.get(Chat, UUID(body["id"]))
    assert chat.model == "gpt-4.1-mini"


def test_create_chat_rejects_disallowed_model(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "gpt-3.5-turbo"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Model is not allowed"


def test_stream_uses_chat_model_override(db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document], model="o4-mini")

    class RecordingVectorService:
        def __init__(self):
            self.model = "unset"

        def query_document(self, _user, _document, _question):
            return []

        def stream_answer_tokens(self, _question, _sources, model=None):
            self.model = model
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, [document], "What is the notice period?", vector_service, chat=chat))

    assert vector_service.model == "o4-mini"
