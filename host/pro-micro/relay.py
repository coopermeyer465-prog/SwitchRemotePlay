"""Serve the existing gamepad and forward one player's live state to UART."""
import argparse
import asyncio
import contextlib
import struct
import time
from pathlib import Path
from urllib.parse import parse_qs

import serial
from serial.tools import list_ports
from aiohttp import web

ROOT = Path(__file__).resolve().parents[2]
NEUTRAL = struct.pack('<H6B', 0, 8, 128, 128, 128, 128, 0)


def crc8(data):
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ (0x07 if crc & 0x80 else 0)) & 255
    return crc


def packet(report):
    return b'\xa5\x5a' + report + bytes([crc8(report)])


def parse_input(text):
    fields = parse_qs(text, strict_parsing=True)
    device = fields['device'][0]
    if not device or len(device) > 128:
        raise ValueError('Invalid device ID')
    values = [int(fields[key][0], 0) for key in ('buttons', 'hat', 'lx', 'ly', 'rx', 'ry')]
    limits = (16383, 8, 255, 255, 255, 255)
    if any(not 0 <= value <= limit for value, limit in zip(values, limits)):
        raise ValueError('Input out of range')
    return device, struct.pack('<H6B', *values, 0)


class Bridge:
    def __init__(self, port):
        self.port = port
        self.owner = None
        self.last_input = 0
        self.last_seen = 0
        self.report = NEUTRAL

    def write(self, report):
        # One bounded write per input, with no minimum press duration.
        try:
            data = packet(report)
            if self.port.write(data) != len(data):
                raise serial.SerialTimeoutException('Incomplete serial write')
        except serial.SerialException as exc:
            raise web.HTTPServiceUnavailable(text='Serial adapter disconnected') from exc
        self.report = report

    def expire(self):
        if self.owner:
            now = time.monotonic()
            if now - self.last_input > 0.75 and self.report != NEUTRAL:
                self.write(NEUTRAL)
            if now - self.last_seen > 15:
                self.owner = None

    def claim(self, device):
        self.expire()
        if not device or len(device) > 128:
            raise web.HTTPBadRequest(text='Missing device ID')
        if self.owner not in (None, device):
            raise web.HTTPConflict(text='Controller is in use')
        self.owner = device
        self.last_seen = time.monotonic()

    def accept(self, text, device=None):
        try:
            input_device, report = parse_input(text)
        except (ValueError, KeyError, TypeError) as exc:
            raise web.HTTPBadRequest(text='Invalid input') from exc
        if device is not None and input_device != device:
            raise web.HTTPBadRequest(text='Device ID mismatch')
        self.expire()
        if self.owner != input_device:
            raise web.HTTPConflict(text='Claim controller before sending input')
        self.write(report)
        self.last_input = self.last_seen = time.monotonic()


def create_app(bridge):
    source = (ROOT / 'web/controller.h').read_text()
    html = source.split('R"HTML(', 1)[1].rsplit(')HTML"', 1)[0]
    html = html.replace('4 controllers in use', 'controller in use')

    async def root(request):
        return web.Response(text=html, content_type='text/html', headers={'Cache-Control': 'no-store'})

    async def claim(request):
        bridge.claim(request.query.get('device', ''))
        return web.json_response({'player': 0})

    async def input_handler(request):
        bridge.accept(await request.text())
        return web.Response(text='OK')

    async def websocket(request):
        device = request.query.get('device', '')
        bridge.claim(device)
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=2048)
        await ws.prepare(request)
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    bridge.accept(msg.data, device)
                except web.HTTPException:
                    await ws.close(code=1008, message=b'Input rejected')
                    break
        return ws

    async def watchdog(app):
        bridge.write(NEUTRAL)

        async def run():
            while True:
                await asyncio.sleep(0.1)
                try:
                    bridge.expire()
                except web.HTTPException:
                    pass

        task = asyncio.create_task(run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        with contextlib.suppress(web.HTTPException):
            bridge.write(NEUTRAL)

    app = web.Application(client_max_size=2048)
    app.add_routes([web.get('/', root), web.get('/api/claim', claim),
                    web.post('/api/input', input_handler), web.get('/ws', websocket)])
    app.cleanup_ctx.append(watchdog)
    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--bind', default='127.0.0.1', help='Listen address; default is local-only for SSH tunneling')
    args = parser.parse_args()
    if not args.serial:
        adapters = [port.device for port in list_ports.comports() if port.vid == 0x10c4]
        if len(adapters) != 1:
            parser.error('Plug one CP2102 adapter into the Mac, or specify --serial PORT.')
        args.serial = adapters[0]
    with serial.Serial(args.serial, 38400, write_timeout=0.02) as port:
        web.run_app(create_app(Bridge(port)), host=args.bind, port=args.port)
