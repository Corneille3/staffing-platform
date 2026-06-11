"""Generate a VAPID key pair for Web Push.

Usage:
    python -m app.scripts.generate_vapid_keys

Prints VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the base64url form expected by
both pywebpush (server) and PushManager.subscribe (browser). Paste into
backend/.env locally, or the vapid_* terraform.tfvars entries for prod.
"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def main() -> None:
    vapid = Vapid()
    vapid.generate_keys()
    private_raw = vapid.private_key.private_numbers().private_value.to_bytes(32, 'big')
    public_raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    print(f'VAPID_PUBLIC_KEY={_b64url(public_raw)}')
    print(f'VAPID_PRIVATE_KEY={_b64url(private_raw)}')


if __name__ == '__main__':
    main()
