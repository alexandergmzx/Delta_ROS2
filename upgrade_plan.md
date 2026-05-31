# ROS Jazzy Upgrade Plan

This note is a handoff for migrating this workspace from ROS 2 Humble on Ubuntu 22.04/Jammy to ROS 2 Jazzy on Ubuntu 24.04/Noble. The immediate goal is to test the migration first on this Windows PC using a separate Ubuntu 24.04 WSL2 distro, then repeat the same setup on Linux Mint 22.

When resuming after cloning the repository in Ubuntu 24.04, read this file first.

## Current Project Snapshot

Current workspace assumption: ROS 2 Humble on Ubuntu 22.04/Jammy.

Packages in `src/`:

- `serial`: vendored C++ serial library, `ament_cmake`.
- `delta_robot_serial`: C++ ROS package with inverse kinematics service, joint-state publisher, pseudo-Arduino emulator, and trajectory action server.
- `delta_robot_description`: URDF, meshes, RViz config, launch files, `ament_cmake` data package.
- `delta_robot_ui`: Python/FastAPI plus React dashboard, `ament_python`.

Important migration observations:

- ROS Jazzy is the natural target for Ubuntu 24.04 Noble and Linux Mint 22.
- This looks like an environment/toolchain migration more than a deep ROS API rewrite.
- Main risks are stale Humble paths, Python 3.12 packaging, RViz under WSLg, serial/socat behavior, and WSL2 USB passthrough for real hardware.
- Do not reuse old generated outputs from the Humble workspace.

## High-Level Strategy

Use a side-by-side Ubuntu 24.04 WSL2 distro. Keep the current Ubuntu 22.04/Humble distro untouched as a fallback.

Preferred approach:

1. Set up a fresh Ubuntu 24.04 WSL2 environment on Windows.
2. Install ROS 2 Jazzy from official deb packages.
3. Install this project dependencies.
4. Clone the repository source only.
5. Continue with repo edits, dependency checks, Jazzy build, and runtime validation.

Do not upgrade the existing Ubuntu 22.04 distro in place unless there is a separate reason to do so.

## Part 1: Create A Safe Ubuntu 24.04 WSL2 Test Environment

Run these from Windows PowerShell.

First check the current WSL state:

```powershell
wsl --update
wsl --list --verbose
wsl --list --online
```

Install Ubuntu 24.04 if it is available in the online list:

```powershell
wsl --install -d Ubuntu-24.04
```

If the distro name is slightly different in `wsl --list --online`, use the exact listed name.

After install, verify it is WSL2:

```powershell
wsl --list --verbose
```

If Ubuntu 24.04 is not version 2, set it to WSL2:

```powershell
wsl --set-version Ubuntu-24.04 2
```

Optional rollback backup of the old Ubuntu 22.04 distro:

```powershell
wsl --export Ubuntu-22.04 C:\Users\YOUR_WINDOWS_USER\Desktop\ubuntu-22.04-humble-backup.tar
```

Notes:

- Do not unregister or delete the existing Ubuntu 22.04 distro.
- Keep source checkouts inside the Linux filesystem, such as `/home/<user>/ros2_ws`, not under `/mnt/c`.
- If WSL GUI apps are needed for RViz, update WSL and GPU drivers. RViz may still need software rendering later.

## Part 2: Install ROS 2 Jazzy On Ubuntu 24.04

Open the new Ubuntu 24.04 WSL distro and run these commands.

Set locale:

```bash
sudo apt update
sudo apt install -y locales
sudo locale-gen en_US en_US.UTF-8
sudo update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
export LANG=en_US.UTF-8
locale
```

Enable required repositories and install the ROS apt source package:

```bash
sudo apt install -y software-properties-common curl
sudo add-apt-repository universe
sudo apt update
export ROS_APT_SOURCE_VERSION=$(curl -s https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest | grep -F "tag_name" | awk -F'"' '{print $4}')
curl -L -o /tmp/ros2-apt-source.deb "https://github.com/ros-infrastructure/ros-apt-source/releases/download/${ROS_APT_SOURCE_VERSION}/ros2-apt-source_${ROS_APT_SOURCE_VERSION}.$(. /etc/os-release && echo ${UBUNTU_CODENAME:-${VERSION_CODENAME}})_all.deb"
sudo dpkg -i /tmp/ros2-apt-source.deb
sudo apt update
```

Check that Noble updates/backports are enabled:

```bash
grep Suites /etc/apt/sources.list.d/ubuntu.sources
```

The `Suites:` line should include:

```text
noble noble-updates noble-backports
```

If `noble-updates` or `noble-backports` are missing, edit the file:

