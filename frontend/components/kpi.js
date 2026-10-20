import { icon, esc } from '../core/ui.js';

export function kpiCard(o) {
  const { label, value, unit = '', hint = '', ic = 'leaf', tone = '' } = o;
  return `<div class="kpi">
    <div class="kpi-top">
      <div class="kpi-label">${esc(label)}</div>
      <span class="kpi-icon ${tone ? 'is-' + tone : ''}">${icon(ic, 20)}</span>
    </div>
    <div class="kpi-value">${value}${unit ? `<span class="kpi-unit">${esc(unit)}</span>` : ''}</div>
    ${hint ? `<div class="hint t-xs muted">${hint}</div>` : ''}
  </div>`;
}

export function kpiGrid(cards) {
  return `<div class="section"><div class="grid grid-4">${cards.join('')}</div></div>`;
}
