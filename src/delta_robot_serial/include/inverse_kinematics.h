#include <cmath>
#ifndef REVERSE_KINEMATICS_H
#define REVERSE_KINEMATICS_H
const double l_pl_i=50.0;
const double l_dl_i=93.0;
const double a_i=28.0;
const double b_i=20.0;
const double alpha_1=0.0;
const double alpha_2=120.0;
const double alpha_3=240.0;
double degree2radians(double degree) {
    double radians = degree*M_PI/180.0;
    return radians;
}
double radians2degree(double radians) {
    double degree = radians*180.0/M_PI;
    return degree;
}
void inverse_kinematics(double position[], double alpha_i_deg, double* phi) { //alpha_i with value alpha_1/alpha_2/alpha_3
    double Px = position[0];
    double Py = position[1];
    double Pz = position[2];
    double alpha_i = degree2radians(alpha_i_deg);

    double x_leg = Px * cos(alpha_i) + Py * sin(alpha_i);
    double y_leg = Px * sin(alpha_i) - Py * cos(alpha_i);
    double x_offset = a_i - b_i - x_leg;
    double radius = hypot(x_offset, Pz);
    if (radius == 0.0) {
        *phi = -1; // Error case - out of workspace
        return;
    }

    double cosine_argument = (
        pow(l_dl_i, 2) - pow(x_offset, 2) - pow(Pz, 2) - pow(y_leg, 2) - pow(l_pl_i, 2)
    ) / (2.0 * l_pl_i * radius);

    if (cosine_argument < -1.0 || cosine_argument > 1.0) {
        *phi = -1; // Error case - out of workspace
        return;
    }

    double gamma = atan2(Pz, x_offset);
    double candidate_a = gamma + acos(cosine_argument);
    double candidate_b = gamma - acos(cosine_argument);
    double phi_1 = candidate_a;

    if (candidate_b >= 0.0 && candidate_b <= M_PI_2) {
        phi_1 = candidate_b;
    }
    if (candidate_a >= 0.0 && candidate_a <= M_PI_2) {
        phi_1 = candidate_a;
    }
    if (phi_1 < 0.0 || phi_1 > M_PI_2) {
        *phi = -1;
        return;
    }

    // Return only phi_1 (the main joint angle) in degrees
    *phi = radians2degree(phi_1);
}
#endif //REVERSE_KINEMATICS_H