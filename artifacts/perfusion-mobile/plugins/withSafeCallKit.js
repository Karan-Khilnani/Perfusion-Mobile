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

      // Android 14+ may downgrade a full-screen call to a banner when the user
      // has disabled full-screen intent access. Expose the OS status/settings
      // without changing the existing Telecom incoming-call presentation.
      replaceExactlyOnce(
        path.join(javaDir, "ExpoCallKitTelecomModule.kt"),
        `        Name("ExpoCallKitTelecom")

        // region Events`,
        `        Name("ExpoCallKitTelecom")

        Function("canUseFullScreenIntent") {
            val context = appContext.reactContext ?: return@Function false
            if (android.os.Build.VERSION.SDK_INT < 34) return@Function true
            val manager = context.getSystemService(android.app.NotificationManager::class.java)
            manager?.canUseFullScreenIntent() ?: false
        }

        Function("openFullScreenIntentSettings") {
            val context = appContext.reactContext ?: return@Function false
            if (android.os.Build.VERSION.SDK_INT < 34) return@Function true
            val intent = android.content.Intent(
                "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
            ).apply {
                data = android.net.Uri.parse("package:\${context.packageName}")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
                true
            } catch (_: Exception) {
                false
            }
        }

        // region Events`,
      );

      const callManagerFile = path.join(javaDir, "managers/CallManager.kt");
      replaceExactlyOnce(
        callManagerFile,
        `    /** Reports externally-ended call with explicit reason (\`onCallReportedEnded\` path). */`,
        `    /**
     * Ends only the native call matching the server-owned booking and generation.
     *
     * The generated Telecom UUID is deliberately resolved from the stored call session; a delayed
     * terminal push can never end a newer call for the same booking.
     */
    fun reportCallEndedIfMatches(bookingId: String, sessionGeneration: String): Boolean {
        if (bookingId.isBlank() || sessionGeneration.isBlank()) return false

        val matchingSession = CallStore.allSessions().firstOrNull { session ->
            val metadata = session.incomingCallEvent?.metadata ?: return@firstOrNull false
            metadata["bookingId"] == bookingId &&
                metadata["sessionGeneration"] == sessionGeneration
        } ?: return false

        reportCallEnded(matchingSession.id, CallEndedReason.REMOTE_ENDED)
        return true
    }

    /** Reports externally-ended call with explicit reason (\`onCallReportedEnded\` path). */`,
      );

      const messagingServiceFile = path.join(
        javaDir,
        "services/ExpoCallKitTelecomMessagingService.kt",
      );
      replaceExactlyOnce(
        messagingServiceFile,
        `        private val MESSAGE_TYPE_INCOMING_CALL = setOf("incomingCall", "incoming_call")
        private val KEYS_INCOMING_CALL = listOf("incomingCall", "incoming_call")
        private const val DEDUP_WINDOW_MS = 120_000L`,
        `        private val MESSAGE_TYPE_INCOMING_CALL = setOf("incomingCall", "incoming_call")
        private val KEYS_INCOMING_CALL = listOf("incomingCall", "incoming_call")
        private val MESSAGE_TYPE_CALL_ENDED = setOf("callEnded", "call_ended")
        private val KEYS_CALL_ENDED = listOf("callEnded", "call_ended")
        private const val DEDUP_WINDOW_MS = 120_000L`,
      );
      replaceExactlyOnce(
        messagingServiceFile,
        `        val data = message.data

        // Try to parse as an incoming call payload.`,
        `        val data = message.data

        // Terminal call-control messages are consumed here rather than delegated to Expo
        // Notifications, so they can clear Telecom even while the React Native process is stopped.
        if (data[KEY_MESSAGE_TYPE] in MESSAGE_TYPE_CALL_ENDED) {
            val terminalCall = parseCallEndedEvent(data)
            if (terminalCall == null) {
                Log.w(TAG, "Dropping malformed native call-ended push")
                return
            }
            Handler(Looper.getMainLooper()).post {
                processCallEnded(terminalCall.first, terminalCall.second)
            }
            return
        }

        // Try to parse as an incoming call payload.`,
      );
      replaceExactlyOnce(
        messagingServiceFile,
        `    private fun parseIncomingCallEvent(data: Map<String, String>): Map<String, Any?>? {`,
        `    private fun processCallEnded(bookingId: String, sessionGeneration: String) {
        try {
            CallManager.shared.initialize(applicationContext)
            if (CallManager.shared.reportCallEndedIfMatches(bookingId, sessionGeneration)) {
                Log.i(TAG, "Ended the matching native call session")
            } else {
                Log.d(TAG, "Ignoring stale or unmatched native call-ended push")
            }
        } catch (error: Throwable) {
            Log.e(TAG, "Failed to process native call-ended push", error)
        }
    }

    private fun parseCallEndedEvent(data: Map<String, String>): Pair<String, String>? {
        if (data[KEY_MESSAGE_TYPE] !in MESSAGE_TYPE_CALL_ENDED) return null
        val nestedPayload = KEYS_CALL_ENDED.firstNotNullOfOrNull { data[it] } ?: return null

        return try {
            val payload = JSONObject(nestedPayload)
            val bookingId = payload.opt("bookingId") as? String ?: return null
            val sessionGeneration = payload.opt("sessionGeneration") as? String ?: return null
            if (
                bookingId.isBlank() ||
                sessionGeneration.isBlank() ||
                bookingId.length > 128 ||
                sessionGeneration.length > 128
            ) {
                return null
            }
            bookingId to sessionGeneration
        } catch (error: Throwable) {
            Log.w(TAG, "Failed to parse native call-ended JSON payload", error)
            null
        }
    }

    private fun parseIncomingCallEvent(data: Map<String, String>): Map<String, Any?>? {`,
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