from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import Target, ValidationError, Waypoint
from .ros_bridge import BridgeError, DeltaRobotRosBridge
from .sequence_runner import SequenceRunner


STATIC_DIR = Path(__file__).with_name("static")


def create_app(
    bridge: DeltaRobotRosBridge,
    sequence_runner: SequenceRunner,
    presets: list[dict[str, Any]],
) -> FastAPI:
    app = FastAPI(title="Delta Robot Dashboard")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/state")
    async def state() -> dict[str, Any]:
        return _snapshot(bridge, sequence_runner, presets)

    @app.get("/api/presets")
    async def get_presets() -> dict[str, Any]:
        return {"presets": presets}

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
                await websocket.send_json(_snapshot(bridge, sequence_runner, presets))
                await asyncio.sleep(0.25)
        except WebSocketDisconnect:
            return

    return app


def _target_from_payload(payload: dict[str, Any]) -> Target:
    target_payload = payload.get("target") if isinstance(payload.get("target"), dict) else payload
    return Target.from_mapping(target_payload)


def _snapshot(
    bridge: DeltaRobotRosBridge,
    sequence_runner: SequenceRunner,
    presets: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "state": bridge.state_snapshot(),
        "health": bridge.health_snapshot(),
        "sequence": sequence_runner.status_snapshot(),
        "presets": presets,
    }