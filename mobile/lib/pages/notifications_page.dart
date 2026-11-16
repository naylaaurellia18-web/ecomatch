import 'package:flutter/material.dart';

import '../api.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage>
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
      final data = await Api.get('/api/notifications');
      if (!mounted) return;
      setState(() => _rows = data as List);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _read(Map<String, dynamic> row) async {
    if (row['dibaca_pada'] != null) return;
    try {
      await Api.post('/api/notifications/${row['id_notifikasi']}/read');
      setState(() => row['dibaca_pada'] = DateTime.now().toIso8601String());
    } catch (_) {}
  }

  Future<void> _readAll() async {
    try {
      await Api.post('/api/notifications/read-all');
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
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
              FilledButton.tonal(
                  onPressed: _load, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    if (_rows == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final unread = _rows!
        .where((r) => (r as Map)['dibaca_pada'] == null)
        .length;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: _load,
        child: _rows!.isEmpty
            ? ListView(children: const [
                SizedBox(height: 200),
                Center(
                  child: Text('Belum ada notifikasi.',
                      style: TextStyle(color: Colors.black54)),
                ),
              ])
            : ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: _rows!.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 6),
                itemBuilder: (ctx, i) {
                  if (i == 0) {
                    return Row(
                      children: [
                        Text('$unread notifikasi belum dibaca',
                            style: const TextStyle(
                                fontSize: 12.5, color: Colors.black54)),
                        const Spacer(),
                        if (unread > 0)
                          TextButton(
                            onPressed: _readAll,
                            child: const Text('Tandai semua'),
                          ),
                      ],
                    );
                  }
                  final r = _rows![i - 1] as Map<String, dynamic>;
                  final dibaca = r['dibaca_pada'] != null;
                  return Card(
                    color: dibaca ? Colors.white : const Color(0xFFEAF5F0),
                    child: ListTile(
                      dense: true,
                      leading: Icon(
                        dibaca ? Icons.notifications_none : Icons.notifications,
                        color: dibaca
                            ? Colors.black38
                            : Theme.of(context).colorScheme.primary,
                      ),
                      title: Text('${r['judul'] ?? '-'}',
                          style: TextStyle(
                              fontWeight:
                                  dibaca ? FontWeight.w500 : FontWeight.w700,
                              fontSize: 14)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${r['isi'] ?? ''}',
                              style: const TextStyle(fontSize: 12.5)),
                          const SizedBox(height: 3),
                          Text(formatWaktu(r['created_at'] as String?),
                              style: const TextStyle(
                                  fontSize: 11, color: Colors.black45)),
                        ],
                      ),
                      onTap: () => _read(r),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
