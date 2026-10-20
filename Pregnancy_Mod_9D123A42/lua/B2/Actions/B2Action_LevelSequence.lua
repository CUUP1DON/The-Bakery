-- Chunk override for FB2Action_LevelSequence.
-- The vanilla birth cutscene (LevelSequence "Childbirth") only contains a female actor, so a male
-- mother shows an empty bed. For male mothers we skip the cutscene: the action finishes at once as a
-- normal success, so the birth's finish scripts (baby + naming dialog) still run. Every other
-- cutscene, and every female mother, plays exactly as vanilla. The setting "birthCutscene" = play (cfg.cut) turns the
-- skip off: the cutscene then plays for male mothers too (with the empty bed).

local C = require("Shared.SSPConfig")

local M = {}

local function is_male_mother(owner)
    local ok, male = pcall(function()
        local id = owner:GetSelfEntityId()
        local mgr = inzoi.getB2Manager("FB2EntityManager")
        local ch = mgr:FindCharacter(id)
        if not ch then return false end
        local app = ch:GetComponent(inzoi.EB2ComponentType.Appearance)
        return app ~= nil and app:GetAppearanceSetting().Gender == inzoi.EB1GenderType.Male
    end)
    return ok and male == true
end

---@param owner FB2Action_LevelSequence
function M.Override_OnPlay(owner)
    if string.lower(tostring(owner.LevelSequenceId)) == "childbirth" and C.cfg.cut ~= "play" and is_male_mother(owner) then
        owner:TryFinish(inzoi.EB2InteractionFailReason.None)
        return
    end
    inzoi.FB2Action_LevelSequence.OnPlay(owner)
end

return M
