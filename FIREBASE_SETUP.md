# Firebase setup for Visionary Tool

The HTML already contains the public Firebase web configuration for `visionary-8cbfa`. No service-account key or client secret belongs in the HTML.

## 1. Enable Google sign-in

1. Open Firebase Console.
2. Choose **visionary-8cbfa**.
3. Open **Build > Authentication > Sign-in method**.
4. Enable **Google**.
5. In **Authentication > Settings > Authorized domains**, add `jsikson7.github.io`.

## 2. Create Firestore

1. Open **Build > Firestore Database**.
2. Create a Standard edition database in **Production mode**.
3. Choose the closest approved United States region.

## 3. Publish the security rules

1. Open **Firestore Database > Rules**.
2. Replace the editor contents with `firestore.rules` from this folder.
3. Select **Publish**.

The rules make `jsikson@gmail.com` the initial owner. All other Google accounts create an access request and cannot read shift data until the owner approves them from **Daily Tasks > Manage technician access**.

## 4. Test access before publishing

1. Serve `index.html` from HTTPS or localhost. Google sign-in will not work from a downloaded `content://` or `file://` page.
2. Sign in as `jsikson@gmail.com`.
3. Choose a date and shift, then make a test change.
4. Sign in from a second Google account. It should show an access-request message and no shift data.
5. Approve that account from the owner panel.
6. Open the same date and shift on both devices and verify that a checkmark updates on both.

## Data layout

- `shifts/{YYYY-MM-DD_SHIFT}` stores the shared shift.
- Individual checklist values are updated by nested field path, preventing unrelated tasks from overwriting one another.
- `taskAudit` records the last Google account, display name, and time that changed each scheduled task.
- `accessRequests/{uid}` stores pending technician requests.
- `authorizedUsers/{uid}` stores approved technician access.

The existing 16-hour browser draft remains enabled as a recovery layer. Firestore is the shared source of truth after Google sign-in.
