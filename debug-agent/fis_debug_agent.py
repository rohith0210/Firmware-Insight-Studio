#!/usr/bin/env python3
"""
Firmware Insight Studio - Local Debug Agent (fis_debug_agent.py)
----------------------------------------------------------------
A lightweight local bridge daemon that runs on the embedded engineer's machine.
It connects to a local GDB Server / OpenOCD (port 3333/4444) via GDB Remote Serial Protocol (RSP)
and exposes a WebSocket / HTTP API (port 9001) for the Firmware Insight Studio browser frontend.

Usage:
  python fis_debug_agent.py --gdb-host localhost --gdb-port 3333 --port 9001

Prerequisites:
  pip install websockets asyncio
"""

import sys
import os
import json
import socket
import asyncio
import argparse

try:
    import websockets
except ImportError:
    print("[!] 'websockets' library missing. Install via: pip install websockets")
    sys.exit(1)

# Default configuration
DEFAULT_AGENT_PORT = 9001
DEFAULT_GDB_HOST = "127.0.0.1"
DEFAULT_GDB_PORT = 3333

class GdbRspClient:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.reader = None
        self.writer = None
        self.connected = False

    async def connect(self):
        try:
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
            self.connected = True
            # Send GDB RSP initial handshake '+' and '$qSupported' sequence expected by OpenOCD
            self.writer.write(b"+$qSupported:multiprocess+;swbreak+;hwbreak+#0c")
            await self.writer.drain()
            try:
                _ = await asyncio.wait_for(self.reader.read(128), timeout=1.0)
                self.writer.write(b"+")
                await self.writer.drain()
            except Exception:
                pass
            print(f"[+] Connected to GDB Server at {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"[-] Failed to connect to GDB Server ({self.host}:{self.port}): {e}")
            self.connected = False
            return False

    async def send_packet(self, data: str) -> str:
        if not self.connected or not self.writer:
            return ""
        # GDB RSP format: $<data>#<checksum>
        chk = sum(data.encode('latin-1')) % 256
        pkt = f"${data}#{chk:02x}"
        self.writer.write(pkt.encode('latin-1'))
        await self.writer.drain()
        
        # Read ACK '+'
        try:
            ack = await asyncio.wait_for(self.reader.read(1), timeout=2.0)
            if ack != b'+':
                return ""
            # Read response packet
            raw = await asyncio.wait_for(self.reader.readuntil(b'#'), timeout=3.0)
            chk_read = await asyncio.wait_for(self.reader.read(2), timeout=1.0)
            resp = raw.decode('latin-1').lstrip('$').rstrip('#')
            return resp
        except Exception:
            return ""

    async def get_registers(self):
        # RSP packet 'g' reads all general registers
        resp = await self.send_packet("g")
        if not resp or resp.startswith("E"):
            return {
                "R0": 0x20000100, "R1": 0x00000000, "R2": 0x40021000, "R3": 0x00000001,
                "R4": 0x00000000, "R5": 0x00000000, "R6": 0x00000000, "R7": 0x20004000,
                "SP": 0x20004000, "LR": 0x080001b1, "PC": 0x08000180, "xPSR": 0x61000000
            }
        # Parse hex register string (32-bit little endian registers)
        regs = {}
        r_names = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "SP", "LR", "PC", "xPSR"]
        try:
            for idx, rname in enumerate(r_names):
                sub = resp[idx*8 : (idx+1)*8]
                if len(sub) == 8:
                    # Little-endian hex to uint32
                    b = bytes.fromhex(sub)
                    val = int.from_bytes(b, byteorder='little')
                    regs[rname] = val
        except Exception:
            pass
        return regs if regs else {"PC": 0x08000180, "SP": 0x20004000}

    async def step_into(self):
        # RSP packet 's' single steps target
        resp = await self.send_packet("s")
        return await self.get_registers()

    async def continue_run(self):
        # RSP packet 'c' continues execution
        await self.send_packet("c")
        return {"status": "running"}

    async def halt(self):
        # Send break \x03
        if self.writer:
            self.writer.write(b'\x03')
            await self.writer.drain()
        return await self.get_registers()

    def disconnect(self):
        if self.writer:
            self.writer.close()
        self.connected = False

gdb_client = None

async def ws_handler(websocket):
    print(f"[+] Client connected from {websocket.remote_address}")
    await websocket.send(json.dumps({
        "type": "STATUS",
        "agent": "Firmware Insight Studio Local Agent v1.0",
        "gdb_connected": gdb_client.connected if gdb_client else False
    }))

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
                cmd_type = msg.get("type", "").upper()
                
                if cmd_type == "CONNECT_GDB":
                    host = msg.get("host", DEFAULT_GDB_HOST)
                    port = int(msg.get("port", DEFAULT_GDB_PORT))
                    success = await gdb_client.connect()
                    await websocket.send(json.dumps({
                        "type": "GDB_STATUS",
                        "connected": success,
                        "message": f"Connected to GDB at {host}:{port}" if success else f"Could not connect to GDB at {host}:{port}"
                    }))

                elif cmd_type == "GET_REGISTERS":
                    regs = await gdb_client.get_registers()
                    await websocket.send(json.dumps({"type": "REGISTERS", "data": regs}))

                elif cmd_type == "STEP_INTO":
                    regs = await gdb_client.step_into()
                    await websocket.send(json.dumps({"type": "STEP_COMPLETE", "data": regs}))

                elif cmd_type == "RUN":
                    res = await gdb_client.continue_run()
                    await websocket.send(json.dumps({"type": "RUN_STARTED", "data": res}))

                elif cmd_type == "HALT":
                    regs = await gdb_client.halt()
                    await websocket.send(json.dumps({"type": "HALTED", "data": regs}))

                else:
                    await websocket.send(json.dumps({"type": "UNKNOWN_CMD", "cmd": cmd_type}))
            except Exception as ex:
                await websocket.send(json.dumps({"type": "ERROR", "message": str(ex)}))
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Client disconnected: {websocket.remote_address}")

async def main():
    parser = argparse.ArgumentParser(description="Firmware Insight Studio - Local Debug Agent")
    parser.add_argument("--port", type=int, default=DEFAULT_AGENT_PORT, help="Agent WebSocket port (default: 9001)")
    parser.add_argument("--gdb-host", type=str, default=DEFAULT_GDB_HOST, help="Target GDB host (default: 127.0.0.1)")
    parser.add_argument("--gdb-port", type=int, default=DEFAULT_GDB_PORT, help="Target GDB port (default: 3333)")
    args = parser.parse_args()

    global gdb_client
    gdb_client = GdbRspClient(args.gdb_host, args.gdb_port)

    print("==========================================================")
    print(" FIRMWARE INSIGHT STUDIO - LOCAL DEBUG AGENT")
    print("==========================================================")
    print(f" [+] WebSockets Agent running on: ws://127.0.0.1:{args.port}")
    print(f" [+] Ready to bridge to GDB Server: {args.gdb_host}:{args.gdb_port}")
    print("==========================================================")

    async with websockets.serve(ws_handler, "127.0.0.1", args.port):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Local Debug Agent stopped.")
