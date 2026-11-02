# R195 governor validity

## Defect and bounded fix

190 scenario: Jia Xu60 in Dong Zhuo force5, Tianshui20. Create a legion, then actual capture helper sets captive status, but old code retained the command and blocked manual orders. The engine and UI also accepted a captive, free or dead officer with retained force metadata as a new governor.

Use the same serving/ruler/taesu status category as existing advisor eligibility, plus matching living force. No new geography/rank/travel constraints. Invalidate lost-governor commands with existing disbandLegion, return to direct control and existing notification. Do not invent a successor or restore the old command when the officer returns. A freed/rejoined officer can be appointed again through the ordinary command. Valid other legions remain unchanged.

Boundaries: new command, UI options, capture, resignation, roster reconciliation/old-save load, before AI and after extinction. The final boundary matters: the initial600-turn study found1-10 invalid-governor snapshots per pair because extinction followed AI; those were dead-force/free-officer commands, not a passing result. Post-extinction cleanup fixed them. No probability, economic coefficient, recruitment or foreign-command policy changed.

## Evidence

35 focused Node checks;43/43 whole suites; five runtime syntax checks. Capture, resignation, release/reappointment, old free/foreign/missing/dead-save repair, idempotent logs, other-legion preservation, cost preservation and actual extinction boundary included.

184/190/251 x seeds1/7/42,600turns, artificial per-city legion deployment (initial16/26/9 legions), full-world delegation:0 invalid-governor snapshots and0 negative-resource snapshots in all9 pairs. This is an invariant study, not campaign-quality or economic superiority proof. Remaining factions4-11 are not a quality ranking.

Fixed preview ed933e3671491b3ab60cc1d1f258d10b41dd5062: isolated artificial legacy captured-governor save, actual preparation button and actual Continue. It repaired the old command, showed direct-return log, saved no command, excluded Jia Xu60 from29 governor options. Actual Tianshui map click and commercial-development button: AP100to70, city gold5000to4700, commerce32to40; save and actual reload preserved these and no repeated disband log. Captures034746/034832 visually show management/direct-control log and manual result. Candidate options were read from the UI values; not all29 were visible in the screenshot. No physical phone test.

The fixture first described the scenario as Zhang Xiu/Wan. That was a naming error; source IDs and resulting state were always Dong Zhuo5/Tianshui20. The error was corrected in the report, not treated as a different test. The temporary fixture will not be in the release diff. The subsequent post-extinction-only engine addition is separately covered by Node tests and full invariant rerun, not falsely attributed to the earlier screenshot.

R167/R182 and other economy/diplomacy holds unchanged. Public user save was not touched. Broader development remains incomplete.
