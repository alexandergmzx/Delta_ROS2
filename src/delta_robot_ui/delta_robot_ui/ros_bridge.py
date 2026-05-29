from __future__ import annotations

import math
import threading
import time
from typing import Any, Callable

from action_msgs.msg import GoalStatus
from delta_robot_serial.action import PosTraj
from delta_robot_serial.srv import Ikin
from rclpy.action import ActionClient
from rclpy.node import Node
from sensor_msgs.msg import JointState

from .models import MOTOR_JOINT_INDEXES, Target, angles_are_commandable


class BridgeError(RuntimeError):
    """Raised when the dashboard cannot complete a ROS operation."""


class DeltaRobotRosBridge(Node):
    def __init__(self) -> None:
        super().__init__("delta_robot_dashboard")
        self.declare_parameter("host", "127.0.0.1")
        self.declare_parameter("port", 8080)
        self.declare_parameter("presets_file", "")
        self.declare_parameter("ik_service", "/ikin")
        self.declare_parameter("trajectory_action", "/trajectory_plan")
        self.declare_parameter("joint_states_topic", "/joint_states")
        self.declare_parameter("state_stale_after", 1.0)
        self.declare_parameter("ros_timeout_sec", 2.0)

        self.host = self.get_parameter("host").value
        self.port = int(self.get_parameter("port").value)
        self.presets_file = self.get_parameter("presets_file").value
        self.state_stale_after = float(self.get_parameter("state_stale_after").value)
        self.ros_timeout_sec = float(self.get_parameter("ros_timeout_sec").value)

        ik_service = self.get_parameter("ik_service").value
        trajectory_action = self.get_parameter("trajectory_action").value
        joint_states_topic = self.get_parameter("joint_states_topic").value

        self._lock = threading.Lock()
        self._last_joint_msg: JointState | None = None
        self._last_joint_monotonic: float | None = None

        self._joint_subscription = self.create_subscription(
            JointState,
            joint_states_topic,
            self._joint_state_callback,
            10,
        )
        self._ikin_client = self.create_client(Ikin, ik_service)
        self._trajectory_client = ActionClient(self, PosTraj, trajectory_action)

    def _joint_state_callback(self, msg: JointState) -> None:
        with self._lock:
            self._last_joint_msg = msg
            self._last_joint_monotonic = time.monotonic()

    def state_snapshot(self) -> dict[str, Any]:
        with self._lock:
            msg = self._last_joint_msg
            last_seen = self._last_joint_monotonic

        if msg is None or last_seen is None:
            return {
                "connected": False,
                "age_sec": None,
                "position_mm": None,
                "motor_angles_deg": None,
                "joint_names": [],
            }

        age_sec = max(0.0, time.monotonic() - last_seen)
        positions = list(msg.position)
        position_mm = None
        motor_angles_deg = None
        if len(positions) >= 3:
            position_mm = {
                "x": positions[0] * 1000.0,
                "y": positions[1] * 1000.0,
                "z": positions[2] * 1000.0,
            }
        if len(positions) > max(MOTOR_JOINT_INDEXES):
            motor_angles_deg = [math.degrees(positions[index]) for index in MOTOR_JOINT_INDEXES]

        return {
            "connected": age_sec <= self.state_stale_after,
            "age_sec": age_sec,
            "position_mm": position_mm,
            "motor_angles_deg": motor_angles_deg,
            "joint_names": list(msg.name),
        }

    def health_snapshot(self, state: dict[str, Any] | None = None) -> dict[str, Any]:
        state = state or self.state_snapshot()
        return {
            "joint_states": state["connected"],
            "ikin_service": self._ikin_client.service_is_ready(),
            "trajectory_action": self._trajectory_client.server_is_ready(),
        }

    def check_target(self, target: Target, timeout_sec: float | None = None) -> dict[str, Any]:
        timeout = timeout_sec or self.ros_timeout_sec
        if not self._ikin_client.wait_for_service(timeout_sec=timeout):
            raise BridgeError("/ikin service is unavailable")

        request = Ikin.Request()
        request.x = target.x
        request.y = target.y
        request.z = target.z
        response = self._wait_for_future(self._ikin_client.call_async(request), timeout)
        angles = [response.phi_11, response.phi_12, response.phi_13]
        reachable = angles_are_commandable(angles)
        return {
            "target": target.to_dict(),
            "reachable": reachable,
            "motor_angles_deg": angles,
            "message": "Target is commandable" if reachable else "Target is outside the commandable motor range",
        }

    def execute_target(
        self,
        target: Target,
        feedback_callback: Callable[[dict[str, float]], None] | None = None,
        timeout_sec: float | None = None,
    ) -> dict[str, Any]:
        timeout = timeout_sec or self.ros_timeout_sec
        if not self._trajectory_client.wait_for_server(timeout_sec=timeout):
            raise BridgeError("/trajectory_plan action server is unavailable")

        goal = PosTraj.Goal()
        goal.x = target.x
        goal.y = target.y
        goal.z = target.z

        send_future = self._trajectory_client.send_goal_async(
            goal,
            feedback_callback=lambda feedback: self._handle_feedback(feedback, feedback_callback),
        )
        goal_handle = self._wait_for_future(send_future, timeout)
        if not goal_handle.accepted:
            return {
                "accepted": False,
                "status": GoalStatus.STATUS_UNKNOWN,
                "status_text": "rejected",
                "result": None,
            }

        result_response = self._wait_for_future(goal_handle.get_result_async(), None)
        result = result_response.result
        return {
            "accepted": True,
            "status": int(result_response.status),
            "status_text": self._status_text(int(result_response.status)),
            "result": {"x": result.x, "y": result.y, "z": result.z},
        }

    def _handle_feedback(
        self,
        feedback_message: Any,
        feedback_callback: Callable[[dict[str, float]], None] | None,
    ) -> None:
        if feedback_callback is None:
            return
        feedback = feedback_message.feedback
        feedback_callback({"x": feedback.x, "y": feedback.y, "z": feedback.z})

    def _wait_for_future(self, future: Any, timeout_sec: float | None) -> Any:
        done = threading.Event()
        future.add_done_callback(lambda _: done.set())
        if future.done():
            done.set()
        if timeout_sec is None:
            done.wait()
        elif not done.wait(timeout_sec):
            raise BridgeError("ROS operation timed out")
        result = future.result()
        if result is None:
            raise BridgeError("ROS operation returned no result")
        return result

    @staticmethod
    def _status_text(status: int) -> str:
        labels = {
            GoalStatus.STATUS_UNKNOWN: "unknown",
            GoalStatus.STATUS_ACCEPTED: "accepted",
            GoalStatus.STATUS_EXECUTING: "executing",
            GoalStatus.STATUS_CANCELING: "canceling",
            GoalStatus.STATUS_SUCCEEDED: "succeeded",
            GoalStatus.STATUS_CANCELED: "canceled",
            GoalStatus.STATUS_ABORTED: "aborted",
        }
        return labels.get(status, f"status_{status}")