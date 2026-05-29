//
// Created by jsy on 08.06.24.
//

#include <stdlib.h>
#include <rclcpp/rclcpp.hpp>
#include <serial/serial.h>
#include <string>

#include <iostream>
#include <stdio.h>
using namespace std;
// Mock angles of the virtual delta robot in degrees (initial value at 0°,0°,0°)
// Enter your code here
double target_angle[3] = {0, 0, 0};
string temp = "";
string buffer;
serial::Serial sp1;//pseudo serial port on computer
serial::Serial sp2;//pseudo serial port on arduino
void string2double(string str, double* numbers, int size) {
    int startIndex = 0;
    int endIndex = str.find(',',0);
    int index = 0;

    // extract every number and transfer it to double
    while (endIndex != -1 && index < size) {
        numbers[index++] = stod(str.substr(startIndex, endIndex-startIndex));
        startIndex = endIndex + 1;
        endIndex = str.find(',', startIndex);
    }

    // deal with the last number
    if (index < size) {
        numbers[index] = stod(str.substr(startIndex,endIndex-startIndex));
    }
}
class PseudoArduino:public rclcpp::Node
{

public:
    PseudoArduino():Node("delta_joint_pub")
    {
        timer = this->create_wall_timer(std::chrono::milliseconds(20), std::bind(&PseudoArduino::timer_callback, this));
        char *pathvar;
        pathvar = getenv("HOME");
        string home_path=pathvar;
        serial::Timeout to = serial::Timeout::simpleTimeout(100);//create a timeout instance
        sp1.setTimeout(to);//give the timeout to serial
        sp1.setPort(home_path+"/socatpty1");//pseudo serial port on computer
        sp1.setBaudrate(115200);//Set the baud rate for serial communication

        sp2.setTimeout(to);//give the timeout to serial
        sp2.setPort(home_path+"/socatpty2");//pseudo serial port on arduino
        sp2.setBaudrate(115200);//Set the baud rate for serial communication
    }
private:
    rclcpp::TimerBase::SharedPtr timer;
    rclcpp::Time current_time;
    void timer_callback()
    {
        current_time = this->get_clock()->now();
        size_t n = sp2.available();//Get the number of bytes in the buffer
        if(n!=0) {
            RCLCPP_INFO_STREAM(this->get_logger(),"received data");
            sp2.read(temp,n);
        }

        if(temp != "") {   // check the string which has been read just now
            string2double(temp, target_angle, 3);   // string to double
        }
        double phi_1=target_angle[0];
        double phi_2=target_angle[1];
        double phi_3=target_angle[2];

        if (phi_1<0. || phi_2<0. || phi_3<0. || phi_1>90. || phi_2>90. || phi_3>90.){

        } else {
            stringstream datastream;
            datastream << fixed << setprecision(0)
                        <<"J:"
                        << right << setw(2)<<phi_1 << ","
                        << right << setw(2)<<phi_2 << ","
                        << right << setw(2)<< phi_3 <<"\r\n";
            string data=datastream.str();
            sp2.write(data);

        }
        temp = "";//clear the string for next time use
    }
};


int main(int argc, char** argv) {
    system("socat -d -d pty,b115200,link=$HOME/socatpty1  pty,b115200,link=$HOME/socatpty2 &");//open a pair of pseudo serial port

    rclcpp::init(argc, argv);//
    auto node =std::make_shared<PseudoArduino>();
    try {
        sp1.open();//open the serial
        sp2.open();
    } catch(serial::IOException& e) {
        RCLCPP_ERROR_STREAM(node->get_logger(),"Unable to open port.");
        return -1;
    }

    //check if the serial ports are open
    if(sp1.isOpen() && sp2.isOpen()) {
        RCLCPP_INFO_STREAM(node->get_logger(),"serial port is opened.");
    } else {
        return -1;
    }
    //spin
    rclcpp::spin(node);
    rclcpp::shutdown();
    //close the serial
    sp1.close();
    sp2.close();
    return 0;
}
