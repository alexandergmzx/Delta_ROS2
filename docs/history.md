# Project History — What We Did To Get Here

A chronological record of how the Delta ROS 2 workspace reached its current state. For the forward-looking migration steps and environment setup, see [upgrade_plan.md](upgrade_plan.md).

## Timeline

### 2026-05-29 — Revive the simulation and add the dashboard
- Revived the ROS 2 Delta robot simulation (`1461649`).
- Added the simulation dashboard UI (`c1d459f`) as a vanilla HTML/CSS/JS app under `delta_robot_ui/static/`, then **rebuilt it as a React/Three.js single-page app** under `delta_robot_ui/frontend/` (`8eff7b0`, `deb1f3c`), and tuned it (`762aeca`). Both frontends speak the same FastAPI `/api` + `/ws` contract; the backend serves the React build when present and falls back to the legacy static app otherwise. See [dashboard.md](dashboard.md) for the architecture.

### 2026-05-30 — Motion sync and Mint migration planning
- Fixed dashboard motion synchronization (`9b5f4a4`) — the React in-browser robot view now tracks the live `/joint_states` pose.
- Documented the initial Linux Mint migration setup (`db76a1b`).

### 2026-05-31 — ROS Jazzy migration and Mint bring-up
- Added the ROS Jazzy upgrade plan (`a2ac33a`) — the migration from ROS 2 Humble/Ubuntu 22.04 Jammy to ROS 2 Jazzy/Ubuntu 24.04 Noble.
- Updated the Jazzy migration and simulator startup (`ca59f8f`): `README.md` rewritten for Jazzy/Noble; pseudo-Arduino startup pose fixed so the simulation starts near `z = -100 mm` instead of the old `0,0,0` motor-angle pose; `dashboard_sim.launch.py` reworked.
- Updated the Mint handoff instructions (`f9bf1ff`).
- **Validated the migration in Ubuntu 24.04 WSL2** (ROS 2 Jazzy, Python 3.12, Node.js 20.20.2): four-package `colcon build`, dashboard launch, `/joint_states`, `/ikin`, `/trajectory_plan`, and dashboard `/api/move`.
- **Brought the workspace up natively on the Linux Mint 22 PC** (see next section).

## Mint PC native bring-up (2026-05-31)

The first native Mint build did not work. The C++/Python source needed no changes; the blockers were all in the local Python/venv environment, and were fixed in this order:

1. **`colcon build` died on the first package** — `delta_robot_ui` was never installed, so `ros2 launch delta_robot_ui dashboard_sim.launch.py` reported "package not found" and nothing ran.
2. **`ModuleNotFoundError: No module named 'catkin_pkg'`** — the venv lacked ament's build-time Python deps. Installed `catkin_pkg`, `empy`, and `lark` into the venv.
3. **`em.TransientParseError: not enough data to read`** — `empy` 4.x broke the rosidl template generators. Pinned `empy==3.3.4`.
4. **`relocation R_X86_64_TPOFF32 against ... libpython3.12.a ... can not be used when making a shared object`** — the `.venv` had `home = /usr/local/bin`, so its `sys.base_prefix` resolved to a half-removed source-built Python under `/usr/local`, and the build linked against a non-PIC static `libpython3.12.a` there. Fixed by disabling the stale `/usr/local` Python remnants and **recreating the venv against `/usr/bin/python3.12`** (`base_prefix` now `/usr`).

After those fixes: all four packages built, the full node graph came up (`pseudo_arduino`, `delta_joint_pub`, `robot_state_publisher`, `ikin_server`, `trajectory_plan_server`, `delta_robot_dashboard`, `rviz2`), `/joint_states` published, `/ikin` and `/trajectory_plan` were available, and the dashboard served at `http://127.0.0.1:8080` accepted `/api/move {x:0, y:0, z:-100}`.

The full reproduction steps and the venv gotchas are documented in [upgrade_plan.md](upgrade_plan.md) (Part 6) and in the project `README.md` build-troubleshooting note.

## Still open

- RViz visual correctness on the Mint PC GPU/driver (RViz launches; output not yet verified).
- Real hardware serial on the Mint PC (simulation path validated; hardware path not yet).
- The `/usr/local` source-built Python is renamed-disabled, not removed — a proper cleanup is optional follow-up.
