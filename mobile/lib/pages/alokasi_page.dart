import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../brand.dart';
import 'otp_page.dart';

Color statusColor(String s) {
  switch (s) {
    case 'tersedia':
      return const Color(0xFF2E7D32);
    case 'dialokasikan':
      return const Color(0xFF1565C0);
    case 'dijemput':
      return const Color(0xFFEF6C00);
    case 'terkirim':
      return const Color(0xFF6A1B9A);
    case 'terverifikasi':
      return const Color(0xFF00695C);
    case 'dibatalkan':
      return const Color(0xFFC62828);
    default:
      return Colors.grey;
  }
}

class AlokasiPage extends StatefulWidget {
  const AlokasiPage({super.key});

  @override
  State<AlokasiPage> createState() => _AlokasiPageState();
}

class _AlokasiPageState extends State<AlokasiPage>
    with AutomaticKeepAliveClientMixin {
  List<dynamic>? _rows;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _rows = null;
    });
    try {
      final data = await Api.get('/api/routing');
      if (!mounted) return;
      setState(() => _rows = data as List);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    if (_rows == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_rows!.isEmpty) {
      return const _EmptyView(
        icon: Icons.alt_route,
        message: 'Belum ada alokasi.\nAlokasi muncul setelah admin menjalankan AI Routing.',
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: _rows!.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (ctx, i) {
          final r = _rows![i] as Map<String, dynamic>;
          return _AlokasiCard(
            row: r,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                  builder: (_) => AlokasiDetailPage(id: r['id_alokasi'])),
            ),
          );
        },
      ),
    );
  }
}

class _AlokasiCard extends StatelessWidget {
  const _AlokasiCard({required this.row, required this.onTap});
  final Map<String, dynamic> row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = '${row['status'] ?? '-'}';
    final skor = row['skor_persen'];
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 6,
              decoration: BoxDecoration(
                color: statusColor(status),
                borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(16)),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(11, 13, 13, 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('${row['nama_sampah'] ?? 'Sisa Makanan'}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 15)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 3),
                          decoration: BoxDecoration(
                            color: statusColor(status).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(status,
                              style: TextStyle(
                                  fontSize: 11,
                                  color: statusColor(status),
                                  fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Row(children: [
                      const Icon(Icons.factory,
                          size: 15, color: kEcoGreen),
                      const SizedBox(width: 5),
                      Expanded(
                          child: Text('${row['nama_penerima'] ?? '-'}',
                              style: const TextStyle(fontSize: 13))),
                    ]),
                    const SizedBox(height: 3),
                    Row(children: [
                      const Icon(Icons.person,
                          size: 15, color: kEcoGreen),
                      const SizedBox(width: 5),
                      Text('Kurir: ${row['nama_kurir'] ?? '-'}',
                          style: const TextStyle(fontSize: 13)),
                    ]),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 6, children: [
                      _chip(Icons.scale, '${row['berat_kg'] ?? '-'} kg'),
                      _chip(Icons.map, '${row['jarak_km'] ?? '-'} km'),
                      if (skor != null)
                        _chip(Icons.star, 'Skor $skor%',
                            highlight: true),
                    ]),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 2),
          ],
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text, {bool highlight = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: highlight ? const Color(0xFFFFF4D6) : kEcoMint,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon,
            size: 13,
            color: highlight ? const Color(0xFFB26A00) : kEcoGreen),
        const SizedBox(width: 4),
        Text(text,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: highlight ? const Color(0xFFB26A00) : kEcoGreenDark)),
      ]),
    );
  }
}

class AlokasiDetailPage extends StatefulWidget {
  const AlokasiDetailPage({super.key, required this.id});
  final dynamic id;

  @override
  State<AlokasiDetailPage> createState() => _AlokasiDetailPageState();
}

