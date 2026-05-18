"""
Standalone Strava route dashboard for local development.

Strava/Runna competitive context May 2026:
Jogga should use Strava Free as a read-only import source, keep planning and
insights private in Jogga, and never request write/posting scopes by default.

Run:
    STRAVA_CLIENT_ID=123 \
    STRAVA_CLIENT_SECRET=... \
    STRAVA_REDIRECT_URI=http://localhost:8000/auth/strava/callback \
    uvicorn examples.strava_routes_dashboard:app --reload --port 8000

Then open:
    http://localhost:8000

Install deps:
    pip install -r examples/strava_routes_dashboard_requirements.txt

Optional Firebase sync:
    export FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"...","client_email":"...","private_key":"..."}'
    export FIRESTORE_DATABASE_ID=ai-studio-bfff84eb-1c55-4502-979f-fbba33e66dc9

    curl -X POST http://localhost:8000/api/firebase/sync-strava \
      -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
"""

from __future__ import annotations

import json
import math
import os
import secrets
from base64 import b64decode
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import folium
import requests
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse


STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_URL = "https://www.strava.com/api/v3"
STRAVA_SCOPES = ["read", "activity:read_all"]
TOKEN_PATH = Path(".strava_tokens.local.json")

app = FastAPI(title="Jogga Strava Route Dashboard")
oauth_states: set[str] = set()


@dataclass
class RoutePoint:
    lat: float
    lng: float
    distance_m: float | None = None
    elapsed_s: int | None = None
    velocity_mps: float | None = None


@dataclass
class RunRoute:
    activity_id: int
    name: str
    distance_km: float
    moving_time_s: int
    average_pace_min_per_km: float | None
    start_date: str | None
    points: list[RoutePoint]


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def load_tokens() -> dict[str, Any] | None:
    if not TOKEN_PATH.exists():
        return None
    return json.loads(TOKEN_PATH.read_text(encoding="utf-8"))


def save_tokens(tokens: dict[str, Any]) -> None:
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2), encoding="utf-8")


def parse_service_account_json(raw_value: str) -> dict[str, Any]:
    trimmed_value = raw_value.strip()
    json_value = trimmed_value if trimmed_value.startswith("{") else b64decode(trimmed_value).decode("utf-8")
    parsed = json.loads(json_value)
    private_key = parsed.get("privateKey") or parsed.get("private_key")
    if isinstance(private_key, str):
        parsed["private_key"] = private_key.replace("\\n", "\n")
    return {
        "type": parsed.get("type", "service_account"),
        "project_id": parsed.get("projectId") or parsed.get("project_id"),
        "private_key_id": parsed.get("privateKeyId") or parsed.get("private_key_id"),
        "private_key": parsed.get("private_key"),
        "client_email": parsed.get("clientEmail") or parsed.get("client_email"),
        "client_id": parsed.get("clientId") or parsed.get("client_id"),
        "auth_uri": parsed.get("auth_uri", "https://accounts.google.com/o/oauth2/auth"),
        "token_uri": parsed.get("token_uri", "https://oauth2.googleapis.com/token"),
        "auth_provider_x509_cert_url": parsed.get(
            "auth_provider_x509_cert_url",
            "https://www.googleapis.com/oauth2/v1/certs",
        ),
        "client_x509_cert_url": parsed.get("client_x509_cert_url"),
    }


def get_service_account_from_env() -> dict[str, Any]:
    if os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"):
        return parse_service_account_json(env("FIREBASE_SERVICE_ACCOUNT_JSON"))

    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY")
    if project_id and client_email and private_key:
        return {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key.replace("\\n", "\n"),
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }

    raise RuntimeError(
        "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON "
        "or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    )


def get_firebase_app() -> Any:
    import firebase_admin
    from firebase_admin import credentials

    try:
        return firebase_admin.get_app()
    except ValueError:
        service_account = get_service_account_from_env()
        credential = credentials.Certificate(service_account)
        return firebase_admin.initialize_app(
            credential,
            {"projectId": service_account.get("project_id")},
        )


def get_firestore_client() -> Any:
    from firebase_admin import firestore

    database_id = (
        os.environ.get("FIRESTORE_DATABASE_ID")
        or os.environ.get("FIREBASE_FIRESTORE_DATABASE_ID")
        or "(default)"
    )
    try:
        return firestore.client(app=get_firebase_app(), database_id=database_id)
    except TypeError:
        return firestore.client(app=get_firebase_app())


def verify_firebase_uid(authorization: str | None) -> str:
    from firebase_admin import auth as firebase_auth

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Firebase ID token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Firebase ID token")

    try:
        decoded = firebase_auth.verify_id_token(token, app=get_firebase_app())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Firebase ID token") from exc

    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status_code=401, detail="Firebase ID token has no uid")
    return uid


