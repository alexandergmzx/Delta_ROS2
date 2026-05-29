#include <iostream>
#include <serial/serial.h>
#include <vector>
#include <string>
#include <regex>


#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/joint_state.hpp>
#include "serial/serial.h"
#include "direct_kinematics.h"

using namespace std;
serial::Serial sp;
std::vector<std::string> deltaLinkNames = {
    "platform_base_x",   "platform_base_y",   "platform_base_z",
    "proximal_base1",    "distal_proximal_1_y", "distal_proximal_1_x",
    "proximal_base2",    "distal_proximal_3_y", "distal_proximal_3_x",
    "proximal_base3",    "distal_proximal_5_y", "distal_proximal_5_x"
};
void setSerialPort(string serial_port, int baudrate) {
    // If pseudo node, we use port home/socatpty1 instead of /dev/xyz
    if (serial_port.find("socatpty1") != string::npos) {
        string homepath = getenv("HOME");
        regex match("\\$\\(env HOME\\)");
        serial_port = regex_replace(serial_port, match, homepath);
    }
    serial::Timeout to = serial::Timeout::simpleTimeout(100);//create a timeout instance
    sp.setTimeout(to);//give the timeout to serial
    sp.setPort(serial_port);//Set the name of the serial port to be opened
    sp.setBaudrate(baudrate);//Set the baud rate for serial communication
}
bool connectToArduino() {
    try {
        std::cout << "Trying to open serial port: " << sp.getPort();
        sp.open();//open the serial
    } catch(serial::IOException& e) {
        std::cerr << "Unable to open port."<< e.what();
        return false;
    }
    if(sp.isOpen()){
        std::cout << "serial port is opened.";
    } else {
        return false;
    }
    return true;
}
bool readDeltaAngles(double fAngles[3]) {
    size_t n = sp.available();//Get the number of bytes in the buffer
    if(n != 0) {
        uint8_t buffer[12];
        if (n == 12) {//check if the length of the buffer data is correct
            sp.read(buffer, n);//read the data
            if (buffer[0] == 74 && buffer[1] == 58) {//if the begin of the buffer is "J:", J's ascii is 74, and :'s ascii is 58
                vector<uint8_t> vbuffer(buffer, buffer + sizeof(buffer));//array to vector for convenience
                string sAngle1(vbuffer.begin() + 2, vbuffer.begin() + 4);
                string sAngle2(vbuffer.begin() + 5, vbuffer.begin() + 7);
                string sAngle3(vbuffer.begin() + 8, vbuffer.begin() + 10);
                fAngles[0] = stof(sAngle1);
                fAngles[1] = stof(sAngle2);
                fAngles[2] = stof(sAngle3);
                return true;
            }
        } else {
            sp.flushInput(); //If the data in the buffer is incorrect then the buffer is emptied to avoid segment errors
        }
    }
    return false;
}

// Write the DeltaJointPub class
// In the constructor, set the baudrate and serial_port parameters and instantiate the necessary objects for publishing JointStates
// In the publishing loop, read the delta angles, calculate the direct_kinematics and populate the JointState message to publish
class DeltaJointPublisher : public rclcpp::Node {
public:
    DeltaJointPublisher()
    : Node("delta_joint_pub") {
        this->declare_parameter<int>("baudrate", 115200);
        this->declare_parameter<std::string>("serial_port", "$(env HOME)/socatpty1");
        int baud;
        std::string port;
        this->get_parameter("baudrate", baud);
        this->get_parameter("serial_port", port);

        setSerialPort(port, baud);
        if (!connectToArduino()) {
            RCLCPP_FATAL(this->get_logger(), "Failed to connect to Arduino. Exiting.");
            rclcpp::shutdown();
            return;
        }

        joint_pub_ = this->create_publisher<sensor_msgs::msg::JointState>("/joint_states", 10);
        timer_ = this->create_wall_timer(20ms, std::bind(&DeltaJointPublisher::timerCallback, this));
    }

    ~DeltaJointPublisher() {
        if (sp.isOpen()) sp.close();
    }

private:
    void timerCallback() {
        double angles[3];
        if (!readDeltaAngles(angles)) {
            return;
        }
        std::vector<double> kin = direct_kinematics(angles);

        if (kin.size() != deltaLinkNames.size()) {
            RCLCPP_WARN(this->get_logger(), "direct_kinematics returned unexpected size: %zu", kin.size());
            return;
        }

        auto msg = sensor_msgs::msg::JointState();
        msg.header.stamp = this->get_clock()->now();
        msg.name = deltaLinkNames;
        msg.position = kin;
        joint_pub_->publish(msg);
    }

    rclcpp::Publisher<sensor_msgs::msg::JointState>::SharedPtr joint_pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<DeltaJointPublisher>();
    if (rclcpp::ok()) {
        rclcpp::spin(node);
    }
    rclcpp::shutdown();
    return 0;
}
