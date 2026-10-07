#!/bin/zsh
set -euo pipefail
readonly PROJECT_ROOT="${0:A:h:h}"
if [[ $# != 1 || "$1" != /dev/cu.* ]]; then
  print -u2 'Usage: zsh scripts/pro-micro-flash.sh /dev/cu.usbmodem<bootloader-port>'
  exit 1
fi
readonly HEX="$PROJECT_ROOT/firmware/pro-micro/build/16000000/switchpad.hex"
if [[ ! -f "$HEX" ]]; then
  zsh "$PROJECT_ROOT/scripts/pro-micro-build.sh" 16000000
fi
avrdude -p atmega32u4 -c avr109 -P "$1" -b 57600 -D -U "flash:w:$HEX:i"
