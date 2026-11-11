package com.aclc.aclc_library_mobile

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.aclc.smart_library/app_update")
            .setMethodCallHandler { call, result ->
                if (call.method == "getThemeMode") {
                    result.success(getSharedPreferences("aclc_preferences", MODE_PRIVATE).getString("theme_mode", "light"))
                    return@setMethodCallHandler
                }
                if (call.method == "setThemeMode") {
                    val mode = call.argument<String>("mode")
                    if (mode != "light" && mode != "dark") {
                        result.error("INVALID_THEME", "Theme must be light or dark.", null)
                    } else {
                        getSharedPreferences("aclc_preferences", MODE_PRIVATE).edit().putString("theme_mode", mode).apply()
                        result.success(true)
                    }
                    return@setMethodCallHandler
                }
                if (call.method != "openPlayStore") { result.notImplemented(); return@setMethodCallHandler }
                val storeUri = Uri.parse("market://details?id=$packageName")
                val storeIntent = Intent(Intent.ACTION_VIEW, storeUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    startActivity(storeIntent)
                    result.success(true)
                } catch (_: android.content.ActivityNotFoundException) {
                    try {
                        val webUri = Uri.parse("https://play.google.com/store/apps/details?id=$packageName")
                        startActivity(Intent(Intent.ACTION_VIEW, webUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        result.success(true)
                    } catch (error: Exception) {
                        result.error("STORE_UNAVAILABLE", error.message, null)
                    }
                }
            }
    }
}
