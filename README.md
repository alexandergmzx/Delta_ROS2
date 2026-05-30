# Delta ROS2

ROS2 Humble workspace for a parallel-kinematic Delta robot simulation using RViz and a pseudo-serial Arduino emulator.

## Packages

- `delta_robot_description`: URDF, meshes, RViz configuration, and launch files.
- `delta_robot_serial`: inverse kinematics service, joint-state publisher, pseudo-Arduino emulator, and trajectory action server.
- `delta_robot_ui`: FastAPI + React browser dashboard for simulation control, live state, waypoint sequences, and demo presets.
- `serial`: vendored C++ serial library used by the pseudo/hardware serial path.

## Linux Mint Clone Setup

Use Linux Mint 21.x, which is based on Ubuntu 22.04 Jammy, with ROS 2 Humble. Linux Mint 22.x is based on Ubuntu 24.04 Noble, so ROS 2 Humble apt packages are not the natural target there; use Mint 21.x, Ubuntu 22.04, or a Jammy/Humble container for the least friction.

The repository is source-only. After cloning, regenerate the ignored local outputs: `.venv/`, `src/delta_robot_ui/frontend/node_modules/`, `src/delta_robot_ui/frontend/dist/`, `build/`, `install/`, and `log/`.

Install the base development tools, ROS 2 Humble, and Node.js 20 LTS:

```bash
sudo apt update
sudo apt install -y git curl build-essential cmake python3-pip python3-venv python3-colcon-common-extensions python3-rosdep

# Install ROS 2 Humble Desktop from the official ROS 2 Ubuntu 22.04 instructions.
# Install Node.js >= 18; Node.js 20 LTS is recommended for Vite.
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

source /opt/ros/humble/setup.bash
rosdep install --from-paths src --ignore-src -r -y --rosdistro humble --os=ubuntu:jammy
```

The ROS/package dependencies resolved by `rosdep` include `ament_cmake`, `action_msgs`, `rclcpp`, `rclcpp_action`, `rclcpp_components`, `rclpy`, `rcl_interfaces`, `sensor_msgs`, `std_msgs`, `rosidl_default_generators`, `rosidl_default_runtime`, `launch`, `launch_ros`, `ament_index_python`, `robot_state_publisher`, `joint_state_publisher_gui`, `rviz2`, `rqt_gui`, `xacro`, Eigen, Boost test headers, and `socat`. The `serial` package is vendored in `src/serial` and is built from this repository.

Set up the dashboard backend and frontend:

```bash
python3 -m venv --system-site-packages .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-ui.txt

cd src/delta_robot_ui/frontend
npm ci
npm run typecheck
npm run build
cd ../../..
```

Build and run:

```bash
source /opt/ros/humble/setup.bash
. .venv/bin/activate
colcon build --symlink-install
source install/setup.bash
ros2 launch delta_robot_ui dashboard_sim.launch.py
```

Open the dashboard at <http://127.0.0.1:8080>.

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

Preset motion speed can be tuned without rebuilding:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py trajectory_rate_hz:=10.0 trajectory_steps:=10
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