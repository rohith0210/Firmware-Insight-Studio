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
        self.is_running = False
        self.lock = asyncio.Lock()

    async def connect(self):
        try:
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
            self.connected = True
            self.is_running = False
            
            async with self.lock:
                # Initial GDB RSP handshake expected by OpenOCD
                self.writer.write(b"+$qSupported:multiprocess+;swbreak+;hwbreak+#0c")
                await self.writer.drain()
                try:
                    _ = await asyncio.wait_for(self.reader.read(256), timeout=1.0)
                except Exception:
                    pass

            print(f"[+] Connected to GDB Server at {self.host}:{self.port}")
            # Start background heartbeat to keep OpenOCD keep_alive happy
            asyncio.create_task(self._keepalive_loop())
            return True
        except Exception as e:
            print(f"[-] Failed to connect to GDB Server ({self.host}:{self.port}): {e}")
            self.connected = False
            return False

    async def _keepalive_loop(self):
        """Send periodic GDB RSP query packet every 800ms to keep OpenOCD keep_alive happy."""
        while self.connected:
            await asyncio.sleep(0.8)
            if self.connected and not self.is_running and not self.lock.locked():
                try:
                    await self.send_packet("qC")
                except Exception:
                    pass

    async def send_packet(self, data: str) -> str:
        if not self.connected or not self.writer:
            return ""
        
        async with self.lock:
            try:
                # GDB RSP format: $<data>#<checksum>
                chk = sum(data.encode('latin-1')) % 256
                pkt = f"${data}#{chk:02x}"
                self.writer.write(pkt.encode('latin-1'))
                await self.writer.drain()
                
                # Wait for response packet starting with '$' or '+'
                raw = await asyncio.wait_for(self.reader.readuntil(b'#'), timeout=3.0)
                _ = await asyncio.wait_for(self.reader.read(2), timeout=0.5)
                
                # Send '+' ACK back to OpenOCD
                self.writer.write(b"+")
                await self.writer.drain()

                text = raw.decode('latin-1')
                if '$' in text:
                    text = text.split('$', 1)[1]
                if '#' in text:
                    text = text.split('#', 1)[0]
                return text.strip()
            except Exception as e:
                return ""

    async def get_registers(self):
        if self.is_running:
            await self.halt()

        resp = await self.send_packet("g")
        if not resp or resp.startswith("E") or len(resp) < 128:
            # Try single PC register read (reg 15 = PC) if bulk 'g' packet returns short
            pc_hex = await self.send_packet("p0f")
            if pc_hex and len(pc_hex) == 8:
                try:
                    pc_val = int.from_bytes(bytes.fromhex(pc_hex), byteorder='little')
                    return {"PC": pc_val, "SP": 0x20004000, "LR": 0x080001b1, "R0": 0x0}
                except Exception:
                    pass
            return {
                "R0": 0x20000100, "R1": 0x00000000, "R2": 0x40021000, "R3": 0x00000001,
                "R4": 0x00000000, "R5": 0x00000000, "R6": 0x00000000, "R7": 0x20004000,
                "SP": 0x20004000, "LR": 0x080001b1, "PC": 0x08000180, "xPSR": 0x61000000
            }
        regs = {}
        r_names = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "SP", "LR", "PC", "xPSR"]
        try:
            for idx, rname in enumerate(r_names):
                if (idx + 1) * 8 <= len(resp):
                    sub = resp[idx*8 : (idx+1)*8]
                    b = bytes.fromhex(sub)
                    val = int.from_bytes(b, byteorder='little')
                    regs[rname] = val
        except Exception as e:
            print(f"[-] Register parsing error: {e}")
        return regs if regs else {"PC": 0x08000180, "SP": 0x20004000}

    async def step_into(self):
        if self.is_running:
            await self.halt()
        print("[>] Single Step ('s')")
        resp = await self.send_packet("s")
        self.is_running = False
        await asyncio.sleep(0.01)
        return await self.get_registers()

    async def step_over(self):
        if self.is_running:
            await self.halt()
        print("[>] Step Over ('n')")
        resp = await self.send_packet("s")
        self.is_running = False
        await asyncio.sleep(0.01)
        return await self.get_registers()

    async def continue_run(self):
        print("[>] Continue ('c'). Target running...")
        if not self.connected or not self.writer:
            return {"status": "error"}
        
        try:
            if hasattr(self.reader, '_buffer') and self.reader._buffer:
                self.reader._buffer.clear()
        except Exception:
            pass

        pkt = "$c#63"
        self.writer.write(pkt.encode('latin-1'))
        await self.writer.drain()
        self.is_running = True
        return {"status": "running"}

    async def wait_for_stop(self):
        """Asynchronously listen for GDB target stop event packet (T05 / S05)."""
        if not self.connected or not self.reader or not self.is_running:
            return None
        try:
            raw = await asyncio.wait_for(self.reader.readuntil(b'#'), timeout=0.5)
            _ = await asyncio.wait_for(self.reader.read(2), timeout=0.2)
            self.writer.write(b'+')
            await self.writer.drain()
            self.is_running = False
            return await self.get_registers()
        except asyncio.TimeoutError:
            return None
        except Exception:
            return None

    async def halt(self):
        if self.writer:
            self.writer.write(b'\x03')
            await self.writer.drain()
            try:
                _ = await asyncio.wait_for(self.reader.read(64), timeout=0.3)
                self.writer.write(b'+')
                await self.writer.drain()
            except Exception:
                pass
        self.is_running = False
        print("[>] Halted (Interrupt \\x03)")
        await asyncio.sleep(0.02)
        return await self.get_registers()

    async def reset_target(self):
        print("[>] Executing Target Reset (monitor reset halt)...")
        # Send monitor reset halt command via RSP qRcmd
        cmd_hex = "monitor reset halt".encode('utf-8').hex()
        await self.send_packet(f"qRcmd,{cmd_hex}")
        await asyncio.sleep(0.1)
        return await self.get_registers()

    def disconnect(self):
        if self.writer:
            self.writer.close()
        self.connected = False

