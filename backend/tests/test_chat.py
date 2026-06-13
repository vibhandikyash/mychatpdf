from app.models import (
    Chat,
    Document,
    DocumentChunk,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    User,
)
from app.services.chat import build_contextual_question, stream_chat_response


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


def test_chat_stream_persists_retrieved_sources(authenticated_client, db_session):
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
    chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=7,
        page_end=7,
        text="Pipeline quality improved in regulated industries.",
        text_excerpt="Pipeline quality improved in regulated industries.",
        pinecone_vector_id="doc_chunk_0",
    )
    db_session.add_all([user, document, chunk])
    db_session.commit()

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "What improved?"},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "Pipeline quality improved" in body

    source = db_session.query(MessageSource).one()
    assert source.chunk_id == chunk.id
    assert source.page_start == 7
    assert source.rank == 1


def test_chat_stream_uses_recent_history_for_follow_up_retrieval_and_answer(db_session):
    class RecordingVectorService:
        def __init__(self):
            self.query = None
            self.answer_question = None

        def query_document(self, _user, _document, question):
            self.query = question
            return []

        def stream_answer_tokens(self, question, _sources):
            self.answer_question = question
            yield "The approved exception expires on 2026-10-31."

    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="contract.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    chat = Chat(user=user, document=document, title="contract.pdf")
    db_session.add_all([user, document, chat])
    db_session.flush()
    db_session.add_all(
        [
            Message(
                user=user,
                document=document,
                chat=chat,
                role=MessageRole.USER,
                status=MessageStatus.SUCCEEDED,
                content="Who is the technical owner and what is the approved exception?",
            ),
            Message(
                user=user,
                document=document,
                chat=chat,
                role=MessageRole.ASSISTANT,
                status=MessageStatus.SUCCEEDED,
                content=(
                    "The approved exception is temporary CSV export over SFTP "
                    "until 2026-10-31."
                ),
            ),
        ]
    )
    db_session.commit()
    vector_service = RecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            document,
            "When does it expire?",
            vector_service,
        )
    )

    assert "When does it expire?" in vector_service.query
    assert "temporary CSV export over SFTP" in vector_service.query
    assert "2026-10-31" in vector_service.answer_question


def test_contextual_question_does_not_dilute_standalone_questions():
    prior_messages = [
        Message(
            role=MessageRole.USER,
            status=MessageStatus.SUCCEEDED,
            content="What are the annual contract value and payment terms?",
        ),
        Message(
            role=MessageRole.ASSISTANT,
            status=MessageStatus.SUCCEEDED,
            content="The annual contract value is $1,284,500 and payment terms are Net 45.",
        ),
    ]
    current_question = "Who is the technical owner and what is the approved exception?"

    contextual_question = build_contextual_question(current_question, prior_messages)

    assert contextual_question == current_question


def test_chat_stream_marks_assistant_failed_when_generation_errors(db_session):
    class FailingVectorService:
        def query_document(self, _user, _document, _question):
            return []

        def stream_answer_tokens(self, _question, _sources):
            raise RuntimeError("OpenAI unavailable")
            yield ""

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

    events = list(
        stream_chat_response(
            db_session,
            user,
            document,
            "Summarize this document.",
            FailingVectorService(),
        )
    )

    assistant_message = (
        db_session.query(Message)
        .filter_by(document_id=document.id, role=MessageRole.ASSISTANT)
        .one()
    )
    assert any("event: error" in event for event in events)
    assert assistant_message.status == MessageStatus.FAILED
    assert "OpenAI unavailable" in (assistant_message.message_metadata or {}).get("error", "")


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
