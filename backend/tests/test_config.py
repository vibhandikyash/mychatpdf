from app.core.config import Settings


def test_empty_optional_numeric_environment_values_are_none(monkeypatch):
    monkeypatch.setenv("OPENAI_CHAT_TEMPERATURE", "")

    settings = Settings()

    assert settings.openai_chat_temperature is None
