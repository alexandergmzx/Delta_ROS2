from __future__ import annotations

import threading

import rclpy
from rclpy.executors import MultiThreadedExecutor
import uvicorn

from .config import load_presets
from .ros_bridge import DeltaRobotRosBridge
from .sequence_runner import SequenceRunner
from .server import create_app


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    bridge = DeltaRobotRosBridge()
    executor = MultiThreadedExecutor()
    executor.add_node(bridge)
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    sequence_runner = SequenceRunner(bridge)
    app = create_app(bridge, sequence_runner, load_presets(bridge.presets_file))
    config = uvicorn.Config(app, host=bridge.host, port=bridge.port, log_level="info")
    server = uvicorn.Server(config)

    bridge.get_logger().info(f"Delta dashboard listening on http://{bridge.host}:{bridge.port}")
    try:
        server.run()
    finally:
        executor.shutdown()
        bridge.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()