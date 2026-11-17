import 'package:flutter/material.dart';

import '../api.dart';
import '../brand.dart';
import 'alokasi_page.dart';
import 'login_page.dart';
import 'notifications_page.dart';
import 'upload_page.dart';
import 'waste_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _index = 0;
  int _genAlokasi = 0;
  int _genMakanan = 0;

  List<Widget> get _pages {
    switch (Api.role) {
      case 'donor_mbg':
        return [
          AlokasiPage(key: ValueKey('alokasi-$_genAlokasi')),
          WastePage(key: ValueKey('makanan-$_genMakanan')),
          const UploadPage(),
          const NotificationsPage(),
        ];
      case 'penerima':
      case 'kurir':
        return [
          AlokasiPage(key: ValueKey('alokasi-$_genAlokasi')),
          const NotificationsPage(),
        ];
      default:
        return [
          AlokasiPage(key: ValueKey('alokasi-$_genAlokasi')),
          WastePage(key: ValueKey('makanan-$_genMakanan')),
          const NotificationsPage(),
        ];
    }
  }

  List<BottomNavigationBarItem> get _items {
    switch (Api.role) {
      case 'donor_mbg':
        return const [
          BottomNavigationBarItem(
              icon: Icon(Icons.alt_route), label: 'Alokasi'),
          BottomNavigationBarItem(
              icon: Icon(Icons.delete_outline), label: 'Makanan'),
          BottomNavigationBarItem(
              icon: Icon(Icons.add_a_photo), label: 'Unggah'),
          BottomNavigationBarItem(
              icon: Icon(Icons.notifications), label: 'Notifikasi'),
        ];
      case 'penerima':
      case 'kurir':
        return const [
          BottomNavigationBarItem(
              icon: Icon(Icons.alt_route), label: 'Alokasi'),
          BottomNavigationBarItem(
              icon: Icon(Icons.notifications), label: 'Notifikasi'),
        ];
      default:
        return const [
          BottomNavigationBarItem(
              icon: Icon(Icons.alt_route), label: 'Alokasi'),
          BottomNavigationBarItem(
              icon: Icon(Icons.delete_outline), label: 'Makanan'),
          BottomNavigationBarItem(
              icon: Icon(Icons.notifications), label: 'Notifikasi'),
        ];
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar?'),
        content: const Text('Sesi Anda akan dihapus dari perangkat ini.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Keluar')),
        ],
      ),
    );
    if (ok != true) return;
    await Api.clearSession();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (r) => false,
    );
  }

  String get _roleLabel {
    switch (Api.role) {
      case 'donor_mbg':
        return 'Donor MBG';
      case 'penerima':
        return 'Penerima';
      case 'kurir':
        return 'Kurir';
      default:
        return 'Administrator';
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages;
    final items = _items;
    if (_index >= pages.length) _index = 0;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 68,
        flexibleSpace: Container(decoration: const BoxDecoration(gradient: kEcoGradient)),
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
              alignment: Alignment.center,
              child: Text(
                initialsOf(Api.nama),
                style: const TextStyle(
                    color: kEcoGreen,
                    fontWeight: FontWeight.w800,
                    fontSize: 15),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    Api.nama,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: Colors.white),
                  ),
                  const SizedBox(height: 1),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _roleLabel,
                      style: const TextStyle(
                          fontSize: 11,
                          color: Colors.white,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 14),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white54),
            ),
            child: IconButton(
              onPressed: _logout,
              icon: const Icon(Icons.logout, size: 20, color: Colors.white),
              tooltip: 'Keluar',
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) {
          setState(() {
            if (i != _index) {
              if (pages[i] is AlokasiPage) _genAlokasi++;
              if (pages[i] is WastePage) _genMakanan++;
            }
            _index = i;
          });
        },
        items: items,
      ),
    );
  }
}
