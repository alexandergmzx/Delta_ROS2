// trajPlan_actionServer.hpp
#pragma once
#include <memory>
#include <vector>
#include <thread>
#include <rclcpp/rclcpp.hpp>
#include <rclcpp_action/rclcpp_action.hpp>
#include <rcl_action/rcl_action.h>
#include <sensor_msgs/msg/joint_state.hpp>
#include <geometry_msgs/msg/point.hpp>
#include "delta_robot_serial/action/pos_traj.hpp"
#include "delta_robot_serial/srv/ikin.hpp"

using PosTraj = delta_robot_serial::action::PosTraj;
using GoalHandlePosTraj = rclcpp_action::ServerGoalHandle<PosTraj>;

class TrajectoryPlanServer : public rclcpp::Node
{
public:
  explicit TrajectoryPlanServer(const rclcpp::NodeOptions & options = rclcpp::NodeOptions());

private:
  rclcpp_action::Server<PosTraj>::SharedPtr action_server_;
  rclcpp::Publisher<sensor_msgs::msg::JointState>::SharedPtr joint_pub_;

  rclcpp::Client<delta_robot_serial::srv::Ikin>::SharedPtr ikin_client_;

  rclcpp_action::GoalResponse handle_goal(
    const rclcpp_action::GoalUUID & uuid,
    std::shared_ptr<const PosTraj::Goal> goal_msg);

  rclcpp_action::CancelResponse handle_cancel(
    const std::shared_ptr<GoalHandlePosTraj> goal_handle);

  void handle_accepted(
    const std::shared_ptr<GoalHandlePosTraj> goal_handle);

  void execute(
    const std::shared_ptr<GoalHandlePosTraj> goal_handle);

  std::vector<geometry_msgs::msg::Point> generate_trajectory(
    double x, double y, double z);
};