-- B1: runtime switch for the "Unmarried couples need:" setting (config key "unmarried").
-- Edits the stat condition of the three NoSpouse condition rows of 'Suggest Having a Baby' with scalar
-- data.patch calls (B1Standalone, Public CLI command), so the requirement is swapped without a restart.
-- NOTE: the Lua CLI line parser strips every double quote and has no escape, so a JSON value (a whole
-- AndConditionsList) cannot be passed from Lua; only scalar leaves (S1 / F1) can be patched, addressed with
-- [Key=Value] selectors (the first match is patched, andConditionsList[0] is the only AND group).
--   friendship (default)  Friendship >= 50  (60_Less: 50..<60, 60_Over: >=60)   == the static data
--   romance               Romance    >= 50  (same bands)                          == vanilla rule
--   none                  no stat requirement at all (both band rows pass)
-- 'none' = Friendship >= 0 (and < 101 for the upper band), always true. Nothing else in the rows (other
-- conditions, OR groups) is touched here.

local U = {}

local TABLE = "Condition"            -- runtime alias of Condition_Interaction_Talk
local ROWS = {
    { id = "CanPregnancy_NoSpouse", low = 50 },
    { id = "CanPregnancy_60_Less_NoSpouse", low = 50, high = 60 },
    { id = "CanPregnancy_60_Over_NoSpouse", low = 60 },
}

local function log(...)
    local t = {}
    for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end
    print("[SameSexPregnancy]", table.concat(t, " "))
end

function U.normalize(v)
    if v == "romance" or v == "none" then return v end
    return "friendship"
end

local function patch(row, selector, field, value)
    local q = TABLE .. "[Id=" .. row .. "].andConditionsList[0].Conditions[" .. selector .. "]." .. field
    local ok, success, msg = pcall(function()
        return inzoi.cli.execute("data.patch method=Override query=" .. q .. " value=" .. tostring(value))
    end)
    if ok and success == true then return true end
    U.last_error = tostring(ok and msg or success)
    log("unmarried patch failed", q, U.last_error)
    return false
end

-- Applies a mode (friendship|romance|none) to the three rows. Returns true only if every patch succeeded.
function U.apply(mode)
    mode = U.normalize(mode)
    local stat = (mode == "romance") and "Romance" or "Friendship"
    local all = true
    for _, r in ipairs(ROWS) do
        local lowv = (mode == "none") and 0 or r.low
        all = patch(r.id, "Command=RelationshipStat", "S1", stat) and all
        all = patch(r.id, "Command=RelationshipStat", "F1", lowv) and all
        if r.high then
            all = patch(r.id, "CompareType=Less", "S1", stat) and all
            all = patch(r.id, "CompareType=Less", "F1", (mode == "none") and 101 or r.high) and all
        end
    end
    log("unmarried mode applied:", mode, all and "ok" or "with errors")
    return all
end

return U
