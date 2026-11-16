import 'package:flutter/material.dart';

import '../api.dart';
import '../foto.dart';
import 'alokasi_page.dart' show statusColor;

class WastePage extends StatefulWidget {
  const WastePage({super.key});

  @override
  State<WastePage> createState() => _WastePageState();
}

class _WastePageState extends State<WastePage>
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
      final path =
          Api.role == 'donor_mbg' ? '/api/waste/mine' : '/api/waste';
      final data = await Api.get(path);
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
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    if (_rows == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_rows!.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text('Belum ada data sisa makanan.',
              style: TextStyle(color: Colors.black54)),
        ),
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
          final status = '${r['status'] ?? '-'}';
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  fotoView(r['foto_url'] as String?),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text('${r['nama_sampah'] ?? '-'}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14.5)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color:
                                    statusColor(status).withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                                border:
                                    Border.all(color: statusColor(status)),
                              ),
                              child: Text(status,
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: statusColor(status),
                                      fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${r['jenis_makanan'] ?? '-'} • ${r['berat_kg'] ?? '-'} kg • ${formatWaktu(r['created_at'] as String?)}',
                          style: const TextStyle(
                              fontSize: 12.5, color: Colors.black54),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            if (r['kategori'] != null)
                              _tag(Icons.category, '${r['kategori']}'),
                            if (r['tingkat_pembusukan'] != null)
                              _tag(Icons.thermostat,
                                  '${r['tingkat_pembusukan']}'),
                            if (r['skor_keyakinan'] != null)
                              _tag(Icons.insights,
                                  'yakin ${(num.parse('${r['skor_keyakinan']}') * 100).toStringAsFixed(0)}%'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _tag(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFFE3EAE6),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: Colors.black54),
        const SizedBox(width: 3),
        Text(text, style: const TextStyle(fontSize: 11.5)),
      ]),
    );
  }
}
