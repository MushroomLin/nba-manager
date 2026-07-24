// NBA 球队数据库 —— 30 支球队，按联盟/分区组织
const TEAMS_DATA = [
    // ===== 东部联盟 =====
    // 大西洋赛区
    { id: "BOS", city: "波士顿", name: "凯尔特人", abbr: "BOS", conf: "East", div: "Atlantic", color: "#007A33" },
    { id: "BKN", city: "布鲁克林", name: "篮网", abbr: "BKN", conf: "East", div: "Atlantic", color: "#000000" },
    { id: "NYK", city: "纽约", name: "尼克斯", abbr: "NYK", conf: "East", div: "Atlantic", color: "#006BB6" },
    { id: "PHI", city: "费城", name: "76人", abbr: "PHI", conf: "East", div: "Atlantic", color: "#006BB6" },
    { id: "TOR", city: "多伦多", name: "猛龙", abbr: "TOR", conf: "East", div: "Atlantic", color: "#CE1141" },
    // 中央赛区
    { id: "CHI", city: "芝加哥", name: "公牛", abbr: "CHI", conf: "East", div: "Central", color: "#CE1141" },
    { id: "CLE", city: "克利夫兰", name: "骑士", abbr: "CLE", conf: "East", div: "Central", color: "#860038" },
    { id: "DET", city: "底特律", name: "活塞", abbr: "DET", conf: "East", div: "Central", color: "#C8102E" },
    { id: "IND", city: "印第安纳", name: "步行者", abbr: "IND", conf: "East", div: "Central", color: "#002D62" },
    { id: "MIL", city: "密尔沃基", name: "雄鹿", abbr: "MIL", conf: "East", div: "Central", color: "#00471B" },
    // 东南赛区
    { id: "ATL", city: "亚特兰大", name: "老鹰", abbr: "ATL", conf: "East", div: "Southeast", color: "#E03A3E" },
    { id: "CHA", city: "夏洛特", name: "黄蜂", abbr: "CHA", conf: "East", div: "Southeast", color: "#1D1160" },
    { id: "MIA", city: "迈阿密", name: "热火", abbr: "MIA", conf: "East", div: "Southeast", color: "#98002E" },
    { id: "ORL", city: "奥兰多", name: "魔术", abbr: "ORL", conf: "East", div: "Southeast", color: "#0077C0" },
    { id: "WAS", city: "华盛顿", name: "奇才", abbr: "WAS", conf: "East", div: "Southeast", color: "#002B5C" },

    // ===== 西部联盟 =====
    // 西北赛区
    { id: "DEN", city: "丹佛", name: "掘金", abbr: "DEN", conf: "West", div: "Northwest", color: "#0E2240" },
    { id: "MIN", city: "明尼苏达", name: "森林狼", abbr: "MIN", conf: "West", div: "Northwest", color: "#236192" },
    { id: "OKC", city: "俄克拉荷马城", name: "雷霆", abbr: "OKC", conf: "West", div: "Northwest", color: "#007AC1" },
    { id: "POR", city: "波特兰", name: "开拓者", abbr: "POR", conf: "West", div: "Northwest", color: "#E03A3E" },
    { id: "UTA", city: "犹他", name: "爵士", abbr: "UTA", conf: "West", div: "Northwest", color: "#002B5C" },
    // 太平洋赛区
    { id: "GSW", city: "金州", name: "勇士", abbr: "GSW", conf: "West", div: "Pacific", color: "#1D428A" },
    { id: "LAC", city: "洛杉矶", name: "快船", abbr: "LAC", conf: "West", div: "Pacific", color: "#C8102E" },
    { id: "LAL", city: "洛杉矶", name: "湖人", abbr: "LAL", conf: "West", div: "Pacific", color: "#552583" },
    { id: "PHX", city: "菲尼克斯", name: "太阳", abbr: "PHX", conf: "West", div: "Pacific", color: "#1D1160" },
    { id: "SAC", city: "萨克拉门托", name: "国王", abbr: "SAC", conf: "West", div: "Pacific", color: "#5A2D81" },
    // 西南赛区
    { id: "DAL", city: "达拉斯", name: "独行侠", abbr: "DAL", conf: "West", div: "Southwest", color: "#00538C" },
    { id: "HOU", city: "休斯顿", name: "火箭", abbr: "HOU", conf: "West", div: "Southwest", color: "#CE1141" },
    { id: "MEM", city: "孟菲斯", name: "灰熊", abbr: "MEM", conf: "West", div: "Southwest", color: "#5D76A9" },
    { id: "NOP", city: "新奥尔良", name: "鹈鹕", abbr: "NOP", conf: "West", div: "Southwest", color: "#0C2340" },
    { id: "SAS", city: "圣安东尼奥", name: "马刺", abbr: "SAS", conf: "West", div: "Southwest", color: "#C4CED4" },
];

// 工资帽（百万美元，参考 2024-25 赛季第一层工资帽）
const SALARY_CAP = 140.588;        // 工资帽
const LUXURY_TAX = 170.814;        // 奢侈税线
const FIRST_APRON = 178.132;       // 第一土豪线
const SECOND_APRON = 188.931;      // 第二土豪线

window.TEAMS_DATA = TEAMS_DATA;
window.SALARY_CAP = SALARY_CAP;
window.LUXURY_TAX = LUXURY_TAX;
