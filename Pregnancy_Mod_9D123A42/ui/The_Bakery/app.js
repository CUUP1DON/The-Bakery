/**
 * app.js -- Baby Settings
 * Opened from a Zoi's interaction menu ("Baby Settings") or with F9.
 *  - Shows the two partners involved: "Partner 1" and "Partner 2" (internally still you / target). Tap either card to pick someone else.
 *  - "Try for a baby" starts a pregnancy for a same-gender pair with the game's own pregnancy code.
 *  - Settings are saved to a file (uimod.cfg_save) so they persist between sessions.
 *
 * How a same-gender pregnancy works: the game picks "the female" of the pair as the mother, so for a
 * moment the chosen mother is set to Female (simulation side only) and the partner to Male. The swap is kept
 * until the pregnancy reaches PregnancyEarly (genetics locked in), then both genders are restored.
 *
 * Look: "o'feeling" paper sheet -- cream paper, navy outline, red + powder blue, hand-lettered type.
 * Every size is written at "design size" (720px wide) and scaled by sc() using the saved window scale.
 */
(function () {
    'use strict';

    var content = wf.content;
    var MOD = wf.MOD_ID;

    // ------------------------------------------------------------------ settings
    var DEFAULTS = { allowMM: true, allowFF: true, motherMode: 'random', bothChance: 0, reqFriend: 50, reqRomance: 0, reqMarried: 10, reqChat: 30, testFail: 0, birthCutscene: 'skip', npcCouples: 'off', autonomy: true, scale: 0.6 };
    var cfg = JSON.parse(JSON.stringify(DEFAULTS));
    var AUTONOMY_BAGS = ['Co_TryToHaveChildren', 'Co_TryToHaveChildren_NoSpouse']; // vanilla autonomy weight is 10
    var VANILLA_WEIGHT = 10;
    var MIN_SCALE = 0.5, MAX_SCALE = 1.0;

    // The game pops a toast for cheat-flagged commands; clear them right away so nothing breaks immersion.
    var CHEAT_RE = /^(bio\.|pregnancy_and_birth\.|buff\.remove|interaction\.set_reward)/;
    var lastClear = 0;
    function clearToasts() {
        var now = Date.now();
        if (now - lastClear < 300) return;
        lastClear = now;
        [0, 150, 500, 1000].forEach(function (t) {
            setTimeout(function () { try { var p = wf.cli('toast.clear', {}); if (p && p.catch) p.catch(function () {}); } catch (e) {} }, t);
        });
    }
    function cli(cmd, params) {
        var p = wf.cli(cmd, params || {});
        if (CHEAT_RE.test(cmd)) clearToasts();
        return p;
    }
    function parseObj(r) {
        var d = r && r.data !== undefined ? r.data : r;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return null; } }
        return d;
    }

    function saveCfg() {
        try {
            var p = cli('uimod.cfg_save', { mod_id: MOD, section: 'settings', key: 'config', value: JSON.stringify(cfg) });
            if (p && p.catch) p.catch(function () {});
        } catch (e) {}
    }
    function loadCfg() {
        var p = cli('uimod.cfg_load', { mod_id: MOD, section: 'settings', key: 'config' });
        if (!p || !p.then) return Promise.resolve();
        return p.then(function (r) {
            var v = r && (r.value !== undefined ? r.value : (r.data && r.data.value));
            if (typeof v === 'string' && v) {
                var o = JSON.parse(v);
                for (var k in DEFAULTS) if (o.hasOwnProperty(k)) cfg[k] = o[k];
                cfg.bothChance = snapChance(cfg.bothChance);
                if (!(cfg.scale >= MIN_SCALE && cfg.scale <= MAX_SCALE)) cfg.scale = DEFAULTS.scale;
                effScale = cfg.scale;
                if (!o.hasOwnProperty('reqFriend') && !o.hasOwnProperty('reqRomance')) {
                    // saved by an older version: Friendship / Romance / Nothing
                    if (o.unmarried === 'romance') { cfg.reqFriend = 0; cfg.reqRomance = 50; }
                    else if (o.unmarried === 'none') { cfg.reqFriend = 0; cfg.reqRomance = 0; }
                }
                cfg.reqFriend = snapReq(cfg.reqFriend, 50); cfg.reqRomance = snapReq(cfg.reqRomance, 0); cfg.reqMarried = snapReq(cfg.reqMarried, 10); cfg.reqChat = snapReq(cfg.reqChat, 30);
                cfg.testFail = snapChance(cfg.testFail);
                if (cfg.birthCutscene !== 'play' && cfg.birthCutscene !== 'skip') cfg.birthCutscene = 'skip';
                if (cfg.npcCouples !== 'on' && cfg.npcCouples !== 'off') cfg.npcCouples = 'off';
            }
        }).catch(function () {});
    }

    var REQ_STEP = 5;
    function snapReq(v, d) { v = Math.round(Number(v)); if (!(v >= 0)) return d; return Math.min(100, v); }
    var CHANCES = [[0, 'Never'], [10, 'Rare'], [25, 'Sometimes'], [50, 'Often'], [100, 'Always']];
    function snapChance(v) {
        var best = 0, d = 1e9;
        CHANCES.forEach(function (c) { var x = Math.abs(c[0] - (v || 0)); if (x < d) { d = x; best = c[0]; } });
        return best;
    }

    function applyAutonomy() {
        var w = cfg.autonomy ? VANILLA_WEIGHT : 0;
        AUTONOMY_BAGS.forEach(function (b) {
            var p = cli('interaction.set_reward', { interaction_bag_id: b, reward: w });
            if (p && p.catch) p.catch(function () {});
        });
    }

    // ------------------------------------------------------------------ scaling
    // sc(): scales every "Npx" value and every <svg width= height=> in a string by the window scale.
    var effScale = DEFAULTS.scale;
    function pxv(v) {
        var f = parseFloat(v);
        if (f === 0 || isNaN(f)) return 0;
        var n = f * effScale;
        if (Math.abs(f) <= 4) return (f < 0 ? -1 : 1) * Math.max(1, Math.round(Math.abs(n)));
        return Math.round(n * 2) / 2;
    }
    function sc(str) {
        return String(str)
            .replace(/(-?\d*\.?\d+)px/g, function (m, v) { return pxv(v) + 'px'; })
            .replace(/<svg width="(\d+)" height="(\d+)"/g, function (m, w, h) { return '<svg width="' + pxv(w) + '" height="' + pxv(h) + '"'; });
    }

    // ------------------------------------------------------------------ look
    var NAVY = '#2b3c5a', RED = '#c8342f', BLUE = '#c4dcec', PAPER = '#f8f1de', CARD = '#fffaf0', MUTED = '#6b7f9e', GREY = '#8b94a4';

    function cssText() {
        return sc([
            '@font-face{font-family:"Gaegu";font-weight:400;src:url("fonts/Gaegu-Regular.ttf");}',
            '@font-face{font-family:"Gaegu";font-weight:700;src:url("fonts/Gaegu-Bold.ttf");}',
            '@font-face{font-family:"Caveat Brush";font-weight:400;src:url("fonts/CaveatBrush.ttf");}',
            '#app-root{width:720px !important;height:auto !important;overflow:visible !important;background:' + PAPER + ';border:3px solid ' + NAVY + ';border-radius:10px;box-shadow:6px 6px 0 ' + NAVY + ';font-family:"Gaegu",cursive;color:' + NAVY + ';letter-spacing:0px;}',
            '#resize-handle{display:none !important;}',
            '#title-bar{background:transparent !important;padding:20px 24px 0 24px !important;cursor:move;}',
            '#title-text{display:none !important;}',
            '#title-buttons{position:absolute;top:14px;right:18px;display:flex;flex-direction:row;align-items:center;}',
            '.ssp-tbtn,#close-btn{font-family:"Gaegu",cursive !important;font-size:26px !important;font-weight:700 !important;line-height:1 !important;padding:3px 12px 5px 12px !important;margin-left:10px !important;' +
                'background:#fff !important;color:' + NAVY + ' !important;border:2.5px solid ' + NAVY + ' !important;border-radius:6px !important;box-shadow:4px 4px 0 ' + NAVY + ';cursor:pointer;user-select:none;}',
            '#close-btn{transform:rotate(2deg);padding:3px 14px 5px 14px !important;}',
            '.ssp-tbtn:hover{background:' + BLUE + ' !important;}',
            '#close-btn:hover{background:' + RED + ' !important;color:#fff !important;}',
            '#content{padding:16px 24px 22px 24px !important;background:transparent !important;color:' + NAVY + ' !important;font-size:22px !important;overflow:visible !important;}',
            '.ssp-row{display:flex;flex-direction:row;}',
            '.ssp-card{background:' + CARD + ';border:2.5px solid ' + NAVY + ';border-radius:7px;box-shadow:4px 4px 0 ' + NAVY + ';}',
            '.ssp-hatch{background-color:' + BLUE + ';background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.75) 0px,rgba(255,255,255,0.75) 3px,rgba(255,255,255,0) 3px,rgba(255,255,255,0) 9px);}',
            '.ssp-click{cursor:pointer;user-select:none;-webkit-user-select:none;}',
            '#ssp-diary::-webkit-scrollbar{width:10px;}',
            '#ssp-diary::-webkit-scrollbar-track{background:rgba(31,45,77,0.10);border-radius:5px;}',
            '#ssp-diary::-webkit-scrollbar-thumb{background:' + NAVY + ';border-radius:5px;}',
            '.ssp-head{font-size:26px;font-weight:700;color:' + RED + ';}',
            '.ssp-h1{font-family:"Caveat Brush",cursive;}',
            '.ssp-pick:hover{background:' + BLUE + ';}',
            '.ssp-card,.ssp-click,.ssp-tbtn,.ssp-tbtn2,.ssp-tool,#close-btn{transition:background-color 0.18s ease,box-shadow 0.18s ease,transform 0.18s ease,opacity 0.22s ease,border-color 0.18s ease,color 0.18s ease;}',
            '.ssp-click:active,.ssp-tbtn:active,.ssp-tool:active{transform:translate(2px,2px);}',
            '#ssp-pageSettings,#ssp-pageCheats,#ssp-pageReq,#ssp-pagePre{transition:opacity 0.2s ease;}',
            '#hide-btn{display:none !important;}',
            '#ssp-picker{transition:opacity 0.2s ease;}',
            '.ssp-opt:hover{background:' + BLUE + ' !important;}',
            '.ssp-tool,.ssp-tbtn2{font-size:20px;font-weight:700;padding:3px 10px 4px;margin-left:8px;border:2.5px solid ' + NAVY + ';border-radius:5px;background:#fff;box-shadow:3px 3px 0 ' + NAVY + ';text-align:center;}',
            '.ssp-tool:hover,.ssp-tbtn2:hover{background:' + BLUE + ';}'
        ].join('\n'));
    }

    function paw(size, fill) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 58 58"><g fill="' + fill + '" stroke="' + NAVY + '" stroke-width="2.6" stroke-linejoin="round">' +
            '<path d="M29 28 C21 28 14 38 15 45 C16 51 23 50 29 48 C35 50 42 51 43 45 C44 38 37 28 29 28Z"/>' +
            '<ellipse cx="14" cy="26" rx="5" ry="7" transform="rotate(-20 14 26)"/><ellipse cx="24" cy="15" rx="5" ry="7.5"/>' +
            '<ellipse cx="35" cy="15" rx="5" ry="7.5"/><ellipse cx="45" cy="26" rx="5" ry="7" transform="rotate(20 45 26)"/></g></svg>';
    }
    function pacifier(size, fill) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 58 58"><g fill="' + fill + '" stroke="' + NAVY + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">' +
            '<circle cx="29" cy="46" r="9" fill="none"/>' +
            '<path d="M13 30 C13 24 20 23 29 23 C38 23 45 24 45 30 C45 36 38 37 29 37 C20 37 13 36 13 30Z"/>' +
            '<path d="M23 23 C22 10 36 10 35 23Z"/></g></svg>';
    }
    function tileIcon(on) {
        var f = on ? BLUE : '#f4eede', st = on ? NAVY : GREY;
        var tick = on ? '<path d="M10 17 L19 26 L32 9" fill="none" stroke="' + RED + '" stroke-width="3.4"/>' : '';
        return '<svg width="44" height="44" viewBox="0 0 44 44"><rect x="5" y="5" width="34" height="34" fill="' + f + '" stroke="' + st + '" stroke-width="2.6"/>' + tick + '</svg>';
    }
    var HEART = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 20 C6 16 4 12 4 9 C4 6 6 4 8 4 C9.5 4 10.5 5 11 6 C11.5 5 12.5 4 14 4 C16 4 18 6 18 9 C18 12 16 16 11 20Z" fill="' + RED + '" stroke="' + NAVY + '" stroke-width="2"/></svg>';
    var CAKE = '<svg width="46" height="50" viewBox="0 0 46 50"><rect x="6" y="24" width="34" height="20" fill="#fff" stroke="' + NAVY + '" stroke-width="2.6"/><path d="M6 32 Q14 38 23 32 Q32 38 40 32" fill="none" stroke="' + RED + '" stroke-width="2.6"/><rect x="21" y="10" width="4" height="14" fill="#f2c94c" stroke="' + NAVY + '" stroke-width="2"/><path d="M23 2 Q27 7 23 9 Q19 7 23 2Z" fill="' + RED + '" stroke="' + NAVY + '" stroke-width="1.8"/></svg>';

    var styleEl = document.createElement('style');
    document.head.appendChild(styleEl);

    // header (lives inside the game's drag bar) -- built once per scale
    var tb = document.getElementById('title-bar');
    var tbtns = document.getElementById('title-buttons');
    var closeBtn = document.getElementById('close-btn');
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;flex-direction:row;align-items:center;flex-grow:1;';
    tb.insertBefore(head, tb.firstChild);
    var bSmaller = document.createElement('div'); bSmaller.className = 'ssp-tbtn'; bSmaller.textContent = 'A-'; bSmaller.title = 'Smaller window';
    var bBigger = document.createElement('div'); bBigger.className = 'ssp-tbtn'; bBigger.textContent = 'A+'; bBigger.title = 'Bigger window';
    tbtns.insertBefore(bSmaller, closeBtn); tbtns.insertBefore(bBigger, closeBtn);

    function $(id) { return document.getElementById(id); }
    var el = {};

    // ------------------------------------------------------------------ state
    var ctx = { selfId: null, targetId: null, you: null, target: null, busy: false, pickSlot: null, showAll: false, cheatOpen: false, reqOpen: false, preOpen: false, youState: null, tgtState: null };
    var ADULT = { Youth: 1, Adult: 1, Old: 1, Elderly: 1 };
    var AGE_TEXT = { Youth: 'Young Adult', Adult: 'Adult', Old: 'Older Adult', Elderly: 'Elder' };
    var roster = [];

    // ------------------------------------------------------------------ diary (plain words) + log (technical, saved to a file)
    var logText = '', diaryLines = [], saveTimer = null;
    function log(msg) {
        logText += new Date().toLocaleTimeString() + ' ' + msg + '\n';
        if (logText.length > 20000) logText = logText.slice(logText.length - 20000);
        if (!saveTimer) saveTimer = setTimeout(function () {
            saveTimer = null;
            var p = cli('uimod.cfg_save', { mod_id: MOD, section: 'log', key: 'baby_settings_log', value: logText });
            if (p && p.catch) p.catch(function () {});
        }, 1000);
    }
    var fadeLast = false;
    function renderDiary() {
        if (!el.diary) return;
        el.diary.innerHTML = '';
        diaryLines.forEach(function (l, idx) {
            var row = document.createElement('div');
            row.style.cssText = sc('white-space:normal;');
            row.textContent = l;
            el.diary.appendChild(row);
            if (idx === diaryLines.length - 1 && fadeLast) {
                row.style.opacity = '0'; row.style.transition = 'opacity 0.35s ease';
                setTimeout(function () { row.style.opacity = '1'; }, 30);
            }
        });
    }
    function say(msg) {
        log('diary: ' + msg);
        diaryLines.push(msg);
        if (diaryLines.length > 100) diaryLines.shift();
        fadeLast = true; renderDiary(); fadeLast = false;
        if (el.diary) el.diary.scrollTop = el.diary.scrollHeight;
    }
    function logCall(label, p) {
        if (!p || !p.then) return Promise.resolve(p);
        return p.then(function (r) { log(label + ' -> ' + JSON.stringify(r).slice(0, 300)); return r; })
                .catch(function (e) { var t; try { t = typeof e === 'object' ? JSON.stringify(e) : String(e); } catch (x) { t = String(e); } log(label + ' ERROR: ' + t); });
    }

    // ------------------------------------------------------------------ build / rebuild the window at the current scale
    function build() {
        styleEl.textContent = cssText();
        head.innerHTML = sc(
            '<div style="width:70px;height:64px;flex-shrink:0;">' + pacifier(64, '#f2a9a2') + '</div>' +
            '<div style="margin-left:18px;">' +
              '<div class="ssp-h1" style="font-size:64px;line-height:60px;color:' + RED + ';transform:rotate(-1.5deg);transform-origin:left center;">The Bakery</div>' +
              '<div style="font-size:24px;font-weight:700;letter-spacing:3px;color:#4f86b8;margin-top:2px;">SETTINGS</div>' +
            '</div>');

        content.innerHTML = sc(
            '<div id="ssp-pageSettings">' +
            // setting tiles: two per row
            '<div class="ssp-row" style="margin-bottom:16px;">' +
              '<div id="ssp-tMM" class="ssp-card ssp-click" style="flex:1 1 0px;min-width:0px;margin-right:16px;padding:12px 8px 10px;text-align:center;"></div>' +
              '<div id="ssp-tFF" class="ssp-card ssp-click" style="flex:1 1 0px;min-width:0px;padding:12px 8px 10px;text-align:center;"></div>' +
            '</div>' +
            '<div class="ssp-row" style="margin-bottom:16px;">' +
              '<div id="ssp-tAuto" class="ssp-card ssp-click" style="flex:1 1 0px;min-width:0px;margin-right:16px;padding:12px 8px 10px;text-align:center;"></div>' +
              '<div id="ssp-tNpc" class="ssp-card ssp-click" style="flex:1 1 0px;min-width:0px;padding:12px 8px 10px;text-align:center;"></div>' +
            '</div>' +
            // sections (each opens its own page)
            '<div id="ssp-preHead" class="ssp-card ssp-click" style="padding:8px 14px;margin-bottom:16px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;">' +
              '<div style="line-height:1.1;"><div class="ssp-head" style="font-size:24px;">Pregnancy</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Who carries, both partners, tests, birth scene</div></div>' +
              '<div style="font-size:34px;font-weight:700;margin-left:12px;">&gt;</div>' +
            '</div>' +
            '<div id="ssp-reqHead" class="ssp-card ssp-click" style="padding:8px 14px;margin-bottom:16px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;">' +
              '<div style="line-height:1.1;"><div class="ssp-head" style="font-size:24px;">Requirements</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Unmarried, married, pregnancy chats</div></div>' +
              '<div style="font-size:34px;font-weight:700;margin-left:12px;">&gt;</div>' +
            '</div>' +
            '<div id="ssp-cheatHead" class="ssp-card ssp-click" style="padding:8px 14px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;">' +
              '<div style="line-height:1.1;"><div class="ssp-head" style="font-size:24px;">Cheats</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Start a test, deliver a baby, remove a pregnancy</div></div>' +
              '<div style="font-size:34px;font-weight:700;margin-left:12px;">&gt;</div>' +
            '</div>' +
            '</div>' +
            '<div id="ssp-pagePre" style="display:none;opacity:0;">' +
            '<div id="ssp-preBack" class="ssp-card ssp-click" style="padding:8px 14px;display:flex;flex-direction:row;align-items:center;margin-bottom:16px;">' +
              '<div style="font-size:34px;font-weight:700;margin-right:12px;">&lt;</div>' +
              '<div class="ssp-head" style="font-size:24px;">Pregnancy</div>' +
            '</div>' +
            // who carries
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Who carries the baby?</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">My Zoi is whichever Zoi you are playing at the time.</div>' +
              '<div class="ssp-row" style="margin-top:6px;">' +
                '<div id="ssp-mRand" class="ssp-click" style="flex:1;margin-right:12px;text-align:center;padding:6px 0;font-size:26px;font-weight:700;">Random</div>' +
                '<div id="ssp-mYou" class="ssp-click" style="flex:1;margin-right:12px;text-align:center;padding:6px 0;font-size:26px;font-weight:700;">My Zoi</div>' +
                '<div id="ssp-mTgt" class="ssp-click" style="flex:1;text-align:center;padding:6px 0;font-size:26px;font-weight:700;">Their partner</div>' +
              '</div>' +
            '</div>' +
            // chance both (chips)
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Both partners expecting?</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Chance that BOTH partners become pregnant at once. Never = only one does.</div>' +
              '<div id="ssp-chBoth" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            // chance a pregnancy test comes back negative (the game's own negative test)
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Pregnancy tests</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Chance a test comes back negative. Never = always positive.</div>' +
              '<div id="ssp-chFail" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            // birth scene of a male carrier
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Birth scene for male carriers</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">The game\'s birth scene only has a woman in it, so the bed is empty for a man.</div>' +
              '<div id="ssp-chCut" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            '</div>' +
            '<div id="ssp-pageReq" style="display:none;opacity:0;">' +
            '<div id="ssp-reqBack" class="ssp-card ssp-click" style="padding:8px 14px;display:flex;flex-direction:row;align-items:center;margin-bottom:16px;">' +
              '<div style="font-size:34px;font-weight:700;margin-right:12px;">&lt;</div>' +
              '<div class="ssp-head" style="font-size:24px;">Requirements</div>' +
            '</div>' +
            // unmarried couples: what they need
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Unmarried couples</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">What they need before they can try for a baby. 0 = not needed.</div>' +
              '<div id="ssp-stFriend" class="ssp-row" style="margin-top:6px;"></div>' +
              '<div id="ssp-stRomance" class="ssp-row" style="margin-top:10px;"></div>' +
            '</div>' +
            // married couples: what they need
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Married couples</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">What they need before they can try for a baby. 0 = not needed.</div>' +
              '<div id="ssp-stMarried" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            // friends' pregnancy chats
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-bottom:16px;">' +
              '<div class="ssp-head">Pregnancy chats</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">How close friends must be to check in on a pregnancy and talk about the baby. 0 = not needed.</div>' +
              '<div id="ssp-stChat" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            '</div>' +
            '<div id="ssp-pageCheats" style="display:none;opacity:0;">' +
            '<div id="ssp-cheatBack" class="ssp-card ssp-click" style="padding:8px 14px;display:flex;flex-direction:row;align-items:center;margin-bottom:16px;">' +
              '<div id="ssp-cheatMarkB" style="font-size:34px;font-weight:700;margin-right:12px;">&lt;</div>' +
              '<div class="ssp-head" style="font-size:24px;">Cheats</div>' +
            '</div>' +
            // pair
            '<div class="ssp-row" style="margin-bottom:16px;">' +
              '<div id="ssp-cardYou" class="ssp-card ssp-click" style="flex:1;margin-right:18px;padding:12px 14px;display:flex;flex-direction:row;align-items:center;">' +
                                '<div style="line-height:1;"><div style="font-size:20px;font-weight:700;color:' + RED + ';letter-spacing:2px;">PARTNER 1</div><div id="ssp-youName" style="font-size:34px;font-weight:700;">...</div><div id="ssp-youInfo" style="font-size:19px;color:' + MUTED + ';">&nbsp;</div></div>' +
              '</div>' +
              '<div id="ssp-cardTgt" class="ssp-card ssp-click" style="flex:1;padding:12px 14px;display:flex;flex-direction:row;align-items:center;">' +
                                '<div style="line-height:1;"><div style="font-size:20px;font-weight:700;color:' + RED + ';letter-spacing:2px;">PARTNER 2</div><div id="ssp-tgtName" style="font-size:34px;font-weight:700;">...</div><div id="ssp-tgtInfo" style="font-size:19px;color:' + MUTED + ';">&nbsp;</div></div>' +
              '</div>' +
            '</div>' +
            // picker (hidden until a card is tapped)
            '<div id="ssp-picker" class="ssp-card" style="display:none;padding:8px 10px 10px;margin-bottom:16px;margin-top:10px;">' +
              '<div id="ssp-pickTitle" class="ssp-head" style="font-size:24px;">Choose a Zoi</div>' +
              '<div id="ssp-pickList" style="max-height:112px;overflow:hidden;margin-top:4px;padding-right:16px;"></div>' +
              '<div id="ssp-pickAll" class="ssp-click" style="margin-top:6px;text-align:center;font-size:20px;color:' + MUTED + ';border-top:1px dashed ' + NAVY + ';padding-top:6px;">Show everyone in town</div>' +
            '</div>' +
            // go banner
            '<div id="ssp-go" class="ssp-hatch ssp-click" style="border:2.5px solid ' + NAVY + ';border-radius:6px;box-shadow:4px 4px 0 ' + NAVY + ';display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:8px 18px;margin-bottom:16px;">' +
              '<div style="width:46px;height:50px;">' + CAKE + '</div>' +
              '<span class="ssp-h1" style="font-size:44px;letter-spacing:2px;color:#fff;text-shadow:2px 2px 0 ' + NAVY + ',-1px -1px 0 ' + NAVY + ',1px -1px 0 ' + NAVY + ',-1px 1px 0 ' + NAVY + ';">Try for a baby!</span>' +
              '<div style="width:40px;height:40px;">' + pacifier(40, '#fff') + '</div>' +
            '</div>' +
            // other tools
            '<div class="ssp-card" style="padding:12px 14px 14px;margin-top:0px;">' +
              '<div class="ssp-row" style="align-items:center;margin-bottom:12px;">' +
                '<div style="flex:1;min-width:0px;line-height:1;"><div id="ssp-toolYou" style="font-size:24px;font-weight:700;"></div><div id="ssp-stateYou" style="font-size:18px;color:' + MUTED + ';"></div></div>' +
                '<div id="ssp-delYou" class="ssp-click ssp-tool">Deliver baby</div>' +
                '<div id="ssp-remYou" class="ssp-click ssp-tool">Remove pregnancy</div>' +
              '</div>' +
              '<div class="ssp-row" style="align-items:center;">' +
                '<div style="flex:1;min-width:0px;line-height:1;"><div id="ssp-toolTgt" style="font-size:24px;font-weight:700;"></div><div id="ssp-stateTgt" style="font-size:18px;color:' + MUTED + ';"></div></div>' +
                '<div id="ssp-delTgt" class="ssp-click ssp-tool">Deliver baby</div>' +
                '<div id="ssp-remTgt" class="ssp-click ssp-tool">Remove pregnancy</div>' +
              '</div>' +
            '</div>' +
            // trimester (move an expecting partner forward to check the baby bump)
            '<div class="ssp-card" style="padding:10px 14px 14px;margin-top:16px;">' +
              '<div class="ssp-head">Trimester</div>' +
              '<div style="font-size:19px;color:' + MUTED + ';">Move whoever is expecting forward to check the baby bump. It only goes forward.</div>' +
              '<div id="ssp-stageRow" class="ssp-row" style="margin-top:6px;"></div>' +
            '</div>' +
            '</div>' +
            // diary (always visible; select the text or press Copy)
            '<div class="ssp-card" style="padding:10px 14px 12px;margin-top:16px;">' +
              '<div class="ssp-row" style="justify-content:space-between;align-items:center;">' +
                '<div style="font-size:22px;font-weight:700;color:' + RED + ';">Diary</div>' +
                '<div id="ssp-copy" class="ssp-click ssp-tbtn2">Copy</div>' +
              '</div>' +
              '<div id="ssp-diary" style="font-size:22px;line-height:28px;height:168px;overflow-y:auto;user-select:text;-webkit-user-select:text;cursor:text;background-image:repeating-linear-gradient(180deg,rgba(255,250,240,0) 0px,rgba(255,250,240,0) 27px,rgba(80,130,180,0.5) 27px,rgba(80,130,180,0.5) 28px);background-attachment:local;"></div>' +
            '</div>');

        el = {
            cardYou: $('ssp-cardYou'), cardTgt: $('ssp-cardTgt'),
            youName: $('ssp-youName'), youInfo: $('ssp-youInfo'), tgtName: $('ssp-tgtName'), tgtInfo: $('ssp-tgtInfo'),
            picker: $('ssp-picker'), pickTitle: $('ssp-pickTitle'), pickList: $('ssp-pickList'), pickAll: $('ssp-pickAll'),
            tMM: $('ssp-tMM'), tFF: $('ssp-tFF'), tAuto: $('ssp-tAuto'), tNpc: $('ssp-tNpc'),
            mRand: $('ssp-mRand'), mYou: $('ssp-mYou'), mTgt: $('ssp-mTgt'),
            stageHost: $('ssp-stageRow'), chBoth: $('ssp-chBoth'), chFail: $('ssp-chFail'), stFriend: $('ssp-stFriend'), stRomance: $('ssp-stRomance'), stMarried: $('ssp-stMarried'), stChat: $('ssp-stChat'), chCut: $('ssp-chCut'),
            go: $('ssp-go'), diary: $('ssp-diary'), pageSettings: $('ssp-pageSettings'), pageCheats: $('ssp-pageCheats'), pageReq: $('ssp-pageReq'), reqHead: $('ssp-reqHead'), reqBack: $('ssp-reqBack'), pagePre: $('ssp-pagePre'), preHead: $('ssp-preHead'), preBack: $('ssp-preBack'), cheatBack: $('ssp-cheatBack'), cheatHead: $('ssp-cheatHead'), cheatMark: $('ssp-cheatMark'),
            toolYou: $('ssp-toolYou'), stateYou: $('ssp-stateYou'), stateTgt: $('ssp-stateTgt'), toolTgt: $('ssp-toolTgt'), delYou: $('ssp-delYou'), remYou: $('ssp-remYou'), delTgt: $('ssp-delTgt'), remTgt: $('ssp-remTgt'), copy: $('ssp-copy')
        };

        el.tMM.addEventListener('click', function () { change(function () { cfg.allowMM = !cfg.allowMM; }); });
        el.tFF.addEventListener('click', function () { change(function () { cfg.allowFF = !cfg.allowFF; }); });
        el.tAuto.addEventListener('click', function () { change(function () { cfg.autonomy = !cfg.autonomy; applyAutonomy(); log('autonomous suggestions ' + (cfg.autonomy ? 'ON (vanilla weight)' : 'OFF')); }); });
        el.tNpc.addEventListener('click', function () { change(function () { cfg.npcCouples = cfg.npcCouples === 'on' ? 'off' : 'on'; }); });
        el.mRand.addEventListener('click', function () { change(function () { cfg.motherMode = 'random'; }); });
        el.mYou.addEventListener('click', function () { change(function () { cfg.motherMode = 'you'; }); });
        el.mTgt.addEventListener('click', function () { change(function () { cfg.motherMode = 'target'; }); });
        el.go.addEventListener('click', tryForBaby);
        el.delYou.addEventListener('click', function () { deliver('you'); });
        el.delTgt.addEventListener('click', function () { deliver('target'); });
        el.remYou.addEventListener('click', function () { removePreg('you', el.remYou); });
        el.remTgt.addEventListener('click', function () { removePreg('target', el.remTgt); });
        el.copy.addEventListener('click', copyDiary);
        el.cheatHead.addEventListener('click', function () { ctx.cheatOpen = true; renderCheat(); refreshStates(); });
        el.cheatBack.addEventListener('click', function () { ctx.cheatOpen = false; renderCheat(); });
        el.reqHead.addEventListener('click', function () { ctx.reqOpen = true; renderCheat(); });
        el.reqBack.addEventListener('click', function () { ctx.reqOpen = false; renderCheat(); });
        el.preHead.addEventListener('click', function () { ctx.preOpen = true; renderCheat(); });
        el.preBack.addEventListener('click', function () { ctx.preOpen = false; renderCheat(); });
        el.cardYou.addEventListener('click', function () { openPicker('you'); });
        el.cardTgt.addEventListener('click', function () { openPicker('target'); });
        el.pickAll.addEventListener('click', function () { ctx.showAll = !ctx.showAll; loadRoster().then(renderPicker); });

        renderSettings(); renderPair(); renderPicker(); refreshVerdict(); renderDiary(); renderCheat(true); renderTools();
    }
    // ------------------------------------------------------------------ custom scroll bars
    // The game's UI engine draws no scroll bars, so boxes that scroll get a thin themed bar of their own.
    var scrollers = [];
    var sbActive = null;
    document.addEventListener('mousemove', function (e) { if (sbActive) sbActive.move(e); });
    document.addEventListener('mouseup', function () { sbActive = null; });
    function attachScroll(box, host) {
        if (!box || box.__sb) { if (box && box.__sb) box.__sb.update(); return; }
        try { if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) { host.style.position = 'relative'; }
        var track = document.createElement('div');
        track.style.cssText = sc('position:absolute;width:9px;background:rgba(43,60,90,0.14);border:1.5px solid ' + NAVY + ';border-radius:3px;display:none;z-index:5;');
        var thumb = document.createElement('div');
        thumb.className = 'ssp-click';
        thumb.style.cssText = 'position:absolute;left:0px;right:0px;background:' + NAVY + ';';
        track.appendChild(thumb);
        host.appendChild(track);
        var drag = null;
        // thumb geometry measured from the real inner size of the track, so it can never leave the track
        function geom() {
            var sh = box.scrollHeight, ch = box.clientHeight;
            var inner = track.clientHeight || (ch - 6);
            var th = Math.min(inner, Math.max(parseFloat(sc('26px')), inner * ch / sh));
            var max = Math.max(1, sh - ch);
            return { sh: sh, ch: ch, inner: inner, th: th, max: max };
        }
        function update() {
            var sh = box.scrollHeight, ch = box.clientHeight;
            if (sh <= ch + 1) { track.style.display = 'none'; return; }
            track.style.display = 'block';
            track.style.top = (box.offsetTop + 2) + 'px';
            track.style.height = (ch - 4) + 'px';
            track.style.left = (box.offsetLeft + box.offsetWidth - parseFloat(sc('13px'))) + 'px';
            var g = geom();
            var ratio = Math.max(0, Math.min(1, box.scrollTop / g.max));
            thumb.style.height = g.th + 'px';
            thumb.style.top = ((g.inner - g.th) * ratio) + 'px';
        }
        box.addEventListener('wheel', function (e) {
            if (box.scrollHeight <= box.clientHeight + 1) return;
            box.scrollTop += (e.deltaY > 0 ? 1 : -1) * 42;
            e.preventDefault(); e.stopPropagation(); update();
        }, { passive: false });
        box.addEventListener('scroll', update);
        thumb.addEventListener('mousedown', function (e) {
            drag = { y: e.clientY, top: box.scrollTop }; e.stopPropagation(); e.preventDefault();
            sbActive = {
                move: function (ev) {
                    var g = geom(), room = Math.max(1, g.inner - g.th);
                    box.scrollTop = Math.max(0, Math.min(g.max, drag.top + (ev.clientY - drag.y) * (g.max / room)));
                    update();
                }
            };
        });
        box.__sb = { update: update, track: track };
        scrollers.push(box);
        update();
    }
    // keep the scroll bars of scrolling boxes (the name list) in step with their content
    function fitWindow() {
        try {
            scrollers = scrollers.filter(function (b) { return document.body.contains(b); });
            scrollers.forEach(function (b) { b.__sb.update(); });
        } catch (e) {}
    }
    setInterval(fitWindow, 350);

    var fitHold = 0;
    var cheatTimer = null;
    // pages: Settings <-> Cheats, a quick cross-fade (no sliding, no resizing)
    var pageTimer = null;
    var curPage = null; // the page actually on screen (updated when a swap happens, not when it is asked for)
    function renderCheat(instant) {
        var to = ctx.cheatOpen ? el.pageCheats : (ctx.reqOpen ? el.pageReq : (ctx.preOpen ? el.pagePre : el.pageSettings));
        var o = to === el.pageCheats, pages = [el.pageSettings, el.pageCheats, el.pageReq, el.pagePre];
        if (pageTimer) { clearTimeout(pageTimer); pageTimer = null; }
        fitHold = Date.now() + 600;
        if (instant || !curPage) {
            pages.forEach(function (pg) { if (pg !== to) { pg.style.display = 'none'; pg.style.opacity = '0'; } });
            to.style.display = 'block'; to.style.opacity = '1';
            curPage = to;
            return;
        }
        if (curPage === to) { to.style.opacity = '1'; return; }
        curPage.style.opacity = '0';
        pageTimer = setTimeout(function () {
            pages.forEach(function (pg) { if (pg !== to) { pg.style.display = 'none'; pg.style.opacity = '0'; } });
            to.style.display = 'block';
            to.style.opacity = '0';
            curPage = to;
            pageTimer = setTimeout(function () { to.style.opacity = '1'; if (o) renderTools(); }, 30);
        }, 210);
    }

    // ------------------------------------------------------------------ settings rendering
    function tile(node, on, label, tag) {
        node.style.background = on ? CARD : '#ece6d6';
        node.style.borderColor = on ? NAVY : GREY;
        node.style.boxShadow = sc('4px 4px 0 ') + (on ? NAVY : GREY);
        node.style.color = on ? NAVY : GREY;
        node.innerHTML = sc(tileIcon(on) + '<div style="font-size:23px;font-weight:700;line-height:1;margin-top:4px;">' + label + '</div>' +
            '<div style="font-size:18px;letter-spacing:2px;color:' + (on ? MUTED : GREY) + ';">' + tag + '</div>');
    }
    function motherOpt(node, on) {
        node.className = 'ssp-click' + (on ? ' ssp-hatch' : ' ssp-opt');
        node.style.border = sc('2.5px solid ') + NAVY;
        node.style.borderRadius = sc('4px');
        node.style.background = on ? '' : '#ffffff';
        node.style.boxShadow = on ? sc('3px 3px 0 ') + RED : sc('3px 3px 0 ') + NAVY;
    }
    function renderSettings() {
        tile(el.tMM, cfg.allowMM, 'Male + male', cfg.allowMM ? 'ALLOWED' : 'OFF');
        tile(el.tFF, cfg.allowFF, 'Female + female', cfg.allowFF ? 'ALLOWED' : 'OFF');
        tile(el.tAuto, cfg.autonomy, 'Household Autonomy', cfg.autonomy ? 'ON' : 'OFF');
        motherOpt(el.mRand, cfg.motherMode === 'random');
        motherOpt(el.mYou, cfg.motherMode === 'you');
        motherOpt(el.mTgt, cfg.motherMode === 'target');
        chipRow(el.chBoth, 'bothChance');
        chipRow(el.chFail, 'testFail');
        stepRow(el.stFriend, 'reqFriend', 'Friendship');
        stepRow(el.stRomance, 'reqRomance', 'Romance');
        stepRow(el.stMarried, 'reqMarried', 'Family bond');
        stepRow(el.stChat, 'reqChat', 'Friendship');
        optRow(el.chCut, 'birthCutscene', [['skip', 'Skip it', 'baby just arrives'], ['play', 'Play it', 'empty bed']]);
        tile(el.tNpc, cfg.npcCouples === 'on', 'Town Autonomy', cfg.npcCouples === 'on' ? 'ON' : 'OFF');
    }
    // A number the player can step up and down, built from the same chips as the rows above: a minus chip, a hatched
    // value chip (name on top, the number below) and a plus chip. 0 reads as "not needed".
    function stepRow(host, key, label) {
        if (host.children.length !== 3) {
            host.innerHTML = '';
            var side = function (txt, delta) {
                var d = document.createElement('div');
                d.style.cssText = sc('flex:0 0 76px;text-align:center;padding:4px 0 3px;line-height:1;border:2.5px solid ' + NAVY + ';border-radius:4px;');
                d.innerHTML = '<div style="font-size:' + pxv(30) + 'px;font-weight:700;line-height:' + pxv(34) + 'px;">' + txt + '</div>';
                d.addEventListener('click', function () { change(function () { cfg[key] = Math.max(0, Math.min(100, cfg[key] + delta)); }); });
                return d;
            };
            var mid = document.createElement('div');
            mid.style.cssText = sc('flex:1 1 0px;min-width:0px;text-align:center;padding:4px 0 3px;line-height:1;border:2.5px solid ' + NAVY + ';border-radius:4px;margin:0 10px;');
            host.appendChild(side('&minus;', -REQ_STEP));
            host.appendChild(mid);
            host.appendChild(side('+', REQ_STEP));
        }
        var v = cfg[key], dn = host.children[0], mid2 = host.children[1], up = host.children[2];
        mid2.className = 'ssp-hatch';
        mid2.style.boxShadow = sc('3px 3px 0 ') + RED;
        mid2.innerHTML = '<div style="font-size:' + pxv(22) + 'px;font-weight:700;">' + label + '</div><div style="font-size:' + pxv(17) + 'px;color:' + MUTED + ';">' + (v > 0 ? v + '+' : 'not needed') + '</div>';
        [[dn, v <= 0], [up, v >= 100]].forEach(function (p) {
            p[0].className = 'ssp-click ssp-opt';
            p[0].style.background = '#ffffff';
            p[0].style.boxShadow = sc('3px 3px 0 ') + NAVY;
            p[0].style.opacity = p[1] ? '0.4' : '1';
        });
    }
    function optRow(host, key, opts) {
        if (host.children.length !== opts.length) {
            host.innerHTML = '';
            opts.forEach(function (o, i) {
                var d = document.createElement('div');
                d.style.cssText = sc('flex:1 1 0px;min-width:0px;text-align:center;padding:4px 0 3px;line-height:1;border:2.5px solid ' + NAVY + ';border-radius:4px;' + (i < opts.length - 1 ? 'margin-right:10px;' : ''));
                d.innerHTML = '<div style="font-size:' + pxv(22) + 'px;font-weight:700;">' + o[1] + '</div><div style="font-size:' + pxv(17) + 'px;color:' + MUTED + ';">' + o[2] + '</div>';
                d.addEventListener('click', function () { change(function () { cfg[key] = o[0]; }); });
                host.appendChild(d);
            });
        }
        opts.forEach(function (o, i) {
            var on = cfg[key] === o[0], d = host.children[i];
            d.className = 'ssp-click' + (on ? ' ssp-hatch' : ' ssp-opt');
            d.style.background = on ? '' : '#ffffff';
            d.style.boxShadow = sc('3px 3px 0 ') + (on ? RED : NAVY);
        });
    }
    function chipRow(host, key) {
        if (host.children.length !== CHANCES.length) {
            host.innerHTML = '';
            CHANCES.forEach(function (c, i) {
                var d = document.createElement('div');
                d.style.cssText = sc('flex:1 1 0px;min-width:0px;text-align:center;padding:4px 0 3px;line-height:1;border:2.5px solid ' + NAVY + ';border-radius:4px;' + (i < CHANCES.length - 1 ? 'margin-right:10px;' : ''));
                d.innerHTML = '<div style="font-size:' + pxv(22) + 'px;font-weight:700;">' + c[1] + '</div><div style="font-size:' + pxv(17) + 'px;color:' + MUTED + ';">' + c[0] + '%</div>';
                d.addEventListener('click', function () { change(function () { cfg[key] = c[0]; }); });
                host.appendChild(d);
            });
        }
        CHANCES.forEach(function (c, i) {
            var on = cfg[key] === c[0], d = host.children[i];
            d.className = 'ssp-click' + (on ? ' ssp-hatch' : ' ssp-opt');
            d.style.background = on ? '' : '#ffffff';
            d.style.boxShadow = sc('3px 3px 0 ') + (on ? RED : NAVY);
        });
    }
    function change(fn) { fn(); saveCfg(); renderSettings(); refreshVerdict(); }

    // window size buttons
    function setScale(v) {
        v = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(v * 20) / 20));
        if (v === cfg.scale) return;
        cfg.scale = v; effScale = v; saveCfg(); build();
    }
    bSmaller.addEventListener('click', function (e) { e.stopPropagation(); setScale(cfg.scale - 0.05); });
    bBigger.addEventListener('click', function (e) { e.stopPropagation(); setScale(cfg.scale + 0.05); });

    // drag the window from any empty part of the sheet (the header bar already drags it too)
    (function () {
        var down = false, ox = 0, oy = 0, moved = false;
        wf.root.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var t = e.target, bad = false;
            while (t && t !== wf.root) {
                if (t.id === 'ssp-pickList' || t.id === 'ssp-diary' || (t.className && String(t.className).indexOf('ssp-click') >= 0) || (t.className && String(t.className).indexOf('ssp-tbtn') >= 0) || t.id === 'close-btn') { bad = true; break; }
                t = t.parentNode;
            }
            if (bad) return;
            down = true; moved = false;
            ox = e.clientX - wf.root.offsetLeft; oy = e.clientY - wf.root.offsetTop;
        });
        document.addEventListener('mousemove', function (e) {
            if (!down) return;
            moved = true;
            wf.root.style.left = (e.clientX - ox) + 'px'; wf.root.style.top = (e.clientY - oy) + 'px';
        });
        document.addEventListener('mouseup', function () {
            if (!down) return;
            down = false;
            if (moved && typeof wf.root._saveWindowState === 'function') wf.root._saveWindowState();
        });
    })();

    // ------------------------------------------------------------------ the two Zois
    function info(c) { return c ? (c.gender + ', ' + (AGE_TEXT[c.growth_step] || c.growth_step)) : ''; }

    function renderPair() {
        el.youName.textContent = ctx.you ? ctx.you.name : '...';
        el.youInfo.textContent = ctx.you ? info(ctx.you) : '';
        if (ctx.selfId !== null && ctx.selfId === ctx.targetId) {
            el.tgtName.textContent = 'Choose someone';
            el.tgtInfo.textContent = 'tap here';
        } else {
            el.tgtName.textContent = ctx.target ? ctx.target.name : '...';
            el.tgtInfo.textContent = ctx.target ? info(ctx.target) : '';
        }
    }

    function stateText(st) {
        if (st === null || st === undefined) return '';
        if (st === 'None' || st === '') return 'Not expecting';
        if (st === 'PregnancyTest') return 'Just found out';
        if (st.indexOf('Early') >= 0) return 'Early pregnancy';
        if (st.indexOf('Mid') >= 0) return 'Mid pregnancy';
        if (st.indexOf('Late') >= 0) return 'Late pregnancy';
        if (st.indexOf('Imminent') >= 0) return 'Baby is coming!';
        return 'Expecting';
    }
    function isExpecting(st) { return !!st && st !== 'None'; }
    // Trimester chips. A click saves a request that B1/Main.lua picks up and passes to each expecting Zoi, whose B2 script
    // moves the pregnancy forward with the game's own state call (the game has no way back).
    var STAGES = [['1st', 'early', 'PregnancyEarly'], ['2nd', 'middle', 'PregnancyMid'], ['3rd', 'late', 'PregnancyLate']];
    function stageRank(st) {
        if (!st || st === 'None') return -1;
        if (st === 'PregnancyTest') return 0;
        if (st.indexOf('Early') >= 0) return 1;
        if (st.indexOf('Mid') >= 0) return 2;
        if (st.indexOf('Late') >= 0) return 3;
        if (st.indexOf('Imminent') >= 0) return 4;
        return 1;
    }
    function expectingNow() {
        var same = ctx.selfId !== null && ctx.selfId === ctx.targetId, out = [];
        if (isExpecting(ctx.youState)) out.push({ id: ctx.selfId, name: ctx.you ? ctx.you.name : 'Partner 1', st: ctx.youState });
        if (!same && isExpecting(ctx.tgtState)) out.push({ id: ctx.targetId, name: ctx.target ? ctx.target.name : 'Partner 2', st: ctx.tgtState });
        return out;
    }
    function renderStage() {
        var host = el.stageHost;
        if (!host) return;
        if (host.children.length !== STAGES.length) {
            host.innerHTML = '';
            STAGES.forEach(function (g, i) {
                var d = document.createElement('div');
                d.style.cssText = sc('flex:1 1 0px;min-width:0px;text-align:center;padding:4px 0 3px;line-height:1;border:2.5px solid ' + NAVY + ';border-radius:4px;' + (i < STAGES.length - 1 ? 'margin-right:10px;' : ''));
                d.innerHTML = '<div style="font-size:' + pxv(22) + 'px;font-weight:700;">' + g[0] + '</div><div style="font-size:' + pxv(17) + 'px;color:' + MUTED + ';">' + g[1] + '</div>';
                d.addEventListener('click', function () { setStage(i); });
                host.appendChild(d);
            });
        }
        var ranks = expectingNow().map(function (p) { return stageRank(p.st); });
        STAGES.forEach(function (g, i) {
            var d = host.children[i], want = i + 1;
            var on = ranks.length > 0 && ranks.every(function (r) { return r === want; });
            var open = ranks.some(function (r) { return r < want; });
            d.className = 'ssp-click' + (on ? ' ssp-hatch' : ' ssp-opt');
            d.style.background = on ? '' : '#ffffff';
            d.style.boxShadow = sc('3px 3px 0 ') + (on ? RED : NAVY);
            d.style.opacity = (on || open) ? '1' : '0.4';
        });
    }
    function setStage(i) {
        if (ctx.busy) return;
        var want = i + 1, list = expectingNow();
        if (!list.length) { say('Nobody here is expecting yet.'); return; }
        var go = list.filter(function (p) { return stageRank(p.st) < want; });
        if (!go.length) {
            say(list.every(function (p) { return stageRank(p.st) === want; }) ? 'Already there.' : 'It only goes forward. Remove the pregnancy and start again to see an earlier stage.');
            return;
        }
        var parts = [String(Date.now())];
        go.forEach(function (p) { parts.push(p.id + ',' + STAGES[i][2]); });
        var pr = cli('uimod.cfg_save', { mod_id: MOD, section: 'settings', key: 'stage_req', value: parts.join(';') });
        if (pr && pr.catch) pr.catch(function () {});
        say(go.map(function (p) { return p.name; }).join(' and ') + ' moving to the ' + STAGES[i][0] + ' trimester...');
        setTimeout(function () {
            refreshStates().then(function () {
                var still = expectingNow().filter(function (p) { return stageRank(p.st) < want; });
                say(still.length ? 'Nothing moved yet. If the game is paused, unpause it and try again.' : 'Done. Check the baby bump.');
            });
        }, 3500);
    }
    function renderTools() {
        var same = ctx.selfId !== null && ctx.selfId === ctx.targetId;
        el.toolYou.textContent = ctx.you ? ctx.you.name : '...';
        el.toolTgt.textContent = same ? '(no target chosen)' : (ctx.target ? ctx.target.name : '...');
        el.stateYou.textContent = stateText(ctx.youState);
        el.stateTgt.textContent = same ? '' : stateText(ctx.tgtState);
        var yOn = isExpecting(ctx.youState), tOn = !same && isExpecting(ctx.tgtState);
        el.delYou.style.opacity = el.remYou.style.opacity = yOn ? '1' : '0.4';
        el.delTgt.style.opacity = el.remTgt.style.opacity = tOn ? '1' : '0.4';
        renderStage();
    }
    function readState(id) {
        if (id === null || id === undefined) return Promise.resolve(null);
        return cli('entity.reflect', { entity_id: id, Component: 'Bio' }).then(function (r) {
            var d = parseObj(r);
            return (d && d.currentPregnancyState !== undefined) ? d.currentPregnancyState : null;
        }).catch(function () { return null; });
    }
    function refreshStates() {
        var same = ctx.selfId !== null && ctx.selfId === ctx.targetId;
        return Promise.all([readState(ctx.selfId), same ? Promise.resolve(null) : readState(ctx.targetId)]).then(function (r) {
            ctx.youState = r[0]; ctx.tgtState = r[1]; renderTools();
        });
    }
    // keep the card up to date while Cheats is open
    setInterval(function () { if (ctx.cheatOpen && !ctx.busy) refreshStates(); }, 4000);

    function loadZois(selfId, targetId) {
        ctx.selfId = selfId; ctx.targetId = targetId; ctx.you = null; ctx.target = null;
        renderPair();
        var a = cli('entity.get_character_info', { entity_id: selfId });
        var b = selfId === targetId ? a : cli('entity.get_character_info', { entity_id: targetId });
        return Promise.all([a, b]).then(function (r) {
            ctx.you = parseObj(r[0]); ctx.target = parseObj(r[1]);
            renderPair(); renderTools(); refreshVerdict(); refreshStates();
        }).catch(function (e) { log('could not read the Zois: ' + e); });
    }

    // ---- picker: choose a different Zoi for the You / Target card
    var rosterToken = 0;
    function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    var NOT_ADULT_RE = /infant|baby|toddler|child|teen/i;
    function loadRoster() {
        var token = ++rosterToken;
        var req = ctx.showAll ? cli('world.list_characters', { group_type: 'ResidenceFamily', limit: 200 }) : cli('household.get_members', {});
        return req.then(function (r) {
            var data = r && (r.characters || r.members) ? r : (r && r.data ? r.data : r);
            var list = (data && (data.characters || data.members)) || [];
            if (token !== rosterToken) return;
            list = list.filter(function (c) {
                if (c.age_group) return !!ADULT[c.age_group];
                return !NOT_ADULT_RE.test(String(c.age_group_text || ''));
            });
            roster = list.map(function (c) {
                return { id: c.entity_id, name: (c.first_name || '') + ' ' + (c.last_name || ''), gender: c.gender_text || c.gender, age: c.age_group_text || c.age_group };
            });
        }).catch(function (e) { log('roster error: ' + e); roster = []; });
    }
    function openPicker(slot) {
        if (ctx.pickSlot === slot) { ctx.pickSlot = null; renderPicker(); return; }
        ctx.pickSlot = slot;
        renderPicker();
        loadRoster().then(renderPicker);
    }
    function renderPicker() {
        if (!ctx.pickSlot) { el.picker.style.display = 'none'; return; }
        el.picker.style.display = 'block';
        el.pickTitle.textContent = ctx.pickSlot === 'you' ? 'Choose Partner 1' : 'Choose Partner 2';
        el.pickAll.textContent = ctx.showAll ? 'Show my household only' : 'Show everyone in town';
        var other = ctx.pickSlot === 'you' ? ctx.targetId : ctx.selfId;
        el.pickList.innerHTML = '';
        var shown = 0;
        roster.forEach(function (c) {
            if (c.id === other && ctx.selfId !== ctx.targetId) return;
            shown++;
            var row = document.createElement('div');
            row.className = 'ssp-click ssp-pick';
            row.style.cssText = sc('display:flex;flex-direction:row;justify-content:space-between;padding:4px 8px;font-size:23px;border-bottom:1px dashed ' + MUTED + ';');
            row.innerHTML = '<span style="font-weight:700;">' + esc(c.name) + '</span><span style="color:' + MUTED + ';font-size:' + pxv(19) + 'px;">' + esc(c.gender) + ', ' + esc(c.age) + '</span>';
            row.addEventListener('click', function () {
                var slot = ctx.pickSlot; ctx.pickSlot = null;
                if (slot === 'you') loadZois(c.id, ctx.targetId === null ? c.id : ctx.targetId);
                else loadZois(ctx.selfId === null ? c.id : ctx.selfId, c.id);
                renderPicker();
            });
            el.pickList.appendChild(row);
        });
        attachScroll(el.pickList, el.picker);
        if (!shown) { var n = document.createElement('div'); n.style.cssText = sc('padding:6px 8px;font-size:21px;color:' + MUTED + ';'); n.textContent = 'Loading...'; el.pickList.appendChild(n); }
    }

    // returns {ok:bool, text:string}
    function check() {
        var y = ctx.you, t = ctx.target;
        if (!y || !t) return { ok: false, text: 'Just a moment...' };
        if (ctx.selfId === ctx.targetId) return { ok: false, text: 'Tap the Partner 2 card to pick who to try with.' };
        if (!ADULT[y.growth_step] || !ADULT[t.growth_step]) return { ok: false, text: 'Both need to be young adults or older.' };
        var gy = y.bio_gender || y.gender, gt = t.bio_gender || t.gender;
        if (gy !== gt) return { ok: false, text: 'A man and a woman? The normal game handles that.' };
        if (gy === 'Male' && !cfg.allowMM) return { ok: false, text: 'Male + male is switched off below.' };
        if (gy === 'Female' && !cfg.allowFF) return { ok: false, text: 'Female + female is switched off below.' };
        return { ok: true, text: y.name + ' and ' + t.name + ' can try for a baby!' };
    }
    function refreshVerdict() {
        var live = check().ok && !ctx.busy;
        el.go.style.opacity = live ? '1' : '0.5';
        el.go.style.cursor = live ? 'pointer' : 'default';
    }

    // ------------------------------------------------------------------ pregnancy flow
    var swapped = null, pollTimer = null, restoring = null;

    function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    function savePending() {
        var v = swapped ? JSON.stringify(swapped) : '';
        var p = cli('uimod.cfg_save', { mod_id: MOD, section: 'settings', key: 'pending_swap', value: v });
        if (p && p.catch) p.catch(function () {});
    }

    // bio.set_gender, retried once (logCall gives undefined when the command failed)
    function setGenderRetry(id, g, label) {
        return logCall(label, cli('bio.set_gender', { entity_id: id, gender: g })).then(function (r) {
            if (r !== undefined) return r;
            return logCall(label + ' (retry)', cli('bio.set_gender', { entity_id: id, gender: g }));
        });
    }

    // Put both genders back. The record of the swap is only cleared once both were restored, so a failed
    // restore is retried the next time the window starts. Calling it twice at once shares one restore.
    function restoreSwap(reason) {
        stopPoll();
        if (restoring) return restoring;
        if (!swapped) return Promise.resolve();
        var s0 = swapped, bad = false;
        log('restoring genders (' + reason + ')');
        restoring = setGenderRetry(s0.mother, s0.origM, 'restore mother ' + s0.origM).then(function (r1) {
            if (r1 === undefined) bad = true;
            return setGenderRetry(s0.partner, s0.origP, 'restore partner ' + s0.origP);
        }).then(function (r2) {
            if (r2 === undefined) bad = true;
            if (!bad && swapped === s0) { swapped = null; savePending(); }
            else if (bad) say('Could not put the genders back just now. It will be tried again next time.');
            restoring = null;
        }, function () { restoring = null; });
        return restoring;
    }

    // Watch the mother's pregnancy state; restore once it passes PregnancyTest. Resolves with true if a pregnancy appeared.
    function watchUntilRestored() {
        return new Promise(function (resolve) {
            var started = Date.now(), last = null, got = false, inflight = false, errs = 0, done = false;
            stopPoll();
            function finish(reason, result) {
                if (done) return;
                done = true; stopPoll();
                restoreSwap(reason).then(function () { resolve(result); });
            }
            pollTimer = setInterval(function () {
                if (done) return;
                if (!swapped) { done = true; stopPoll(); resolve(got); return; }
                var age = (Date.now() - started) / 1000;
                if (age > 900) { finish('failsafe', got); return; }
                if (inflight) return;
                inflight = true;
                cli('entity.reflect', { entity_id: swapped.mother, Component: 'Bio' }).then(function (r) {
                    inflight = false; errs = 0;
                    if (done) return;
                    var d = parseObj(r), st = d && d.currentPregnancyState;
                    if (st !== last) { log('pregnancy state: ' + st); last = st; }
                    if (st && st !== 'None') got = true;
                    age = (Date.now() - started) / 1000;
                    if (st && st !== 'None' && st !== 'PregnancyTest') finish('reached ' + st, true);
                    else if ((!st || st === 'None') && age > 45) { say('No pregnancy appeared.'); finish('no pregnancy', false); }
                }).catch(function (e) {
                    inflight = false; errs++;
                    log('poll error: ' + e);
                    if (errs >= 5) finish('poll failed', got);
                });
            }, 2000);
        });
    }

    function startFor(mother, partner, origM, origP, tag) {
        log('starting: ' + tag);
        // write the recovery record BEFORE touching any gender, so a crash can never leave them swapped unnoticed
        swapped = { mother: mother, partner: partner, origM: origM, origP: origP };
        savePending();
        return logCall('set mother Female', cli('bio.set_gender', { entity_id: mother, gender: 'Female' }))
            .then(function () { return logCall('set partner Male', cli('bio.set_gender', { entity_id: partner, gender: 'Male' })); })
            .then(function () { return logCall('get_baby_with', cli('pregnancy_and_birth.get_baby_with', { entity_id: mother, partner_id: partner })); })
            .then(function () { return watchUntilRestored(); });
    }

    function tryForBaby() {
        var c = check();
        if (!c.ok) { if (!ctx.busy) say(c.text); return; }
        if (ctx.busy) return;
        ctx.busy = true; refreshVerdict();
        // "My Zoi" = the Zoi you are controlling right now (if it is one of the two), otherwise Partner 1
        cli('entity.get_possessed', {}).then(function (r) {
            var d = parseObj(r);
            runTry(d && d.entity_id !== undefined ? Number(d.entity_id) : null);
        }).catch(function () { runTry(null); });
    }
    function runTry(me) {
        var y = ctx.you, t = ctx.target;
        var g = y.bio_gender || y.gender;
        var meIsTwo = (me !== null && me === ctx.targetId);
        var youMother;
        if (cfg.motherMode === 'you') youMother = !meIsTwo;
        else if (cfg.motherMode === 'target') youMother = meIsTwo;
        else youMother = Math.random() < 0.5;
        var both = Math.random() * 100 < cfg.bothChance;

        var first = youMother ? [ctx.selfId, ctx.targetId, y.name] : [ctx.targetId, ctx.selfId, t.name];
        var second = youMother ? t.name : y.name;

        // refuse if the chosen mother is already pregnant
        cli('entity.reflect', { entity_id: first[0], Component: 'Bio' }).then(function (r) {
            var d = parseObj(r);
            if (d && d.currentPregnancyState && d.currentPregnancyState !== 'None') {
                say(first[2] + ' is already expecting.');
                ctx.busy = false; refreshVerdict(); return null;
            }
            say(first[2] + ' is going to carry the baby...');
            return startFor(first[0], first[1], g, g, 'mother = ' + first[2]).then(function (ok) {
                if (!ok) { say('It did not work this time. Try again!'); return null; }
                say('Success! ' + first[2] + ' is expecting.');
                if (!both) return null;
                return startFor(first[1], first[0], g, g, 'second mother').then(function (ok2) {
                    say(ok2 ? 'And ' + second + ' is expecting too!' : second + ' could not join in this time.');
                });
            }).then(function () {
                ctx.busy = false; refreshVerdict(); refreshStates();
            });
        }).catch(function (e) {
            log('error: ' + e); say('Something went wrong. Please try again.');
            restoreSwap('error').then(function () { ctx.busy = false; refreshVerdict(); });
        });
    }

    // ---- other cheat tools: deliver now / remove a pregnancy
    function slotInfo(slot) {
        var same = ctx.selfId !== null && ctx.selfId === ctx.targetId;
        if (slot === 'target' && same) { say('Pick Partner 2 first (tap the Partner 2 card).'); return null; }
        var id = slot === 'you' ? ctx.selfId : ctx.targetId, c = slot === 'you' ? ctx.you : ctx.target;
        if (id === null || !c) { say('Pick a Zoi first.'); return null; }
        return { id: id, name: c.name };
    }
    // These game commands only act on the Zoi you are controlling, so switch to her first and CHECK it worked.
    function ensurePossessed(id) {
        return cli('entity.get_possessed', {}).then(function (r) {
            var d = parseObj(r), cur = d && d.entity_id !== undefined ? Number(d.entity_id) : null;
            if (cur === id) return { ok: true, orig: cur };
            return logCall('possess ' + id, cli('entity.possess', { entity_id: id })).then(function () {
                return cli('entity.get_possessed', {}).then(function (r2) {
                    var d2 = parseObj(r2), now = d2 && d2.entity_id !== undefined ? Number(d2.entity_id) : null;
                    return { ok: now === id, orig: cur };
                });
            });
        }).catch(function () { return { ok: false, orig: null }; });
    }
    function possessBack(orig, id) {
        if (orig === null || orig === undefined || orig === id) return Promise.resolve();
        return logCall('possess back ' + orig, cli('entity.possess', { entity_id: orig }));
    }

    function deliver(slot) {
        var z = slotInfo(slot);
        if (!z || ctx.busy) return;
        if (!isExpecting(slot === 'you' ? ctx.youState : ctx.tgtState)) { say(z.name + ' is not expecting.'); return; }
        ctx.busy = true; refreshVerdict();
        say('Delivering ' + z.name + "'s baby...");
        restoreSwap('before delivery').then(function () { return ensurePossessed(z.id); }).then(function (p) {
            if (!p.ok) { say('Could not switch to ' + z.name + '. Nothing was changed.'); return null; }
            return logCall('deliver ' + z.id, cli('pregnancy_and_birth.hello_my_angel', { entity_id: z.id })).then(function (r) {
                say(r === undefined ? 'That did not work.' : 'Done! The baby is on the way. You are now playing ' + z.name + '.');
                // the game ignores this while it is paused: check a moment later and say so instead of pretending
                if (r !== undefined) setTimeout(function () {
                    readState(z.id).then(function (st) {
                        if (isExpecting(st)) say('Nothing happened yet. If the game is paused, unpause it and try again.');
                        refreshStates();
                    });
                }, 3500);
            });
        }).then(function () { ctx.busy = false; refreshVerdict(); refreshStates(); })
          .catch(function () { say('That did not work.'); ctx.busy = false; refreshVerdict(); });
    }

    var removeArmed = null, armedBtn = null, armTimer = null;
    var PREG_BUFF_RE = /pregnan|morningsickness|milestone_family_(first|partnerfirst)pregnancy|newlifediscovery/i;
    function disarm() {
        removeArmed = null;
        if (armedBtn) { armedBtn.textContent = 'Remove pregnancy'; armedBtn = null; }
        if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    }
    function removePreg(slot, btn) {
        var z = slotInfo(slot);
        if (!z || ctx.busy) return;
        if (!isExpecting(slot === 'you' ? ctx.youState : ctx.tgtState)) { say(z.name + ' is not expecting.'); return; }
        if (removeArmed !== slot) {
            disarm();
            removeArmed = slot; armedBtn = btn; btn.textContent = 'Tap again to confirm';
            armTimer = setTimeout(disarm, 4000);
            return;
        }
        disarm();
        ctx.busy = true; refreshVerdict();
        say('Cleaning up ' + z.name + "'s pregnancy...");
        var orig = null, failed = false;
        restoreSwap('before removal').then(function () { return ensurePossessed(z.id); }).then(function (p) {
            orig = p.orig;
            if (!p.ok) { failed = true; say('Could not switch to ' + z.name + '. Nothing was changed.'); return null; }
            return logCall('remove pregnancy ' + z.id, cli('pregnancy_and_birth.remove_pregnancy', { entity_id: z.id })).then(function () {
                // sweep every buff the pregnancy left behind (buff.remove also only acts on the Zoi you control, and
                // needs the exact key from the Buff map)
                return logCall('read buffs ' + z.id, cli('entity.reflect', { entity_id: z.id, Component: 'Buff' })).then(function (b) {
                    var d = parseObj(b), keys = [];
                    if (d && d.buffs) Object.keys(d.buffs).forEach(function (k) {
                        var id = (d.buffs[k] && d.buffs[k].iD) || k;
                        if (PREG_BUFF_RE.test(k) || PREG_BUFF_RE.test(id)) keys.push(k);
                    });
                    log('pregnancy buffs to remove: ' + (keys.join(', ') || 'none'));
                    return keys.reduce(function (chain, k) {
                        return chain.then(function () { return logCall('remove buff ' + k, cli('buff.remove', { entity_id: z.id, buff_id: k })); });
                    }, Promise.resolve());
                });
            });
        }).then(function () { return possessBack(orig, z.id); })
          .then(function () { return failed ? null : readState(z.id); })
          .then(function (st) {
            if (!failed) {
                if (isExpecting(st)) say('That did not work. ' + z.name + ' is still expecting.');
                else say(z.name + "'s pregnancy was removed and cleaned up. The baby bump may take a moment to go down. (The game keeps its small 'first pregnancy' milestone note and cannot erase it.)");
            }
            ctx.busy = false; refreshVerdict(); refreshStates();
        }).catch(function () {
            possessBack(orig, z.id).then(function () { say('That did not work.'); ctx.busy = false; refreshVerdict(); });
        });
    }
    // Copy = the diary plus the log the simulation side saved by itself (cfg log/ssp_last, written even while this window
    // is closed). The page has no clipboard access, so the game's own clipboard.copy command does the copying.
    function copyDiary() {
        var done = function (ok) {
            if (el.copy) el.copy.textContent = ok ? 'Copied!' : "Couldn't copy";
            setTimeout(function () { if (el.copy) el.copy.textContent = 'Copy'; }, 2000);
        };
        var load = cli('uimod.cfg_load', { mod_id: MOD, section: 'log', key: 'ssp_last' });
        var saved = (load && load.then) ? load.then(function (r) {
            var v = r && (r.value !== undefined ? r.value : (r.data && r.data.value));
            return typeof v === 'string' ? v : '';
        }).catch(function () { return ''; }) : Promise.resolve('');
        saved.then(function (log) {
            var text = diaryLines.join('\n');
            text += (text ? '\n\n' : '') + 'Mod log (oldest first):\n' +
                (log ? log.split(',,').join('\n') : '(nothing recorded yet)');
            var c = cli('clipboard.copy', { Text: text });
            if (!c || !c.then) { done(false); return; }
            return c.then(function () { done(true); });
        }).catch(function () { done(false); });
    }

    // If the game was closed mid-swap, put the genders back on the next start.
    function recoverPending() {
        var p = cli('uimod.cfg_load', { mod_id: MOD, section: 'settings', key: 'pending_swap' });
        if (!p || !p.then) return Promise.resolve();
        return p.then(function (r) {
            var v = r && (r.value !== undefined ? r.value : (r.data && r.data.value));
            if (typeof v === 'string' && v) {
                var s = JSON.parse(v);
                log('recovering an unfinished gender swap');
                swapped = s;
                return restoreSwap('recovery');
            }
        }).catch(function () {});
    }

    function keepOnScreen() {
        try {
            var r = wf.root, vw = window.innerWidth || 1920, vh = window.innerHeight || 1080;
            var x = r.offsetLeft, y = r.offsetTop, w = r.offsetWidth, h = r.offsetHeight;
            var nx = Math.max(6, Math.min(x, vw - w - 10)), ny = Math.max(6, Math.min(y, vh - h - 10));
            if (nx !== x) r.style.left = nx + 'px';
            if (ny !== y) r.style.top = ny + 'px';
        } catch (e) {}
    }
    var lastRefresh = 0;
    function refreshZois() {
        lastRefresh = Date.now();
        // you = the Zoi you control; the other partner is chosen on the Cheats page
        cli('entity.get_possessed').then(function (r) {
            var d = parseObj(r), id = d && d.entity_id !== undefined ? Number(d.entity_id) : null;
            if (id !== null) loadZois(id, id);
        }).catch(function () {});
    }
    var lastRefresh = 0;
    function refreshZois() {
        lastRefresh = Date.now();
        cli('entity.get_possessed').then(function (r) {
            var d = parseObj(r), id = d && d.entity_id !== undefined ? Number(d.entity_id) : null;
            if (id !== null) loadZois(id, id);
        }).catch(function () {});
    }
    // Follow the Zoi you control: when you switch Zois while the window is open, Partner 1 switches with you (if you
    // switch to the Zoi that was Partner 2, the two cards swap). Only a real change of the controlled Zoi counts, so a
    // Zoi picked by hand on the Cheats page stays until you switch. Not while one of the page's own actions is running
    // (they switch Zois on purpose); the first read after the window opens only records who is controlled.
    var followId = null;
    function followPossessed() {
        if (!shown || closing || ctx.busy) return;
        cli('entity.get_possessed', {}).then(function (r) {
            var d = parseObj(r), id = d && d.entity_id !== undefined ? Number(d.entity_id) : null;
            if (id === null || ctx.busy) return;
            if (followId === null) { followId = id; return; }
            if (id === followId) return;
            followId = id;
            if (ctx.selfId === id) return;
            if (ctx.selfId === null || ctx.selfId === ctx.targetId) loadZois(id, id);
            else if (ctx.targetId === id) loadZois(id, ctx.selfId);
            else loadZois(id, ctx.targetId);
        }).catch(function () {});
    }
    setInterval(followPossessed, 2000);
    // ------------------------------------------------------------------ open from the Zoi interaction menu
    // The game shows the view only after the menu entry is clicked; the trigger callback plays the open animation
    // and loads the Zois. X fades out, then clicks the real close button (window.js hides the view).
    var closing = false;
    var openTimer = null;
    var lastOpen = 0;
    function playOpen(why) {
        // A menu click always wins: the timer that normally clears `closing` can be frozen while the game keeps
        // the view hidden, which used to leave the window stuck invisible after the first X.
        closing = false;
        var now = Date.now();
        if (now - lastOpen < 400) return;
        lastOpen = now;
        var r = wf.root;
        if (openTimer) { clearTimeout(openTimer); openTimer = null; }
        ctx.pickSlot = null; renderPicker();
        r.style.transition = 'none';
        r.style.opacity = '0';
        r.style.transform = 'translateY(' + pxv(18) + 'px)';
        openTimer = setTimeout(function () {
            openTimer = null;
            keepOnScreen();
            r.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            r.style.opacity = '1';
            r.style.transform = 'translateY(0px)';
        }, 90);
    }
    function loadFromTrigger(t) {
        var s = t && t.selfEntityId !== undefined ? Number(t.selfEntityId) : null;
        var g = t && t.targetEntityId !== undefined ? Number(t.targetEntityId) : null;
        if (s === null && g === null) { refreshZois(); return; }
        if (s === null) s = g;
        if (g === null) g = s;
        if (s !== g) { loadZois(s, g); return; }
        // clicked Zoi only: you = the Zoi you control
        lastRefresh = Date.now();
        cli('entity.get_possessed').then(function (r) {
            var d = parseObj(r), id = d && d.entity_id !== undefined ? Number(d.entity_id) : null;
            if (id !== null && id !== s) loadZois(id, s); else loadZois(s, s);
        }).catch(function () { loadZois(s, s); });
    }
    // ---- input ownership. The game injects its own watcher into this page: while window.__uimod_rectActive is true
    // it measures #app-root every few frames and tells the game "this screen area belongs to the mod" (setContentRect).
    // Clicking the menu entry again (the game's own close) turns that watcher off. Fading the window out does not: the
    // invisible box keeps its size, the watcher keeps claiming its area, and clicks there never reach the game.
    // So every close does what the game's close does: watcher off, box removed from the page (display:none, zero
    // size), content rect and hover flag cleared through the engine, then the view is hidden.
    var shown = false;
    function engineReq(o) {
        try { if (typeof engine !== 'undefined') { o.promiseId = 0; engine.call('_uimod_request', JSON.stringify(o)); } } catch (e) {}
    }
    function setHoverFlag(on) { engineReq({ type: 'view', action: 'hover', over: !!on }); }
    function releaseInput() {
        window.__uimod_rectActive = false;
        wf.root.style.display = 'none';
        setHoverFlag(false);
        engineReq({ type: 'view', action: 'setContentRect', x: 0, y: 0, w: 0, h: 0 });
    }
    if (window.inzoi && inzoi.trigger && inzoi.trigger.onActivated) {
        inzoi.trigger.onActivated(function (t) {
            shown = true;
            wf.root.style.display = '';
            window.__uimod_rectActive = true; window.__uimod_rectForce = 1;
            followId = null; // the pair is loaded fresh below; the next read only records who is controlled
            playOpen('trigger');
            loadFromTrigger(t);
        });
    }

    wf.root.style.opacity = '1';
    tbtns.addEventListener('click', function (e) {
        if (e.target !== closeBtn || e._ssp) return;   // the synthetic click goes through to window.js
        e.stopPropagation(); e.preventDefault();
        closeNow();
    }, true);
    function closeNow() {
        if (closing) return;
        closing = true;
        // A hidden view still holds the input. Ask the B1 Lua (lua/B1/Main.lua) to reload the view from outside the
        // page. Written first, before any timer, because page timers do not run reliably once the game changes mode.
        try { cli('uimod.cfg_save', { mod_id: MOD, section: 'settings', key: 'close_req', value: String(Date.now()) }); } catch (e) {}
        var r = wf.root;
        r.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        r.style.opacity = '0';
        r.style.transform = 'translateY(' + pxv(10) + 'px)';
        setTimeout(function () { finishClose(false); }, 190);
    }
    // alreadyHidden: the game hid the view itself (menu entry clicked again), only the release is needed.
    function finishClose(alreadyHidden) {
        shown = false;
        if (!alreadyHidden) {
            // the real close button: window.js saves the window position, then hides the view
            var evt = document.createEvent('MouseEvents');
            evt.initEvent('click', true, true);
            evt._ssp = true;
            closeBtn.dispatchEvent(evt);
        }
        releaseInput();
        closing = false;
    }
    window.addEventListener('mousemove', function () {
        if (!shown) return;
        // say "the cursor is over the window" only while it really is, and take it back as soon as it is not
        setHoverFlag(!!(wf.root.matches && wf.root.matches(':hover')));
    });
    // Close the window by itself when the game leaves normal play (build mode, character studio, loading, map).
    // Otherwise the open window keeps the mouse and nothing in build mode can be clicked.
    var modeBusy = false;
    setInterval(function () {
        if (!shown || closing || modeBusy) return;
        modeBusy = true;
        var done = function () { modeBusy = false; };
        Promise.all([
            cli('build.get_mode_state').catch(function () { return null; }),
            cli('game.get_state').catch(function () { return null; })
        ]).then(function (r) {
            var b = parseObj(r[0]), g = parseObj(r[1]);
            var building = !!(b && (b.in_build_mode || b.pending || (b.phase && b.phase !== 'none')));
            var notPlaying = !!(g && g.phase && g.phase !== 'in_game');
            if (shown && (building || notPlaying)) { log('closing for ' + (building ? 'build mode' : g.phase)); closeNow(); }
            done();
        }, done);
    }, 500);

    // whenever the game hides or unloads the page, hand the mouse back
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) return;
        var wasOpen = shown;
        shown = false; releaseInput();
        if (wasOpen) finishClose(true);
    });
    window.addEventListener('pagehide', function () { shown = false; releaseInput(); });
    window.addEventListener('beforeunload', function () { shown = false; releaseInput(); });
    // the window starts closed: clear anything the scaffold reported while loading
    [0, 400, 1200, 3000, 6000].forEach(function (ms) { setTimeout(function () { if (!shown) releaseInput(); }, ms); });

    wf.root.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: false });

    wf.root.style.left = '24px';
    wf.root.style.top = Math.max(120, (window.innerHeight || 1080) - 330) + 'px';
    build();
    loadCfg().then(function () { build(); if (!cfg.autonomy) applyAutonomy(); }).then(recoverPending);
    say('Ready when you are.');
})();
