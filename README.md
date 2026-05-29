# Delta ROS2

ROS2 Humble workspace for a parallel-kinematic Delta robot simulation using RViz and a pseudo-serial Arduino emulator.

## Packages

- `delta_robot_description`: URDF, meshes, RViz configuration, and launch files.
- `delta_robot_serial`: inverse kinematics service, joint-state publisher, pseudo-Arduino emulator, and trajectory action server.
- `delta_robot_ui`: FastAPI + React browser dashboard for simulation control, live state, waypoint sequences, and demo presets.
- `serial`: vendored C++ serial library used by the pseudo/hardware serial path.

## Python UI Environment

The dashboard uses a workspace-local virtual environment. The `--system-site-packages` flag keeps ROS2 Python packages such as `rclpy` visible inside the venv.

```bash
cd ~/ros2_ws/colcon_ws
python3 -m venv --system-site-packages .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-ui.txt
```

If ROS launches the dashboard with system Python, the dashboard script will automatically re-exec through `.venv/bin/python` when it can find the workspace venv. You can also set `DELTA_ROBOT_UI_PYTHON=/path/to/python` to point at a different interpreter.

## Frontend UI Environment

The React dashboard lives under `src/delta_robot_ui/frontend` and is served by the FastAPI dashboard when a production build exists.

```bash
cd ~/ros2_ws/colcon_ws/src/delta_robot_ui/frontend
npm install
npm run typecheck
npm run build
```

For frontend-only iteration, keep the ROS dashboard running on port 8080 and start Vite in another shell:

```bash
cd ~/ros2_ws/colcon_ws/src/delta_robot_ui/frontend
npm run dev
```

## Build

```bash
cd ~/ros2_ws/colcon_ws
source /opt/ros/humble/setup.bash
. .venv/bin/activate
rosdep install --from-paths src --ignore-src -r -y
colcon build --symlink-install
source install/setup.bash
```

## Run

RViz display with GUI joint sliders:

```bash
ros2 launch delta_robot_description JointStatePublisher.launch
```

Pseudo-Arduino simulation path:

```bash
ros2 launch delta_robot_description PseudoArduino.launch
```

Dashboard only, for an already-running simulation stack:

```bash
ros2 launch delta_robot_ui dashboard.launch.py
```

Full simulation plus dashboard:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py
```

Open the dashboard at <http://127.0.0.1:8080>. The dashboard commands motion through the existing `/ikin`, `/trajectory_plan`, and `/joint_states` ROS interfaces. The in-browser robot view is a live kinematic visualization driven by ROS joint state; RViz remains the full ROS visualization path.

Example IK service call:

```bash
ros2 service call /ikin delta_robot_serial/srv/Ikin '{x: 0.0, y: 0.0, z: -100.0}'
```

Example trajectory action goal:

```bash
ros2 action send_goal /trajectory_plan delta_robot_serial/action/PosTraj '{x: 0.0, y: 0.0, z: -100.0}' --feedback
```

## Dashboard CSV Format

Waypoint CSV files use this header:

```csv
name,x,y,z,dwell_seconds
Center hover,0,0,-100,0.5
```