```bash
sudo nano /etc/apt/sources.list.d/ubuntu.sources
```

Then update and upgrade:

```bash
sudo apt clean
sudo apt update
sudo apt full-upgrade -y
```

Install ROS Jazzy Desktop and development tools:

```bash
sudo apt install -y ros-jazzy-desktop ros-dev-tools
```

Source Jazzy for the current terminal:

```bash
source /opt/ros/jazzy/setup.bash
```

Optional shell convenience:

```bash
echo 'source /opt/ros/jazzy/setup.bash' >> ~/.bashrc
```

Basic ROS check:

```bash
ros2 --version
printenv ROS_DISTRO
```

Expected `ROS_DISTRO`:

```text
jazzy
```

## Part 3: Install Project System Tools

Install general build and project tools:

```bash
sudo apt update
sudo apt install -y git curl build-essential cmake python3-pip python3-venv python3-colcon-common-extensions python3-rosdep socat
```

Initialize rosdep if needed:

```bash
sudo rosdep init 2>/dev/null || true
rosdep update
```

Install Node.js 20 LTS for the React/Vite dashboard:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Expected Node major version: 20 or newer.

Avoid mixing ROS apt Python with conda or pyenv in this environment. The project uses a `.venv` later, but it should be created with `--system-site-packages` so it can see `rclpy` from the apt-installed ROS Jazzy environment.

## Part 4: Clone The Repository Source Only

Create a workspace directory under the Ubuntu 24.04 Linux home directory:

```bash
mkdir -p ~/ros2_ws
cd ~/ros2_ws
```

Clone the repository:

```bash
git clone <repo-url> colcon_ws
cd colcon_ws
```

After clone, check that only source-controlled files are present. These should be regenerated later and should not be copied from the old Humble workspace:

- `.venv/`
- `build/`
- `install/`
- `log/`
- `src/delta_robot_ui/frontend/node_modules/`
- `src/delta_robot_ui/frontend/dist/`

If any of those appear because of a manual copy, remove them before the Jazzy build.

At this point, resume from VS Code connected to the new Ubuntu 24.04 WSL workspace and say something like:

```text
I cloned the repo in Ubuntu 24.04 WSL2. Please read upgrade_plan.md and continue the ROS Jazzy migration from Part 5.
```

## Part 5: Repo Updates For Jazzy/Noble

These are the next tasks after the first four parts are complete.

Update documentation and editor config:

- Update `README.md` from Humble/Jammy instructions to Jazzy/Noble instructions.
- Mention that Linux Mint 22 may need `rosdep --os=ubuntu:noble`.
- Update `src/.vscode/settings.json` from `/opt/ros/humble/...python3.10...` to Jazzy/Python 3.12 paths.
- Update `src/.vscode/c_cpp_properties.json` from `/opt/ros/humble` and stale absolute paths to `/opt/ros/jazzy` and current workspace paths.
- Set C++ IntelliSense to C++17.

Likely Python paths for Jazzy on Ubuntu 24.04:

```text
/opt/ros/jazzy/lib/python3.12/site-packages
/opt/ros/jazzy/local/lib/python3.12/dist-packages
```

## Part 6: Build Compatibility Pass

Only change code if the Jazzy build or rosdep check proves it is needed.

Possible low-risk changes:

- Add explicit C++17 compile features to `src/delta_robot_serial/CMakeLists.txt`.
- Add explicit C++17 compile features to `src/serial/CMakeLists.txt` if Noble/GCC complains.
- Fix manifest dependency keys only if `rosdep install --rosdistro jazzy` reports unresolved dependencies.

Files to inspect first:

- `src/delta_robot_serial/package.xml`
- `src/delta_robot_serial/CMakeLists.txt`
- `src/serial/CMakeLists.txt`
- `src/delta_robot_ui/package.xml`
- `src/delta_robot_ui/setup.py`
- `requirements-ui.txt`

## Part 7: Recreate Python UI Environment

From the repo root in Ubuntu 24.04:

```bash
source /opt/ros/jazzy/setup.bash
python3 -m venv --system-site-packages .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-ui.txt
python - <<'PY'
import fastapi
import uvicorn
import yaml
import rclpy
print('Python UI environment OK')
PY
```

If Python package versions cause issues on Python 3.12, pin minimum versions in `requirements-ui.txt` after confirming the failing package.

## Part 8: Rebuild Frontend Assets

From the repo root:

```bash
cd src/delta_robot_ui/frontend
npm ci
npm run typecheck
npm run build
cd ../../..
```

The frontend `dist/` should be generated fresh on Ubuntu 24.04.

