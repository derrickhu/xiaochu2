import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

R = '/Users/huyi/dk_proj/xiaochu2/minigame'
SUB = R + '/subpackages'
OUT = '/Users/huyi/dk_proj/xiaochu2/docs/ui-redesign/battle/side_view_proto'
W, H = 750, 1334
STAGE_H = 600
BAR_Y = 604
BAR_H = 128
HP_Y = BAR_Y + BAR_H + 18
CELL = 106
BOARD_Y = HP_Y + 32
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
FX = f'{SUB}/pkg-fx/images/ui/fx'


def font(size, bold=True):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)


def load(p):
    return Image.open(p).convert('RGBA')


def trim(im):
    return im.crop(im.getchannel('A').getbbox())


def glow_fx(p):
    """黑底加色特效转透明（亮度当 alpha）。"""
    im = Image.open(p).convert('RGB')
    out = im.convert('RGBA')
    out.putalpha(im.convert('L').point(lambda v: min(255, int(v * 1.6))))
    return out


def fade(im, k):
    out = im.copy()
    out.putalpha(im.getchannel('A').point(lambda v: int(v * k)))
    return out


def fit_h(im, h):
    return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)


def paste_center(base, im, cx, cy):
    base.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def paste_feet(base, im, fx, fy):
    base.alpha_composite(im, (int(fx - im.width / 2), int(fy - im.height)))


ELEM_COLOR = {
    'metal': (236, 214, 120), 'wood': (120, 220, 110), 'water': (90, 190, 255),
    'fire': (255, 110, 60), 'earth': (210, 160, 90), 'heart': (255, 130, 190),
}

# 队伍顺序 = 宠物栏顺序；站位：左列后排 3 只，右列前排 2 只（靠近怪）
TEAM = [
    ('pet_003', 'wood', 'back'),
    ('pet_002', 'metal', 'front'),
    ('pet_005', 'water', 'back'),
    ('pet_007', 'fire', 'front'),
    ('pet_009', 'earth', 'back'),
]
BACK_SLOTS = [(78, 372), (78, 470), (78, 568)]
FRONT_SLOTS = [(212, 421), (212, 519)]
PET_H = 90
ENEMY = ('enemy_crystal_boss_earth', 555, 540, 250)


def team_slots():
    b, f = iter(BACK_SLOTS), iter(FRONT_SLOTS)
    return [next(b) if row == 'back' else next(f) for _, _, row in TEAM]


def pet_art(pid, h=PET_H):
    return fit_h(trim(load(f'{SUB}/pkg-enemy/images/enemy/{pid}.png')), h)


def foot_ring(base, cx, cy, w, color, strong=False):
    lay = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    h = w * 0.32
    d.ellipse((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), fill=(0, 0, 0, 110))
    a = 255 if strong else 200
    for i, wd in enumerate((5, 2)):
        e = 3 + i * 5
        d.ellipse((cx - w / 2 - e, cy - h / 2 - e * 0.32, cx + w / 2 + e, cy + h / 2 + e * 0.32),
                  outline=color + (a if i else int(a * 0.55),), width=wd)
    if strong:
        lay = Image.alpha_composite(lay.filter(ImageFilter.GaussianBlur(4)), lay)
    base.alpha_composite(lay)


