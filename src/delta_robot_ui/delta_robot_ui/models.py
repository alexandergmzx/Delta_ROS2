from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any


MIN_MOTOR_ANGLE_DEG = 0.0
MAX_MOTOR_ANGLE_DEG = 90.0
MOTOR_JOINT_INDEXES = (3, 6, 9)


class ValidationError(ValueError):
    """Raised when dashboard input cannot be converted into a safe command."""


@dataclass(frozen=True)
class Target:
    x: float
    y: float
    z: float

    @classmethod
    def from_mapping(cls, payload: dict[str, Any]) -> "Target":
        return cls(
            x=_finite_float(payload.get("x"), "x"),
            y=_finite_float(payload.get("y"), "y"),
            z=_finite_float(payload.get("z"), "z"),
        )

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass(frozen=True)
class Waypoint:
    name: str
    target: Target
    dwell_seconds: float = 0.0

    @classmethod
    def from_mapping(cls, payload: dict[str, Any], index: int = 0) -> "Waypoint":
        target_payload = payload.get("target") if isinstance(payload.get("target"), dict) else payload
        name = str(payload.get("name") or f"Waypoint {index + 1}").strip()
        dwell_seconds = _finite_float(payload.get("dwell_seconds", 0.0), "dwell_seconds")
        if dwell_seconds < 0.0:
            raise ValidationError("dwell_seconds must be zero or greater")
        return cls(name=name[:80], target=Target.from_mapping(target_payload), dwell_seconds=dwell_seconds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target.to_dict(),
            "dwell_seconds": self.dwell_seconds,
        }


def angles_are_commandable(angles: list[float]) -> bool:
    return all(
        math.isfinite(angle) and MIN_MOTOR_ANGLE_DEG <= angle <= MAX_MOTOR_ANGLE_DEG
        for angle in angles
    )


def _finite_float(value: Any, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be a number") from exc
    if not math.isfinite(parsed):
        raise ValidationError(f"{field_name} must be finite")
    return parsed