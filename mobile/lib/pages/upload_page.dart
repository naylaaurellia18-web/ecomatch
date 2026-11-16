import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../brand.dart';

class UploadPage extends StatefulWidget {
  const UploadPage({super.key});

  @override
  State<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends State<UploadPage>
    with AutomaticKeepAliveClientMixin {
  final _form = GlobalKey<FormState>();
  final _nama = TextEditingController();
  final _berat = TextEditingController();
  String _jenis = 'campuran';
  String _kelayakan = 'layak';
  bool _userPilihKelayakan = false;
  String? _saranText;
  DateTime _waktu = DateTime.now();
  XFile? _foto;
  bool _busy = false;
  final _picker = ImagePicker();

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _nama.dispose();
    _berat.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final f = await _picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (f != null) setState(() => _foto = f);
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_foto == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Foto kondisi sampah wajib dipilih')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final data = await Api.request(
        '/api/waste',
        method: 'POST',
        body: {
          'nama_sampah': _nama.text.trim(),
          'jenis_makanan': _jenis,
          'berat_kg': _berat.text.trim(),
          'waktu_produksi': _waktu.toUtc().toIso8601String(),
          'kelayakan': _kelayakan,
        },
        files: {'foto': _foto!.path},
      );
      if (!mounted) return;
      final klas = (data['klasifikasi'] as Map?)?.cast<String, dynamic>();
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Sampah dicatat'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${data['message'] ?? 'Berhasil'}'),
              if (klas != null) ...[
                const SizedBox(height: 10),
                Text('Klasifikasi otomatis (FR-11):',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Theme.of(ctx).colorScheme.primary)),
                const SizedBox(height: 4),
                Text('Kategori: ${klas['kategori'] ?? '-'}'),
                Text('Tingkat pembusukan: ${klas['tingkat_pembusukan'] ?? '-'}'),
                if (klas['skor_keyakinan'] != null)
                  Text(
                      'Skor keyakinan: ${(num.parse('${klas['skor_keyakinan']}') * 100).toStringAsFixed(0)}%'),
              ],
            ],
          ),
          actions: [
            FilledButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
          ],
        ),
      );
      _form.currentState!.reset();
      setState(() {
        _nama.clear();
        _berat.clear();
        _foto = null;
        _waktu = DateTime.now();
        _jenis = 'campuran';
        _kelayakan = 'layak';
        _userPilihKelayakan = false;
        _saranText = null;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Gagal: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickWaktu() async {
    final d = await showDatePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: DateTime.now(),
      initialDate: _waktu,
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_waktu),
    );
    if (t == null) return;
    setState(() => _waktu =
        DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  Future<void> _mintaSaran() async {
    if (_nama.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Isi nama sampah dulu untuk minta saran AI')),
      );
      return;
    }
    try {
      final r = await Api.request(
        '/api/classify',
        method: 'POST',
        body: {
          'nama_sampah': _nama.text.trim(),
          'jenis_makanan': _jenis,
          'waktu_produksi': _waktu.toUtc().toIso8601String(),
        },
      );
      final saran = r is Map ? r['saran_layak'] : null;
      if (!mounted) return;
      if (saran != 'layak' && saran != 'tidak_layak') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saran AI belum tersedia untuk data ini')),
        );
        return;
      }
      setState(() {
        _saranText =
            'Saran AI: ${saran == 'layak' ? 'Layak dikonsumsi' : 'Tidak layak'}'
            ' (tingkat: ${r['tingkat_pembusukan'] ?? '-'}) — boleh dikoreksi.';
        if (!_userPilihKelayakan) _kelayakan = saran as String;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Unggah Sampah Makanan',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text(
              'Foto wajib — sistem mengklasifikasi otomatis (FR-02, FR-11).',
              style: TextStyle(fontSize: 12.5, color: Colors.black54),
            ),
            const SizedBox(height: 14),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => showModalBottomSheet(
                context: context,
                builder: (ctx) => SafeArea(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    ListTile(
                      leading: const Icon(Icons.photo_camera),
                      title: const Text('Ambil foto'),
                      onTap: () {
                        Navigator.pop(ctx);
                        _pick(ImageSource.camera);
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.photo_library),
                      title: const Text('Pilih dari galeri'),
                      onTap: () {
                        Navigator.pop(ctx);
                        _pick(ImageSource.gallery);
                      },
                    ),
                  ]),
                ),
              ),
              child: Container(
                height: 170,
                decoration: BoxDecoration(
                  color: _foto == null ? kEcoMint : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: _foto == null ? kEcoGreen : const Color(0xFFC8D5CE),
                      width: _foto == null ? 1.5 : 1),
                ),
                child: _foto == null
                    ? const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.add_a_photo_outlined,
                                size: 42, color: kEcoGreen),
                            SizedBox(height: 8),
                            Text('Ketuk untuk ambil foto sampah',
                                style: TextStyle(
                                    color: kEcoGreenDark,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      )
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.file(File(_foto!.path),
                            fit: BoxFit.cover, width: double.infinity),
                      ),
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _nama,
              decoration: const InputDecoration(
                  labelText: 'Nama / isi sampah *',
                  hintText: 'mis. Nasi sisa + sayur bayam'),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Nama sampah wajib diisi'
                  : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _jenis,
              decoration: const InputDecoration(labelText: 'Jenis makanan'),
              items: const [
                DropdownMenuItem(value: 'nasi', child: Text('Nasi')),
                DropdownMenuItem(value: 'sayur', child: Text('Sayur')),
                DropdownMenuItem(value: 'lauk', child: Text('Lauk')),
                DropdownMenuItem(value: 'buah', child: Text('Buah')),
                DropdownMenuItem(
                    value: 'campuran', child: Text('Campuran')),
                DropdownMenuItem(value: 'lainnya', child: Text('Lainnya')),
              ],
              onChanged: (v) => setState(() => _jenis = v ?? 'campuran'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _berat,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                  labelText: 'Berat (kg) *', hintText: 'mis. 12.5'),
              validator: (v) {
                final n = double.tryParse(v ?? '');
                if (n == null || n <= 0) return 'Berat tidak valid';
                return null;
              },
            ),
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: _pickWaktu,
              child: InputDecorator(
                decoration: const InputDecoration(
                    labelText: 'Waktu produksi *',
                    suffixIcon: Icon(Icons.schedule)),
                child: Text(formatWaktu(_waktu.toIso8601String())),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Text('Kelayakan konsumsi *',
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurface)),
                const Spacer(),
                TextButton.icon(
                  onPressed: _mintaSaran,
                  icon: const Icon(Icons.auto_awesome, size: 16),
                  label: const Text('Saran AI', style: TextStyle(fontSize: 13)),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('Layak (panti/yayasan)',
                        style: TextStyle(fontSize: 12.5)),
                    selected: _kelayakan == 'layak',
                    onSelected: (_) => setState(() {
                      _kelayakan = 'layak';
                      _userPilihKelayakan = true;
                    }),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ChoiceChip(
                    label: const Text('Tidak layak (peternakan)',
                        style: TextStyle(fontSize: 12.5)),
                    selected: _kelayakan == 'tidak_layak',
                    onSelected: (_) => setState(() {
                      _kelayakan = 'tidak_layak';
                      _userPilihKelayakan = true;
                    }),
                  ),
                ),
              ],
            ),
            if (_saranText != null) ...[
              const SizedBox(height: 6),
              Text(_saranText!,
                  style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _busy ? null : _submit,
              icon: const Icon(Icons.cloud_upload),
              label: const Text('Unggah & Klasifikasi'),
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(46)),
            ),
            if (_busy) ...[
              const SizedBox(height: 12),
              const Center(child: CircularProgressIndicator()),
            ],
          ],
        ),
      ),
    );
  }
}
