// C. 选秀状元验证（1997-2025）+ 现役名单验证
const fs = require('fs'), path = require('path'), vm = require('vm');
const { D, mapTeam, CUR_ABBRS } = require('./test_data_integrity.js');

console.log("========== C. 历年选秀状元 ==========");
// 真实状元（1997-2025）
const REAL_PICK1 = {
    1997: "Tim Duncan", 1998: "Michael Olowokandi", 1999: "Elton Brand", 2000: "Kenyon Martin",
    2001: "Kwame Brown", 2002: "Yao Ming", 2003: "LeBron James", 2004: "Dwight Howard",
    2005: "Andrew Bogut", 2006: "Andrea Bargnani", 2007: "Greg Oden", 2008: "Derrick Rose",
    2009: "Blake Griffin", 2010: "John Wall", 2011: "Kyrie Irving", 2012: "Anthony Davis",
    2013: "Anthony Bennett", 2014: "Andrew Wiggins", 2015: "Karl-Anthony Towns",
    2016: "Ben Simmons", 2017: "Markelle Fultz", 2018: "Deandre Ayton",
    2019: "Zion Williamson", 2020: "Anthony Edwards", 2021: "Cade Cunningham",
    2022: "Paolo Banchero", 2023: "Victor Wembanyama", 2024: "Zaccharie Risacher",
    2025: "Cooper Flagg",
};
// 真实榜眼/探花抽查（防系统性错位）
const REAL_TOP3_SPOT = {
    1997: [null, "Keith Van Horn", "Chauncey Billups"],
    2003: [null, "Darko Milicic", "Carmelo Anthony"],
    2007: ["Greg Oden", "Kevin Durant", "Al Horford"],
    2012: [null, "Michael Kidd-Gilchrist", "Bradley Beal"],
    2018: [null, "Marvin Bagley III", "Luka Doncic"],
    2023: [null, "Brandon Miller", "Scoot Henderson"],
};
// 2011 榜眼/探花：Derrick Williams / Enes Kanter（自由）
// 2021 榜眼/探花：Jalen Green / Evan Mobley
let pass = 0, fail = 0;
const fails = [];
for (const yr in REAL_PICK1) {
    const expect = REAL_PICK1[yr];
    let found = null;
    for (const pid in D.players) {
        const g = D.players[pid];
        if (g[5] === Number(yr) && g[6] === 1 && g[7] === 1) { found = g[0]; break; }
    }
    if (found === expect) pass++;
    else { fail++; fails.push(`${yr} 状元=${found} 应为 ${expect}`); }
    // 榜眼探花抽查
    const spot = REAL_TOP3_SPOT[yr];
    if (spot) {
        for (let pick = 1; pick <= 2; pick++) {
            const exp = spot[pick];
            if (!exp) continue;
            let got = null;
            for (const pid in D.players) {
                const g = D.players[pid];
                if (g[5] === Number(yr) && g[6] === 1 && g[7] === pick + 1) { got = g[0]; break; }
            }
            // 名字变体兼容（Marvin Bagley III vs Marvin Bagley）
            if (got === exp || (got && exp.startsWith(got)) || (got && got.startsWith(exp.replace(' III', '')))) pass++;
            else { fail++; fails.push(`${yr} 第${pick + 1}顺位=${got} 应为 ${exp}`); }
        }
    }
}
console.log(`状元/高顺位: 通过 ${pass} 失败 ${fail}`);
if (fails.length) console.log(fails.map(f => `  ✗ ${f}`).join('\n'));

// 选秀年人数分布合理性
console.log("\n----- 各选秀年人数（前2轮60人+落选补充）-----");
const draftCounts = {};
for (const pid in D.players) {
    const g = D.players[pid];
    if (g[5]) draftCounts[g[5]] = (draftCounts[g[5]] || 0) + 1;
}
let anom = 0;
for (const yr of [1996, 2003, 2013, 2020, 2025]) {
    console.log(`  ${yr}: ${draftCounts[yr] || 0} 人`);
    if (draftCounts[yr] < 40 || draftCounts[yr] > 90) anom++;
}
anom === 0 ? console.log("  ✓ 选秀班级规模正常") : console.log(`  ⚠ ${anom} 个年份规模异常`);

console.log("\n========== D. 现役名单 players.js ==========");
const sb2 = { console, Math, JSON, window: {} };
sb2.window = sb2; vm.createContext(sb2);
vm.runInContext(fs.readFileSync(path.join('js', 'data/teams.js'), 'utf8'), sb2);
vm.runInContext(fs.readFileSync(path.join('js', 'data/players.js'), 'utf8'), sb2);
const P = sb2.PLAYERS_DATA, T2 = sb2.TEAMS_DATA;
let pPass = 0, pFail = 0;
const pFails = [];
const teamCount = {};
for (const p of P) {
    const errs = [];
    if (!p.n || !p.t || !p.p) errs.push('basic');
    if (!T2.some(t => t.id === p.t)) errs.push(`team=${p.t}`);
    if (!['PG', 'SG', 'SF', 'PF', 'C'].includes(p.p)) errs.push(`pos=${p.p}`);
    if (!(p.a >= 18 && p.a <= 42)) errs.push(`age=${p.a}`);
    if (!(p.o >= 55 && p.o <= 99)) errs.push(`ovr=${p.o}`);
    if (!(p.sal > 0 && p.sal <= 60)) errs.push(`sal=${p.sal}`);
    for (const k of ['ins', 'sh', 'pa', 're', 'de', 'at', 'iq']) {
        if (!(p[k] >= 15 && p[k] <= 99)) errs.push(`${k}=${p[k]}`);
    }
    teamCount[p.t] = (teamCount[p.t] || 0) + 1;
    if (errs.length) { pFail++; if (pFails.length < 10) pFails.push(`${p.n}: ${errs.join(',')}`); }
    else pPass++;
}
console.log(`结构: ${pPass} 合法 / ${pFail} 非法`);
if (pFails.length) console.log(pFails.map(f => `  ✗ ${f}`).join('\n'));

// 每队人数
const badTeams = Object.entries(teamCount).filter(([t, n]) => n < 12 || n > 16);
badTeams.length === 0 ? console.log(`✓ 30 队每队 12-16 人（共 ${P.length} 人）`) : console.log(`✗ 人数异常队: ${badTeams.map(([t, n]) => t + '=' + n).join(', ')}`);

// 总评 TOP10 与真实世界排序一致性（2026-27 快照为虚构阵容，验证相对合理性）
const top = [...P].sort((a, b) => b.o - a.o).slice(0, 12).map(p => `${p.n}(${p.o})`);
console.log(`  ℹ 总评TOP12: ${top.join(', ')}`);
const superElites = P.filter(p => p.o >= 95);
console.log(`  ℹ 95+ 超巨 ${superElites.length} 人: ${superElites.map(p => p.n).join(', ') || '无'}`);

// 总评与能力分一致性（o 不应远超八维加权最大值/最小值）
let ovrErr = 0;
for (const p of P) {
    const vals = [p.ins, p.sh, p.pa, p.re, p.de, p.at, p.iq];
    const max = Math.max(...vals), min = Math.min(...vals);
    if (p.o > max + 3 || p.o < min - 3) ovrErr++;
}
ovrErr === 0 ? console.log("✓ 总评均在八维 [min-3, max+3] 包络内") : console.log(`✗ 总评越界 ${ovrErr} 人`);