def draw_stage(base, bg_name):
    bg = fit_h(load(f'{SUB}/pkg-scene/images/bg/{bg_name}.jpg'), STAGE_H + 40)
    x = (bg.width - W) // 2
    bg = ImageEnhance.Brightness(bg.crop((x, 0, x + W, STAGE_H))).enhance(0.82)
    base.alpha_composite(bg, (0, 0))
    g = Image.new('RGBA', (W, STAGE_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for i in range(240):
        gd.line((0, STAGE_H - 240 + i, W, STAGE_H - 240 + i), fill=(20, 12, 8, int(150 * i / 240)))
    for i in range(110):
        gd.line((0, i, W, i), fill=(10, 8, 6, int(120 * (1 - i / 110))))
    base.alpha_composite(g)


def draw_top_hud(base, turn):
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((205, 24, 545, 74), 25, fill=(250, 238, 210, 240), outline=(190, 150, 80, 255), width=3)
    d.text((375, 49), '2-4 晶岩洞窟 · 2/2波', font=font(24), fill=(90, 55, 25), anchor='mm')
    d.rounded_rectangle((600, 30, 730, 68), 19, fill=(40, 28, 20, 210), outline=(190, 150, 80, 255), width=2)
    d.text((665, 49), f'第{turn}回合', font=font(20), fill=(250, 230, 180), anchor='mm')
    d.ellipse((22, 26, 70, 74), fill=(250, 238, 210, 240), outline=(190, 150, 80, 255), width=3)
    d.text((46, 49), '<', font=font(30), fill=(90, 55, 25), anchor='mm')


def draw_enemy(base, hit=False):
    eid, fx, fy, h = ENEMY
    im = fit_h(trim(load(f'{SUB}/pkg-enemy/images/enemy/{eid}.png')), h)
    foot_ring(base, fx, fy, 190, (230, 60, 60), strong=True)
    if hit:
        fx += 12
        white = Image.new('RGBA', im.size, (255, 255, 255, 0))
        white.putalpha(im.getchannel('A').point(lambda v: int(v * 0.3)))
        im = Image.alpha_composite(im, white)
    paste_feet(base, im, fx, fy)
    d = ImageDraw.Draw(base)
    top = fy - h - 16
    d.rounded_rectangle((fx - 95, top - 52, fx + 95, top - 22), 15, fill=(40, 25, 18, 220), outline=(200, 150, 80), width=2)
    d.text((fx, top - 37), '首领 · 晶核岩魔', font=font(18), fill=(255, 225, 170), anchor='mm')
    ratio = 0.62 if hit else 0.78
    d.rounded_rectangle((fx - 110, top - 14, fx + 110, top + 6), 10, fill=(25, 15, 10, 235))
    d.rounded_rectangle((fx - 107, top - 11, fx - 107 + 214 * 0.78, top + 3), 7, fill=(255, 235, 200))
    d.rounded_rectangle((fx - 107, top - 11, fx - 107 + 214 * ratio, top + 3), 7, fill=(225, 55, 50))
    d.text((fx, top - 4), f'{int(12800 * ratio):,} / 12,800', font=font(14), fill=(255, 255, 255), anchor='mm',
           stroke_width=2, stroke_fill=(60, 10, 10))
    paste_center(base, fit_h(load(R + '/images/orb/orb_earth.png'), 30), fx - 126, top - 4)
    cx, cy = 692, top - 30
    d.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), fill=(60, 20, 18, 230), outline=(240, 120, 80), width=3)
    d.text((cx, cy - 9), '2', font=font(28), fill=(255, 220, 160), anchor='mm')
    d.text((cx, cy + 16), '回合后', font=font(13), fill=(255, 220, 160), anchor='mm')


def draw_pet(base, pid, el, fx, fy, ready=False):
    im = pet_art(pid)
    foot_ring(base, fx, fy, int(im.width * 0.9), ELEM_COLOR[el], strong=ready)
    if ready:
        aura = glow_fx(f'{FX}/fx_light_pillar.png').resize((int(im.width * 1.05), int(PET_H * 1.25)))
        paste_feet(base, aura, fx, fy + 10)
    paste_feet(base, im, fx, fy)
    paste_center(base, fit_h(load(f'{R}/images/orb/orb_{el}.png'), 22), fx, fy - PET_H - 10)


