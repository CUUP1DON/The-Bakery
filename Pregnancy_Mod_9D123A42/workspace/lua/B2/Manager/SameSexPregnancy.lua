-- Same-sex pregnancy (Manager script bound to the Time manager so it can tick).
--
-- Findings:
--   * Execute_Pregnancy S1 = Prepare | Start | Proceed | Cancel. Prepare stores the father's
--     genetics and "the FEMALE between Self/Target" receives them, so same-sex pairs fail.
--   * Pregnancy is only real once the state reaches PregnancyEarly (genetics locked in). Reverting
--     the temporary gender swap earlier makes the pregnancy vanish after the "test".
--   * The birth cutscene (LevelSequence "Childbirth") only contains a female actor; for male mothers it is
--     skipped by the chunk override in Actions/B2Action_LevelSequence.lua.
--
-- Flow: bed result (target = bed, partner resolved from the talk) -> check settings + eligibility -> pick the
-- mother -> set mother Female / partner Male (simulation side only) -> Prepare + PregnancyTest_Success buff (its add-script starts the pregnancy, so the player gets the test prompt) -> KEEP the swap ->
-- watch the mother's pregnancy state -> restore both genders once it leaves PregnancyTest.
-- M+F pairs are never touched. Marriage is never checked (partner is passed explicitly).
--
-- Settings (allowMM/allowFF/motherMode/bothChance/autonomy) come from the UI window's saved config through
-- the B1 bridge (B1/Main.lua -> Zoi/SSPBridge.lua -> Shared/SSPConfig.lua). Unreadable = defaults.
-- The pending swap is persisted through the same bridge so a crash or quit mid-swap is repaired next start.

local C = require("Shared.SSPConfig")

local CONFIG = {
    -- InteractionBag ids. "fire" bags are the bed results (Success = the game's roll won, Fail = it lost; the
    -- game can never win for a same-gender pair, so both end the attempt). "arm" bags are the talk
    -- interactions before the bed; if no bed result follows within arm_fallback seconds, they fire instead.
    fire_bags = {
        LayDownOnBed_Left_TryToHaveChildren_Success = true,
        LayDownOnBed_Right_TryToHaveChildren_Success = true,
        LayDownOnBed_Left_TryToHaveChildren_Fail = true,
        LayDownOnBed_Right_TryToHaveChildren_Fail = true,
    },
    arm_bags = {
        Co_TryToHaveChildren = true,
        Co_TryToHaveChildren_NoSpouse = true,
        Co_TryToHaveChildren_NPC = true,    -- town NPC couples (only reachable for same-sex pairs when npcCouples is on)
    },
    arm_fallback = 90.0,                    -- seconds (real time) to wait for a bed result after the talk
    pair_lock = 120.0,                      -- seconds to ignore further events for the same pair
    discover = false,                        -- log baby/romance-related interaction ids
    skip_test_state = false,                -- true: call ProceedToNextPregnancyState right after Start
    poll_interval = 1.0,                    -- seconds between state checks
    unconfirmed_timeout = 15.0,             -- restore if the mother never became pregnant (seconds after the last start attempt)
    stage_wait = 8.0,                       -- seconds to wait for a start route to show a pregnancy before trying the next one (the buff is applied on the next game tick)
    swap_wait = 4.0,                        -- seconds between the gender swap and Prepare/Start: the swap only takes effect some ticks later, an earlier Start is a silent no-op (1.5 s failed intermittently live, 4+ s worked for possessed and unpossessed mothers)
    pair_memory = 900.0,                    -- seconds an armed pair (talk event) stays usable to resolve a bed event
    test_buff = "PregnancyTest_Success",    -- vanilla buff: its add-script runs Pregnancy Start (state PregnancyTest) and shows the toilet test
    failsafe_timeout = 0,                   -- >0: still in PregnancyTest after this many seconds -> advance the state once. 0 = never (a pregnancy is only confirmed by the test)
    allow_cli_fallback = false,             -- true: after all test-flow attempts fail, use the CLI get_baby_with (cheat toast, goes straight to PregnancyEarly = NO test)
    route1_retries = 2,                     -- extra attempts of the test flow (Prepare + Start + test buff) before giving up
    restore_give_up = 3600.0,               -- stop retrying an unverifiable restore after this long (record stays saved)
    mixed_detect_timeout = 300.0,           -- man+woman: wait this long for the vanilla pregnancy to appear
    mixed_test_timeout = 1800.0,            -- man+woman: wait this long for her state to pass PregnancyTest
}

