# R186 aid transfer conservation

Aid transfers3,000 existing troops from an ally, it does not create new recruits. Both immediate aid and accepted incoming aid previously capped the recipient city at the recruitment limit. Explicit ordinary-city fixture104,500 receiving3,000 from6,000 reduced the donor to3,000 and recipient to100,000, deleting7,500 world troops. Accepted aid also deducted donor troops before checking whether any recipient city still existed.

Both paths now transfer all3,000 without cutting existing recipient troops. This matches the existing returning-unit rule that recruitment caps limit new generation, not preservation of existing troops. Incoming acceptance finds the recipient before deducting from the donor. Existing request AP20, alliance, source eligibility,18-turn cooldown, target selection, refusal, resource prices and AI policy stay unchanged. No economy/diplomacy tuning is included. A failed incoming transfer still consumes the decision and records the failure, as before, but does not deduct troop counts.

107 boundary checks cover immediate/incoming aid, ordinary/metropolis recipient, below/near/over cap, world troop conservation, pending no-transfer, successful cooldown, repeated decision, lost source/recipient, low source troops and refusal. All39 smoke suites and five runtime syntax checks pass. Nine paired R185/R186 observations across scenarios184/190/251 and seeds1/7/42,150 turns each, have identical final state hashes. This is finite coverage, not all-save or unlimited-turn proof.

Browser proof08c2b398ec5fb186ba859811073bc682f98bc09f, separate origin and explicit fixture:
- Incoming request to Dong Zhuo, actual Continue/Accept: donor6,000 to3,000, Cao Cao recipient104,500 to107,500, requester AP235, immediate saved values match.
- Incoming request, fixture removal of all recipient cities before actual Accept: failure log, donor6,000 preserved and saved, queue consumed.
- Cao Cao actual Continue/city/Diplomacy/Request Aid: same full transfer, AP255 to235, immediate save and new page Continue restored turn1, source3,000, destination107,500 and AP235.

390px screenshot20261102-020436 was inspected and shows AP235 and18-turn request cooldown. Troop counts come from app/save data, not that screenshot. This is not natural high-troop gameplay or a physical phone test. Temporary setup HTML is removed before release.
