# Dashboard Architecture

How the `delta_robot_ui` browser dashboard is put together: a FastAPI service that
bridges the existing ROS 2 simulation interfaces to a React/Three.js single-page app.
For build and run instructions see the top-level [`README.md`](../README.md); for the
chronology of how it was built see [history.md](history.md).

The dashboard never talks to the robot directly. It drives motion only through the
existing ROS interfaces — the `/ikin` and `/ikin_check` services, the `/trajectory_plan`
action, and the `/joint_states` topic — so it is just another ROS client on top of the
same simulation/hardware stack that RViz uses.

## Components

```
browser (React + Three.js)
   │  REST  /api/*        WebSocket  /ws
   ▼
FastAPI app  (server.py)
   ├── DeltaRobotRosBridge  (ros_bridge.py)  ── ROS node: subscribes /joint_states,
   │                                            calls /ikin + /ikin_check, sends
   │                                            /trajectory_plan goals, reads/sets the
   │                                            trajectory server parameters
   └── SequenceRunner       (sequence_runner.py) ── background thread that validates and
                                                    executes waypoints one at a time
```

### Backend

- **`server.py`** — builds the FastAPI app and defines the HTTP/WebSocket surface. It
  serves the React production build (`frontend/dist`) when one exists and falls back to
  the legacy vanilla-JS UI under `static/` otherwise (see "Two frontends" below).
- **`ros_bridge.py` — `DeltaRobotRosBridge`** — the ROS node. It caches the most recent
  `/joint_states` message under a lock and exposes thread-safe snapshots
  (`state_snapshot`, `health_snapshot`), converts the first three joint positions from
  metres to millimetres for the `position_mm` reading, validates targets via
  `/ikin_check`, executes targets via the `/trajectory_plan` action, and reads/writes the
  trajectory server's `trajectory_rate_hz` / `trajectory_steps` parameters. All ROS calls
  go through `_wait_for_future`, which bridges rclpy's async futures to blocking calls
  with a timeout so a stalled ROS call can't hang an HTTP request forever.
- **`sequence_runner.py` — `SequenceRunner`** — runs a list of waypoints on a single
  daemon thread. For each waypoint it validates reachability, sends the trajectory goal,
  optionally dwells, and publishes a `status` snapshot (phase, active index, feedback,
  last result). A `start_move` is just a one-waypoint sequence. Only one sequence runs at
  a time; `request_stop` sets a flag that is honoured between waypoints (it does not abort
  a goal mid-flight).
- **`models.py`** — `Target` and `Waypoint` value objects plus validation and the
  motor-angle commandability check used to decide whether a target is reachable.
- **`config.py` / presets** — demo motion presets are loaded from
  `config/presets.yaml` and exposed read-only over the API.

### Frontend (React rebuild)

Under `src/delta_robot_ui/frontend`, built with Vite + TypeScript:

- **State** lives in a single Zustand store (`store/dashboardStore.ts`) — the snapshot,
  presets, the manual target, the draft/saved sequences, and connection/busy/error flags.
  All API calls and the live socket lifecycle are actions on that store.
- **Live state** comes from the `/ws` WebSocket: the backend pushes a snapshot every
  ~100 ms and the store replaces its `snapshot` on each message, flipping the connection
  indicator between `connecting` / `live` / `offline`.
- **3D view** (`components/RobotScene.tsx`) is a React Three Fiber / drei scene that
  renders the robot pose from the live joint state — an in-browser kinematic
  visualization, lazy-loaded so the rest of the UI shows immediately. RViz remains the
  full ROS visualization path.
- **Controls** — `TargetControl` (manual X/Y/Z move + reachability check),
  `SequencePanel` (build, save, import/export, and run waypoint sequences), and
  `StatusBar` (health pills). Saved sequences are persisted client-side in
  `localStorage`; presets are server-side.
- **CSV** waypoint import/export uses the `name,x,y,z,dwell_seconds` format documented in
  the README.

