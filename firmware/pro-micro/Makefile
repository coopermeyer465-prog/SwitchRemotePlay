MCU = atmega32u4
ARCH = AVR8
BOARD = NONE
F_CPU ?= 16000000
F_USB = $(F_CPU)
OPTIMIZATION = s
TARGET = switchpad
SRC = main.c Descriptors.c $(LUFA_SRC_USB)
CC_FLAGS = -DUSE_LUFA_CONFIG_HEADER -IConfig/
LD_FLAGS =
all:
include $(LUFA_PATH)/Build/lufa_core.mk
include $(LUFA_PATH)/Build/lufa_sources.mk
include $(LUFA_PATH)/Build/lufa_build.mk