def draw_pet_bar(base, charges, flash=None):
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((14, BAR_Y, W - 14, BAR_Y + BAR_H), 16, fill=(250, 238, 210, 250),
                        outline=(190, 150, 80), width=3)
    n = len(TEAM)
    gap = 10
    size = BAR_H - 34
    x0 = (W - size * n - gap * (n - 1)) // 2
    y0 = BAR_Y + 10
    for i, ((pid, el, _), ch) in enumerate(zip(TEAM, charges)):
        x = x0 + i * (size + gap)
        color = ELEM_COLOR[el]
        ready = ch >= 1.0
        if ready:
            g = Image.new('RGBA', base.size, (0, 0, 0, 0))
            ImageDraw.Draw(g).rounded_rectangle((x - 6, y0 - 6, x + size + 6, y0 + size + 6), 16,
                                                fill=(255, 210, 70, 230))
            base.alpha_composite(g.filter(ImageFilter.GaussianBlur(7)))
        d.rounded_rectangle((x, y0, x + size, y0 + size), 12, fill=color + (255,))
        av = load(f'{SUB}/pkg-pet/images/pet/{pid}.png').resize((size - 8, size - 8), Image.LANCZOS)
        mask = Image.new('L', av.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, av.width, av.height), 10, fill=255)
        av.putalpha(Image.composite(av.getchannel('A'), mask, mask))
        base.alpha_composite(av, (x + 4, y0 + 4))
        if flash == pid:
            base.alpha_composite(fade(Image.new('RGBA', (size, size), (255, 255, 255, 255)), 0.35), (x, y0))
        paste_center(base, fit_h(load(f'{R}/images/orb/orb_{el}.png'), 30), x + 14, y0 + 14)
        d.text((x + size - 8, y0 + size - 10), 'Lv.12', font=font(15), fill=(255, 255, 255), anchor='rm',
               stroke_width=2, stroke_fill=(40, 25, 10))
        by = y0 + size + 7
        d.rounded_rectangle((x, by, x + size, by + 9), 5, fill=(70, 50, 30))
        d.rounded_rectangle((x, by, x + size * ch, by + 9), 5, fill=(255, 200, 60) if ready else color)
        if ready:
            d.rounded_rectangle((x + size / 2 - 32, y0 - 12, x + size / 2 + 32, y0 + 12), 11,
                                fill=(230, 70, 40), outline=(255, 235, 160), width=2)
            d.text((x + size / 2, y0), '技能!', font=font(15), fill=(255, 245, 210), anchor='mm')


def draw_team_hp(base, hp, hp_max):
    d = ImageDraw.Draw(base)
    y = HP_Y
    d.rounded_rectangle((44, y - 12, 720, y + 12), 12, fill=(25, 18, 12, 240), outline=(200, 160, 90), width=2)
    d.rounded_rectangle((48, y - 8, 48 + 668 * hp / hp_max, y + 8), 8, fill=(90, 200, 90))
    d.text((382, y), f'{hp:,} / {hp_max:,}', font=font(16), fill=(255, 255, 255), anchor='mm',
           stroke_width=2, stroke_fill=(20, 60, 20))
    paste_center(base, fit_h(load(R + '/images/orb/orb_heart.png'), 36), 40, y)


def draw_board(base, matched=()):
    rnd = random.Random(7)
    bx = (W - CELL * 6) // 2
    by = BOARD_Y
    light = load(R + '/images/board/tile_light.jpg').resize((CELL, CELL))
    dark = load(R + '/images/board/tile_dark.jpg').resize((CELL, CELL))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((bx - 10, by - 8, bx + CELL * 6 + 10, by + CELL * 5 + 10), 18,
                        fill=(70, 45, 25, 255), outline=(210, 170, 100), width=4)
    types = ['metal', 'wood', 'water', 'fire', 'earth', 'heart']
    orbs = {t: fit_h(load(f'{R}/images/orb/orb_{t}.png'), CELL - 14) for t in types}
    grid = [[rnd.choice(types) for _ in range(6)] for _ in range(5)]
    for r, c in matched:
        grid[r][c] = 'fire'
    for r in range(5):
        for c in range(6):
            x, y = bx + c * CELL, by + r * CELL
            base.alpha_composite(light if (r + c) % 2 == 0 else dark, (x, y))
            o = orbs[grid[r][c]]
            if (r, c) in matched:
                g = Image.new('RGBA', base.size, (0, 0, 0, 0))
                ImageDraw.Draw(g).ellipse((x + 2, y + 2, x + CELL - 2, y + CELL - 2), fill=(255, 160, 60, 200))
                base.alpha_composite(g.filter(ImageFilter.GaussianBlur(10)))
                o = fade(o, 0.55)
            paste_center(base, o, x + CELL / 2, y + CELL / 2)


