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

      // The native incoming-call screen runs without JS when the app is closed.
      // Use the authenticated server's patient label instead of a generic subtitle.
      replaceExactlyOnce(
        path.join(javaDir, "IncomingCallActivity.kt"),
        `        bindCallerInfo(caller?.displayName, session.options.hasVideo)`,
        `        bindCallerInfo(
            caller?.displayName,
            session.incomingCallEvent?.metadata?.get("patientName") as? String,
            session.options.hasVideo,
        )`,
      );
      replaceExactlyOnce(
        path.join(javaDir, "IncomingCallActivity.kt"),
        `    private fun bindCallerInfo(displayName: String?, hasVideo: Boolean) {`,
        `    private fun bindCallerInfo(displayName: String?, patientName: String?, hasVideo: Boolean) {`,
      );
      replaceExactlyOnce(
        path.join(javaDir, "IncomingCallActivity.kt"),
        `        findViewById<TextView>(R.id.expo_callkit_telecom_subtitle).text =
            if (hasVideo) "Incoming video call" else "Incoming call"`,
        `        findViewById<TextView>(R.id.expo_callkit_telecom_subtitle).text =
            patientName?.takeIf { it.isNotBlank() }
                ?: if (hasVideo) "Incoming video call" else "Incoming call"`,
      );
      replaceExactlyOnce(
        path.join(javaDir, "managers/CallManager.kt"),
        `            event.caller.displayName,
            event.hasVideo,
        )

        val attributes =`,
        `            event.caller.displayName,
            event.hasVideo,
            event.metadata?.get("patientName") as? String,
        )

        val attributes =`,
      );
      replaceExactlyOnce(
        path.join(javaDir, "managers/CallNotificationManager.kt"),
        `    fun showIncomingCall(context: Context, callId: UUID, callerName: String?, hasVideo: Boolean) {`,
        `    fun showIncomingCall(context: Context, callId: UUID, callerName: String?, hasVideo: Boolean, patientName: String?) {`,
      );
      replaceExactlyOnce(
        path.join(javaDir, "managers/CallNotificationManager.kt"),
        `                    if (hasVideo) "Incoming video call" else "Incoming call",
                )
                .setStyle(`,
        `                    patientName?.takeIf { it.isNotBlank() }
                        ?: if (hasVideo) "Incoming video call" else "Incoming call",
                )
                .setStyle(`,
      );
      return config;
    },
  ]);