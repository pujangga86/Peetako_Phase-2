// QR codes for share links (decided 20 Oct 2026). Drawn in the browser from the vendored, MIT-licensed
// qrcode-generator by Kazuhiko Arase (assets/vendor/qrcode.js, loaded as a classic script before this module).
// Nothing is sent anywhere: the link is turned into black squares on this device.

// An <svg> of the QR code for `text`, or '' when the library is missing. Dark on white, with a quiet zone,
// so phone cameras read it on any palette.
export function qrSvg(text, { label = 'QR code' } = {}) {
  const make = window.qrcode;
  if (typeof make !== 'function') return '';
  try {
    const q = make(0, 'M'); // 0 = smallest version that fits
    q.addData(String(text));
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    const size = n + 8;
    return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" shape-rendering="crispEdges">`
      + `<rect width="${size}" height="${size}" fill="#FFFFFF"/><path d="${d}" fill="#111111"/></svg>`;
  } catch {
    return '';
  }
}
