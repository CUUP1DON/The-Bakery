# Why the pregnancy "succeeds" but nothing happens, and what The Bakery does about it

## The problem

> After the pregnancy test "succeeds" it does not show the Pregnant icon, the interactions, or anything. The character is simply not pregnant. It's most obvious when you click the partner Zoi again and "Suggest Having a Baby" is still there, when it shouldn't be for a pregnant Zoi.

This is a real, reproducible failure with more than one cause. They stack, which is why it is confusing: fixing one still leaves the same symptom. This is what we found while building the mod, in the order you are likely to hit it. Everything here comes from watching the game run and reading its data tables. Where something is only a theory, it says so.

---

## Cause 1: the game's own pregnancy start does not work for a same-gender pair

For a man + woman couple the game starts the pregnancy itself. The pregnancy-test buff (`PregnancyTest_Success`) has an add-script, `Add_Pregnancy`, that runs `Pregnancy Start`. For two women or two men, even after the genders are swapped (see Cause 2), that start usually does nothing. It reports success, no error is raised, and the Zoi's pregnancy state stays `None`.

What this looks like on the Zoi:
- the test buff is on her
- her pregnancy state is `None`
- `IsPregnant` is false

The "!" you see is only the buff. Taking the test then runs the game's "pregnancy confirmed" scripts on a Zoi who is not pregnant. You get the moodlets and the popup, and no pregnancy.

It is not consistent: in our tests the native start worked now and then, including on brand-new Zois, and failed at other times with identical settings. We do not know why. We ruled out another mod, leftover buffs, game speed, marriage status, and the swap wait.

The one thing that always worked was the game's own command `pregnancy_and_birth.get_baby_with` on a swapped pair. It skips the test state and goes straight to `PregnancyEarly`.

## Cause 2: the game only recognises a female mother

The game's scripts give the test buff only when `Self.Gender == Female`, and the start picks "the female" of the pair.
- With two men, nobody gets the buff.
- With two women, both would get it.

So the mod briefly sets the carrier to Female and the partner to Male (simulation only, nothing changes visually). The swap takes a moment to register: if the start comes in the same tick, the game ignores it. The mod waits about 4 seconds.

The swap has to stay until the pregnancy has left its test state. If the genders go back while it is still `PregnancyTest`, the pregnancy disappears. The game's `PregnancySuccess` script (which confirms the pregnancy when the test is taken) also only runs for a Female Zoi.

## Cause 3: a wait for the state that never comes

The state does not move until something starts it, so code that waits for a state change under the "!" and retries will remove and re-add the buff (a second "!", a third "!") and then give up. The mod waits for as long as the buff is on.

## Cause 4: the cheat command shows a toast

`get_baby_with` is a cheat-flagged command, so it pops the game's cheat toast. The toast appears a few frames after the call and lasts 5 seconds.

## Cause 5: a full household cancels the pregnancy

The test's finish script cancels the pregnancy if the household is already full (8 members, newborns count). The cheat command refuses too ("family capacity"). The player sees a negative result and the game's "Struggling to Get Pregnant" buffs. That is the game's rule.

## Why "Suggest Having a Baby" is still offered

That is a symptom, not a separate bug. The baby action's conditions check pregnancy state. If the Zoi never became pregnant, the game correctly sees two non-pregnant Zois and offers the action again.

---

## What The Bakery does

1. **Swaps and waits.** Carrier Female, partner Male, then about 4 seconds for the swap to register. The swap is written to disk first, so a crash cannot leave anyone swapped. It is repaired on the next load.
2. **Prepares the father's genetics** with the game's own `Execute_Pregnancy` `Prepare`.
3. **Gives the carrier the test result through the game's own script:** `FB2Script_Buff.Execute_AddBuff("PregnancyTest_Success")`. The component calls `FB2BuffComponent:AddBuff` and `AddBuffImmediately` return success from Lua but do nothing. After a few seconds with no pregnancy it also runs one explicit `Pregnancy Start`.
4. **Waits for the player** to take the test. It never removes or retries the buff.
5. **When the test is taken and there is still no pregnancy,** it runs `get_baby_with` with the swap still in place. The state goes to `PregnancyEarly`. If the game's own start worked, this step is skipped and nothing cheat-related runs.
6. **Clears the toast on every game tick** for four seconds around that command, so it is never visible.
7. **Restores both genders** once a real pregnancy state is reached, and checks that the restore took.
8. **Negative tests.** A settable chance gives the carrier the game's own `PregnancyTest_Failure` buff instead, so the test shows the game's negative result and no pregnancy starts (no swap needed).
9. **Patches the data so the vanilla rules stop fighting it.**
   - The baby action's conditions accept same-sex pairs, and require that neither Zoi is already pregnant, so the action disappears once someone is expecting.
   - The vanilla bed scripts no longer hand both women a test buff.
   - The game's toilet test adds morning sickness whether or not a pregnancy follows. That script now only does so when the Zoi is actually pregnant (the game adds morning sickness itself when the early stage starts).
   - Pregnant men can use the toilet test, gender reveal, sonogram, partner chats, and the mirror check (with the right animation, patch by Nyami).
10. **Makes the requirements adjustable at runtime** (unmarried Friendship and Romance, married Family bond, and how close friends must be to talk about a pregnancy). The numbers are scalar `data.patch` calls from a boot script, since the Lua command line cannot pass a JSON value.

## What we verified

- Same-sex pairs reached `PregnancyTest` and `PregnancyEarly`, with genetics from both parents, the belly, and the stage timers. A baby from a male carrier recorded both parents' IDs and had a face between the two parents' (212 of 245 face parameters between them).
- Married, unmarried (romance), and friends-only couples all got pregnant. The cheat toast was not seen.
- The requirement numbers land on the right condition rows, and the trimester picker moves a pregnancy Early, Mid, Late.
- Man + woman couples are unchanged.

## What we could not fully verify

- A negative test through the failure buff has not been seen happening in the game.
- The "play the birth scene" option for male carriers, and the Town Autonomy setting, have had no end-to-end test.
- We can't say why the game's own start is unreliable for same-gender pairs.

## If you want to build on this

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
-- 5. wait for the player to take the test (the buff ends). If the state is still None,
--    inzoi.cli.execute("pregnancy_and_birth.get_baby_with entity_id=<mother> partner_id=<partner>")
--    while the swap is still in place, then clear toasts every tick for a few seconds.
-- 6. keep the swap until the state leaves PregnancyTest, then restore and verify.
```

The code for all of this is in `lua/B2/Manager/SameSexPregnancy.lua`.
