# Client-side Face Biometric Models

This directory contains client-side machine learning model weights for browser execution:

1. **Face Embedding (128-dim)**:
   - `@vladmandic/face-api` (MobileNetv1 / ResNet-34 face recognition model)
   - Files:
     - `face_recognition_model-weights_manifest.json`
     - `face_recognition_model-shard1`
     - `face_landmark_68_model-weights_manifest.json`
     - `face_landmark_68_model-shard1`

2. **Liveness & Landmark Tracking**:
   - `@mediapipe/tasks-vision` FaceLandmarker bundle
   - Files:
     - `face_landmarker.task`

### Offline & Production Compliance
In accordance with hospital security requirements, models are hosted self-contained under `/public/models` so that no client biometrics or images are sent to external third-party CDNs.
