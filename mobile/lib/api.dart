import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

class Api {
  static const _kBase = 'api_base';
  static const _kToken = 'api_token';
  static const _kUser = 'api_user';
  static const defaultBase = 'https://ecomatch-pi.vercel.app';

  static late String baseUrl;
  static String? token;
  static Map<String, dynamic>? user;

  static bool get isLoggedIn => token != null && user != null;
  static String get role => (user?['role'] ?? '') as String;
  static String get nama => (user?['nama'] ?? '') as String;
  static String get status => (user?['status'] ?? '') as String;

  static Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    baseUrl = (p.getString(_kBase) ?? defaultBase).replaceAll(RegExp(r'/+$'), '');
    token = p.getString(_kToken);
    final raw = p.getString(_kUser);
    user = raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  static Future<void> setBaseUrl(String v) async {
    final p = await SharedPreferences.getInstance();
    baseUrl = v.trim().replaceAll(RegExp(r'/+$'), '');
    await p.setString(_kBase, baseUrl);
  }

  static Future<void> saveSession(String t, Map<String, dynamic> u) async {
    final p = await SharedPreferences.getInstance();
    token = t;
    user = u;
    await p.setString(_kToken, t);
    await p.setString(_kUser, jsonEncode(u));
  }

  static Future<void> clearSession() async {
    final p = await SharedPreferences.getInstance();
    token = null;
    user = null;
    await p.remove(_kToken);
    await p.remove(_kUser);
  }

  static Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String>? files,
  }) async {
    final uri = Uri.parse(baseUrl + path);
    final headers = <String, String>{};
    if (token != null) headers['Authorization'] = 'Bearer $token';

    http.Response res;
    if (files != null) {
      final req = http.MultipartRequest(method, uri)..headers.addAll(headers);
      body?.forEach((k, v) => req.fields[k] = '$v');
      for (final e in files.entries) {
        req.files.add(await http.MultipartFile.fromPath(e.key, e.value));
      }
      final streamed = await req.send().timeout(const Duration(seconds: 30));
      res = await http.Response.fromStream(streamed);
    } else {
      if (body != null) headers['Content-Type'] = 'application/json';
      final req = http.Request(method, uri)
        ..headers.addAll(headers)
        ..bodyBytes = utf8.encode(body == null ? '' : jsonEncode(body));
      final streamed = await req.send().timeout(const Duration(seconds: 30));
      res = await http.Response.fromStream(streamed);
    }

    dynamic data;
    if (res.body.isNotEmpty) {
      try {
        data = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        data = null;
      }
    }
    if (res.statusCode == 401 && token != null) await clearSession();
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null
          ? '${data['error']}'
          : 'HTTP ${res.statusCode}';
      throw ApiException(res.statusCode, msg);
    }
    return data;
  }

  static Future<dynamic> get(String path) => request(path);

  static Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      request(path, method: 'POST', body: body ?? {});

  static Future<dynamic> patch(String path, [Map<String, dynamic>? body]) =>
      request(path, method: 'PATCH', body: body ?? {});
}

String formatWaktu(String? iso) {
  if (iso == null || iso.isEmpty) return '-';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  const bulan = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  final jam = d.hour.toString().padLeft(2, '0');
  final menit = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${bulan[d.month - 1]} ${d.year}, $jam:$menit';
}