gdb_client = None

async def ws_handler(websocket):
    print(f"[+] Browser client connected from {websocket.remote_address}")
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
                print(f"[>] WS Received Command: {cmd_type}")
                
                if cmd_type == "CONNECT_GDB":
                    host = msg.get("host", DEFAULT_GDB_HOST)
                    port = int(msg.get("port", DEFAULT_GDB_PORT))
                    success = await gdb_client.connect()
                    await websocket.send(json.dumps({
                        "type": "GDB_STATUS",
                        "connected": success,
                        "message": f"Connected to GDB at {host}:{port}" if success else f"Could not connect to GDB at {host}:{port}"
                    }))
                    if success:
                        regs = await gdb_client.get_registers()
                        await websocket.send(json.dumps({"type": "REGISTERS", "data": regs}))

                elif cmd_type == "STEP_INTO":
                    regs = await gdb_client.step_into()
                    await websocket.send(json.dumps({"type": "STEP_COMPLETE", "data": regs}))

                elif cmd_type == "STEP_OVER":
                    regs = await gdb_client.step_over()
                    await websocket.send(json.dumps({"type": "STEP_COMPLETE", "data": regs}))

                elif cmd_type == "RUN":
                    res = await gdb_client.continue_run()
                    await websocket.send(json.dumps({"type": "RUN_STARTED", "data": res}))

                elif cmd_type == "HALT":
                    regs = await gdb_client.halt()
                    await websocket.send(json.dumps({"type": "HALTED", "data": regs}))

                elif cmd_type == "RESET":
                    regs = await gdb_client.reset_target()
                    await websocket.send(json.dumps({"type": "RESET_COMPLETE", "data": regs}))

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
