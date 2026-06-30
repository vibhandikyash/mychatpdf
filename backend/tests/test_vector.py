import sys
from types import SimpleNamespace

from app.core.config import Settings
from app.models import Document, DocumentChunk, DocumentStatus, User
from app.services.vector import (
    DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT,
    RetrievedSource,
    VectorService,
    question_needs_short_summary,
)


def test_embed_texts_passes_configured_openai_dimensions(monkeypatch):
    calls = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            calls.append(kwargs)

            class FakeEmbedding:
                embedding = [0.1, 0.2]

            class FakeResponse:
                data = [FakeEmbedding()]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_embedding_model="text-embedding-3-small",
        openai_embedding_dimensions=512,
    )

    vectors = VectorService(settings).embed_texts(["hello"])

    assert vectors == [[0.1, 0.2]]
    assert calls == [
        {
            "model": "text-embedding-3-small",
            "input": ["hello"],
            "dimensions": 512,
        }
    ]


def test_embed_texts_batches_requests_and_preserves_order(monkeypatch):
    calls = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            calls.append(kwargs["input"])

            class FakeResponse:
                data = [
                    type("FakeEmbedding", (), {"embedding": [float(len(calls)), float(index)]})()
                    for index, _text in enumerate(kwargs["input"])
                ]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_embedding_batch_size=2,
    )

    vectors = VectorService(settings).embed_texts(["one", "two", "three"])

    assert calls == [["one", "two"], ["three"]]
    assert vectors == [[1.0, 0.0], [1.0, 1.0], [2.0, 0.0]]


def test_embed_texts_retries_transient_openai_failures(monkeypatch):
    attempts = 0
    sleeps = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("temporary")

            class FakeEmbedding:
                embedding = [0.4]

            class FakeResponse:
                data = [FakeEmbedding()]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_request_max_retries=2,
        openai_retry_initial_seconds=0.25,
    )

    vectors = VectorService(settings, sleeper=sleeps.append).embed_texts(["hello"])

    assert vectors == [[0.4]]
    assert attempts == 2
    assert sleeps == [0.25]


def test_stream_answer_tokens_omits_temperature_by_default(monkeypatch):
    calls = []

    class FakeDelta:
        content = "Answer"

    class FakeChoice:
        delta = FakeDelta()

    class FakeEvent:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return [FakeEvent()]

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(openai_api_key="sk-test", openai_chat_model="gpt-5-mini")
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=1,
        page_end=1,
        excerpt="Relevant context.",
        score=0.9,
    )

    tokens = list(VectorService(settings).stream_answer_tokens("Question?", [source]))

    assert tokens == ["Answer"]
    assert "temperature" not in calls[0]


def test_stream_answer_tokens_caps_plain_document_summaries(monkeypatch):
    calls = []

    class FakeDelta:
        content = "Answer"

    class FakeChoice:
        delta = FakeDelta()

    class FakeEvent:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return [FakeEvent()]

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=1,
        page_end=1,
        excerpt="Relevant context.",
        score=0.9,
    )

    list(VectorService(Settings(openai_api_key="sk-test")).stream_answer_tokens("Summarize this document.", [source]))

    assert calls[0]["max_completion_tokens"] == 320


