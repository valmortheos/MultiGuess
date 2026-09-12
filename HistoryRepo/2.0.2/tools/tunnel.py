#!/usr/bin/env python3
"""
MultiGuess — Cloudflare Tunnel Launcher
========================================
Jalankan di terminal terpisah (bukan di sesi app.py).

Tujuan:
  - Bikin tunnel Cloudflare (trycloudflare.com) ke server Flask lokal
  - Print link publik yang bisa langsung dicopy
  - Semua log verbose cloudflared dibuang ke file, BUKAN ke stdout
    supaya sesi tunnel.py tetap bersih

Cara pakai:
    python tools/tunnel.py                # auto-detect port dari runtime.json / scan
    python tools/tunnel.py --port 5000    # override port manual
    python tools/tunnel.py --no-log       # matikan write log file (pure stdout)

Syarat:
  - cloudflared sudah terinstall
      Termux:    pkg install cloudflared
      Linux:     https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
      Windows:   winget install --id Cloudflare.cloudflared
  - app.py sudah running (biar port-nya terdeteksi otomatis)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

# ============================================================
# KONFIGURASI PATH
# ============================================================
ROOT_DIR = Path(__file__).resolve().parent.parent
RUNTIME_FILE = ROOT_DIR / "cache" / "temporal" / "runtime.json"
TUNNEL_LOG = ROOT_DIR / "cache" / "temporal" / "tunnel.log"

URL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
PORT_CANDIDATES = list(range(5000, 5100)) + list(range(8000, 8100))


# ============================================================
# UTIL
# ============================================================
def find_cloudflared() -> str | None:
    """Cari binary cloudflared di PATH."""
    for name in ("cloudflared", "cloudflared.exe"):
        path = shutil.which(name)
        if path:
            return path
    return None


def get_lan_ip() -> str:
    """Deteksi IP LAN (bukan 127.0.0.1)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def read_runtime_port() -> int | None:
    """Baca port dari cache/temporal/runtime.json kalau ada (ditulis oleh app.py)."""
    if not RUNTIME_FILE.exists():
        return None
    try:
        data = json.loads(RUNTIME_FILE.read_text(encoding="utf-8"))
        port = data.get("port")
        return int(port) if port else None
    except Exception:
        return None


def scan_local_port(candidates: list[int]) -> int | None:
    """Scan port lokal yang sedang listen (untuk fallback kalau runtime.json belum ada)."""
    for p in candidates:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.25)
            if s.connect_ex(("127.0.0.1", p)) == 0:
                return p
    return None


def ensure_dirs() -> None:
    TUNNEL_LOG.parent.mkdir(parents=True, exist_ok=True)


# ============================================================
# BANNER
# ============================================================
def print_banner(public_url: str, local_port: int, lan_ip: str) -> None:
    line = "=" * 60
    print()
    print(line)
    print("  MultiGuess — Cloudflare Tunnel is LIVE")
    print(line)
    print(f"  Public :  {public_url}")
    print(f"  Local  :  http://127.0.0.1:{local_port}")
    print(f"  LAN    :  http://{lan_ip}:{local_port}")
    print(line)
    print("  Share the Public URL — bisa diakses dari mana saja.")
    print("  Tekan Ctrl+C untuk stop tunnel.")
    print(line)
    print()


