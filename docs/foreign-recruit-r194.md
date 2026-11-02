# R194 foreign garrison recruitment limited release

Reviewed for limited release after changed-policy actual UI verification. R193 original draft stays unmerged. Deployment must still be verified after merge.

## Meaning of loyalty

Current loyalty measures attachment to the current ruler. Copying a zero value from the old ruler to the new ruler caused same-turn nationwide recruitment loops. Giving every defector100 creates an unsupported promise of absolute loyalty and still fails when monthly changes reduce it to99.

The proposed foreign-only starting value is70, the existing unspecified loyalty fallback and lower bound of the supplied scenario serving-officer range70-95. It is a design choice, not a recovered historical rule or exact original-game value. The ruler must use existing salary, compatibility, items and rewards to maintain loyalty. Local free and captive recruitment keep their existing loyalty values and probability because they are separate existing commands, including captive loyalty erosion. A unified recruitment-loyalty policy could be a later design, but is not silently bundled here.

## Willingness and persuasion

For foreign garrison targets, multiply the existing charisma/relations/loyalty-based persuasion probability by the uncommitted share of loyalty: (100-loyalty)/100. Loyalty0 leaves existing persuasion strength;99 retains1% of it;100 is excluded. The existing local10% minimum is not applied after this factor to serving officers. This is an explicit new foreign-command policy, not a claim that coefficients are unchanged.

Apply the same factor to the existing failed-attempt debate trigger30%, so a high-loyalty target cannot routinely bypass resistance through debate. Existing free/captive triggers are unchanged. A successful debate uses current eligibility and the same acceptance helper.

A newly recruited foreign officer cannot transfer again in the same turn. This represents one ownership transition per turn, not an invented travel duration or multimonth immunity. The marker is saved in officer state and expires by comparison when the turn changes. At70 a new recruit remains vulnerable later, but AI applies its existing chance0.3 threshold rather than making every possible attempt.

## Effects and AI

Same gold100/AP20 (personnel office AP15) and existing AP reserve, treasury threshold and city-one-attempt AI loop. Foreign targets are added to the existing list and sorted by the same displayed chance. Players and AI invoke the same eligibility and paid command.

On success remove original garrison membership, transfer to issuing city once, clear custody flags, remove foreign office/bonus, clear former advisor. If the officer led a legion, reuse disbandLegion to return those cities to direct control and log it. No invented successor and no world reset. Existing unrelated resignation/capture ghost-governor references are not claimed fixed.

## Evidence and limits

Seventy-four focused Node assertions including prior local free/captive cases, foreign exclusions, reference/office changes, monotonicity, high-loyalty debate check, new-ruler70, same-turn guard and serialized/save-shaped restore, AI exact cost/reserve. Whole42-suite regression and five runtime syntax checks pass. R194 changed-policy actual UI is now separately verified as detailed below. Earlier R193 proof was not substituted.

184/190/251 x seeds1/7/42,600 turns each: foreign successes16-73; maximum per-officer1-3;0 tracked roster/resource violations. Three scenario seed42 runs3000 turns: successes276/543/630, maximum officer switches7/10/13,0 tracked violations; remaining factions4/5/5, all not unified. No economic superiority, campaign quality or phone-performance claim.

251seed42 full3000-turn trace:374 successes were repeat acquisitions; minimum gap19 turns, no gap12 or less, no same-turn repeats. Shortest case lost loyalty70 to52 between turns977 and996. This supports rejection of the previous immediate ping-pong, not a universal guarantee that every future campaign has healthy turnover.

Unfinished: envoy travel, field-unit recruitment and troop ownership, neutral-city free recruitment. These are separate scope limits, not the cause of the R193 hold. Portrait upload restriction and all existing R167/R182/economy holds unchanged.

## Decision

Approved for limited release after review and actual-UI validation. The design has a clear meaning and bounded supporting evidence. Do not continue adding guessed cooldowns or reducing chance until another reproducible defect requires it.


## Changed-policy actual UI verification (12:35 KST)

Fixed e0335c4615ad34e1fb5dfed29f4b5c99ac6c9cfa: eight remote files matched local bytes. Artificial190 Cao Cao/Wang Yun loyalty0/others100, Wang Yun as Dong Zhuo advisor/governor. Actual fixture button and Continue, actual73% button once with unforced success draw: AP100to80, gold5000to4900, Wang Yun force0/city12/loyalty70/transition marker1; original roster absent, destination once, previous advisor null, legions empty. Actual reload/Continue turn1 preserved all including reacquire chance0. Screenshot033105 shows costs/resources/garrison16 and log, detailed state came from app/save.

First premature fixture click before module ready left Ready and old23-turn test state. That attempt was discarded. The corrected fixture produced chance0.732 before entering the app.

Commit337f3490c9b741e23dff832e5b78a50ee1d362cd changed only the fixture to add an explicit AI setup: source gold800/food30000/troops6000, local free officers moved out, other faction AP disabled. Actual Delegate then Stop ran through turn6, with AI recruitment of Wang Yun, saved state matching, loyalty71 and transition marker1. No forced recruitment draw. Exact first-turn AP/gold was not captured and is not claimed as UI cost proof; Node checks and the separate manual UI supply exact costs. At turn6 former-faction reacquire chance0.060175 demonstrates that the marker is not permanent immunity.

390px screenshot033447 shows AI same-rule explanation, foreign loyalty resistance, new loyalty70, same-turn transfer restriction, source faction/city and73%/AP20 button without horizontal clipping. This is emulation, not physical-device testing. No temporary fixture belongs in the release diff.