local GROWTH_OK = { [32] = true, [64] = true, [128] = true, [256] = true } -- Youth, Adult, Old, Elderly

local M = {}

-- toast.clear (via the B1 relay) right now and at +0.3/+0.8/+1.5/+3 s: call around ANY cheat-flagged CLI call
-- (the cheat toast must never stay on screen). The delayed ones are sent from on_tick.
function M.toast_guard(self, ids)
    C.toast_clear(ids)
    local t = os.clock()
    self.toast_q = self.toast_q or {}
    for _, d in ipairs({ 0.3, 0.8, 1.5, 3.0 }) do
        self.toast_q[#self.toast_q + 1] = { t = t + d, ids = ids }
    end
end

if not C.seeded then
    C.seeded = true
    math.randomseed(os.time())
end

-- Log to the console AND relay the line to the B1 side (written to cfg log/ssp_last for tooling).
local function log(...)
    local parts = {}
    for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
    local line = os.date("%H:%M:%S") .. " " .. table.concat(parts, " ")
    print("[SameSexPregnancy]", line)
end

-- ---------------------------------------------------------------- helpers

local function make_id(n)
    -- FB1EntityId is a struct with an int64 Value. Fall back to the raw number if construction fails.
    local ok, id = pcall(function()
        local e = inzoi.FB1EntityId()
        e.Value = n
        return e
    end)
    if ok and id then return id end
    return n
end

local function find_comp(entity_id, comp_type)
    local ok, comp = pcall(function()
        local mgr = inzoi.getB2Manager("FB2EntityManager")
        local ch = mgr:FindCharacter(make_id(entity_id)) -- FindCharacter needs an FB1EntityId, not a number
        if not ch then return nil end
        return ch:GetComponent(comp_type)
    end)
    if not ok then
        log("find_comp failed", entity_id, comp)
        return nil
    end
    return comp
end

local function find_bio(entity_id)
    return find_comp(entity_id, inzoi.EB2ComponentType.Bio)
end

local function get_gender(bio)
    local ok, g = pcall(function() return bio:GetGenderType() end)
    if ok then return g end
    return nil
end

local function set_gender(bio, g)
    local ok, err = pcall(function() bio:SetGenderType(g) end)
    if not ok then log("SetGenderType failed", err) end
    return ok
end

local function is_pregnant(bio)
    local ok, p = pcall(function() return bio:IsPregnant(false) end)
    return ok and p == true
end

local function pregnancy_state(bio)
    local ok, s = pcall(function() return bio:GetCurrentPregnancyState() end)
    if not ok or s == nil then return "" end
    local str = tostring(s)
    if str == "None" then return "" end
    return str
end

local function is_youth_plus(bio)
    local ok, g = pcall(function() return bio:GetGrowthStep() end)
    return ok and GROWTH_OK[g] == true
end

-- The game's own family-size check (household member limit). Treated as OK when it cannot be queried.
local function family_ok(bio)
    local ok, r = pcall(function() return bio:CanPregnancyCheckFamilyCount() end)
    if not ok then return true end
    return r == true
end

-- Can this Zoi (bio) become the mother right now?
local function can_carry(bio)
    return not is_pregnant(bio) and family_ok(bio)
end

local function is_possessed(id)
    local ok, r = pcall(function() return inzoi.entity.is_possessed(id) end)
    return ok and r == true
end

-- Run the game's own Execute_Pregnancy (Prepare stores the father's genetics). The context must be built with
-- the (Self, Target, Reason) constructor overload; the no-argument call is what failed in the live log.
local function run_pregnancy_instruction(self_id, target_id, instruction)
    local ok, err = pcall(function()
        local ctx = inzoi.FB2ScriptContext(make_id(self_id), make_id(target_id), inzoi.EB1ScriptReason.Talk)
        local ex = inzoi.FB1Execute()
        ex.BaseObject = inzoi.EB1BaseObject.Self
        ex.Command = inzoi.EB1ExecuteType.Pregnancy
        ex.S1 = instruction
        ex.S2 = "None"
        ex.F1 = 0
        ex.F2 = 0
        ex.Prob = 1
        inzoi.B2Script_Marriage.Execute_Pregnancy(ctx, ex)
    end)
    log("Execute_Pregnancy " .. instruction, ok, err)
    return ok
end

