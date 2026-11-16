import 'package:flutter/material.dart';

import 'api.dart';
import 'brand.dart';
import 'pages/home_page.dart';
import 'pages/login_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.init();
  runApp(const EcoMatchApp());
}

class EcoMatchApp extends StatelessWidget {
  const EcoMatchApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: kEcoGreen)
        .copyWith(primary: kEcoGreen, secondary: kEcoLime);
    return MaterialApp(
      title: 'EcoMatch',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        scaffoldBackgroundColor: kEcoBg,
        appBarTheme: const AppBarTheme(
          backgroundColor: kEcoGreen,
          foregroundColor: Colors.white,
          elevation: 0,
          titleTextStyle: TextStyle(
              fontSize: 17, fontWeight: FontWeight.w700, color: Colors.white),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFC8D5CE)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFC8D5CE)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: kEcoGreen, width: 1.6),
          ),
          labelStyle: const TextStyle(color: Colors.black54),
        ),
        cardTheme: CardThemeData(
          elevation: 2,
          color: Colors.white,
          margin: EdgeInsets.zero,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          shadowColor: kEcoGreen.withValues(alpha: 0.12),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kEcoGreen,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            textStyle:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: kEcoGreen,
            minimumSize: const Size.fromHeight(48),
            side: const BorderSide(color: kEcoGreen),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            textStyle:
                const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: kEcoGreen),
        ),
        segmentedButtonTheme: SegmentedButtonThemeData(
          style: ButtonStyle(
            backgroundColor: WidgetStateProperty.resolveWith((s) =>
                s.contains(WidgetState.selected)
                    ? kEcoGreen
                    : Colors.white),
            foregroundColor: WidgetStateProperty.resolveWith((s) =>
                s.contains(WidgetState.selected)
                    ? Colors.white
                    : Colors.black87),
            side: WidgetStateProperty.all(
                const BorderSide(color: Color(0xFFC8D5CE))),
            textStyle: WidgetStateProperty.all(
                const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: kEcoGreenDark,
          contentTextStyle: TextStyle(color: Colors.white),
        ),
        dialogTheme: DialogThemeData(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Colors.white,
          selectedItemColor: kEcoGreen,
          unselectedItemColor: Color(0xFF9AA8A1),
          type: BottomNavigationBarType.fixed,
          elevation: 12,
          selectedLabelStyle:
              TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
        ),
        dividerTheme: const DividerThemeData(color: Color(0xFFE3EAE6)),
        chipTheme: ChipThemeData(
          backgroundColor: kEcoMint,
          side: BorderSide.none,
          labelStyle: const TextStyle(
              fontSize: 12, color: kEcoGreenDark, fontWeight: FontWeight.w600),
        ),
      ),
      home: Api.isLoggedIn ? const HomePage() : const LoginPage(),
    );
  }
}
