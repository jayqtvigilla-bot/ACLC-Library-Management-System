import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_core/firebase_core.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (error) {
    debugPrint('Firebase initialization failed: $error');
  }
  await Api.restoreStoredSession();
  try {
    final saved = await _appUpdateChannel.invokeMethod<String>('getThemeMode');
    appThemeMode.value = saved == 'dark' ? ThemeMode.dark : ThemeMode.light;
  } on PlatformException catch (_) {
    // Keep the light theme if the native preference is unavailable.
  } on MissingPluginException catch (_) {
    // Non-Android platforms use the default light theme.
  }
  runApp(const ACLCLibraryApp());
}

final ValueNotifier<ThemeMode> appThemeMode = ValueNotifier(ThemeMode.light);

class ACLCColors {
  static const navy = Color(0xFF123B56);
  static const teal = Color(0xFF13758A);
  static const gold = Color(0xFFF5A000);
  static const canvas = Color(0xFFF4F7FA);
  static const ink = Color(0xFF172B3A);
  static const muted = Color(0xFF647987);
}

class ACLCLibraryApp extends StatelessWidget {
  const ACLCLibraryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: appThemeMode,
      builder: (context, mode, _) => MaterialApp(
        title: 'ACLC Smart Library',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: ACLCColors.teal,
            primary: ACLCColors.teal,
            secondary: ACLCColors.gold,
            surface: Colors.white,
            brightness: Brightness.light,
          ),
          scaffoldBackgroundColor: ACLCColors.canvas,
          appBarTheme: const AppBarTheme(
            backgroundColor: ACLCColors.canvas,
            foregroundColor: ACLCColors.navy,
            centerTitle: false,
            elevation: 0,
            scrolledUnderElevation: 0,
          ),
          cardTheme: CardThemeData(
            color: Colors.white,
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(20)),
              side: BorderSide(color: Color(0xFFE5EDF2)),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 16,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFD8E3E9)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFD8E3E9)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: ACLCColors.teal, width: 1.7),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              backgroundColor: ACLCColors.navy,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          navigationBarTheme: NavigationBarThemeData(
            height: 70,
            backgroundColor: Colors.white,
            indicatorColor: const Color(0xFFE2F2F3),
            labelTextStyle: WidgetStateProperty.resolveWith(
              (states) => TextStyle(
                fontSize: 11,
                fontWeight: states.contains(WidgetState.selected)
                    ? FontWeight.w800
                    : FontWeight.w600,
                color: states.contains(WidgetState.selected)
                    ? ACLCColors.teal
                    : ACLCColors.muted,
              ),
            ),
          ),
          useMaterial3: true,
        ),
        darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: ACLCColors.teal,
            primary: const Color(0xFF61C3D0),
            secondary: ACLCColors.gold,
            surface: const Color(0xFF172A36),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF0E1C26),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFF0E1C26),
            foregroundColor: Color(0xFFF2F7FA),
            centerTitle: false,
            elevation: 0,
            scrolledUnderElevation: 0,
          ),
          cardTheme: CardThemeData(
            color: const Color(0xFF172A36),
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(20)),
              side: BorderSide(color: Color(0xFF2A414F)),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFF1B303D),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 16,
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFF35505E)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: Color(0xFF61C3D0),
                width: 1.7,
              ),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              backgroundColor: ACLCColors.teal,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          navigationBarTheme: NavigationBarThemeData(
            height: 70,
            backgroundColor: const Color(0xFF111F29),
            indicatorColor: const Color(0xFF21424D),
            labelTextStyle: WidgetStateProperty.resolveWith(
              (states) => TextStyle(
                fontSize: 11,
                fontWeight: states.contains(WidgetState.selected)
                    ? FontWeight.w800
                    : FontWeight.w600,
                color: states.contains(WidgetState.selected)
                    ? const Color(0xFF88D6DF)
                    : const Color(0xFFAEC0CA),
              ),
            ),
          ),
          useMaterial3: true,
        ),
        themeMode: mode,
        home: const StartupReveal(child: SessionRouter()),
      ),
    );
  }
}

class SessionRouter extends StatefulWidget {
  const SessionRouter({super.key});

  @override
  State<SessionRouter> createState() => _SessionRouterState();
}

class _SessionRouterState extends State<SessionRouter> {
  Widget? _destination;
  String _connectionError = '';

  @override
  void initState() {
    super.initState();
    Api.sessionExpired.addListener(_handleExpiredSession);
    _restore();
  }

  @override
  void dispose() {
    Api.sessionExpired.removeListener(_handleExpiredSession);
    super.dispose();
  }

  void _handleExpiredSession() {
    if (!Api.sessionExpired.value || !mounted) return;
    Api.sessionExpired.value = false;
    unawaited(Api.clearSession());
    setState(() {
      _destination = const AuthScreen();
      _connectionError = 'Your sign-in expired. Sign in again to continue.';
    });
  }

  Future<void> _restore() async {
    if (mounted) setState(() => _connectionError = '');
    final token = Api.sessionToken;
    if (token == null || token.isEmpty) {
      if (mounted) setState(() => _destination = const AuthScreen());
      return;
    }
    try {
      final response = await Api.get('/me') as Map<String, dynamic>;
      final profile = response['user'];
      if (profile is! Map) {
        throw Exception('Could not load your account profile.');
      }
      final user = Map<String, dynamic>.from(profile);
      Api.setCurrentUser(user);
      final role = user['role'];
      if (!mounted) return;
      setState(() {
        _destination = role == 'student' || role == 'teacher'
            ? const StudentDashboard()
            : role == 'librarian' || role == 'administrator'
            ? const StaffDashboard()
            : const AuthScreen();
        if (_destination is AuthScreen) {
          _connectionError = 'This account cannot access the library portal.';
        }
      });
      if (_destination is AuthScreen) await Api.clearSession();
    } catch (error) {
      if (!mounted) return;
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await Api.clearSession();
        if (mounted) setState(() => _destination = const AuthScreen());
        return;
      }
      setState(() {
        _connectionError = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _signOut() async {
    await Api.clearSession();
    if (mounted) {
      setState(() {
        _destination = const AuthScreen();
        _connectionError = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final destination = _destination;
    if (destination != null) return destination;
    if (_connectionError.isNotEmpty) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.cloud_off_rounded,
                  size: 42,
                  color: ACLCColors.teal,
                ),
                const SizedBox(height: 14),
                const Text(
                  'Your session is saved',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: ACLCColors.navy,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _connectionError,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: ACLCColors.muted),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _restore,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try again'),
                ),
                TextButton(onPressed: _signOut, child: const Text('Sign out')),
              ],
            ),
          ),
        ),
      );
    }
    return const Scaffold(
      body: Center(child: CircularProgressIndicator(color: ACLCColors.teal)),
    );
  }
}

class StartupReveal extends StatefulWidget {
  const StartupReveal({super.key, required this.child});
  final Widget child;
  @override
  State<StartupReveal> createState() => _StartupRevealState();
}

class _StartupRevealState extends State<StartupReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 950),
  )..forward();
  bool showApp = false;
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1450), () {
      if (mounted) setState(() => showApp = true);
    });
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: const Duration(milliseconds: 520),
    switchInCurve: Curves.easeOutCubic,
    switchOutCurve: Curves.easeInCubic,
    transitionBuilder: (child, animation) => FadeTransition(
      opacity: animation,
      child: ScaleTransition(
        scale: Tween<double>(begin: .975, end: 1).animate(animation),
        child: child,
      ),
    ),
    child: showApp
        ? KeyedSubtree(key: const ValueKey('aclc-auth'), child: widget.child)
        : _LibrarySplash(
            key: const ValueKey('aclc-splash'),
            animation: controller,
          ),
  );
}

class _LibrarySplash extends StatelessWidget {
  const _LibrarySplash({super.key, required this.animation});
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    final eased = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
    );
    return Scaffold(
      backgroundColor: ACLCColors.navy,
      body: Center(
        child: FadeTransition(
          opacity: eased,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, .12),
              end: Offset.zero,
            ).animate(eased),
            child: ScaleTransition(
              scale: Tween<double>(begin: .82, end: 1).animate(eased),
              child: Column(
                key: const ValueKey('aclc-splash-content'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 112,
                    height: 112,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: .16),
                          blurRadius: 28,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Image.asset(
                      'assets/aclc-logo.png',
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 26),
                  const Text(
                    'ACLC COLLEGE',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 2.2,
                    ),
                  ),
                  const SizedBox(height: 5),
                  const Text(
                    'Smart Library',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 29,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.4,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'MANDAUE CITY CAMPUS',
                    style: TextStyle(
                      color: Color(0xFFB8D7E0),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.6,
                    ),
                  ),
                  const SizedBox(height: 30),
                  SizedBox(
                    width: 42,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 850),
                      builder: (_, value, _) => ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: value,
                          minHeight: 3,
                          backgroundColor: Colors.white24,
                          color: ACLCColors.gold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class Api {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static final ValueNotifier<bool> sessionExpired = ValueNotifier(false);
  static String? _token;
  static Map<String, dynamic>? _user;

  static Future<void> restoreStoredSession() async {
    try {
      _token = await _secureStorage.read(key: 'aclc_session_token');
    } catch (_) {
      _token = null;
    }
  }

  static Future<void> setSession(
    String token,
    Map<String, dynamic> user,
  ) async {
    await _secureStorage.write(key: 'aclc_session_token', value: token);
    sessionExpired.value = false;
    _token = token;
    _user = user;
  }

  static Future<void> clearSession() async {
    _token = null;
    _user = null;
    try {
      await _secureStorage.delete(key: 'aclc_session_token');
    } catch (_) {
      // Keep the in-memory session cleared even if platform storage is unavailable.
    }
  }

  static Map<String, dynamic>? get user => _user;
  static String? get sessionToken => _token;
  static void setCurrentUser(Map<String, dynamic> user) => _user = user;

  static Future<void> _handleUnauthorized(int statusCode) async {
    if (statusCode != 401 || _token == null) return;
    _token = null;
    _user = null;
    sessionExpired.value = true;
    try {
      await _secureStorage.delete(key: 'aclc_session_token');
    } catch (_) {
      // The in-memory session is already cleared.
    }
  }

  static Future<T> _guard<T>(
    Future<T> Function() request, {
    Duration timeout = const Duration(seconds: 15),
  }) async {
    if (baseUrl.isEmpty) {
      throw Exception(
        'This app build has no library server address. Rebuild it with --dart-define=API_BASE_URL=<server-url>/api.',
      );
    }
    try {
      return await request().timeout(timeout);
    } on SocketException {
      throw Exception(_connectionMessage);
    } on http.ClientException {
      throw Exception(_connectionMessage);
    } on TimeoutException {
      throw Exception(
        'The library service is taking too long to respond. Check the connection and try again. $_connectionHelp',
      );
    }
  }

  static String get _connectionMessage =>
      'The ACLC Library service is not responding. $_connectionHelp';

  static String get _connectionHelp {
    final uri = Uri.tryParse(baseUrl);
    final host = uri?.host.toLowerCase() ?? '';
    if (host == '127.0.0.1' || host == 'localhost') {
      return 'This test build uses a USB connection to the computer. Keep the API running on the computer and reconnect USB port forwarding. To use the app without the computer, the API must be deployed at a public HTTPS address and the app rebuilt with that address.';
    }
    if (host == '10.0.2.2') {
      return 'This address works only in the Android emulator. A physical phone needs a reachable HTTPS API address or a computer LAN address on the same Wi-Fi.';
    }
    final endpoint = uri == null ? 'the configured API address' : uri.origin;
    return 'Check the connection to $endpoint. If this keeps happening, the API host may be offline; its /api/health endpoint should be checked.';
  }

  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    bool auth = true,
  }) async {
    if (auth && (_token == null || _token!.isEmpty)) {
      throw Exception('Your session has expired. Please sign in again.');
    }
    final response = await _guard(
      () => http.post(
        Uri.parse('$baseUrl$path'),
        headers: {
          'Content-Type': 'application/json',
          if (auth && _token != null) 'Authorization': 'Bearer $_token',
        },
        body: jsonEncode(body),
      ),
    );
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      await _handleUnauthorized(response.statusCode);
      throw Exception(data['error'] ?? 'Request failed');
    }
    return data;
  }

  static Future<dynamic> get(String path) async {
    final response = await _guard(
      () => http.get(
        Uri.parse('$baseUrl$path'),
        headers: {if (_token != null) 'Authorization': 'Bearer $_token'},
      ),
    );
    final data = jsonDecode(response.body);
    if (response.statusCode >= 400) {
      await _handleUnauthorized(response.statusCode);
      final message = data is Map ? data['error']?.toString() : null;
      throw ApiException(response.statusCode, message ?? 'Request failed');
    }
    return data;
  }

  static Future<Map<String, dynamic>> put(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _guard(
      () => http.put(
        Uri.parse('$baseUrl$path'),
        headers: {
          'Content-Type': 'application/json',
          if (_token != null) 'Authorization': 'Bearer $_token',
        },
        body: jsonEncode(body),
      ),
    );
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      await _handleUnauthorized(response.statusCode);
      throw Exception(data['error'] ?? 'Request failed');
    }
    return data;
  }

  static Future<Map<String, dynamic>> delete(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final response = await _guard(
      () => http.delete(
        Uri.parse('$baseUrl$path'),
        headers: {
          'Content-Type': 'application/json',
          if (_token != null) 'Authorization': 'Bearer $_token',
        },
        body: body == null ? null : jsonEncode(body),
      ),
    );
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      await _handleUnauthorized(response.statusCode);
      throw Exception(data['error'] ?? 'Request failed');
    }
    return data;
  }
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class AppUpdateCard extends StatefulWidget {
  const AppUpdateCard({super.key});
  @override
  State<AppUpdateCard> createState() => _AppUpdateCardState();
}

