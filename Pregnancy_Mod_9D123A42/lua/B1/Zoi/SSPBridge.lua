-- B1 Zoi script (key "*"): receives messages B2 sends with inzoi.message.send_to_client and persists them
-- through the B1-only uimod.cfg_save. Only the Zoi that the message is addressed to receives it.

local MOD = "Pregnancy_Mod_9D123A42"
local Ids = require("Shared.SSPIds")

local M = {}

local function clean(s) return (tostring(s):gsub("[^%w%.:,_%-]", "_")) end

---@param self table
---@param owner any
function M.on_begin(self, owner)
    local ok, id = pcall(function() return owner:GetEntityId() end)
    id = ok and tonumber(tostring(id)) or nil
    if id and id > 0 then
        self.eid = id
        Ids.add(id)
    end
end

---@param self table
---@param owner any
function M.on_end(self, owner)
    if self.eid then Ids.remove(self.eid) end
end

---@param self table
---@param owner any
---@param kind string
---@param content string
function M.on_lua_message(self, owner, kind, content)
    if kind == "ssp_toastclear" then
        -- the cheat toast shows a few frames after the cheat runs and lasts 5 s: clear now and on every tick for 4 s
        Ids.toast_until = os.clock() + 4.0
        pcall(function() inzoi.cli.execute("toast.clear") end)
    elseif kind == "ssp_pending" then
        inzoi.cli.execute("uimod.cfg_save mod_id=" .. MOD .. " section=settings key=ssp_pending value=" .. clean(content))
    elseif kind == "ssp_orient" then
        inzoi.cli.execute("uimod.cfg_save mod_id=" .. MOD .. " section=settings key=ssp_orient value=" .. clean(content))
    elseif kind == "ssp_log" then
        inzoi.cli.execute("uimod.cfg_save mod_id=" .. MOD .. " section=log key=ssp_last value=" .. clean(content))
    end
end

return M
