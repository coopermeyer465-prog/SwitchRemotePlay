#!/bin/zsh
set -euo pipefail
readonly PROJECT_ROOT="${0:A:h:h}"
readonly DEPS="$PROJECT_ROOT/firmware/pro-micro/build/deps"
readonly CLOCK="${1:-16000000}"
if [[ "$CLOCK" != 16000000 && "$CLOCK" != 8000000 ]]; then
  print -u2 'Clock must be 16000000 (5V) or 8000000 (3.3V).'
  exit 1
fi
mkdir -p "$DEPS"
if [[ ! -d "$DEPS/reference/.git" ]]; then
  git clone https://github.com/progmem/Switch-Fightstick.git "$DEPS/reference"
  git -C "$DEPS/reference" checkout af49d54640834c40ad9cc73d8281e8d869abc4b3
fi
if [[ ! -d "$DEPS/lufa/.git" ]]; then
  git clone --depth 1 --branch LUFA-170418 https://github.com/abcminiuser/lufa.git "$DEPS/lufa"
fi
readonly OUTPUT="$PROJECT_ROOT/firmware/pro-micro/build/$CLOCK"
mkdir -p "$OUTPUT/Config"
cp "$DEPS/reference/Descriptors.c" "$DEPS/reference/Descriptors.h" "$OUTPUT/"
cp "$DEPS/reference/Config/LUFAConfig.h" "$OUTPUT/Config/"
cp "$PROJECT_ROOT/firmware/pro-micro/main.c" "$OUTPUT/"
make -C "$OUTPUT" -f "$PROJECT_ROOT/firmware/pro-micro/Makefile" \
  LUFA_PATH="$DEPS/lufa/LUFA" F_CPU="$CLOCK" all
avr-size "$OUTPUT/switchpad.elf"
print "Firmware: $OUTPUT/switchpad.hex"
