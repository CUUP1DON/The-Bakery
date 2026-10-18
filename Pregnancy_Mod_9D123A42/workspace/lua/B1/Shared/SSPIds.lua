-- B1 shared list of live character entity ids (filled by Zoi/SSPBridge.lua, read by Main.lua).
-- B1 cannot ask for "the possessed Zoi" (entity.get_possessed is B2-only), so any live character is used
-- as the address for messages to B2: every character has the B2 receiver script.
local S = { ids = {} }

function S.add(id) S.ids[id] = true end
function S.remove(id) S.ids[id] = nil end

-- some live id, or nil
function S.any()
    return (next(S.ids))
end

return S
