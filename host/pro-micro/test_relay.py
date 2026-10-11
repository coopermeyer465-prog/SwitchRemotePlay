import unittest
from unittest.mock import patch

import serial
from aiohttp.test_utils import TestClient, TestServer

from relay import Bridge, NEUTRAL, create_app, crc8, packet


class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.serial = serial.serial_for_url('loop://', timeout=0.1)
        self.bridge = Bridge(self.serial)
        self.client = TestClient(TestServer(create_app(self.bridge)))
        await self.client.start_server()
        self.assertEqual(self.serial.read(11), packet(NEUTRAL))

    async def asyncTearDown(self):
        await self.client.close()
        self.serial.close()

    async def test_websocket_press_release_and_exclusive_claim(self):
        response = await self.client.get('/api/claim?device=phone')
        self.assertEqual(await response.json(), {'player': 0})
        response = await self.client.get('/api/claim?device=other')
        self.assertEqual(response.status, 409)
        ws = await self.client.ws_connect('/ws?device=phone', autoping=False)
        payload = 'device=phone&buttons=4&hat=8&lx=128&ly=128&rx=255&ry=128'
        await ws.send_str(payload)
        # Ping waits until the preceding text frame has been processed.
        await ws.ping(b'barrier')
        await ws.receive(timeout=2)
        self.assertEqual(self.serial.read(11), packet(b'\x04\x00\x08\x80\x80\xff\x80\x00'))
        response = await self.client.post('/api/input', data=payload.replace('buttons=4', 'buttons=0'))
        self.assertEqual(response.status, 200)
        self.assertEqual(self.serial.read(11), packet(b'\x00\x00\x08\x80\x80\xff\x80\x00'))
        await ws.close()

    async def test_invalid_input_does_not_change_state(self):
        payload = 'device=phone&buttons=4&hat=9&lx=128&ly=128&rx=128&ry=128'
        response = await self.client.post('/api/input', data=payload)
        self.assertEqual(response.status, 400)
        self.assertEqual(self.bridge.report, NEUTRAL)
        self.assertIsNone(self.bridge.owner)
        self.assertEqual(self.serial.in_waiting, 0)

    async def test_timing_probe_does_not_send_controller_input(self):
        ws = await self.client.ws_connect('/ws?device=phone')
        await ws.send_str('probe')
        reply = await ws.receive_json()
        self.assertEqual(reply['type'], 'probe')
        self.assertGreaterEqual(reply['serial_pending'], 0)
        self.assertEqual(self.serial.in_waiting, 0)
        self.assertEqual(self.bridge.report, NEUTRAL)
        self.assertEqual(self.bridge.last_input, 0)
        await ws.close()

    async def test_timeout_releases_inputs_and_slot(self):
        self.bridge.claim('phone')
        self.bridge.accept('device=phone&buttons=4&hat=8&lx=0&ly=128&rx=128&ry=128')
        self.serial.read(11)
        with patch('relay.time.monotonic', return_value=self.bridge.last_input + 0.76):
            self.bridge.expire()
        self.assertEqual(self.serial.read(11), packet(NEUTRAL))
        self.assertEqual(self.bridge.owner, 'phone')
        with patch('relay.time.monotonic', return_value=self.bridge.last_seen + 15.1):
            self.bridge.expire()
        self.assertIsNone(self.bridge.owner)
        self.bridge.claim('other')
        self.assertEqual(self.bridge.owner, 'other')

    async def test_claim_does_not_keep_old_buttons_held(self):
        self.bridge.claim('phone')
        self.bridge.accept('device=phone&buttons=4&hat=8&lx=128&ly=128&rx=128&ry=128')
        self.serial.read(11)
        with patch('relay.time.monotonic', return_value=self.bridge.last_input + 0.8):
            self.bridge.claim('phone')
        self.assertEqual(self.serial.read(11), packet(NEUTRAL))
        self.assertEqual(self.bridge.owner, 'phone')

    async def test_input_cannot_steal_an_expired_slot(self):
        response = await self.client.post('/api/input', data='device=old&buttons=4&hat=8&lx=128&ly=128&rx=128&ry=128')
        self.assertEqual(response.status, 409)
        self.assertIsNone(self.bridge.owner)

    async def test_existing_ui_is_served(self):
        response = await self.client.get('/')
        html = await response.text()
        self.assertIn('id="stickL"', html)
        self.assertIn('function claimController()', html)
        self.assertNotIn('R"HTML(', html)

    def test_crc_standard_vector(self):
        self.assertEqual(crc8(b'123456789'), 0xf4)


if __name__ == '__main__':
    unittest.main()
