-- Zoi script (key "*"): receives the settings / recovery messages that B1/Main.lua sends with
-- inzoi.message.send_to_sim. Only the one Zoi the message is addressed to gets it; the rest stay idle.

local C = require("Shared.SSPConfig")

local M = {}

---@param self table
---@param owner FB2Character
function M.on_begin(self, owner) end

---@param self table
---@param owner FB2Character
---@param kind string
---@param content string
function M.on_lua_message(self, owner, kind, content)
    if kind ~= "ssp_cfg" and kind ~= "ssp_recover" then return end
    local ok, id = pcall(function() return owner:GetEntityId() end)
    if ok then
        -- GetEntityId may return a plain number or an FB1EntityId struct
        id = type(id) == "number" and id or tonumber(tostring(id))
        if id and id > 0 then C.relay_eid = id end
    end
    if kind == "ssp_cfg" then
        if C.apply_cfg(content) then
            local c = C.cfg
            print("[SameSexPregnancy]", "settings updated: allowMM=" .. tostring(c.allowMM) .. " allowFF=" .. tostring(c.allowFF)
                .. " mode=" .. c.mode .. " both=" .. tostring(c.both) .. " autonomy=" .. tostring(c.auto) .. " npc=" .. tostring(c.npc))
        end
    else
        C.apply_recover(content)
    end
end

---@param self table
---@param owner FB2Character
function M.on_end(self, owner) end

return M
