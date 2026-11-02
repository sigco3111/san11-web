# R185 recruitment cap boundary

Returning and occupying units merge all surviving troops into a city. R87 deliberately preserves existing troops even above the recruitment cap. Recruitment previously applied min(cap, current + nominal gain), so recruiting in an over-cap city deleted existing troops while charging gold200, food1000 and AP30. It also logged the nominal gain even when less room remained.

Explicit near-cap fixture plus actual engine dispatch/merge reproduced ordinary-city104,500 ->100,000 and metropolis154,500 ->150,000 on recruitment, with the same resource charge and a misleading +3840 log. This is not a claim that a natural game reached those counts during this test.

Recruitment now rejects at/above the existing cap before changing any state, and the UI disables it with the cap reason. Below-cap recruitment retains the existing cost and formula, but logs the actual gain after limiting newly generated troops to available room. The existing caps100,000/150,000, merge preservation, AI recruitment policy, resource costs, food rules and economy balance are unchanged. Partially filled last recruitment still costs the normal command price.

37 new checks cover both city types, exact/above caps with whole-state no-change, room1/500/5000, cost and actual-gain logs, merge preservation and UI condition. All38 smoke suites and five runtime syntax checks pass.

Browser proof2cf4e1a5217736361865b919c02d1ed49d013a87, separate origin and explicit city fixture: actual Continue on ordinary104,500/metropolis154,500 showed disabled recruitment with100,000/150,000 reason and AP255 preserved. Ordinary99,500 followed by actual Recruit produced100,000, log +500, AP255 ->225, gold5000 ->4800, food90000 ->89000, button disabled at cap and immediate saved values matching. A new page load/Continue restored turn1 and those same values. Screenshots20261102-015101 and015220 were inspected at390px mobile emulation. Not natural high-troop gameplay or a physical phone test. The temporary setup HTML is removed before release.
