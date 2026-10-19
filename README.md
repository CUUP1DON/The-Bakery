# The Bakery | Pregnancy for All

This mod was requested in the inZOI Discord, so I had Claude make it. Please thank Claude Sonnet & Opus 5.5 for the code and Nyami for their notes (and for fixing the male "Check Pregnancy" mirror animation) so this could be done faster than if I was just doing it by myself. Most I did was testing and making sure everything worked.

This mod adds the full inZOI pregnancy experience for same-sex couples: the pregnancy test, the belly, the stages, the birth, and a baby with genetics from both parents. Married or not. Man + woman couples stay the same.

---

## Mod Features
1. **Suggest Having a Baby works for M+M and F+F couples.** Married couples use the normal path. Unmarried couples need Friendship 50+ by default, and you can change what they need (Friendship, Romance, or nothing) on the Requirements page.
2. **Real pregnancy-test flow:** After trying for a baby, the possibly pregnant Zoi gets the "!" and can take the pregnancy test at the toilet to find out if they're with child. No cheat messages pop up.
3. **Random mother:** RNG picks which partner carries. You can lock it to the Zoi you're playing at the moment or to their partner.
4. **Both partners expecting chance:** An option that allows both Zois to become pregnant after trying for a baby. The chance can be adjusted.
5. **Pregnancy tests can come back negative:** Set a chance that a test comes back negative. A negative test is the game's own: the "!", then a negative result at the toilet, and no pregnancy.
6. **Adjustable requirements:** Change how much Friendship and Romance an unmarried couple needs, how much Family bond a married couple needs, and how close friends must be to check in on a pregnancy. On the fly, no restart.
7. **Pregnant male Zois can use pregnancy interactions:** the toilet test, gender reveal, sonogram, doctor visits, partner interactions and Check Pregnancy in the mirror (with the right animation).
8. **Telling someone you're expecting removes the relationship requirement.**
9. **Male + female couples:** A male Zoi is never made pregnant by a woman unless you turn on the "both partners expecting" chance.
10. **Works with the game's Pregnancy Progression Speed option.**
11. **A pregnant male Zoi's birth skips the cutscene by default** (the game's birth scene only has a woman in it, so the bed would be empty). The baby is delivered normally. There is a setting to play the scene anyway.
12. **Trimester picker (Cheats page):** Move an expecting Zoi to the 1st, 2nd or 3rd trimester so you can check the baby bump.

---

## Requirements
1. inZOI v0.11.0 (October 15th Patch)

---

## How To Open The Settings
1. Click your own Zoi to open their interaction menu.
2. Choose **The Bakery Settings**.
3. The main page has the quick switches and three buttons: **Pregnancy**, **Requirements** and **Cheats**. Change anything you like. Your choices are saved and picked up within a few seconds.

---

## Settings

**Main page**
| Setting | What it does |
|---|---|
| Male + male / Female + female | Allow or disable each couple type. |
| Household Autonomy | On: Zois in your household can suggest a baby on their own. Off: only you can start it. |
| Town Autonomy | Off: same-sex couples in town don't have babies themselves. On: same-sex couples you aren't playing can have babies too. |

