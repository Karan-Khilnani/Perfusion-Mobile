const fs = require("node:fs");
const path = require("node:path");
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainActivity,
} = require("expo/config-plugins");

// The installed Stream SDK has the JS enterPiPAndroid helper and PiP callbacks,
// but does not expose the enterPipMode native method that its JS helper calls.
// Patch that missing bridge during prebuild rather than adding a second SDK.
module.exports = function withCallPiP(config) {
  config = withAndroidManifest(config, (updated) => {
    const activities = updated.modResults.manifest.application?.[0]?.activity || [];
    const main = activities.find((activity) =>
      [".MainActivity", "com.perfusion.mobile.MainActivity"].includes(activity.$?.["android:name"])
    );
    if (!main) {
      throw new Error("Cannot enable call PiP: Android MainActivity was not found");
    }

    main.$["android:supportsPictureInPicture"] = "true";
    main.$["android:resizeableActivity"] = "true";
    const changes = new Set((main.$["android:configChanges"] || "").split("|").filter(Boolean));
    for (const change of ["screenSize", "smallestScreenSize", "screenLayout", "orientation"]) {
      changes.add(change);
    }
    main.$["android:configChanges"] = [...changes].join("|");
    return updated;
  });

  config = withMainActivity(config, (updated) => {
    const marker = "// Perfusion: Home-to-PiP on Android 8–11";
    let source = updated.modResults.contents;
    if (updated.modResults.language !== "kt") {
      throw new Error("Cannot enable call PiP: MainActivity must use Kotlin");
    }

    const streamImport = "import com.streamvideo.reactnative.StreamVideoReactNative";
    if (!source.split(/\r?\n/).includes(streamImport)) {
      const packageDeclaration = /^package [^\r\n]+(?:\r?\n)/m;
      if (!packageDeclaration.test(source)) {
        throw new Error("Cannot enable call PiP: MainActivity package declaration was not found");
      }
      // Stream's config plugin skips this import when it sees the fully-qualified
      // reference below, but also adds an unqualified lifecycle callback.
      source = source.replace(packageDeclaration, (declaration) => `${declaration}${streamImport}\n`);
    }
    updated.modResults.contents = source;
    if (source.includes(marker)) return updated;
    if (source.includes("override fun onUserLeaveHint")) {
      throw new Error("Cannot enable call PiP: MainActivity leave-hint implementation changed");
    }
    const end = source.lastIndexOf("\n}");
    if (end < 0) throw new Error("Cannot enable call PiP: MainActivity class boundary missing");
    updated.modResults.contents = source.slice(0, end) + `
    ${marker}
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O &&
            android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S &&
            com.streamvideo.reactnative.StreamVideoReactNative.canAutoEnterPictureInPictureMode &&
            packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            try {
                enterPictureInPictureMode(
                    android.app.PictureInPictureParams.Builder()
                        .setAspectRatio(android.util.Rational(9, 16)).build()
                )
            } catch (error: Exception) {
                android.util.Log.w("PerfusionCall", "Could not enter call PiP", error)
            }
        }
    }
` + source.slice(end);
    return updated;
  });

  config = withAppBuildGradle(config, (updated) => {
    const dependency = "implementation project(':stream-io_video-react-native-sdk')";
    const source = updated.modResults.contents;
    if (source.includes(dependency)) return updated;
    const dependenciesBlock = /dependencies\s*\{/;
    if (!dependenciesBlock.test(source)) {
      throw new Error("Cannot enable call PiP: Android app dependencies block was not found");
    }
    // MainActivity calls the SDK's public Kotlin singleton directly. Explicitly
    // put the autolinked SDK project on the app compile classpath for EAS builds.
    updated.modResults.contents = source.replace(
      dependenciesBlock,
      (match) => `${match}\n    // Perfusion: MainActivity uses Stream's native PiP API\n    ${dependency}`,
    );
    return updated;
  });

  return withDangerousMod(config, ["android", (updated) => {
    const sdkRoot = path.dirname(require.resolve(
      "@stream-io/video-react-native-sdk/app.plugin.js",
      { paths: [updated.modRequest.projectRoot] }
    ));
    const modulePath = path.join(
      sdkRoot,
      "android/src/main/java/com/streamvideo/reactnative/StreamVideoReactNativeModule.kt"
    );
    let source = fs.readFileSync(modulePath, "utf8");
    if (!source.includes("fun enterPipMode(width: Int, height: Int, promise: Promise)")) {
      const anchor = "    @ReactMethod\n    fun exitPipMode(promise: Promise)";
      if (!source.includes(anchor)) {
        throw new Error("Cannot enable call PiP: Stream native bridge changed");
      }
      source = source.replace(anchor, `    @ReactMethod
    fun enterPipMode(width: Int, height: Int, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity == null ||
            !activity.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                val aspect = android.util.Rational(
                    if (width > 0) width else 9,
                    if (height > 0) height else 16
                )
                val params = android.app.PictureInPictureParams.Builder()
                    .setAspectRatio(aspect)
                    .build()
                promise.resolve(activity.enterPictureInPictureMode(params))
            } catch (error: Exception) {
                promise.reject("PIP_UNAVAILABLE", error)
            }
        }
    }

${anchor}`);
      fs.writeFileSync(modulePath, source);
    }
    return updated;
  }]);
};