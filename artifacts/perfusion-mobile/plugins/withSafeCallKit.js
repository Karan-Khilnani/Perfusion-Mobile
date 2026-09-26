const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");
const withCallKit = require("expo-callkit-telecom/app.plugin.js").default;

function replaceExactlyOnce(file, original, replacement) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(replacement)) return;
  if (!source.includes(original) || source.indexOf(original) !== source.lastIndexOf(original)) {
    throw new Error(`CallKit startup patch needs review: expected code not found exactly once in ${file}`);
  }
  fs.writeFileSync(file, source.replace(original, replacement));
}

module.exports = (config, options) =>
  withDangerousMod(withCallKit(config, options), [
    "android",
    (config) => {
      const moduleRoot = path.dirname(
        require.resolve("expo-callkit-telecom/app.plugin.js", {
          paths: [config.modRequest.projectRoot],
        }),
      );
      const javaDir = path.join(
        moduleRoot,
        "android/src/main/java/expo/modules/callkittelecom",
      );

      replaceExactlyOnce(
        path.join(javaDir, "managers/VoIPPushManager.kt"),
        `        FirebaseMessaging.getInstance()
            .token
            .addOnSuccessListener { newToken -> updateToken(newToken) }
            .addOnFailureListener { error ->
                Log.e(TAG, "Failed to get FCM token: \${error.message}", error)
            }`,
        `        try {
            FirebaseMessaging.getInstance()
                .token
                .addOnSuccessListener { newToken -> updateToken(newToken) }
                .addOnFailureListener { error ->
                    Log.e(TAG, "Failed to get FCM token: \${error.message}", error)
                }
        } catch (error: IllegalStateException) {
            Log.e(TAG, "FCM is not configured; incoming call push is unavailable", error)
        }`,
      );

      replaceExactlyOnce(
        path.join(javaDir, "ExpoCallKitTelecomModule.kt"),
        `            CallManager.shared.initialize(context)

            VoIPPushManager.register()`,
        `            try {
                CallManager.shared.initialize(context)
            } catch (error: Exception) {
                android.util.Log.e("ExpoCallKitTelecom", "Telecom initialization failed; native calls are unavailable", error)
                return@OnCreate
            }

            VoIPPushManager.register()`,
      );

      // CallStyle notifications normally play their channel sound only once.
      // Keep ringing while the incoming notification is active, including when JS is closed.
      replaceExactlyOnce(
        path.join(javaDir, "managers/CallNotificationManager.kt"),
        `                .setPriority(NotificationCompat.PRIORITY_MAX)
                .build()

        postNotification(ctx, callId, displayName, "incoming call")`,
        `                .setPriority(NotificationCompat.PRIORITY_MAX)
                .build()

        notification.flags = notification.flags or Notification.FLAG_INSISTENT

        postNotification(ctx, callId, displayName, "incoming call")`,
      );
      return config;
    },
  ]);