#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generator docs/arsitektur/UML_EcoMatch.drawio (12 halaman, tanpa dependensi eksternal).

Sumber diagram:
  - 10 blok mermaid dari docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md
  - 2 diagram baru hasil turunan kode backend:
      sequence-compliance     <- backend/routes/compliance.js (FR-14, FR-17)
      activity-pengolahan-tps <- backend/routes/tps.js POST /:id/log (FR-08)

Pemakaian: python scripts/gen_uml_drawio.py
"""
import io
import math
import re
import sys
import xml.etree.ElementTree as ET

DOC = r'C:\Users\nuy07\ecomatch\docs\arsitektur\Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md'
OUT = r'C:\Users\nuy07\ecomatch\docs\arsitektur\UML_EcoMatch.drawio'

SRC_COMPLIANCE = '''sequenceDiagram
    autonumber
    actor A as Admin (Dashboard)
    participant API as API Gateway Express
    participant DB as Database

    A->>API: GET /api/compliance/summary
    API->>API: authenticate + requireActive
    API->>DB: agregat alokasi, sampah, klasifikasi, pengolahan_log
    API->>DB: konfigurasi_regulasi aktif (KOTA_MADIUN)
    DB-->>API: ringkasan + aturan daerah
    API-->>A: 200 kg_dialihkan, alokasi, tps, klasifikasi, target

    alt ALT: laporan ketertelusuran (maks 500 baris)
        A->>API: GET /api/compliance/report
        API->>DB: JOIN alokasi -> sampah -> tps -> klasifikasi -> pengolahan_log
        DB-->>API: baris terbaru
        API-->>A: 200 baris laporan + regulasi
    else ALT: telusuri satu entitas
        A->>API: GET /api/compliance/trace/:id
        API->>DB: SELECT alokasi / sampah + log_audit terkait
        DB-->>API: detail + riwayat
        API-->>A: 200 jejak digital sampah ke TPS
    end

    opt OPT: daftar regulasi daerah
        A->>API: GET /api/compliance/regulations
        API->>DB: SELECT konfigurasi_regulasi
        DB-->>API: daftar aturan
        API-->>A: 200 larangan, kewajiban, sanksi, insentif
    end'''

SRC_PENGOLAHAN = '''flowchart TD
    Start([Mulai - TPS mencatat hasil pengolahan]) --> A["TPS isi form hasil olah<br/>POST /api/tps/:id/log<br/>id_alokasi, input_kg, output_kg, output_jenis, foto_bukti"]
    A --> B{"requireRole tps_pengolah / admin?"}
    B -->|Bukan pemilik: 403| Z([Selesai - gagal])
    B -->|Sesuai| C{"Alokasi milik TPS ini dan status<br/>terkirim / terverifikasi?"}
    C -->|Tidak: 400/403/404| Z
    C -->|Valid| D{"input_kg >= 0, output_kg valid,<br/>output_jenis sesuai enum?"}
    D -->|Invalid: 400| Z
    D -->|Valid| E["INSERT pengolahan_log<br/>+ audit LOG_PENGOLAHAN"]
    E --> F([201 Log pengolahan dicatat])'''

PAGES = [
    ('arsitektur-3tier-ecomatch', 'flow', 0),
    ('activity-unggah-klasifikasi-mbg', 'flow', 1),
    ('activity-routing-mbg-tps', 'flow', 2),
    ('activity-serah-terima-otp', 'flow', 3),
    ('activity-registrasi-eco-match', 'flow', 4),
    ('class-backend-eco-match', 'class', 5),
    ('sequence-klasifikasi-sampah', 'seq', 6),
    ('sequence-routing-mbg-tps', 'seq', 7),
    ('sequence-serah-terima-otp', 'seq', 8),
    ('sequence-compliance', 'seq', 'compliance'),
    ('activity-pengolahan-tps', 'flow', 'pengolahan'),
    ('erd-eco-match', 'er', 9),
]

C_BLUE = '#DAE8FC,#6C8EBF'
C_ORANGE = '#FFE6CC,#D79B00'
C_GREEN = '#D5E8D4,#82B366'
C_YELLOW = '#FFF2CC,#D6B656'
C_GRAY = '#F5F5F5,#666666'


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def wrapped_lines(text, cpl):
    total = 0
    for part in text.split('<br/>'):
        total += max(1, math.ceil(len(part) / cpl))
    return total


def extract_blocks(path):
    src = io.open(path, encoding='utf-8').read()
    return re.findall(r'```mermaid\n(.*?)```', src, re.S)


# ---------------------------------------------------------------- flowchart
DEF_RE = re.compile(
    r'(\w+)\s*(?:\(\[(?P<stadium>[^\]]*?)\]\)|\[\("(?P<cyl>.*?)"\)\]|'
    r'\["(?P<rect>[^"]*?)"\]|\{"(?P<dia>[^"]*?)"\})')


def parse_flowchart(text):
    nodes = {}
    order = []
    edges = []
    subgraphs = {}
    sg_stack = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('flowchart'):
            continue
        m = re.match(r'^subgraph\s+(\w+)\["(.*?)"\]$', line)
        if m:
            sg_stack.append(m.group(1))
            subgraphs[m.group(1)] = {'label': m.group(2), 'members': []}
            continue
        if line == 'end':
            if sg_stack:
                sg_stack.pop()
            continue

        def add(nid, shape, label, explicit=True):
            if nid in nodes:
                if explicit:
                    nodes[nid]['shape'] = shape
                    nodes[nid]['label'] = label
                return
            nodes[nid] = {'shape': shape, 'label': label,
                          'sg': sg_stack[-1] if sg_stack else None}
            order.append(nid)
            if sg_stack and nid not in subgraphs[sg_stack[-1]]['members']:
                subgraphs[sg_stack[-1]]['members'].append(nid)

        defs = list(DEF_RE.finditer(line))
        for d in defs:
            if d.group('stadium') is not None:
                shape, label = 'stadium', d.group('stadium')
            elif d.group('cyl') is not None:
                shape, label = 'cyl', d.group('cyl')
            elif d.group('rect') is not None:
                shape, label = 'rect', d.group('rect')
            else:
                shape, label = 'dia', d.group('dia')
            add(d.group(1), shape, label)

        if '-->' not in line:
            continue
        left, right = line.split('-->', 1)
        ldefs = list(DEF_RE.finditer(left))
        if ldefs:
            src_id = ldefs[-1].group(1)
        else:
            lm = re.match(r'^\s*(\w+)', left)
            src_id = lm.group(1)
        if src_id in subgraphs:
            src_id = 'SG:' + src_id
        elif src_id not in nodes:
            add(src_id, 'rect', src_id, explicit=False)
        rm = re.match(r'^\s*(?:\|([^|]*)\|)?\s*(.*)$', right)
        label = (rm.group(1) or '').strip().strip('"')
        raw_t = rm.group(2)
        targets, depth, buf, q = [], 0, '', False
        for ch in raw_t:
            if ch == '"':
                q = not q
            if not q:
                if ch == '[':
                    depth += 1
                elif ch == ']':
                    depth -= 1
                elif ch == '&' and depth == 0:
                    targets.append(buf)
                    buf = ''
                    continue
            buf += ch
        targets.append(buf)
        for t in targets:
            t = t.strip()
            tm = re.match(r'^(\w+)', t)
            if not tm:
                continue
            dst = tm.group(1)
            if dst in subgraphs:
                dst = 'SG:' + dst
            elif dst not in nodes:
                add(dst, 'rect', dst, explicit=False)
            edges.append({'from': src_id, 'to': dst, 'label': label})
    return nodes, order, edges, subgraphs


def rank_flow(nodes, order, edges):
    ids = list(nodes.keys())
    rank = {i: 0 for i in ids}
    indeg = {i: 0 for i in ids}
    out = {i: [] for i in ids}
    for e in edges:
        indeg[e['to']] += 1
        out[e['from']].append(e['to'])
    remaining = set(ids)
    ready = sorted([i for i in ids if indeg[i] == 0])
    guard = 0
    while remaining and guard < 10000:
        guard += 1
        if ready:
            cur = ready.pop(0)
        else:
            cand = [i for i in remaining
                    if all(o not in remaining for o in out[i]) or not out[i]]
            if not cand:
                cand = [i for i in remaining
                        if not any(o in remaining for o in out[i])]
            if not cand:
                cand = [i for i in remaining if indeg[i] <= max(
                    (indeg[j] for j in remaining), default=0)]
            cur = sorted(cand, key=lambda i: ids.index(i))[0]
        remaining.discard(cur)
        for o in out[cur]:
            if cur in ids:
                rank[o] = max(rank[o], rank[cur] + 1)
            indeg[o] = max(0, indeg[o] - 1)
            if o in remaining and indeg[o] <= 0 and o not in ready:
                ready.append(o)
        ready.sort(key=lambda i: ids.index(i))
    return rank


def style_flow(shape, label, w):
    if shape == 'dia':
        return 'rhombus;whiteSpace=wrap;html=1;fillColor=%s;strokeColor=%s;' % tuple(C_ORANGE.split(','))
    if shape == 'stadium':
        return 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=%s;strokeColor=%s;' % tuple(C_GREEN.split(','))
    if shape == 'cyl':
        return 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;html=1;whiteSpace=wrap;fillColor=%s;strokeColor=%s;' % tuple(C_YELLOW.split(','))
    return 'rounded=0;whiteSpace=wrap;html=1;fillColor=%s;strokeColor=%s;' % tuple(C_BLUE.split(','))


def node_size(n):
    w = 190 if n['shape'] == 'dia' else 180
    cpl = max(10, (w - 30) // 6)
    lines = wrapped_lines(n['label'], cpl)
    if n['shape'] == 'dia':
        h = max(90, lines * 15 + 40)
    elif n['shape'] == 'cyl':
        h = max(70, lines * 15 + 30)
    else:
        h = max(50, lines * 15 + 24)
    return w, h


def layout_flow(page_id, text, cid):
    nodes, order, edges, subgraphs = parse_flowchart(text)
    if subgraphs:
        return layout_flow_bands(nodes, order, edges, subgraphs, cid)
    rank_edges = []
    for e in edges:
        f, t = e['from'], e['to']
        if f.startswith('SG:'):
            mem = subgraphs[f[3:]]['members']
            f = mem[0] if mem else None
        if t.startswith('SG:'):
            mem = subgraphs[t[3:]]['members']
            t = mem[0] if mem else None
        if f and t and f in nodes and t in nodes:
            rank_edges.append({'from': f, 'to': t})
    rank = rank_flow(nodes, order, rank_edges)
    rows = {}
    for nid in order:
        rows.setdefault(rank[nid], []).append(nid)
    geo = {}
    row_widths = {}
    row_sizes = {}
    for r, members in rows.items():
        ws = [(nid,) + node_size(nodes[nid]) for nid in members]
        row_sizes[r] = ws
        row_widths[r] = sum(w for _, w, _ in ws) + 50 * (len(ws) - 1)
    max_w = max(row_widths.values()) if row_widths else 0
    for r, members in row_sizes.items():
        x = (max_w - row_widths[r]) / 2 + 50
        y = 60 + r * 200
        for nid, w, h in members:
            geo[nid] = (x, y, w, h)
            x += w + 50
    cells = []
    sg_cells = []
    node_cells = []
    sg_bounds = {}
    for sg_id, sg in subgraphs.items():
        members = [m for m in sg['members'] if m in geo]
        if not members:
            continue
        x0 = min(geo[m][0] for m in members)
        y0 = min(geo[m][1] for m in members)
        x1 = max(geo[m][0] + geo[m][2] for m in members)
        y1 = max(geo[m][1] + geo[m][3] for m in members)
        bx, by, bw, bh = x0 - 35, y0 - 55, (x1 - x0) + 70, (y1 - y0) + 80
        sg_bounds[sg_id] = (bx, by)
        sg_cells.append({'id': cid('sg_' + sg_id), 'value': sg['label'],
                         'style': 'rounded=1;whiteSpace=wrap;html=1;fillColor=none;'
                                  'strokeColor=#888888;dashed=1;verticalAlign=top;'
                                  'align=left;spacingLeft=8;spacingTop=4;fontSize=12;fontStyle=1;',
                         'x': bx, 'y': by, 'w': bw, 'h': bh, 'parent': '1'})
    for nid in order:
        n = nodes[nid]
        x, y, w, h = geo[nid]
        parent = '1'
        if n['sg'] and n['sg'] in sg_bounds:
            ox, oy = sg_bounds[n['sg']]
            x, y = x - ox, y - oy
            parent = cid('sg_' + n['sg'])
        node_cells.append({'id': cid('n_' + nid), 'value': n['label'],
                           'style': style_flow(n['shape'], n['label'], w),
                           'x': x, 'y': y, 'w': w, 'h': h, 'parent': parent})
    idmap = {nid: cid('n_' + nid) for nid in order}
    for sg_id in subgraphs:
        idmap['SG:' + sg_id] = cid('sg_' + sg_id)
    edge_cells = []
    for i, e in enumerate(edges):
        if e['from'] not in idmap or e['to'] not in idmap:
            continue
        edge_cells.append({'id': cid('e%d' % i), 'source': idmap[e['from']],
                           'target': idmap[e['to']], 'value': e['label'],
                           'style': 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;'
                                    'endArrow=block;endFill=1;strokeColor=#333333;',
                           'label_size': 170})
    cells = sg_cells + node_cells + edge_cells
    return cells


def layout_flow_bands(nodes, order, edges, subgraphs, cid):
    sizes = {nid: node_size(nodes[nid]) for nid in order}
    per_row = 8
    bands = []
    abs_geo = {}
    y_cur = 40
    max_w = 0
    for sg_id, sg in subgraphs.items():
        mem = [m for m in sg['members'] if m in nodes]
        rows = [mem[i:i + per_row] for i in range(0, len(mem), per_row)]
        rw = [sum(sizes[m][0] for m in r) + 50 * (len(r) - 1) for r in rows]
        band_w = max(rw) if rw else 200
        rh = [max(sizes[m][1] for m in r) for r in rows]
        band_h = 60 + sum(h + 40 for h in rh) + 15
        bands.append({'id': sg_id, 'label': sg['label'], 'w': band_w + 60,
                      'h': band_h, 'rows': rows, 'rw': rw, 'rh': rh,
                      'y': y_cur, 'members': mem})
        y_cur += band_h + 50
        max_w = max(max_w, band_w + 60)
    bx0 = 40
    for b in bands:
        ox = bx0 + (max_w - b['w']) / 2
        b['x'] = ox
        yy = b['y'] + 55
        for r_i, r in enumerate(b['rows']):
            xx = ox + 30 + (b['w'] - 60 - b['rw'][r_i]) / 2
            for m in r:
                abs_geo[m] = (xx, yy, sizes[m][0], sizes[m][1])
                xx += sizes[m][0] + 50
            yy += b['rh'][r_i] + 40
    stray_y = y_cur
    for nid in order:
        if nid not in abs_geo:
            w, h = sizes[nid]
            abs_geo[nid] = (40, stray_y, w, h)
            stray_y += h + 40
    sg_cells = []
    for b in bands:
        sg_cells.append({'id': cid('sg_' + b['id']), 'value': b['label'],
                         'style': 'rounded=1;whiteSpace=wrap;html=1;fillColor=none;'
                                  'strokeColor=#888888;dashed=1;verticalAlign=top;'
                                  'align=left;spacingLeft=8;spacingTop=4;fontSize=12;fontStyle=1;',
                         'x': b['x'], 'y': b['y'], 'w': b['w'], 'h': b['h'],
                         'parent': '1'})
    origin = {b['id']: (b['x'], b['y']) for b in bands}
    node_cells = []
    for nid in order:
        n = nodes[nid]
        x, y, w, h = abs_geo[nid]
        parent = '1'
        if n['sg'] and n['sg'] in origin:
            ox, oy = origin[n['sg']]
            x, y = x - ox, y - oy
            parent = cid('sg_' + n['sg'])
        node_cells.append({'id': cid('n_' + nid), 'value': n['label'],
                           'style': style_flow(n['shape'], n['label'], w),
                           'x': x, 'y': y, 'w': w, 'h': h, 'parent': parent})
    idmap = {nid: cid('n_' + nid) for nid in order}
    for sg_id in subgraphs:
        idmap['SG:' + sg_id] = cid('sg_' + sg_id)
    edge_cells = []
    for i, e in enumerate(edges):
        if e['from'] not in idmap or e['to'] not in idmap:
            continue
        edge_cells.append({'id': cid('e%d' % i), 'source': idmap[e['from']],
                           'target': idmap[e['to']], 'value': e['label'],
                           'style': 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;'
                                    'endArrow=block;endFill=1;strokeColor=#333333;',
                           'label_size': 170})
    return sg_cells + node_cells + edge_cells


# ---------------------------------------------------------------- sequence
def parse_sequence(text):
    participants = []
    pmap = {}
    root = []
    frames = [{'indent': -1, 'container': root, 'frag': None}]
    autonumber = False
    for raw in text.splitlines():
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip(' '))
        c = raw.strip()
        if c == 'sequenceDiagram':
            continue
        if c == 'autonumber':
            autonumber = True
            continue
        m = re.match(r'^(actor|participant)\s+(\w+)\s+as\s+(.+)$', c)
        if m:
            pid = m.group(2)
            pmap[pid] = len(participants)
            participants.append({'id': pid, 'label': m.group(3), 'actor': m.group(1) == 'actor'})
            continue
        m = re.match(r'^(loop|alt|opt)\s+(.*)$', c)
        if m:
            frag = {'type': 'frag', 'kind': m.group(1), 'label': m.group(2),
                    'branches': [{'label': None, 'items': []}]}
            frames[-1]['container'].append(frag)
            frames.append({'indent': indent, 'container': frag['branches'][0]['items'], 'frag': frag})
            continue
        if c.startswith('else') and len(frames) > 1:
            frag = frames[-1]['frag']
            if frag and frag['kind'] == 'alt':
                br = {'label': c[5:].strip(), 'items': []}
                frag['branches'].append(br)
                frames[-1]['container'] = br['items']
                continue
        if c == 'end' and len(frames) > 1:
            frames.pop()
            continue
        m = re.match(r'^(\w+)\s*(->>|-->>)\s*(\w+)\s*:\s*(.*)$', c)
        if m:
            frm, arrow, to, textmsg = m.groups()
            for pid in (frm, to):
                if pid not in pmap:
                    pmap[pid] = len(participants)
                    participants.append({'id': pid, 'label': pid, 'actor': False})
            frames[-1]['container'].append(
                {'type': 'msg', 'frm': frm, 'to': to, 'text': textmsg,
                 'dashed': arrow.startswith('--')})
    return participants, root, autonumber


def seq_refs(items, out):
    for it in items:
        if it['type'] == 'msg':
            out.add(it['frm'])
            out.add(it['to'])
        else:
            for br in it['branches']:
                seq_refs(br['items'], out)


def seq_height(items):
    h = 0
    for it in items:
        if it['type'] == 'msg':
            h += 48 if len(it['text']) > 34 else 34
        else:
            fh = 30
            for bi, br in enumerate(it['branches']):
                if bi > 0:
                    fh += 28
                fh += seq_height(br['items'])
            h += fh + 10
    return h


def layout_seq(page_id, text, cid):
    participants, root, autonumber = parse_sequence(text)
    px = {}
    margin, sp = 170, 270
    for i, p in enumerate(participants):
        px[p['id']] = margin + i * sp
    cells = []
    total_h = seq_height(root) + 130
    for p in participants:
        cx = px[p['id']]
        cells.append({'id': cid('lf_' + p['id']), 'value': None,
                      'style': 'fillColor=#999999;strokeColor=none;opacity=50;',
                      'x': cx, 'y': 76, 'w': 2, 'h': total_h - 76, 'parent': '1'})
    for p in participants:
        cx = px[p['id']]
        cells.append({'id': cid('hd_' + p['id']), 'value': p['label'],
                      'style': 'rounded=0;whiteSpace=wrap;html=1;fillColor=%s;strokeColor=%s;'
                               'fontSize=12;fontStyle=1;' % tuple(C_BLUE.split(',')),
                      'x': cx - 95, 'y': 16, 'w': 190, 'h': 46, 'parent': '1'})
    counter = {'n': 0}

    def emit_msg(msg, y):
        x1, x2 = px[msg['frm']], px[msg['to']]
        h = 48 if len(msg['text']) > 34 else 34
        yc = y + h / 2
        counter['n'] += 1
        label = msg['text']
        if autonumber:
            label = '%d. %s' % (counter['n'], msg['text'])
        style = 'edgeStyle=none;html=1;endArrow=block;endFill=1;strokeColor=#333333;'
        if msg['dashed']:
            style += 'dashed=1;'
        if msg['frm'] == msg['to']:
            edge = {'id': cid('sm%d' % counter['n']), 'value': label,
                    'style': style + 'curved=0;',
                    'src_pt': (x1 + 2, yc - 8), 'dst_pt': (x1 + 2, yc + 8),
                    'waypoints': [(x1 + 85, yc - 8), (x1 + 85, yc + 8)],
                    'parent': '1', 'label_size': 170}
        else:
            s, t = (x1 + 100, x2 - 100) if x1 < x2 else (x1 - 100, x2 + 100)
            edge = {'id': cid('m%d' % counter['n']), 'value': label,
                    'style': style,
                    'src_pt': (s, yc), 'dst_pt': (t, yc),
                    'parent': '1', 'label_size': 170}
        cells.append(edge)
        return y + h

    def place(items, y):
        for it in items:
            if it['type'] == 'msg':
                y = emit_msg(it, y)
            else:
                refs = set()
                seq_refs([it], refs)
                xs = [px[r] for r in refs if r in px]
                lo = (min(xs) - 140) if xs else margin - 140
                hi = (max(xs) + 140) if xs else margin + 140
                box_y = y
                box_h = seq_height([it])
                head = {'id': cid('fb%d' % counter['n'] + it['kind'] + str(int(box_y))),
                        'value': '%s %s' % (it['kind'], it['label']),
                        'style': 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFF2CC;'
                                 'strokeColor=#D6B656;verticalAlign=top;align=left;'
                                 'spacingLeft=8;spacingTop=3;fontSize=11;fontStyle=1;',
                        'x': lo, 'y': box_y, 'w': hi - lo, 'h': box_h, 'parent': '1'}
                cells.append(head)
                yy = box_y + 30
                for bi, br in enumerate(it['branches']):
                    if bi > 0:
                        cells.append({'id': cid('ln%d' % counter['n'] + str(int(yy))),
                                      'value': None,
                                      'style': 'endArrow=none;html=1;strokeColor=#D6B656;dashed=0;',
                                      'src_pt': (lo, yy), 'dst_pt': (hi, yy), 'parent': '1'})
                        cells.append({'id': cid('lt%d' % counter['n'] + str(int(yy))),
                                      'value': 'else %s' % (br['label'] or ''),
                                      'style': 'text;html=1;align=left;fontSize=10;fontStyle=2;'
                                              'fillColor=none;strokeColor=none;',
                                      'x': lo + 8, 'y': yy - 18, 'w': hi - lo - 16, 'h': 16,
                                      'parent': '1'})
                        yy += 28
                    yy = place(br['items'], yy)
                y = box_y + box_h + 10
        return y

    place(root, 76)
    return cells


# ---------------------------------------------------------------- class
def parse_class(text):
    classes = {}
    order = []
    rels = []
    cur = None
    for raw in text.splitlines():
        c = raw.strip()
        if not c or c == 'classDiagram':
            continue
        m = re.match(r'^class\s+(\w+)\s*\{$', c)
        if m:
            cur = m.group(1)
            classes[cur] = []
            order.append(cur)
            continue
        if c == '}':
            cur = None
            continue
        if cur:
            classes[cur].append(c)
            continue
        m = re.match(
            r'^(\w+)(?:\s+"([^"]*)")?\s*-->\s*(?:"([^"]*)"\s+)?(\w+)\s*(?::\s*(.+))?$',
            c)
        if m:
            rels.append({'from': m.group(1), 'to': m.group(4),
                         'mult_a': m.group(2), 'mult_b': m.group(3),
                         'label': (m.group(5) or '').strip()})
    return classes, order, rels


def layout_class(page_id, text, cid):
    classes, order, rels = parse_class(text)
    cols, w, gapx, gapy = 5, 250, 70, 90
    geo = {}
    x, y, rowh = 60, 60, 0
    for i, name in enumerate(order):
        col = i % cols
        if col == 0 and i > 0:
            y += rowh + gapy
            rowh = 0
        h = 34 + 16 * len(classes[name])
        xx = 60 + col * (w + gapx)
        geo[name] = (xx, y, w, h)
        rowh = max(rowh, h)
    cells = []
    for name in order:
        gx, gy, gw, gh = geo[name]
        body = '<b>%s</b><hr size="1">%s' % (
            esc(name), '<br/>'.join(esc(m) for m in classes[name]))
        cells.append({'id': cid('c_' + name), 'value': body,
                      'style': 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;'
                               'spacingLeft=6;spacingTop=2;fontSize=11;fillColor=%s;strokeColor=%s;'
                               % tuple(C_BLUE.split(',')),
                      'x': gx, 'y': gy, 'w': gw, 'h': gh, 'parent': '1'})
    idmap = {n: cid('c_' + n) for n in order}
    for i, r in enumerate(rels):
        if r['from'] not in idmap or r['to'] not in idmap:
            continue
        eid = cid('r%d' % i)
        cells.append({'id': eid, 'source': idmap[r['from']], 'target': idmap[r['to']],
                      'value': None,
                      'style': 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;'
                               'endFill=1;strokeColor=#333333;'},
                     )
        if r['mult_a']:
            cells.append({'id': eid + '_a', 'value': r['mult_a'],
                          'style': 'text;html=1;align=center;fontSize=10;fillColor=none;strokeColor=none;',
                          'parent': eid, 'rel': (0.06, -0.3), 'label_size': 40})
        if r['mult_b']:
            cells.append({'id': eid + '_b', 'value': r['mult_b'],
                          'style': 'text;html=1;align=center;fontSize=10;fillColor=none;strokeColor=none;',
                          'parent': eid, 'rel': (0.94, -0.3), 'label_size': 40})
        if r['label']:
            cells.append({'id': eid + '_l', 'value': r['label'],
                          'style': 'text;html=1;align=center;fontSize=10;fontStyle=2;fillColor=none;strokeColor=none;',
                          'parent': eid, 'rel': (0.5, -0.3), 'label_size': 170})
    return cells


# ---------------------------------------------------------------- ER
CARD_TEXT = {'||': '1', 'o|': '0..1', 'o{': '0..*', '|{': '1..*', '|o': '0..1'}
CARD_ARROW = {'||': 'ERone', 'o|': 'ERzeroToOne', 'o{': 'ERzeroToMany',
              '|{': 'ERoneToMany', '|o': 'ERzeroToOne'}


def parse_er(text):
    rels = []
    entities = {}
    order = []
    cur = None
    for raw in text.splitlines():
        c = raw.strip()
        if not c or c == 'erDiagram':
            continue
        m = re.match(r'^(\w+)\s+(\|\||o\|)\s*--\s*(o\{|\|\{|\|\||o\|)\s+(\w+)\s*:\s*"(.*)"$',
                     c)
        if m:
            rels.append({'from': m.group(1), 'card_a': m.group(2),
                         'card_b': m.group(3), 'to': m.group(4),
                         'label': m.group(5)})
            continue
        m = re.match(r'^(\w+)\s*\{$', c)
        if m:
            cur = m.group(1)
            entities[cur] = []
            order.append(cur)
            continue
        if c == '}':
            cur = None
            continue
        if cur:
            entities[cur].append(c)
    return entities, order, rels


def layout_er(page_id, text, cid):
    entities, order, rels = parse_er(text)
    cols, w, gapx, gapy = 4, 270, 90, 150
    geo = {}
    y, rowh = 60, 0
    for i, name in enumerate(order):
        col = i % cols
        if col == 0 and i > 0:
            y += rowh + gapy
            rowh = 0
        h = 32 + 16 * len(entities[name])
        xx = 60 + col * (w + gapx)
        geo[name] = (xx, y, w, h)
        rowh = max(rowh, h)
    cells = []
    for name in order:
        gx, gy, gw, gh = geo[name]
        body = '<b>%s</b><hr size="1">%s' % (
            esc(name), '<br/>'.join(esc(a) for a in entities[name]))
        cells.append({'id': cid('t_' + name), 'value': body,
                      'style': 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;'
                               'spacingLeft=6;spacingTop=2;fontSize=11;fillColor=%s;strokeColor=%s;'
                               % tuple(C_GRAY.split(',')),
                      'x': gx, 'y': gy, 'w': gw, 'h': gh, 'parent': '1'})
    idmap = {n: cid('t_' + n) for n in order}
    for i, r in enumerate(rels):
        if r['from'] not in idmap or r['to'] not in idmap:
            continue
        eid = cid('er%d' % i)
        style = ('edgeStyle=entityRelationEdgeStyle;rounded=0;html=1;strokeColor=#333333;'
                 'startArrow=%s;startFill=0;endArrow=%s;endFill=0;'
                 % (CARD_ARROW[r['card_a']], CARD_ARROW[r['card_b']]))
        cells.append({'id': eid, 'source': idmap[r['from']], 'target': idmap[r['to']],
                      'value': r['label'], 'style': style, 'label_size': 190})
        cells.append({'id': eid + '_a', 'value': CARD_TEXT[r['card_a']],
                      'style': 'text;html=1;align=center;fontSize=10;fillColor=none;strokeColor=none;',
                      'parent': eid, 'rel': (0.08, -0.4), 'label_size': 30})
        cells.append({'id': eid + '_b', 'value': CARD_TEXT[r['card_b']],
                      'style': 'text;html=1;align=center;fontSize=10;fillColor=none;strokeColor=none;',
                      'parent': eid, 'rel': (0.92, -0.4), 'label_size': 30})
    return cells


# ---------------------------------------------------------------- emit
def cell_xml(c):
    if 'src_pt' in c:
        way = ''
        if c.get('waypoints'):
            way = '<Array as="points">%s</Array>' % ''.join(
                '<mxPoint x="%d" y="%d"/>' % (int(px_), int(py_)) for px_, py_ in c['waypoints'])
        geo = ('<mxGeometry x="0" y="0" width="0" height="0" as="geometry">'
               '<mxPoint x="%d" y="%d" as="sourcePoint"/>'
               '<mxPoint x="%d" y="%d" as="targetPoint"/>%s'
               '<mxPoint x="0" y="10" as="offset"/></mxGeometry>'
               % (int(c['src_pt'][0]), int(c['src_pt'][1]),
                  int(c['dst_pt'][0]), int(c['dst_pt'][1]), way))
        val = ''
        lab = ''
        if c.get('value'):
            lab = ('<mxCell id="%s_lbl" value="%s" style="text;html=1;align=center;'
                   'verticalAlign=middle;whiteSpace=wrap;fontSize=11;" vertex="1" parent="%s">'
                   '<mxGeometry x="0.5" relative="1" width="%d" height="40" as="geometry">'
                   '<mxPoint x="0" y="8" as="offset"/></mxGeometry></mxCell>'
                   % (c['id'], esc(c['value']), c['id'], c.get('label_size', 170)))
        return ('<mxCell id="%s"%s style="%s" edge="1" parent="%s">%s</mxCell>%s'
                % (c['id'], val, esc(c['style']), c.get('parent', '1'), geo, lab))
    if 'source' in c:
        geo = '<mxGeometry relative="1" as="geometry"/>'
        val = ''
        lab = ''
        if c.get('value'):
            lab = ('<mxCell id="%s_lbl" value="%s" style="text;html=1;align=center;'
                   'verticalAlign=middle;whiteSpace=wrap;fontSize=11;" vertex="1" parent="%s">'
                   '<mxGeometry x="0.5" relative="1" width="%d" height="40" as="geometry">'
                   '<mxPoint x="0" y="8" as="offset"/></mxGeometry></mxCell>'
                   % (c['id'], esc(c['value']), c['id'], c.get('label_size', 170)))
        return ('<mxCell id="%s"%s style="%s" edge="1" source="%s" target="%s" '
                'parent="%s">%s</mxCell>%s'
                % (c['id'], val, esc(c['style']), c['source'], c['target'],
                   c.get('parent', '1'), geo, lab))
    if c.get('rel'):
        rx, ry = c['rel']
        geo = ('<mxGeometry x="%s" y="%s" relative="1" width="%d" height="16" as="geometry">'
               '<mxPoint x="0" y="%d" as="offset"/></mxGeometry>'
               % (rx, ry, c.get('label_size', 40), 14 if ry < 0 else -14))
        return ('<mxCell id="%s" value="%s" style="%s" vertex="1" parent="%s">%s</mxCell>'
                % (c['id'], esc(c['value']), esc(c['style']), c['parent'], geo))
    geo = '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/>%s' % (
        int(c['x']), int(c['y']), int(c['w']), int(c['h']),
        '' if not c.get('waypoints') else '')
    return ('<mxCell id="%s"%s style="%s" vertex="1" parent="%s">%s</mxCell>'
            % (c['id'],
               ' value="%s"' % esc(c['value']) if c.get('value') is not None else '',
               esc(c['style']), c.get('parent', '1'), geo))


def bounds(cells):
    xs, ys, xe, ye = [], [], [], []

    def abs_of(c):
        if c.get('parent', '1') != '1' and not c['parent'].startswith('sg_'):
            return c['x'], c['y'], c['w'], c['h']
        return c['x'], c['y'], c['w'], c['h']

    for c in cells:
        if 'x' in c and 'src_pt' not in c and 'source' not in c:
            x, y, w, h = abs_of(c)
            xs.append(x)
            ys.append(y)
            xe.append(x + w)
            ye.append(y + h)
    return (max(xs + [0]), max(ys + [0]), max(xe + [400]), max(ye + [300]))


def build_page(page_id, cells, cid):
    _, _, w, h = bounds(cells)
    pw = max(1200, int(w + 80))
    ph = max(800, int(h + 80))
    body = ''.join(cell_xml(c) for c in cells)
    return ('<diagram id="%s" name="%s">'
            '<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" '
            'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
            'pageWidth="%d" pageHeight="%d" math="0" shadow="0">'
            '<root><mxCell id="0"/><mxCell id="1" parent="0"/>%s</root>'
            '</mxGraphModel></diagram>' % (esc(page_id), esc(page_id), pw, ph, body))


def main():
    blocks = extract_blocks(DOC)
    if len(blocks) != 10:
        print('ERROR: blok mermaid = %d (diharapkan 10)' % len(blocks))
        return 1
    pages = []
    stats = []
    for i, (name, kind, src) in enumerate(PAGES):
        text = blocks[src] if isinstance(src, int) else (
            SRC_COMPLIANCE if src == 'compliance' else SRC_PENGOLAHAN)
        prefix = 'p%d_' % i
        cid = (lambda pid: lambda s: pid + s)(prefix)
        if kind == 'flow':
            cells = layout_flow(name, text, cid)
        elif kind == 'seq':
            cells = layout_seq(name, text, cid)
        elif kind == 'class':
            cells = layout_class(name, text, cid)
        else:
            cells = layout_er(name, text, cid)
        stats.append('%-32s %3d cells' % (name, len(cells)))
        pages.append(build_page(name, cells, cid))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<mxfile host="app.diagrams.net" agent="gen_uml_drawio.py" version="24.7.7" '
           'type="device">\n%s\n</mxfile>\n' % '\n'.join(pages))
    io.open(OUT, 'w', encoding='utf-8').write(xml)
    ET.fromstring(xml)
    print('DITULIS:', OUT)
    for s in stats:
        print(' ', s)
    return 0


if __name__ == '__main__':
    sys.exit(main())
