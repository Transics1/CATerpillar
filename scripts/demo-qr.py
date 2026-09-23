"""
Prints a scannable QR for the demo URL into the terminal.

The Cloudflare quick tunnel hands out a new hostname every run, so the QR has to be generated
at demo time rather than prepared in advance.

    cloudflared tunnel --url http://localhost:5173
    python scripts/demo-qr.py https://<whatever>.trycloudflare.com
"""

import sys

import qrcode


def render(qr):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        qr.print_ascii(invert=True)
        return
    except Exception:
        pass

    # ASCII fallback. Two chars per module so it stays square and scannable.
    matrix = qr.get_matrix()
    for row in matrix:
        print("".join("  " if cell else "##" for cell in row))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1].strip()
    qr = qrcode.QRCode(border=2)
    qr.add_data(url)
    qr.make(fit=True)

    print()
    render(qr)
    print(f"\n  {url}\n")
    print("  operators  PIN 1234")
    print("  supervisor SUP001 / PIN 9999\n")


if __name__ == "__main__":
    main()