def build_authorize_url() -> str:
    state = secrets.token_urlsafe(24)
    oauth_states.add(state)
    params = {
        "client_id": env("STRAVA_CLIENT_ID"),
        "redirect_uri": os.environ.get(
            "STRAVA_REDIRECT_URI",
            "http://localhost:8000/auth/strava/callback",
        ),
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": ",".join(STRAVA_SCOPES),
        "state": state,
    }
    return f"{STRAVA_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    response = requests.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": env("STRAVA_CLIENT_ID"),
            "client_secret": env("STRAVA_CLIENT_SECRET"),
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def refresh_access_token(tokens: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": env("STRAVA_CLIENT_ID"),
            "client_secret": env("STRAVA_CLIENT_SECRET"),
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
        },
        timeout=15,
    )
    response.raise_for_status()
    refreshed = {**tokens, **response.json()}
    save_tokens(refreshed)
    return refreshed


def get_access_token() -> str:
    tokens = load_tokens()
    if not tokens:
        raise HTTPException(status_code=401, detail="Connect Strava first")

    # Strava access tokens are short-lived. Refresh slightly early.
    expires_at = int(tokens.get("expires_at") or 0)
    if expires_at <= 0:
        raise HTTPException(status_code=401, detail="Stored Strava token is invalid")

    import time

    if expires_at <= int(time.time()) + 90:
        tokens = refresh_access_token(tokens)

    return tokens["access_token"]


