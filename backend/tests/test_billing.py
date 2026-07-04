import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models import Subscription, User
from app.services.billing import PLAN_SEEDS, BillingService

WEBHOOK_SECRET = "whsec_test"
VALID_SIGNATURE = "valid-signature"


class FakeStripe:
    """Mirrors the attribute layout of the stripe module the service uses."""

    def __init__(self):
        self.customer_calls = []
        self.checkout_calls = []
        self.portal_calls = []
        self.Customer = SimpleNamespace(create=self._create_customer)
        self.checkout = SimpleNamespace(Session=SimpleNamespace(create=self._create_checkout))
        self.billing_portal = SimpleNamespace(Session=SimpleNamespace(create=self._create_portal))
        self.Webhook = SimpleNamespace(construct_event=self._construct_event)

    def _create_customer(self, **kwargs):
        self.customer_calls.append(kwargs)
        return {"id": "cus_test123"}

    def _create_checkout(self, **kwargs):
        self.checkout_calls.append(kwargs)
        return {"url": "https://checkout.stripe.test/session"}

    def _create_portal(self, **kwargs):
        self.portal_calls.append(kwargs)
        return {"url": "https://portal.stripe.test/session"}

    def _construct_event(self, payload, signature, secret):
        if signature != VALID_SIGNATURE or secret != WEBHOOK_SECRET:
            raise ValueError("Invalid signature")
        return json.loads(payload)


@pytest.fixture
def fake_stripe(monkeypatch) -> FakeStripe:
    fake = FakeStripe()
    settings = Settings(
        _env_file=None,
        stripe_secret_key="sk_test_123",
        stripe_webhook_secret=WEBHOOK_SECRET,
        stripe_price_pro_monthly="price_month",
        stripe_price_pro_yearly="price_year",
        frontend_origin="https://app.example.test",
    )
    service = BillingService(settings, stripe_client=fake)
    monkeypatch.setattr("app.api.billing_routes.get_billing_service", lambda _settings: service)
    return fake


def _seeded_user(db_session, **overrides) -> User:
    fields = {"clerk_user_id": "user_2abc123", "email": "casey@example.com", "name": "Casey Example"}
    fields.update(overrides)
    user = User(**fields)
    db_session.add(user)
    db_session.commit()
    return user


def _subscription_event(event_type: str, **overrides) -> dict:
    subscription_object = {
        "id": "sub_123",
        "customer": "cus_test123",
        "status": "active",
        "cancel_at_period_end": False,
        "current_period_start": 1751328000,
        "current_period_end": 1754006400,
        "items": {"data": [{"price": {"id": "price_month"}}]},
    }
    subscription_object.update(overrides)
    return {"type": event_type, "data": {"object": subscription_object}}


def _post_webhook(client, event: dict, signature: str = VALID_SIGNATURE):
    return client.post(
        "/api/webhooks/stripe",
        content=json.dumps(event),
        headers={"stripe-signature": signature},
    )


def test_plans_endpoint_is_public_and_returns_seeded_plans(client):
    response = client.get("/api/billing/plans")

    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    assert set(items) == {seed["id"] for seed in PLAN_SEEDS}
    assert items["free"]["limit_ai_messages"] == 25
    assert items["free"]["allowed_chat_models"] == ["gpt-4.1-mini"]
    assert items["pro_monthly"]["interval"] == "month"
    assert items["pro_monthly"]["limit_storage_mb"] == 2048
    assert items["pro_yearly"]["allowed_chat_models"] is None


def test_billing_me_without_subscription_returns_free_plan(authenticated_client):
    response = authenticated_client.get("/api/billing/me")

    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["id"] == "free"
    assert body["status"] is None
    assert body["current_period_end"] is None
    assert body["cancel_at_period_end"] is False


def test_billing_me_reflects_active_subscription(authenticated_client, db_session):
    user = _seeded_user(db_session, stripe_customer_id="cus_test123")
    period_end = datetime(2026, 8, 1, tzinfo=timezone.utc)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_123",
            status="active",
            current_period_end=period_end,
            cancel_at_period_end=True,
        )
    )
    db_session.commit()

    response = authenticated_client.get("/api/billing/me")

    body = response.json()
    assert body["plan"]["id"] == "pro_monthly"
    assert body["status"] == "active"
    # SQLite returns naive datetimes; compare without the offset.
    assert body["current_period_end"] == period_end.replace(tzinfo=None).isoformat()
    assert body["cancel_at_period_end"] is True


