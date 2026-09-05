// 球员数据完整性与准确性验证
// A. 结构完整性：历史 30 季 + 现役名单的格式/范围/引用一致性
// B. 事实准确性：明星球员关键赛季对照真实 NBA 数据（年龄/球队/场均/选秀）
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, JSON, window: {}, TEAMS_DATA: null };
sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join('js', 'data/history/history_seasons.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join('js', 'data/teams.js'), 'utf8'), sandbox);
const D = sandbox.window.HISTORY_DATA, TEAMS = sandbox.TEAMS_DATA;
const ABBR_MAP = { SEA: "OKC", VAN: "MEM", NJN: "BKN", WSB: "WAS", CHH: "CHA", CHB: "CHA", NOH: "NOP", NOK: "NOP", NO: "NOP" };
const mapTeam = a => ABBR_MAP[a] || (TEAMS.some(t => t.id === a) ? a : null);
const CUR_ABBRS = new Set(TEAMS.map(t => t.id));
const HIST_ABBRS = new Set(Object.values(ABBR_MAP).concat(Object.keys(ABBR_MAP)).concat(Array.from(CUR_ABBRS)));

let pass = 0, fail = 0, warn = 0;
const ok = m => { pass++; };
const bad = m => { fail++; console.log(`  ✗ ${m}`); };
const warnLog = m => { warn++; console.log(`  ⚠ ${m}`); };

console.log("========== A. 结构完整性 ==========");
// A1 元信息
(D.first === 1996 && D.last === 2025) ? ok("元信息 1996-2025") : bad(`元信息 first=${D.first} last=${D.last}`);
const seasonYears = Object.keys(D.seasons).map(Number).sort((a, b) => a - b);
if (seasonYears.length === 30 && seasonYears[0] === 1996 && seasonYears[29] === 2025) ok("30 个赛季 1996-2025"); else bad(`赛季数 ${seasonYears.length}: ${seasonYears[0]}-${seasonYears[seasonYears.length - 1]}`);

// A2 注册表格式: [en, zh|null, pos, hIn, wLb, draftYr, round, pick, debut, last]
let regErr = 0, zhMissing = 0, regCount = 0;
const regErrDetail = [];
for (const pid in D.players) {
    regCount++;
    const g = D.players[pid];
    const issues = [];
    if (!Array.isArray(g) || g.length !== 10) issues.push('len');
    else {
        if (typeof g[0] !== 'string' || g[0].length < 2) issues.push('name');
        if (g[1] !== null && typeof g[1] !== 'string') issues.push('zh');
        if (typeof g[2] !== 'string') issues.push('pos');
        if (!(g[3] >= 60 && g[3] <= 92)) issues.push(`h=${g[3]}`);
        if (!(g[4] >= 130 && g[4] <= 380)) issues.push(`w=${g[4]}`);
        if (g[5] !== 0 && !(g[5] >= 1947 && g[5] <= 2025)) issues.push(`dYr=${g[5]}`);
        // 1988 前 NBA 选秀多达 7-10 轮（如 Mario Elie 1985 第7轮160顺位），轮次≤10 顺位≤250 均合法
        if (g[6] !== 0 && !(g[6] >= 1 && g[6] <= 10)) issues.push(`rd=${g[6]}`);
        if (g[6] === 0 && g[7] !== 0) issues.push(`pick0`);
        if (g[6] > 0 && !(g[7] >= 1 && g[7] <= 250)) issues.push(`pick=${g[7]}`);
        if (g[8] !== 0 && !(g[8] >= 1946 && g[8] <= 2025)) issues.push(`debut=${g[8]}`);
        if (g[9] !== 0 && !(g[9] >= g[8] && g[9] <= 2025)) issues.push(`last=${g[9]}<debut=${g[8]}`);
        if (g[1] === null) zhMissing++;
    }
    if (issues.length) { regErr++; if (regErrDetail.length < 15) regErrDetail.push(`${pid} ${g[0]}: ${issues.join(',')}`); }
}
regErr === 0 ? ok(`注册表 ${regCount} 人格式合法`) : bad(`注册表格式错误 ${regErr} 处\n    ${regErrDetail.join('\n    ')}`);
console.log(`  ℹ 中文名缺失: ${zhMissing}/${regCount} (${(100 * zhMissing / regCount).toFixed(1)}%)`);

// A3 赛季行格式: [pid, abbr, posIdx, age, ovr, sal, pot, ins..iq(7), gp, min, pts, reb, ast, stl, blk, tov]
let rowErr = 0, nanErr = 0, totalRows = 0, gpOver = 0;
const gpOverDetail = [];
const perTeamSeason = {}; // "year|team" -> count
const orphanRows = 0;
let orphan = 0;
for (const y of seasonYears) {
    const rows = D.seasons[String(y)];
    if (!Array.isArray(rows)) { bad(`${y} 赛季行缺失`); continue; }
    for (const r of rows) {
        totalRows++;
        if (!Array.isArray(r) || r.length !== 22) { rowErr++; continue; }
        const [pid, abbr, pos, age, ovr, sal, pot] = r;
        const ab = [r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14], r[15], r[16], r[17], r[18], r[19], r[20], r[21]];
        if (ab.some(v => v === null || v === undefined || Number.isNaN(v))) nanErr++;
        if (!D.players[String(pid)]) orphan++;
        if (!HIST_ABBRS.has(abbr)) rowErr++;
        if (!(pos >= 0 && pos <= 4)) rowErr++;
        if (!(age >= 18 && age <= 45)) rowErr++;
        if (!(ovr >= 40 && ovr <= 99)) rowErr++;
        if (!(sal === 0 || (sal > 0 && sal < 600))) rowErr++;
        if (!(pot >= ovr - 5 && pot <= 99)) rowErr++; // 潜力不应大幅低于当前（老将潜力=当前）
        if (!(r[7] >= 20 && r[7] <= 99)) rowErr++;   // ins
        if (!(r[14] >= 0 && r[14] <= (y === 1998 ? 50 : 82))) { gpOver++; if (gpOver <= 20) gpOverDetail.push(`${y} pid${pid}: gp=${r[14]}`); }
        if (!(r[15] >= 0 && r[15] <= 48.6)) rowErr++;  // min 场均
        if (!(r[16] >= 0 && r[16] <= 42)) rowErr++;   // pts 场均
        if (!(r[17] >= 0 && r[17] <= 26)) rowErr++;   // reb
        if (!(r[18] >= 0 && r[18] <= 20)) rowErr++;   // ast
        const t = mapTeam(abbr);
        if (t) { const k = y + "|" + t; perTeamSeason[k] = (perTeamSeason[k] || 0) + 1; }
    }
}
rowErr === 0 && nanErr === 0 ? ok(`赛季行 ${totalRows} 条格式合法`) : bad(`赛季行错误 格式${rowErr} NaN${nanErr}`);
orphan === 0 ? ok("无孤儿赛季行（全部 pid 在注册表）") : bad(`孤儿行 ${orphan} 条`);
gpOver === 0 ? ok("GP 均在合法范围（98-99 赛季 ≤50）") : bad(`GP 超限 ${gpOver} 条\n    ${gpOverDetail.join('\n    ')}`);