## HTTP / WebSocket surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Serve the SPA index (React build, else legacy static) |
| GET | `/api/state` | One-shot dashboard snapshot (state + health + sequence + presets) |
| GET | `/api/presets` | Demo motion presets |
| GET/POST | `/api/trajectory/config` | Read / set `trajectory_rate_hz` on the trajectory server |
| POST | `/api/target/check` | Validate a target against `/ikin_check` |
| POST | `/api/move` | Start a single-waypoint move |
| POST | `/api/sequence` | Start a multi-waypoint sequence |
| POST | `/api/sequence/stop` | Request a stop after the current waypoint |
| WS | `/ws` | Snapshot stream (~10 Hz), no presets payload |

## Standalone (ROS-less) mode

The React frontend can also run entirely in the browser with no backend and no ROS —
used to publish the simulator on a static website, and as a graceful fallback when the
FastAPI server is unreachable.

- **Seam** — components only ever talk to the Zustand store, and the store imports its
  nine API functions from the `src/api/index.ts` facade. The facade delegates either to
  the live REST/WebSocket client (`api/client.ts`, unchanged) or to an in-browser
  implementation under `src/standalone/` that mirrors the backend's payloads and message
  strings exactly.
- **In-browser simulator** (`standalone/engine.ts`) — replicates `SequenceRunner` and the
  trajectory action server: linear interpolation in `trajectory_steps` increments at
  `trajectory_rate_hz`, per-step commandability checks, dwell handling, and stop honoured
  between waypoints. Snapshots stream to the store every 100 ms like the `/ws` socket.
- **Kinematics** (`standalone/kinematics.ts`) — a TypeScript port of
  `delta_robot_serial/include/inverse_kinematics.h` (math by Armando Rodriguez); keep the
  two in sync. Reachability uses the same 0–90° motor-angle window as `models.py` and
  `ikin_server.cpp`.
- **Presets** — bundled at build time from `config/presets.yaml` via `@rollup/plugin-yaml`
  (`standalone/presets.ts`), so the YAML stays the single source of truth.
- **Mode selection** — `npm run build:standalone` (or `dev:standalone`) loads
  `.env.standalone`, which sets `VITE_STANDALONE=true` and hard-selects the simulator;
  the bundle is emitted to `dist-standalone/` with a relative base so it can be hosted
  from any subdirectory. The normal build is untouched (`dist/`, served by `server.py`),
  but if the very first API call fails at the network level it silently falls back to
  standalone mode and shows a "Demo mode" pill instead of the ROS health pills. HTTP
  errors (backend up, ROS down) do not trigger the fallback.
- **Publishing** — `npm run sync:site` builds the standalone bundle and copies it into
  the al-folio website checkout (`assets/delta_sim/`, override the location with
  `AL_FOLIO_DIR`), where it is embedded at `/projects/01_delta_robot/sim/`.

Possible future upgrades: render the real URDF in the browser with
[urdf-loader](https://github.com/gkjohnson/urdf-loaders), full parallel-linkage pose /
drag-the-effector interaction via
[closed-chain-ik-js](https://github.com/gkjohnson/closed-chain-ik-js), or a rosbridge
"connect to robot" option (needs `wss://` and site CSP changes).

## Two frontends (legacy static vs React)

The first dashboard (commit `c1d459f`) was a vanilla HTML/CSS/JS app under
`delta_robot_ui/static/`. It was then rebuilt as the React/Three.js SPA under
`frontend/` (commits `8eff7b0`, `deb1f3c`, `9b5f4a4`). Both speak the same `/api` + `/ws`
contract, so the backend is unchanged between them. `server.py` prefers the React
production build (`frontend/dist`) and only serves the `static/` app when no build is
present, which keeps the dashboard working out of the box before anyone runs `npm build`.

## Notable design choices

- **ROS-only control path** — the dashboard reuses `/ikin`, `/ikin_check`,
  `/trajectory_plan`, and `/joint_states` rather than introducing a new control channel,
  so simulation and (future) hardware behave identically and RViz stays valid.
- **Snapshot-over-WebSocket** instead of per-field events — the backend pushes a full
  state snapshot at a fixed rate and the store does a wholesale replace. Simple, and the
  payload is small.
- **Bounded ROS calls** — every service/action call is wrapped with a timeout so the web
  layer degrades to a 503/health-down state instead of hanging when a ROS node is absent.
- **Single-flight sequence runner on its own thread** — keeps the FastAPI event loop free
  and serializes motion so two sequences can't fight over the robot.
