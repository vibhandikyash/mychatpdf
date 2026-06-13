from app.core.config import Settings
from app.services.vector import VectorService
from app.services.vector import RetrievedSource


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
