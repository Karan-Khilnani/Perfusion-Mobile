# Seeker consultation routing milestones

One shared seeker hospital account; no additional staff accounts. Providers use their own phone and do not register callback devices. Stop for review after each milestone.

- [x] **1. Seeker installation registration.** Save staff name, device name, and contact number against a persistent app installation. Prompt each new seeker installation even if the shared account already has other devices. Providers are not prompted. Development schema applied without truncating unrelated data. Mobile typecheck and API startup checked; no Expo export or device build requested.
- [x] **2. Booking assignment and shift handoff.** Seekers choose an eligible registered staff/device pair for each consultation and can change only that booking's pair as shifts change, including to another staff installation. The server validates ownership, staff name, and linked installation; mobile and web show the selected pair. Mobile typecheck passed. The web typecheck still has pre-existing errors in unrelated files; no end-to-end device test was run.
- [ ] **3. Targeted in-app ringing.** Ring only the booking's chosen seeker installation across push and live call paths; an unavailable target must not trigger account-wide ringing. Provider calls to their own phone remain unchanged.
- [ ] **4. Twilio reminder and end-to-end checks.** Notify the selected booking contact before the appointment (provisional lead time: 10 minutes), not the shared account phone. Preserve the separate provider/admin reminder behavior. Verify the seeker and provider paths together.

Milestones 1 and 2 are implemented. Targeted ringing and Twilio reminders are not live; do not describe milestones 3 and 4 as live until implemented and checked.