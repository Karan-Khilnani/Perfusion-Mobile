const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

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