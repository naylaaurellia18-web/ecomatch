import 'package:flutter/material.dart';

import '../api.dart';
import '../brand.dart';
import 'home_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _modeLogin = true;
  bool _busy = false;
  bool _obscure = true;

  final _loginForm = GlobalKey<FormState>();
  final _registerForm = GlobalKey<FormState>();

  final _email = TextEditingController();
  final _password = TextEditingController();

  final _nama = TextEditingController();
  final _telepon = TextEditingController();
  final _alamat = TextEditingController();
  String _role = 'donor_mbg';

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _nama.dispose();
    _telepon.dispose();
    _alamat.dispose();
    super.dispose();
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal terhubung ke server ($e)')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _login() async {
    if (!_loginForm.currentState!.validate()) return;
    await _run(() async {
      final data = await Api.post('/api/auth/login', {
        'email': _email.text.trim(),
        'password': _password.text,
      });
      final user = (data['user'] as Map).cast<String, dynamic>();
      if (user['status'] != 'aktif') {
        throw ApiException(403,
            'Akun berstatus "${user['status']}" — menunggu verifikasi admin');
      }
      await Api.saveSession(data['token'] as String, user);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
    });
  }

  Future<void> _register() async {
    if (!_registerForm.currentState!.validate()) return;
    await _run(() async {
      final data = await Api.post('/api/auth/register', {
        'nama': _nama.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'role': _role,
        'telepon': _telepon.text.trim(),
        'alamat': _alamat.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${data['message'] ?? 'Registrasi berhasil'}')),
      );
      setState(() => _modeLogin = true);
    });
  }

  Future<void> _editServer() async {
    final ctrl = TextEditingController(text: Api.baseUrl);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alamat Server API'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            hintText: 'https://ecomatch-pi.vercel.app  atau  http://192.168.1.5:3000',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Simpan')),
        ],
      ),
    );
    if (ok == true) {
      await Api.setBaseUrl(ctrl.text);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Server: ${Api.baseUrl}')));
      }
    }
    ctrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kEcoBg,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            decoration: const BoxDecoration(gradient: kEcoGradient),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 34),
                child: Column(
                  children: [
                    ecoLogo(size: 76, iconSize: 40),
                    const SizedBox(height: 12),
                    const Text(
                      'EcoMatch',
                      style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'AI Routing Sisa Makanan MBG ke Penerima',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: true, label: Text('Masuk')),
                        ButtonSegment(value: false, label: Text('Daftar')),
                      ],
                      selected: {_modeLogin},
                      onSelectionChanged: (s) =>
                          setState(() => _modeLogin = s.first),
                    ),
                    const SizedBox(height: 18),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 220),
                          child: _modeLogin
                              ? _buildLoginForm()
                              : _buildRegisterForm(),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: TextButton.icon(
                        onPressed: _editServer,
                        icon: const Icon(Icons.dns, size: 16),
                        label: Text(
                          'Server: ${Api.baseUrl}',
                          style: const TextStyle(fontSize: 12.5),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoginForm() {
    return Form(
      key: _loginForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Selamat datang kembali',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.mail_outline),
            ),
            validator: (v) =>
                (v == null || !v.contains('@')) ? 'Email tidak valid' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            decoration: InputDecoration(
              labelText: 'Kata sandi',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) =>
                (v == null || v.length < 6) ? 'Minimal 6 karakter' : null,
            onFieldSubmitted: (_) => _login(),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _busy ? null : _login,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Masuk'),
          ),
        ],
      ),
    );
  }

  Widget _buildRegisterForm() {
    return Form(
      key: _registerForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Buat akun baru',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          TextFormField(
            controller: _nama,
            decoration: const InputDecoration(
              labelText: 'Nama lengkap',
              prefixIcon: Icon(Icons.person_outline),
            ),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Nama wajib diisi' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.mail_outline),
            ),
            validator: (v) =>
                (v == null || !v.contains('@')) ? 'Email tidak valid' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Kata sandi',
              prefixIcon: Icon(Icons.lock_outline),
            ),
            validator: (v) =>
                (v == null || v.length < 6) ? 'Minimal 6 karakter' : null,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _role,
            decoration: const InputDecoration(
              labelText: 'Peran',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
            items: const [
              DropdownMenuItem(
                  value: 'donor_mbg', child: Text('Donor MBG (SPPG)')),
              DropdownMenuItem(
                  value: 'penerima', child: Text('Penerima')),
              DropdownMenuItem(value: 'kurir', child: Text('Kurir / Relawan')),
            ],
            onChanged: (v) => setState(() => _role = v ?? 'donor_mbg'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _telepon,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Telepon (opsional)',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _alamat,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Alamat (opsional)',
              prefixIcon: Icon(Icons.home_outlined),
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _busy ? null : _register,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Daftar'),
          ),
        ],
      ),
    );
  }
}
