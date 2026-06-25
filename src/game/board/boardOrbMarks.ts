import * as PIXI from 'pixi.js';

/** 封印珠：蓝紫冰层 + 金边 + 「封」字（不可拖/不可消，消邻格解封） */
export function drawSealMark(layer: PIXI.Container, cx: number, cy: number, size: number): void {
  const mark = new PIXI.Container();
  const half = size / 2;

  const frost = new PIXI.Graphics();
  frost.beginFill(0x3d52cc, 0.55);
  frost.lineStyle(3, 0xffd75e, 1);
  frost.drawRoundedRect(-half, -half, size, size, 10);
  frost.endFill();
  mark.addChild(frost);

  const shackle = new PIXI.Graphics();
  shackle.lineStyle(3, 0xffffff, 1);
  shackle.arc(0, -half * 0.14, half * 0.2, Math.PI, 0);
  mark.addChild(shackle);

  const body = new PIXI.Graphics();
  body.beginFill(0xffffff, 0.9);
  body.drawRoundedRect(-half * 0.2, -half * 0.06, half * 0.4, half * 0.32, 4);
  body.endFill();
  mark.addChild(body);

  const label = new PIXI.Text('封', {
    fontSize: Math.floor(size * 0.34),
    fill: 0xffffff,
    fontWeight: 'bold',
    stroke: 0x1a2266,
    strokeThickness: 4,
  });
  label.anchor.set(0.5);
  label.position.set(0, half * 0.22);
  mark.addChild(label);

  mark.position.set(cx, cy);
  layer.addChild(mark);
}

/** 无效珠：灰化 + 红色斜杠 + 「无」字（可消无伤害） */
export function drawInactiveMark(layer: PIXI.Container, cx: number, cy: number, size: number): void {
  const mark = new PIXI.Container();
  const half = size / 2;

  const slash = new PIXI.Graphics();
  slash.lineStyle(4, 0xff5252, 0.95);
  slash.moveTo(-half * 0.62, half * 0.62);
  slash.lineTo(half * 0.62, -half * 0.62);
  mark.addChild(slash);

  const badge = new PIXI.Graphics();
  badge.beginFill(0x2a1a1a, 0.88);
  badge.lineStyle(2, 0xff9142, 1);
  badge.drawRoundedRect(-half * 0.55, -half * 0.72, half * 1.1, half * 0.42, 6);
  badge.endFill();
  mark.addChild(badge);

  const label = new PIXI.Text('无', {
    fontSize: Math.floor(size * 0.28),
    fill: 0xff9142,
    fontWeight: 'bold',
  });
  label.anchor.set(0.5);
  label.position.set(0, -half * 0.51);
  mark.addChild(label);

  mark.position.set(cx, cy);
  layer.addChild(mark);
}
