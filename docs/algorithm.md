# Algorithm notes

## State convention

The nominal attitude is a unit quaternion `q` mapping body-frame vectors into the world frame.
The filter covariance is defined on the six-dimensional right-multiplicative error state

`dx = [dtheta_x dtheta_y dtheta_z db_gx db_gy db_gz]^T`.

The nominal gyro bias is maintained separately from the zero-mean EKF error state.

## Predict

M5Unified gyroscope samples are converted from deg/s to rad/s. The nominal quaternion is propagated with an exponential-map increment using

`omega = gyro - bias`.

The first-order error dynamics are

`d(dtheta)/dt = -skew(omega) dtheta - db - n_g`

`d(db)/dt = n_b`.

The covariance uses `Phi ~= I + F dt`, gyro white-noise injection, and gyro-bias random walk.

## Gravity observation

At rest the accelerometer measures specific force opposite gravity. In world coordinates the reference is therefore `[0, 0, +1]` when acceleration is expressed in g. The predicted body-frame direction is

`h = R(q)^T [0, 0, 1]^T`.

The normalized accelerometer is the measurement `z`, with residual `y = z - h`. For the chosen right-multiplicative error convention,

`H = [skew(h)  0]`.

The covariance update is Joseph form, followed by multiplicative quaternion error injection and the first-order MEKF reset Jacobian.

## Adaptive accelerometer rejection

Two independent consistency tests are evaluated before every accelerometer update:

1. Magnitude error: `abs(norm(a) - 1 g)`
2. Direction residual: angle between normalized measured acceleration and predicted gravity direction

Each produces a smooth confidence from 1 to 0. The final confidence is the smaller of the two. With lower confidence, accelerometer measurement covariance is increased as `R_eff = R / confidence^2`. Below the configured minimum confidence, the gravity update is skipped completely and the estimator temporarily runs on gyro propagation alone.

This lets translational acceleration be de-weighted without suppressing gyro dynamics.

## 6-axis limitation

Gravity constrains roll and pitch but provides no absolute yaw reference. Yaw therefore remains relative and slowly drifts with residual Z-axis gyro bias. This is a fundamental observability limitation, not an EKF implementation bug.
