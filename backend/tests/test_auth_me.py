from app.models import User


def test_me_rejects_missing_authorization(client):
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_me_creates_local_user_from_clerk_claims(authenticated_client, db_session):
    response = authenticated_client.get("/api/me")

    assert response.status_code == 200
    body = response.json()
    assert body["clerk_user_id"] == "user_2abc123"
    assert body["email"] == "casey@example.com"
    assert body["name"] == "Casey Example"

    user = db_session.query(User).filter_by(clerk_user_id="user_2abc123").one()
    assert str(user.id) == body["id"]


def test_me_updates_existing_local_user_from_clerk_claims(
    authenticated_client,
    app,
    db_session,
):
    first = authenticated_client.get("/api/me")
    assert first.status_code == 200

    from app.api.deps import get_current_clerk_claims

    async def changed_claims():
        return {
            "sub": "user_2abc123",
            "email": "renamed@example.com",
            "name": "Renamed User",
        }

    app.dependency_overrides[get_current_clerk_claims] = changed_claims
    response = authenticated_client.get("/api/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == first.json()["id"]
    assert body["email"] == "renamed@example.com"
    assert body["name"] == "Renamed User"

    assert db_session.query(User).filter_by(clerk_user_id="user_2abc123").count() == 1
