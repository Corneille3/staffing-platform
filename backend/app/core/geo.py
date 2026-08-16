"""Site-radius geofence for attendance stamps (SPEC_CHECKOUT_HOURS §3).

Haversine over a spherical Earth is accurate to ~0.5% — noise compared to
consumer GPS error, which is the real uncertainty at a 250 m radius.
"""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.organization import Organization

_EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two (lat, lon) points."""
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * asin(sqrt(a))


def site_distance_m(org: Organization, lat, lon) -> float | None:
    """Distance from the device to the site, or None when either side has no
    coordinates (site never geocoded, or the browser denied position)."""
    if lat is None or lon is None or org.latitude is None or org.longitude is None:
        return None
    return haversine_m(float(org.latitude), float(org.longitude), float(lat), float(lon))


def within_site(org: Organization, lat, lon, *, default_radius_m: int) -> bool | None:
    """True/False inside the radius; None when the check can't be made."""
    distance = site_distance_m(org, lat, lon)
    if distance is None:
        return None
    radius = org.geofence_radius_m or default_radius_m
    return distance <= radius
