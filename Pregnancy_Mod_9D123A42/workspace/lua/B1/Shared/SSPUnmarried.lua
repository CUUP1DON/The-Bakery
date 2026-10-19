-- B1: runtime switches for what a couple needs before they can try for a baby (config keys "reqFriend",
-- "reqRomance" for unmarried couples, "reqMarried" for married ones) and for the friends' pregnancy chats ("reqChat"). Edits the stat conditions of the 'Suggest
-- Having a Baby' condition rows with scalar data.patch calls (B1Standalone, Public CLI command), so a change in the
-- settings window applies without a restart.
-- NOTE: the Lua CLI line parser strips every double quote and has no escape, so a JSON value (a whole
-- AndConditionsList) cannot be passed from Lua; only scalar leaves (F1) can be patched. The static data
-- (Content/JsonPatch/Condition_Interaction_Talk_patch) fixes where each condition sits, so the leaves are addressed by
-- index: andConditionsList[0].Conditions[N].F1.
--   unmarried rows: Conditions[0] = Friendship >= value, Conditions[romance slot] = Romance >= value
--   married rows:   Conditions[0] = Family >= value (spouses)
--   chat rows (the game's own rows, not in our static data): the first RelationshipStat condition is the Friendship
--   minimum for the friends' pregnancy talks (vanilla 30), addressed with a [Command=RelationshipStat] selector
-- A value of 0 means "not needed": the condition is set to >= -1000, which every relationship value satisfies.
-- The "Over" band rows only apply from their band floor up (60 unmarried, 30 married), so their lower bound never
-- drops below the floor; the "Less" band rows keep their static upper bound, which makes the band empty when the
-- requirement is above it.

local U = {}

local TABLE = "Condition"            -- runtime alias of Condition_Interaction_Talk
local OFF = -1000
local UNMARRIED = {
    { id = "CanPregnancy_NoSpouse", rom = 1 },
    { id = "CanPregnancy_60_Less_NoSpouse", rom = 2 },       -- index 1 is its "Friendship < 60" upper bound
    { id = "CanPregnancy_60_Over_NoSpouse", rom = 1, floor = 60 },
}
local MARRIED = {
    { id = "CanPregnancy" },
    { id = "CanPregnancy_30_Less" },
    { id = "CanPregnancy_30_Over", floor = 30 },
}

local CHAT = {
    "Pregnancy_KnowingPregnant_Friend_01", "Pregnancy_KnowingPregnant_Friend_02", "Pregnancy_KnowingPregnant_Friend_03",
    "Pregnancy_KnowingPregnant_Friend_Feedback_01", "Pregnancy_KnowingPregnant_Friend_Feedback_02",
    "Pregnancy_KnowingPregnant_Friend_Feedback_03", "AfterPregnancy_Friend_Feedback",
}

local function log(...)
    local t = {}
    for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end
    print("[SameSexPregnancy]", table.concat(t, " "))
end

-- whole number 0..100 (anything unreadable gives the default)
function U.clamp(v, default)
    v = tonumber(v)
    if not v then return default end
    v = math.floor(v + 0.5)
    if v < 0 then return 0 elseif v > 100 then return 100 end
    return v
end

-- the old three-way "unmarried" setting -> (friendship, romance)
function U.legacy(mode)
    if mode == "romance" then return 0, 50 end
    if mode == "none" then return 0, 0 end
    return 50, 0
end

local function lower(v, floor)
    if v <= 0 then v = OFF end
    if floor and v < floor then v = floor end
    return v
end

local function patch(row, idx, value)
    local q = TABLE .. "[Id=" .. row .. "].andConditionsList[0].Conditions[" .. idx .. "].F1"
    local ok, success, msg = pcall(function()
        return inzoi.cli.execute("data.patch method=Override query=" .. q .. " value=" .. tostring(value))
    end)
    if ok and success == true then return true end
    U.last_error = tostring(ok and msg or success)
    log("requirement patch failed", q, U.last_error)
    return false
end

local function patch_chat(row, value)
    local q = TABLE .. "[Id=" .. row .. "].andConditionsList[0].Conditions[Command=RelationshipStat].F1"
    local ok, success, msg = pcall(function()
        return inzoi.cli.execute("data.patch method=Override query=" .. q .. " value=" .. tostring(value))
    end)
    if ok and success == true then return true end
    U.last_error = tostring(ok and msg or success)
    log("requirement patch failed", q, U.last_error)
    return false
end

-- Applies the requirements. Returns true only if every patch succeeded.
function U.apply(friend, romance, married, chat)
    friend, romance, married, chat = U.clamp(friend, 50), U.clamp(romance, 0), U.clamp(married, 10), U.clamp(chat, 30)
    local all = true
    for _, r in ipairs(UNMARRIED) do
        all = patch(r.id, 0, lower(friend, r.floor)) and all
        all = patch(r.id, r.rom, lower(romance, nil)) and all
    end
    for _, r in ipairs(MARRIED) do
        all = patch(r.id, 0, lower(married, r.floor)) and all
    end
    for _, id in ipairs(CHAT) do
        all = patch_chat(id, lower(chat, nil)) and all
    end
    log("requirements applied: unmarried friendship", friend, "romance", romance, "married family", married, "chat friendship", chat, all and "ok" or "with errors")
    return all
end

return U
