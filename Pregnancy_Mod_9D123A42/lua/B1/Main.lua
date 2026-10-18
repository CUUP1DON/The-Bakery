-- B1 side of the settings bridge. B2 (simulation) Lua cannot run uimod.cfg_load (B1-only), so this boot
-- script reads the settings the UI window saved (uimod.cfg_save section "settings" key "config") and
-- forwards them to B2 with inzoi.message.send_to_sim. It also forwards a pending gender-swap record
-- (key "ssp_pending", written by Zoi/SSPBridge.lua when B2 asks) so a swap can be repaired after a crash.
-- Nothing here depends on the UI being open; unreadable settings simply leave the B2 defaults in place.

local Ids = require("Shared.SSPIds")
local Unmarried = require("Shared.SSPUnmarried")
local Npc = require("Shared.SSPNpc")

local MOD = "Pregnancy_Mod_9D123A42"
local POLL = 4.0       -- seconds between reads of the settings file
local RESEND = 30.0    -- push the settings again at least this often (covers B2 reloads / late load)
local CLOSE_POLL = 0.5 -- seconds between checks for a window close request

local M = {}

local function load_key(key)
    local ok, _, data = inzoi.cli.execute("uimod.cfg_load mod_id=" .. MOD .. " section=settings key=" .. key)
    if ok and type(data) == "string" then return data end
    return nil
end

-- The saved value is a JSON string inside the cfg_load JSON, so quotes may be escaped; the patterns
-- tolerate an optional backslash before each quote.
local function build_cfg_message(data)
    local parts = {}
    local v = string.match(data, 'allowMM\\?"%s*:%s*(%a+)')
    if v then parts[#parts + 1] = "allowMM=" .. (v == "true" and "1" or "0") end
    v = string.match(data, 'allowFF\\?"%s*:%s*(%a+)')
    if v then parts[#parts + 1] = "allowFF=" .. (v == "true" and "1" or "0") end
    v = string.match(data, 'autonomy\\?"%s*:%s*(%a+)')
    if v then parts[#parts + 1] = "auto=" .. (v == "true" and "1" or "0") end
    v = string.match(data, 'motherMode\\?"%s*:%s*\\?"(%a+)')
    if v then parts[#parts + 1] = "mode=" .. v end
    v = string.match(data, 'bothChance\\?"%s*:%s*([%d%.]+)')
    if v then parts[#parts + 1] = "both=" .. v end
    v = string.match(data, 'npcCouples\\?"%s*:%s*\\?"(%a+)')
    parts[#parts + 1] = "npc=" .. ((v == "on") and "1" or "0")
    return table.concat(parts, ";")
end

-- Data-side settings (B1 only: data.patch). Applied at boot after the first successful read and then only
-- when a value changes. A failed apply is retried on the next poll.
local function apply_data_settings(self, data)
    local u = Unmarried.normalize(string.match(data, 'unmarried\\?"%s*:%s*\\?"(%a+)'))
    if self.applied_unmarried ~= u then
        local ok, done = pcall(Unmarried.apply, u)
        if ok and done then self.applied_unmarried = u end
    end
    local on = string.match(data, 'npcCouples\\?"%s*:%s*\\?"(%a+)') == "on"
    if self.applied_npc ~= on then
        local ok, done = pcall(Npc.apply, on)
        if ok and done then self.applied_npc = on end
    end
end

local function pending_record()
    local data = load_key("ssp_pending")
    if not data then return nil end
    local v = string.match(data, '"value"%s*:%s*\\?"([%w,_:]*)')
    if v and v ~= "" and v ~= "none" then return v end
    return nil
end

-- A hidden mod view keeps swallowing clicks; only destroying it frees the input. The page cannot destroy itself
-- (that crashes the game), so on X / auto-close it saves a stamp under "close_req" and this reloads the view from
-- the game tick, outside the page.
local function close_stamp()
    local data = load_key("close_req")
    if not data then return nil end
    return string.match(data, '"value"%s*:%s*\\?"?(%d+)')
end

local function check_close(self)
    local stamp = close_stamp()
    if not stamp or stamp == self.close_seen then return end
    self.close_seen = stamp
    inzoi.cli.execute("uimod.remount mod_id=" .. MOD)
end

-- The page's own timers freeze when build mode starts, so the page can never finish closing itself there. Watch
-- for build mode from here instead and reload the view the moment it begins (harmless if the window is closed).
local function check_build(self)
    local ok, _, data = inzoi.cli.execute("build.get_mode_state")
    if not ok or type(data) ~= "string" then return end
    local building = string.find(data, '"in_build_mode"%s*:%s*true') ~= nil
        or string.find(data, '"pending"%s*:%s*true') ~= nil
    if building and not self.was_building then
        inzoi.cli.execute("uimod.remount mod_id=" .. MOD)
    end
    self.was_building = building
end

local function push(self)
    local eid = Ids.any()
    if not eid then return end
    local data = load_key("config")
    pcall(apply_data_settings, self, data or "")
    local msg = data and build_cfg_message(data)
    if msg and (msg ~= self.last or self.since >= RESEND) then
        local ok = pcall(function() inzoi.message.send_to_sim(eid, "ssp_cfg", msg) end)
        if ok then self.last = msg; self.since = 0 end
    end
    local rec = pending_record()
    if rec then pcall(function() inzoi.message.send_to_sim(eid, "ssp_recover", rec) end) end
end

---@param self table
function M.on_begin(self)
    self.acc = POLL -- first push as soon as a character exists
    self.since = RESEND
    self.last = nil
    self.applied_unmarried = nil
    self.applied_npc = nil
    self.close_acc = 0
    self.close_seen = false -- a stamp left by an earlier session is read here so it is not acted on
    pcall(function() self.close_seen = close_stamp() or false end)
end

---@param self table
---@param dt number
function M.on_tick(self, dt)
    self.acc = (self.acc or 0) + dt
    self.since = (self.since or 0) + dt
    self.close_acc = (self.close_acc or 0) + dt
    if self.close_acc >= CLOSE_POLL then
        self.close_acc = 0
        pcall(check_close, self)
        pcall(check_build, self)
    end
    if self.acc < POLL then return end
    self.acc = 0
    pcall(push, self)
end

---@param self table
function M.on_end(self) end

return M
