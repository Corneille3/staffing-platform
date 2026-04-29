from app.api.v1.router import api_router


def test_expected_route_prefixes_present() -> None:
    paths = {route.path for route in api_router.routes}

    assert '/auth/me' in paths
    assert '/auth/sync' in paths
    assert '/organizations' in paths
    assert '/users' in paths
    assert '/workers' in paths
    assert '/requests' in paths
    assert '/assignments' in paths
    assert '/notifications' in paths
    assert '/reports/network-summary' in paths
    assert '/audit-logs' in paths
