-- B1: runtime switch for the "npcCouples" setting (same-sex NPC couples in town may have babies).
-- Vanilla gates the NPC bag Co_TryToHaveChildren_NPC with the Condition row CanPregnancy_NPC whose AND list has
--   Self CanPregnancy Equal / Target GenderCompWithTarget NotEqual / Self IsLovable Equal
-- so two same-sex NPCs are never offered it. 'on' turns exactly those three conditions into
--   Self IsPregnancyState NotEqual None / Target IsPregnancyState NotEqual None / Self IsPregnancyState NotEqual None
-- (= "neither partner is pregnant"); every other condition (spouse, HasHome, not a player character, no test
-- buff, GrowthStep <= Adult, double bed) stays untouched. 'off' puts the three conditions back exactly.
-- Only scalar leaves can be patched from Lua (the CLI line parser strips double quotes, so no JSON value), so
-- each condition is tagged with a marker in its S2 field (S2 = "SspNpc1".."SspNpc3") to be addressable again.
-- The shipped static data is never changed: the vanilla row is what loads, 'on' exists only at runtime.

local N = {}

local ROW = "CanPregnancy_NPC"
local TABLE = "Condition"
local SPECS = {
    { cmd = "CanPregnancy",         cmp = "Equal" },
    { cmd = "GenderCompWithTarget", cmp = "NotEqual" },
    { cmd = "IsLovable",            cmp = "Equal" },
}

local function log(...)
    local t = {}
    for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end
    print("[SameSexPregnancy]", table.concat(t, " "))
end

local function patch(selector, field, value, quiet)
    local q = TABLE .. "[Id=" .. ROW .. "].andConditionsList[0].Conditions[" .. selector .. "]." .. field
    local ok, success, msg = pcall(function()
        return inzoi.cli.execute("data.patch method=Override query=" .. q .. " value=" .. tostring(value))
    end)
    if ok and success == true then return true end
    if not quiet then log("npc patch failed", q, tostring(ok and msg or success)) end
    return false
end

-- Puts every tagged condition back to vanilla (silently does nothing for conditions that are not tagged).
local function revert()
    for k, s in ipairs(SPECS) do
        local sel = "S2=SspNpc" .. k
        if patch(sel, "Command", s.cmd, true) then
            patch(sel, "CompareType", s.cmp, true)
            patch(sel, "S2", "None", true)
        end
    end
end

-- on = true: same-sex NPC couples allowed; false: vanilla. Returns true when the requested state was reached.
function N.apply(on)
    revert() -- idempotent: also repairs a leftover from an earlier script load
    if not on then
        log("npcCouples off: CanPregnancy_NPC vanilla")
        return true
    end
    local all = true
    for k, s in ipairs(SPECS) do
        local sel = "S2=SspNpc" .. k
        local ok = patch("Command=" .. s.cmd, "S2", "SspNpc" .. k)
        ok = ok and patch(sel, "Command", "IsPregnancyState")
        ok = ok and patch(sel, "CompareType", "NotEqual")
        if not ok then all = false end
    end
    if not all then revert() end
    log("npcCouples on:", all and "CanPregnancy_NPC patched" or "FAILED (reverted)")
    return all
end

return N
