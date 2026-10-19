-- Zoi script (key "*"): receives the settings / recovery messages that B1/Main.lua sends with
-- inzoi.message.send_to_sim. Only the one Zoi the message is addressed to gets it; the rest stay idle.

local C = require("Shared.SSPConfig")

local M = {}

-- Cheats page: move an expecting Zoi forward to a trimester (the game has no way back). B1 forwards the request
-- (page -> cfg "stage_req" -> B1/Main.lua -> send_to_sim to this Zoi) and the state is advanced here, one
-- ProceedToNextPregnancyState at a time, checking after each call that the state really changed.
local STATE_ORDER = { PregnancyTest = 0, PregnancyEarly = 1, PregnancyMid = 2, PregnancyLate = 3, ImminentBirth = 4 }

local function note(line)
    print("[SameSexPregnancy]", line)
    C.add_log(os.date("%H:%M:%S") .. " " .. line)
end

local function advance_stage(owner, want)
    local target = STATE_ORDER[want]
    if not target then note("stage request ignored, unknown stage " .. tostring(want)); return end
    local ok, bio = pcall(function() return owner:GetComponent(inzoi.EB2ComponentType.Bio) end)
    if not ok or not bio then note("stage request: no Bio component"); return end
    for _ = 1, 4 do
        local cur = tostring(bio:GetCurrentPregnancyState())
        local rank = STATE_ORDER[cur]
        if rank == nil then note("stage request: not expecting (state " .. cur .. ")"); return end
        if rank >= target then note("stage: now " .. cur); return end
        local okp, err = pcall(function() bio:ProceedToNextPregnancyState() end)
        local after = tostring(bio:GetCurrentPregnancyState())
        if not okp or after == cur then note("stage: no change after proceeding from " .. cur .. " " .. tostring(err)); return end
        note("stage: " .. cur .. " -> " .. after)
    end
end

---@param self table
---@param owner FB2Character
function M.on_begin(self, owner) end

---@param self table
---@param owner FB2Character
---@param kind string
---@param content string
function M.on_lua_message(self, owner, kind, content)
    if kind ~= "ssp_cfg" and kind ~= "ssp_recover" and kind ~= "ssp_stage" then return end
    local ok, id = pcall(function() return owner:GetEntityId() end)
    if ok then
        -- GetEntityId may return a plain number or an FB1EntityId struct
        id = type(id) == "number" and id or tonumber(tostring(id))
        if id and id > 0 then C.relay_eid = id end
    end
    if kind == "ssp_stage" then
        advance_stage(owner, content)
        return
    end
    if kind == "ssp_cfg" then
        if C.apply_cfg(content) then
            local c = C.cfg
            local line = "settings updated: allowMM=" .. tostring(c.allowMM) .. " allowFF=" .. tostring(c.allowFF)
                .. " mode=" .. c.mode .. " both=" .. tostring(c.both) .. " autonomy=" .. tostring(c.auto) .. " npc=" .. tostring(c.npc) .. " fail=" .. tostring(c.fail) .. " cutscene=" .. c.cut
            print("[SameSexPregnancy]", line)
            C.add_log(os.date("%H:%M:%S") .. " " .. line)
        end
    else
        C.apply_recover(content)
    end
end

---@param self table
---@param owner FB2Character
function M.on_end(self, owner) end

return M