class _AlokasiDetailPageState extends State<AlokasiDetailPage> {
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _data = null;
    });
    try {
      final data = await Api.get('/api/routing/${widget.id}/explain');
      if (!mounted) return;
      setState(() => _data = data as Map<String, dynamic>);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  LatLng? _point(dynamic lat, dynamic lng) {
    if (lat == null || lng == null) return null;
    final la = double.tryParse('$lat');
    final lo = double.tryParse('$lng');
    if (la == null || lo == null) return null;
    return LatLng(la, lo);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
          appBar: AppBar(title: const Text('Detail Alokasi')),
          body: _ErrorView(message: _error!, onRetry: _load));
    }
    if (_data == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Detail Alokasi')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final alo = _data!['alokasi'] as Map<String, dynamic>;
    final tps = _data!['penerima'] as Map<String, dynamic>? ?? {};
    final kurir = _data!['kurir'] as Map<String, dynamic>? ?? {};
    final kontribusi =
        (_data!['kontribusi'] as Map?)?.cast<String, dynamic>() ?? {};
    final status = '${alo['status'] ?? '-'}';

    final donor = _point(alo['lat_donor'], alo['lng_donor']);
    final pTps = _point(tps['lat'], tps['lng']);
    final pKurir = _point(kurir['lat'], kurir['lng']);

    final markers = <Marker>[];
    final points = <LatLng>[];
    if (pKurir != null) {
      markers.add(_marker(pKurir, Icons.delivery_dining, Colors.orange));
      points.add(pKurir);
    }
    if (donor != null) {
      markers.add(_marker(donor, Icons.restaurant, Colors.blue));
      points.add(donor);
    }
    if (pTps != null) {
      markers.add(_marker(pTps, Icons.factory, Colors.green));
      points.add(pTps);
    }

    final canOtp = Api.role == 'penerima' &&
        ['dijemput', 'terkirim'].contains(status);

    return Scaffold(
      appBar: AppBar(title: const Text('Detail Alokasi')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Container(
              decoration: BoxDecoration(
                gradient: kEcoGradient,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text('${alo['nama_sampah'] ?? '-'}',
                              style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(status,
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: statusColor(status))),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 16,
                      runSpacing: 6,
                      children: [
                        _stat(Icons.scale, '${alo['berat_kg'] ?? '-'} kg'),
                        _stat(Icons.map, '${alo['jarak_km'] ?? '-'} km'),
                        _stat(Icons.star, 'Skor ${alo['skor_persen'] ?? '-'}%'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _sectionTitle(Icons.info_outline, 'Detail Pengangkutan'),
                    const SizedBox(height: 8),
                    _row(Icons.factory, 'Penerima', '${tps['nama_penerima'] ?? alo['nama_penerima'] ?? '-'}'),
                    _row(Icons.recycling, 'Jenis penerima',
                        '${tps['jenis_penerima'] ?? '-'}'),
                    _row(Icons.person, 'Kurir', '${kurir['nama'] ?? '-'}'),
                    _row(Icons.location_on, 'Donor', '${alo['nama_donor'] ?? '-'}'),
                    _row(Icons.category, 'Kategori',
                        '${alo['kategori'] ?? '-'} • ${alo['tingkat_pembusukan'] ?? '-'}'),
                  ],
                ),
              ),
            ),
            if (points.length >= 2) ...[
              const SizedBox(height: 10),
              _sectionTitle(Icons.map_outlined, 'Peta Rute'),
              const SizedBox(height: 8),
              Card(
                clipBehavior: Clip.antiAlias,
                child: SizedBox(
                  height: 230,
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: LatLng(
                          (points.first.latitude + points.last.latitude) / 2,
                          (points.first.longitude +
                                  points.last.longitude) /
                              2),
                      initialZoom: 12,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'id.ac.uns.ecomatch.mobile',
                      ),
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: points,
                            strokeWidth: 4,
                            color: kEcoGreen,
                          ),
                        ],
                      ),
                      MarkerLayer(markers: markers),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _sectionTitle(Icons.auto_awesome,
                        'Penjelasan AI Routing (FR-04)'),
                    const SizedBox(height: 6),
                    Text('${_data!['rumus'] ?? ''}',
                        style: const TextStyle(
                            fontSize: 12.5, color: Colors.black54)),
                    const SizedBox(height: 8),
                    _bar('Jenis cocok', kontribusi['jenis_cocok']),
                    _bar('Kapasitas', kontribusi['kapasitas']),
                    _bar('Jarak', kontribusi['jarak']),
                    _bar('Urgensi', kontribusi['urgensi']),
                    const SizedBox(height: 6),
                    Text(
                      'Radius layanan ${_data!['radius_layanan_km'] ?? '-'} km • '
                      'Batas skor ${_data!['batas_skor'] ?? '-'}',
                      style: const TextStyle(
                          fontSize: 12, color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ),
            if (canOtp)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: FilledButton.icon(
                  onPressed: () async {
                    final done = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(
                          builder: (_) => OtpPage(
                                id: widget.id,
                                namaSampah:
                                    '${alo['nama_sampah'] ?? '-'}',
                                namaPenerima:
                                    '${tps['nama_penerima'] ?? '-'}',
                              )),
                    );
                    if (done == true) _load();
                  },
                  icon: const Icon(Icons.pin),
                  label: const Text('Verifikasi OTP Serah Terima'),
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(46)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Marker _marker(LatLng p, IconData icon, Color color) {
    return Marker(
      point: p,
      width: 38,
      height: 38,
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _stat(IconData icon, String text) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 15, color: Colors.white70),
      const SizedBox(width: 5),
      Text(text,
          style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600)),
    ]);
  }

  Widget _sectionTitle(IconData icon, String text) {
    return Row(children: [
      Icon(icon, size: 17, color: kEcoGreen),
      const SizedBox(width: 7),
      Text(text,
          style: const TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14.5)),
    ]);
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: Colors.black45),
          const SizedBox(width: 6),
          SizedBox(
              width: 130,
              child: Text(label,
                  style: const TextStyle(fontSize: 13, color: Colors.black54))),
          Expanded(
              child:
                  Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }

  Widget _bar(String label, dynamic value) {
    final v = (value is num ? value.toDouble() : 0.0).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
              width: 90,
              child: Text(label,
                  style: const TextStyle(fontSize: 12.5))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: v,
                minHeight: 8,
                backgroundColor: const Color(0xFFE3EAE6),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
              width: 44,
              child: Text('${(v * 100).toStringAsFixed(1)}%',
                  style: const TextStyle(fontSize: 12),
                  textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.icon, required this.message});
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration:
                  const BoxDecoration(color: kEcoMint, shape: BoxShape.circle),
              child: Icon(icon, size: 44, color: kEcoGreen),
            ),
            const SizedBox(height: 16),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54, height: 1.5)),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration:
                  const BoxDecoration(color: kEcoMint, shape: BoxShape.circle),
              child: const Icon(Icons.cloud_off, size: 40, color: kEcoGreen),
            ),
            const SizedBox(height: 14),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54, height: 1.5)),
            const SizedBox(height: 14),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Coba lagi')),
          ],
        ),
      ),
    );
  }
}
