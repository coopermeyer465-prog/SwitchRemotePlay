# Controller relay

The Mac relay serves the controller page from `web/controller.h` and forwards
one browser device's live input to a CP2102 at 38400 baud. It does not read
Parsec's input or require a virtual gamepad driver. See the [main README](../../README.md)
for wiring, flashing, capture setup and Mac-to-Mac forwarding.

The relay defaults to localhost for access through an SSH tunnel. Use
`--bind 0.0.0.0` only for trusted LAN phone testing.

Inputs and ownership expire after 750ms without updates. The browser sends
a heartbeat every 250ms. The Pro Micro independently releases stale inputs.
UART reports use CRC-8 (polynomial 0x07, initial value zero); malformed inputs
are rejected. There is no added minimum button hold duration, but network,
UART, USB polling and game timing limit the shortest observable press.

Packet: A5 5A, eight report bytes (little-endian uint16 buttons, hat, lx, ly,
rx, ry, zero vendor byte), then the report CRC. Each packet takes about 2.9ms
at 38400 baud. This initial firmware supports one controller without rumble,
motion controls or NFC.
