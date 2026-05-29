#CMakeLists.txt
cmake_minimum_required(VERSION 3.8)
project(delta_robot_serial)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# global include paths
find_package(Eigen3 REQUIRED)
include_directories(
  include
  ${EIGEN3_INCLUDE_DIRS}
  ${rclcpp_INCLUDE_DIRS}
)

# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(serial REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(std_msgs REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(Eigen3 REQUIRED)
# New action dependencies
find_package(action_msgs REQUIRED)
find_package(rclcpp_action REQUIRED)
find_package(rclcpp_components REQUIRED)

# Auto-generate service and action message headers
rosidl_generate_interfaces(${PROJECT_NAME}
  "srv/Ikin.srv"
  "action/PosTraj.action"
  DEPENDENCIES std_msgs action_msgs
)

# Retrieve typesupport for generated services
rosidl_get_typesupport_target(rosidl_typesupport_cpp_target
  ${PROJECT_NAME}
  rosidl_typesupport_cpp
)

# --------------------------
# Inverse kinematics server
# --------------------------
add_executable(ikin_server src/ikin_server.cpp)
ament_target_dependencies(ikin_server
  rclcpp
  serial
)
target_include_directories(ikin_server PRIVATE include ${EIGEN3_INCLUDE_DIRS})
target_link_libraries(ikin_server
  ${rosidl_typesupport_cpp_target}
  Eigen3::Eigen
)
# Link generated service typesupport (plain signature to match ament_target_dependencies)
install(TARGETS ikin_server DESTINATION lib/${PROJECT_NAME})

# --------------------------
# Delta joint publisher
# --------------------------
add_executable(delta_joint_pub src/delta_joint_pub.cpp)
ament_target_dependencies(delta_joint_pub
  rclcpp
  serial
  sensor_msgs
)
install(TARGETS delta_joint_pub DESTINATION lib/${PROJECT_NAME})

# --------------------------
# Pseudo Arduino emulator
# --------------------------
add_executable(pseudo_arduino src/pseudo_arduino.cpp)
ament_target_dependencies(pseudo_arduino
  rclcpp
  serial
)
target_include_directories(pseudo_arduino PRIVATE include)
install(TARGETS pseudo_arduino DESTINATION lib/${PROJECT_NAME})

# --------------------------
# Trajectory Plan Action Server
# --------------------------
add_library(trajPlan_actionServer SHARED
  src/trajPlan_actionServer.cpp
)
ament_target_dependencies(trajPlan_actionServer
  rclcpp
  rclcpp_action
  rclcpp_components
  sensor_msgs
)
target_link_libraries(trajPlan_actionServer
  ${rosidl_typesupport_cpp_target}
)

# *** Right here, after add_library ***
target_include_directories(trajPlan_actionServer
  PRIVATE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_BINARY_DIR}/rosidl_generator_cpp>
)

rclcpp_components_register_node(
  trajPlan_actionServer
  PLUGIN "TrajectoryPlanServer"
  EXECUTABLE trajPlan_action_server
)
install(TARGETS trajPlan_actionServer
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME   DESTINATION lib/${PROJECT_NAME}
)

ament_package()