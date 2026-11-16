import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';

class OtpPage extends StatefulWidget {
  const OtpPage(
      {super.key, required this.id, required this.namaSampah, required this.namaPenerima});
  final dynamic id;
  final String namaSampah;
  final String namaPenerima;

  @override
  State<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends State<OtpPage> {
  final _otp = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _status;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  @override
  void dispose() {
    _otp.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    try {
      final data = await Api.get('/api/deliveries/${widget.id}/otp-status');
      if (mounted) setState(() => _status = data as Map<String, dynamic>);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final code = _otp.text.trim();
    if (code.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('OTP harus 6 digit')),
      );
      return;
    }
    await _run(() async {
      final data =
          await Api.post('/api/deliveries/${widget.id}/verify-otp', {'otp': code});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${data['message'] ?? 'Terverifikasi'}')),
      );
      Navigator.of(context).pop(true);
    });
  }

  Future<void> _resend() async {
    await _run(() async {
      final data = await Api.post('/api/deliveries/${widget.id}/resend-otp');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${data['message'] ?? 'OTP baru dikirim'}')),
      );
      await _loadStatus();
    });
  }

  @override
  Widget build(BuildContext context) {
    final kode = _status?['kode'] as String?;
    final digunakan = _status?['digunakan_pada'] != null;
    final kedaluwarsa = _status?['kedaluwarsa_pada'] as String?;

    return Scaffold(
      appBar: AppBar(title: const Text('Verifikasi OTP')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.namaSampah,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('Tujuan: ${widget.namaPenerima}',
                      style: const TextStyle(fontSize: 13)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (kode != null && !digunakan)
            Card(
              color: const Color(0xFFFFF8E1),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    const Text('OTP demo (tampil untuk pengujian):',
                        style: TextStyle(fontSize: 12.5)),
                    const SizedBox(height: 6),
                    Text(kode,
                        style: const TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 8)),
                    if (kedaluwarsa != null) ...[
                      const SizedBox(height: 4),
                      Text('Berlaku s.d. ${formatWaktu(kedaluwarsa)}',
                          style: const TextStyle(
                              fontSize: 12, color: Colors.black54)),
                    ],
                  ],
                ),
              ),
            ),
          if (digunakan)
            const Card(
              color: Color(0xFFE8F5E9),
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Row(children: [
                  Icon(Icons.check_circle, color: Color(0xFF2E7D32)),
                  SizedBox(width: 8),
                  Expanded(child: Text('OTP sudah dipakai — transaksi terverifikasi.')),
                ]),
              ),
            ),
          const SizedBox(height: 16),
          TextField(
            controller: _otp,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: const TextStyle(fontSize: 26, letterSpacing: 10),
            decoration: const InputDecoration(
              labelText: 'Masukkan 6 digit OTP',
              counterText: '',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _verify,
            style:
                FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Verifikasi Serah Terima'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : _resend,
            icon: const Icon(Icons.refresh),
            label: const Text('Kirim Ulang OTP'),
            style:
                OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.red, fontSize: 12.5)),
            ),
        ],
      ),
    );
  }
}
