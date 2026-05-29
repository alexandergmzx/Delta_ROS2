# Delta ROS2

ROS2 Humble workspace for a parallel-kinematic Delta robot simulation using RViz and a pseudo-serial Arduino emulator.

## Packages

- `delta_robot_description`: URDF, meshes, RViz configuration, and launch files.
- `delta_robot_serial`: inverse kinematics service, joint-state publisher, pseudo-Arduino emulator, and trajectory action server.
- `serial`: vendored C++ serial library used by the pseudo/hardware serial path.

## Build

```bash
cd ~/ros2_ws/colcon_ws
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

Example IK service call:

```bash
ros2 service call /ikin delta_robot_serial/srv/Ikin '{x: 0.0, y: 0.0, z: -100.0}'
```

Example trajectory action goal:

```bash
ros2 action send_goal /trajectory_plan delta_robot_serial/action/PosTraj '{x: 0.0, y: 0.0, z: -100.0}' --feedback
```