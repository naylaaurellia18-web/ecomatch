import 'dart:convert';

import 'package:flutter/material.dart';

import 'api.dart';

Widget fotoView(String? url, {double size = 56, BorderRadius? radius}) {
  final placeholder = Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: const Color(0xFFE3EAE6),
      borderRadius: radius ?? BorderRadius.circular(8),
    ),
    child: const Icon(Icons.image_outlined, color: Colors.black26),
  );
  if (url == null || url.isEmpty) return placeholder;

  ImageProvider provider;
  if (url.startsWith('http')) {
    provider = NetworkImage(url);
  } else if (url.startsWith('data:')) {
    try {
      provider = MemoryImage(base64Decode(url.split(',').last));
    } catch (_) {
      return placeholder;
    }
  } else {
    provider = NetworkImage(Api.baseUrl + (url.startsWith('/') ? url : '/$url'));
  }

  return ClipRRect(
    borderRadius: radius ?? BorderRadius.circular(8),
    child: Image(
      image: provider,
      width: size,
      height: size,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => placeholder,
    ),
  );
}
