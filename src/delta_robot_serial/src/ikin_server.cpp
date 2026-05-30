// ikin_server.cpp
#include <serial/serial.h>
#include <string>
#include <regex>
#include <sstream>
#include <iomanip>
#include <cmath>
// Eigen for any math (if you need it here)
// (not strictly required in ikin_server.cpp unless you use Eigen types)
#include <Eigen/Dense>
// ROS2
#include "rclcpp/rclcpp.hpp"
// Your generated service
#include "delta_robot_serial/srv/ikin.hpp"
// Your own IK routine
#include "inverse_kinematics.h"
using namespace std;
using Ikin = delta_robot_serial::srv::Ikin;
static serial::Serial sp;

bool isMotorAngleCommandable(double angle) {
    return std::isfinite(angle) && angle >= 0.0 && angle <= 90.0;
}

void setSerialPort(string serial_port, int baudrate) {
    // If pseudo node, we use port home/socatpty1 instead of /dev/xyz
    if (serial_port.find("socatpty1") != string::npos) {
        string homepath = getenv("HOME");
        regex match("\\$\\(env HOME\\)");
        serial_port = regex_replace(serial_port, match, homepath);
    }
    serial::Timeout to = serial::Timeout::simpleTimeout(100);
    sp.setTimeout(to);
    sp.setPort(serial_port);
    sp.setBaudrate(baudrate);
}
bool connectToArduino() {
    try {
        RCLCPP_INFO(rclcpp::get_logger("ikin_server"), "Trying to open serial port: %s", sp.getPort().c_str());
        sp.open();
    } catch (serial::IOException &e) {
        RCLCPP_ERROR(rclcpp::get_logger("ikin_server"), "Unable to open port: %s", e.what());
        return false;
    }
    if (sp.isOpen()) {
        RCLCPP_INFO(rclcpp::get_logger("ikin_server"), "Serial port opened successfully.");
        return true;
    }
    return false;
}
bool sendToSerial(double mot1, double mot2, double mot3) {
    if (!isMotorAngleCommandable(mot1) || !isMotorAngleCommandable(mot2) || !isMotorAngleCommandable(mot3)) {
        RCLCPP_WARN(
            rclcpp::get_logger("ikin_server"),
            "Skipping serial send for out-of-range motor angles: %.2f, %.2f, %.2f",
            mot1, mot2, mot3);
        return false;
    }

    stringstream datastream;
    datastream << fixed << setprecision(1) << mot1 << ", " << mot2 << ", " << mot3;
    string data = datastream.str();
    sp.write(data);
    return true;
}

void handleIkinRequest(
    const rclcpp::Logger &logger,
    const shared_ptr<Ikin::Request> req,
    shared_ptr<Ikin::Response> res,
    bool command_serial) {
    RCLCPP_INFO(logger, "%s IK request: x=%.3f, y=%.3f, z=%.3f", command_serial ? "Command" : "Check", req->x, req->y, req->z);
    double position[3] = {req->x, req->y, req->z};
    double phi[3];

    inverse_kinematics(position, alpha_1, &phi[0]);
    inverse_kinematics(position, alpha_2, &phi[1]);
    inverse_kinematics(position, alpha_3, &phi[2]);

    bool sent = false;
    if (command_serial) {
        sent = sendToSerial(phi[0], phi[1], phi[2]);
    }
    res->phi_11 = phi[0];
    res->phi_12 = phi[1];
    res->phi_13 = phi[2];
    RCLCPP_INFO(
        logger,
        "Responding with phi: %.2f, %.2f, %.2f%s",
        phi[0],
        phi[1],
        phi[2],
        command_serial ? (sent ? "" : " (not sent)") : " (check only)");
}
int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = rclcpp::Node::make_shared("ikin_server");
    // Declare parameters for serial connection
    int baudrate;
    string serial_port;
    node->declare_parameter("baudrate", 115200);
    node->declare_parameter("serial_port", string("/dev/ttyUSB0"));
    node->get_parameter("baudrate", baudrate);
    node->get_parameter("serial_port", serial_port);
    setSerialPort(serial_port, baudrate);
    if (!connectToArduino()) {
        return -1;
    }
    auto command_service = node->create_service<Ikin>(
        "ikin",
        [&](const shared_ptr<Ikin::Request> req, shared_ptr<Ikin::Response> res) {
            handleIkinRequest(node->get_logger(), req, res, true);
        }
    );
    auto check_service = node->create_service<Ikin>(
        "ikin_check",
        [&](const shared_ptr<Ikin::Request> req, shared_ptr<Ikin::Response> res) {
            handleIkinRequest(node->get_logger(), req, res, false);
        }
    );
    RCLCPP_INFO(node->get_logger(), "Inverse kinematics services 'ikin' and 'ikin_check' ready.");
    rclcpp::spin(node);
    rclcpp::shutdown();
    sp.close();
    return 0;
}