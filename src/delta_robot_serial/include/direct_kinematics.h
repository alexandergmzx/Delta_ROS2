#include <Eigen/Dense>
#ifndef DIRECT_KINEMATICS_H
#define DIRECT_KINEMATICS_H

const double l_pl_i = 50.0;//unit [mm]
const double l_dl_i = 93.0;
const double a_i = 28.0;//unit [mm]
const double b_i = 20.0;
const double alpha_1 = 0.0; // rad
const double alpha_2 = M_PI*2/3; // rad
const double alpha_3 = M_PI*4/3; // rad
using namespace Eigen;

Matrix3d getR_alpha(double alpha_i) {
    // Create a 3D Rotation around the z axis of alpha_i radians
    // Enter your code here
    Matrix3d R;
    R << cos(alpha_i), -sin(alpha_i), 0,
         sin(alpha_i), cos(alpha_i), 0,
              0, 0, 1;
    return R;
}

std::vector<double> direct_kinematics(double angles[3]) {//the angles' unit is deg
    // Calculate the direct kinematics
    std::vector<double> joint_states;

    double phi1_1=angles[0]*M_PI/180.0;//deg to rad
    double phi1_2=angles[1]*M_PI/180.0;
    double phi1_3=angles[2]*M_PI/180.0;

    Vector3d i_rB1;
    Vector3d i_rB2;
    Vector3d i_rB3;
    i_rB1 << a_i-b_i+l_pl_i*cos(phi1_1), 0, -l_pl_i*sin(phi1_1);
    i_rB2 << a_i-b_i+l_pl_i*cos(phi1_2), 0, -l_pl_i*sin(phi1_2);
    i_rB3 << a_i-b_i+l_pl_i*cos(phi1_3), 0, -l_pl_i*sin(phi1_3);

    Vector3d rB1 = getR_alpha(alpha_1)*i_rB1;
    Vector3d rB2 = getR_alpha(alpha_2)*i_rB2;
    Vector3d rB3 = getR_alpha(alpha_3)*i_rB3;

    double x_B1=rB1[0];
    double y_B1=rB1[1];
    double z_B1=rB1[2];
    double x_B2=rB2[0];
    double y_B2=rB2[1];
    double z_B2=rB2[2];
    double x_B3=rB3[0];
    double y_B3=rB3[1];
    double z_B3=rB3[2];

    double w1=pow(x_B1,2)+pow(y_B1,2)+pow(z_B1,2);
    double w2=pow(x_B2,2)+pow(y_B2,2)+pow(z_B2,2);
    double w3=pow(x_B3,2)+pow(y_B3,2)+pow(z_B3,2);

    double delta=(x_B1-x_B2)*y_B3+(x_B3-x_B1)*y_B2;
    double b2=((w2-w1)*y_B3+(w1-w3)*y_B2)/(2*delta);
    double b1=((w2-w1)*(x_B3-x_B1)+(w3-w1)*(x_B1-x_B2))/(2*delta);
    double a2=((z_B1-z_B2)*y_B3+(z_B3-z_B1)*y_B2)/delta;
    double a1= ((z_B2-z_B1)*(x_B1-x_B3)+(z_B3-z_B1)*(x_B2-x_B1))/delta;
    double Cq=pow(b1,2)+pow(b2+x_B1,2)+ pow(z_B1,2)- pow(l_dl_i,2);
    double Bq=2*(a1+a2*(b2+x_B1)-z_B1);
    double Aq=pow(a1,2)+ pow(a2,2)+1;

    double pz=(-Bq-sqrt(pow(Bq,2)-4*Aq*Cq))/(2*Aq);
    double px=-(a2*pz+b2);
    double py=a1*pz+b1;

    joint_states.push_back(px/1000);//unit [m]
    joint_states.push_back(py/1000);
    joint_states.push_back(pz/1000);//there should be a -pz,because according to the slides, the z-axis points to the ground, but the base's z-axis points to the sky.
    joint_states.push_back(phi1_1);//unit [rad]
    joint_states.push_back(atan2(-pz-l_pl_i*sin(phi1_1), px*cos(alpha_1)+py*sin(alpha_1)-i_rB1[0]) - phi1_1);
    joint_states.push_back(acos((px*sin(alpha_1)-py*cos(alpha_1))/l_dl_i));
    joint_states.push_back(phi1_2);
    joint_states.push_back(atan2(-pz-l_pl_i*sin(phi1_2), px*cos(alpha_2)+py*sin(alpha_2)-i_rB2[0]) - phi1_2);
    joint_states.push_back(acos((px*sin(alpha_2)-py*cos(alpha_2))/l_dl_i));
    joint_states.push_back(phi1_3);
    joint_states.push_back(atan2(-pz-l_pl_i*sin(phi1_3), px*cos(alpha_3)+py*sin(alpha_3)-i_rB3[0]) - phi1_3);
    joint_states.push_back(acos((px*sin(alpha_3)-py*cos(alpha_3))/l_dl_i));

    joint_states[5] = M_PI_2 - joint_states[5];
    joint_states[8] = M_PI_2 - joint_states[8];
    joint_states[11] = M_PI_2 - joint_states[11];
    return joint_states;
}

#endif //DIRECT_KINEMATICS_H
