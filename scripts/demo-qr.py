"""
Prints a scannable QR for the demo URL straight into the terminal.

The Cloudflare quick tunnel hands out a new hostname every run, so the QR has to be generated
at demo time rather than prepared in advance.

    cloudflared tunnel --url http://localhost:5173
    python scripts/demo-qr.py https://<whatever>.trycloudflare.com
"""

import sys

import qrcode


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1].strip()
    qr = qrcode.QRCode(border=2)
    qr.add_data(url)
    qr.make(fit=True)

    print()
    qr.print_ascii(invert=True)
    print(f"  {url}\n")
    print("  operators  PIN 1234")
    print("  supervisor SUP001 / PIN 9999\n")


if __name__ == "__main__":
    main()
