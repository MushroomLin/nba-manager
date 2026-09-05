// 引擎级实测：4星+55替补阵容的健康/伤停胜率
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, JSON, window: {} };
sandbox.window = sandbox; vm.createContext(sandbox);
['data/teams.js', 'data/players.js', 'engine/simulation.js'].forEach(r =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', r), 'utf8'), sandbox, { filename: r }));
const SimEngine = sandbox.SimEngine, PLAYERS = sandbox.PLAYERS_DATA;

function mkPlayer(o, pos, name) {
    const p = { id: 'T' + Math.random().toString(36).slice(2), n: name || ('P' + o), p: pos || 'PF', a: 26 };
    p.o = o;
    p.ins = o; p.sh = o; p.pa = o; p.de = o; p.iq = o; p.re = o; p.at = o;
    return p;
}

// CHI 真实阵容作为"联盟平均对手"
const chiRoster = PLAYERS.filter(p => p.t === 'CHI').map(p => ({ ...p, injured: 0 }));
const oppRating = SimEngine.teamRating(chiRoster);
console.log(`对手(CHI 真实阵容) teamRating = ${oppRating.toFixed(1)}`);

function testRoster(label, roster) {
    const N = 300;
    let w = 0;
    for (let i = 0; i < N; i++) {
        const home = i % 2 === 0;
        const res = home ? SimEngine.simulateGame(roster, chiRoster) : SimEngine.simulateGame(chiRoster, roster);
        const won = home ? res.winner === 'home' : res.winner === 'away';
        if (won) w++;
    }
    // 轮换与分钟分布
    const rot = SimEngine.buildRotation(roster, { pace: 1, defense: 1, rotation: 1 });
    const mins = rot.map(r => `${r.player.n}:${r.min}`).join(' ');
    const rating = SimEngine.teamRating(roster);
    console.log(`${label}: rating=${rating.toFixed(1)} 胜率=${(w / N * 100).toFixed(0)}% | ${mins}`);
}

const stars4 = [mkPlayer(99, 'PG', '星1'), mkPlayer(99, 'C', '星2'), mkPlayer(91, 'SF', '星3'), mkPlayer(90, 'SG', '星4')];
const bench55 = Array.from({ length: 11 }, (_, i) => mkPlayer(55, ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], '替补' + i));

testRoster('4星+55替补(健康)', [...stars4.map(p => ({ ...p })), ...bench55.map(p => ({ ...p }))]);
testRoster('3星+55替补(伤1星)', [...stars4.slice(0, 3).map(p => ({ ...p })), ...bench55.map(p => ({ ...p }))]);
testRoster('2星+55替补(伤2星)', [...stars4.slice(0, 2).map(p => ({ ...p })), ...bench55.map(p => ({ ...p }))]);
testRoster('4星+真实替补(对照)', [...stars4.map(p => ({ ...p })), ...chiRoster.slice(4).map(p => ({ ...p }))]);

// 对照：真实顶级阵容 vs CHI
testRoster('CHI真实(基准)', chiRoster.map(p => ({ ...p })));