## Part 9: Resolve Dependencies And Build

From the repo root:

```bash
source /opt/ros/jazzy/setup.bash
. .venv/bin/activate
rosdep update
rosdep install --from-paths src --ignore-src -r -y --rosdistro jazzy
colcon build --symlink-install --cmake-clean-cache
source install/setup.bash
```

For Linux Mint 22, if rosdep says Mint is unsupported, use:

```bash
rosdep install --from-paths src --ignore-src -r -y --rosdistro jazzy --os=ubuntu:noble
```

## Part 10: Validate Simulation In WSL2

After build:

```bash
source /opt/ros/jazzy/setup.bash
. .venv/bin/activate
source install/setup.bash
ros2 launch delta_robot_ui dashboard_sim.launch.py
```

Open:

```text
http://127.0.0.1:8080
```

Verify:

- `pseudo_arduino` starts.
- `delta_joint_pub` publishes `/joint_states`.
- `robot_state_publisher` starts.
- RViz opens or at least the rest of the stack runs if RViz has WSL graphics trouble.
- `/ikin` service is available.
- `/trajectory_plan` action is available.
- Dashboard loads and can command motion.

Useful checks in another terminal:

```bash
source /opt/ros/jazzy/setup.bash
source ~/ros2_ws/colcon_ws/install/setup.bash
ros2 topic list
ros2 service list
ros2 action list
ros2 interface show delta_robot_serial/srv/Ikin
ros2 interface show delta_robot_serial/action/PosTraj
```

If RViz fails under WSL2, try:

```bash
LIBGL_ALWAYS_SOFTWARE=true rviz2
```

or:

```bash
QT_QPA_PLATFORM=xcb rviz2
```

## Part 11: Optional Hardware Serial In WSL2

Simulation should pass first. Hardware is a second layer.

On Windows, install `usbipd-win`. Then from PowerShell:

```powershell
usbipd list
usbipd bind --busid <busid>
usbipd attach --wsl --busid <busid>
```

Inside Ubuntu 24.04 WSL:

```bash
lsusb
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

If access is denied:

```bash
sudo usermod -a -G dialout $USER
```

Then restart the WSL session.

Run the launch with the detected device path:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py serial_port:=/dev/ttyACM0
```

or:

```bash
ros2 launch delta_robot_ui dashboard_sim.launch.py serial_port:=/dev/ttyUSB0
```

## Part 12: Repeat On Linux Mint 22

After WSL2 passes, use the same source-only process on Linux Mint 22.

Important Mint 22 notes:

- Mint 22 is Ubuntu 24.04 Noble-based.
- ROS Jazzy is the right ROS 2 target.
- Use native Linux serial permissions instead of `usbipd-win`.
- If rosdep identifies the OS as Mint and refuses, add `--os=ubuntu:noble`.

## Known Watch Points

- `README.md` currently describes Humble/Jammy and Mint 21. It should be updated after Jazzy is proven.
- `src/.vscode/settings.json` currently points at Humble Python 3.10 paths.
- `src/.vscode/c_cpp_properties.json` currently points at Humble and stale absolute workspace include paths.
- `src/delta_robot_serial/src/pseudo_arduino.cpp` hardcodes `~/socatpty1` and `~/socatpty2` for pseudo serial.
- `src/delta_robot_serial/src/delta_joint_pub.cpp` expands `$(env HOME)/socatpty1` for the pseudo serial path.
- The launch path `src/delta_robot_ui/launch/dashboard_sim.launch.py` is the main end-to-end simulation test.

## Online Sources Checked

- ROS Jazzy release notes: `https://docs.ros.org/en/jazzy/Releases/Release-Jazzy-Jalisco.html`
- ROS Jazzy Ubuntu deb install: `https://docs.ros.org/en/jazzy/Installation/Ubuntu-Install-Debs.html`
- ROS Jazzy Ubuntu source setup notes: `https://docs.ros.org/en/jazzy/Installation/Alternatives/Ubuntu-Development-Setup.html`
- ROS installation troubleshooting: `https://docs.ros.org/en/jazzy/How-To-Guides/Installation-Troubleshooting.html`
- Multiple RMW implementations: `https://docs.ros.org/en/jazzy/How-To-Guides/Working-with-multiple-RMW-implementations.html`
- WSL install: `https://learn.microsoft.com/en-us/windows/wsl/install`
- WSL GUI apps: `https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps`
- WSL USB devices: `https://learn.microsoft.com/en-us/windows/wsl/connect-usb`
- usbipd-win WSL support: `https://github.com/dorssel/usbipd-win/wiki/WSL-support`
