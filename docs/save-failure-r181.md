# R181 save failure handling

## Defect and change
The previous autosave swallowed storage-write errors. Both menu title routes reloaded unconditionally, so a failed write could return the player to an older saved state without warning.

Autosave now reports success/failure without changing the save schema. A status callback updates a persistent warning for every save path, including engine commands that do not call refreshAll. A retry button saves the current state and removes the warning only on success. Both menu title routes reload only after a successful save. A failed save keeps the game in memory and shows a blocking explanatory modal. UI-notification errors do not turn a successful storage write into a reported failure.

## Verification, 2026-11-02
- 35 regression suites and five JS syntax checks pass. R181 has 14 gates: successful write; thrown write error; previous saved data unchanged; recovery writes the current turn; transient failure state excluded from the save; status notifications on each result; callback exception isolation; both menu routes share the guarded path; accessible status banner. Some UI checks in this suite are source contracts, not interaction tests.
- Separate-origin browser fixture, 390px mobile emulation, commit 005846c1c16eee7480c53b71e3c39518ba505999. A deliberate QuotaExceededError was injected for the game's save key. This is a fault-injection test, not a report that a user's storage is full.
- Existing test save continued at turn 23. Actual End Turn reached turn 24 while the stored save stayed at 23. The failure banner and retry button were visible and readable within the viewport.
- Actual clicks on both menu title routes stayed at turn 24 with stored turn 23 and the failure modal.
- After restoring normal storage writes, actual Retry saved turn 24, set failure false and hid the warning. Actual Save and Title returned to the title; Continue restored turn 24 with no warning.
- Screenshot 20261102-010409 shows the 390px warning. This test does not establish real-device behavior or browser-specific full-disk behavior.

## Limits
This prevents silent menu-driven loss and makes autosave failures visible. It does not recover a closed tab's unsaved state, expand browser storage, add cloud backups, or validate corrupted existing saves. Browser reload/close outside the in-game menu can still lose an unsaved in-memory state; the warning tells the player not to close or refresh. The test fixture is removed from the release branch after verification. No economy, AI or command cost rules change.
