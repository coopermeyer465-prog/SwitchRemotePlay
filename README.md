# SwitchRemotePlay

Live Nintendo Switch controller input through a Mac, a CP2102 USB-to-UART
adapter, and a 5V/16MHz Pro Micro. Add an HDMI capture card and Parsec to watch
the Switch remotely. Controller input travels separately from Parsec, so a
Windows host and virtual gamepad driver are not needed.

```text
VIDEO / AUDIO
Switch HDMI -> capture card -> host Mac preview -> Parsec -> client Mac

LIVE INPUT
Controller -> client Mac browser -> SSH tunnel -> host Mac relay
                                                   |
                                                CP2102
                                                   |
                                                 UART
                                                   |
                                               Pro Micro
                                                   |
                                                  USB
                                                   |
                                                 Switch
```

## Current Status

- Pro Micro firmware flashed and verified on a 5V/16MHz board.
- Local website-to-UART-to-Switch live input tested on real hardware.
- Touch, browser-supported physical controllers, keyboard/mouse controls,
  and per-device layout editing supported by the controller page.
- One controller with timeout releases and no artificial minimum hold time.
- Mac-to-Mac tunnel included, but capture video, Internet play and the older
  iMac host still need physical testing.

Derived from [SwitchPadBridge](https://github.com/coopermeyer465-prog/SwitchPadBridge).
This repo separates the Mac/Pro Micro remote-play path from its ESP32 firmware.
An ESP32 can replace the Mac/CP2102 input source later; a capture computer is
still needed for this remote-video approach.

## Hardware And Wiring

Use a docked Switch with HDMI output, a 5V/16MHz ATmega32U4 Pro Micro, a CP2102,
two jumper wires, USB data cables, and a Mac beside the Switch. Remote video
also needs a Mac-compatible HDMI-to-USB capture card and HDMI cable. The client
is another Mac with a compatible controller.

Power both boards through USB: CP2102 to host Mac, Pro Micro to Switch. Connect
ground first:

| CP2102 | Pro Micro |
| --- | --- |
| GND | GND |
| TXD | RXI / pin 0 |

Leave CP2102 RXD, 5V and 3.3V disconnected. Do not power a board through its
UART pins. Disconnect UART wires before removing either board's USB power
to avoid back-powering the unpowered board.

## Host Mac

Install Python 3.10 or newer, then run:

```sh
git clone https://github.com/coopermeyer465-prog/SwitchRemotePlay.git
cd SwitchRemotePlay
zsh scripts/pro-micro-relay.sh
```

The helper creates a Python environment, installs dependencies and detects
one connected Silicon Labs adapter. To choose the port explicitly:

```sh
zsh scripts/pro-micro-relay.sh --serial /dev/cu.usbserial-0001
```

Keep the host awake and this process running. The page defaults to
`http://127.0.0.1:8080/` on the host. For phone testing on your trusted home LAN:

```sh
zsh scripts/pro-micro-relay.sh --bind 0.0.0.0
```

Open `http://<host-LAN-IP>:8080/` on the phone. LAN mode has no application login;
do not expose this relay directly to the public Internet.

For a Bluetooth controller connected to the host Mac, use
`http://localhost:8080/`. Browsers restrict the Gamepad API to secure contexts;
localhost qualifies, while a plain HTTP LAN IP may not. Press a controller
button with the page open to let the browser expose the controller. If another
page owns P1, close that page and allow up to 15 seconds for its lease to expire.

The nonstandard Chrome/macOS `Lic2 Pro Controller` reports can vary. If sticks
or shoulder buttons are wrong, open the pencil editor, then Desktop mappings,
and choose **Calibrate controller**. Capture neutral with both sticks at rest,
then hold each requested stick direction or shoulder button while clicking
Capture with the mouse. The page measures axis slots, centers, directions and
travel ranges, plus L/ZL/R/ZR button indices. It keeps Switch input neutral
during calibration and saves a completed profile locally in this browser for
that controller. Cancel leaves the previous profile unchanged. Recalibrate
after changing Bluetooth pairing mode if necessary. Standard controllers keep
their standard mapping unless calibrated. Expand Controller input in the same
panel to inspect raw axes and pressed button indices.

## Mac-to-Mac Input

1. Enable macOS Remote Login on the host for the intended account.
2. Clone this repo on the client Mac too.
3. Ensure the client can reach the host over the LAN or a private VPN.
4. On the client, substitute the actual host account and address:

   ```sh
   zsh scripts/remote-tunnel.sh username@host-address
   ```

5. Authenticate with SSH, then open `http://127.0.0.1:18080/` in the client
   browser. The controller page runs locally on the client, not inside the
   streamed host desktop. Its WebSocket and HTTP input travel through SSH.
6. Connect your controller to the client Mac and press a button. Its name
   should appear at the bottom. Test in the Switch's button test first.

Keep the controller tab visible and active while watching Parsec in another
window. Browsers may throttle hidden pages; this initial version is not a
native background controller app. Keyboard/mouse mappings require the
controller page's desktop mode and focus.

For Internet play, the SSH address must actually be reachable. A private VPN
such as [Tailscale](https://tailscale.com/docs/install/mac) can provide this;
its current macOS client requires Monterey 12 or later. Connecting Parsec
alone does not make the controller tunnel reachable.

## Capture And Parsec

Connect Switch HDMI to the capture card and capture USB to the host Mac.
Open its live video/audio preview on the host, then stream that desktop with
Parsec. Use low-buffering preview settings where supported. The preview must
include game audio for the client to hear it.

Parsec does not forward gamepads to Mac hosts, which is why this repo supplies
its own input channel. Hosting requires macOS 10.15 or newer, with 2019-or-newer
hardware preferred. An older iMac needs a test of its exact model, OS, encoder
and capture preview. A newer laptop is a better first candidate when available.
Start with a 720p/60 stream if supported before raising resolution. Capture
buffering, video encoding, Internet delay and display timing all add latency.

Official references: [Parsec on macOS](https://support.parsec.app/hc/en-us/articles/32381555792148-Install-Parsec-App-on-macOS),
[hosting permissions](https://support.parsec.app/hc/en-us/articles/32381747079572-Hosting-and-Permissions).
Parsec officially does not support iPhone/iPad clients; the remote-video
workflow here targets a Mac client. LAN phone controller testing still works.

## Build And Flash

The board already flashed during development needs no new upload for this repo.
For a blank 5V/16MHz board, install AVR GCC, GNU Make and avrdude, then run:

```sh
zsh scripts/pro-micro-build.sh 16000000
```

The helper downloads pinned Switch-Fightstick descriptors and LUFA into an
ignored build directory. Disconnect the UART wires and plug Pro Micro USB
directly into the Mac. Double-tap RST to GND, leaving the wire removed, then
upload during its short bootloader window:

```sh
zsh scripts/pro-micro-flash.sh /dev/cu.usbmodem<actual-bootloader-port>
```

The CP2102 cannot flash the USB bootloader. Do not upload the 16MHz image to
an 8MHz board. Normal controller firmware has no USB serial port; enter the
bootloader again for updates.

## Development

After the relay helper has prepared its Python environment:

```sh
cd host/pro-micro
build/venv/bin/python -m unittest -v test_relay.py
```

With Node.js installed, test both controller profiles from the repo root:

```sh
node --test web/gamepad.test.js
```

Tests cover WebSocket input, serial output, device exclusivity, malformed
inputs, timeout release, CRC and controller page serving. Firmware uses C;
the relay uses Python; the page uses HTML/CSS/JavaScript; helpers use zsh/Make.
The browser UI is currently stored in `web/controller.h`, an inherited HTML
string wrapper, so it can also be reused by embedded firmware.

## License And Credits

MIT for this project's code; see LICENSE. The downloaded
[Switch-Fightstick](https://github.com/progmem/Switch-Fightstick) and
[LUFA](https://github.com/abcminiuser/lufa) dependencies retain their own notices
and licenses. The controller UI originated in SwitchPadBridge.

## Built With Codex

Codex helped implement the live-input relay, build and flash the Pro Micro,
test serial forwarding and timeout behavior, and extract this standalone
project with Mac-to-Mac tunneling. Physical Switch testing confirmed the local
input path. Remote video and Internet play still need hands-on validation.
