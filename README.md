# Delta ROS 2

ROS 2 Jazzy workspace for a parallel-kinematic Delta robot simulation using RViz and a pseudo-serial Arduino emulator.

Project documentation — the migration plan and the history of how we got here — lives in [`docs/`](docs/README.md).

## Packages

- `delta_robot_description`: URDF, meshes, RViz configuration, and launch files.
- `delta_robot_serial`: inverse kinematics service, joint-state publisher, pseudo-Arduino emulator, and trajectory action server.
- `delta_robot_ui`: FastAPI + React browser dashboard for simulation control, live state, waypoint sequences, and demo presets.
- `serial`: vendored C++ serial library used by the pseudo/hardware serial path.

## Supported Environments

Use Ubuntu 24.04 Noble with ROS 2 Jazzy. Linux Mint 22 is also Noble-based and should use ROS 2 Jazzy; if `rosdep` reports that Mint is unsupported, pass `--os=ubuntu:noble` to the `rosdep install` command.

WSL2 Ubuntu 24.04 is a good migration test environment on Windows. The dashboard and simulation stack should run normally; RViz depends on WSLg/GPU support and may need software rendering if graphics are troublesome.

The repository is source-only. After cloning, regenerate the ignored local outputs: `.venv/`, `src/delta_robot_ui/frontend/node_modules/`, `src/delta_robot_ui/frontend/dist/`, `build/`, `install/`, and `log/`.

## System Setup

Install ROS 2 Jazzy Desktop from the official ROS 2 Ubuntu 24.04 instructions, then install the project tools and Node.js 20 LTS:

```bash
sudo apt update
sudo apt install -y git curl build-essential cmake python3-pip python3-venv python3-colcon-common-extensions python3-rosdep socat

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo rosdep init 2>/dev/null || true
rosdep update
```

Clone and install workspace dependencies:

```bash
mkdir -p ~/ros2_ws
cd ~/ros2_ws
git clone <repo-url> colcon_ws
cd colcon_ws

source /opt/ros/jazzy/setup.bash
rosdep install --from-paths src --ignore-src -r -y --rosdistro jazzy
```

On Linux Mint 22, use this `rosdep` form if needed:

```bash
rosdep install --from-paths src --ignore-src -r -y --rosdistro jazzy --os=ubuntu:noble
```

The ROS/package dependencies resolved by `rosdep` include `ament_cmake`, `action_msgs`, `rclcpp`, `rclcpp_action`, `rclcpp_components`, `rclpy`, `rcl_interfaces`, `sensor_msgs`, `std_msgs`, `rosidl_default_generators`, `rosidl_default_runtime`, `launch`, `launch_ros`, `ament_index_python`, `robot_state_publisher`, `joint_state_publisher_gui`, `rviz2`, `rqt_gui`, `xacro`, Eigen, Boost test headers, and `socat`. The `serial` package is vendored in `src/serial` and is built from this repository.

## Python UI Environment

The dashboard uses a workspace-local virtual environment. The `--system-site-packages` flag keeps ROS 2 Python packages such as `rclpy` visible inside the venv. Create the venv with the explicit system interpreter path so it is not bound to some other Python install (see the troubleshooting note below).

```bash
cd ~/ros2_ws/colcon_ws
source /opt/ros/jazzy/setup.bash
/usr/bin/python3.12 -m venv --system-site-packages .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-ui.txt
# Build-time deps that colcon/ament/rosidl need from the venv interpreter:
python -m pip install catkin_pkg "empy==3.3.4" lark
python - <<'PY'
import sys, fastapi, uvicorn, yaml, rclpy, catkin_pkg, em, lark
assert sys.base_prefix == '/usr', f'venv base_prefix is {sys.base_prefix}, expected /usr'
print('Python UI environment OK, empy', em.__version__)
PY
```

If ROS launches the dashboard with system Python, the dashboard script will automatically re-exec through `.venv/bin/python` when it can find the workspace venv. You can also set `DELTA_ROBOT_UI_PYTHON=/path/to/python` to point at a different interpreter.

**Build troubleshooting (venv / Python):** the venv interpreter is what `colcon build` uses for ament's build-time scripts, so it needs `catkin_pkg`, `empy==3.3.4`, and `lark`. Pin `empy` to `3.3.4` — `empy` 4.x breaks the rosidl generators with `em.TransientParseError: not enough data to read`. If `python3 -c "import sys; print(sys.base_prefix)"` prints anything other than `/usr` (e.g. `/usr/local`), the venv is bound to a stale/source-built Python and the `rosidl_generator_py` link step will fail with a non-PIC `libpython3.12.a` relocation error; recreate the venv with `/usr/bin/python3.12 -m venv ...` as shown above.

## Frontend UI Environment

The React dashboard lives under `src/delta_robot_ui/frontend` and is served by the FastAPI dashboard when a production build exists.

```bash
cd ~/ros2_ws/colcon_ws/src/delta_robot_ui/frontend
npm ci
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
source /opt/ros/jazzy/setup.bash
. .venv/bin/activate
rosdep install --from-paths src --ignore-src -r -y --rosdistro jazzy
colcon build --symlink-install --cmake-clean-cache
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

Stop an existing simulation launch with `Ctrl+C` before starting another one. The simulation uses fixed pseudo-serial links and dashboard port 8080 by default, so a second simultaneous launch can make the new dashboard process exit with a port-in-use error and can confuse the pseudo-serial stream.

The pseudo-Arduino starts at a commandable center-hover pose by default. Override the initial pose if you want the live state to begin somewhere else:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py initial_x:=0.0 initial_y:=0.0 initial_z:=-110.0
```

Preset motion speed can be tuned without rebuilding:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py trajectory_rate_hz:=10.0 trajectory_steps:=10
```

Open the dashboard at <http://127.0.0.1:8080>. The dashboard commands motion through the existing `/ikin`, `/trajectory_plan`, and `/joint_states` ROS interfaces. The in-browser robot view is a live kinematic visualization driven by ROS joint state; RViz remains the full ROS visualization path.

If RViz has graphics trouble under WSL2, try one of these in a terminal before launching RViz:

```bash
export LIBGL_ALWAYS_SOFTWARE=true
export QT_QPA_PLATFORM=xcb
```

Useful runtime checks:

```bash
ros2 topic list
ros2 service list
ros2 action list
ros2 interface show delta_robot_serial/srv/Ikin
ros2 interface show delta_robot_serial/action/PosTraj
```

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

## Acknowledgments

The delta-robot physics, the inverse-kinematics math, and the Arduino firmware/pseudo-Arduino emulation were developed together with **Armando Rodriguez** ([@armandorodb](https://github.com/armandorodb)), robotics engineer.