-- Pure-Lua version of the vanilla AddBuff execute: FB2Script_Buff.Execute_AddBuff with the mother as Self.
-- (FB2BuffComponent:AddBuff / AddBuffImmediately return success but are silent no-ops from Lua - verified live;
-- the script path queues the buff, it shows up on the next game tick and its add-script then runs Pregnancy Start.)
local function add_test_buff(mother_id, partner_id)
    local ok, err = pcall(function()
        local ctx = inzoi.FB2ScriptContext(make_id(mother_id), make_id(partner_id), inzoi.EB1ScriptReason.Talk)
        local ex = inzoi.FB1Execute()
        ex.BaseObject = inzoi.EB1BaseObject.Self
        ex.Command = inzoi.EB1ExecuteType.AddBuff
        ex.S1 = CONFIG.test_buff
        ex.S2 = "None"
        ex.F1 = 0
        ex.F2 = 0
        ex.Prob = 1
        inzoi.FB2Script_Buff.Execute_AddBuff(ctx, ex)
    end)
    log("Execute_AddBuff " .. CONFIG.test_buff, ok, err)
    return ok
end

local function has_test_buff(mother_id)
    local ok, r = pcall(function()
        local buff = find_comp(mother_id, inzoi.EB2ComponentType.Buff)
        return buff ~= nil and buff:HasBuff(CONFIG.test_buff)
    end)
    return ok and r == true
end

-- ---------------------------------------------------------------- pending gender swaps

local function involved(self, id)
    for mother, p in pairs(self.pending) do
        if mother == id or p.partner == id then return true end
    end
    for _, q in ipairs(self.queue) do
        if q.mother == id or q.partner == id then return true end
    end
    return false
end

-- Put one Zoi back to its original gender and read it back. Always re-finds the component (a handle kept
-- from earlier can be stale).
local function put_back(entity_id, orig)
    if not orig then return true end
    local bio = find_bio(entity_id)
    if not bio then return false end
    if get_gender(bio) ~= orig then set_gender(bio, orig) end
    return get_gender(bio) == orig
end

-- Restore both genders. The pending record (and the persisted one) is only cleared once BOTH were verified;
-- otherwise it stays and on_tick retries until restore_give_up.
local function restore(self, mother_id, reason)
    local p = self.pending[mother_id]
    if not p then return false end
    p.restoring = p.restoring or os.clock()
    p.reason = reason
    local okm = put_back(mother_id, p.orig_m)
    local okp = put_back(p.partner, p.orig_p)
    if okm and okp then
        self.pending[mother_id] = nil
        C.persist(self.pending)
        log("genders restored (" .. reason .. ") mother=" .. tostring(mother_id) .. " partner=" .. tostring(p.partner))
        return true
    end
    log("restore NOT verified (" .. reason .. "), will retry", mother_id, p.partner, tostring(okm), tostring(okp))
    return false
end

local function start_pregnancy(self, mother, partner)
    if self.pending[mother] then return false end
    local mbio, pbio = find_bio(mother), find_bio(partner)
    if not mbio or not pbio then
        log("missing bio component", mother, partner)
        return false
    end
    if is_pregnant(mbio) then
        log("mother already pregnant, skipping", mother)
        return false
    end
    if not family_ok(mbio) then
        log("family/household limit reached, skipping", mother)
        return false
    end

    local orig_m, orig_p = get_gender(mbio), get_gender(pbio)
    if not orig_m or not orig_p then
        log("could not read genders, skipping", mother, partner)
        return false
    end
    local female, male = inzoi.EB1GenderType.Female, inzoi.EB1GenderType.Male
    log("roles: mother", mother, tostring(orig_m), "-> Female; partner", partner, tostring(orig_p), "-> Male")

    set_gender(mbio, female)
    set_gender(pbio, male)
    self.pending[mother] = {
        partner = partner, orig_m = orig_m, orig_p = orig_p,
        t0 = os.clock(), proceeded = false,
    }
    C.persist(self.pending) -- recorded BEFORE starting so a crash always leaves a repair record

    -- Route 1 (pure Lua, no cheat toast), begun by begin_route1 from on_tick once the swap has taken effect
    -- (swap_wait later): Execute_Pregnancy Prepare, then the vanilla PregnancyTest_Success buff via
    -- Execute_AddBuff. The buff's add-script (Add_Pregnancy) runs "Pregnancy Start" itself -> state PregnancyTest ->
    -- the player gets the "!" prompt and the toilet test; using the toilet removes the buff -> Proceed -> PregnancyEarly.
    local p = self.pending[mother]
    p.stage = 0
    p.swap_t = os.clock()
    return true
end