def test_checkout_returns_503_when_billing_unconfigured(authenticated_client):
    response = authenticated_client.post("/api/billing/checkout", json={"plan_id": "pro_monthly"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Billing is not configured"


def test_portal_returns_503_when_billing_unconfigured(authenticated_client):
    response = authenticated_client.post("/api/billing/portal")

    assert response.status_code == 503
    assert response.json()["detail"] == "Billing is not configured"


def test_checkout_rejects_free_plan(authenticated_client, fake_stripe):
    response = authenticated_client.post("/api/billing/checkout", json={"plan_id": "free"})

    assert response.status_code == 422


def test_checkout_rejects_unknown_plan(authenticated_client, fake_stripe):
    response = authenticated_client.post("/api/billing/checkout", json={"plan_id": "enterprise"})

    assert response.status_code == 422


def test_checkout_returns_url_and_creates_customer_once(authenticated_client, db_session, fake_stripe):
    user = _seeded_user(db_session)

    first = authenticated_client.post("/api/billing/checkout", json={"plan_id": "pro_monthly"})
    second = authenticated_client.post("/api/billing/checkout", json={"plan_id": "pro_yearly"})

    assert first.status_code == 200
    assert first.json() == {"url": "https://checkout.stripe.test/session"}
    assert second.status_code == 200
    assert len(fake_stripe.customer_calls) == 1
    assert fake_stripe.customer_calls[0]["email"] == "casey@example.com"
    db_session.refresh(user)
    assert user.stripe_customer_id == "cus_test123"
    session_kwargs = fake_stripe.checkout_calls[0]
    assert session_kwargs["customer"] == "cus_test123"
    assert session_kwargs["client_reference_id"] == str(user.id)
    assert session_kwargs["mode"] == "subscription"
    assert session_kwargs["line_items"] == [{"price": "price_month", "quantity": 1}]
    assert session_kwargs["success_url"].startswith("https://app.example.test/app/billing")
    assert fake_stripe.checkout_calls[1]["line_items"] == [{"price": "price_year", "quantity": 1}]


def test_portal_returns_url(authenticated_client, db_session, fake_stripe):
    _seeded_user(db_session, stripe_customer_id="cus_test123")

    response = authenticated_client.post("/api/billing/portal")

    assert response.status_code == 200
    assert response.json() == {"url": "https://portal.stripe.test/session"}
    assert fake_stripe.customer_calls == []
    assert fake_stripe.portal_calls[0]["customer"] == "cus_test123"


def test_webhook_rejects_bad_signature(client, fake_stripe):
    response = _post_webhook(client, {"type": "noop", "data": {"object": {}}}, signature="wrong")

    assert response.status_code == 400


def test_webhook_subscription_created_is_idempotent(client, db_session, fake_stripe):
    user = _seeded_user(db_session, stripe_customer_id="cus_test123")
    event = _subscription_event("customer.subscription.created")

    first = _post_webhook(client, event)
    second = _post_webhook(client, event)

    assert first.status_code == 200
    assert first.json() == {"received": True}
    assert second.status_code == 200
    subscriptions = db_session.query(Subscription).all()
    assert len(subscriptions) == 1
    subscription = subscriptions[0]
    assert subscription.user_id == user.id
    assert subscription.plan_id == "pro_monthly"
    assert subscription.status == "active"
    assert subscription.current_period_start is not None
    assert subscription.current_period_end is not None


def test_webhook_subscription_updated_changes_plan_and_period_end_flag(client, db_session, fake_stripe):
    _seeded_user(db_session, stripe_customer_id="cus_test123")
    _post_webhook(client, _subscription_event("customer.subscription.created"))

    updated = _subscription_event(
        "customer.subscription.updated",
        cancel_at_period_end=True,
        items={"data": [{"price": {"id": "price_year"}}]},
    )
    response = _post_webhook(client, updated)

    assert response.status_code == 200
    subscription = db_session.query(Subscription).one()
    assert subscription.plan_id == "pro_yearly"
    assert subscription.cancel_at_period_end is True


def test_webhook_subscription_deleted_marks_canceled(client, db_session, fake_stripe):
    _seeded_user(db_session, stripe_customer_id="cus_test123")
    _post_webhook(client, _subscription_event("customer.subscription.created"))

    deleted = _subscription_event("customer.subscription.deleted", status="canceled")
    first = _post_webhook(client, deleted)
    second = _post_webhook(client, deleted)

    assert first.status_code == 200
    assert second.status_code == 200
    subscription = db_session.query(Subscription).one()
    assert subscription.status == "canceled"


def test_webhook_payment_failed_marks_past_due(client, db_session, fake_stripe):
    _seeded_user(db_session, stripe_customer_id="cus_test123")
    _post_webhook(client, _subscription_event("customer.subscription.created"))

    event = {"type": "invoice.payment_failed", "data": {"object": {"subscription": "sub_123"}}}
    response = _post_webhook(client, event)

    assert response.status_code == 200
    subscription = db_session.query(Subscription).one()
    assert subscription.status == "past_due"


def test_webhook_checkout_completed_links_customer_idempotently(client, db_session, fake_stripe):
    user = _seeded_user(db_session)
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "customer": "cus_test123",
                "subscription": "sub_123",
                "client_reference_id": str(user.id),
            }
        },
    }

    first = _post_webhook(client, event)
    second = _post_webhook(client, event)

    assert first.status_code == 200
    assert second.status_code == 200
    db_session.refresh(user)
    assert user.stripe_customer_id == "cus_test123"


def test_webhook_ignores_subscription_for_unknown_customer(client, db_session, fake_stripe):
    _seeded_user(db_session)  # user without a stripe customer id

    response = _post_webhook(client, _subscription_event("customer.subscription.created"))

    assert response.status_code == 200
    assert db_session.query(Subscription).count() == 0
