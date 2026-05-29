from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    host = LaunchConfiguration("host")
    port = LaunchConfiguration("port")

    return LaunchDescription(
        [
            DeclareLaunchArgument("host", default_value="127.0.0.1"),
            DeclareLaunchArgument("port", default_value="8080"),
            Node(
                package="delta_robot_ui",
                executable="delta_robot_dashboard",
                name="delta_robot_dashboard",
                output="screen",
                parameters=[{"host": host, "port": port}],
            ),
        ]
    )