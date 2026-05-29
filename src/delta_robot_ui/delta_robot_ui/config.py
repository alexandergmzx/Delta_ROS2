from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from ament_index_python.packages import get_package_share_directory, PackageNotFoundError

from .models import Waypoint


def load_presets(override_path: str = "") -> list[dict[str, Any]]:
    path = _resolve_presets_path(override_path)
    if path is None or not path.exists():
        return []
    with path.open("r", encoding="utf-8") as stream:
        payload = yaml.safe_load(stream) or {}

    presets = []
    for preset in payload.get("presets", []):
        waypoints = [
            Waypoint.from_mapping(item, index).to_dict()
            for index, item in enumerate(preset.get("waypoints", []))
        ]
        presets.append(
            {
                "name": str(preset.get("name", "Preset")).strip(),
                "description": str(preset.get("description", "")).strip(),
                "waypoints": waypoints,
            }
        )
    return presets


def _resolve_presets_path(override_path: str) -> Path | None:
    if override_path:
        return Path(override_path).expanduser()
    try:
        return Path(get_package_share_directory("delta_robot_ui")) / "config" / "presets.yaml"
    except PackageNotFoundError:
        source_path = Path(__file__).resolve().parents[1] / "config" / "presets.yaml"
        return source_path if source_path.exists() else None