def damage(base, x, y, s, size, fill=(255, 240, 120), stroke=(120, 30, 0)):
    ImageDraw.Draw(base).text((x, y), s, font=font(size), fill=fill, stroke_width=max(3, size // 10),
                              stroke_fill=stroke, anchor='mm')


def draw_team(base, ready_ids=(), dash=None):
    order = sorted(zip(TEAM, team_slots()), key=lambda t: t[1][1])
    for (pid, el, _), (fx, fy) in order:
        if pid == dash:
            for k, a in ((0, 0.2), (1, 0.35)):
                tint = Image.new('RGBA', pet_art(pid).size, (255, 120, 50, 0))
                tint.putalpha(pet_art(pid).getchannel('A').point(lambda v, a=a: int(v * a)))
                paste_feet(base, tint, fx + 60 + k * 70, fy - 4)
            draw_pet(base, pid, el, fx + 250, fy - 8)
            continue
        draw_pet(base, pid, el, fx, fy, ready=pid in ready_ids)


def frame_idle():
    base = Image.new('RGBA', (W, H), (30, 20, 14, 255))
    draw_stage(base, 'battle_earth')
    draw_top_hud(base, 3)
    draw_enemy(base)
    charges = [0.3, 1.0, 0.4, 0.85, 0.65]
    draw_team(base, ready_ids={'pet_002'})
    draw_pet_bar(base, charges)
    draw_team_hp(base, 1680, 1680)
    draw_board(base)
    return base


def frame_attack():
    base = Image.new('RGBA', (W, H), (30, 20, 14, 255))
    draw_stage(base, 'battle_earth')
    draw_top_hud(base, 3)
    draw_enemy(base, hit=True)
    draw_team(base, ready_ids={'pet_002'}, dash='pet_007')
    # 水鸟远程弹道
    bolt = glow_fx(f'{FX}/fx_water_impact.png').resize((54, 54))
    for k, (bx, by) in enumerate(((150, 400), (270, 385), (390, 375))):
        paste_center(base, fade(bolt, 0.35 + 0.3 * k), bx, by)
    paste_center(base, glow_fx(f'{FX}/fx_water_impact.png').resize((100, 100)), 500, 380)
    # 火刃 + 受击爆点
    blade = load(f'{FX}/fx_fire_blade.png').resize((240, 240)).rotate(-20, expand=True)
    paste_center(base, blade, 540, 440)
    paste_center(base, load(f'{FX}/fx_fire_impact.png').resize((190, 190)), 560, 455)
    paste_center(base, glow_fx(f'{FX}/fx_starburst.png').resize((160, 160)), 570, 450)
    damage(base, 590, 345, '-1,280', 56)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((470, 302, 540, 332), 10, fill=(230, 60, 40), outline=(255, 230, 150), width=2)
    d.text((505, 317), '暴击', font=font(18), fill=(255, 245, 210), anchor='mm')
    damage(base, 670, 410, '-412', 36, fill=(255, 255, 255), stroke=(30, 70, 140))
    damage(base, 650, 455, '-356', 32, fill=(255, 210, 120))
    damage(base, 470, 500, '克制!', 28, fill=(255, 120, 80), stroke=(60, 10, 0))
    d.text((330, 135), '5', font=font(76), fill=(255, 220, 70), anchor='mm', stroke_width=6, stroke_fill=(120, 40, 0))
    d.text((410, 150), '连击', font=font(36), fill=(255, 240, 180), anchor='mm', stroke_width=5, stroke_fill=(120, 40, 0))
    draw_pet_bar(base, [0.55, 1.0, 0.6, 0.0, 0.8], flash='pet_007')
    draw_team_hp(base, 1680, 1680)
    draw_board(base, matched={(2, 1), (2, 2), (2, 3), (3, 3), (4, 3)})
    return base


def caption(im, s):
    out = Image.new('RGBA', (im.width, im.height + 64), (245, 240, 230, 255))
    out.alpha_composite(im, (0, 64))
    ImageDraw.Draw(out).text((im.width // 2, 32), s, font=font(28), fill=(60, 40, 20), anchor='mm')
    return out


if __name__ == '__main__':
    idle, attack = frame_idle(), frame_attack()
    a = caption(idle, '① 待机：后排三只、前排两只，宠物栏点技能')
    b = caption(attack, '② 出手：火狐冲刺近战，水鸟远程，跳字+闪白')
    sheet = Image.new('RGBA', (a.width * 2 + 24, a.height), (245, 240, 230, 255))
    sheet.alpha_composite(a, (0, 0))
    sheet.alpha_composite(b, (a.width + 24, 0))
    sheet.convert('RGB').save(f'{OUT}/battle_proto_v2.jpg', quality=90)
    idle.convert('RGB').save(f'{OUT}/idle.jpg', quality=90)
    attack.convert('RGB').save(f'{OUT}/attack.jpg', quality=90)
    print('ok')
