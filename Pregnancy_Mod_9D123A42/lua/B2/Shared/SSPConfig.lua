-- Shared state for the same-sex pregnancy scripts (settings, recovery list, B1 relay).
-- require("Shared.SSPConfig") returns the same table in every B2 script of this mod.
--
-- Settings reach B2 through the B1 bridge (B1/Main.lua reads the UI's saved settings with
-- uimod.cfg_load, which is B1-only, and forwards them with inzoi.message.send_to_sim). The B2 Zoi script
-- Zoi/SSPBridge.lua receives them and calls apply_cfg/apply_recover below.

local C = {}

C.DEFAULTS = { allowMM = true, allowFF = true, mode = "random", both = 0, auto = true, npc = false }
C.cfg = { allowMM = true, allowFF = true, mode = "random", both = 0, auto = true, npc = false }
C.cfg_seen = false      -- true once B1 delivered settings at least once
C.relay_eid = nil       -- a Zoi entity id that has a B1 receiver script (learned from incoming messages)
C.recover = nil         -- list of { mother, partner, orig_m, orig_p } from the persisted pending swap

local function truthy(v) return v == "1" or v == "true" end

-- "allowMM=1;allowFF=1;mode=random;both=0;auto=1;npc=0" (keys that are missing keep their default)
function C.apply_cfg(s)
    if type(s) ~= "string" then return end
    local c = { allowMM = C.DEFAULTS.allowMM, allowFF = C.DEFAULTS.allowFF, mode = C.DEFAULTS.mode,
        both = C.DEFAULTS.both, auto = C.DEFAULTS.auto, npc = C.DEFAULTS.npc }
    for k, v in string.gmatch(s, "(%w+)=([^;]*)") do
        if k == "allowMM" then c.allowMM = truthy(v)
        elseif k == "allowFF" then c.allowFF = truthy(v)
        elseif k == "auto" then c.auto = truthy(v)
        elseif k == "npc" then c.npc = truthy(v)
        elseif k == "mode" then
            if v == "self" then v = "you" end
            if v == "random" or v == "you" or v == "target" then c.mode = v end
        elseif k == "both" then
            local n = tonumber(v) or 0
            if n < 0 then n = 0 elseif n > 100 then n = 100 end
            c.both = n
        end
    end
    local changed = not C.cfg_seen or c.allowMM ~= C.cfg.allowMM or c.allowFF ~= C.cfg.allowFF
        or c.mode ~= C.cfg.mode or c.both ~= C.cfg.both or c.auto ~= C.cfg.auto or c.npc ~= C.cfg.npc
    C.cfg = c
    C.cfg_seen = true
    return changed
end

-- "mother,partner,origM,origP_mother,partner,origM,origP" (numbers only; "none" = nothing pending)
function C.apply_recover(s)
    if type(s) ~= "string" or s == "" or s == "none" then return end
    if C.recover or C.recover_done then return end -- already queued / already handled this session
    local list = {}
    for entry in string.gmatch(s, "[^_]+") do
        local m, p, om, op = string.match(entry, "^(%d+),(%d+),(%d+),(%d+)$")
        if m then list[#list + 1] = { mother = tonumber(m), partner = tonumber(p), orig_m = tonumber(om), orig_p = tonumber(op) } end
    end
    if #list > 0 then C.recover = list end
end

local function clean(s) return (tostring(s):gsub("[^%w%.:,_%-]", "_")) end

-- Send a message to the B1 side (needs an entity id that has a B1 script; learned from incoming messages).
function C.to_client(kind, content)
    if not C.relay_eid then return false end
    local ok = pcall(function() inzoi.message.send_to_client(C.relay_eid, kind, clean(content)) end)
    return ok
end

-- Ask a B1 receiver to run the CLI toast.clear (B1Standalone: only runs on the client side). Tries the known relay
-- Zoi first, then any extra Zoi ids given (every Zoi has the B1 receiver script). Never throws.
function C.toast_clear(extra_ids)
    local sent = false
    local function try(id)
        if id and pcall(function() inzoi.message.send_to_client(id, "ssp_toastclear", "1") end) then sent = true end
    end
    try(C.relay_eid)
    if extra_ids then
        for _, id in ipairs(extra_ids) do if id ~= C.relay_eid then try(id) end end
    end
    pcall(function() inzoi.cli.execute("toast.clear") end) -- may be refused on the B2 side; harmless
    return sent
end

-- Persist the pending gender swaps so a crash / quit mid-swap can be repaired on the next start.
function C.persist(pending)
    local parts = {}
    for mother, p in pairs(pending) do
        parts[#parts + 1] = tostring(mother) .. "," .. tostring(p.partner) .. "," .. tostring(p.orig_m) .. "," .. tostring(p.orig_p)
    end
    C.to_client("ssp_pending", #parts > 0 and table.concat(parts, "_") or "none")
end

function C.gender_allowed(g)
    if g == 3 then return C.cfg.allowMM end -- Male
    if g == 2 then return C.cfg.allowFF end -- Female
    return false
end

return C