// A4 每队每赛季人数（映射后 ≥10 视为有名单，缺员队需 filler 补）
let teamMissing = 0;
for (const y of seasonYears) {
    for (const t of CUR_ABBRS) {
        const n = perTeamSeason[y + "|" + t] || 0;
        if (n < 10) { teamMissing++; if (teamMissing <= 12) console.log(`  ℹ ${y} ${t}: 仅 ${n} 名真实球员（filler 补齐）`); }
    }
}
const expectedMissing = (y) => {
    // 1996-2001: 29 队无新奥尔良（NOH 2002 加入）→ NOP 缺
    if (y <= 2001) return 1;
    // 2002-2003: 无夏洛特（山猫 2004 加入）→ CHA 缺
    if (y <= 2003) return 1;
    return 0;
};
let unexpectedMissing = 0;
for (const y of seasonYears) {
    for (const t of CUR_ABBRS) {
        const n = perTeamSeason[y + "|" + t] || 0;
        if (n < 10) {
            const isExpected = (y <= 2001 && t === "NOP") || (y >= 2002 && y <= 2003 && t === "CHA");
            if (!isExpected) unexpectedMissing++;
        }
    }
}
unexpectedMissing === 0 ? ok(`缺席球队全部符合历史事实（96-01无鹈鹕/02-03无黄蜂）`) : bad(`意外缺席球队 ${unexpectedMissing} 队次`);

// A5 生涯连续性: debut ≤ 赛季年 ≤ last+1
let continuityErr = 0;
for (const y of seasonYears) {
    for (const r of D.seasons[String(y)]) {
        const g = D.players[String(r[0])];
        if (!g) continue;
        if (g[8] && g[8] > 0 && y < g[8]) continuityErr++;
        if (g[9] && g[9] > 0 && y > g[9]) continuityErr++;
    }
}
continuityErr === 0 ? ok("生涯连续性（首秀≤赛季≤末年）") : bad(`连续性错误 ${continuityErr} 条`);

// A6 球员年龄单调性 + 同赛季不重复
let ageErr = 0, dupErr = 0;
const seen = new Set();
for (const y of seasonYears) {
    const pids = new Set();
    for (const r of D.seasons[String(y)]) {
        if (pids.has(r[0])) dupErr++;
        pids.add(r[0]);
    }
}
// 年龄随赛季递增（同一球员）
const ageTrack = {};
for (const y of seasonYears) {
    for (const r of D.seasons[String(y)]) {
        const prev = ageTrack[r[0]];
        if (prev != null && r[3] < prev) ageErr++;
        ageTrack[r[0]] = r[3];
    }
}
dupErr === 0 ? ok("同赛季无重复球员行") : bad(`重复 ${dupErr} 条`);
ageErr === 0 ? ok("球员年龄随赛季单调不减") : bad(`年龄回退 ${ageErr} 条`);

console.log(`\n[结构] 通过 ${pass} 失败 ${fail} 警告 ${warn}`);
module.exports = { D, mapTeam, CUR_ABBRS, seasonYears };