**Pregnancy page**
| Setting | What it does |
|---|---|
| Who carries the baby | Random, My Zoi (the Zoi you're playing), or Their partner. |
| Both partners expecting? | The chance that both partners become pregnant at once: Never, Rare 10%, Sometimes 25%, Often 50% or Always. |
| Pregnancy tests | The chance a test comes back negative: Never (default), Rare 10%, Sometimes 25%, Often 50% or Always. |
| Birth scene for male carriers | Skip it (default): the baby just arrives. Play it: the game's birth scene plays, with an empty bed. |

**Requirements page** (numbers go 0 to 100 in steps of 5, and 0 means not needed)
| Setting | What it does |
|---|---|
| Unmarried couples: Friendship | How much Friendship an unmarried couple needs before they can try for a baby. Default 50. |
| Unmarried couples: Romance | How much Romance they need on top of that. Default 0 (not needed). |
| Married couples: Family bond | What a married couple needs. Default 10, the same as the base game. |
| Pregnancy chats: Friendship | How close friends must be to check in on a pregnancy and talk about the baby. Default 30, the same as the base game. |

**Cheats page**
| Setting | What it does |
|---|---|
| Try for a baby | Start a pregnancy test right now for the two Zois you pick. |
| Deliver baby / Remove pregnancy | Deliver a baby now, or remove a pregnancy and its buffs. |
| Trimester | Move whoever is expecting forward to the 1st, 2nd or 3rd trimester. It only goes forward. |

**Diary:** Basically the log of the mod. It is saved by itself, even when the window is closed. If you are having issues, click the copy button to get the log and include it in your report.

---

## How It Works
The game picks "the female" of a couple as the mother, which fails for two men and is ambiguous for two women. The Bakery briefly sets the chosen mother to Female and her partner to Male (behind the scenes only, nothing changes visually) and gives the mother the game's pregnancy test, the "!". The game starts the pregnancy on its own when it can. When it doesn't, the pregnancy is started with the game's own pregnancy command at the moment the test is taken. Either way, both genders go back once the pregnancy is confirmed. If the game is closed or crashes during this, your Zois' genders are repaired the next time you load.

The longer version is in [EXPLANATION.md](EXPLANATION.md). It covers why a pregnancy can "succeed" and still leave the Zoi not pregnant, and how this mod avoids that.

---

## Known Issues
- The Bakery Settings entry shows on other Zois' menus but only opens from your own Zoi's menu.
- I tried to change the "Check Mother's Health" interaction to gender neutral terms but it wouldn't work. Sorry.
- If your household is full (8 members) when the test is taken, the game cancels the pregnancy and the test shows a negative result. Free a household slot first, or wait until babies grow up.
- The trimester picker only moves forward. To see an earlier stage, remove the pregnancy and start again.
- Remove Pregnancy can't erase the game's small "first pregnancy" milestone note, and the baby bump can take a moment to go away.
- Remove Pregnancy and Deliver Baby only work while the game isn't paused.
- "Town Autonomy" has not been fully tested.
- It changes the baby interaction's conditions and the pregnancy-test conditions, so another mod that edits the same rows may conflict.

---

## How To Install
1. Close inZOI completely.
2. Download **The_Bakery_v1.0.1.zip** from the Releases page here or the Files tab on Nexus.
3. Open the zip. Inside is one folder named **Pregnancy_Mod_9D123A42**.
4. Copy that whole folder into your inZOI Mods folder: `Documents/inZOI/Mods` (usually `C:/Users/YourName/Documents/inZOI/Mods`).
5. Start the game and load your save. The mod's scripts and data only load at startup, so a full restart is needed the first time and after every update.
6. Click your own Zoi. **The Bakery Settings** should be in their interaction menu towards the bottom.

**To update:** close the game and replace the old Pregnancy_Mod_9D123A42 folder with the new one. Your settings carry over.

**To uninstall:** close the game and delete the Pregnancy_Mod_9D123A42 folder. Your Zois are not changed by the mod, and any swapped gender is repaired on load.

---

## Troubleshooting
- **No "!" prompt after the bed action:** make sure the pair is allowed in the settings, both are young adult or older, aren't related, and neither is already pregnant.
- **Nothing happened after trying for a baby:** each pair has a short wait (about 20 seconds) between attempts, and the Diary says when an attempt was ignored.
- **The test comes back negative and there is no baby:** check the "Pregnancy tests" chance, and check that your household isn't full (8 members).
- **The settings window won't open:** click your own Zoi's menu entry, not another Zoi's.
- **A requirement change doesn't seem to apply:** give it a few seconds. The numbers are applied from a script that checks every few seconds.
- Still stuck? Click the Diary's **Copy** button. It copies what the mod tried, and you can paste it into a bug report.

---

## Changes in v1.0.1
- Fixed the pregnancy not starting for same-sex couples: the "!" now stays until the test is taken, and the pregnancy is started when it is.
- Pregnancy tests can come back negative (chance setting).
- Adjustable requirements: unmarried Friendship and Romance, married Family bond, pregnancy-chat Friendship.
- New pages: Pregnancy and Requirements. Household Autonomy and Town Autonomy are now tiles.
- Option to play the birth scene for male carriers.
- Trimester picker on the Cheats page.
- The Cheats page follows the Zoi you switch to.
- Check Pregnancy in the mirror shows the right animation for men (thanks Nyami).
- No morning sickness after a test that isn't followed by a pregnancy.
- The Diary is saved automatically, and Copy really copies it.

---

## Repository layout
```
Pregnancy_Mod_9D123A42/
  lua/                B1 and B2 scripts (the pregnancy logic, settings bridge, requirements, birth cutscene skip)
  ui/The_Bakery/      the settings window (HTML, JS, fonts)
  Content/JsonPatch/  data patches for the game's condition, script and animation tables
  Meta/               ModKit project files
  Resources/          icon
  workspace/lua/      ModKit's working copy of the Lua (identical to lua/)
EXPLANATION.md        why the vanilla trick fails and what this mod does
```
This folder is a ModKit project. To build it, place `Pregnancy_Mod_9D123A42` in the ModKit's `Mods` folder, open it in the inZOI ModKit and package it from there. The packaged output is what players install.