# ============================================================
# CLOUDFLARED RUNNER
# ============================================================
class TunnelRunner:
    def __init__(self, binary: str, port: int, write_log: bool = True):
        self.binary = binary
        self.port = port
        self.write_log = write_log
        self.proc: subprocess.Popen | None = None
        self.url: str | None = None
        self._url_event = threading.Event()
        self._stop = threading.Event()
        self._log_fp = None

    def _reader(self) -> None:
        """Baca output cloudflared baris per baris.

        - Kalau ada URL trycloudflare → set self.url + signal event.
        - Semua baris dibuang ke file log (kalau write_log=True),
          BUKAN ke stdout, supaya sesi tunnel.py tetap bersih.
        """
        assert self.proc is not None and self.proc.stderr is not None
        for raw in self.proc.stderr:
            if self._stop.is_set():
                break
            try:
                line = raw.decode("utf-8", errors="replace").rstrip()
            except Exception:
                continue

            # Tulis ke file log kalau diaktifkan
            if self._log_fp is not None:
                try:
                    self._log_fp.write(line + "\n")
                    self._log_fp.flush()
                except Exception:
                    pass

            # Cari URL
            if self.url is None:
                match = URL_PATTERN.search(line)
                if match:
                    self.url = match.group(0)
                    self._url_event.set()

    def start(self, timeout: float = 30.0) -> str | None:
        # Siapkan file log
        if self.write_log:
            try:
                ensure_dirs()
                # mode append biar history tetap ada
                self._log_fp = open(TUNNEL_LOG, "a", encoding="utf-8")
                self._log_fp.write(
                    f"\n--- tunnel start {time.strftime('%Y-%m-%d %H:%M:%S')} "
                    f"(port={self.port}) ---\n"
                )
                self._log_fp.flush()
            except Exception:
                self._log_fp = None

        cmd = [
            self.binary,
            "tunnel",
            "--url", f"http://127.0.0.1:{self.port}",
            "--no-autoupdate",
        ]

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                bufsize=1,
                start_new_session=True,
            )
        except FileNotFoundError:
            print(f"[!] cloudflared tidak ditemukan di PATH: {self.binary}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"[!] Gagal menjalankan cloudflared: {e}", file=sys.stderr)
            return None

        t = threading.Thread(target=self._reader, daemon=True)
        t.start()

        # Tunggu URL muncul atau timeout
        if not self._url_event.wait(timeout=timeout):
            return None
        return self.url

    def stop(self) -> None:
        self._stop.set()
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            except Exception:
                pass
        if self._log_fp is not None:
            try:
                self._log_fp.write(
                    f"--- tunnel stop {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n"
                )
                self._log_fp.close()
            except Exception:
                pass


# ============================================================
# MAIN
# ============================================================
def main() -> int:
    parser = argparse.ArgumentParser(
        description="MultiGuess Cloudflare Tunnel Launcher",
    )
    parser.add_argument("--port", type=int, default=None,
                        help="Port lokal Flask (default: auto-detect)")
    parser.add_argument("--no-log", action="store_true",
                        help="Jangan tulis log cloudflared ke file")
    parser.add_argument("--timeout", type=float, default=30.0,
                        help="Timeout detik menunggu URL muncul (default: 30)")
    args = parser.parse_args()

    # 1) Cari cloudflared
    binary = find_cloudflared()
    if not binary:
        print()
        print("[!] cloudflared tidak ditemukan di PATH.")
        print("    Install dulu:")
        print("      Termux  : pkg install cloudflared")
        print("      Linux   : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        print("      Windows : winget install --id Cloudflare.cloudflared")
        print()
        return 1

    # 2) Tentukan port
    port = args.port
    if port is None:
        port = read_runtime_port()
        if port is not None:
            print(f"[i] Port terdeteksi dari runtime.json: {port}")
    if port is None:
        print("[i] runtime.json tidak ada, scanning port lokal...")
        port = scan_local_port(PORT_CANDIDATES)
        if port is not None:
            print(f"[i] Port aktif ditemukan: {port}")
    if port is None:
        print()
        print("[!] Tidak bisa mendeteksi port Flask secara otomatis.")
        print("    Pastikan app.py sudah running, atau jalankan:")
        print("      python tools/tunnel.py --port <PORT>")
        print()
        return 1

    lan_ip = get_lan_ip()

    # 3) Start tunnel
    print(f"[i] Membuka tunnel Cloudflare → http://127.0.0.1:{port} ...")
    runner = TunnelRunner(binary, port, write_log=not args.no_log)

    # Handle Ctrl+C dengan rapi
    def _on_signal(signum, frame):
        print("\n[i] Menghentikan tunnel...")
        runner.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _on_signal)
    signal.signal(signal.SIGTERM, _on_signal)

    url = runner.start(timeout=args.timeout)
    if not url:
        print("[!] Gagal mendapat URL tunnel dari cloudflared.")
        print(f"    Cek log di: {TUNNEL_LOG}")
        runner.stop()
        return 1

    # 4) Print banner bersih
    print_banner(url, port, lan_ip)

    if not args.no_log:
        print(f"[i] Log verbose cloudflared disimpan di: {TUNNEL_LOG}")

    # 5) Tunggu sampai user Ctrl+C
    try:
        while runner.proc and runner.proc.poll() is None:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        runner.stop()

    return 0


if __name__ == "__main__":
    sys.exit(main())