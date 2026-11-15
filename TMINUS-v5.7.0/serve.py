"""Serve T-MINUS locally; no third-party Python packages required."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import webbrowser

parser = argparse.ArgumentParser(description="Run T-MINUS locally")
parser.add_argument("--port", type=int, default=8080)
parser.add_argument("--open", action="store_true", help="Open the game in your browser")
args = parser.parse_args()
assets = Path(__file__).resolve().parent / "dist"
server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(SimpleHTTPRequestHandler, directory=str(assets)))
print(f"T-MINUS PHASE 1 v5.1.0 is ready: http://localhost:{args.port}", flush=True)
print("Press Ctrl+C to stop.", flush=True)
if args.open:
    webbrowser.open(f"http://localhost:{args.port}/?release=5.1.0")
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
