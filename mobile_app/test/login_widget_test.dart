// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:aclc_library_mobile/main.dart';

void main() {
  testWidgets('ACLC mobile login renders', (WidgetTester tester) async {
    await tester.pumpWidget(const ACLCLibraryApp());
    expect(find.text('ACLC COLLEGE'), findsOneWidget);
    expect(find.text('Smart Library'), findsOneWidget);
    expect(find.text('MANDAUE CITY CAMPUS'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Production server not configured'), findsOneWidget);
    expect(
      find.textContaining('No USB cable or laptop server is needed.'),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Check connection'));
    await tester.pump();
    expect(find.text('Production server not configured'), findsOneWidget);
  });
}