-- Remove the test buff WITHOUT its finish script (IsCanceled=true; the finish script would Proceed the pregnancy).
-- A leftover buff from an earlier attempt makes Execute_AddBuff a no-op (no add-script, no Start), so it is removed
-- before every (re)try and when giving up.
local function remove_test_buff(mother_id)
    local ok, err = pcall(function()
        local buff = find_comp(mother_id, inzoi.EB2ComponentType.Buff)
        if buff and buff:HasBuff(CONFIG.test_buff) then
            buff:RemoveBuff(CONFIG.test_buff, true)
            pcall(function() buff:FlushBuffCommands() end)
        end
    end)
    if not ok then log("remove test buff failed", err) end
    return ok
end

local function diag(mother, mbio)
    local function q(fn) local ok, r = pcall(fn); return ok and tostring(r) or "?" end
    return "isPregnant(true)=" .. q(function() return mbio:IsPregnant(true) end)
        .. " possessed=" .. tostring(is_possessed(mother))
        .. " familyOk=" .. tostring(family_ok(mbio))
        .. " growth=" .. q(function() return mbio:GetGrowthStep() end)
end

-- One run of the test flow: re-check the swap, Prepare (father = partner), [Start], test buff.
local function run_test_flow(self, mother, p, with_start)
    local mbio, pbio = find_bio(mother), find_bio(p.partner)
    local female, male = inzoi.EB1GenderType.Female, inzoi.EB1GenderType.Male
    if mbio and get_gender(mbio) ~= female then set_gender(mbio, female) end
    if pbio and get_gender(pbio) ~= male then set_gender(pbio, male) end
    log("swap read-back: mother", tostring(mbio and get_gender(mbio)), "partner", tostring(pbio and get_gender(pbio)),
        mbio and diag(mother, mbio) or "")
    p.last_try = os.clock()
    if is_possessed(mother) or is_possessed(p.partner) then
        log("possessed Zoi in the pair (mother " .. tostring(is_possessed(mother)) .. ", partner " .. tostring(is_possessed(p.partner)) .. "): relying on the long swap wait (" .. CONFIG.swap_wait .. " s)")
    end
    local prepared = run_pregnancy_instruction(p.partner, mother, "Prepare")
    if with_start then run_pregnancy_instruction(mother, p.partner, "Start") end
    if prepared and add_test_buff(mother, p.partner) then
        p.route = "Execute_Pregnancy Prepare" .. (with_start and " + Start" or "") .. " + Execute_AddBuff " .. CONFIG.test_buff
        log("start route: " .. p.route)
    else
        p.last_try = -1e9 -- nothing took: go straight to the retry
    end
end

local function begin_route1(self, mother, p)
    -- a stale test buff would swallow the AddBuff: clear it and give the game a tick before starting
    if not p.cleaned and has_test_buff(mother) then
        p.cleaned = true
        remove_test_buff(mother)
        p.swap_t = os.clock()
        log("removed a stale " .. CONFIG.test_buff .. " buff from", mother, "- starting after another swap_wait")
        return
    end
    p.stage = 1
    run_test_flow(self, mother, p, false)
end

-- Next step when the previous try produced no pregnancy test within its wait. Stages 2..(1+route1_retries) are
-- retries of the test flow: the test buff is removed first, then after a longer wait (swap_wait * attempt) the flow runs
-- again (the last retry also calls Execute_Pregnancy Start). All end in state PregnancyTest + buff. Returns false when
-- nothing is left (on_tick then restores the genders and logs the failure). The CLI (cheat toast, straight to
-- PregnancyEarly, NO test) only runs if allow_cli_fallback is on.
local function next_start_route(self, mother, p)
    local mbio = find_bio(mother)
    if not mbio then return false end
    local last_retry = 1 + CONFIG.route1_retries
    if p.stage <= last_retry then
        p.stage = p.stage + 1
        if p.stage <= last_retry then
            remove_test_buff(mother)
            p.retry_at = os.clock() + CONFIG.swap_wait * (p.stage - 1)
            p.last_try = nil
            log("test flow attempt " .. (p.stage) .. " scheduled; " .. diag(mother, mbio))
            return true
        end
    end
    if CONFIG.allow_cli_fallback and not p.cli_done then
        p.cli_done = true
        p.stage = last_retry + 1
        p.last_try = os.clock()
        M.toast_guard(self, { mother, p.partner })
        local ok, msg = inzoi.cli.execute(
            "pregnancy_and_birth.get_baby_with entity_id=" .. tostring(mother) .. " partner_id=" .. tostring(p.partner))
        M.toast_guard(self, { mother, p.partner })
        p.route = "CLI pregnancy_and_birth.get_baby_with (cheat toast, no pregnancy test)"
        log("start route: " .. p.route, ok, msg)
        return true
    end
    return false
