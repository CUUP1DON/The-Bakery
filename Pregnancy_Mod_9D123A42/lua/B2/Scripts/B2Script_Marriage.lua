-- Chunk override for B2Script_Marriage.Condition_CanPregnancy.
-- Vanilla only accepts a pair with a female and a male. For a SAME-gender pair (both Youth or older, two
-- different Zois, the mod enabled for that pair type) we answer "true" unless the Zoi in question is
-- already pregnant, at the family limit, or otherwise cannot become pregnant. A pregnant Zoi is therefore
-- treated exactly like a pregnant woman in vanilla: the condition stays false and the pregnancy
-- interactions are not offered. Everything else (mixed pairs, no target, errors) is the original answer.

local C = require("Shared.SSPConfig")

local M = {}

local GROWTH_OK = { [32] = true, [64] = true, [128] = true, [256] = true } -- Youth, Adult, Old, Elderly

---@param entity_id FB1EntityId
local function bio_of(entity_id)
    local mgr = inzoi.getB2Manager("FB2EntityManager")
    ---@type FB2Character|nil
    local ch = mgr:FindCharacter(entity_id)
    if not ch then return nil end
    return ch:GetComponent(inzoi.EB2ComponentType.Bio)
end

-- true when the condition should pass for this same-gender pair
local function same_gender_ok(ctx)
    local sid, tid = ctx.SelfEntityId, ctx.TargetEntityId
    if sid == nil or tid == nil or sid.Value == tid.Value or tid.Value < 0 then return false end
    local sb, tb = bio_of(sid), bio_of(tid)
    if not sb or not tb then return false end
    local g = sb:GetGenderType()
    if g ~= tb:GetGenderType() or not C.gender_allowed(g) then return false end
    if not GROWTH_OK[sb:GetGrowthStep()] or not GROWTH_OK[tb:GetGrowthStep()] then return false end
    if sb:IsPregnant(false) then return false end            -- like a pregnant woman: not offered
    if not sb:CanPregnancyCheckFamilyCount() then return false end -- household / family limit
    return true
end

---@param InScriptContext FB2ScriptContext
---@param InConditionParam FB1Condition
---@return boolean
function M.Override_Condition_CanPregnancy(InScriptContext, InConditionParam)
    local original = inzoi.B2Script_Marriage.Condition_CanPregnancy(InScriptContext, InConditionParam)
    if original then return true end
    local ok, res = pcall(same_gender_ok, InScriptContext)
    if ok and res == true then return true end
    return original
end

return M
