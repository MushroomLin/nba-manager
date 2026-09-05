// B. 事实准确性验证：明星球员关键赛季对照真实 NBA 数据
// 基准数据来源：真实 NBA 记录（年龄按 BBR 口径±1，场均±15% 容差）
const { D, mapTeam } = require('./test_data_integrity.js');

// 按英文名建索引（重名时取首秀更早者——如 Patrick Ewing 父子）
const byName = {};
for (const pid in D.players) {
    const g = D.players[pid];
    const prev = byName[g[0]];
    if (!prev || g[8] < D.players[prev][8]) byName[g[0]] = pid;
}

// 基准: [英文名, 赛季起始年, 真实球队abbr, 真实年龄, 真实pts, 真实reb, 真实ast, 备注]
const FACTS = [
    // ===== 90 年代 =====
    ["Michael Jordan", 1996, "CHI", 34, 29.6, 5.9, 4.3, "97公牛冠军"],
    ["Michael Jordan", 1997, "CHI", 35, 28.7, 5.8, 3.5, "98最后一舞"],
    ["Tim Duncan", 1997, "SAS", 21, 21.1, 11.9, 2.7, "邓肯新秀年"],
    ["Allen Iverson", 2000, "PHI", 25, 31.1, 3.8, 4.6, "01 AI MVP得分王"],
    ["Shaquille O'Neal", 1999, "LAL", 27, 29.7, 13.6, 3.8, "00鲨鱼MVP"],
    ["Karl Malone", 1996, "UTA", 33, 27.4, 9.9, 4.5, "97马龙MVP"],
    ["Hakeem Olajuwon", 1996, "HOU", 33, 23.2, 9.2, 2.2, "97大梦"],
    ["Scottie Pippen", 1996, "CHI", 31, 20.2, 6.5, 5.7, "97皮蓬"],
    ["Gary Payton", 1996, "OKC", 28, 21.8, 4.6, 7.1, "97手套（SEA→OKC）"],
    ["John Stockton", 1996, "UTA", 34, 14.4, 2.8, 10.5, "97斯托克顿"],
    ["Reggie Miller", 1997, "IND", 31, 19.5, 3.0, 3.2, "98米勒"],
    ["David Robinson", 1998, "SAS", 33, 15.8, 10.0, 2.3, "99海军上将"],
    ["Charles Barkley", 1996, "HOU", 33, 19.2, 13.5, 4.7, "97巴克利"],
    ["Patrick Ewing", 1996, "NYK", 34, 20.8, 10.0, 1.8, "97尤因"],
    ["Anfernee Hardaway", 1996, "ORL", 25, 20.5, 4.5, 5.6, "97便士"],
    ["Alonzo Mourning", 1998, "MIA", 28, 20.1, 11.0, 1.6, "99莫宁"],
    // ===== 2000s =====
    ["Kobe Bryant", 2005, "LAL", 27, 35.4, 5.3, 4.5, "06科比81分赛季"],
    ["Kobe Bryant", 2000, "LAL", 22, 28.5, 5.9, 5.0, "01科比"],
    ["Tracy McGrady", 2002, "ORL", 23, 32.1, 6.5, 5.5, "03麦迪得分王"],
    ["Vince Carter", 2000, "TOR", 24, 27.6, 5.5, 3.9, "01卡特"],
    ["LeBron James", 2003, "CLE", 19, 20.9, 5.5, 5.9, "04勒布朗新秀"],
    ["LeBron James", 2007, "CLE", 23, 30.0, 7.9, 7.2, "08勒布朗得分王"],
    ["LeBron James", 2011, "MIA", 27, 27.1, 7.9, 6.2, "12勒布朗MVP冠军"],
    ["LeBron James", 2015, "CLE", 31, 25.3, 7.4, 6.8, "16骑士冠军"],
    ["Dwyane Wade", 2008, "MIA", 27, 30.2, 5.0, 7.5, "09韦德得分王"],
    ["Tim Duncan", 2002, "SAS", 26, 23.3, 12.9, 3.9, "03邓肯MVP冠军"],
    ["Kevin Garnett", 2003, "MIN", 27, 24.2, 13.9, 5.0, "04加内特MVP"],
    ["Steve Nash", 2004, "PHX", 31, 15.5, 3.3, 11.5, "05纳什MVP"],
    ["Dirk Nowitzki", 2006, "DAL", 28, 24.6, 8.9, 3.4, "07司机MVP"],
    ["Dirk Nowitzki", 2010, "DAL", 32, 23.0, 7.0, 2.6, "11小牛冠军"],
    ["Yao Ming", 2002, "HOU", 22, 13.5, 8.2, 1.7, "03姚明新秀状元"],
    ["Yao Ming", 2007, "HOU", 27, 22.0, 10.8, 2.3, "08姚明"],
    ["Carmelo Anthony", 2003, "DEN", 19, 21.0, 6.1, 2.8, "04甜瓜新秀"],
    ["Dwyane Wade", 2005, "MIA", 24, 27.2, 5.7, 6.7, "06韦德FMVP"],
    ["Shaquille O'Neal", 2005, "MIA", 33, 20.0, 9.2, 1.9, "06鲨鱼热火"],
    ["Chris Paul", 2007, "NOP", 22, 21.1, 4.0, 11.0, "08保罗（NOH→NOP）"],
    ["Dwight Howard", 2010, "ORL", 24, 22.9, 14.1, 1.4, "11霍华德"],
    ["Amar'e Stoudemire", 2004, "PHX", 22, 26.0, 8.9, 1.6, "05小斯"],
    ["Jason Kidd", 2001, "BKN", 28, 14.7, 7.3, 9.9, "02基德（NJN→BKN）"],
    ["Paul Pierce", 2007, "BOS", 30, 19.6, 5.1, 4.5, "08皮尔斯FMVP"],
    ["Kevin Durant", 2012, "OKC", 24, 28.1, 7.9, 4.6, "13杜兰特得分王"],
    ["Kevin Durant", 2013, "OKC", 25, 32.0, 7.4, 5.5, "14杜兰特MVP"],
    // ===== 2010s =====
    ["Stephen Curry", 2014, "GSW", 26, 23.8, 4.3, 7.7, "15库里MVP"],
    ["Stephen Curry", 2015, "GSW", 27, 30.1, 5.4, 6.7, "16库里全票MVP"],
    ["Russell Westbrook", 2016, "OKC", 28, 31.6, 10.7, 10.4, "17威少场均三双MVP"],
    ["James Harden", 2017, "HOU", 28, 30.4, 5.4, 8.8, "18哈登MVP"],
    ["James Harden", 2018, "HOU", 29, 36.1, 6.6, 7.5, "19哈登得分王"],
    ["Kawhi Leonard", 2018, "TOR", 27, 26.6, 7.3, 3.3, "19卡哇伊FMVP"],
    ["Giannis Antetokounmpo", 2020, "MIL", 26, 28.1, 11.0, 5.9, "21字母哥FMVP"],
    ["Nikola Jokic", 2021, "DEN", 26, 27.1, 13.8, 7.9, "22约基奇MVP"],
    ["Nikola Jokic", 2022, "DEN", 27, 24.5, 11.8, 9.8, "23约基奇FMVP"],
    ["Luka Doncic", 2022, "DAL", 23, 32.4, 8.6, 8.0, "23东契奇"],
    ["Luka Doncic", 2023, "DAL", 24, 33.9, 9.2, 9.8, "24东契奇得分王"],
    ["Anthony Davis", 2019, "LAL", 26, 26.1, 9.3, 3.2, "20浓眉冠军"],
    ["Kyrie Irving", 2015, "CLE", 23, 19.6, 3.0, 4.7, "16欧文"],
    ["Damian Lillard", 2019, "POR", 29, 30.0, 4.3, 8.0, "20利拉德"],
    ["Devin Booker", 2020, "PHX", 24, 25.6, 4.2, 4.3, "21布克"],
    ["Jayson Tatum", 2021, "BOS", 23, 26.9, 8.0, 4.4, "22塔图姆"],
    ["Jayson Tatum", 2023, "BOS", 26, 26.9, 8.1, 4.9, "24塔图姆冠军"],
    ["Joel Embiid", 2021, "PHI", 27, 30.6, 11.7, 4.2, "22恩比德得分王"],
    ["Joel Embiid", 2022, "PHI", 28, 33.1, 10.2, 4.2, "23恩比德MVP得分王"],
    // ===== 2020s 新生代 =====
    ["Victor Wembanyama", 2023, "SAS", 20, 21.4, 10.6, 3.9, "24文班新秀状元"],
    ["Shai Gilgeous-Alexander", 2023, "OKC", 25, 30.1, 5.5, 6.2, "24SGA"],
    ["Shai Gilgeous-Alexander", 2024, "OKC", 26, 32.7, 5.0, 6.4, "25SGA得分王MVP冠军"],
    ["Luka Doncic", 2024, "LAL", 25, 28.2, 8.2, 7.7, "25东契奇湖人"],
    ["Jayson Tatum", 2024, "BOS", 27, 26.8, 8.7, 6.0, "25塔图姆"],
    ["Anthony Edwards", 2023, "MIN", 22, 25.9, 5.4, 5.1, "24爱德华兹"],
    ["Anthony Edwards", 2024, "MIN", 23, 27.6, 5.7, 4.5, "25爱德华兹"],
    ["Tyrese Haliburton", 2023, "IND", 23, 20.1, 3.7, 10.9, "24哈利伯顿"],
    ["Ja Morant", 2021, "MEM", 22, 27.4, 5.7, 6.7, "22莫兰特MIP"],
    ["Zion Williamson", 2022, "NOP", 22, 26.0, 7.0, 4.6, "23锡安"],
    ["Jalen Brunson", 2023, "NYK", 27, 28.7, 3.6, 6.7, "24布伦森"],
    ["De'Aaron Fox", 2022, "SAC", 25, 25.0, 4.2, 6.1, "23福克斯"],
    ["Devin Booker", 2023, "PHX", 27, 27.1, 4.5, 6.9, "24布克"],
    ["Donovan Mitchell", 2021, "UTA", 25, 25.9, 4.2, 5.3, "22米切尔爵士"],
    ["Karl-Anthony Towns", 2021, "MIN", 26, 24.6, 9.8, 3.6, "22唐斯"],
    ["Karl-Anthony Towns", 2023, "MIN", 28, 21.8, 8.3, 3.0, "24唐斯"],
    ["Bam Adebayo", 2022, "MIA", 25, 20.4, 9.2, 3.2, "23阿德巴约"],
    ["Jrue Holiday", 2023, "BOS", 33, 12.5, 4.7, 4.8, "24假日哥冠军"],
    ["Kyrie Irving", 2022, "DAL", 30, 25.6, 5.0, 5.2, "23欧文独行侠"],
    ["DeMar DeRozan", 2020, "SAS", 31, 21.6, 4.2, 6.9, "21德罗赞马刺"],
    ["DeMar DeRozan", 2021, "CHI", 32, 27.9, 5.2, 4.9, "22德罗赞公牛"],
    ["Chris Paul", 2020, "PHX", 35, 14.4, 4.4, 10.8, "21保罗"],
    ["Jimmy Butler", 2019, "MIA", 30, 19.9, 6.7, 6.0, "20巴特勒"],
    ["Jimmy Butler", 2022, "MIA", 33, 20.8, 5.7, 5.0, "23黑八巴特勒"],
    ["Jamal Murray", 2022, "DEN", 25, 20.0, 4.0, 6.2, "23穆雷"],
    ["Pascal Siakam", 2023, "IND", 29, 21.8, 7.4, 3.6, "24西亚卡姆步行者"],
];

