#include <functional>
#include <memory>
#include <thread>
#include <cstdlib>
#include <chrono>
#include <cmath>
#include <future>
#include <mutex>
#include <vector>
#include <rclcpp/rclcpp.hpp>
#include <rclcpp_action/rclcpp_action.hpp>
#include <rclcpp/callback_group.hpp>
#include <rcl_interfaces/msg/set_parameters_result.hpp>
// Import the communication message headers and enable DLL nodes
// TODO Add your code code here

#include <rclcpp/rclcpp.hpp>
#include <rclcpp_components/register_node_macro.hpp>
#include <sensor_msgs/msg/joint_state.hpp>
#include <inverse_kinematics.h>
#include <delta_robot_serial/action/pos_traj.hpp>
#include <delta_robot_serial/srv/ikin.hpp>

using namespace std::placeholders;
class TrajectoryPlanServer : public rclcpp::Node
{
public:
    using PosTraj = delta_robot_serial::action::PosTraj;
    using GoalHandlePosTraj = rclcpp_action::ServerGoalHandle<PosTraj>;
    explicit TrajectoryPlanServer(const rclcpp::NodeOptions &options = rclcpp::NodeOptions()) : Node("trajectory_plan_server", options)
    {
        trajectory_rate_hz_ = this->declare_parameter<double>("trajectory_rate_hz", 10.0);
        trajectory_steps_ = this->declare_parameter<int>("trajectory_steps", 10);
        if (trajectory_rate_hz_ <= 0.0)
        {
            RCLCPP_WARN(this->get_logger(), "trajectory_rate_hz must be positive; using 10.0 Hz");
            trajectory_rate_hz_ = 10.0;
        }
        if (trajectory_steps_ < 1)
        {
            RCLCPP_WARN(this->get_logger(), "trajectory_steps must be at least 1; using 10 steps");
            trajectory_steps_ = 10;
        }
        parameter_callback_handle_ = this->add_on_set_parameters_callback(
            std::bind(&TrajectoryPlanServer::handleParameterUpdate, this, _1));

        // initialize action server
        this->action_server_ = rclcpp_action::create_server<PosTraj>(
            this,
            "trajectory_plan",
            std::bind(&TrajectoryPlanServer::handle_goal, this, _1, _2),
            std::bind(&TrajectoryPlanServer::handle_cancel, this, _1),
            std::bind(&TrajectoryPlanServer::handle_accepted, this, _1));

        action_feedback_ = std::make_shared<PosTraj::Feedback>();
        action_result_ = std::make_shared<PosTraj::Result>();

        RCLCPP_INFO(
            this->get_logger(),
            "trajectory plan server started with %d steps at %.2f Hz",
            trajectory_steps_,
            trajectory_rate_hz_);

        // initialize ikin client
        ikin_client_ = this->create_client<delta_robot_serial::srv::Ikin>("ikin");
        ikin_request = std::make_shared<delta_robot_serial::srv::Ikin::Request>();

        // initialize joint_state's subscriber
        cbgroup_ = create_callback_group(rclcpp::CallbackGroupType::MutuallyExclusive);
        so.callback_group = cbgroup_;
        joint_sub_ = this->create_subscription<sensor_msgs::msg::JointState>("joint_states", 1,
                                                                             std::bind(&TrajectoryPlanServer::jointCB, this, _1), so);
        executor.add_callback_group(cbgroup_, this->get_node_base_interface());
    }

private:
    // action server
    rclcpp_action::Server<PosTraj>::SharedPtr action_server_;
    std::string action_name_;
    PosTraj::Feedback::SharedPtr action_feedback_;
    PosTraj::Result::SharedPtr action_result_;

    // Ikin service client
    rclcpp::Client<delta_robot_serial::srv::Ikin>::SharedPtr ikin_client_;
    delta_robot_serial::srv::Ikin::Request::SharedPtr ikin_request;

    // joint_state's subscriber
    rclcpp::CallbackGroup::SharedPtr cbgroup_;
    rclcpp::SubscriptionOptions so;
    rclcpp::Subscription<sensor_msgs::msg::JointState>::SharedPtr joint_sub_;
    rclcpp::executors::SingleThreadedExecutor executor;
    double state_x = 0.0;
    double state_y = 0.0;
    double state_z = 0.0;
    uint64_t state_version_ = 0;
    std::mutex state_mutex_;
    double trajectory_rate_hz_ = 10.0;
    int trajectory_steps_ = 10;
    rclcpp::node_interfaces::OnSetParametersCallbackHandle::SharedPtr parameter_callback_handle_;

