# atoms3r-6dof-mekf

A directly flashable **6-axis MEKF attitude estimator with Adaptive Accelerometer Rejection** for the M5Stack AtomS3R family. The first validation target is **AtomS3R-M12**.

The firmware uses only the onboard accelerometer and gyroscope. On AtomS3R-M12 these are provided by the BMI270; the BMM150 magnetometer is intentionally not used.

## Web flasher + serial monitor

GitHub Pages hosts a browser tool for both flashing and viewing the MEKF log:

**https://temesotejam.github.io/atoms3r-6dof-mekf/**

Use desktop Chrome or Edge over HTTPS. The page provides:

- ESP Web Tools firmware installation for ESP32-S3
- the exact firmware rebuilt from the current `main` source
- Web Serial connection at 115200 bps
- live Roll / Pitch / Yaw / loop-rate display
- live `acc_conf` and `acc_used` display so Adaptive Accel Rejection can be observed directly
- raw serial log display
- CSV/log download from the browser

After flashing, let the board reboot normally, disconnect the installer if necessary, then press **シリアル接続** on the same page.

> GitHub Pages must be enabled for this repository with **Settings -> Pages -> Source: GitHub Actions** once. The `pages` workflow handles all later firmware rebuilds and deployments automatically.

## What it does

- 6-state Multiplicative / Error-State EKF
  - attitude error: 3 states
  - gyroscope bias error: 3 states
- Quaternion nominal attitude propagation
- Gyroscope bias estimation, plus stationary startup bias initialization
- Adaptive accelerometer rejection using both:
  - deviation of acceleration magnitude from 1 g
  - angular residual between measured acceleration direction and predicted gravity
- Joseph-form covariance update
- MEKF covariance reset after quaternion error injection
- CSV telemetry over USB serial
- PlatformIO build and upload configuration
- GitHub Actions compile check

## Important 6-axis limitation

Roll and pitch have the gravity vector as an absolute reference. **Yaw does not.** Yaw is therefore relative to startup and will drift slowly over time. A magnetometer, GNSS heading, vision, or another external heading reference is required for absolute yaw.

## Hardware direction

The firmware is built on **M5Unified**, not on direct BMI270 register access. This keeps the estimator independent from the exact AtomS3R variant and lets M5Unified handle board-specific IMU initialization and axis correction.

Initial target:

- M5Stack AtomS3R-M12
- ESP32-S3-PICO-1-N8R8
- BMI270 accelerometer + gyro

It is intentionally structured so other AtomS3R-family devices supported by M5Unified can be tested with the same estimator.

## Build

Install PlatformIO, clone this repository, then:

```bash
pio run -e atoms3r
```

## Upload

Connect the AtomS3R device by USB and run:

```bash
pio run -e atoms3r -t upload
```

If the device is not detected for flashing, put AtomS3R-M12 into download mode: hold RESET for about two seconds until the internal green LED lights, then release it, and retry the upload.

## Serial monitor

```bash
pio device monitor -b 115200
```

On boot, keep the device still for roughly 1.5 seconds while gyro bias is initialized. The firmware then initializes roll/pitch from averaged accelerometer data and starts CSV output.

CSV fields:

```text
t_us,rate_hz,roll_deg,pitch_deg,yaw_deg,gx_dps,gy_dps,gz_dps,bgx_dps,bgy_dps,bgz_dps,acc_norm_g,acc_mag_err_g,acc_resid_deg,acc_conf,acc_used
```

Useful adaptive-rejection fields are:

- `acc_norm_g`: measured acceleration magnitude
- `acc_mag_err_g`: `abs(|a|-1g)`
- `acc_resid_deg`: angle between measured acceleration direction and predicted gravity direction
- `acc_conf`: 0..1 confidence used to scale the accelerometer measurement noise
- `acc_used`: 1 when an accelerometer EKF update was applied, 0 when rejected

## Default adaptive rejection

The initial defaults are conservative starting points, not universal tuning constants:

- full magnitude confidence: `| |a| - 1g | <= 0.08 g`
- magnitude rejection: `>= 0.30 g`
- full direction confidence: `<= 6 deg`
- direction rejection: `>= 22 deg`
- below confidence `0.05`, accelerometer update is skipped

Between full confidence and rejection, confidence changes smoothly. The effective accelerometer covariance increases approximately as `1 / confidence^2`.

All tuning values are in `src/app_config.hpp` and `src/mekf6.hpp`.

## Coordinate convention

M5Unified supplies board-corrected IMU axes. The estimator uses a right-handed body coordinate system and a quaternion mapping body -> world. Euler output is ZYX yaw/pitch/roll derived from that quaternion.

At startup yaw is defined as 0 degrees because no heading sensor is used.

## Source layout

```text
src/
  main.cpp          AtomS3R executable firmware
  app_config.hpp    application/tuning parameters
  mekf6.hpp         estimator interface and data types
  mekf6.cpp         MEKF implementation
site/
  index.html        browser flasher + serial monitor
  app.js            Web Serial CSV parser / live status
  styles.css        browser UI
  manifest.json     ESP Web Tools flash manifest
docs/
  algorithm.md      state/error conventions and equations
.github/workflows/
  build.yml         PlatformIO compile check
  pages.yml         build firmware and deploy GitHub Pages
```

## Why adaptive accel rejection matters

A 6-axis attitude filter normally treats acceleration direction as gravity. During translational acceleration that assumption is false. This implementation therefore lets the gyro continue to track fast rotational motion while reducing or completely rejecting accelerometer correction when the measured acceleration is inconsistent with gravity.

That distinction is the main reason this estimator is aimed at dynamic motion rather than only quasi-static tilt estimation.
