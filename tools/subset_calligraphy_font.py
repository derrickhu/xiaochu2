#!/usr/bin/env python3
"""兼容入口：请改用 subset_ui_fonts.py（书法 + 正文一并子集）。"""
from __future__ import annotations

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("subset_ui_fonts.py")), run_name="__main__")
