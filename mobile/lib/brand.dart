import 'package:flutter/material.dart';

const kEcoGreen = Color(0xFF0F6F4F);
const kEcoGreenDark = Color(0xFF0A5239);
const kEcoLime = Color(0xFF7CB342);
const kEcoMint = Color(0xFFE3F2EA);
const kEcoBg = Color(0xFFF2F6F3);

const kEcoGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF0A5239), Color(0xFF0F6F4F), Color(0xFF2E9E6B)],
);

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  final first = parts.first[0].toUpperCase();
  if (parts.length > 1 && parts.last.isNotEmpty && parts.last != parts.first) {
    return '$first${parts.last[0].toUpperCase()}';
  }
  return first;
}

Widget ecoLogo({double size = 56, double iconSize = 30}) {
  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      gradient: kEcoGradient,
      shape: BoxShape.circle,
      boxShadow: [
        BoxShadow(
          color: kEcoGreen.withValues(alpha: 0.35),
          blurRadius: 14,
          offset: const Offset(0, 6),
        ),
      ],
    ),
    child: Icon(Icons.recycling, color: Colors.white, size: iconSize),
  );
}