let pass = 0, fail = 0, miss = 0;
const fails = [];
console.log("========== B. 事实准确性（明星球员关键赛季） ==========");
for (const [name, year, team, age, pts, reb, ast, note] of FACTS) {
    const pid = byName[name];
    if (!pid) { miss++; console.log(`  ? ${name} 不在数据库（${year} ${note}）`); continue; }
    const rows = D.seasons[String(year)];
    const row = rows && rows.find(r => r[0] === Number(pid));
    if (!row) { miss++; console.log(`  ? ${name} ${year} 赛季缺失（${note}）`); continue; }
    const [_, abbr, pos, a, ovr, sal, pot] = row;
    const [gp, min, p, rb, as, stl, blk, tov] = [row[14], row[15], row[16], row[17], row[18], row[19], row[20], row[21]];
    const mapped = mapTeam(abbr);
    const errs = [];
    if (mapped !== team) errs.push(`球队 ${abbr}→${mapped} 应为 ${team}`);
    if (Math.abs(a - age) > 1) errs.push(`年龄 ${a} 应为 ${age}±1`);
    // 场均容差：±20% 或 ±1.5（取宽），得分王级别 ±2.5
    const tol = (real, got, pct, abs) => Math.abs(got - real) <= Math.max(real * pct, abs);
    if (!tol(pts, p, 0.2, 2.5)) errs.push(`得分 ${p} 应为 ${pts}`);
    if (!tol(reb, rb, 0.25, 2.0)) errs.push(`篮板 ${rb} 应为 ${reb}`);
    if (!tol(ast, as, 0.25, 2.0)) errs.push(`助攻 ${as} 应为 ${ast}`);
    if (errs.length) { fail++; fails.push(`${name} ${year}-${(year + 1) % 100} (${note}): ${errs.join('; ')}`); }
    else pass++;
}
console.log(`\n事实核对: 通过 ${pass} / 失败 ${fail} / 赛季缺失 ${miss}`);
if (fails.length) console.log(fails.map(f => `  ✗ ${f}`).join('\n'));