    rcl_interfaces::msg::SetParametersResult handleParameterUpdate(const std::vector<rclcpp::Parameter> &parameters)
    {
        rcl_interfaces::msg::SetParametersResult result;
        result.successful = true;

        double next_rate_hz = trajectory_rate_hz_;
        int next_steps = trajectory_steps_;

        for (const auto &parameter : parameters)
        {
            if (parameter.get_name() == "trajectory_rate_hz")
            {
                if (parameter.get_type() == rclcpp::ParameterType::PARAMETER_DOUBLE)
                {
                    next_rate_hz = parameter.as_double();
                }
                else if (parameter.get_type() == rclcpp::ParameterType::PARAMETER_INTEGER)
                {
                    next_rate_hz = static_cast<double>(parameter.as_int());
                }
                else
                {
                    result.successful = false;
                    result.reason = "trajectory_rate_hz must be numeric";
                    return result;
                }
                if (!std::isfinite(next_rate_hz) || next_rate_hz <= 0.0)
                {
                    result.successful = false;
                    result.reason = "trajectory_rate_hz must be positive";
                    return result;
                }
            }
            else if (parameter.get_name() == "trajectory_steps")
            {
                if (parameter.get_type() != rclcpp::ParameterType::PARAMETER_INTEGER)
                {
                    result.successful = false;
                    result.reason = "trajectory_steps must be an integer";
                    return result;
                }
                next_steps = static_cast<int>(parameter.as_int());
                if (next_steps < 1)
                {
                    result.successful = false;
                    result.reason = "trajectory_steps must be at least 1";
                    return result;
                }
            }
        }

        trajectory_rate_hz_ = next_rate_hz;
        trajectory_steps_ = next_steps;
        return result;
    }

    bool isMotorAngleCommandable(double angle)
    {
        return std::isfinite(angle) && angle >= 0.0 && angle <= 90.0;
    }

    bool calculateCommandableIk(const std::vector<double> &point, double phi[3])
    {
        double position[3] = {point[0], point[1], point[2]};
        inverse_kinematics(position, alpha_1, &phi[0]);
        inverse_kinematics(position, alpha_2, &phi[1]);
        inverse_kinematics(position, alpha_3, &phi[2]);

        return isMotorAngleCommandable(phi[0]) && isMotorAngleCommandable(phi[1]) && isMotorAngleCommandable(phi[2]);
    }

