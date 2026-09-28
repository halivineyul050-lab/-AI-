// math2d.js —— 2D 几何工具（three-cs Math2d.js 移植）
// 经典脚本：无 import/export，挂 window.Math2D；依赖顺序：config → math2d → three → ...
// 所有点对象约定 { x, z }（平面坐标，忽略 y）；纯 JS 数学，无 DOM/THREE 依赖、无任何受限 API
window.Math2D = {
  // 三点逆时针测试：a→b→c 逆时针返回 true（含叉积符号）
  ccw(a, b, c) {
    return (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z) > 0;
  },
  // 线段 p1p2 与 p3p4 是否相交（标准 ccw 组合判定）
  checkLineCross(p1, p2, p3, p4) {
    return Math2D.ccw(p1, p3, p4) !== Math2D.ccw(p2, p3, p4)
        && Math2D.ccw(p1, p2, p3) !== Math2D.ccw(p1, p2, p4);
  },
  // 点 p 到线段 s1s2 的最短距离（投影 + 端点钳制）
  pointToSegmentDistance(p, s1, s2) {
    const dx = s2.x - s1.x, dz = s2.z - s1.z;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) return Math.hypot(p.x - s1.x, p.z - s1.z);
    let t = ((p.x - s1.x) * dx + (p.z - s1.z) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s1.x + t * dx), p.z - (s1.z + t * dz));
  },
  // 两点距离
  distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
};
