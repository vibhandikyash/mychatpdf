import sys
from types import SimpleNamespace

from app.core.config import Settings
from app.models import Document, DocumentChunk, DocumentStatus, User
from app.services.vector import RetrievedSource, VectorService


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
