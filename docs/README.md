# Delta ROS 2 — Documentation

Project documentation: the migration plan and the history of how the workspace got to its current state. For setup, build, and run instructions, see the top-level [`README.md`](../README.md).

## Contents

- [dashboard.md](dashboard.md) — architecture of the `delta_robot_ui` dashboard: the FastAPI + ROS bridge backend, the React/Three.js frontend, the `/api` + `/ws` surface, and the legacy-static-vs-React serving.
- [upgrade_plan.md](upgrade_plan.md) — ROS 2 Humble → Jazzy migration handoff and environment setup, including the Ubuntu 24.04 WSL2 test path and the native Linux Mint 22 bring-up (with the venv/Python build gotchas).
- [history.md](history.md) — chronological record of what has been done to get here.
