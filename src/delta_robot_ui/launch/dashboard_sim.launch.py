from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import Command, EnvironmentVariable, LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    baudrate = LaunchConfiguration("baudrate")
    serial_port = LaunchConfiguration("serial_port")
    host = LaunchConfiguration("host")
    port = LaunchConfiguration("port")

    robot_description = Command(
        [
            "xacro ",
            PathJoinSubstitution(
                [FindPackageShare("delta_robot_description"), "urdf", "delta_robot.urdf"]
            ),
        ]
    )

    return LaunchDescription(
        [
            DeclareLaunchArgument("baudrate", default_value="115200"),
            DeclareLaunchArgument(
                "serial_port",
                default_value=[EnvironmentVariable("HOME"), "/socatpty1"],
            ),
            DeclareLaunchArgument("host", default_value="127.0.0.1"),
            DeclareLaunchArgument("port", default_value="8080"),
            Node(
                package="delta_robot_serial",
                executable="pseudo_arduino",
                name="pseudo_arduino",
                output="screen",
                parameters=[{"baudrate": baudrate, "serial_port": serial_port}],
            ),
            Node(
                package="delta_robot_serial",
                executable="delta_joint_pub",
                name="delta_joint_pub",
                output="screen",
                parameters=[{"baudrate": baudrate, "serial_port": serial_port}],
            ),
            Node(
                package="robot_state_publisher",
                executable="robot_state_publisher",
                name="robot_state_publisher",
                output="screen",
                parameters=[{"robot_description": robot_description}],
            ),
            Node(
                package="rviz2",
                executable="rviz2",
                name="rviz2",
                output="screen",
                arguments=[
                    "-d",
                    PathJoinSubstitution(
                        [FindPackageShare("delta_robot_description"), "config", "delta_robot.rviz"]
                    ),
                ],
            ),
            Node(
                package="delta_robot_serial",
                executable="ikin_server",
                name="ikin_server",
                output="screen",
                parameters=[{"baudrate": baudrate, "serial_port": serial_port}],
            ),
            Node(
                package="delta_robot_serial",
                executable="trajPlan_action_server",
                name="trajectory_plan_server",
                output="screen",
            ),
            Node(
                package="delta_robot_ui",
                executable="delta_robot_dashboard",
                name="delta_robot_dashboard",
                output="screen",
                parameters=[{"host": host, "port": port}],
            ),
        ]
    )