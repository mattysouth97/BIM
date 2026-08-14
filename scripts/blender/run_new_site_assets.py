"""Execute scripts/blender/new_site_assets.py inside the live Blender MCP add-on."""
from __future__ import annotations

import json
import pathlib
import socket
import sys

HOST = "127.0.0.1"
PORT = 9876
TIMEOUT = 180.0
SRC = pathlib.Path(__file__).with_name("new_site_assets.py")


def send_code(code: str) -> dict:
    request = json.dumps(
        {"type": "execute", "code": code, "strict_json": True}
    ) + "\0"
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(TIMEOUT)
        sock.connect((HOST, PORT))
        sock.sendall(request.encode("utf-8"))
        buf = bytearray()
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
            if b"\0" in buf:
                break
    raw = bytes(buf.split(b"\0", 1)[0]).decode("utf-8")
    return json.loads(raw)


def main() -> int:
    code = SRC.read_text(encoding="utf-8")
    try:
        resp = send_code(code)
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        return 1
    print(json.dumps(resp, indent=2, ensure_ascii=False))
    return 0 if resp.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
