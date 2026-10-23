# Kiosk Hardening & Physical Security Guide (DrTech.Care)
**Document Version:** 1.0.0  
**Specification Reference:** Master Prompt v3 Section 7.5.3, Section 10 (ระบบ 12, 13, 14), Section 12 & 14  
**Applies to:** Hospital Touchscreen Kiosk Terminal (`apps/kiosk`)

---

## 1. Executive Summary & Purpose

The DrTech.Care Kiosk Terminal runs patient identification, biometric face verification (Level A Software-Only Liveness), and physical therapy daily missions. Because the terminal is placed in semi-public hospital waiting areas and corridors, strict physical and operational hardening is required to prevent:
1. Patients or unauthorized individuals breaking out of the kiosk application into the underlying OS.
2. Presentation attack injections via virtual cameras (e.g., OBS Virtual Cam, ManyCam, Android IP webcam, or USB camera spoofers).
3. Eavesdropping, shoulder surfing, or biometric data exfiltration via USB mass storage.
4. Tampering with internal Express API communication or browser developer tools.

---

## 2. Hardware & Physical Security

### 2.1 Enclosure & Physical Ports
- **Tamper-Resistant Kiosk Shell**: The terminal must be housed in a lockable metal or heavy-gauge acrylic kiosk chassis with keyed locks.
- **Physical Port Blocking**: All unused physical ports (USB, HDMI, Ethernet, SD card slots, optical drives) must be physically blocked using port locks or internal chassis baffling.
- **Kensington Lock / Floor Bolting**: Kiosk stand must be anchored/bolted to the concrete floor or secured with heavy Kensington steel cables to prevent unit theft.

### 2.2 Camera Mounting & Orientation
- **Approved Camera Hardware**: Industrial high-framerate USB 3.0 UVC camera with fixed focal length (f = 3.6mm to 6mm) mounted at adult eye level (~140cm to 155cm from floor, or tilted +15° upward for seated wheelchair patients).
- **Physical Orientation Invariant**: If camera sensor is mounted inverted (180°), camera canvas transformation matrix in `packages/face-client` must be explicitly configured via `CAMERA_ROTATION_DEG=180`. CSS mirroring/transforms must NEVER be used alone as CSS does not affect the raw pixel buffers fed into MediaPipe and ONNX embedding models.

---

## 3. Operating System Hardening (Windows 11 Enterprise / IoT Enterprise)

### 3.1 Assigned Access (Single-App Kiosk Mode)
Windows 11 Assigned Access runs a single application in full-screen above the lock screen:
1. Open **Settings** > **Accounts** > **Other users** > **Set up a kiosk**.
2. Create dedicated local account: `KioskUser` (Standard User, no Administrative privileges).
3. Select Microsoft Edge as the kiosk application.
4. Set Edge kiosk configuration:
   - **Kiosk Mode Type**: Full-screen kiosk (Digital Signage / Interactive Kiosk).
   - **URL**: `https://hospital-pt.local/kiosk` (or reverse proxy domain).
   - **Idle Reset Timer**: 60 seconds (coordinated with `packages/mission-engine`).

### 3.2 Keyboard Shortcut & Key Combination Suppression
Deploy Group Policy (`gpedit.msc`) or Unified Write Filter (UWF) Keyboard Filter to disable OS interrupt keys:
- **Ctrl + Alt + Del**: Disabled via Registry / Secure Attention Sequence policy.
- **Alt + F4** (Close Window): Blocked.
- **Alt + Tab** (Task Switcher): Blocked.
- **Windows Key / Win + R / Win + X**: Blocked.
- **F11 / F12 / Ctrl + Shift + I** (Developer Tools / Source View): Blocked via Edge Enterprise Policy:
  ```json
  {
    "DeveloperToolsAvailability": 2,
    "KeyboardShortcutsEnabled": false,
    "FullscreenAllowed": true
  }
  ```
- **Context Menus (Right-Click / Long Touch)**: Blocked via CSS `select-none`, `pointer-events`, and Edge policy `DefaultPopupsSetting: 2`.

---

## 4. Virtual Camera & Device Injection Defense

Level A Software-only liveness detection can be compromised if an attacker connects a malicious laptop simulating a UVC webcam or installs virtual camera software. The following protections are mandatory:

### 4.1 Device Manager Hardware Restriction Policy
Enforce driver signing and restrict UVC device installation:
```powershell
# Block installation of non-whitelisted device classes
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\DeviceInstall\Restrictions" /v DenyUnspecified /t REG_DWORD /d 1 /f
```
Only the specific Hardware ID (VID/PID) of the approved hospital camera is permitted.

### 4.2 WebRTC Device Enumeration Whitelist
In `packages/face-client/src/camera.ts`:
- Query `navigator.mediaDevices.enumerateDevices()`.
- Reject any video input device containing strings:
  `["OBS", "Virtual", "ManyCam", "Fake", "DroidCam", "SplitCam", "LogiCapture", "CamTwist"]`.
- Abort initialization and trigger emergency staff notification if suspicious video source is detected.

---

## 5. Network & Browser Security

### 5.1 HTTPS Enforcement (Webcam API Requirement)
Modern browsers (Chromium / Edge / Firefox) strictly refuse to activate `navigator.mediaDevices.getUserMedia` unless served over:
- `https://` with a valid TLS certificate, or
- `http://localhost` / `http://127.0.0.1` (development only).

For production hospital LAN deployment, configure Caddy / Nginx reverse proxy with local hospital CA certificate:
```nginx
server {
    listen 443 ssl http2;
    server_name pt-kiosk.hospital.internal;

    ssl_certificate     /etc/ssl/certs/hospital-ca.crt;
    ssl_certificate_key /etc/ssl/private/hospital-ca.key;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';" always;

    # Kiosk UI route
    location /kiosk {
        proxy_pass http://localhost:5175;
    }

    # API route
    location /api {
        proxy_pass http://localhost:3001;
    }
}
```

### 5.2 Cookie Invariants & Zero Local Storage
- Device pairing token is stored strictly in `kiosk_device_token` cookie with `HttpOnly; Secure; SameSite=Strict; Path=/`.
- Client-side JavaScript in `apps/kiosk` NEVER accesses raw tokens or Supabase credentials.
- In accordance with PDPA guidelines, no patient images, embeddings, or medical details persist in `localStorage`, `sessionStorage`, or `IndexedDB`. All session state is flushed by `KioskStateMachine.reset()` upon session finish or timeout.

---

## 6. Daily Operations & Routine Maintenance Checklist

| Frequency | Check Item | Procedure | Verification |
|---|---|---|---|
| **Daily (Morning)** | Lens Cleanliness | Wipe camera lens with anti-static optical wipe. | MirrorCanvas feed has crisp contrast; Laplacian variance > 40. |
| **Daily (Morning)** | Pairing Status | Verify kiosk displays IDLE screen with floating logo. | No pairing modal shown; device cookie valid. |
| **Weekly** | Physical Chassis | Inspect locks, Kensington cable, and cable conduits. | No loose screws, no unauthorized USB dongles inserted. |
| **Monthly** | FAR/FRR Calibration | Run `scripts/face-eval.ts` on sample hospital staff. | Accuracy meets hospital threshold criteria. |
| **Quarterly** | OS Security Updates | Apply cumulative security patches during maintenance window. | Kiosk automatically restarts into single-app kiosk mode. |