def test_generate_document_insight_returns_structured_cache(monkeypatch):
    calls = []

    class FakeMessage:
        content = (
            '{"summary":"- Summary (p. 1)",'
            '"key_takeaways":"- Takeaway (p. 1)",'
            '"action_items":"- Apply the concepts as a study task (p. 1)",'
            '"attention_points":"- Attention point (p. 2)"}'
        )

    class FakeChoice:
        message = FakeMessage()

    class FakeResponse:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return FakeResponse()

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    sources = [
        RetrievedSource(
            chunk_id="00000000-0000-0000-0000-000000000001",
            page_start=1,
            page_end=1,
            excerpt="First source.",
            score=None,
            context="First source.",
        ),
        RetrievedSource(
            chunk_id="00000000-0000-0000-0000-000000000002",
            page_start=2,
            page_end=2,
            excerpt="Second source.",
            score=None,
            context="Second source.",
        ),
    ]

    payload = VectorService(Settings(openai_api_key="sk-test")).generate_document_insight(sources)

    assert payload["summary"] == "- Summary"
    assert payload["key_takeaways"] == "- Takeaway"
    assert payload["action_items"] == "- No explicit action items were found in the provided context."
    assert payload["attention_points"] == "- Attention point"
    assert payload["sources"][1]["page_start"] == 2
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert "Do not include page citations" in DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT
    assert "Do not convert topics, exercises, formulas, study advice, or reader activities into action items" in (
        DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT
    )


def test_stream_answer_tokens_without_openai_includes_page_citation():
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=2,
        page_end=3,
        excerpt="Relevant context.",
        score=None,
    )

    tokens = list(VectorService(Settings(openai_api_key=None)).stream_answer_tokens("Question?", [source]))

    assert tokens == ["Based on the retrieved document context, Relevant context. (pp. 2-3)"]


def test_short_summary_detection_keeps_detailed_requests_uncapped():
    assert question_needs_short_summary("Summarize this document.") is True
    assert question_needs_short_summary("Give me a detailed summary of this document.") is False
    assert question_needs_short_summary("Summarize this selected passage.") is False


def test_delete_document_vectors_uses_stored_vector_ids(db_session, monkeypatch):
    calls = []

    class FakeIndex:
        def delete(self, **kwargs):
            calls.append(kwargs)

    class FakePinecone:
        def __init__(self, api_key):
            self.api_key = api_key

        def Index(self, name):
            calls.append({"index": name})
            return FakeIndex()

    monkeypatch.setitem(sys.modules, "pinecone", SimpleNamespace(Pinecone=FakePinecone))
    user = User(clerk_user_id="user_vectors", email="vectors@example.com")
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
    db_session.add_all(
        [
            user,
            document,
            DocumentChunk(
                user=user,
                document=document,
                chunk_index=0,
                page_start=1,
                page_end=1,
                text="First chunk",
                text_excerpt="First chunk",
                pinecone_vector_id="vec-1",
            ),
            DocumentChunk(
                user=user,
                document=document,
                chunk_index=1,
                page_start=2,
                page_end=2,
                text="Second chunk",
                text_excerpt="Second chunk",
                pinecone_vector_id="vec-2",
            ),
        ]
    )
    db_session.commit()

    VectorService(
        Settings(
            pinecone_api_key="pinecone-key",
            pinecone_index_name="mychatpdf",
            pinecone_namespace="phase1",
        )
    ).delete_document_vectors(user, document)

    assert calls == [
        {"index": "mychatpdf"},
        {"ids": ["vec-1", "vec-2"], "namespace": "phase1"},
    ]


def _retry_settings():
    return Settings(
        _env_file=None,
        openai_api_key="sk-test",
        openai_request_max_retries=3,
        openai_retry_initial_seconds=0,
    )


class _Transient(Exception):
    status_code = 503


class _Permanent(Exception):
    status_code = 401


def test_retry_recovers_after_transient_errors():
    attempts = {"n": 0}

    def operation():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise _Transient("temporary")
        return "ok"

    result = VectorService(_retry_settings(), sleeper=lambda _d: None)._retry_openai_request(operation)

    assert result == "ok"
    assert attempts["n"] == 3


def test_retry_does_not_retry_permanent_errors():
    attempts = {"n": 0}

    def operation():
        attempts["n"] += 1
        raise _Permanent("bad key")

    service = VectorService(_retry_settings(), sleeper=lambda _d: None)
    try:
        service._retry_openai_request(operation)
        raised = False
    except _Permanent:
        raised = True

    assert raised is True
    assert attempts["n"] == 1
