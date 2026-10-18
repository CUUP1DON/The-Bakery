# The Bakery | Pregnancy for All

This mod was requested in the inZOI Discord, so I had Claude make it. Please thank Claude Sonnet & Opus 5.5 for the code and Nyami for their notes so this could be done faster than if I was just doing it by myself. Most I did was testing and making sure everything worked.

This mod adds the full inZOI pregnancy experience for same-sex couples: the pregnancy test, the belly, the stages, the birth, and a baby with genetics from both parents. Married or not. Man + woman couples stay the same.

---

## Mod Features
1. **Suggest Having a Baby works for M+M and F+F couples.** Married couples use the normal path. Unmarried couples need Friendship 50+ by default, or you can set the requirements to none in the settings.
2. **Real pregnancy-test flow:** After trying for a baby, the possibly pregnant Zoi can take the pregnancy test at the toilet to find out if they're with child.
3. **Random mother:** RNG picks which partner carries. You can lock it to the Zoi you're playing at the moment or to their partner.
4. **Both partners expecting chance:** An option that allows both Zois to become pregnant after trying for a baby. The chance can be adjusted.
5. **Pregnant male Zois can use pregnancy interactions:** the toilet test, gender reveal, sonogram, doctor visits and partner interactions.
6. **Telling someone you're expecting removes the relationship requirement.**
7. **Male + female couples:** A male Zoi is never made pregnant by a woman unless you turn on the "both partners expecting" chance.
8. **Works with the game's Pregnancy Progression Speed option.**
9. **A pregnant male Zoi's birth skips the cutscene** (the game's birth animation only has a female version). The baby is delivered normally.

---

## Requirements
1. inZOI v0.11.0 (October 15th Patch)

---

## How To Open The Settings
1. Click your own Zoi to open their interaction menu.
2. Choose **The Bakery Settings**.
3. Change anything you like. Your choices are saved and picked up within a few seconds.

---

## Settings
| Setting | What it does |
|---|---|
| Male + male / Female + female | Allow or block each couple type. |
| Autonomous | On: Zois can suggest a baby on their own. Off: only you start it. |
| Who carries the baby | Random, My Zoi (the Zoi you're playing), or Their partner. |
| Both partners expecting? | Never, Rare 10%, Sometimes 25%, Often 50% or Always. The chance that both partners become pregnant at once. Default: Never. |
| Unmarried couples | What an unmarried couple needs: Friendship 50+ (default), Romance 50+ (the original rule), or nothing. |
| Couples in town | Off (default) or On: same-sex couples you aren't playing can have babies too. |
| Cheats page | Start a pregnancy test right now, deliver a baby, or remove a pregnancy and its buffs. Includes a diary of what the mod did, with a Copy button. |

---

## How It Works
The game picks "the female" of a couple as the mother, which fails for two men and is ambiguous for two women. The Bakery briefly sets the chosen mother to Female and her partner to Male (behind the scenes only, nothing changes visually), starts the game's own pregnancy test, and puts both genders back once the pregnancy is confirmed. If the game is closed or crashes during this, your Zois' genders are repaired the next time you load.

The longer version is in [EXPLANATION.md](EXPLANATION.md). It covers why a pregnancy can "succeed" and still leave the Zoi not pregnant, and how this mod avoids that.

---

## Known Issues
- The Bakery Settings entry shows on other Zois' menus but only opens from your own Zoi's menu.
- I tried to change the "Check Mother's Health" interaction to gender neutral terms but it wouldn't work. Sorry.
- Remove Pregnancy can't erase the game's small "first pregnancy" milestone note, and the baby bump can take a moment to go away.
- Remove Pregnancy and Deliver Baby only work while the game isn't paused.
- "Couples in town" has not been fully tested.
- It changes the baby interaction's conditions and the pregnancy-test conditions, so another mod that edits the same rows may conflict.

---

## How To Install
1. Download **The_Bakery_v1.0.zip** from the Releases page here or the Files tab on Nexus.
2. Open the zip. Inside is one folder named **Pregnancy_Mod_9D123A42**.
3. Copy that whole folder into your inZOI Mods folder: `Documents\inZOI\Mods` (for example `C:\Users\YourName\Documents\inZOI\Mods`).
4. Start the game and load your save.
5. Click your own Zoi. **The Bakery Settings** should be in their interaction menu towards the bottom.

**To update:** replace the old Pregnancy_Mod_9D123A42 folder with the new one.

**To uninstall:** delete the Pregnancy_Mod_9D123A42 folder.

---

## Troubleshooting
- **No "!" prompt after the bed action:** make sure the pair is allowed in the settings, both are young adult or older, aren't related, and neither is already pregnant.
- **The settings window won't open:** click your own Zoi's menu entry, not another Zoi's.
- Still stuck? Open the Cheats page and use the diary's Copy button. It records what the mod tried, and you can paste it into a bug report.

---

## Repository layout
```
Pregnancy_Mod_9D123A42/
  lua/                B1 and B2 scripts (the pregnancy logic, settings bridge, birth cutscene skip)
  ui/The_Bakery/      the settings window (HTML, JS, fonts)
  Content/JsonPatch/  data patches for the game's condition and script tables
  Meta/               ModKit project files
  Resources/          icon
  workspace/lua/      ModKit's working copy of the Lua (identical to lua/)
EXPLANATION.md        why the vanilla trick fails and what this mod does
```
This folder is a ModKit project. To build it, place `Pregnancy_Mod_9D123A42` in the ModKit's `Mods` folder, open it in the inZOI ModKit and package it from there. The packaged output is what players install.
