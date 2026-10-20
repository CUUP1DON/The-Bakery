-- Same-sex romance. The game decides whether two Zois can fall in love (the "IsLovable" check that almost every romantic
-- option and the Romance stat itself depend on) from each Zoi's list of genders they are attracted to
-- (FB1GenderIdentitySetting.RomanceTargetList). Every Zoi in the base game only lists the opposite gender.
-- While the setting is on, this adds a Zoi's own gender to that list (the other entries are kept). Zois changed
-- here are remembered (id and original list) so that turning the setting off puts them back; the record is saved
-- through the B1 bridge like the pending gender swaps.

local C = require("Shared.SSPConfig")

local O = {}

local MASK = { Male = 1, Female = 2, NonBinary = 4 }
O.orig = {}        -- entity id -> original list as a bit mask, only for Zois this mod changed
O.record_loaded = false
O.last_sweep = 0
O.sweep_every = 15.0
O.was_on = nil
O.diag_logged = false
O.started = nil

local function log(msg)
    print("[SameSexPregnancy]", msg)
    C.add_log(os.date("%H:%M:%S") .. " " .. msg)
end

local function id_of(ent)
    local ok, id = pcall(function() return ent:GetEntityId() end)
    if not ok then return nil end
    return type(id) == "number" and id or tonumber(tostring(id))
end

local function list_mask(list, E)
    local m = 0
    for name, bit in pairs(MASK) do
        local ok, has = pcall(function() return list:Contains(E[name]) end)
        if ok and has then m = m + bit end
    end
    return m
end

local function bio_of(ent)
    local ok, bio = pcall(function() return ent:GetComponent(inzoi.EB2ComponentType.Bio) end)
    if ok then return bio end
    return nil
end

-- Writes a new setting with the given mask of targets.
local function write_mask(bio, s, mask, E)
    local ns = inzoi.FB1GenderIdentitySetting()
    ns.GenderIdentity = s.GenderIdentity
    ns.bRomanticOrientation = s.bRomanticOrientation
    for name, bit in pairs(MASK) do
        if mask % (bit * 2) >= bit then ns.RomanceTargetList:Add(E[name]) end
    end
    bio:SetGenderIdentitySetting(ns, false)
end

-- Every Zoi (an entity list); tries the ways the engine's array wrapper may be read.
local function all_characters()
    local ok, arr = pcall(function()
        return inzoi.getB2Manager("FB2EntityManager"):GetAllEntities(inzoi.EB2EntityType.Character)
    end)
    if not ok or arr == nil then return nil, "GetAllEntities failed: " .. tostring(arr) end
    local n
    pcall(function() n = arr:Num() end)
    if not n then pcall(function() n = arr:Length() end) end
    if not n then pcall(function() n = #arr end) end
    if not n then return nil, "could not size the character list" end
    local out = {}
    for i = 1, n do
        local ent
        pcall(function() ent = arr:Get(i) end)
        if ent == nil then pcall(function() ent = arr[i] end) end
        if ent == nil and i == 1 then pcall(function() ent = arr:Get(0) end) end
        if ent ~= nil then out[#out + 1] = ent end
    end
    return out, nil
end

local function is_adult(bio)
    local ok, g = pcall(function() return bio:GetGrowthStep() end)
    return ok and (g == 32 or g == 64 or g == 128 or g == 256) -- Youth, Adult, Old, Elderly
end

local function persist()
    local parts = {}
    for id, mask in pairs(O.orig) do parts[#parts + 1] = tostring(id) .. "," .. tostring(mask) end
    C.to_client("ssp_orient", #parts > 0 and table.concat(parts, "_") or "none")
end

-- "id,mask_id,mask" from the saved record (sent by B1 after a load)
function O.load_record(s)
    if O.record_loaded or type(s) ~= "string" or s == "" or s == "none" then return end
    O.record_loaded = true
    local n = 0
    for entry in string.gmatch(s, "[^_]+") do
        local id, mask = string.match(entry, "^(%d+),(%d+)$")
        if id and O.orig[tonumber(id)] == nil then O.orig[tonumber(id)] = tonumber(mask); n = n + 1 end
    end
    if n > 0 then log("same-sex romance: remembered the original orientation of " .. n .. " Zois") end
end

-- One pass over every Zoi. on = add the own gender, not on = put back what was recorded.
function O.sweep(on)
    local E = inzoi.EB1GenderIdentity
    local chars, err = all_characters()
    if not chars then
        if not O.diag_logged then O.diag_logged = true; log("same-sex romance: " .. tostring(err)) end
        return
    end
    local changed, restored, failed = 0, 0, 0
    for _, ent in ipairs(chars) do
        local id = id_of(ent)
        local bio = id and bio_of(ent)
        if bio then
            local ok = pcall(function()
                local s = bio:GetGenderIdentitySetting()
                local gi = s.GenderIdentity
                if on then
                    if (gi == E.Male or gi == E.Female) and is_adult(bio) and not s.RomanceTargetList:Contains(gi) then
                        local before = list_mask(s.RomanceTargetList, E)
                        write_mask(bio, s, before + MASK[gi == E.Male and "Male" or "Female"], E)
                        if O.orig[id] == nil then O.orig[id] = before end
                        changed = changed + 1
                    end
                elseif O.orig[id] ~= nil then
                    write_mask(bio, s, O.orig[id], E)
                    O.orig[id] = nil
                    restored = restored + 1
                end
            end)
            if not ok then failed = failed + 1 end
        end
    end
    if changed > 0 or restored > 0 or failed > 0 then
        persist()
        log("same-sex romance: " .. (on and ("added to " .. changed) or ("restored " .. restored)) .. " Zois, " .. failed .. " could not be changed")
    end
end

-- called from the manager's poll
function O.tick(now)
    -- the saved record of changed Zois arrives from B1 shortly after loading; do not sweep (and save over it) before that
    O.started = O.started or now
    if not O.record_loaded and now - O.started < 20 then return end
    local on = C.cfg.orient == true
    if O.was_on == nil then
        O.was_on = on
        O.last_sweep = 0
    end
    if on ~= O.was_on then
        O.was_on = on
        O.last_sweep = 0
        log("same-sex romance " .. (on and "ON" or "OFF"))
    end
    if now - O.last_sweep < O.sweep_every then return end
    O.last_sweep = now
    if not on and next(O.orig) == nil then return end
    pcall(O.sweep, on)
end

return O
