from __future__ import annotations

from copy import deepcopy
import threading
import time
from typing import Any

from action_msgs.msg import GoalStatus

from .models import Target, Waypoint
from .ros_bridge import BridgeError, DeltaRobotRosBridge


class SequenceRunner:
    def __init__(self, bridge: DeltaRobotRosBridge) -> None:
        self._bridge = bridge
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop_requested = threading.Event()
        self._status: dict[str, Any] = {
            "running": False,
            "phase": "idle",
            "active_index": None,
            "total": 0,
            "message": "Ready",
            "feedback": None,
            "last_result": None,
            "stop_requested": False,
        }

    def status_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self._status)

    def start_move(self, target: Target) -> dict[str, Any]:
        waypoint = Waypoint(name="Manual move", target=target, dwell_seconds=0.0)
        return self.start_sequence([waypoint])

    def start_sequence(self, waypoints: list[Waypoint]) -> dict[str, Any]:
        if not waypoints:
            raise ValueError("At least one waypoint is required")
        with self._lock:
            if self._status["running"]:
                return {"accepted": False, "message": "A sequence is already running"}
            self._stop_requested.clear()
            self._status = {
                "running": True,
                "phase": "queued",
                "active_index": None,
                "total": len(waypoints),
                "message": "Sequence queued",
                "feedback": None,
                "last_result": None,
                "stop_requested": False,
            }
            self._thread = threading.Thread(target=self._run_sequence, args=(waypoints,), daemon=True)
            self._thread.start()
        return {"accepted": True, "message": "Sequence started"}

    def request_stop(self) -> dict[str, Any]:
        self._stop_requested.set()
        with self._lock:
            self._status["stop_requested"] = True
            if self._status["running"]:
                self._status["message"] = "Stop requested after current waypoint"
                return {"accepted": True, "message": self._status["message"]}
        return {"accepted": False, "message": "No sequence is running"}

    def _run_sequence(self, waypoints: list[Waypoint]) -> None:
        final_phase = "complete"
        final_message = "Sequence complete"
        try:
            for index, waypoint in enumerate(waypoints):
                if self._stop_requested.is_set():
                    final_phase = "stopped"
                    final_message = "Sequence stopped before next waypoint"
                    break

                self._set_status(
                    phase="validating",
                    active_index=index,
                    message=f"Validating {waypoint.name}",
                    feedback=None,
                )
                ik_result = self._bridge.check_target(waypoint.target)
                if not ik_result["reachable"]:
                    final_phase = "failed"
                    final_message = f"{waypoint.name} is not commandable"
                    self._set_status(last_result=ik_result)
                    break

                self._set_status(phase="moving", message=f"Moving to {waypoint.name}")
                result = self._bridge.execute_target(waypoint.target, self._set_feedback)
                self._set_status(last_result=result)
                if result["status"] != GoalStatus.STATUS_SUCCEEDED:
                    final_phase = "failed"
                    final_message = f"{waypoint.name} {result['status_text']}"
                    break

                if waypoint.dwell_seconds > 0.0 and not self._stop_requested.is_set():
                    self._set_status(phase="dwell", message=f"Dwelling at {waypoint.name}")
                    dwell_until = time.monotonic() + waypoint.dwell_seconds
                    while time.monotonic() < dwell_until and not self._stop_requested.is_set():
                        time.sleep(0.05)

            if self._stop_requested.is_set() and final_phase == "complete":
                final_phase = "stopped"
                final_message = "Sequence stopped after current waypoint"
        except BridgeError as exc:
            final_phase = "failed"
            final_message = str(exc)
        except Exception as exc:  # noqa: BLE001 - keep dashboard thread alive and report failure.
            final_phase = "failed"
            final_message = f"Sequence error: {exc}"
        finally:
            self._set_status(
                running=False,
                phase=final_phase,
                active_index=None,
                message=final_message,
                stop_requested=self._stop_requested.is_set(),
            )

    def _set_feedback(self, feedback: dict[str, float]) -> None:
        self._set_status(feedback=feedback)

    def _set_status(self, **updates: Any) -> None:
        with self._lock:
            self._status.update(updates)