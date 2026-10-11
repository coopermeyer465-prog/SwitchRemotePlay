(function (root) {
  "use strict";
  const standardBits = [2, 4, 1, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 0, 0, 0, 0, 4096, 8192];
  const lic2Bits = [2, 4, 1, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
  const pressed = (g, i) => !!g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5);
  const axis = (g, i) => {
    const value = g.axes[i];
    return Number.isFinite(value) ? Math.round(Math.max(-1, Math.min(1, value)) * 127 + 128) : 128;
  };

  function detectAxis(axes, centers, excluded = []) {
    let index = -1, change = 0.08;
    axes.forEach((v, i) => {
      const delta = Math.abs(v - centers[i]);
      if (!excluded.includes(i) && Number.isFinite(delta) && delta > change) {
        index = i; change = delta;
      }
    });
    return index;
  }

  function calibratedAxis(g, spec) {
    const value = g.axes[spec.index];
    if (!Number.isFinite(value)) return 128;
    const direction = Math.sign(spec.positive - spec.center);
    const delta = (value - spec.center) * direction;
    const span = Math.abs((delta < 0 ? spec.negative : spec.positive) - spec.center);
    if (!(span > 0.04)) return 128;
    const normalized = Math.max(-1, Math.min(1, delta / span));
    return Math.abs(normalized) < 0.04 ? 128 : Math.round(128 + normalized * 127);
  }

  function mapGamepad(g, profile) {
    const lic2 = g.mapping !== "standard" && /^Lic2 Pro Controller\b/i.test(g.id) && g.axes.length >= 10;
    const bits = lic2 ? lic2Bits : standardBits;
    const state = {buttons: 0, hat: 8, lx: axis(g, 0), ly: axis(g, 1), rx: 128, ry: 128};
    bits.forEach((bit, i) => { if (bit && pressed(g, i)) state.buttons |= bit; });
    state.rx = axis(g, lic2 ? 3 : 2);
    state.ry = axis(g, lic2 ? 4 : 3);
    if (lic2) {
      // Chrome's generic HID layout indexes axes by usage. Hat is slot 9;
      // values 0..7 normalize to -1..1, while neutral 8 normalizes above 1.
      const value = g.axes[9];
      if (Number.isFinite(value) && value >= -1 && value <= 1)
        state.hat = Math.round((value + 1) * 3.5);
    } else {
      const x = Number(pressed(g, 15)) - Number(pressed(g, 14));
      const y = Number(pressed(g, 13)) - Number(pressed(g, 12));
      if (x || y) state.hat = Math.round(Math.atan2(x, -y) / (Math.PI / 4) + 8) % 8;
    }
    if (profile) {
      for (const key of ["lx", "ly", "rx", "ry"])
        if (profile.axes[key]) state[key] = calibratedAxis(g, profile.axes[key]);
      if (profile.buttons) {
        state.buttons &= ~(16 | 32 | 64 | 128);
        for (const [bit, index] of Object.entries(profile.buttons))
          if (pressed(g, index)) state.buttons |= Number(bit);
      }
    }
    return state;
  }

  const api = {mapGamepad, detectAxis};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SwitchGamepad = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
