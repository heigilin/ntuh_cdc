#!/usr/bin/env python3
"""Generate a SHA-256 passcode hash for data/admin_users.json."""

from __future__ import annotations

import argparse
import getpass
import hashlib


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--passcode", help="Passcode to hash. Omit to enter interactively.")
    args = parser.parse_args()
    passcode = args.passcode or getpass.getpass("Admin passcode: ")
    print(hashlib.sha256(passcode.encode("utf-8")).hexdigest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
