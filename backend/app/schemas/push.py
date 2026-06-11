from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """Mirror of PushSubscription.toJSON() from the browser."""

    endpoint: str
    keys: PushKeys
    user_agent: str | None = None


class PushSubscriptionDelete(BaseModel):
    endpoint: str


class PushPublicKeyRead(BaseModel):
    # Empty string when Web Push is not configured — the UI hides the toggle.
    public_key: str