    uint64_t stateVersion()
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        return state_version_;
    }

    std::vector<double> stateSnapshot()
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        return {state_x, state_y, state_z};
    }

    bool waitForStateAfter(uint64_t previous_version)
    {
        for (int attempt = 0; rclcpp::ok() && attempt < 20; ++attempt)
        {
            executor.spin_once(std::chrono::milliseconds(100));
            if (stateVersion() > previous_version)
            {
                return true;
            }
        }
        return false;
    }

    bool waitForCurrentState()
    {
        return waitForStateAfter(stateVersion());
    }

    void abortGoalAtPoint(const std::shared_ptr<GoalHandlePosTraj> goal_handle, const std::vector<double> &point)
    {
        action_result_->set__x(point[0]);
        action_result_->set__y(point[1]);
        action_result_->set__z(point[2]);
        goal_handle->abort(action_result_);
        goal_handle->publish_feedback(action_feedback_);
    }

    rclcpp_action::GoalResponse handle_goal(const rclcpp_action::GoalUUID &uuid,
                                            std::shared_ptr<const PosTraj::Goal> goal)
    {
        RCLCPP_INFO_STREAM(this->get_logger(), "Received goal request with position" << goal->x << goal->y << goal->z);
        (void)uuid;

        std::vector<double> point = {goal->x, goal->y, goal->z};
        double phi[3];
        if (!calculateCommandableIk(point, phi))
        {
            RCLCPP_WARN(this->get_logger(), "Rejecting goal with out-of-range IK result: %.2f, %.2f, %.2f", phi[0], phi[1], phi[2]);
            return rclcpp_action::GoalResponse::REJECT;
        }

        return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;
    }

    rclcpp_action::CancelResponse handle_cancel(const std::shared_ptr<GoalHandlePosTraj> goal_handle)
    {
        RCLCPP_INFO(this->get_logger(), "Received request to cancel goal");
        (void)goal_handle;
        return rclcpp_action::CancelResponse::ACCEPT;
    }

    void handle_accepted(const std::shared_ptr<GoalHandlePosTraj> goal_handle)
    {
        using namespace std::placeholders;
        // this needs to return quickly to avoid blocking the executor, so spin up a new thread
        std::thread{std::bind(&TrajectoryPlanServer::executeCB, this, _1), goal_handle}.detach();
    }

    void executeCB(const std::shared_ptr<GoalHandlePosTraj> goal_handle)
    {

        // TODO Add your code code here
        double goalPos[3] = {
            goal_handle->get_goal()->x,
            goal_handle->get_goal()->y,
            goal_handle->get_goal()->z};
        RCLCPP_INFO(this->get_logger(), "req gotten");

        if (!waitForCurrentState())
        {
            RCLCPP_ERROR(this->get_logger(), "No joint state received before trajectory planning");
            abortGoalAtPoint(goal_handle, {goalPos[0], goalPos[1], goalPos[2]});
            return;
        }

        if (!ikin_client_->wait_for_service(std::chrono::seconds(2)))
        {
            RCLCPP_ERROR(this->get_logger(), "IK service is not available");
            abortGoalAtPoint(goal_handle, {goalPos[0], goalPos[1], goalPos[2]});
            return;
        }

        std::vector<double> start_position = stateSnapshot();
        std::vector<std::vector<double>> results = generate_trajectory(
            start_position[0],
            start_position[1],
            start_position[2],
            goalPos[0],
            goalPos[1],
            goalPos[2]);
        rclcpp::Rate rate(trajectory_rate_hz_);

        for (const auto &point : results)
        {
            RCLCPP_DEBUG(this->get_logger(), "trajectory step");
            if (goal_handle->is_canceling())
            {
                // run the cancelled method on the goal handle
                goal_handle->canceled(action_result_);
                goal_handle->publish_feedback(action_feedback_);
                return;
            }

            double phi[3];
            if (!calculateCommandableIk(point, phi))
            {
                RCLCPP_WARN(
                    this->get_logger(),
                    "Aborting trajectory at uncommandable point %.3f, %.3f, %.3f with IK %.2f, %.2f, %.2f",
                    point[0], point[1], point[2], phi[0], phi[1], phi[2]);
                abortGoalAtPoint(goal_handle, point);
                return;
            }

            auto request = std::make_shared<delta_robot_serial::srv::Ikin::Request>();
            request->set__x(point[0]);
            request->set__y(point[1]);
            request->set__z(point[2]);

            uint64_t state_before_command = stateVersion();
            auto res = ikin_client_->async_send_request(request);

            if (!res.valid())
            {
                goal_handle->abort(action_result_);
                goal_handle->publish_feedback(action_feedback_);
                return;
            }

            if (res.wait_for(std::chrono::seconds(2)) != std::future_status::ready)
            {
                RCLCPP_ERROR(this->get_logger(), "IK service request timed out during trajectory execution");
                goal_handle->abort(action_result_);
                goal_handle->publish_feedback(action_feedback_);
                return;
            }

            if (!waitForStateAfter(state_before_command))
            {
                RCLCPP_ERROR(this->get_logger(), "No joint state update after IK trajectory command");
                goal_handle->abort(action_result_);
                goal_handle->publish_feedback(action_feedback_);
                return;
            }

            action_feedback_->set__x(point[0]);
            action_feedback_->set__y(point[1]);
            action_feedback_->set__z(point[2]);
            goal_handle->publish_feedback(action_feedback_);
            rate.sleep();
        }

        action_result_->set__x(goalPos[0]);
        action_result_->set__y(goalPos[1]);
        action_result_->set__z(goalPos[2]);
        goal_handle->succeed(action_result_);
        goal_handle->publish_feedback(action_feedback_);
    }

    std::vector<std::vector<double>> generate_trajectory(
        double start_x,
        double start_y,
        double start_z,
        double end_x,
        double end_y,
        double end_z)
    {
        std::vector<std::vector<double>> trajectory;
        double increment_x = (end_x - start_x) / static_cast<double>(trajectory_steps_);
        double increment_y = (end_y - start_y) / static_cast<double>(trajectory_steps_);
        double increment_z = (end_z - start_z) / static_cast<double>(trajectory_steps_);

        for (int i = 0; i < trajectory_steps_; i++)
        {
            trajectory.push_back({
                start_x + (i + 1) * increment_x,
                start_y + (i + 1) * increment_y,
                start_z + (i + 1) * increment_z});
        }
        return trajectory;
    }

    void jointCB(const sensor_msgs::msg::JointState &msg)
    {
        if (msg.position.size() < 3)
        {
            RCLCPP_WARN(this->get_logger(), "Ignoring joint state with fewer than three positions");
            return;
        }

        std::lock_guard<std::mutex> lock(state_mutex_);
        state_x = 1000 * msg.position.at(0); // read x,y,z into state
        state_y = 1000 * msg.position.at(1);
        state_z = 1000 * msg.position.at(2);
        state_version_++;
    }
};

// TODO Add your code code here
RCLCPP_COMPONENTS_REGISTER_NODE(TrajectoryPlanServer)