end

-- ---------------------------------------------------------------- interaction hook

local function looks_baby_related(name)
    local l = string.lower(name)
    -- lua patterns have no alternation; check each keyword
    return string.find(l, "child", 1, true) or string.find(l, "baby", 1, true)
        or string.find(l, "preg", 1, true) or string.find(l, "woohoo", 1, true)
        or string.find(l, "intimate", 1, true) or string.find(l, "romance", 1, true)
        or string.find(l, "kiss", 1, true) or string.find(l, "sex", 1, true)
end

-- An attempt for this pair ended (bed result, or the talk's fallback timer). Decide and start.
local function is_npc_pair(a, b)
    local ok, r = pcall(function() return inzoi.entity.is_npc(a) and inzoi.entity.is_npc(b) end)
    return ok and r == true
end

local function attempt_allowed(a, b)
    -- npcCouples is its own switch: two town NPCs (not played) count when it is on, whatever "autonomy" says
    if C.cfg.npc and is_npc_pair(a, b) then return true end
    -- autonomy off = Zois do not suggest it on their own; attempts the player directs (a possessed partner) still count
    return C.cfg.auto or is_possessed(a) or is_possessed(b)
end

local function handle_attempt(self, a, b)
    if not attempt_allowed(a, b) then return end
    local key = math.min(a, b) .. ":" .. math.max(a, b)
    local now = os.clock()
    if self.locked[key] and now - self.locked[key] < CONFIG.pair_lock then return end
    self.locked[key] = now -- double-fire guard: both participants' events + talk and bed events land here
    self.armed[key] = nil

    if a == b or involved(self, a) or involved(self, b) then return end
    local ba, bb = find_bio(a), find_bio(b)
    if not ba or not bb then return end
    local ga, gb = get_gender(ba), get_gender(bb)
    log("pair genders", tostring(ga), tostring(gb))
    if not ga or not gb then return end
    if ga ~= gb then
        -- mixed pair: vanilla handles the woman. Only when bothChance > 0 do we watch for a second,
        -- additional pregnancy for the man (started later, see process_mixed).
        if C.cfg.both > 0 and ((ga == 2 and gb == 3) or (ga == 3 and gb == 2)) then
            local woman, man = a, b
            if ga == 3 then woman, man = b, a end
            local wbio = (woman == a) and ba or bb
            local mbio = (man == a) and ba or bb
            if is_youth_plus(wbio) and is_youth_plus(mbio) then
                if is_pregnant(wbio) or is_pregnant(mbio) then
                    log("man+woman: someone is already pregnant, not watching", woman, man)
                else
                    self.mixed[woman] = { woman = woman, man = man, t0 = now, rolled = false, hit = false }
                    log("man+woman attempt watched: woman", woman, "man", man, "bothChance", C.cfg.both)
                end
            end
        end
        return
    end
    if not C.gender_allowed(ga) then
        log("pair type disabled in settings")
        return
    end
    if not is_youth_plus(ba) or not is_youth_plus(bb) then
        log("both Zois must be Youth or older")
        return
    end
    if is_pregnant(ba) or is_pregnant(bb) then
        log("same-gender pair: one partner is already pregnant, skipping (no swap, no fallback)", a, b)
        return
    end

    -- who is "you" (the possessed Zoi if it is one of the pair, else the Zoi that finished first)
    local you, other = a, b
    if is_possessed(b) and not is_possessed(a) then you, other = b, a end
    local first, second
    local mode = C.cfg.mode
    if C.cfg.npc and is_npc_pair(a, b) then mode = "random" end -- nobody is "you" in an NPC couple
    if mode == "you" then first, second = you, other
    elseif mode == "target" then first, second = other, you
    elseif math.random() < 0.5 then first, second = you, other
    else first, second = other, you end

    local bio_of = { [a] = ba, [b] = bb }
    if not family_ok(bio_of[first]) then
        -- neither is pregnant here, so the only reason is the household / family limit
        if mode == "random" and family_ok(bio_of[second]) then
            first, second = second, first
        else
            log("chosen carrier is at the household / family limit", first)
            return
        end
    end

    log("attempt: mother", first, "partner", second, "mode", mode, "both%", C.cfg.both)
    self.queue[#self.queue + 1] = { mother = first, partner = second }
    if math.random() * 100 < C.cfg.both and family_ok(bio_of[second]) then
        -- second pregnancy runs after the first one's swap is restored (the swaps would clash otherwise)
        self.queue[#self.queue + 1] = { mother = second, partner = first }
    end
end

local function on_interaction_finished(self, a, b, c)
    -- Payload is one table (entity_id, interaction_bag_id, target_entity_id); positional args are accepted too.
    local entity_id, bag_id, target_id
    if type(a) == "table" then
        entity_id, bag_id, target_id = a.entity_id, a.interaction_bag_id, a.target_entity_id
    else
        entity_id, bag_id, target_id = a, b, c
    end
    if not entity_id or not bag_id then return end

    local name = tostring(bag_id)
    if CONFIG.discover and looks_baby_related(name) then
        log("saw interaction", name, entity_id, target_id)
    end

    local fire, arm = CONFIG.fire_bags[name], CONFIG.arm_bags[name]
    if not fire and not arm then return end
    if type(entity_id) ~= "number" or type(target_id) ~= "number" then return end

    if arm then
        if target_id < 0 or entity_id == target_id then return end
        if not attempt_allowed(entity_id, target_id) then return end
        -- remember the pair in both directions: the vanilla bed result events carry the BED as target
        local now = os.clock()
        self.pairs[entity_id] = { other = target_id, t = now }
        self.pairs[target_id] = { other = entity_id, t = now }
        local key = math.min(entity_id, target_id) .. ":" .. math.max(entity_id, target_id)
        if not self.armed[key] and not (self.locked[key] and now - self.locked[key] < CONFIG.pair_lock) then
            self.armed[key] = { t = now, a = entity_id, b = target_id }
        end
        return
    end

    -- bed result: target is normally the bed object, not a Zoi -> resolve the partner from the armed pair
    local partner = target_id
    if target_id < 0 or entity_id == target_id or not find_bio(target_id) then
        local rec = self.pairs[entity_id]
        if rec and os.clock() - rec.t < CONFIG.pair_memory then
            partner = rec.other
            log("bed result", name, entity_id, "target", target_id, "is not a Zoi; partner from the talk:", partner)
        else
            log("bed result", name, entity_id, "target", target_id, "is not a Zoi and no talk pair is known, ignored")
            return
        end
    end
    if partner == entity_id or partner < 0 then return end
    if not attempt_allowed(entity_id, partner) then return end
    handle_attempt(self, entity_id, partner)
end

-- ---------------------------------------------------------------- man+woman: extra pregnancy for the man

-- Vanilla decides whether the woman becomes pregnant. Once she is, roll bothChance once; on a hit wait
-- until her state has left PregnancyTest (her genetics are locked) and only then queue the gender trick with
-- the MAN as mother. The woman's gender is never touched while she is still in PregnancyTest.
local function process_mixed(self, now)
    for woman, w in pairs(self.mixed) do
        local wbio, mbio = find_bio(w.woman), find_bio(w.man)
        local age = now - w.t0
        if not wbio or not mbio then
            self.mixed[woman] = nil
        elseif not w.rolled then
            if is_pregnant(wbio) then
                w.rolled = true
                w.hit = math.random() * 100 < C.cfg.both
                log("man+woman: vanilla pregnancy detected, bothChance roll", w.hit and "HIT" or "miss", w.woman, w.man)
                if not w.hit then self.mixed[woman] = nil end
            elseif age > CONFIG.mixed_detect_timeout then
                log("man+woman: no vanilla pregnancy appeared, giving up", w.woman)
                self.mixed[woman] = nil
            end
        else
            local state = pregnancy_state(wbio)
            if not is_pregnant(wbio) then
                log("man+woman: the woman's pregnancy ended, skipping the man", w.woman)
                self.mixed[woman] = nil
            elseif state ~= "" and state ~= "PregnancyTest" then
                self.mixed[woman] = nil
                if involved(self, w.woman) or involved(self, w.man) then
                    log("man+woman: a swap is already active for this pair, skipping the man")
                elseif get_gender(mbio) ~= 3 or get_gender(wbio) ~= 2 then
                    log("man+woman: genders are not Male/Female any more, skipping")
                elseif not can_carry(mbio) then
                    log("man+woman: the man is already pregnant or at the family limit, skipping", w.man)
                else
                    log("man+woman: woman is past PregnancyTest (" .. state .. "), queueing the man as mother", w.man)
                    self.queue[#self.queue + 1] = { mother = w.man, partner = w.woman }
                end
            elseif age > CONFIG.mixed_test_timeout then
                log("man+woman: woman still in PregnancyTest after the wait, skipping the man", w.woman)
                self.mixed[woman] = nil
            end
        end
    end
end

-- ---------------------------------------------------------------- recovery of an interrupted swap

local function process_recovery(self)
    local list = C.recover
    if not list then return end
    C.recover = nil
    C.recover_done = true
    for _, r in ipairs(list) do
        if not self.pending[r.mother] and not involved(self, r.mother) then
            local mbio, pbio = find_bio(r.mother), find_bio(r.partner)
            if mbio and pbio then
                -- only touch a Zoi that is still in the swapped state the record describes, so a stale record
                -- from another save never changes unrelated Zois
                local m_swapped = get_gender(mbio) == 2 and r.orig_m ~= 2
                local p_swapped = get_gender(pbio) == 3 and r.orig_p ~= 3
                if not m_swapped and not p_swapped then
                    log("recovery: record does not match the current genders, ignored", r.mother, r.partner)
                elseif is_pregnant(mbio) and pregnancy_state(mbio) == "PregnancyTest" then
                    -- the swap must stay until genetics are locked in: take it over again
                    self.pending[r.mother] = { partner = r.partner, orig_m = r.orig_m, orig_p = r.orig_p,
                        t0 = os.clock(), proceeded = false }
                    log("recovered a pending swap in PregnancyTest, will restore later", r.mother)
                else
                    if m_swapped then set_gender(mbio, r.orig_m) end
                    if p_swapped then set_gender(pbio, r.orig_p) end
                    log("recovered an interrupted swap: genders put back", r.mother, r.partner)
                end
            else
                log("recovery: Zoi not found", r.mother, r.partner)
            end
        end
    end
    C.persist(self.pending)
end

-- ---------------------------------------------------------------- lifecycle

---@param self table
---@param manager FB2TimeManager
function M.on_begin(self, manager)
    self.pending = {}
    self.queue = {}
    self.locked = {}
    self.armed = {}
    self.pairs = {}
    self.mixed = {}
    self.last_poll = os.clock()
    C.recover_done = false

    self.h_interaction = function(a, b, c) on_interaction_finished(self, a, b, c) end
    self.h_cancel = function(a)
        local id = type(a) == "table" and (a.entity_id or a.zoi_entity_id) or a
        if id and self.pending[id] then restore(self, id, "pregnancy cancelled") end
    end
    self.h_begin = function(...) log("pregnancy_begin", ...) end
    self.h_born = function(a, b, c)
        local baby, mother, father
        if type(a) == "table" then
            baby, mother, father = a.baby_entity_id, a.mother_entity_id, a.father_entity_id
        else
            baby, mother, father = a, b, c
        end
        log("born: baby", tostring(baby), "mother", tostring(mother), "father", tostring(father))
    end

    self.hd_h_interaction = inzoi.event.on("interaction.finished", self.h_interaction)
    self.hd_h_cancel = inzoi.event.on("zoi.pregnancy_cancel", self.h_cancel)
    self.hd_h_begin = inzoi.event.on("zoi.pregnancy_begin", self.h_begin)
    self.hd_h_born = inzoi.event.on("zoi.born", self.h_born)
    log("loaded")
end

---@param self table
---@param manager FB2TimeManager
---@param dt number
function M.on_tick(self, manager, dt)
    -- real time, not dt: the Time manager's dt is 0 while the game is paused / at speed 0, and swaps,
    -- recovery and timers must keep running regardless
    local now = os.clock()
    if self.toast_q and #self.toast_q > 0 then
        for i = #self.toast_q, 1, -1 do
            if now >= self.toast_q[i].t then
                C.toast_clear(self.toast_q[i].ids)
                table.remove(self.toast_q, i)
            end
        end
    end
    if now - self.last_poll < CONFIG.poll_interval then return end
    self.last_poll = now
    process_recovery(self)
    process_mixed(self, now)

    -- talk interactions whose bed result never came: treat the talk's end as the attempt
    for key, arm in pairs(self.armed) do
        if now - arm.t >= CONFIG.arm_fallback then
            self.armed[key] = nil
            if not (self.locked[key] and now - self.locked[key] < CONFIG.pair_lock) then
                log("no bed result after the talk, using the talk as the trigger", arm.a, arm.b)
                handle_attempt(self, arm.a, arm.b)
            end
        end
    end
    for key, t in pairs(self.locked) do
        if now - t > 600 then self.locked[key] = nil end
    end

    -- next queued pregnancy starts only when no swap is active (swaps would overwrite each other)
    if next(self.pending) == nil and #self.queue > 0 then
        local q = table.remove(self.queue, 1)
        start_pregnancy(self, q.mother, q.partner)
    end

    for mother, p in pairs(self.pending) do
        local age = now - p.t0
        if p.restoring then
            -- an earlier restore could not be verified: retry (record stays saved) until restore_give_up
            if not restore(self, mother, p.reason or "retry") and now - p.restoring > CONFIG.restore_give_up then
                self.pending[mother] = nil
                log("WARNING: gave up restoring genders; the saved record stays for the next load", mother, p.partner)
            end
        else
            -- always re-find the component: a handle kept from an earlier tick can be stale
            local mbio = find_bio(mother)
            local pregnant = mbio ~= nil and is_pregnant(mbio)
            local state = mbio and pregnancy_state(mbio) or ""
            local active = pregnant or state ~= ""

            if p.stage == 0 then
                -- the swap is queued; Prepare/Start/buff must wait until it has taken effect
                if now - p.swap_t >= CONFIG.swap_wait then begin_route1(self, mother, p) end
            else
                -- observation log while a start route is being waited on (first stage_wait of every route)
                if not active and p.last_try and now - p.last_try >= 0 and now - p.last_try <= CONFIG.stage_wait * (p.stage or 1) then
                    local key = tostring(p.stage) .. "|" .. (state == "" and "None" or state) .. "|" .. tostring(has_test_buff(mother))
                    if key ~= p.watch_key then
                        p.watch_key = key
                        log("watch: stage", p.stage, "state", state == "" and "None" or state, "pregnant", tostring(pregnant),
                            "testBuff", tostring(has_test_buff(mother)), "gender", tostring(mbio and get_gender(mbio)),
                            mbio and diag(mother, mbio) or "")
                    end
                end

                if not active and p.retry_at and now >= p.retry_at then
                    p.retry_at = nil
                    run_test_flow(self, mother, p, p.stage >= 1 + CONFIG.route1_retries)
                end

                if mbio and pregnant and state == "PregnancyTest" and not p.proceeded
                    and (CONFIG.skip_test_state or (CONFIG.failsafe_timeout > 0 and age > CONFIG.failsafe_timeout)) then
                    p.proceeded = true
                    local ok, err = pcall(function() mbio:ProceedToNextPregnancyState() end)
                    log("ProceedToNextPregnancyState", ok, err)
                    state = pregnancy_state(mbio)
                end

                if active and state ~= "" and state ~= "PregnancyTest" then
                    log("state reached", state, "- genetics locked in")
                    restore(self, mother, "state " .. state)
                elseif active then
                    if not p.logged_active then
                        p.logged_active = true
                        log("pregnancy active, state:", state == "" and "?" or state, "route:", tostring(p.route))
                    end
                elseif mbio and p.last_try then
                    local waited = now - p.last_try
                    local stage = p.stage or 99
                    if stage <= 1 + CONFIG.route1_retries and waited > CONFIG.stage_wait * stage then
                        -- longer wait on every retry; false = nothing left to try
                        if not next_start_route(self, mother, p) then
                            log("could not start a pregnancy test for " .. tostring(mother) .. " (partner " .. tostring(p.partner) .. "); genders restored, no pregnancy created")
                            remove_test_buff(mother)
                            restore(self, mother, "pregnancy test could not be started")
                        end
                    elseif stage > 1 + CONFIG.route1_retries and waited > CONFIG.unconfirmed_timeout then
                        log("could not start a pregnancy test for " .. tostring(mother) .. " (partner " .. tostring(p.partner) .. ")")
                        restore(self, mother, "never became pregnant")
                    end
                end
                -- still PregnancyTest (or Zoi not loaded): keep waiting, restoring now would make the pregnancy vanish
            end
        end
    end
end

---@param self table
---@param manager FB2TimeManager
function M.on_savegame(self, manager)
    if self.pending and next(self.pending) ~= nil then
        log("WARNING: saving while a gender swap is pending; the swap is recorded and repaired on the next load")
        C.persist(self.pending)
    end
end

---@param self table
---@param manager FB2TimeManager
function M.on_end(self, manager)
    if self.pending then
        for mother in pairs(self.pending) do restore(self, mother, "script ending") end
    end
    local events = { hd_h_interaction = "interaction.finished", hd_h_cancel = "zoi.pregnancy_cancel",
        hd_h_begin = "zoi.pregnancy_begin", hd_h_born = "zoi.born" }
    for k, ev in pairs(events) do
        if self[k] then inzoi.event.off(ev, self[k]) end
    end
end

return M
