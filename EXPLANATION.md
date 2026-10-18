# Why the pregnancy "succeeds" but nothing happens, and what The Bakery does about it

## The problem you ran into

> After the pregnancy test "succeeds" it does not show the Pregnant icon, the interactions, or anything. The character is simply not pregnant. It's most obvious when you click the partner Zoi again and "Suggest Having a Baby" is still there, when it shouldn't be for a pregnant Zoi.

This is a real, reproducible failure, and it has more than one cause. They stack on top of each other, which is why it is so confusing: fixing one still leaves you with the same symptom. Here is what we found while building this mod, in the order you are likely to hit it.

---

## Cause 1: the gender swap takes a moment to take effect

The usual trick is to set the mother to Female and her partner to Male, then start the pregnancy. If you do the swap and the start in the **same tick**, the game silently ignores the start. Nothing errors. The calls return success.

What this looks like on the Zoi:
- the pregnancy-test buff (`PregnancyTest_Success`) is on her
- her pregnancy state is still `None`
- `IsPregnant` is false

That is exactly "the test succeeds but she is not pregnant". When the test is then taken, the game runs its "pregnancy confirmed" scripts on a Zoi who is not pregnant. You get the moodlets and the popup, and no pregnancy.

We measured this: swap, then wait about 4 seconds, then start, and it works every time. Swap and start in the same tick, and it failed. A wait of 1.5 seconds worked sometimes and failed other times, so the mod waits 4 seconds.

## Cause 2: reverting the genders too early

The swap has to stay in place until the pregnancy has left its test state (`PregnancyTest`) and reached `PregnancyEarly`. If you put the genders back while the state is still `PregnancyTest`, the pregnancy disappears.

There is a second reason. The game's `PregnancySuccess` script, which runs when the test result is confirmed and calls `Pregnancy Proceed`, only runs for a **Female** Zoi. If the mother has already been switched back to Male by then, the step that confirms the pregnancy never runs.

## Cause 3: the vanilla scripts only recognise a female mother

The bed result's scripts (`PregnancyTest_Success` and friends) give the test buff only when `Self.Gender == Female`.
- With two men, nobody gets the buff, so nothing starts.
- With two women, **both** women get the buff, and its add-script (`Add_Pregnancy`) tries to start a pregnancy on both, with no father's genetics prepared.

## Cause 4: the cheat commands show a toast, and one of them skips the test

`pregnancy_and_birth.get_baby_with` and `bio.set_gender` are cheat-flagged. They pop the game's cheat toast, and `get_baby_with` jumps straight to `PregnancyEarly`, so there is no test at all.

## Why "Suggest Having a Baby" is still offered

That one is a symptom, not a separate bug. The baby action's conditions check pregnancy state. If the Zoi never actually became pregnant (Cause 1), the game correctly sees two non-pregnant Zois and offers the action again.

---

## What The Bakery does

1. **Waits for the swap.** It sets the mother Female and her partner Male, then waits about 4 seconds, and re-reads both genders to confirm the swap before going on.
2. **Prepares the father's genetics** with the game's own `Execute_Pregnancy` `Prepare`.
3. **Gives the mother the test result through the game's own script**, not a direct buff call: `FB2Script_Buff.Execute_AddBuff("PregnancyTest_Success")`. This matters. `FB2BuffComponent:AddBuff` and `AddBuffImmediately` returned success from Lua but did nothing in our tests. The script route works, and the buff's own `Add_Pregnancy` script then starts the pregnancy, so Lua never calls `Start` itself and there is no double start.
4. **Keeps the swap** until the state has left `PregnancyTest`, then restores both genders and checks that the restore took. The swap is written to disk before it starts, so a crash cannot leave anyone swapped. It is repaired on the next load.
5. **Retries safely.** If no pregnancy test appears, it removes any leftover test buff and tries again, up to three times. If it still fails, it restores the genders, logs a plain message, and forces nothing.
6. **Patches the data so the vanilla rules stop fighting it.**
   - The baby action's conditions accept same-sex pairs, and they also require that neither Zoi is already pregnant, so the action disappears once someone is expecting.
   - The vanilla bed scripts no longer give both women a test buff.
   - Pregnant men can use the toilet test, gender reveal, sonogram and partner chats.
7. **Never uses the cheat commands in the normal path**, so there is no cheat toast. The `get_baby_with` fallback is off by default.

## What we verified

- Same-sex pairs reached `PregnancyTest`, then `PregnancyEarly` after the test, with genetics from both parents, the belly modifier and the stage timers.
- A male-bio mother delivered a baby with both parents set correctly.
- The pregnancy interactions (partner chats, mirror check, sonogram, health check) pass for pregnant same-sex partners.
- Once a Zoi is pregnant, the baby action is hidden, as it should be.
- Man + woman couples are unchanged.

## What we could not fully verify

- We can't see your setup, so we can't prove which of these causes you hit. Cause 1 produces your symptom exactly, and Cause 2 is the next most likely.
- Some of this was found by reading the game's data and scripts, not only by watching it run.
- The woman + woman flow, the man-also-expecting chance for man + woman couples, and the "Couples in town" setting had limited or no live testing.

## If you want to build on this

The sequence that works, in Lua:

```lua
-- 1. swap (SetGenderType on the Bio component), 2. wait ~4 s and re-read both genders, then:
-- 3. store the father's genetics: Execute_Pregnancy "Prepare" (partner as Self, mother as Target)
-- 4. give the test result through the script, not through the component:
local ctx = inzoi.FB2ScriptContext(make_id(mother), make_id(partner), inzoi.EB1ScriptReason.Talk)
local ex = inzoi.FB1Execute()
ex.BaseObject = inzoi.EB1BaseObject.Self
ex.Command = inzoi.EB1ExecuteType.AddBuff
ex.S1 = "PregnancyTest_Success"; ex.S2 = "None"; ex.F1 = 0; ex.F2 = 0; ex.Prob = 1
inzoi.FB2Script_Buff.Execute_AddBuff(ctx, ex)
-- 5. keep the swap until the state leaves PregnancyTest, then restore and verify.
```

The code for all of this is in `lua/B2/Manager/SameSexPregnancy.lua`.
