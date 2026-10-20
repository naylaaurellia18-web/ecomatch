import { gisHtml, initMap, geoCounts, destroyMap } from '../components/map.js';

let current = { donor: 0, tps: 0, kurir: 0, rute: 0 };

export async function mount(root, ctx) {
  current = await geoCounts().catch(() => current);
  root.innerHTML = gisHtml(current);
  initMap();
}

export function cleanup() {
  destroyMap();
}