class _AppUpdateCardState extends State<AppUpdateCard> {
  bool checking = false;

  Future<void> checkForUpdate() async {
    setState(() => checking = true);
    try {
      await _appUpdateChannel.invokeMethod<bool>('openPlayStore');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Opened Google Play. Install an update there if one is available.',
          ),
        ),
      );
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  void _showError(Object error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
    );
  }

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: const Icon(
        Icons.system_update_alt_rounded,
        color: ACLCColors.teal,
      ),
      title: const Text('App updates'),
      subtitle: const Text(
        'Check Google Play for official ACLC Library updates.',
      ),
      trailing: checking
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : IconButton(
              tooltip: 'Check for updates',
              onPressed: checkForUpdate,
              icon: const Icon(Icons.refresh_rounded),
            ),
    ),
  );
}

class LibrarySettingsPage extends StatefulWidget {
  const LibrarySettingsPage({
    super.key,
    required this.user,
    required this.onProfileUpdated,
    required this.onSignOut,
    this.profileDetails,
    this.additionalAppSettings = const [],
  });
  final Map<String, dynamic> user;
  final Future<void> Function() onProfileUpdated;
  final VoidCallback onSignOut;
  final Widget? profileDetails;
  final List<Widget> additionalAppSettings;

  @override
  State<LibrarySettingsPage> createState() => _LibrarySettingsPageState();
}

class _LibrarySettingsPageState extends State<LibrarySettingsPage> {
  bool savingTheme = false;

  Future<void> _setTheme(bool dark) async {
    final next = dark ? ThemeMode.dark : ThemeMode.light;
    appThemeMode.value = next;
    setState(() => savingTheme = true);
    try {
      await _appUpdateChannel.invokeMethod<void>('setThemeMode', {
        'mode': dark ? 'dark' : 'light',
      });
    } on PlatformException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Theme changed for this session: ${error.message ?? 'preference could not be saved'}',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => savingTheme = false);
    }
  }

  Future<void> _editProfile() async {
    final user = widget.user;
    final name = TextEditingController(text: '${user['name'] ?? ''}');
    final role = '${user['role'] ?? 'member'}'.trim().toLowerCase();
    final program = TextEditingController(
      text: '${user['program'] ?? ''}'.trim(),
    );
    final year = TextEditingController(
      text: '${user['year_level'] ?? ''}'.trim(),
    );
    final department = TextEditingController(
      text: '${user['department'] ?? ''}'.trim(),
    );
    const courses = ['BSA', 'BSBA', 'BSCS', 'BSHM', 'BSIT'];
    const yearLevels = ['1st', '2nd', '3rd', '4th', 'Graduate'];
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Edit profile'),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'PERSONAL DETAILS',
                    style: Theme.of(dialogContext).textTheme.labelMedium
                        ?.copyWith(
                          color: ACLCColors.teal,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: name,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Full name',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                  ),
                  if (role == 'student') ...[
                    const SizedBox(height: 18),
                    Text(
                      'STUDENT DETAILS',
                      style: Theme.of(dialogContext).textTheme.labelMedium
                          ?.copyWith(
                            color: ACLCColors.teal,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Course / program',
                      style: Theme.of(dialogContext).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 2,
                      children: [
                        for (final course in courses)
                          ChoiceChip(
                            label: Text(course),
                            selected: program.text.toUpperCase() == course,
                            onSelected: (_) =>
                                setDialogState(() => program.text = course),
                          ),
                        if (program.text.isNotEmpty &&
                            !courses.contains(program.text.toUpperCase()))
                          ChoiceChip(
                            label: Text('${program.text} (current)'),
                            selected: true,
                            onSelected: (_) {},
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Year level',
                      style: Theme.of(dialogContext).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 2,
                      children: [
                        for (final level in yearLevels)
                          ChoiceChip(
                            label: Text(level),
                            selected:
                                year.text.toLowerCase() == level.toLowerCase(),
                            onSelected: (_) =>
                                setDialogState(() => year.text = level),
                          ),
                        if (year.text.isNotEmpty &&
                            !yearLevels.any(
                              (level) =>
                                  level.toLowerCase() ==
                                  year.text.toLowerCase(),
                            ))
                          ChoiceChip(
                            label: Text('${year.text} (current)'),
                            selected: true,
                            onSelected: (_) {},
                          ),
                      ],
                    ),
                  ],
                  if (role == 'teacher' || role == 'librarian') ...[
                    const SizedBox(height: 18),
                    Text(
                      'STAFF DETAILS',
                      style: Theme.of(dialogContext).textTheme.labelMedium
                          ?.copyWith(
                            color: ACLCColors.teal,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                          ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: department,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Department',
                        prefixIcon: Icon(Icons.apartment_rounded),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Text(
                    'ACCOUNT DETAILS · READ ONLY',
                    style: Theme.of(dialogContext).textTheme.labelMedium
                        ?.copyWith(
                          color: ACLCColors.teal,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                  ),
                  const SizedBox(height: 6),
                  _profileReadOnly('Role', _prettyRole(role)),
                  _profileReadOnly('School email', '${user['email'] ?? '—'}'),
                  if (role == 'student')
                    _profileReadOnly(
                      'Student ID',
                      '${user['school_number'] ?? 'Not assigned'}',
                    ),
                  if (role == 'teacher' || role == 'librarian')
                    _profileReadOnly(
                      'Employee ID',
                      '${user['employee_number'] ?? 'Not assigned'}',
                    ),
                  if (role == 'administrator')
                    _profileReadOnly(
                      'Administrator ID',
                      '${user['digital_id'] ?? 'Not assigned'}',
                    ),
                  Text(
                    'Role, email and official ID are managed by ACLC and cannot be changed here.',
                    style: Theme.of(dialogContext).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: const Icon(Icons.save_outlined),
              label: const Text('Save changes'),
            ),
          ],
        ),
      ),
    );
    if (saved == true && mounted) {
      try {
        final result = await Api.put('/me', {
          'name': name.text.trim(),
          if (role == 'student') 'program': program.text.trim(),
          if (role == 'student') 'year_level': year.text.trim(),
          if (role == 'teacher' || role == 'librarian')
            'department': department.text.trim(),
        });
        Api.setCurrentUser(result['user'] as Map<String, dynamic>);
        await widget.onProfileUpdated();
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Profile updated.')));
        }
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.toString().replaceFirst('Exception: ', '')),
            ),
          );
        }
      }
    }
    name.dispose();
    program.dispose();
    year.dispose();
    department.dispose();
  }

  Widget _profileReadOnly(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 104,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Expanded(child: Text(value.isEmpty ? '—' : value)),
      ],
    ),
  );

  String _prettyRole(String role) => switch (role) {
    'administrator' => 'Administrator',
    'librarian' => 'Librarian',
    'teacher' => 'Teacher',
    'student' => 'Student',
    _ => role.isEmpty ? 'Member' : role,
  };

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Change password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: current,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: next,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'New password (10+ characters)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Update password'),
          ),
        ],
      ),
    );
    if (submitted == true && mounted) {
      try {
        final result = await Api.post('/me/password', {
          'current_password': current.text,
          'new_password': next.text,
        }, auth: true);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result['message'] ?? 'Password updated.')),
          );
        }
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.toString().replaceFirst('Exception: ', '')),
            ),
          );
        }
      }
    }
    current.dispose();
    next.dispose();
  }

  void _showSecurity() {
    final user = widget.user;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Account & security',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              _settingsInfo(
                Icons.alternate_email_rounded,
                'School email',
                '${user['email'] ?? 'Not available'}',
              ),
              _settingsInfo(
                Icons.verified_user_outlined,
                'Account status',
                '${user['status'] ?? 'Active'}',
              ),
              _settingsInfo(
                Icons.badge_outlined,
                'Library role',
                '${user['role'] ?? 'Member'}',
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _changePassword();
                },
                icon: const Icon(Icons.password_rounded),
                label: const Text('Change password'),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your library access is protected by your account role. Keep your password private and sign out on shared devices.',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _settingsInfo(IconData icon, String title, String value) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: ACLCColors.teal),
    title: Text(title),
    subtitle: Text(value),
    dense: true,
  );

  void _showAbout() => showAboutDialog(
    context: context,
    applicationName: 'ACLC Smart Library',
    applicationVersion: 'Campus library access, discovery and circulation',
    applicationIcon: SizedBox(
      width: 48,
      height: 48,
      child: Image.asset('assets/aclc-logo.png'),
    ),
    children: const [
      Text('Made for the ACLC College Mandaue City Campus community.'),
      SizedBox(height: 8),
      Text(
        'Browse the catalog, manage library activity and access your digital library ID in one place.',
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final user = widget.user;
    final dark = appThemeMode.value == ThemeMode.dark;
    final displayName = '${user['name'] ?? 'A'}'.trim();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [ACLCColors.navy, ACLCColors.teal],
            ),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white,
                foregroundColor: ACLCColors.navy,
                child: Text(
                  displayName.isEmpty
                      ? 'A'
                      : displayName.substring(0, 1).toUpperCase(),
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${user['name'] ?? 'ACLC Library member'}',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${user['role'] ?? 'member'} · ${user['email'] ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Color(0xFFD5EAF0), fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (widget.profileDetails != null) ...[
          widget.profileDetails!,
          const SizedBox(height: 14),
        ],
        _settingsSection('YOUR ACCOUNT', [
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: const Text('Edit profile'),
            subtitle: const Text(
              'Update your name and role-specific school details',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: _editProfile,
          ),
          ListTile(
            leading: const Icon(Icons.shield_outlined),
            title: const Text('Account & security'),
            subtitle: const Text('Password, role and account status'),
            trailing: const Icon(Icons.chevron_right),
            onTap: _showSecurity,
          ),
        ]),
        const SizedBox(height: 14),
        _settingsSection('PREFERENCES', [
          SwitchListTile(
            secondary: Icon(
              dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
            ),
            title: Text(dark ? 'Dark theme' : 'Light theme'),
            subtitle: Text(
              dark
                  ? 'Easy on the eyes in low light'
                  : 'Bright and clear for daytime use',
            ),
            value: dark,
            onChanged: savingTheme ? null : _setTheme,
          ),
        ]),
        const SizedBox(height: 14),
        _settingsSection('APP', [
          ...widget.additionalAppSettings,
          const AppUpdateCard(),
          ListTile(
            leading: const Icon(Icons.info_outline_rounded),
            title: const Text('About this app'),
            subtitle: const Text('ACLC Smart Library · Mandaue City Campus'),
            trailing: const Icon(Icons.chevron_right),
            onTap: _showAbout,
          ),
        ]),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: widget.onSignOut,
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sign out'),
        ),
      ],
    );
  }

  Widget _settingsSection(String title, List<Widget> children) => Card(
    clipBehavior: Clip.antiAlias,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 15, 16, 5),
          child: Text(
            title,
            style: TextStyle(
              color: ACLCColors.teal,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
        ),
        ...children,
      ],
    ),
  );
}

PageRouteBuilder<void> _animatedRoute(Widget page) => PageRouteBuilder<void>(
  pageBuilder: (_, _, _) => page,
  transitionDuration: const Duration(milliseconds: 520),
  reverseTransitionDuration: const Duration(milliseconds: 360),
  transitionsBuilder: (_, animation, _, child) => FadeTransition(
    opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
    child: SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(0, .045),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
      child: ScaleTransition(
        scale: Tween<double>(begin: .985, end: 1).animate(
          CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
        ),
        child: child,
      ),
    ),
  ),
);

Widget _tabPage(Widget page, int index) => AnimatedSwitcher(
  duration: const Duration(milliseconds: 300),
  reverseDuration: const Duration(milliseconds: 220),
  switchInCurve: Curves.easeOutCubic,
  switchOutCurve: Curves.easeInCubic,
  layoutBuilder: (current, previous) =>
      Stack(alignment: Alignment.topCenter, children: [...previous, ?current]),
  transitionBuilder: (child, animation) => FadeTransition(
    opacity: animation,
    child: SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(.025, 0),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
      child: child,
    ),
  ),
  child: KeyedSubtree(key: ValueKey(index), child: page),
);

