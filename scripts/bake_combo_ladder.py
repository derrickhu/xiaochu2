#!/usr/bin/env python3
"""连击音阶预烘焙 — 由 combo/levelup/eliminate 生成 12 档升调采样 + 里程碑和弦音。

为什么不在运行时用 playbackRate：
  1. 抖音小游戏 InnerAudioContext 没有可靠的 playbackRate，运行时变调会整段发平；
  2. 即便可用也封顶 2.0，第 8 连之后音高再也升不上去。

一个反复踩到的坑：源采样是 8kHz，升调后必须输出到 44.1kHz。
回采到 8kHz 会把刚移上去的高频重新截掉，结果是「烘了 12 档但听着都一样闷」。

用法：python3 scripts/bake_combo_ladder.py
"""
import os
import subprocess

AUDIO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'minigame', 'subpackages', 'pkg-audio', 'audio',
)
OUT_SR = 44100

# 1-8 是 xiao_chu 的大调音阶 ×1.3；9-12 继续上行但收敛幅度，
# 再往上采样只剩零点几秒的细针声，听感是「消失」而不是「更高」。
LADDER_RATES = [
    1.300, 1.459, 1.638, 1.736, 1.947, 2.187, 2.454, 2.600,
    2.750, 2.920, 3.090, 3.280,
]

# 里程碑和弦：Sol（定音）→ Si + Do'（二段）
CHORDS = [
    ('levelup_sol', 'levelup.mp3', 1.498),
    ('combo_si', 'combo.mp3', 2.454),
    ('eliminate_do', 'eliminate.mp3', 2.000),
]


def probe_sample_rate(path):
    return subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', path,
    ], text=True).strip()


def bake(src_name, rate, dest_name, gain=1.0):
    src = os.path.join(AUDIO_DIR, src_name)
    dest = os.path.join(AUDIO_DIR, dest_name)
    af = f"asetrate={probe_sample_rate(src)}*{rate},aresample={OUT_SR},volume={gain}"
    subprocess.check_call(
        ['ffmpeg', '-y', '-i', src, '-af', af, '-ac', '1', '-ar', str(OUT_SR), '-b:a', '64k', dest],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print(f"{dest_name:18} rate={rate:<6} gain={gain:.2f} {os.path.getsize(dest)}B")


def main():
    for i, rate in enumerate(LADDER_RATES, 1):
        # 升调后能量天然变薄，逐级补增益，否则高连听着比低连还小
        bake('combo.mp3', rate, f'combo_c{i}.mp3', gain=1.0 + min(0.6, (i - 1) * 0.06))
    for dest, src, rate in CHORDS:
        bake(src, rate, f'{dest}.mp3')


if __name__ == '__main__':
    main()
