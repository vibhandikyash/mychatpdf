from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_clerk_claims
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        yield session

    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def app(db_session: Session):
    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        clerk_issuer="https://example.clerk.accounts.dev",
        clerk_jwks_url="https://example.clerk.accounts.dev/.well-known/jwks.json",
        clerk_audience="mychatpdf-test",
        frontend_origin="http://localhost:5173",
    )
    app = create_app(settings)

    def override_settings() -> Settings:
        return settings

    def override_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_settings] = override_settings
    app.dependency_overrides[get_db] = override_db
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def authenticated_client(app) -> TestClient:
    async def override_claims():
        return {
            "sub": "user_2abc123",
            "email": "casey@example.com",
            "name": "Casey Example",
        }

    app.dependency_overrides[get_current_clerk_claims] = override_claims
    return TestClient(app)
