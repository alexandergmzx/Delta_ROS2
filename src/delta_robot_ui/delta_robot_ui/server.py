from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ament_index_python.packages import PackageNotFoundError, get_package_share_directory
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import Target, ValidationError, Waypoint
from .ros_bridge import BridgeError, DeltaRobotRosBridge
from .sequence_runner import SequenceRunner


PACKAGE_NAME = "delta_robot_ui"
PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"
SOURCE_FRONTEND_DIST_DIR = PACKAGE_DIR.parent / "frontend" / "dist"
WEBSOCKET_INTERVAL_SEC = 0.1


def create_app(
    bridge: DeltaRobotRosBridge,
    sequence_runner: SequenceRunner,
    presets: list[dict[str, Any]],
) -> FastAPI:
    app = FastAPI(title="Delta Robot Dashboard")
    frontend_dist = _frontend_dist_dir()

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    if frontend_dist is not None and (frontend_dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return _index_file(frontend_dist)

    @app.get("/api/state")
    async def state() -> dict[str, Any]:
        return _snapshot(bridge, sequence_runner, presets)

    @app.get("/api/presets")
    async def get_presets() -> dict[str, Any]:
        return {"presets": presets}

    @app.get("/api/trajectory/config")
    async def trajectory_config() -> dict[str, Any]:
        try:
            return await asyncio.to_thread(bridge.trajectory_config)
        except BridgeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/api/trajectory/config")
    async def set_trajectory_config(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            rate_hz = _finite_float(payload.get("trajectory_rate_hz"), "trajectory_rate_hz")
            return await asyncio.to_thread(bridge.set_trajectory_rate_hz, rate_hz)
        except BridgeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/target/check")
    async def check_target(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            target = _target_from_payload(payload)
            return await asyncio.to_thread(bridge.check_target, target)
        except (ValidationError, BridgeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/move")
    async def move(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            target = _target_from_payload(payload)
            return sequence_runner.start_move(target)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/sequence")
    async def sequence(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            items = payload.get("waypoints", [])
            if not isinstance(items, list):
                raise ValidationError("waypoints must be a list")
            waypoints = [Waypoint.from_mapping(item, index) for index, item in enumerate(items)]
            return sequence_runner.start_sequence(waypoints)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/sequence/stop")
    async def stop_sequence() -> dict[str, Any]:
        return sequence_runner.request_stop()

    @app.websocket("/ws")
    async def websocket(websocket: WebSocket) -> None:
        await websocket.accept()
        try:
            while True:
                await websocket.send_json(
                    {
                        "type": "snapshot",
                        "payload": _snapshot(bridge, sequence_runner, presets, include_presets=False),
                    }
                )
                await asyncio.sleep(WEBSOCKET_INTERVAL_SEC)
        except WebSocketDisconnect:
            return

    return app


def _target_from_payload(payload: dict[str, Any]) -> Target:
    target_payload = payload.get("target") if isinstance(payload.get("target"), dict) else payload
    return Target.from_mapping(target_payload)


def _finite_float(value: Any, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be a number") from exc
    if not parsed == parsed or parsed in (float("inf"), float("-inf")):
        raise ValidationError(f"{field_name} must be finite")
    return parsed


def _snapshot(
    bridge: DeltaRobotRosBridge,
    sequence_runner: SequenceRunner,
    presets: list[dict[str, Any]],
    *,
    include_presets: bool = True,
) -> dict[str, Any]:
    state = bridge.state_snapshot()
    snapshot = {
        "state": state,
        "health": bridge.health_snapshot(state),
        "sequence": sequence_runner.status_snapshot(),
    }
    if include_presets:
        snapshot["presets"] = presets
    return snapshot


def _index_file(frontend_dist: Path | None) -> FileResponse:
    if frontend_dist is not None:
        return FileResponse(frontend_dist / "index.html")
    return FileResponse(STATIC_DIR / "index.html")


def _frontend_dist_dir() -> Path | None:
    for candidate in _frontend_dist_candidates():
        if (candidate / "index.html").is_file():
            return candidate
    return None


def _frontend_dist_candidates() -> list[Path]:
    candidates = [SOURCE_FRONTEND_DIST_DIR, PACKAGE_DIR / "frontend" / "dist"]
    try:
        candidates.append(Path(get_package_share_directory(PACKAGE_NAME)) / "frontend" / "dist")
    except PackageNotFoundError:
        pass
    return candidates