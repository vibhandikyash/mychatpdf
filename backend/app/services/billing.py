import logging
from datetime import datetime, timezone
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Plan, Subscription, User

logger = logging.getLogger(__name__)

# Single source of truth for the plan matrix: migration 0005 and the test
# fixtures both seed from this. stripe_price_id stays NULL in the DB; price ids
# are resolved from env at runtime (price_id_for_plan / plan_id_for_price).
PLAN_SEEDS: list[dict[str, object]] = [
    {
        "id": "free",
        "name": "Free",
        "interval": None,
        "stripe_price_id": None,
        "limit_ai_messages": 25,
        "limit_uploads": 3,
        "limit_storage_mb": 50,
        "limit_document_scope": 2,
        "allowed_chat_models": ["gpt-4.1-mini"],
        "is_active": True,
    },
    {
        "id": "pro_monthly",
        "name": "Pro (monthly)",
        "interval": "month",
        "stripe_price_id": None,
        "limit_ai_messages": 1000,
        "limit_uploads": 100,
        "limit_storage_mb": 2048,
        "limit_document_scope": 10,
        "allowed_chat_models": None,
        "is_active": True,
    },
    {
        "id": "pro_yearly",
        "name": "Pro (yearly)",
        "interval": "year",
        "stripe_price_id": None,
        "limit_ai_messages": 1000,
        "limit_uploads": 100,
        "limit_storage_mb": 2048,
        "limit_document_scope": 10,
        "allowed_chat_models": None,
        "is_active": True,
    },
]

FREE_PLAN_ID = "free"
ACTIVE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")


def get_active_subscription(db: Session, user: User) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
        )
        .order_by(Subscription.created_at.desc(), Subscription.id.desc())
        .limit(1)
    )


def get_active_plan(db: Session, user: User) -> Plan:
    """The single function all limit gating uses."""
    subscription = get_active_subscription(db, user)
    if subscription is not None:
        plan = db.get(Plan, subscription.plan_id)
        if plan is not None:
            return plan
    return db.get(Plan, FREE_PLAN_ID)


def subscription_summary(db: Session, user: User) -> dict[str, object]:
    plan = get_active_plan(db, user)
    subscription = get_active_subscription(db, user)
    return {
        "plan": {"id": plan.id, "name": plan.name, "interval": plan.interval},
        "status": subscription.status if subscription else None,
        "current_period_end": (
            subscription.current_period_end.isoformat()
            if subscription and subscription.current_period_end
            else None
        ),
        "cancel_at_period_end": subscription.cancel_at_period_end if subscription else False,
    }


class BillingService:
    def __init__(self, settings: Settings, stripe_client=None):
        self.settings = settings
        if stripe_client is None:
            stripe.api_key = settings.stripe_secret_key
            stripe_client = stripe
        self._stripe = stripe_client

    def is_configured(self) -> bool:
        return bool(self.settings.stripe_secret_key)

    def price_id_for_plan(self, plan_id: str) -> str | None:
        return {
            "pro_monthly": self.settings.stripe_price_pro_monthly,
            "pro_yearly": self.settings.stripe_price_pro_yearly,
        }.get(plan_id)

    def plan_id_for_price(self, price_id: str | None) -> str | None:
        if not price_id:
            return None
        for plan_id in ("pro_monthly", "pro_yearly"):
            if self.price_id_for_plan(plan_id) == price_id:
                return plan_id
        return None

    def _return_url(self) -> str:
        if self.settings.billing_return_url:
            return str(self.settings.billing_return_url)
        origins = self.settings.cors_origins()
        base = origins[0] if origins else "http://localhost:5173"
        return f"{base}/app/billing"

    def ensure_customer(self, db: Session, user: User) -> str:
        if user.stripe_customer_id:
            return user.stripe_customer_id
        customer = self._stripe.Customer.create(
            email=user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer["id"]
        db.commit()
        return user.stripe_customer_id

    def create_checkout_session_url(self, db: Session, user: User, price_id: str) -> str:
        customer_id = self.ensure_customer(db, user)
        return_url = self._return_url()
        session = self._stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=str(user.id),
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{return_url}?checkout=success",
            cancel_url=f"{return_url}?checkout=canceled",
        )
        return session["url"]

    def create_portal_session_url(self, db: Session, user: User) -> str:
        customer_id = self.ensure_customer(db, user)
        session = self._stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=self._return_url(),
        )
        return session["url"]

    def construct_webhook_event(self, payload: bytes, signature: str):
        return self._stripe.Webhook.construct_event(
            payload, signature, self.settings.stripe_webhook_secret
        )

    def apply_webhook_event(self, db: Session, event) -> None:
        """Idempotent: replays of the same event converge on the same rows."""
        event_type = event["type"]
        data_object = event["data"]["object"]

        if event_type == "checkout.session.completed":
            self._link_customer(db, data_object)
        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            self._upsert_subscription(db, data_object)
        elif event_type == "customer.subscription.deleted":
            self._upsert_subscription(db, data_object, force_status="canceled")
        elif event_type == "invoice.payment_failed":
            # 2025-03-31+ Stripe API versions moved the reference under parent.subscription_details.
            subscription_id = data_object.get("subscription") or (
                (data_object.get("parent") or {}).get("subscription_details") or {}
            ).get("subscription")
            subscription = db.scalar(
                select(Subscription).where(
                    Subscription.stripe_subscription_id == subscription_id
                )
            )
            if subscription is not None:
                subscription.status = "past_due"
        else:
            logger.info("Ignoring unhandled Stripe event", extra={"event_type": event_type})
        db.commit()

    def _link_customer(self, db: Session, session_object) -> None:
        reference = session_object.get("client_reference_id")
        customer_id = session_object.get("customer")
        if not reference or not customer_id:
            return
        try:
            user = db.get(User, UUID(str(reference)))
        except ValueError:
            user = None
        if user is not None and user.stripe_customer_id != customer_id:
            user.stripe_customer_id = customer_id

    def _upsert_subscription(self, db: Session, subscription_object, force_status: str | None = None) -> None:
        stripe_subscription_id = subscription_object["id"]
        items = (subscription_object.get("items") or {}).get("data") or []
        price = (items[0].get("price") or {}) if items else {}
        plan_id = self.plan_id_for_price(price.get("id"))

        subscription = db.scalar(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_subscription_id
            )
        )
        if subscription is None:
            user = db.scalar(
                select(User).where(User.stripe_customer_id == subscription_object.get("customer"))
            )
            if user is None or plan_id is None:
                logger.warning(
                    "Cannot resolve user or plan for Stripe subscription; skipping",
                    extra={"stripe_subscription_id": stripe_subscription_id},
                )
                return
            subscription = Subscription(
                user_id=user.id,
                plan_id=plan_id,
                stripe_subscription_id=stripe_subscription_id,
                status="active",
            )
            db.add(subscription)

        if plan_id is not None:
            subscription.plan_id = plan_id
        subscription.status = force_status or subscription_object.get("status") or subscription.status
        subscription.cancel_at_period_end = bool(subscription_object.get("cancel_at_period_end", False))
        # 2025-03-31+ Stripe API versions moved period bounds onto subscription items.
        first_item = items[0] if items else {}
        period_start = subscription_object.get("current_period_start") or first_item.get(
            "current_period_start"
        )
        period_end = subscription_object.get("current_period_end") or first_item.get(
            "current_period_end"
        )
        if period_start:
            subscription.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
        if period_end:
            subscription.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)


def get_billing_service(settings: Settings) -> BillingService:
    return BillingService(settings)
