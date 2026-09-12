#pragma once

#include <cmath>
#include <cstdint>

namespace mekf6 {

constexpr float kPi = 3.14159265358979323846f;
constexpr float degToRad(float x) { return x * (kPi / 180.0f); }
constexpr float radToDeg(float x) { return x * (180.0f / kPi); }

struct Vec3 {
  float x = 0.0f;
  float y = 0.0f;
  float z = 0.0f;
};

struct Quaternion {
  float w = 1.0f;
  float x = 0.0f;
  float y = 0.0f;
  float z = 0.0f;
};

struct EulerDeg {
  float roll = 0.0f;
  float pitch = 0.0f;
  float yaw = 0.0f;
};

struct Config {
  float gyro_noise_std_rad_s = 0.015f;
  float gyro_bias_rw_std_rad_s_sqrt_s = 0.0008f;
  float accel_direction_noise_std = 0.035f;

  float accel_mag_full_g = 0.08f;
  float accel_mag_reject_g = 0.30f;
  float accel_angle_full_deg = 6.0f;
  float accel_angle_reject_deg = 22.0f;
  float accel_min_confidence = 0.05f;

  float min_dt_s = 0.0005f;
  float max_dt_s = 0.0500f;
};

struct Diagnostics {
  float accel_norm_g = 0.0f;
  float accel_magnitude_error_g = 0.0f;
  float accel_direction_residual_deg = 0.0f;
  float accel_confidence = 0.0f;
  bool accel_used = false;
};

class Mekf6 {
 public:
  explicit Mekf6(const Config& cfg = Config{});

  void reset();
  void setConfig(const Config& cfg);
  const Config& config() const { return cfg_; }

  bool initializeFromAccel(const Vec3& accel_g);
  void setGyroBiasRadS(const Vec3& bias_rad_s);
  Vec3 gyroBiasRadS() const { return bias_; }

  bool predict(const Vec3& gyro_rad_s, float dt_s);
  bool updateAccel(const Vec3& accel_g);

  Quaternion quaternion() const { return q_; }
  EulerDeg eulerDeg() const;
  Diagnostics diagnostics() const { return diag_; }

 private:
  Config cfg_;
  Quaternion q_;
  Vec3 bias_;
  float P_[6][6]{};
  Diagnostics diag_;

  static float clampf(float v, float lo, float hi);
  static float norm(const Vec3& v);
  static Vec3 normalized(const Vec3& v);
  static float dot(const Vec3& a, const Vec3& b);
  static Quaternion quatMultiply(const Quaternion& a, const Quaternion& b);
  static Quaternion quatNormalized(const Quaternion& q);
  static Quaternion quatFromEuler(float roll, float pitch, float yaw);
  static Quaternion deltaQuat(const Vec3& dtheta);
  static Vec3 predictedSpecificForceUpBody(const Quaternion& q);
  static void skew(const Vec3& v, float S[3][3]);
  static bool inverse3x3(const float A[3][3], float invA[3][3]);
  static float smoothConfidence(float error, float full, float reject);

  void initializeCovariance();
  void symmetrizeCovariance();
  void injectErrorState(const float dx[6]);
  void applyResetJacobian(const Vec3& dtheta);
};

}  // namespace mekf6
