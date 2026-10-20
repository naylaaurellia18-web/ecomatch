import { esc } from '../core/ui.js';

const PALETTE = ['#2E7D32', '#81C784', '#FF6F00', '#0277BD', '#C62828', '#8E24AA'];

/** Donut SVG: items = [{label, value}], nilai digambar sebagai irisan. */
export function donut(items, opts = {}) {
  const { size = 148, stroke = 20, center = '', sub = '' } = opts;
  const total = items.reduce((a, b) => a + Number(b.value || 0), 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = items
    .map((it, i) => {
      const frac = Number(it.value || 0) / total;
      const len = frac * c;
      const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
        stroke="${it.color || PALETTE[i % PALETTE.length]}" stroke-width="${stroke}"
        stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" />`;
      offset += len;
      return seg;
    })
    .join('');

  const legend = items
    .map(
      (it, i) => `<span class="legend-item" style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:13px">
        <span class="dot" style="width:9px;height:9px;border-radius:50%;background:${it.color || PALETTE[i % PALETTE.length]}"></span>
        ${esc(it.label)} <b>${it.value}</b></span>`
    )
    .join('');

  return `<div class="stack stack-4">
    <div class="donut" style="margin-inline:auto">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Diagram lingkaran">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}" />
        ${segs}
      </svg>
      ${center ? `<div class="donut-center"><b>${center}</b><span class="t-xs muted">${esc(sub)}</span></div>` : ''}
    </div>
    <div style="text-align:center">${legend}</div>
  </div>`;
}

/** Bar chart horizontal: items = [{label, value, pct, color?}]. */
export function bars(items) {
  return `<div class="bars">${items
    .map((it) => {
      const pct = it.pct != null ? it.pct : it.value;
      return `<div class="bar-row">
        <span class="bar-label">${esc(it.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%;${it.color ? `background:${it.color}` : ''}"></span></span>
        <span class="bar-value" style="text-align:right;font-weight:700">${it.display != null ? it.display : pct}</span>
      </div>`;
    })
    .join('')}</div>`;
}
