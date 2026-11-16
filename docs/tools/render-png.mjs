/* Render ulang 10 PNG diagram dari blok mermaid Dokumen_Arsitektur (Chrome headless).
 * Pemakaian: node docs/tools/render-png.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DOCS = path.resolve(import.meta.dirname, '..');
const MD = path.join(DOCS, 'arsitektur', 'Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md');
const TMP = path.join(DOCS, '_render_tmp.html');
const FILES = [
  'EcoMatch_01_arsitektur_3tier.png',
  'EcoMatch_02a_activity_klasifikasi.png',
  'EcoMatch_02b_activity_routing.png',
  'EcoMatch_03_activity_otp.png',
  'EcoMatch_04_activity_registrasi.png',
  'EcoMatch_05_class.png',
  'EcoMatch_06_sequence_klasifikasi.png',
  'EcoMatch_07_sequence_routing.png',
  'EcoMatch_08_sequence_otp.png',
  'ERD_EcoMatch.png'
];
const FALLBACK = [[1568,1552],[794,1200],[778,1400],[1234,1400],[1408,1400],[1568,1496],[1568,1192],[1568,1932],[1568,1510],[1568,974]];

const md = fs.readFileSync(MD, 'utf8');
const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m => m[1]);
if (blocks.length !== 10) { console.error('jumlah blok =', blocks.length); process.exit(1); }

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function run(args) {
  const r = spawnSync(CHROME, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (r.stdout || '') + (r.stderr || '');
}

let fail = 0;
for (let i = 0; i < 10; i++) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="vendor/mermaid.min.js"></script>
<style>html,body{margin:0;background:#fff}#m{padding:20px;display:inline-block;min-width:420px}</style>
</head><body><div id="m"><pre class="mermaid">${esc(blocks[i])}</pre></div>
<script>mermaid.initialize({startOnLoad:true,theme:'neutral',securityLevel:'loose',flowchart:{useMaxWidth:false,htmlLabels:true},sequence:{useMaxWidth:false},class:{useMaxWidth:false},er:{useMaxWidth:false}});</script>
</body></html>`;
  fs.writeFileSync(TMP, html, 'utf8');
  const url = 'file:///' + TMP.replace(/\\/g, '/');
  const dom = run(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--virtual-time-budget=15000', '--dump-dom', url]);
  const svgTag = (dom.match(/<svg[^>]*>/) || [''])[0];
  let wm = svgTag.match(/width="([\d.]+)"/);
  let hm = svgTag.match(/height="([\d.]+)"/);
  if ((!wm || +wm[1] < 50 || !hm || +hm[1] < 50)) {
    const vb = svgTag.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (vb) { wm = ['', vb[1]]; hm = ['', vb[2]]; }
  }
  const err = (dom.match(/Syntax error in text|error during parse[^<]*/) || [''])[0];
  if (!wm || !hm || err) {
    console.log('FAIL-parse', i, FILES[i], err.slice(0, 140) || ('svgTag=' + svgTag.slice(0, 120)));
    fail++;
    continue;
  }
  const w = Math.min(7600, Math.ceil(+wm[1]) + 40);
  const h = Math.min(7600, Math.ceil(+hm[1]) + 40);
  const out = path.join(DOCS, 'arsitektur', FILES[i]);
  fs.rmSync(out, { force: true });
  run(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--virtual-time-budget=15000',
    '--screenshot=' + out, `--window-size=${w},${h}`, url]);
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  const ok = size > 8000;
  console.log(ok ? 'OK  ' : 'FAIL', i, FILES[i], `${w}x${h}`, size);
  if (!ok) fail++;
}
fs.rmSync(TMP, { force: true });
process.exit(fail ? 1 : 0);