def strava_get(path: str, access_token: str, params: dict[str, Any] | None = None) -> Any:
    response = requests.get(
        f"{STRAVA_API_URL}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def is_run(activity: dict[str, Any]) -> bool:
    sport_type = str(activity.get("sport_type") or activity.get("type") or "")
    return sport_type.lower() in {"run", "trailrun", "virtualrun"}


def pace_min_per_km(distance_m: float, moving_time_s: int) -> float | None:
    if distance_m <= 0 or moving_time_s <= 0:
        return None
    return moving_time_s / 60 / (distance_m / 1000)


def format_pace(pace: float | None) -> str:
    if pace is None or not math.isfinite(pace):
        return "n/a"
    minutes = int(pace)
    seconds = int(round((pace - minutes) * 60))
    if seconds == 60:
        minutes += 1
        seconds = 0
    return f"{minutes}:{seconds:02d}/km"


def fetch_running_activities(access_token: str, per_page: int = 20) -> list[dict[str, Any]]:
    """Fetch the athlete's recent running activities.

    The activity list has distance and time, but not full GPS coordinates.
    GPS coordinates come from the activity streams endpoint below.
    """

    activities = strava_get(
        "/athlete/activities",
        access_token,
        params={"page": 1, "per_page": min(per_page, 100)},
    )
    return [activity for activity in activities if is_run(activity)]


def fetch_activity_streams(access_token: str, activity_id: int) -> dict[str, Any]:
    """Fetch route streams for one activity.

    `latlng` contains GPS points. `distance`, `time`, and `velocity_smooth`
    provide distance, elapsed seconds, and pace/speed context for each point.
    """

    return strava_get(
        f"/activities/{activity_id}/streams",
        access_token,
        params={
            "keys": "latlng,distance,time,velocity_smooth",
            "key_by_type": "true",
        },
    )


def build_route(activity: dict[str, Any], streams: dict[str, Any]) -> RunRoute | None:
    latlng = streams.get("latlng", {}).get("data") or []
    if not latlng:
        return None

    distances = streams.get("distance", {}).get("data") or []
    times = streams.get("time", {}).get("data") or []
    velocities = streams.get("velocity_smooth", {}).get("data") or []
    points: list[RoutePoint] = []

    for index, pair in enumerate(latlng):
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        points.append(
            RoutePoint(
                lat=float(pair[0]),
                lng=float(pair[1]),
                distance_m=float(distances[index]) if index < len(distances) else None,
                elapsed_s=int(times[index]) if index < len(times) else None,
                velocity_mps=float(velocities[index]) if index < len(velocities) else None,
            )
        )

    distance_m = float(activity.get("distance") or 0)
    moving_time_s = int(activity.get("moving_time") or 0)
    return RunRoute(
        activity_id=int(activity["id"]),
        name=str(activity.get("name") or "Run"),
        distance_km=round(distance_m / 1000, 2),
        moving_time_s=moving_time_s,
        average_pace_min_per_km=pace_min_per_km(distance_m, moving_time_s),
        start_date=activity.get("start_date_local") or activity.get("start_date"),
        points=points,
    )


def fetch_run_routes(limit: int = 10) -> list[RunRoute]:
    access_token = get_access_token()
    runs = fetch_running_activities(access_token, per_page=max(limit, 20))
    routes: list[RunRoute] = []

    for activity in runs[:limit]:
        streams = fetch_activity_streams(access_token, int(activity["id"]))
        route = build_route(activity, streams)
        if route:
            routes.append(route)

    return routes


def route_point_to_firestore(point: RoutePoint) -> dict[str, Any]:
    return {
        "lat": point.lat,
        "lng": point.lng,
        "distanceM": point.distance_m,
        "elapsedS": point.elapsed_s,
        "velocityMps": point.velocity_mps,
    }


def route_summary_to_firestore(route: RunRoute, synced_at: str) -> dict[str, Any]:
    return {
        "id": str(route.activity_id),
        "activityId": route.activity_id,
        "name": route.name,
        "distanceKm": route.distance_km,
        "movingTimeS": route.moving_time_s,
        "averagePaceMinPerKm": route.average_pace_min_per_km,
        "averagePace": format_pace(route.average_pace_min_per_km),
        "startDate": route.start_date,
        "pointCount": len(route.points),
        "source": "strava",
        "privacy": "private",
        "updatedAt": synced_at,
    }


def chunked_points(points: list[RoutePoint], chunk_size: int = 250) -> list[list[RoutePoint]]:
    return [points[index:index + chunk_size] for index in range(0, len(points), chunk_size)]


def sync_routes_to_firestore(uid: str, routes: list[RunRoute]) -> dict[str, Any]:
    """Persist Strava routes for a Firebase-authenticated Jogga user.

    Full GPS streams can exceed Firestore's document size limit, so route points
    are written in chunk documents under each activity.
    """

    db = get_firestore_client()
    synced_at = datetime.now(timezone.utc).isoformat()
    user_ref = db.collection("users").document(uid)
    total_points = sum(len(route.points) for route in routes)
    recent_distance_km = round(sum(route.distance_km for route in routes), 2)
    recent_duration_hours = round(sum(route.moving_time_s for route in routes) / 3600, 2)
    pending_operations = 0
    batch = db.batch()

    def commit_if_needed(force: bool = False) -> None:
        nonlocal batch, pending_operations
        if pending_operations == 0:
            return
        if force or pending_operations >= 430:
            batch.commit()
            batch = db.batch()
            pending_operations = 0

    batch.set(
        user_ref,
        {
            "isStravaConnected": True,
            "stravaLastSyncAt": synced_at,
            "stravaRecentRunCount": len(routes),
            "stravaRecentDistanceKm": recent_distance_km,
            "stravaRecentDurationHours": recent_duration_hours,
            "stravaRoutePointCount": total_points,
            "privacyDefault": "private",
            "updatedAt": synced_at,
        },
        merge=True,
    )
    pending_operations += 1

    for route in routes:
        activity_ref = user_ref.collection("stravaActivities").document(str(route.activity_id))
        batch.set(activity_ref, route_summary_to_firestore(route, synced_at), merge=True)
        pending_operations += 1

        for chunk_index, point_chunk in enumerate(chunked_points(route.points)):
            chunk_ref = activity_ref.collection("routePointChunks").document(f"{chunk_index:04d}")
            batch.set(
                chunk_ref,
                {
                    "chunkIndex": chunk_index,
                    "startIndex": chunk_index * 250,
                    "count": len(point_chunk),
                    "points": [route_point_to_firestore(point) for point in point_chunk],
                    "updatedAt": synced_at,
                },
                merge=True,
            )
            pending_operations += 1
            commit_if_needed()

    commit_if_needed(force=True)

    return {
        "uid": uid,
        "routesSynced": len(routes),
        "routePointsSynced": total_points,
        "recentDistanceKm": recent_distance_km,
        "recentDurationHours": recent_duration_hours,
        "syncedAt": synced_at,
    }


def build_folium_map(routes: list[RunRoute]) -> str:
    if not routes:
        return "<p>No GPS run routes found. Some treadmill/private activities do not expose lat/lng streams.</p>"

    first_point = routes[0].points[0]
    route_map = folium.Map(location=[first_point.lat, first_point.lng], zoom_start=12)
    colors = ["#fc4c02", "#2563eb", "#16a34a", "#9333ea", "#eab308", "#dc2626"]

    for index, route in enumerate(routes):
        coordinates = [(point.lat, point.lng) for point in route.points]
        popup = (
            f"<strong>{route.name}</strong><br>"
            f"{route.distance_km} km<br>"
            f"Avg pace: {format_pace(route.average_pace_min_per_km)}<br>"
            f"{route.start_date or ''}"
        )
        folium.PolyLine(
            coordinates,
            color=colors[index % len(colors)],
            weight=4,
            opacity=0.85,
            tooltip=route.name,
            popup=folium.Popup(popup, max_width=260),
        ).add_to(route_map)

    route_map.fit_bounds([
        [point.lat, point.lng]
        for route in routes
        for point in route.points
    ])
    return route_map._repr_html_()


def render_dashboard(routes: list[RunRoute]) -> str:
    rows = "\n".join(
        f"""
        <tr>
          <td>{route.name}</td>
          <td>{route.distance_km:.2f} km</td>
          <td>{format_pace(route.average_pace_min_per_km)}</td>
          <td>{len(route.points)}</td>
          <td>{route.start_date or ""}</td>
        </tr>
        """
        for route in routes
    )
    map_html = build_folium_map(routes)

    return f"""
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Jogga Strava Route Dashboard</title>
        <style>
          body {{ font-family: system-ui, sans-serif; margin: 0; background: #09090b; color: #fafafa; }}
          header, section {{ max-width: 1100px; margin: 0 auto; padding: 24px; }}
          a, button {{ color: #fc4c02; }}
          table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
          th, td {{ border-bottom: 1px solid #27272a; padding: 10px; text-align: left; }}
          .map {{ background: #18181b; padding: 16px; }}
          .muted {{ color: #a1a1aa; }}
        </style>
      </head>
      <body>
        <header>
          <h1>Jogga Strava Route Dashboard</h1>
          <p class="muted">Read-only Strava Free import. No posting, no feed, no segments.</p>
          <p><a href="/auth/strava">Reconnect Strava</a></p>
        </header>
        <section>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Distance</th>
                <th>Avg pace</th>
                <th>GPS points</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </section>
        <section class="map">{map_html}</section>
      </body>
    </html>
    """


@app.get("/", response_class=HTMLResponse)
def index(limit: int = Query(10, ge=1, le=30)) -> str:
    if not load_tokens():
        return """
        <html>
          <body style="font-family: system-ui; background: #09090b; color: #fafafa; padding: 32px;">
            <h1>Jogga Strava Route Dashboard</h1>
            <p>Connect Strava Free to import runs privately.</p>
            <p><a href="/auth/strava">Connect Strava</a></p>
          </body>
        </html>
        """

    try:
        routes = fetch_run_routes(limit=limit)
    except requests.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Strava API error: {exc}") from exc
    return render_dashboard(routes)


@app.get("/auth/strava")
def auth_strava() -> RedirectResponse:
    return RedirectResponse(build_authorize_url())


@app.get("/auth/strava/callback")
def auth_strava_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error:
        raise HTTPException(status_code=400, detail=f"Strava authorization failed: {error}")
    if not code or not state or state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid Strava OAuth callback")

    oauth_states.discard(state)
    tokens = exchange_code_for_tokens(code)
    save_tokens(tokens)
    return RedirectResponse("/")


@app.get("/api/runs")
def api_runs(limit: int = Query(10, ge=1, le=30)) -> list[dict[str, Any]]:
    routes = fetch_run_routes(limit=limit)
    return [
        {
            "activity_id": route.activity_id,
            "name": route.name,
            "distance_km": route.distance_km,
            "average_pace": format_pace(route.average_pace_min_per_km),
            "start_date": route.start_date,
            "points": [
                {
                    "lat": point.lat,
                    "lng": point.lng,
                    "distance_m": point.distance_m,
                    "elapsed_s": point.elapsed_s,
                    "velocity_mps": point.velocity_mps,
                }
                for point in route.points
            ],
        }
        for route in routes
    ]


@app.post("/api/firebase/sync-strava")
def api_firebase_sync_strava(
    authorization: str | None = Header(default=None),
    limit: int = Query(10, ge=1, le=30),
) -> dict[str, Any]:
    """Fetch Strava routes and write them to Firestore for the Firebase user."""

    uid = verify_firebase_uid(authorization)
    routes = fetch_run_routes(limit=limit)
    return sync_routes_to_firestore(uid, routes)
