#include <avr/interrupt.h>
#include <avr/power.h>
#include <avr/wdt.h>
#include <util/atomic.h>
#include <string.h>
#include "Descriptors.h"

typedef struct __attribute__((packed)) {
    uint16_t buttons;
    uint8_t hat, lx, ly, rx, ry, vendor;
} Report;

static Report current = {0, 8, 128, 128, 128, 128, 0};
static volatile uint16_t milliseconds;
static volatile uint8_t head, tail, overflow;
static volatile uint8_t received[64];
static uint16_t last_input;

ISR(TIMER0_COMPA_vect) { milliseconds++; }

ISR(USART1_RX_vect) {
    uint8_t status = UCSR1A;
    uint8_t byte = UDR1;
    uint8_t next = (head + 1) & 63;
    if ((status & (_BV(FE1) | _BV(DOR1) | _BV(UPE1))) || next == tail) {
        overflow = 1;
    } else {
        received[head] = byte;
        head = next;
    }
}

static uint16_t now(void) {
    uint16_t value;
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { value = milliseconds; }
    return value;
}

static void neutral(void) {
    current = (Report){0, 8, 128, 128, 128, 128, 0};
}

static uint8_t crc8(const uint8_t *data, uint8_t length) {
    uint8_t crc = 0;
    while (length--) {
        crc ^= *data++;
        for (uint8_t bit = 0; bit < 8; bit++)
            crc = (crc << 1) ^ ((crc & 0x80) ? 0x07 : 0);
    }
    return crc;
}

static void serial_task(void) {
    static uint8_t frame[11], count;
    if (overflow) {
        ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { tail = head; overflow = 0; }
        count = 0;
        neutral();
    }
    while (tail != head) {
        uint8_t byte = received[tail];
        tail = (tail + 1) & 63;
        frame[count++] = byte;
        if (count == 1 && byte != 0xa5) count = 0;
        else if (count == 2 && byte != 0x5a) {
            count = byte == 0xa5 ? 1 : 0;
            frame[0] = byte;
        } else if (count == sizeof(frame)) {
            if (crc8(frame + 2, 8) == frame[10] && frame[4] <= 8 &&
                !(frame[3] & 0xc0) && frame[9] == 0) {
                memcpy(&current, frame + 2, sizeof(current));
                last_input = now();
            } else {
                // Slide by one byte to find the next header after corruption.
                uint8_t start = 1;
                while (start < count && frame[start] != 0xa5) start++;
                count -= start;
                memmove(frame, frame + start, count);
                if (count > 1 && frame[1] != 0x5a) count = 0;
                continue;
            }
            count = 0;
        }
    }
    if ((uint16_t)(now() - last_input) > 750) neutral();
}

void EVENT_USB_Device_ConfigurationChanged(void) {
    Endpoint_ConfigureEndpoint(JOYSTICK_OUT_EPADDR, EP_TYPE_INTERRUPT, JOYSTICK_EPSIZE, 1);
    Endpoint_ConfigureEndpoint(JOYSTICK_IN_EPADDR, EP_TYPE_INTERRUPT, JOYSTICK_EPSIZE, 1);
}

void EVENT_USB_Device_ControlRequest(void) {
    if (USB_ControlRequest.wIndex != INTERFACE_ID_Joystick) return;
    if (USB_ControlRequest.bRequest == HID_REQ_GetReport &&
        USB_ControlRequest.bmRequestType == (REQDIR_DEVICETOHOST | REQTYPE_CLASS | REQREC_INTERFACE)) {
        Endpoint_ClearSETUP();
        Endpoint_Write_Control_Stream_LE(&current, sizeof(current));
        Endpoint_ClearOUT();
    } else if (USB_ControlRequest.bRequest == HID_REQ_SetReport &&
        USB_ControlRequest.bmRequestType == (REQDIR_HOSTTODEVICE | REQTYPE_CLASS | REQREC_INTERFACE)) {
        uint8_t output[8];
        Endpoint_ClearSETUP();
        if (USB_ControlRequest.wLength > sizeof(output)) {
            Endpoint_StallTransaction();
            return;
        }
        Endpoint_Read_Control_Stream_LE(output, USB_ControlRequest.wLength);
        Endpoint_ClearIN();
    }
}

static void hid_task(void) {
    if (USB_DeviceState != DEVICE_STATE_Configured) return;
    Endpoint_SelectEndpoint(JOYSTICK_OUT_EPADDR);
    if (Endpoint_IsOUTReceived()) Endpoint_ClearOUT();
    Endpoint_SelectEndpoint(JOYSTICK_IN_EPADDR);
    if (Endpoint_IsINReady()) {
        Endpoint_Write_Stream_LE(&current, sizeof(current), NULL);
        Endpoint_ClearIN();
    }
}

int main(void) {
    MCUSR &= ~_BV(WDRF);
    wdt_disable();
    clock_prescale_set(clock_div_1);
    TCCR0A = _BV(WGM01);
    TCCR0B = _BV(CS01) | _BV(CS00);
    OCR0A = F_CPU / 64 / 1000 - 1;
    TIMSK0 = _BV(OCIE0A);
    // 38400 baud works at both supported Pro Micro clock speeds.
    UCSR1A = _BV(U2X1);
    UBRR1 = F_CPU / 8 / 38400 - 1;
    UCSR1B = _BV(RXEN1) | _BV(RXCIE1);
    UCSR1C = _BV(UCSZ11) | _BV(UCSZ10);
    USB_Init();
    sei();
    for (;;) {
        serial_task();
        hid_task();
        USB_USBTask();
    }
}