const _appUpdateChannel = MethodChannel('com.aclc.smart_library/app_update');

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  final schoolNumber = TextEditingController();
  final employeeNumber = TextEditingController();
  final program = TextEditingController();
  final department = TextEditingController();
  final otp = TextEditingController();
  bool register = false, loading = false, showPassword = false;
  bool _checkingApi = false;
  bool _apiAvailable = false;
  bool _apiConfigured = Api.baseUrl.trim().isNotEmpty;
  String error = '';
  String _apiStatusTitle = 'Production server not configured';
  String _apiStatusMessage =
      'After the API is deployed, this app connects over the internet. No USB cable or laptop server is needed.';
  String role = 'student';
  Map<String, dynamic> registrationRoles = {
    'student': true,
    'teacher': true,
    'librarian': false,
  };

  @override
  void initState() {
    super.initState();
    unawaited(_checkApiConnection());
    Api.get('/auth/registration-roles')
        .then((value) {
          if (mounted) {
            setState(() => registrationRoles = value.cast<String, dynamic>());
          }
        })
        .catchError((_) {});
  }

  Future<void> _checkApiConnection() async {
    _apiConfigured = Api.baseUrl.trim().isNotEmpty;
    if (!_apiConfigured) {
      if (mounted) setState(() {});
      return;
    }
    setState(() => _checkingApi = true);
    try {
      final response = await Api.get('/health');
      if (!mounted) return;
      final available = response is Map && response['ok'] == true;
      setState(() {
        _checkingApi = false;
        _apiAvailable = available;
        _apiStatusTitle = available
            ? 'Library service is online'
            : 'Library service is setting up';
        _apiStatusMessage = available
            ? 'Connected securely. Your account and library data are served online.'
            : 'The API is reachable but is not ready yet. Check its Render environment and deployment logs.';
      });
    } on ApiException catch (cause) {
      if (!mounted) return;
      setState(() {
        _checkingApi = false;
        _apiAvailable = false;
        _apiStatusTitle = cause.statusCode == 503
            ? 'Library service is setting up'
            : 'Could not reach the library service';
        _apiStatusMessage = cause.statusCode == 503
            ? 'The API is deployed but not ready. Check its Render environment and deployment logs.'
            : 'Check your internet connection and the public API deployment, then try again.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checkingApi = false;
        _apiAvailable = false;
        _apiStatusTitle = 'Could not reach the library service';
        _apiStatusMessage =
            'Check your internet connection and the public API deployment, then try again.';
      });
    }
  }

  Widget _apiConnectionCard() {
    final Color accent = _apiAvailable
        ? ACLCColors.teal
        : _checkingApi
        ? ACLCColors.muted
        : const Color(0xFF9A6810);
    final Color tint = _apiAvailable
        ? const Color(0xFFE7F5F3)
        : const Color(0xFFFFF5E3);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: .22)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: tint,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              _apiAvailable
                  ? Icons.cloud_done_rounded
                  : _checkingApi
                  ? Icons.cloud_sync_rounded
                  : Icons.cloud_off_rounded,
              color: accent,
              size: 21,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _checkingApi ? 'Checking library service…' : _apiStatusTitle,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _apiStatusMessage,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontSize: 11,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Check connection',
            onPressed: _checkingApi ? null : _checkApiConnection,
            icon: _checkingApi
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(Icons.refresh_rounded, color: accent),
          ),
        ],
      ),
    );
  }

  Future<void> forgotPassword() async {
    if (email.text.trim().isEmpty) {
      setState(() => error = 'Enter your school email first.');
      return;
    }
    setState(() => error = '');
    try {
      final response = await Api.post('/auth/forgot-password', {
        'email': email.text.trim(),
      }, auth: false);
      if (!mounted) return;
      setState(() => error = '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            response['message']?.toString() ??
                'If the account exists, a password reset link has been sent. Check your inbox and Spam folder.',
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> submit() async {
    setState(() {
      loading = true;
      error = '';
    });
    try {
      if (register) {
        final body = <String, dynamic>{
          'email': email.text.trim(),
          'password': password.text,
          'name': name.text.trim(),
          'role': role,
        };
        if (role == 'student') {
          body.addAll({
            'school_number': schoolNumber.text.trim(),
            'program': program.text.trim(),
            'year_level': '1st',
          });
        } else {
          body.addAll({
            'employee_number': employeeNumber.text.trim(),
            'department': department.text.trim(),
          });
        }
        final data = await Api.post('/auth/register', body, auth: false);
        if (!mounted) return;
        otp.clear();
        final usesEmailLink = data['verification_method'] == 'firebase_link';
        final verified = await showDialog<bool>(
          context: context,
          builder: (_) => usesEmailLink
              ? _RegistrationLinkDialog(email: email.text.trim())
              : _RegistrationOtpDialog(
                  email: email.text.trim(),
                  message: data['message']?.toString() ?? '',
                ),
        );
        if (!mounted) return;
        setState(() {
          register = false;
          if (verified == true) {
            error =
                'Email verified. Your application is awaiting administrator approval.';
          }
        });
      } else {
        final data = await Api.post('/auth/login', {
          'email': email.text.trim(),
          'password': password.text,
        }, auth: false);
        await Api.setSession(data['token'], data['user']);
        if (!mounted) return;
        final accountRole = data['user']['role'] as String?;
        if (accountRole == 'student' || accountRole == 'teacher') {
          Navigator.of(
            context,
          ).pushReplacement(_animatedRoute(const StudentDashboard()));
        } else if (accountRole == 'librarian' ||
            accountRole == 'administrator') {
          Navigator.of(
            context,
          ).pushReplacement(_animatedRoute(const StaffDashboard()));
        } else {
          setState(
            () =>
                error = 'This account cannot access the mobile library portal.',
          );
        }
      }
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: Theme.of(context).brightness == Brightness.dark
                  ? const [Color(0xFF172A36), Color(0xFF0E1C26)]
                  : const [Color(0xFFEAF3F6), ACLCColors.canvas],
              stops: [0, .42],
            ),
          ),
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 30),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!register)
                      Container(
                        height: 184,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [ACLCColors.navy, ACLCColors.teal],
                          ),
                          borderRadius: BorderRadius.circular(26),
                          boxShadow: [
                            BoxShadow(
                              color: ACLCColors.navy.withValues(alpha: .20),
                              blurRadius: 25,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        child: Stack(
                          children: [
                            Positioned(
                              right: -24,
                              top: -48,
                              child: Container(
                                width: 154,
                                height: 154,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white.withValues(alpha: .07),
                                ),
                              ),
                            ),
                            Positioned(
                              right: 12,
                              bottom: -58,
                              child: Container(
                                width: 130,
                                height: 130,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white.withValues(alpha: .12),
                                    width: 18,
                                  ),
                                ),
                              ),
                            ),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Container(
                                  width: 70,
                                  height: 70,
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Image.asset(
                                    'assets/aclc-logo.png',
                                    fit: BoxFit.contain,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        'ACLC COLLEGE · MANDAUE',
                                        style: TextStyle(
                                          color: Colors.white.withValues(
                                            alpha: .78,
                                          ),
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 1.1,
                                        ),
                                      ),
                                      const SizedBox(height: 5),
                                      const Text(
                                        'Smart Library',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 24,
                                          height: 1.05,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'Your campus library, ready when you are.',
                                        style: TextStyle(
                                          color: Colors.white.withValues(
                                            alpha: .88,
                                          ),
                                          fontSize: 12,
                                          height: 1.3,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            Positioned(
                              left: 0,
                              bottom: 0,
                              child: Row(
                                children: [
                                  _authFeature(Icons.search, 'Discover'),
                                  const SizedBox(width: 8),
                                  _authFeature(
                                    Icons.bookmark_outline,
                                    'Reserve',
                                  ),
                                  const SizedBox(width: 8),
                                  _authFeature(Icons.qr_code_2, 'Access'),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Container(
                            width: 72,
                            height: 72,
                            padding: const EdgeInsets.all(7),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(18),
                              boxShadow: [
                                BoxShadow(
                                  color: ACLCColors.navy.withValues(alpha: .10),
                                  blurRadius: 20,
                                  offset: const Offset(0, 7),
                                ),
                              ],
                            ),
                            child: Image.asset(
                              'assets/aclc-logo.png',
                              fit: BoxFit.contain,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ACLC COLLEGE',
                                  style: TextStyle(
                                    color: ACLCColors.teal,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    letterSpacing: 1.3,
                                  ),
                                ),
                                SizedBox(height: 4),
                                Text(
                                  'Smart Library',
                                  style: TextStyle(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurface,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 23,
                                  ),
                                ),
                                Text(
                                  'Mandaue City campus',
                                  style: TextStyle(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 18),
                    _apiConnectionCard(),
                    const SizedBox(height: 14),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 320),
                      switchInCurve: Curves.easeOutCubic,
                      switchOutCurve: Curves.easeInCubic,
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: ScaleTransition(
                          scale: Tween<double>(
                            begin: .985,
                            end: 1,
                          ).animate(animation),
                          child: SlideTransition(
                            position: Tween<Offset>(
                              begin: const Offset(0, .035),
                              end: Offset.zero,
                            ).animate(animation),
                            child: child,
                          ),
                        ),
                      ),
                      child: Container(
                        key: ValueKey(register),
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: const Color(0xFFE2EBEF)),
                          boxShadow: [
                            BoxShadow(
                              color: ACLCColors.navy.withValues(alpha: .07),
                              blurRadius: 28,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Container(
                                width: 44,
                                height: 4,
                                alignment: Alignment.centerLeft,
                                decoration: BoxDecoration(
                                  color: ACLCColors.gold,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            Text(
                              register ? 'Join the library' : 'Welcome back',
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(
                                    color: ACLCColors.ink,
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              register
                                  ? 'Create your student or faculty account.'
                                  : 'Sign in to explore and manage your library activity.',
                              style: TextStyle(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 22),
                            if (register)
                              TextField(
                                controller: name,
                                textCapitalization: TextCapitalization.words,
                                decoration: const InputDecoration(
                                  labelText: 'Full name',
                                  prefixIcon: Icon(Icons.person_outline),
                                ),
                              ),
                            if (register) const SizedBox(height: 12),
                            if (register)
                              DropdownButtonFormField<String>(
                                initialValue: role,
                                decoration: const InputDecoration(
                                  labelText: 'Account type',
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                                items: [
                                  _roleOption('student', 'Student'),
                                  _roleOption('teacher', 'Teacher'),
                                ],
                                onChanged: (value) =>
                                    setState(() => role = value ?? 'student'),
                              ),
                            if (register) const SizedBox(height: 12),
                            if (register && role == 'student')
                              TextField(
                                controller: schoolNumber,
                                decoration: const InputDecoration(
                                  labelText: 'Student ID number',
                                  prefixIcon: Icon(Icons.numbers),
                                ),
                              ),
                            if (register && role == 'teacher')
                              TextField(
                                controller: employeeNumber,
                                decoration: const InputDecoration(
                                  labelText: 'Employee ID',
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                              ),
                            if (register) const SizedBox(height: 12),
                            if (register && role == 'student')
                              DropdownButtonFormField<String>(
                                initialValue: program.text.isEmpty
                                    ? null
                                    : program.text,
                                decoration: const InputDecoration(
                                  labelText: 'Course / program',
                                  prefixIcon: Icon(Icons.school_outlined),
                                ),
                                hint: const Text('Select your course'),
                                items: const [
                                  DropdownMenuItem(
                                    value: 'BSA',
                                    child: Text('BSA'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'BSBA',
                                    child: Text('BSBA'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'BSCS',
                                    child: Text('BSCS'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'BSHM',
                                    child: Text('BSHM'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'BSIT',
                                    child: Text('BSIT'),
                                  ),
                                ],
                                onChanged: (value) =>
                                    setState(() => program.text = value ?? ''),
                              ),
                            if (register && role == 'teacher')
                              TextField(
                                controller: department,
                                decoration: const InputDecoration(
                                  labelText: 'Department',
                                  prefixIcon: Icon(
                                    Icons.account_balance_outlined,
                                  ),
                                ),
                              ),
                            if (register) const SizedBox(height: 12),
                            TextField(
                              controller: email,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'School email',
                                prefixIcon: Icon(Icons.alternate_email),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: password,
                              obscureText: !showPassword,
                              decoration: InputDecoration(
                                labelText: 'Password',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    showPassword
                                        ? Icons.visibility_off
                                        : Icons.visibility,
                                  ),
                                  onPressed: () => setState(
                                    () => showPassword = !showPassword,
                                  ),
                                ),
                              ),
                            ),
                            if (error.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: Container(
                                  padding: const EdgeInsets.all(13),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFF0EF),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: const Color(0xFFF4D2CF),
                                    ),
                                  ),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Icon(
                                        Icons.cloud_off_outlined,
                                        color: Color(0xFFAD3D35),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              error.contains('service') ||
                                                      error.contains(
                                                        'API address',
                                                      )
                                                  ? 'Library service unavailable'
                                                  : 'We could not complete that',
                                              style: const TextStyle(
                                                color: Color(0xFF8E302B),
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              error,
                                              style: const TextStyle(
                                                color: Color(0xFFAD3D35),
                                                height: 1.4,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            const SizedBox(height: 18),
                            FilledButton(
                              onPressed: loading ? null : submit,
                              child: loading
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      register ? 'Create account' : 'Sign in',
                                    ),
                            ),
                            if (!register)
                              Align(
                                alignment: Alignment.center,
                                child: TextButton(
                                  onPressed: loading ? null : forgotPassword,
                                  child: const Text('Forgot password?'),
                                ),
                              ),
                            Align(
                              alignment: Alignment.center,
                              child: TextButton(
                                onPressed: loading ? null : toggleRegistration,
                                child: Text(
                                  register
                                      ? 'Already a member? Sign in'
                                      : 'New to the library? Create an account',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.auto_stories_outlined,
                          size: 17,
                          color: ACLCColors.teal,
                        ),
                        SizedBox(width: 7),
                        Text(
                          'A place to read, research and grow',
                          style: TextStyle(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  DropdownMenuItem<String> _roleOption(String value, String label) {
    final enabled = registrationRoles[value] == true;
    return DropdownMenuItem<String>(
      value: value,
      enabled: enabled,
      child: Text(
        label + (enabled ? '' : ' · unavailable'),
        style: TextStyle(color: enabled ? ACLCColors.ink : Colors.black38),
      ),
    );
  }

  Widget _authFeature(IconData icon, String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .13),
      borderRadius: BorderRadius.circular(30),
      border: Border.all(color: Colors.white.withValues(alpha: .14)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.white),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );

  Future<void> toggleRegistration() async {
    final openingRegistration = !register;
    setState(() {
      register = openingRegistration;
      error = '';
      if (openingRegistration && registrationRoles[role] != true) {
        role = ['student', 'teacher', 'librarian'].firstWhere(
          (candidate) => registrationRoles[candidate] == true,
          orElse: () => 'student',
        );
      }
    });
    if (!openingRegistration) return;
    try {
      final freshRoles =
          await Api.get('/auth/registration-roles') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        registrationRoles = freshRoles;
        if (registrationRoles[role] != true) {
          role = ['student', 'teacher', 'librarian'].firstWhere(
            (candidate) => registrationRoles[candidate] == true,
            orElse: () => 'student',
          );
        }
      });
    } catch (_) {
      // The form stays responsive; the API still enforces role availability.
    }
  }
}

class _RegistrationOtpDialog extends StatefulWidget {
  const _RegistrationOtpDialog({required this.email, required this.message});
  final String email;
  final String message;

  @override
  State<_RegistrationOtpDialog> createState() => _RegistrationOtpDialogState();
}

class _RegistrationOtpDialogState extends State<_RegistrationOtpDialog> {
  final _otp = TextEditingController();
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _otp.dispose();
    super.dispose();
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await Api.post('/auth/resend-otp', {
        'email': widget.email,
      }, auth: false);
      if (!mounted) return;
      final code = result['verification_otp']?.toString();
      setState(() {
        _busy = false;
        _error = code == null
            ? result['message'].toString()
            : 'Development code: $code';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_otp.text.trim())) {
      setState(() => _error = 'Enter the six-digit code from your email.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Api.post('/auth/verify-otp', {
        'email': widget.email,
        'otp': _otp.text.trim(),
      }, auth: false);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Verify your email'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'We sent a six-digit code to ${widget.email}. Enter it to create your account. The code expires in five minutes.',
        ),
        const SizedBox(height: 8),
        Text(widget.message),
        const SizedBox(height: 16),
        TextField(
          controller: _otp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: '6-digit verification code',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            _error,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
      ],
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.of(context).pop(false),
        child: const Text('Cancel'),
      ),
      TextButton(
        onPressed: _busy ? null : _resend,
        child: const Text('Resend code'),
      ),
      FilledButton(
        onPressed: _busy ? null : _verify,
        child: Text(_busy ? 'Please wait…' : 'Verify and create account'),
      ),
    ],
  );
}

class _RegistrationLinkDialog extends StatefulWidget {
  const _RegistrationLinkDialog({required this.email});
  final String email;
  @override
  State<_RegistrationLinkDialog> createState() =>
      _RegistrationLinkDialogState();
}

class _RegistrationLinkDialogState extends State<_RegistrationLinkDialog> {
  bool _busy = false;
  String _message = '';
  bool _success = false;

  Future<void> _complete() async {
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final result = await Api.post('/auth/complete-registration', {
        'email': widget.email,
      }, auth: false);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _success = true;
        _message =
            result['message']?.toString() ??
            'Your application is awaiting administrator approval.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final result = await Api.post('/auth/resend-verification', {
        'email': widget.email,
      }, auth: false);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message =
            result['message']?.toString() ??
            'Check your email for a fresh link.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    icon: Icon(
      _success ? Icons.verified_rounded : Icons.mark_email_read_rounded,
      color: ACLCColors.teal,
      size: 36,
    ),
    title: Text(_success ? 'Application submitted' : 'Verify your email'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _success
              ? _message
              : 'We sent a secure Firebase verification link to ${widget.email}. Open that email, click the link, then return here. Check Spam if it is missing.',
        ),
        if (_message.isNotEmpty && !_success) ...[
          const SizedBox(height: 12),
          Text(
            _message,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
      ],
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.of(context).pop(_success),
        child: Text(_success ? 'Done' : 'Close'),
      ),
      if (!_success)
        TextButton(
          onPressed: _busy ? null : _resend,
          child: const Text('Resend link'),
        ),
      if (!_success)
        FilledButton.icon(
          onPressed: _busy ? null : _complete,
          icon: const Icon(Icons.check_circle_outline),
          label: Text(_busy ? 'Checking…' : 'I verified my email'),
        ),
    ],
  );
}

class StudentDashboard extends StatelessWidget {
  const StudentDashboard({super.key});
  @override
  Widget build(BuildContext context) => const _RoleDashboard();
}

class StaffDashboard extends StatelessWidget {
  const StaffDashboard({super.key});
  @override
  Widget build(BuildContext context) => const _RoleDashboard();
}

class _RoleDashboard extends StatefulWidget {
  const _RoleDashboard();
  @override
  State<_RoleDashboard> createState() => _RoleDashboardState();
}

class _RoleDashboardState extends State<_RoleDashboard> {
  int _selected = 0;
  bool _loading = true;
  bool _busy = false;
  String _search = '';
  String _availabilityFilter = 'All books';
  String _categoryFilter = 'All categories';
  String _error = '';
  Map<String, dynamic> _user = Api.user ?? {};
  Map<String, dynamic> _summary = {};
  Map<String, dynamic> _personal = {};
  Map<String, dynamic> _credential = {};
  Map<String, dynamic> _liraStatus = {};
  List<dynamic> _books = [];
  List<dynamic> _loans = [];
  List<dynamic> _reservations = [];
  List<dynamic> _pending = [];
  List<dynamic> _members = [];
  List<dynamic> _archivedMembers = [];
  List<dynamic> _gates = [];
  List<dynamic> _copies = [];
  List<dynamic> _liraMessages = [];
  final _searchController = TextEditingController();
  final _liraController = TextEditingController();
  final _liraScroll = ScrollController();
  Timer? _searchDebounce;

  String get _role => '${_user['role'] ?? 'student'}';
  bool get _isMember => _role == 'student' || _role == 'teacher';

  List<String> get _bookCategories {
    final categories =
        _books
            .map((book) => '${book['category'] ?? ''}'.trim())
            .where((category) => category.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    return ['All categories', ...categories];
  }

  List<dynamic> get _visibleBooks => _books.where((book) {
    final available = (book['available_copies'] as num? ?? 0).toInt();
    final category = '${book['category'] ?? ''}'.trim();
    final matchesAvailability = switch (_availabilityFilter) {
      'Available' => available > 0,
      'Checked out' => available == 0,
      _ => true,
    };
    return matchesAvailability &&
        (_categoryFilter == 'All categories' || category == _categoryFilter);
  }).toList();

  List<_DashboardDestination> get _destinations {
    if (_role == 'student') {
      return const [
        _DashboardDestination('Home', Icons.space_dashboard_rounded),
        _DashboardDestination('Explore', Icons.menu_book_rounded),
        _DashboardDestination('My QR', Icons.qr_code_2_rounded),
        _DashboardDestination('Activity', Icons.history_rounded),
        _DashboardDestination('LIRA', Icons.auto_awesome_rounded),
        _DashboardDestination('Profile', Icons.person_rounded),
      ];
    }
    if (_role == 'teacher') {
      return const [
        _DashboardDestination('Home', Icons.space_dashboard_rounded),
        _DashboardDestination('Explore', Icons.menu_book_rounded),
        _DashboardDestination('My QR', Icons.qr_code_2_rounded),
        _DashboardDestination('Activity', Icons.history_rounded),
        _DashboardDestination('Profile', Icons.person_rounded),
      ];
    }
    if (_role == 'librarian') {
      return const [
        _DashboardDestination('Home', Icons.space_dashboard_rounded),
        _DashboardDestination('Catalog', Icons.menu_book_rounded),
        _DashboardDestination('Circulation', Icons.swap_horiz_rounded),
        _DashboardDestination('Requests', Icons.bookmark_added_rounded),
        _DashboardDestination('Profile', Icons.person_rounded),
      ];
    }
    return const [
      _DashboardDestination('Home', Icons.space_dashboard_rounded),
      _DashboardDestination('Accounts', Icons.groups_rounded),
      _DashboardDestination('Catalog', Icons.menu_book_rounded),
      _DashboardDestination('Circulation', Icons.swap_horiz_rounded),
      _DashboardDestination('Operations', Icons.settings_suggest_rounded),
      _DashboardDestination('Profile', Icons.person_rounded),
    ];
  }

  @override
  void initState() {
    super.initState();
    Api.sessionExpired.addListener(_handleExpiredSession);
    _load();
  }

  void _handleExpiredSession() {
    if (!Api.sessionExpired.value || !mounted) return;
    Api.sessionExpired.value = false;
    unawaited(Api.clearSession());
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Your sign-in expired. Please sign in again.'),
      ),
    );
    Navigator.of(
      context,
    ).pushAndRemoveUntil(_animatedRoute(const AuthScreen()), (_) => false);
  }

  @override
  void dispose() {
    Api.sessionExpired.removeListener(_handleExpiredSession);
    _searchController.dispose();
    _liraController.dispose();
    _liraScroll.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  List<dynamic> _list(dynamic value) => value is List ? value : const [];
  Future<dynamic> _optional(Future<dynamic> request) async {
    try {
      return await request;
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Map<String, dynamic> _map(dynamic value) => value is Map<String, dynamic>
      ? value
      : value is Map
      ? Map<String, dynamic>.from(value)
      : <String, dynamic>{};

  Future<void> _load({bool showProgress = true}) async {
    if (showProgress && mounted) setState(() => _loading = true);
    try {
      final profile = await Api.get('/me') as Map<String, dynamic>;
      _user = _map(profile['user']);
      Api.setCurrentUser(_user);
      final futures = <Future<dynamic>>[
        Api.get(
          '/books${_search.trim().isEmpty ? '' : '?search=${Uri.encodeQueryComponent(_search.trim())}'}',
        ),
      ];
      if (_isMember) {
        futures.addAll([
          Api.get('/dashboard/personal'),
          Api.get('/my/history'),
          Api.get('/loans'),
          Api.get('/reservations'),
        ]);
        if (_role == 'student') {
          futures.addAll([
            _optional(Api.get('/credentials/qr')),
            Api.get('/lira/status'),
            Api.get('/lira/history'),
          ]);
        } else {
          futures.add(_optional(Api.get('/credentials/qr')));
        }
      } else {
        futures.addAll([
          Api.get(
            _role == 'administrator'
                ? '/dashboard/admin'
                : '/dashboard/librarian',
          ),
          Api.get('/reservations'),
          Api.get('/loans/active'),
          Api.get('/gates/status'),
        ]);
        if (_role == 'administrator') {
          futures.addAll([
            Api.get('/admin/users/pending'),
            Api.get('/admin/users'),
            Api.get('/admin/users?archived=true'),
          ]);
        }
        if ((_selected == 2 && _role == 'librarian') ||
            (_selected == 3 && _role == 'administrator')) {
          futures.add(Api.get('/copies/available'));
        }
      }
      final values = await Future.wait(futures);
      var i = 0;
      _books = _list(values[i++]);
      if (!_bookCategories.contains(_categoryFilter)) {
        _categoryFilter = 'All categories';
      }
      if (_isMember) {
        _personal = _map(values[i++]);
        final history = _map(values[i++]);
        _user['standing'] = history['standing'] ?? _user['standing'];
        _loans = _list(values[i++]);
        _reservations = _list(values[i++]);
        if (_role == 'student') {
          _credential = _map(values[i++]);
          _liraStatus = _map(values[i++]);
          _liraMessages = _list(values[i++]);
        } else {
          _credential = _map(values[i++]);
        }
      } else {
        _summary = _map(values[i++]);
        _reservations = _list(values[i++]);
        _loans = _list(values[i++]);
        _gates = _list(values[i++]);
        if (_role == 'administrator') {
          _pending = _list(values[i++]);
          _members = _list(values[i++]);
          _archivedMembers = _list(values[i++]);
        }
        if (i < values.length) _copies = _list(values[i]);
      }
      _error = '';
    } catch (error) {
      _error = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _action(
    Future<dynamic> Function() action,
    String success,
  ) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(success)));
      await _load(showProgress: false);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clearLiraHistory() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.delete_sweep_outlined),
        title: const Text('Delete LIRA conversation history?'),
        content: const Text(
          'This permanently deletes your saved LIRA messages. Your library account, loans, and reservations will not be affected.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep history'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete conversation'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _action(
      () => Api.delete('/lira/history'),
      'LIRA conversation deleted.',
    );
  }

  Future<void> _reserve(dynamic book) => _action(
    () => Api.post('/reservations', {'book_id': book['id']}),
    'Reservation request sent to the library.',
  );

  Future<void> _approve(dynamic applicant, bool approve) async {
    final reason = TextEditingController();
    if (!approve) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Decline application'),
          content: TextField(
            controller: reason,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Reason (optional)'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Decline'),
            ),
          ],
        ),
      );
      if (confirmed != true) {
        reason.dispose();
        return;
      }
    }
    await _action(
      () => Api.post('/admin/users/${applicant['id']}/approval', {
        'approve': approve,
        'reason': reason.text.trim().isEmpty ? null : reason.text.trim(),
      }),
      approve
          ? 'Account approved. The student can now sign in.'
          : 'Application declined. The decision is saved in Accounts.',
    );
    reason.dispose();
  }

  Future<void> _removeMember(dynamic member) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Archive this account?'),
        content: Text(
          '${member['name']} will lose sign-in and QR access. The account and library history will remain in Archive, where you can restore it later or permanently delete its personal details.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Archive account'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await _action(() async {
      await Api.post('/admin/users/${member['id']}/archive', {
        'reason': 'Archived by administrator',
      });
    }, 'Account archived. Restore it anytime from Archive.');
  }

  Future<void> _restoreMember(dynamic member) => _action(
    () => Api.post('/admin/users/${member['id']}/restore', {
      'reason': 'Restored by administrator',
    }),
    'Account restored.',
  );

  Future<void> _deleteArchivedMember(dynamic member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.delete_forever_outlined, color: Colors.red),
        title: const Text('Permanently delete personal details?'),
        content: Text(
          'This removes ${member['name']}’s sign-in account and personal details from Firebase and SQLite. Circulation and audit history stays for library records. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete permanently'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _action(
      () => Api.delete(
        '/admin/users/${member['id']}',
        body: {'reason': 'Personal data permanently deleted by administrator'},
      ),
      'Personal details deleted. Library history was retained.',
    );
  }

  Future<void> _showStudentHistory(dynamic member) async {
    try {
      final data = _map(await Api.get('/users/${member['id']}/history'));
      if (!mounted) return;
      final stats = _map(data['statistics']);
      final loans = _list(data['loans']);
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .78,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${member['name']} · Borrowing history',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _historyCountChip(
                            'Books borrowed',
                            stats['physicalBooksBorrowed'],
                          ),
                          _historyCountChip(
                            'On loan',
                            stats['currentlyBorrowed'],
                          ),
                          _historyCountChip('Returned', stats['returned']),
                          _historyCountChip('Overdue', stats['overdue']),
                        ],
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: loans.isEmpty
                      ? Center(
                          child: Text(
                            'No borrowing records yet.',
                            style: TextStyle(color: ACLCColors.muted),
                          ),
                        )
                      : ListView.builder(
                          itemCount: loans.length,
                          itemBuilder: (context, index) {
                            final loan = _map(loans[index]);
                            final status =
                                '${loan['item_status'] ?? loan['loan_status'] ?? 'unknown'}';
                            return ListTile(
                              leading: CircleAvatar(
                                backgroundColor: status == 'borrowed'
                                    ? const Color(0xFFFFF3D5)
                                    : const Color(0xFFE7F5F3),
                                child: Icon(
                                  status == 'borrowed'
                                      ? Icons.menu_book_rounded
                                      : Icons.bookmark_added_outlined,
                                  color: status == 'borrowed'
                                      ? ACLCColors.gold
                                      : ACLCColors.teal,
                                ),
                              ),
                              title: Text(
                                '${loan['title'] ?? 'Book'}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                '${loan['author'] ?? ''} · ${status.toUpperCase()}\nBorrowed ${_displayDate(loan['borrowed_at'])} · Due ${_displayDate(loan['due_at'])}${loan['returned_at'] == null ? '' : ' · Returned ${_displayDate(loan['returned_at'])}'}',
                              ),
                              isThreeLine: true,
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Could not load borrowing history: ${error.toString().replaceFirst('Exception: ', '')}',
            ),
          ),
        );
      }
    }
  }

  String _displayDate(dynamic value) {
    if (value == null || '$value'.isEmpty) return '—';
    final date = DateTime.tryParse('$value');
    if (date == null) return '$value';
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  Widget _historyCountChip(String label, dynamic value) => Chip(
    avatar: const Icon(Icons.auto_stories_outlined, size: 16),
    label: Text('$label: ${value ?? 0}'),
    visualDensity: VisualDensity.compact,
  );

  Future<void> _showCreateAccount() async {
    final name = TextEditingController();
    final email = TextEditingController();
    final password = TextEditingController();
    final studentId = TextEditingController();
    final program = TextEditingController();
    final yearLevel = TextEditingController();
    final employeeId = TextEditingController();
    final department = TextEditingController();
    final formKey = GlobalKey<FormState>();
    var role = 'student';
    var obscurePassword = true;
    final account = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Register a campus member'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: role,
                      decoration: const InputDecoration(
                        labelText: 'Account type',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'student',
                          child: Text('Student'),
                        ),
                        DropdownMenuItem(
                          value: 'teacher',
                          child: Text('Teacher'),
                        ),
                        DropdownMenuItem(
                          value: 'librarian',
                          child: Text('Librarian'),
                        ),
                      ],
                      onChanged: (value) =>
                          setDialogState(() => role = value ?? 'student'),
                    ),
                    TextFormField(
                      controller: name,
                      decoration: const InputDecoration(labelText: 'Full name'),
                      validator: (value) => (value?.trim().length ?? 0) < 2
                          ? 'Enter the user’s full name'
                          : null,
                    ),
                    TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Email address',
                        prefixIcon: Icon(Icons.alternate_email_rounded),
                      ),
                      validator: (value) =>
                          value == null ||
                              !RegExp(
                                r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                              ).hasMatch(value.trim())
                          ? 'Enter a valid email'
                          : null,
                    ),
                    TextFormField(
                      controller: password,
                      obscureText: obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'Temporary password',
                        helperText:
                            'Use at least 10 characters. Share it privately.',
                        prefixIcon: const Icon(Icons.lock_outline_rounded),
                        suffixIcon: IconButton(
                          tooltip: obscurePassword
                              ? 'Show temporary password'
                              : 'Hide temporary password',
                          onPressed: () => setDialogState(
                            () => obscurePassword = !obscurePassword,
                          ),
                          icon: Icon(
                            obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (value) => (value?.length ?? 0) < 10
                          ? 'Use at least 10 characters'
                          : null,
                    ),
                    if (role == 'student') ...[
                      TextFormField(
                        controller: studentId,
                        decoration: const InputDecoration(
                          labelText: 'Student ID',
                        ),
                        validator: (value) =>
                            value == null || value.trim().isEmpty
                            ? 'Enter the student ID'
                            : null,
                      ),
                      DropdownButtonFormField<String>(
                        initialValue: program.text.isEmpty
                            ? null
                            : program.text,
                        decoration: const InputDecoration(labelText: 'Course'),
                        items: const ['BSA', 'BSBA', 'BSCS', 'BSHM', 'BSIT']
                            .map(
                              (course) => DropdownMenuItem(
                                value: course,
                                child: Text(course),
                              ),
                            )
                            .toList(),
                        onChanged: (value) => program.text = value ?? '',
                        validator: (value) =>
                            value == null ? 'Select a course' : null,
                      ),
                      TextFormField(
                        controller: yearLevel,
                        decoration: const InputDecoration(
                          labelText: 'Year level (optional)',
                        ),
                      ),
                    ] else ...[
                      TextFormField(
                        controller: employeeId,
                        decoration: const InputDecoration(
                          labelText: 'Employee ID',
                        ),
                        validator: (value) =>
                            value == null || value.trim().isEmpty
                            ? 'Enter the employee ID'
                            : null,
                      ),
                      TextFormField(
                        controller: department,
                        decoration: const InputDecoration(
                          labelText: 'Department',
                        ),
                        validator: (value) =>
                            value == null || value.trim().isEmpty
                            ? 'Enter the department'
                            : null,
                      ),
                    ],
                    const Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: Text(
                        'This account is approved immediately and linked to the library system. Confirm the email and school or employee ID before creating it.',
                        style: TextStyle(fontSize: 12, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (!formKey.currentState!.validate()) return;
                Navigator.pop(dialogContext, {
                  'name': name.text.trim(),
                  'email': email.text.trim(),
                  'password': password.text,
                  'role': role,
                  if (role == 'student') 'school_number': studentId.text.trim(),
                  if (role == 'student') 'program': program.text,
                  if (role == 'student' && yearLevel.text.trim().isNotEmpty)
                    'year_level': yearLevel.text.trim(),
                  if (role != 'student')
                    'employee_number': employeeId.text.trim(),
                  if (role != 'student') 'department': department.text.trim(),
                });
              },
              child: const Text('Create approved account'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    email.dispose();
    password.dispose();
    studentId.dispose();
    program.dispose();
    yearLevel.dispose();
    employeeId.dispose();
    department.dispose();
    if (account == null || !mounted || _busy) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await Api.post('/admin/users', account);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${result['message'] ?? 'Account created.'}')),
      );
      await _load(showProgress: false);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _updateReservation(dynamic reservation, String status) =>
      _action(
        () => Api.post('/reservations/${reservation['id']}/status', {
          'status': status,
        }),
        'Reservation marked $status.',
      );

  Future<void> _showAddBook() async {
    final title = TextEditingController();
    final author = TextEditingController();
    final isbn = TextEditingController();
    final category = TextEditingController();
    final coverUrl = TextEditingController();
    final copies = TextEditingController(text: '1');
    final formKey = GlobalKey<FormState>();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add to the collection'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: title,
                  decoration: const InputDecoration(labelText: 'Book title'),
                  validator: (v) =>
                      (v ?? '').trim().isEmpty ? 'Enter a title' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: author,
                  decoration: const InputDecoration(labelText: 'Author'),
                  validator: (v) =>
                      (v ?? '').trim().isEmpty ? 'Enter an author' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: isbn,
                  decoration: const InputDecoration(labelText: 'ISBN'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: category,
                  decoration: const InputDecoration(labelText: 'Category'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: coverUrl,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'Book cover image URL (optional)',
                    helperText: 'Use a public HTTPS image link.',
                    prefixIcon: Icon(Icons.image_outlined),
                  ),
                  validator: (value) {
                    final text = (value ?? '').trim();
                    if (text.isEmpty) return null;
                    final uri = Uri.tryParse(text);
                    return uri != null &&
                            uri.scheme == 'https' &&
                            uri.host.contains('.')
                        ? null
                        : 'Enter a valid HTTPS image link.';
                  },
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: copies,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Number of copies',
                  ),
                  validator: (v) => (int.tryParse(v ?? '') ?? 0) < 1
                      ? 'Enter at least one copy'
                      : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(context, true);
              }
            },
            child: const Text('Add book'),
          ),
        ],
      ),
    );
    if (saved == true) {
      await _action(
        () => Api.post('/books', {
          'title': title.text.trim(),
          'author': author.text.trim(),
          'isbn': isbn.text.trim(),
          'category': category.text.trim(),
          'cover_url': coverUrl.text.trim(),
          'copies': int.parse(copies.text),
        }),
        'Book added to the ACLC library catalog.',
      );
    }
    title.dispose();
    author.dispose();
    isbn.dispose();
    category.dispose();
    coverUrl.dispose();
    copies.dispose();
  }

  Future<void> _circulate() async {
    if (_members.isEmpty) {
      try {
        final members = await Future.wait([
          Api.get('/admin/users?role=student'),
          Api.get('/admin/users?role=teacher'),
        ]);
        if (!mounted) return;
        _members = [..._list(members[0]), ..._list(members[1])];
      } catch (error) {
        if (mounted) {
          setState(
            () => _error = error.toString().replaceFirst('Exception: ', ''),
          );
        }
        return;
      }
    }
    if (_copies.isEmpty) {
      try {
        _copies = _list(await Api.get('/copies/available'));
        if (!mounted) return;
      } catch (error) {
        if (mounted) {
          setState(
            () => _error = error.toString().replaceFirst('Exception: ', ''),
          );
        }
        return;
      }
    }
    if (!mounted) return;
    final eligible = _members
        .where(
          (e) =>
              ['student', 'teacher'].contains(e['role']) &&
              e['status'] == 'approved' &&
              e['is_archived'] != 1,
        )
        .toList();
    if (eligible.isEmpty || _copies.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            eligible.isEmpty
                ? 'No approved student accounts are available.'
                : 'There are no available book copies.',
          ),
        ),
      );
      return;
    }
    dynamic selectedMember = eligible.first;
    dynamic selectedCopy = _copies.first;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Issue a library copy'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<dynamic>(
                  initialValue: selectedMember,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Borrower',
                    prefixIcon: Icon(Icons.person_outline_rounded),
                  ),
                  items: eligible
                      .map(
                        (e) => DropdownMenuItem(
                          value: e,
                          child: Text(
                            '${e['name']} · ${e['email']}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setDialogState(() {
                    if (v != null) selectedMember = v;
                  }),
                ),
                if (selectedMember['role'] == 'student') ...[
                  const SizedBox(height: 9),
                  Builder(
                    builder: (context) {
                      final activeForStudent = _loans
                          .where(
                            (loan) =>
                                '${loan['user_id']}' ==
                                '${selectedMember['id']}',
                          )
                          .length;
                      final remaining = (3 - activeForStudent).clamp(0, 3);
                      return Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(11),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF5F3),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          'Student borrowing limit: $activeForStudent of 3 books in use · $remaining available',
                          style: const TextStyle(
                            color: ACLCColors.navy,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      );
                    },
                  ),
                ],
                const SizedBox(height: 12),
                DropdownButtonFormField<dynamic>(
                  initialValue: selectedCopy,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Book copy',
                    prefixIcon: Icon(Icons.menu_book_rounded),
                  ),
                  items: _copies
                      .map(
                        (e) => DropdownMenuItem(
                          value: e,
                          child: Text(
                            '${e['title']} · ${e['copy_code']}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setDialogState(() {
                    if (v != null) selectedCopy = v;
                  }),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Check out'),
            ),
          ],
        ),
      ),
    );
    if (confirmed == true) {
      final activeForMember = _loans
          .where((loan) => '${loan['user_id']}' == '${selectedMember['id']}')
          .length;
      if (selectedMember['role'] == 'student' && activeForMember >= 3) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('This student already has the maximum of 3 books.'),
          ),
        );
        return;
      }
      await _action(
        () => Api.post('/loans/checkout', {
          'user_id': selectedMember['id'],
          'copy_ids': [selectedCopy['id']],
        }),
        'Checkout completed. Due in 14 days.',
      );
    }
  }

  Future<void> _showLoanQr(dynamic loan) async {
    final token = '${loan['loan_verification_token'] ?? ''}';
    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This borrowing pass is unavailable. Refresh activity and try again.',
          ),
        ),
      );
      return;
    }
    final payload = jsonEncode({'type': 'aclc_loan', 'token': token});
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Library borrowing pass'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${loan['title'] ?? 'Borrowed book'}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              'Copy ${loan['copy_code'] ?? '—'} · show this code to the librarian',
              textAlign: TextAlign.center,
              style: const TextStyle(color: ACLCColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
              ),
              child: QrImageView(data: payload, size: 220),
            ),
            const SizedBox(height: 8),
            const Text(
              'The librarian can scan this pass to confirm the borrower and exact copy.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: ACLCColors.muted),
            ),
          ],
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _scanLoanQr() async {
    var handled = false;
    final rawCode = await showDialog<String>(
      context: context,
      builder: (dialogContext) => Dialog(
        clipBehavior: Clip.antiAlias,
        child: SizedBox(
          width: 420,
          height: 520,
          child: Stack(
            fit: StackFit.expand,
            children: [
              MobileScanner(
                onDetect: (capture) {
                  if (handled) return;
                  final raw = capture.barcodes
                      .map((barcode) => barcode.rawValue)
                      .whereType<String>()
                      .firstOrNull;
                  if (raw == null || raw.isEmpty) return;
                  handled = true;
                  Navigator.of(dialogContext).pop(raw);
                },
              ),
              Positioned(
                top: 12,
                left: 12,
                right: 12,
                child: Card(
                  color: ACLCColors.navy.withValues(alpha: .94),
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Scan the student’s active borrowing pass',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 8,
                top: 8,
                child: IconButton.filledTonal(
                  onPressed: () => Navigator.pop(dialogContext),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (rawCode == null || !mounted) return;
    try {
      final decoded = jsonDecode(rawCode);
      if (decoded is! Map || decoded['type'] != 'aclc_loan') {
        throw const FormatException('That is not an ACLC borrowing pass.');
      }
      final token = '${decoded['token'] ?? ''}';
      final result = _map(await Api.post('/loans/verify-qr', {'token': token}));
      final loan = _map(result['loan']);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(
            Icons.verified_rounded,
            color: Color(0xFF267454),
            size: 38,
          ),
          title: const Text('Active borrowing confirmed'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _verificationInfo('Borrower', '${loan['borrower_name'] ?? '—'}'),
              _verificationInfo('Role', '${loan['role'] ?? '—'}'),
              _verificationInfo(
                'Student ID',
                '${loan['school_number'] ?? loan['digital_id'] ?? '—'}',
              ),
              const Divider(height: 20),
              _verificationInfo('Book', '${loan['title'] ?? '—'}'),
              _verificationInfo('Author', '${loan['author'] ?? '—'}'),
              _verificationInfo('Copy code', '${loan['copy_code'] ?? '—'}'),
              _verificationInfo(
                'Due date',
                '${loan['due_at'] ?? '—'}'.split('T').first,
              ),
            ],
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceFirst('Exception: ', '')),
          ),
        );
      }
    }
  }

  Widget _verificationInfo(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 88,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        Expanded(child: Text(value)),
      ],
    ),
  );

  Future<void> _returnBook(dynamic loan) async {
    String condition = 'good';
    final notes = TextEditingController();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Inspect returned book'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: condition,
                decoration: const InputDecoration(labelText: 'Condition'),
                items: const [
                  DropdownMenuItem(value: 'good', child: Text('Good')),
                  DropdownMenuItem(value: 'damaged', child: Text('Damaged')),
                  DropdownMenuItem(value: 'lost', child: Text('Lost')),
                ],
                onChanged: (v) => setDialogState(() => condition = v ?? 'good'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: notes,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Inspection notes',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, {
                'condition': condition,
                'notes': notes.text.trim(),
              }),
              child: const Text('Complete return'),
            ),
          ],
        ),
      ),
    );
    if (result != null) {
      await _action(
        () => Api.post('/loans/return', {
          'loan_item_id': loan['loan_item_id'],
          ...result,
        }),
        'Book return recorded.',
      );
    }
    notes.dispose();
  }

  Future<void> _sendLira() async {
    final message = _liraController.text.trim();
    if (message.isEmpty || _busy) return;
    _liraController.clear();
    setState(() {
      _liraMessages = [
        ..._liraMessages,
        {'sender': 'user', 'message': message},
      ];
      _busy = true;
      _error = '';
    });
    try {
      final reply = await Api.post('/lira/chat', {'message': message});
      if (!mounted) return;
      setState(
        () => _liraMessages = [
          ..._liraMessages,
          {
            'sender': 'assistant',
            'message': reply['answer'],
            'source': reply['source'],
          },
        ],
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_liraScroll.hasClients) {
          _liraScroll.animateTo(
            _liraScroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    await Api.clearSession();
    if (!mounted) return;
    Navigator.of(
      context,
    ).pushAndRemoveUntil(_animatedRoute(const AuthScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final destinations = _destinations;
    if (_selected < 0 || _selected >= destinations.length) _selected = 0;
    final pageName = destinations[_selected].label;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 68,
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(13),
                boxShadow: [
                  BoxShadow(
                    color: ACLCColors.navy.withValues(alpha: .10),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Image.asset('assets/aclc-logo.png', fit: BoxFit.contain),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'ACLC MANDAUE',
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.3,
                      fontWeight: FontWeight.w900,
                      color: ACLCColors.teal,
                    ),
                  ),
                  Text(
                    destinations[_selected].label == 'Home'
                        ? 'Smart Library'
                        : destinations[_selected].label,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : () => _load(),
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
                child: Material(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                  child: ListTile(
                    dense: true,
                    leading: Icon(
                      Icons.error_outline,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    title: Text(
                      _error,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontSize: 13,
                      ),
                    ),
                    trailing: IconButton(
                      onPressed: () => setState(() => _error = ''),
                      icon: const Icon(Icons.close),
                    ),
                  ),
                ),
              ),
            Expanded(
              child: _loading && _summary.isEmpty && _personal.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _tabPage(_page(pageName), _selected),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        selectedIndex: _selected,
        onDestinationSelected: (index) => setState(() {
          _selected = index;
          _error = '';
          if ((_role == 'librarian' && index == 2) ||
              (_role == 'administrator' && index == 3)) {
            _load(showProgress: false);
          }
        }),
        destinations: destinations
            .map(
              (item) => NavigationDestination(
                icon: Icon(item.icon),
                selectedIcon: Icon(item.icon, color: ACLCColors.teal),
                label: item.label,
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _page(String name) {
    switch (name) {
      case 'Home':
        return _homePage();
      case 'Explore':
      case 'Catalog':
        return _catalogPage();
      case 'My QR':
        return _qrPage();
      case 'Activity':
        return _activityPage();
      case 'LIRA':
        return _liraPage();
      case 'Accounts':
        return _accountsPage();
      case 'Circulation':
        return _circulationPage();
      case 'Requests':
        return _requestsPage();
      case 'Operations':
        return _operationsPage();
      case 'Profile':
        return LibrarySettingsPage(
          user: _user,
          onProfileUpdated: () async {
            await _load(showProgress: false);
          },
          onSignOut: _signOut,
          additionalAppSettings: [
            if (_role == 'student')
              ListTile(
                leading: const Icon(Icons.delete_sweep_outlined),
                title: const Text('LIRA conversation history'),
                subtitle: const Text(
                  'Delete the messages saved to your account',
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: _clearLiraHistory,
              ),
            if (_role == 'administrator')
              ListTile(
                leading: const Icon(Icons.admin_panel_settings_outlined),
                title: const Text('Administrator controls'),
                subtitle: const Text('Review applicants and campus operations'),
                onTap: () => setState(() => _selected = 1),
              ),
          ],
        );
      default:
        return _homePage();
    }
  }

  Widget _homePage() => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _welcomeCard(),
        const SizedBox(height: 17),
        if (_isMember) ...[
          _sectionTitle('Your library at a glance', 'Live account overview'),
          const SizedBox(height: 10),
          _metricGrid([
            _MetricData(
              'Borrowed',
              '${_personal['activeLoans'] ?? 0}',
              Icons.auto_stories_rounded,
              const Color(0xFFE5F1F8),
            ),
            _MetricData(
              'Reservations',
              '${_personal['pendingReservations'] ?? 0}',
              Icons.bookmark_added_rounded,
              const Color(0xFFE7F5F3),
            ),
            _MetricData(
              'Overdue',
              '${_personal['overdueLoans'] ?? 0}',
              Icons.event_busy_rounded,
              const Color(0xFFFFF1DA),
            ),
            _MetricData(
              'Borrow limit',
              '${_personal['availableSlots'] ?? 0} left',
              Icons.library_add_check_rounded,
              const Color(0xFFEDEBFA),
            ),
          ]),
          const SizedBox(height: 17),
          _sectionTitle(
            'Picked for campus reading',
            'Browse books available to you',
          ),
          const SizedBox(height: 10),
          ..._books.take(3).map(_bookTile),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => setState(() => _selected = 1),
            icon: const Icon(Icons.search_rounded),
            label: const Text('Explore full catalog'),
          ),
        ] else ...[
          _sectionTitle(
            _role == 'administrator'
                ? 'Campus overview'
                : 'Today at the library',
            'Live system activity',
          ),
          const SizedBox(height: 10),
          _metricGrid(
            _role == 'administrator'
                ? [
                    _MetricData(
                      'Students',
                      '${_summary['activeStudents'] ?? 0}',
                      Icons.school_rounded,
                      const Color(0xFFE5F1F8),
                    ),
                    _MetricData(
                      'Teachers',
                      '${_summary['activeTeachers'] ?? 0}',
                      Icons.cast_for_education_rounded,
                      const Color(0xFFE7F5F3),
                    ),
                    _MetricData(
                      'Applications',
                      '${_summary['pendingRegistrations'] ?? 0}',
                      Icons.how_to_reg_rounded,
                      const Color(0xFFFFF1DA),
                    ),
                    _MetricData(
                      'Active loans',
                      '${_summary['activeLoans'] ?? 0}',
                      Icons.menu_book_rounded,
                      const Color(0xFFEDEBFA),
                    ),
                  ]
                : [
                    _MetricData(
                      'Titles',
                      '${_summary['catalog'] ?? 0}',
                      Icons.menu_book_rounded,
                      const Color(0xFFE5F1F8),
                    ),
                    _MetricData(
                      'Available',
                      '${_summary['availableCopies'] ?? 0}',
                      Icons.library_books_rounded,
                      const Color(0xFFE7F5F3),
                    ),
                    _MetricData(
                      'On loan',
                      '${_summary['activeLoans'] ?? 0}',
                      Icons.swap_horiz_rounded,
                      const Color(0xFFFFF1DA),
                    ),
                    _MetricData(
                      'Requests',
                      '${_summary['reservations'] ?? 0}',
                      Icons.bookmark_added_rounded,
                      const Color(0xFFEDEBFA),
                    ),
                  ],
          ),
          const SizedBox(height: 18),
          if (_role == 'administrator') ...[
            _sectionTitle(
              'Needs your review',
              '${_pending.length} pending applications',
            ),
            const SizedBox(height: 8),
            if (_pending.isEmpty)
              _emptyCard(
                Icons.verified_outlined,
                'All caught up',
                'There are no applications waiting for review.',
              ),
            ..._pending.take(4).map(_applicationTile),
            FilledButton.icon(
              onPressed: _busy ? null : _showCreateAccount,
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('Create a student or staff account'),
            ),
            OutlinedButton.icon(
              onPressed: () => setState(() => _selected = 1),
              icon: const Icon(Icons.groups_rounded),
              label: const Text('Manage accounts'),
            ),
          ] else ...[
            _sectionTitle('Queue overview', 'Keep the library moving'),
            const SizedBox(height: 8),
            _queueCard(
              'Reservation requests',
              '${_reservations.where((r) => r['status'] == 'pending').length} waiting',
              Icons.bookmark_added_rounded,
              () => setState(() => _selected = 3),
            ),
            _queueCard(
              'Books currently on loan',
              '${_loans.length} active items',
              Icons.swap_horiz_rounded,
              () => setState(() => _selected = 2),
            ),
          ],
          const SizedBox(height: 16),
          _sectionTitle('Campus access points', 'Gate status'),
          const SizedBox(height: 8),
          ..._gates.map(_gateTile),
        ],
      ],
    ),
  );

  Widget _welcomeCard() {
    final name = '${_user['name'] ?? 'Library member'}'.trim().split(' ').first;
    final roleLabel = _role[0].toUpperCase() + _role.substring(1);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [ACLCColors.navy, ACLCColors.teal],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: ACLCColors.navy.withValues(alpha: .18),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -6,
            top: -14,
            child: Icon(
              Icons.auto_stories_rounded,
              size: 105,
              color: Colors.white.withValues(alpha: .08),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: .15),
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: Text(
                      'ACLC MANDAUE · $roleLabel',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .7,
                      ),
                    ),
                  ),
                  const Spacer(),
                  const Icon(
                    Icons.wb_sunny_outlined,
                    color: ACLCColors.gold,
                    size: 21,
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Good day, $name',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                _isMember
                    ? 'Your campus library is ready when you are.'
                    : _role == 'administrator'
                    ? 'Your campus library, clearly in view.'
                    : 'Welcome to your library service desk.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: .85),
                  fontSize: 13,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: 15,
                    color: Colors.white.withValues(alpha: .82),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Mandaue City Campus',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: .84),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  if (_isMember)
                    _statusPill('${_user['standing'] ?? 'GOOD STANDING'}'),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusPill(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .15),
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      label.replaceAll('_', ' '),
      style: const TextStyle(
        color: Colors.white,
        fontSize: 9,
        fontWeight: FontWeight.w800,
      ),
    ),
  );

  Widget _sectionTitle(String title, String subtitle) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: ACLCColors.navy,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: ACLCColors.muted),
            ),
          ],
        ),
      ),
      if (_loading)
        const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
    ],
  );

  Widget _metricGrid(List<_MetricData> values) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = constraints.maxWidth > 700 ? 4 : 2;
      final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: values
            .asMap()
            .entries
            .map(
              (entry) => SizedBox(
                width: width,
                child: _MetricCard(data: entry.value, delay: entry.key * 70),
              ),
            )
            .toList(),
      );
    },
  );

  Widget _queueCard(
    String title,
    String value,
    IconData icon,
    VoidCallback onTap,
  ) => Card(
    child: ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: const Color(0xFFE7F5F3),
        foregroundColor: ACLCColors.teal,
        child: Icon(icon),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(value),
      trailing: const Icon(Icons.chevron_right_rounded),
    ),
  );

  Widget _catalogPage() {
    final staffCanManage = _role == 'librarian' || _role == 'administrator';
    final categories = _bookCategories;
    final books = _visibleBooks;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: _catalogBanner(staffCanManage),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(17),
              border: Border.all(color: const Color(0xFFDCE7EC)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0C123B56),
                  blurRadius: 16,
                  offset: Offset(0, 5),
                ),
              ],
            ),
            child: TextField(
              controller: _searchController,
              onChanged: (value) {
                _search = value;
                _searchDebounce?.cancel();
                _searchDebounce = Timer(
                  const Duration(milliseconds: 300),
                  () => _load(showProgress: false),
                );
              },
              decoration: InputDecoration(
                prefixIcon: const Icon(
                  Icons.search_rounded,
                  color: ACLCColors.teal,
                ),
                hintText: 'Search title, author or ISBN',
                hintStyle: const TextStyle(color: ACLCColors.muted),
                suffixIcon: _search.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchController.clear();
                          _search = '';
                          _searchDebounce?.cancel();
                          _load(showProgress: false);
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 17),
              ),
            ),
          ),
        ),
        SizedBox(
          height: 42,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            children: [
              for (final filter in const [
                'All books',
                'Available',
                'Checked out',
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(filter),
                    selected: _availabilityFilter == filter,
                    onSelected: (_) =>
                        setState(() => _availabilityFilter = filter),
                    selectedColor: ACLCColors.navy,
                    backgroundColor: Colors.white,
                    labelStyle: TextStyle(
                      color: _availabilityFilter == filter
                          ? Colors.white
                          : ACLCColors.muted,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                    side: BorderSide(
                      color: _availabilityFilter == filter
                          ? ACLCColors.navy
                          : const Color(0xFFDCE7EC),
                    ),
                    showCheckmark: false,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(22),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (categories.length > 1) ...[
          const SizedBox(height: 5),
          SizedBox(
            height: 39,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              children: [
                for (final category in categories)
                  Padding(
                    padding: const EdgeInsets.only(right: 7),
                    child: ChoiceChip(
                      label: Text(category),
                      selected: _categoryFilter == category,
                      onSelected: (_) =>
                          setState(() => _categoryFilter = category),
                      selectedColor: const Color(0xFFDDF1F2),
                      backgroundColor: Colors.white,
                      labelStyle: TextStyle(
                        color: _categoryFilter == category
                            ? ACLCColors.teal
                            : ACLCColors.muted,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                      ),
                      side: BorderSide(
                        color: _categoryFilter == category
                            ? const Color(0xFFB9DFE1)
                            : const Color(0xFFDCE7EC),
                      ),
                      showCheckmark: false,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 9, 20, 5),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${books.length} ${books.length == 1 ? 'title' : 'titles'}',
                  style: const TextStyle(
                    color: ACLCColors.navy,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (_loading)
                const SizedBox(
                  width: 15,
                  height: 15,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: ACLCColors.teal,
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            child: _loading && _books.isEmpty
                ? const Center(
                    key: ValueKey('catalog-loading'),
                    child: CircularProgressIndicator(color: ACLCColors.teal),
                  )
                : books.isEmpty
                ? ListView(
                    key: const ValueKey('catalog-empty'),
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 22),
                    children: [
                      _emptyCard(
                        Icons.auto_stories_outlined,
                        _books.isEmpty ? 'No books found' : 'No matching books',
                        _books.isEmpty
                            ? 'Try another title, author or ISBN.'
                            : 'Change a filter or search another part of the catalog.',
                      ),
                      if (_books.isNotEmpty)
                        Center(
                          child: TextButton.icon(
                            onPressed: () => setState(() {
                              _availabilityFilter = 'All books';
                              _categoryFilter = 'All categories';
                            }),
                            icon: const Icon(Icons.filter_alt_off_rounded),
                            label: const Text('Clear filters'),
                          ),
                        ),
                    ],
                  )
                : ListView.separated(
                    key: const ValueKey('catalog-books'),
                    padding: const EdgeInsets.fromLTRB(16, 6, 16, 22),
                    itemCount: books.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (_, index) =>
                        _bookTile(books[index], index: index),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _catalogBanner(bool staffCanManage) => ClipRRect(
    borderRadius: BorderRadius.circular(23),
    child: Container(
      height: 142,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [ACLCColors.navy, ACLCColors.teal],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -34,
            top: -48,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: .1),
                  width: 20,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 17, 17, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.local_library_rounded,
                      color: Color(0xFFFFC24A),
                      size: 19,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      staffCanManage
                          ? 'LIBRARY CATALOG'
                          : 'ACLC MANDAUE COLLEGE',
                      style: const TextStyle(
                        color: Color(0xFFD5E8EF),
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.35,
                      ),
                    ),
                    const Spacer(),
                    if (staffCanManage)
                      FilledButton.icon(
                        onPressed: _busy ? null : _showAddBook,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFFFB52E),
                          foregroundColor: ACLCColors.navy,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 11,
                            vertical: 9,
                          ),
                          textStyle: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        icon: const Icon(Icons.add_rounded, size: 17),
                        label: const Text('Add book'),
                      ),
                  ],
                ),
                const Spacer(),
                Text(
                  'Find your next read',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -.35,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _isMember
                      ? 'Explore the collection and reserve a copy.'
                      : 'Browse titles and check copy availability.',
                  style: const TextStyle(
                    color: Color(0xFFDCEAF0),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _bookTile(dynamic book, {int index = 0}) {
    final available = (book['available_copies'] as num? ?? 0).toInt();
    final total = (book['total_copies'] as num? ?? 0).toInt();
    final title = '${book['title'] ?? 'Untitled'}';
    final category = '${book['category'] ?? 'General collection'}';
    final coverPalette = const [
      [Color(0xFF123B56), Color(0xFF16798A)],
      [Color(0xFF5A476F), Color(0xFFB26B69)],
      [Color(0xFF325E55), Color(0xFF8BAA73)],
      [Color(0xFF76502C), Color(0xFFD39A43)],
      [Color(0xFF354875), Color(0xFF718BC4)],
    ];
    final coverColors =
        coverPalette[title.hashCode.abs() % coverPalette.length];
    return TweenAnimationBuilder<double>(
      key: ValueKey('book-${book['id']}'),
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 300 + (index.clamp(0, 8) * 35)),
      curve: Curves.easeOutCubic,
      builder: (context, progress, child) => Opacity(
        opacity: progress,
        child: Transform.translate(
          offset: Offset(0, (1 - progress) * 12),
          child: child,
        ),
      ),
      child: Card(
        clipBehavior: Clip.antiAlias,
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFE1E9ED)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 82,
                height: 116,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: coverColors,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x2010344A),
                      blurRadius: 10,
                      offset: Offset(0, 5),
                    ),
                  ],
                ),
                child: Stack(
                  children: [
                    if ('${book['cover_url'] ?? ''}'.startsWith('https://'))
                      Positioned.fill(
                        child: Image.network(
                          '${book['cover_url']}',
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: .08),
                              Colors.black.withValues(alpha: .62),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      top: 0,
                      bottom: 0,
                      child: Container(
                        width: 7,
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: .16),
                          borderRadius: const BorderRadius.horizontal(
                            left: Radius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      right: -20,
                      top: -18,
                      child: Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white.withValues(alpha: .15),
                            width: 9,
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(13, 12, 8, 9),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.auto_stories_rounded,
                            color: Color(0xFFFFC24A),
                            size: 20,
                          ),
                          const Spacer(),
                          Text(
                            category.toUpperCase(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 8,
                              height: 1.2,
                              fontWeight: FontWeight.w800,
                              letterSpacing: .6,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            width: 28,
                            height: 2,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFC24A),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: ACLCColors.navy,
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                              height: 1.18,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'by ${book['author'] ?? 'Unknown author'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: ACLCColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 13),
                    Row(
                      children: [
                        Icon(
                          available > 0
                              ? Icons.check_circle_rounded
                              : Icons.schedule_rounded,
                          size: 15,
                          color: available > 0
                              ? const Color(0xFF31815E)
                              : const Color(0xFFB46D30),
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            available > 0
                                ? 'Available now'
                                : 'Currently checked out',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: available > 0
                                  ? const Color(0xFF26724F)
                                  : const Color(0xFF9B5D26),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        Text(
                          '$available / $total copies',
                          style: const TextStyle(
                            color: ACLCColors.muted,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: LinearProgressIndicator(
                        value: total <= 0 ? 0 : (available / total).clamp(0, 1),
                        minHeight: 5,
                        backgroundColor: const Color(0xFFEAF0F2),
                        color: available > 0
                            ? const Color(0xFF35A278)
                            : const Color(0xFFE3A33A),
                      ),
                    ),
                    if (_isMember) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: available > 0
                              ? () => _reserve(book)
                              : null,
                          style: TextButton.styleFrom(
                            foregroundColor: ACLCColors.teal,
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            textStyle: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          icon: const Icon(
                            Icons.bookmark_add_rounded,
                            size: 16,
                          ),
                          label: const Text('Reserve a copy'),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tinyTag(String label, {bool positive = false}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
    decoration: BoxDecoration(
      color: positive ? const Color(0xFFE6F4ED) : const Color(0xFFEEF3F6),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: positive ? const Color(0xFF257151) : ACLCColors.muted,
        fontSize: 10,
        fontWeight: FontWeight.w700,
      ),
    ),
  );

  Widget _qrPage() {
    final credential = '${_credential['credential'] ?? ''}';
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        _sectionTitle(
          'Your campus library ID',
          'Present this QR at the library access point',
        ),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [ACLCColors.navy, ACLCColors.teal],
                    ),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Colors.white,
                        child: Text(
                          '${_user['name'] ?? 'A'}'.characters.first
                              .toUpperCase(),
                          style: const TextStyle(
                            color: ACLCColors.navy,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${_user['name'] ?? 'Library member'}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              '${_user['digital_id'] ?? _credential['digitalId'] ?? 'Digital ID pending'}',
                              style: const TextStyle(
                                color: Color(0xFFD5EAF0),
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                if (credential.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE5EDF2)),
                    ),
                    child: QrImageView(
                      data: jsonEncode({
                        'credential': credential,
                        'type': 'personal',
                      }),
                      size: 220,
                      backgroundColor: Colors.white,
                    ),
                  )
                else
                  _emptyCard(
                    Icons.qr_code_2_rounded,
                    'QR not available',
                    'Your administrator will issue a digital ID after approval.',
                  ),
                const SizedBox(height: 12),
                const Text(
                  'Keep your personal QR private. It is linked to your ACLC library account.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: ACLCColors.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed:
                      _busy || (_user['replacement_count'] as num? ?? 0) >= 1
                      ? null
                      : () async {
                          final yes = await showDialog<bool>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text('Replace lost QR?'),
                              content: const Text(
                                'Your current QR will stop working. You can replace it once without administrator help.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.pop(context, false),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(context, true),
                                  child: const Text('Replace QR'),
                                ),
                              ],
                            ),
                          );
                          if (yes == true) {
                            await _action(
                              () =>
                                  Api.post('/credentials/disable-replace', {}),
                              'Your old QR was disabled and replaced.',
                            );
                          }
                        },
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Replace a lost QR'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _activityPage() {
    final rows = [
      ..._loans.map((e) => {..._map(e), '_kind': 'loan'}),
      ..._reservations.map((e) => {..._map(e), '_kind': 'reservation'}),
    ]..sort((a, b) => '${b['created_at']}'.compareTo('${a['created_at']}'));
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
      children: [
        _sectionTitle(
          'My library activity',
          'Borrowing and reservation history',
        ),
        const SizedBox(height: 12),
        if (rows.isEmpty)
          _emptyCard(
            Icons.history_rounded,
            'Your history starts here',
            'Reserve a book or visit the library desk to borrow one.',
          ),
        ...rows.map((row) {
          final loan = row['_kind'] == 'loan';
          return Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: loan
                    ? const Color(0xFFE5F1F8)
                    : const Color(0xFFE7F5F3),
                foregroundColor: ACLCColors.teal,
                child: Icon(
                  loan ? Icons.menu_book_rounded : Icons.bookmark_added_rounded,
                ),
              ),
              title: Text(
                '${row['title'] ?? (loan ? 'Library loan' : 'Reservation')}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${loan ? row['item_status'] ?? row['status'] : row['status']}${row['due_at'] == null ? '' : ' · Due ${'${row['due_at']}'.split('T').first}'}',
              ),
              trailing:
                  loan &&
                      row['item_status'] == 'borrowed' &&
                      row['loan_verification_token'] != null
                  ? IconButton.filledTonal(
                      tooltip: 'Show borrowing pass',
                      onPressed: () => _showLoanQr(row),
                      icon: const Icon(Icons.qr_code_2_rounded),
                    )
                  : !loan && ['pending', 'ready'].contains(row['status'])
                  ? IconButton(
                      tooltip: 'Cancel reservation',
                      onPressed: () => _action(
                        () => Api.post('/reservations/${row['id']}/cancel', {}),
                        'Reservation cancelled.',
                      ),
                      icon: const Icon(Icons.close_rounded),
                    )
                  : null,
            ),
          );
        }),
      ],
    );
  }

  Widget _liraPage() => Column(
    children: [
      Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(14, 8, 14, 8),
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [ACLCColors.navy, ACLCColors.teal],
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: Colors.white,
              foregroundColor: ACLCColors.teal,
              child: Icon(Icons.auto_awesome_rounded),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Ask LIRA',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    _liraStatus['ai_configured'] == true
                        ? 'AI assistant · ACLC library support'
                        : 'Library assistant · ACLC resources',
                    style: const TextStyle(
                      color: Color(0xFFD5EAF0),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      Expanded(
        child: _liraMessages.isEmpty
            ? Center(
                child: _emptyCard(
                  Icons.chat_bubble_outline_rounded,
                  'How can I help?',
                  'Ask about books, reservations, your account, or library services.',
                ),
              )
            : ListView.builder(
                controller: _liraScroll,
                padding: const EdgeInsets.all(14),
                itemCount: _liraMessages.length,
                itemBuilder: (_, index) {
                  final item = _map(_liraMessages[index]);
                  final mine = item['sender'] == 'user';
                  return Align(
                    alignment: mine
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 320),
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: mine
                            ? ACLCColors.navy
                            : Theme.of(context).cardColor,
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(16),
                          topRight: const Radius.circular(16),
                          bottomLeft: Radius.circular(mine ? 16 : 4),
                          bottomRight: Radius.circular(mine ? 4 : 16),
                        ),
                      ),
                      child: Text(
                        '${item['message'] ?? ''}',
                        style: TextStyle(
                          color: mine
                              ? Colors.white
                              : Theme.of(context).colorScheme.onSurface,
                          height: 1.4,
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _liraController,
                  maxLength: 500,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendLira(),
                  decoration: const InputDecoration(
                    counterText: '',
                    hintText: 'Ask LIRA about your library',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _busy ? null : _sendLira,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.arrow_upward_rounded),
              ),
            ],
          ),
        ),
      ),
    ],
  );

  Widget _accountsPage() {
    final roles = ['student', 'teacher', 'librarian'];
    final current = roles[(_accountsRoleIndex).clamp(0, 2)];
    final source = _accountsShowArchive ? _archivedMembers : _members;
    final accounts = source.where((e) => e['role'] == current).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 2),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Register a campus member',
                    style: TextStyle(
                      color: ACLCColors.navy,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Create an approved student, teacher, or librarian account. The person can sign in as soon as it is created.',
                    style: TextStyle(color: ACLCColors.muted, height: 1.35),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _showCreateAccount,
                      icon: const Icon(Icons.person_add_alt_1_rounded),
                      label: const Text('Create account'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 6),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'student', label: Text('Students')),
              ButtonSegment(value: 'teacher', label: Text('Teachers')),
              ButtonSegment(value: 'librarian', label: Text('Librarians')),
            ],
            selected: {current},
            onSelectionChanged: (value) =>
                setState(() => _accountsRoleIndex = roles.indexOf(value.first)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
          child: SegmentedButton<bool>(
            segments: const [
              ButtonSegment(
                value: false,
                icon: Icon(Icons.people_alt_outlined),
                label: Text('Active'),
              ),
              ButtonSegment(
                value: true,
                icon: Icon(Icons.archive_outlined),
                label: Text('Archive'),
              ),
            ],
            selected: {_accountsShowArchive},
            onSelectionChanged: (value) =>
                setState(() => _accountsShowArchive = value.first),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            children: [
              if (!_accountsShowArchive && _pending.isNotEmpty) ...[
                _sectionTitle(
                  'Applications waiting',
                  '${_pending.length} need a decision',
                ),
                const SizedBox(height: 8),
                ..._pending
                    .where((e) => e['role'] == current)
                    .map(_applicationTile),
                const SizedBox(height: 14),
              ],
              _sectionTitle(
                _accountsShowArchive
                    ? 'Archived $current accounts'
                    : '$current accounts',
                _accountsShowArchive
                    ? '${accounts.where((e) => e['is_deleted'] != 1).length} restorable · ${accounts.where((e) => e['is_deleted'] == 1).length} deleted'
                    : '${accounts.length} registered',
              ),
              const SizedBox(height: 8),
              if (accounts.isEmpty)
                _emptyCard(
                  Icons.groups_outlined,
                  _accountsShowArchive
                      ? 'No archived $current accounts'
                      : 'No $current accounts',
                  _accountsShowArchive
                      ? 'Accounts you archive will appear here.'
                      : 'Accounts appear here after registration.',
                ),
              ...accounts.map(
                (member) => Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: ListTile(
                      onTap: !_accountsShowArchive && current == 'student'
                          ? () => _showStudentHistory(member)
                          : null,
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFFE7F5F3),
                        foregroundColor: ACLCColors.teal,
                        child: Text(
                          '${member['name'] ?? 'A'}'.characters.first
                              .toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      title: Text(
                        '${member['name'] ?? 'Unnamed account'}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${member['email'] ?? ''}\n${_accountsShowArchive && member['is_deleted'] == 1 ? 'Personal details deleted - history retained' : '${member['status'] ?? ''} - ${member['school_number'] ?? member['digital_id'] ?? 'No ID'}'}${!_accountsShowArchive && current == 'student' ? '\nTap to view borrowing history' : ''}',
                      ),
                      isThreeLine: _accountsShowArchive || current == 'student',
                      trailing: PopupMenuButton<String>(
                        tooltip: 'Account actions',
                        onSelected: (action) {
                          if (action == 'remove') _removeMember(member);
                          if (action == 'restore') _restoreMember(member);
                          if (action == 'delete') _deleteArchivedMember(member);
                        },
                        itemBuilder: (_) => _accountsShowArchive
                            ? [
                                if (member['is_deleted'] != 1)
                                  const PopupMenuItem(
                                    value: 'restore',
                                    child: Text('Restore account'),
                                  ),
                                if (member['is_deleted'] != 1)
                                  const PopupMenuItem(
                                    value: 'delete',
                                    child: Text(
                                      'Permanently delete personal details',
                                    ),
                                  ),
                              ]
                            : const [
                                PopupMenuItem(
                                  value: 'remove',
                                  child: Text('Archive account'),
                                ),
                              ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  int _accountsRoleIndex = 0;
  bool _accountsShowArchive = false;

  Widget _applicationTile(dynamic applicant) {
    final role = '${applicant['role'] ?? ''}';
    final details = <String>[
      if (role == 'student' && '${applicant['school_number'] ?? ''}'.isNotEmpty)
        'Student ID ${applicant['school_number']}',
      if (role == 'student' && '${applicant['program'] ?? ''}'.isNotEmpty)
        '${applicant['program']}',
      if (role == 'student' && '${applicant['year_level'] ?? ''}'.isNotEmpty)
        '${applicant['year_level']} year',
      if (role != 'student' &&
          '${applicant['employee_number'] ?? ''}'.isNotEmpty)
        'Employee ID ${applicant['employee_number']}',
      if ('${applicant['department'] ?? ''}'.isNotEmpty)
        '${applicant['department']}',
    ];
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: const BoxDecoration(
          border: Border(left: BorderSide(color: ACLCColors.gold, width: 4)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.person_add_alt_1_rounded,
                    color: ACLCColors.teal,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${applicant['name'] ?? 'Applicant'}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        Text(
                          '${applicant['email'] ?? ''} · ${applicant['role'] ?? ''}',
                          style: const TextStyle(
                            color: ACLCColors.muted,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 11),
              if (details.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 11,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F6F8),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Text(
                    details.join('  ·  '),
                    style: const TextStyle(
                      fontSize: 11,
                      color: ACLCColors.navy,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 11),
              ],
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => _approve(applicant, false),
                      child: const Text('Decline'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _approve(applicant, true),
                      child: const Text('Approve'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _circulationPage() => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 24),
      children: [
        _sectionTitle('Circulation desk', 'Issue and receive library books'),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _busy ? null : _circulate,
          icon: const Icon(Icons.add_card_rounded),
          label: const Text('Check out a book'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _scanLoanQr,
          icon: const Icon(Icons.qr_code_scanner_rounded),
          label: const Text('Verify student borrowing QR'),
        ),
        const SizedBox(height: 18),
        _sectionTitle('Currently borrowed', '${_loans.length} active copies'),
        const SizedBox(height: 8),
        if (_loans.isEmpty)
          _emptyCard(
            Icons.inventory_2_outlined,
            'No active checkouts',
            'Checked-out books will appear here.',
          ),
        ..._loans.map(
          (loan) => Card(
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFFFF1DA),
                foregroundColor: ACLCColors.navy,
                child: Icon(Icons.menu_book_rounded),
              ),
              title: Text(
                '${loan['title'] ?? 'Book'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${loan['name'] ?? loan['borrower_name'] ?? 'Member'} · ${loan['copy_code'] ?? ''}\nDue ${'${loan['due_at'] ?? ''}'.split('T').first}',
              ),
              isThreeLine: true,
              trailing: IconButton(
                tooltip: 'Record return',
                onPressed: _busy ? null : () => _returnBook(loan),
                icon: const Icon(
                  Icons.assignment_return_rounded,
                  color: ACLCColors.teal,
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );

  Widget _requestsPage() {
    final requests = _reservations
        .where((r) => ['pending', 'ready', 'approved'].contains(r['status']))
        .toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 24),
        children: [
          _sectionTitle('Reservation desk', 'Review member requests'),
          const SizedBox(height: 9),
          if (requests.isEmpty)
            _emptyCard(
              Icons.bookmark_border_rounded,
              'The request queue is clear',
              'New book reservations will appear here.',
            ),
          ...requests.map(
            (item) => Card(
              child: Padding(
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['title'] ?? 'Book reservation'}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${item['borrower_name'] ?? 'Member'} · ${item['borrower_role'] ?? ''}',
                      style: const TextStyle(
                        color: ACLCColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _tinyTag('${item['status']}'),
                        const Spacer(),
                        if (item['status'] == 'pending')
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => _updateReservation(item, 'cancelled'),
                            child: const Text('Decline'),
                          ),
                        if (item['status'] == 'pending')
                          FilledButton(
                            onPressed: _busy
                                ? null
                                : () => _updateReservation(item, 'ready'),
                            child: const Text('Mark ready'),
                          ),
                      ],
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

  Widget _operationsPage() => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 26),
      children: [
        _sectionTitle('Campus operations', 'ACLC library systems and activity'),
        const SizedBox(height: 12),
        if (_role == 'administrator') ...[
          _metricGrid([
            _MetricData(
              'Overdue',
              '${_summary['overdueBooks'] ?? 0}',
              Icons.event_busy_rounded,
              const Color(0xFFFFF1DA),
            ),
            _MetricData(
              'Damages',
              '${_summary['damageCases'] ?? 0}',
              Icons.report_problem_outlined,
              const Color(0xFFFCEAEA),
            ),
            _MetricData(
              'Penalties',
              '${_summary['unpaidPenalties'] ?? 0}',
              Icons.payments_outlined,
              const Color(0xFFEDEBFA),
            ),
            _MetricData(
              'Reservations',
              '${_summary['reservations'] ?? 0}',
              Icons.bookmark_added_rounded,
              const Color(0xFFE7F5F3),
            ),
          ]),
          const SizedBox(height: 18),
          _sectionTitle(
            'Mobile app release',
            'Publish through Google Play Console',
          ),
          const SizedBox(height: 8),
          const Card(
            child: ListTile(
              leading: Icon(
                Icons.verified_user_outlined,
                color: ACLCColors.teal,
              ),
              title: Text('Play-managed app updates'),
              subtitle: Text(
                'Upload signed app bundles to a Play Console testing or release track. Google Play distributes and installs official updates.',
              ),
            ),
          ),
          const SizedBox(height: 18),
        ],
        _sectionTitle('Access points', 'Gate service status'),
        const SizedBox(height: 8),
        if (_gates.isEmpty)
          _emptyCard(
            Icons.sensors_off_rounded,
            'No access points found',
            'Connect a library gate to see status here.',
          ),
        ..._gates.map(_gateTile),
        const SizedBox(height: 18),
        _sectionTitle('Quick tasks', 'Common library actions'),
        const SizedBox(height: 8),
        _queueCard(
          'Add a new book',
          'Update the campus collection',
          Icons.add_box_rounded,
          _showAddBook,
        ),
        _queueCard(
          'Open circulation desk',
          'Check out and return books',
          Icons.swap_horiz_rounded,
          () {
            final destination = _destinations.indexWhere(
              (item) => item.label == 'Circulation',
            );
            if (destination >= 0) {
              setState(() => _selected = destination);
            }
          },
        ),
        if (_role == 'administrator')
          _queueCard(
            'Review applications',
            '${_pending.length} waiting for a decision',
            Icons.how_to_reg_rounded,
            () => setState(() => _selected = 1),
          ),
      ],
    ),
  );

  Widget _gateTile(dynamic gate) {
    final online = gate['status'] == 'online';
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: online
              ? const Color(0xFFE6F4ED)
              : const Color(0xFFFCEAEA),
          foregroundColor: online
              ? const Color(0xFF257151)
              : const Color(0xFFA13A3A),
          child: Icon(
            online ? Icons.sensors_rounded : Icons.sensors_off_rounded,
          ),
        ),
        title: Text(
          '${gate['gate_id'] ?? 'Library gate'}',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          '${gate['direction'] ?? 'Campus access'} · ${gate['last_event_at'] ?? 'No recent activity'}',
        ),
        trailing: _tinyTag(
          online ? 'Online' : '${gate['status'] ?? 'Offline'}',
          positive: online,
        ),
      ),
    );
  }

  Widget _emptyCard(IconData icon, String title, String description) => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 26),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFFEAF3F6),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: ACLCColors.teal, size: 27),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: ACLCColors.muted,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ],
      ),
    ),
  );
}

class _DashboardDestination {
  const _DashboardDestination(this.label, this.icon);
  final String label;
  final IconData icon;
}

class _MetricData {
  const _MetricData(this.label, this.value, this.icon, this.tint);
  final String label;
  final String value;
  final IconData icon;
  final Color tint;
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.data, required this.delay});
  final _MetricData data;
  final int delay;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: Duration(milliseconds: 420 + delay),
    curve: Curves.easeOutCubic,
    builder: (context, value, child) => Opacity(
      opacity: value,
      child: Transform.translate(
        offset: Offset(0, 12 * (1 - value)),
        child: child,
      ),
    ),
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: data.tint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(data.icon, size: 19, color: ACLCColors.teal),
            ),
            const SizedBox(height: 10),
            Text(
              data.value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: ACLCColors.navy,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              data.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: ACLCColors.muted,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
