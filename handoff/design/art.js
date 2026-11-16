(function () {
  if (customElements.get('nft-art')) return;
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var pick = function (r, a) { return a[Math.floor(r() * a.length)]; };
  var PAL = {
    flow: [['#efe6d8', '#14213d', '#e85d2a', '#f2a541', '#3a6ea5'], ['#12161d', '#f4efe6', '#d1495b', '#edae49', '#66a182'], ['#e6e8e3', '#1b263b', '#ff7b54', '#ffb26b', '#7b9acc'], ['#f3e9e2', '#5b2a3a', '#c75146', '#e7a977', '#2d4a53']],
    contour: [['#0d1b2a', '#e0e1dd'], ['#f1ece2', '#1f2a44'], ['#1a1423', '#f7b267'], ['#dfe8e1', '#0b3d2e'], ['#e9dccb', '#7a2e1d']],
    bauhaus: [['#efe7da', '#1d1d1b', '#d7263d', '#f4b400', '#1b4f9c'], ['#f2ede3', '#2b2d42', '#ef8354', '#4f5d75', '#c9c3b6'], ['#ece4d4', '#18322f', '#e07a5f', '#f2cc8f', '#81b29a']],
    colorfield: [['#7a1f1b', '#c8452d', '#e98a3a', '#2a0f0d'], ['#1d2b45', '#3e5c8a', '#c9a46a', '#0e1626'], ['#5a3a5e', '#c06c84', '#f3c6a5', '#2a1b2e'], ['#2f3b2a', '#6f8f5b', '#d9c58f', '#161d14'], ['#c9b79c', '#e9dfcc', '#a3472f', '#3b2a20']],
    truchet: [['#f3eee4', '#1b1b1b'], ['#1e2a4a', '#f2c14e'], ['#e94f37', '#f6f7eb'], ['#0f3d3e', '#e2dcc8'], ['#d9d4f0', '#3b2c85']],
    orb: [['#0b0b12', '#ff6b6b', '#ffd93d', '#5ec2ef'], ['#efe9df', '#2f5d8a', '#e98a6b', '#f1c27d'], ['#14110f', '#c44536', '#f0a35e', '#6c4a8a'], ['#e3e7ea', '#6b5bd2', '#f06c9b', '#ffd28a']],
    sprite: [['#f2d9c2', '#1e1b2e', '#e4572e'], ['#bfe0d6', '#123a35', '#f6c445'], ['#d7d2f2', '#2b2160', '#ff7a7a'], ['#f5e663', '#1e1e1e', '#2f6fd6'], ['#ffc8b8', '#5a1f2b', '#2a9d8f'], ['#1f2433', '#f2efe6', '#f08a4b']],
    weave: [['#e9e1d3', '#a23b2a', '#1f3a5f', '#d9a441', '#2c2c2c'], ['#efe9e1', '#3d5a40', '#c98b5a', '#e6c79c', '#1d2d20'], ['#1c1b22', '#e3d5b8', '#c0392b', '#5d7fa3', '#f2b134']]
  };
  function grain(ctx, w, h, r, a) { var n = w * h / 45; for (var i = 0; i < n; i++) { ctx.fillStyle = r() < .5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a + ')'; ctx.fillRect(r() * w, r() * h, 1, 1); } }
  var G = {
    flow: function (ctx, w, h, r) {
      var p = pick(r, PAL.flow); ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      var f1 = 1 + r() * 2.5, f2 = 1 + r() * 2.5, ph = r() * 6, k = 0.8 + r() * 1.2;
      var ang = function (x, y) { return (Math.sin(x / w * f1 * Math.PI + ph) + Math.cos(y / h * f2 * Math.PI - ph)) * k * Math.PI * 0.5; };
      var n = Math.round(w * h / 520), s = w / 240; ctx.lineCap = 'round';
      for (var i = 0; i < n; i++) {
        var x = r() * w, y = r() * h, steps = 20 + r() * 70; ctx.beginPath(); ctx.moveTo(x, y);
        for (var j = 0; j < steps; j++) { var a = ang(x, y); x += Math.cos(a) * s; y += Math.sin(a) * s; ctx.lineTo(x, y); }
        ctx.strokeStyle = p[1 + Math.floor(r() * (p.length - 1))]; ctx.globalAlpha = .9; ctx.lineWidth = (0.5 + r() * r() * 3.5) * w / 300; ctx.stroke();
      }
      ctx.globalAlpha = 1; grain(ctx, w, h, r, .05);
    },
    contour: function (ctx, w, h, r) {
      var p = pick(r, PAL.contour); ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      var N = 30 + Math.floor(r() * 14), m = w * 0.14, pk = [];
      for (var q = 0; q < 3; q++) pk.push({ x: 0.3 + r() * 0.4, s: 0.04 + r() * 0.1, a: 0.5 + r() });
      var ph = r() * 9; ctx.lineWidth = Math.max(1, w / 380); ctx.strokeStyle = p[1]; ctx.lineJoin = 'round';
      for (var i = 0; i < N; i++) {
        var y0 = h * 0.2 + i * (h * 0.68 / N); ctx.beginPath(); ctx.moveTo(m, y0);
        for (var x = m; x <= w - m; x += 2) {
          var u = x / w, d = 0; pk.forEach(function (o) { d += o.a * Math.exp(-((u - o.x) * (u - o.x)) / (2 * o.s * o.s)); });
          var y = y0 - h * 0.1 * d * (0.55 + 0.45 * Math.sin(i * 0.45 + u * 7 + ph)) - Math.sin(u * 37 + i * 1.3) * h * 0.003 * d;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w - m, y0 + h); ctx.lineTo(m, y0 + h); ctx.closePath(); ctx.fillStyle = p[0]; ctx.fill();
        ctx.beginPath(); ctx.moveTo(m, y0);
        for (var x2 = m; x2 <= w - m; x2 += 2) {
          var u2 = x2 / w, d2 = 0; pk.forEach(function (o) { d2 += o.a * Math.exp(-((u2 - o.x) * (u2 - o.x)) / (2 * o.s * o.s)); });
          ctx.lineTo(x2, y0 - h * 0.1 * d2 * (0.55 + 0.45 * Math.sin(i * 0.45 + u2 * 7 + ph)) - Math.sin(u2 * 37 + i * 1.3) * h * 0.003 * d2);
        }
        ctx.stroke();
      }
      grain(ctx, w, h, r, .04);
    },
    bauhaus: function (ctx, w, h, r) {
      var p = pick(r, PAL.bauhaus), n = pick(r, [3, 4, 4, 5]), cs = w / n, rows = Math.ceil(h / cs);
      ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < n; i++) for (var j = 0; j < rows; j++) {
        var bg = r() < .55 ? p[0] : p[1 + Math.floor(r() * 4)], fg = p[1 + Math.floor(r() * 4)];
        if (fg === bg) fg = p[0];
        ctx.save(); ctx.translate(i * cs + cs / 2, j * cs + cs / 2); ctx.rotate(Math.floor(r() * 4) * Math.PI / 2);
        ctx.fillStyle = bg; ctx.fillRect(-cs / 2, -cs / 2, cs + 1, cs + 1); ctx.fillStyle = fg;
        var t = Math.floor(r() * 6); ctx.beginPath();
        if (t === 0) ctx.arc(0, 0, cs * .42, 0, Math.PI * 2);
        else if (t === 1) ctx.arc(0, cs / 2, cs / 2, Math.PI, 0);
        else if (t === 2) { ctx.moveTo(-cs / 2, -cs / 2); ctx.arc(-cs / 2, -cs / 2, cs, 0, Math.PI / 2); }
        else if (t === 3) ctx.rect(-cs * .2, -cs * .2, cs * .4, cs * .4);
        else if (t === 4) { for (var s = 0; s < 4; s++) ctx.rect(-cs / 2, -cs / 2 + s * cs / 4, cs, cs / 9); }
        else ctx.arc(0, 0, cs * .14, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
      }
      grain(ctx, w, h, r, .05);
    },
    colorfield: function (ctx, w, h, r) {
      var p = pick(r, PAL.colorfield); ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      var m = w * 0.08, split = 0.42 + r() * 0.2;
      ctx.filter = 'blur(' + Math.max(2, w / 70) + 'px)';
      ctx.fillStyle = p[1]; ctx.fillRect(m, m, w - 2 * m, h * split - m * 1.2);
      ctx.fillStyle = p[2]; ctx.fillRect(m, h * split + m * 0.3, w - 2 * m, h - h * split - m * 1.3);
      ctx.globalAlpha = .35; ctx.fillStyle = p[3]; ctx.fillRect(m * 1.6, h * split - m * 0.4, w - 3.2 * m, m * 0.5); ctx.globalAlpha = 1;
      ctx.filter = 'none'; grain(ctx, w, h, r, .08);
    },
    truchet: function (ctx, w, h, r) {
      var p = pick(r, PAL.truchet), n = 6 + Math.floor(r() * 7), s = w / n, rows = Math.ceil(h / s);
      ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = p[1]; ctx.lineWidth = s * (0.18 + r() * 0.16); ctx.lineCap = 'butt';
      for (var i = 0; i < n; i++) for (var j = 0; j < rows; j++) {
        var x = i * s, y = j * s; ctx.beginPath();
        if (r() < .5) { ctx.arc(x, y, s / 2, 0, Math.PI / 2); ctx.moveTo(x + s, y + s / 2); ctx.arc(x + s, y + s, s / 2, -Math.PI / 2, -Math.PI, true); }
        else { ctx.arc(x + s, y, s / 2, Math.PI / 2, Math.PI); ctx.moveTo(x + s / 2, y + s); ctx.arc(x, y + s, s / 2, 0, -Math.PI / 2, true); }
        ctx.stroke();
      }
      grain(ctx, w, h, r, .04);
    },
    orb: function (ctx, w, h, r) {
      var p = pick(r, PAL.orb); ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      for (var k = 0; k < 5; k++) {
        var cx = r() * w, cy = r() * h, rad = w * (0.3 + r() * 0.45), c = p[1 + Math.floor(r() * 3)];
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, c + 'cc'); g.addColorStop(1, c + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      var ox = w * (0.4 + r() * 0.2), oy = h * (0.42 + r() * 0.16), R = w * (0.2 + r() * 0.1), c1 = p[1 + Math.floor(r() * 3)];
      var g2 = ctx.createRadialGradient(ox - R * .4, oy - R * .45, R * .05, ox, oy, R); g2.addColorStop(0, '#ffffff'); g2.addColorStop(.25, c1); g2.addColorStop(1, p[0]);
      ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();
      grain(ctx, w, h, r, .09);
    },
    sprite: function (ctx, w, h, r) {
      var p = pick(r, PAL.sprite); ctx.fillStyle = p[0]; ctx.fillRect(0, 0, w, h);
      var cols = 9, rows = 10, cell = Math.floor(Math.min(w, h) * 0.62 / rows), ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2 + cell * .3;
      for (var y = 0; y < rows; y++) for (var x = 0; x < 5; x++) {
        var dx = Math.abs(x - 4) / 4, dy = Math.abs(y - 4.5) / 5, pr = 0.85 - dx * 0.45 - dy * 0.35, v = r(), c = null;
        if (v < pr) c = p[1]; if (v < pr * 0.18) c = p[2];
        if (y === 3 && x === 2) c = p[0]; if (y === 3 && x === 1) c = p[2];
        if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * cell, oy + y * cell, cell + .5, cell + .5); ctx.fillRect(ox + (8 - x) * cell, oy + y * cell, cell + .5, cell + .5); }
      }
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(ox + cell, oy + rows * cell + cell * .6, (cols - 2) * cell, cell * .5);
    },
    weave: function (ctx, w, h, r) {
      var p = pick(r, PAL.weave), n = 9 + Math.floor(r() * 9), s = w / n, rows = Math.ceil(h / s), ch = [], cv = [];
      for (var i = 0; i < rows; i++) ch.push(p[1 + Math.floor(r() * 4)]);
      for (var j = 0; j < n; j++) cv.push(r() < .35 ? p[0] : p[1 + Math.floor(r() * 4)]);
      var pat = Math.floor(r() * 3) + 2;
      for (var a = 0; a < rows; a++) for (var b = 0; b < n; b++) {
        var over = ((a + b) % pat) === 0, x = b * s, y = a * s;
        ctx.fillStyle = over ? cv[b] : ch[a]; ctx.fillRect(x, y, s + .5, s + .5);
        ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var t = 1; t < 4; t++) { if (over) { ctx.moveTo(x + t * s / 4, y); ctx.lineTo(x + t * s / 4, y + s); } else { ctx.moveTo(x, y + t * s / 4); ctx.lineTo(x + s, y + t * s / 4); } }
        ctx.stroke();
      }
      grain(ctx, w, h, r, .06);
    }
  };
  var KEYS = Object.keys(G);
  class NftArt extends HTMLElement {
    static get observedAttributes() { return ['kind', 'seed']; }
    connectedCallback() {
      if (!this._c) {
        this.style.display = 'block'; this.style.position = 'absolute'; this.style.inset = '0'; this.style.overflow = 'hidden';
        this._c = document.createElement('canvas'); this._c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        this.appendChild(this._c); this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(this);
      }
      this.draw();
    }
    disconnectedCallback() { if (this._ro) { this._ro.disconnect(); this._ro = null; this._c = null; this.innerHTML = ''; } }
    attributeChangedCallback() { this._k = null; this.draw(); }
    draw() {
      if (!this._c) return;
      var w = this.clientWidth, h = this.clientHeight; if (!w || !h) return;
      var kind = this.getAttribute('kind') || 'flow', seed = parseInt(this.getAttribute('seed') || '1', 10);
      var key = kind + seed + 'x' + w + 'x' + h; if (key === this._k) return; this._k = key;
      var dpr = Math.min(2, window.devicePixelRatio || 1); this._c.width = Math.round(w * dpr); this._c.height = Math.round(h * dpr);
      var ctx = this._c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      (G[kind] || G.flow)(ctx, w, h, rng(seed * 9301 + KEYS.indexOf(kind) * 49297 + 7));
    }
  }
  customElements.define('nft-art', NftArt);
})();
