// 现役 NBA 球员数据库（2026-27 赛季阵容快照，截至2026年7月休赛期）
// 每位球员: n=姓名 t=球队 p=位置 a=年龄 o=总评 sal=薪资(百万)
// 能力值: ins=内线 sh=投篮 pa=传球 re=篮板 de=防守 at=运动能力 iq=球商 (均 0-99)
// 总评 o 为综合值，由位置加权计算得出

const PLAYERS_DATA = [
// ===== 东部 大西洋赛区 =====
// 波士顿凯尔特人 BOS
{n:"杰森·塔图姆",t:"BOS",p:"SF",a:28,o:95,sal:54.1,ins:88,sh:88,pa:78,re:75,de:84,at:86,iq:90},
{n:"保罗·乔治",t:"BOS",p:"SF",a:36,o:85,sal:49.0,ins:78,sh:82,pa:76,re:64,de:86,at:78,iq:86},
{n:"杰伦·怀特",t:"BOS",p:"PG",a:32,o:86,sal:18.8,ins:78,sh:82,pa:74,re:54,de:84,at:80,iq:86},
{n:"朱·霍勒迪",t:"BOS",p:"PG",a:36,o:82,sal:30.0,ins:74,sh:74,pa:80,re:58,de:90,at:74,iq:88},
{n:"克里斯塔普斯·波尔津吉斯",t:"BOS",p:"C",a:31,o:85,sal:40.0,ins:82,sh:82,pa:50,re:76,de:82,at:76,iq:80},
{n:"艾尔·霍福德",t:"BOS",p:"C",a:40,o:77,sal:7.0,ins:72,sh:76,pa:68,re:68,de:76,at:60,iq:88},
{n:"佩顿·普里查德",t:"BOS",p:"PG",a:28,o:80,sal:6.7,ins:68,sh:84,pa:74,re:42,de:66,at:74,iq:80},
{n:"迈克·康利",t:"BOS",p:"PG",a:39,o:74,sal:3.9,ins:62,sh:74,pa:80,re:42,de:72,at:60,iq:86},
{n:"米切尔·罗宾逊",t:"BOS",p:"C",a:28,o:80,sal:14.3,ins:76,sh:20,pa:36,re:88,de:84,at:78,iq:64},
{n:"尼米亚斯·克塔",t:"BOS",p:"C",a:26,o:74,sal:14.0,ins:74,sh:54,pa:50,re:78,de:74,at:78,iq:70},

// 布鲁克林篮网 BKN
{n:"卡姆·托马斯",t:"BKN",p:"SG",a:24,o:82,sal:8.0,ins:80,sh:82,pa:64,re:42,de:60,at:78,iq:72},
{n:"朱利叶斯·兰德尔",t:"BKN",p:"PF",a:31,o:84,sal:28.0,ins:84,sh:74,pa:78,re:80,de:62,at:74,iq:78},
{n:"卡梅隆·约翰逊",t:"BKN",p:"SF",a:30,o:79,sal:22.5,ins:70,sh:82,pa:62,re:54,de:72,at:74,iq:76},
{n:"基翁·埃利斯",t:"BKN",p:"SG",a:25,o:76,sal:9.0,ins:68,sh:76,pa:66,re:52,de:84,at:78,iq:74},
{n:"莫里茨·瓦格纳",t:"BKN",p:"C",a:28,o:74,sal:9.5,ins:74,sh:68,pa:64,re:62,de:60,at:72,iq:74},
{n:"诺亚·克洛尼",t:"BKN",p:"PF",a:21,o:75,sal:3.2,ins:68,sh:72,pa:54,re:58,de:70,at:76,iq:68},
{n:"戴隆·夏普",t:"BKN",p:"C",a:24,o:75,sal:6.0,ins:72,sh:40,pa:42,re:80,de:72,at:74,iq:66},
{n:"约什·米诺特",t:"BKN",p:"SF",a:23,o:73,sal:4.0,ins:70,sh:66,pa:62,re:58,de:70,at:78,iq:70},
{n:"米克尔·布朗",t:"BKN",p:"PG",a:19,o:73,sal:9.0,ins:66,sh:74,pa:78,re:44,de:64,at:80,iq:74},
{n:"杰伦·威尔逊",t:"BKN",p:"SF",a:24,o:72,sal:1.9,ins:62,sh:76,pa:58,re:54,de:68,at:70,iq:70},

// 纽约尼克斯 NYK
{n:"杰伦·布伦森",t:"NYK",p:"PG",a:29,o:92,sal:41.0,ins:84,sh:86,pa:86,re:46,de:72,at:74,iq:92},
{n:"卡尔-安东尼·唐斯",t:"NYK",p:"C",a:30,o:89,sal:49.2,ins:84,sh:84,pa:62,re:86,de:74,at:74,iq:84},
{n:"米卡尔·布里奇斯",t:"NYK",p:"SF",a:30,o:85,sal:23.3,ins:76,sh:80,pa:66,re:52,de:86,at:84,iq:80},
{n:"OG·阿努诺比",t:"NYK",p:"SF",a:28,o:85,sal:36.3,ins:76,sh:76,pa:58,re:58,de:90,at:86,iq:78},
{n:"乔什·哈特",t:"NYK",p:"SG",a:30,o:82,sal:18.1,ins:74,sh:70,pa:72,re:74,de:78,at:80,iq:80},
{n:"安德烈·德拉蒙德",t:"NYK",p:"C",a:32,o:75,sal:3.9,ins:78,sh:20,pa:40,re:88,de:70,at:70,iq:60},
{n:"迈尔斯·麦克布莱德",t:"NYK",p:"PG",a:25,o:77,sal:4.5,ins:68,sh:78,pa:70,re:44,de:74,at:74,iq:74},
{n:"普雷舍斯·阿丘瓦",t:"NYK",p:"PF",a:25,o:74,sal:6.0,ins:72,sh:50,pa:50,re:62,de:72,at:76,iq:68},
{n:"乔丹·克拉克森",t:"NYK",p:"SG",a:34,o:75,sal:3.9,ins:74,sh:78,pa:72,re:46,de:58,at:72,iq:74},
{n:"何塞·阿尔瓦拉多",t:"NYK",p:"PG",a:27,o:75,sal:4.0,ins:64,sh:74,pa:74,re:42,de:78,at:78,iq:78},

// 费城76人 PHI
{n:"乔尔·恩比德",t:"PHI",p:"C",a:32,o:94,sal:55.2,ins:90,sh:80,pa:74,re:84,de:84,at:76,iq:88},
{n:"勒布朗·詹姆斯",t:"PHI",p:"SF",a:41,o:88,sal:3.9,ins:80,sh:80,pa:90,re:70,de:74,at:74,iq:96},
{n:"泰瑞斯·马克西",t:"PHI",p:"PG",a:25,o:89,sal:35.1,ins:70,sh:88,pa:84,re:44,de:70,at:88,iq:84},
{n:"杰伦·布朗",t:"PHI",p:"SG",a:29,o:91,sal:49.4,ins:88,sh:80,pa:72,re:68,de:86,at:88,iq:84},
{n:"VJ·埃奇库姆",t:"PHI",p:"SG",a:20,o:78,sal:9.0,ins:70,sh:74,pa:70,re:54,de:78,at:84,iq:74},
{n:"贾里德·麦凯恩",t:"PHI",p:"PG",a:21,o:78,sal:5.0,ins:64,sh:84,pa:76,re:44,de:62,at:72,iq:78},
{n:"迪恩·韦德",t:"PHI",p:"PF",a:29,o:74,sal:9.8,ins:70,sh:74,pa:60,re:60,de:76,at:72,iq:74},
{n:"安芬尼·西蒙斯",t:"PHI",p:"SG",a:26,o:79,sal:12.3,ins:68,sh:84,pa:74,re:44,de:60,at:78,iq:76},
{n:"拉巴隆·菲隆",t:"PHI",p:"PG",a:19,o:71,sal:3.0,ins:64,sh:70,pa:74,re:46,de:68,at:78,iq:74},
{n:"阿德姆·博纳",t:"PHI",p:"C",a:21,o:71,sal:2.4,ins:74,sh:40,pa:44,re:74,de:74,at:76,iq:66},

// 多伦多猛龙 TOR
{n:"科怀·伦纳德",t:"TOR",p:"SF",a:35,o:89,sal:50.0,ins:80,sh:82,pa:68,re:62,de:92,at:82,iq:88},
{n:"斯科蒂·巴恩斯",t:"TOR",p:"PF",a:25,o:88,sal:38.0,ins:80,sh:74,pa:78,re:78,de:80,at:84,iq:84},
{n:"RJ·巴雷特",t:"TOR",p:"SF",a:26,o:83,sal:27.7,ins:80,sh:76,pa:72,re:58,de:68,at:80,iq:76},
{n:"伊曼纽尔·奎克利",t:"TOR",p:"PG",a:26,o:84,sal:32.5,ins:72,sh:82,pa:82,re:48,de:72,at:80,iq:82},
{n:"雅各布·珀尔特尔",t:"TOR",p:"C",a:31,o:80,sal:19.5,ins:80,sh:30,pa:58,re:84,de:78,at:70,iq:74},
{n:"克里斯·布歇",t:"TOR",p:"PF",a:33,o:72,sal:6.0,ins:68,sh:74,pa:50,re:58,de:68,at:72,iq:70},
{n:"乔纳森·莫博",t:"TOR",p:"PF",a:23,o:73,sal:2.5,ins:72,sh:60,pa:58,re:64,de:72,at:76,iq:70},
{n:"贾马尔·谢德",t:"TOR",p:"PG",a:24,o:71,sal:2.2,ins:62,sh:68,pa:74,re:44,de:74,at:78,iq:74},
{n:"艾伦·格雷夫斯",t:"TOR",p:"PF",a:20,o:69,sal:2.0,ins:70,sh:60,pa:54,re:62,de:68,at:72,iq:66},
{n:"贾科比·沃尔特",t:"TOR",p:"SG",a:21,o:72,sal:3.4,ins:66,sh:72,pa:60,re:52,de:70,at:74,iq:70},

// ===== 东部 中央赛区 =====
// 芝加哥公牛 CHI
{n:"约什·吉迪",t:"CHI",p:"PG",a:24,o:84,sal:24.1,ins:80,sh:70,pa:84,re:74,de:70,at:80,iq:82},
{n:"尼克·克拉克斯顿",t:"CHI",p:"C",a:27,o:82,sal:18.0,ins:78,sh:30,pa:48,re:84,de:86,at:86,iq:74},
{n:"诺曼·鲍威尔",t:"CHI",p:"SG",a:33,o:80,sal:22.5,ins:74,sh:84,pa:60,re:50,de:70,at:80,iq:76},
{n:"马塔斯·布泽利斯",t:"CHI",p:"SF",a:21,o:78,sal:9.4,ins:76,sh:72,pa:62,re:58,de:72,at:82,iq:74},
{n:"帕特里克·威廉姆斯",t:"CHI",p:"PF",a:24,o:76,sal:18.0,ins:74,sh:72,pa:60,re:58,de:76,at:78,iq:72},
{n:"凯莱布·威尔逊",t:"CHI",p:"PF",a:19,o:73,sal:8.0,ins:72,sh:70,pa:58,re:60,de:70,at:78,iq:68},
{n:"凯文·赫尔特",t:"CHI",p:"SG",a:28,o:74,sal:18.1,ins:66,sh:80,pa:66,re:50,de:66,at:70,iq:74},
{n:"杰伦·史密斯",t:"CHI",p:"C",a:26,o:73,sal:9.0,ins:76,sh:60,pa:48,re:68,de:70,at:72,iq:70},
{n:"戴林·斯温",t:"CHI",p:"SG",a:20,o:70,sal:3.0,ins:66,sh:72,pa:66,re:52,de:68,at:76,iq:72},

// 克利夫兰骑士 CLE
{n:"多诺万·米切尔",t:"CLE",p:"SG",a:29,o:93,sal:54.0,ins:80,sh:88,pa:82,re:50,de:74,at:86,iq:88},
{n:"达里厄斯·加兰",t:"CLE",p:"PG",a:26,o:88,sal:36.0,ins:70,sh:84,pa:86,re:44,de:66,at:80,iq:86},
{n:"埃文·莫布里",t:"CLE",p:"PF",a:24,o:89,sal:38.7,ins:80,sh:74,pa:74,re:84,de:88,at:84,iq:84},
{n:"贾莱特·阿伦",t:"CLE",p:"C",a:27,o:85,sal:20.0,ins:82,sh:40,pa:54,re:86,de:82,at:78,iq:76},
{n:"马克斯·斯特鲁斯",t:"CLE",p:"SF",a:30,o:78,sal:15.0,ins:68,sh:82,pa:64,re:54,de:70,at:74,iq:76},
{n:"泰·杰罗姆",t:"CLE",p:"PG",a:28,o:75,sal:2.5,ins:64,sh:78,pa:74,re:44,de:66,at:70,iq:78},
{n:"艾萨克·奥科罗",t:"CLE",p:"SF",a:25,o:74,sal:11.0,ins:70,sh:70,pa:56,re:52,de:80,at:78,iq:70},
{n:"杰伦·泰森",t:"CLE",p:"SG",a:23,o:71,sal:2.5,ins:70,sh:68,pa:70,re:50,de:68,at:76,iq:72},
{n:"克雷格·波特",t:"CLE",p:"PG",a:25,o:71,sal:2.2,ins:66,sh:70,pa:74,re:46,de:68,at:72,iq:74},

// 底特律活塞 DET
{n:"凯德·坎宁安",t:"DET",p:"PG",a:25,o:90,sal:38.7,ins:80,sh:80,pa:90,re:64,de:72,at:78,iq:90},
{n:"杰登·艾维",t:"DET",p:"SG",a:24,o:84,sal:7.0,ins:74,sh:76,pa:74,re:52,de:70,at:88,iq:76},
{n:"杰伦·杜伦",t:"DET",p:"C",a:22,o:83,sal:6.5,ins:82,sh:30,pa:60,re:88,de:76,at:80,iq:72},
{n:"奥萨尔·汤普森",t:"DET",p:"SF",a:23,o:82,sal:8.0,ins:74,sh:62,pa:70,re:66,de:84,at:84,iq:74},
{n:"约翰·科林斯",t:"DET",p:"PF",a:28,o:80,sal:17.0,ins:80,sh:74,pa:62,re:74,de:70,at:76,iq:74},
{n:"马利克·比斯利",t:"DET",p:"SG",a:29,o:76,sal:6.0,ins:60,sh:84,pa:58,re:46,de:58,at:74,iq:72},
{n:"罗恩·霍兰",t:"DET",p:"SF",a:20,o:73,sal:3.6,ins:70,sh:62,pa:60,re:54,de:72,at:82,iq:70},
{n:"加里·哈里斯",t:"DET",p:"SG",a:31,o:73,sal:7.5,ins:66,sh:76,pa:60,re:48,de:74,at:72,iq:74},
{n:"托雷恩·普林斯",t:"DET",p:"SF",a:30,o:73,sal:7.5,ins:70,sh:72,pa:58,re:58,de:74,at:72,iq:74},
{n:"乌贡纳·翁延索",t:"DET",p:"C",a:22,o:69,sal:2.0,ins:72,sh:30,pa:40,re:74,de:78,at:74,iq:62},

// 印第安纳步行者 IND
{n:"泰瑞斯·哈利伯顿",t:"IND",p:"PG",a:26,o:92,sal:38.6,ins:72,sh:84,pa:92,re:58,de:70,at:78,iq:92},
{n:"帕斯卡尔·西亚卡姆",t:"IND",p:"PF",a:32,o:87,sal:42.0,ins:82,sh:76,pa:74,re:72,de:78,at:80,iq:84},
{n:"迈尔斯·特纳",t:"IND",p:"C",a:30,o:83,sal:24.0,ins:78,sh:78,pa:54,re:74,de:84,at:76,iq:78},
{n:"阿隆·内史密斯",t:"IND",p:"SF",a:27,o:79,sal:11.0,ins:74,sh:76,pa:60,re:58,de:80,at:80,iq:76},
{n:"本内迪克特·马瑟林",t:"IND",p:"SG",a:24,o:82,sal:7.4,ins:78,sh:80,pa:68,re:56,de:68,at:82,iq:76},
{n:"安德鲁·内姆哈德",t:"IND",p:"SG",a:26,o:78,sal:10.0,ins:70,sh:74,pa:78,re:50,de:78,at:78,iq:80},
{n:"TJ·麦康奈尔",t:"IND",p:"PG",a:33,o:76,sal:9.3,ins:66,sh:70,pa:82,re:48,de:74,at:74,iq:84},
{n:"奥比·托平",t:"IND",p:"PF",a:27,o:78,sal:14.0,ins:76,sh:74,pa:60,re:62,de:68,at:80,iq:74},
{n:"拉里·南斯",t:"IND",p:"PF",a:27,o:73,sal:4.0,ins:72,sh:64,pa:64,re:66,de:74,at:74,iq:76},
{n:"贾雷斯·沃克",t:"IND",p:"PF",a:23,o:74,sal:6.5,ins:74,sh:64,pa:68,re:62,de:72,at:74,iq:74},

// 密尔沃基雄鹿 MIL
{n:"泰勒·希罗",t:"MIL",p:"SG",a:26,o:87,sal:27.0,ins:70,sh:88,pa:74,re:56,de:62,at:78,iq:82},
{n:"卡里斯·勒韦尔",t:"MIL",p:"SG",a:31,o:78,sal:8.0,ins:74,sh:76,pa:76,re:52,de:68,at:78,iq:78},
{n:"克雷尔·韦尔",t:"MIL",p:"C",a:22,o:79,sal:5.0,ins:76,sh:60,pa:50,re:80,de:76,at:82,iq:72},
{n:"小海梅·哈克斯",t:"MIL",p:"SF",a:25,o:80,sal:5.0,ins:78,sh:74,pa:70,re:58,de:72,at:74,iq:80},
{n:"卡斯帕拉斯·亚库乔尼斯",t:"MIL",p:"PG",a:20,o:75,sal:5.0,ins:70,sh:72,pa:80,re:50,de:64,at:78,iq:78},
{n:"加里·特伦特",t:"MIL",p:"SG",a:26,o:77,sal:16.0,ins:66,sh:84,pa:62,re:48,de:70,at:78,iq:74},
{n:"布鲁克·洛佩斯",t:"MIL",p:"C",a:38,o:77,sal:23.0,ins:74,sh:78,pa:50,re:62,de:76,at:60,iq:78},
{n:"瑞安·罗林斯",t:"MIL",p:"PG",a:23,o:70,sal:2.2,ins:66,sh:72,pa:70,re:44,de:64,at:74,iq:72},
{n:"布雷登·伯里斯",t:"MIL",p:"SG",a:19,o:73,sal:6.0,ins:70,sh:74,pa:66,re:52,de:68,at:80,iq:72},
{n:"内特·阿门特",t:"MIL",p:"PF",a:19,o:74,sal:6.5,ins:74,sh:68,pa:58,re:60,de:72,at:80,iq:70},

// ===== 东部 东南赛区 =====
// 亚特兰大老鹰 ATL
{n:"CJ·麦科勒姆",t:"ATL",p:"SG",a:35,o:82,sal:22.0,ins:72,sh:86,pa:78,re:50,de:62,at:72,iq:82},
{n:"戴森·丹尼尔斯",t:"ATL",p:"SG",a:24,o:81,sal:5.0,ins:70,sh:68,pa:70,re:48,de:88,at:82,iq:78},
{n:"杰伦·约翰逊",t:"ATL",p:"SF",a:24,o:85,sal:15.0,ins:80,sh:74,pa:74,re:72,de:74,at:84,iq:75},
{n:"奥涅卡·奥孔古",t:"ATL",p:"C",a:25,o:79,sal:9.0,ins:78,sh:54,pa:50,re:80,de:74,at:78,iq:70},
{n:"卢格恩茨·多尔特",t:"ATL",p:"SF",a:26,o:80,sal:16.5,ins:74,sh:72,pa:60,re:58,de:90,at:78,iq:74},
{n:"德安德烈·亨特",t:"ATL",p:"SF",a:27,o:78,sal:23.3,ins:76,sh:78,pa:60,re:54,de:76,at:78,iq:72},
{n:"阿龙·维金斯",t:"ATL",p:"SG",a:27,o:75,sal:5.0,ins:70,sh:74,pa:66,re:52,de:70,at:80,iq:74},
{n:"德文·卡特",t:"ATL",p:"PG",a:23,o:74,sal:4.0,ins:68,sh:72,pa:74,re:54,de:74,at:78,iq:74},
{n:"金斯顿·弗莱明斯",t:"ATL",p:"PG",a:19,o:73,sal:7.0,ins:66,sh:74,pa:78,re:46,de:64,at:82,iq:74},
{n:"科比·布夫金",t:"ATL",p:"PG",a:22,o:73,sal:4.7,ins:68,sh:72,pa:74,re:40,de:68,at:78,iq:72},

// 夏洛特黄蜂 CHA
{n:"布兰登·米勒",t:"CHA",p:"SF",a:24,o:85,sal:12.0,ins:74,sh:84,pa:70,re:54,de:74,at:80,iq:78},
{n:"纳兹·里德",t:"CHA",p:"C",a:26,o:82,sal:14.0,ins:76,sh:80,pa:50,re:74,de:74,at:76,iq:76},
{n:"科比·怀特",t:"CHA",p:"PG",a:26,o:82,sal:24.7,ins:68,sh:84,pa:74,re:50,de:66,at:78,iq:78},
{n:"多里安·芬尼-史密斯",t:"CHA",p:"PF",a:32,o:76,sal:14.0,ins:72,sh:74,pa:58,re:58,de:80,at:72,iq:76},
{n:"格雷森·阿伦",t:"CHA",p:"SG",a:30,o:76,sal:8.5,ins:66,sh:82,pa:62,re:48,de:70,at:70,iq:76},
{n:"马克·威廉姆斯",t:"CHA",p:"C",a:24,o:78,sal:6.3,ins:78,sh:30,pa:48,re:86,de:78,at:80,iq:68},
{n:"罗伊斯·奥尼尔",t:"CHA",p:"PF",a:35,o:73,sal:9.5,ins:66,sh:76,pa:60,re:58,de:74,at:66,iq:78},
{n:"蒂吉安·萨隆",t:"CHA",p:"SF",a:21,o:73,sal:5.0,ins:70,sh:70,pa:58,re:54,de:72,at:78,iq:70},
{n:"汉内斯·施泰因巴赫",t:"CHA",p:"C",a:20,o:70,sal:3.5,ins:72,sh:50,pa:46,re:68,de:68,at:72,iq:66},
{n:"小克里斯蒂安·安德森",t:"CHA",p:"PG",a:19,o:70,sal:3.0,ins:62,sh:74,pa:74,re:42,de:64,at:74,iq:72},

// 迈阿密热火 MIA
{n:"扬尼斯·阿德托昆博",t:"MIA",p:"PF",a:32,o:96,sal:54.1,ins:90,sh:74,pa:80,re:88,de:86,at:92,iq:84},
{n:"巴姆·阿德巴约",t:"MIA",p:"C",a:29,o:89,sal:34.8,ins:82,sh:70,pa:76,re:86,de:88,at:80,iq:86},
{n:"鲍比·波蒂斯",t:"MIA",p:"PF",a:31,o:80,sal:12.5,ins:78,sh:76,pa:60,re:72,de:70,at:76,iq:76},
{n:"安德鲁·维金斯",t:"MIA",p:"SF",a:30,o:80,sal:28.2,ins:76,sh:74,pa:62,re:58,de:78,at:82,iq:74},
{n:"尼古拉·约维奇",t:"MIA",p:"PF",a:22,o:77,sal:4.4,ins:74,sh:74,pa:72,re:58,de:68,at:74,iq:78},
{n:"特里·罗齐尔",t:"MIA",p:"PG",a:32,o:79,sal:24.9,ins:72,sh:80,pa:74,re:48,de:66,at:80,iq:76},
{n:"海伍德·海史密斯",t:"MIA",p:"SF",a:29,o:73,sal:5.0,ins:70,sh:68,pa:54,re:58,de:78,at:74,iq:72},
{n:"邓肯·罗宾逊",t:"MIA",p:"SG",a:32,o:74,sal:8.0,ins:58,sh:84,pa:62,re:48,de:62,at:68,iq:74},
{n:"凯尔·安德森",t:"MIA",p:"PF",a:32,o:75,sal:9.2,ins:74,sh:64,pa:78,re:62,de:72,at:64,iq:82},
{n:"凯沙德·约翰逊",t:"MIA",p:"SF",a:24,o:70,sal:2.0,ins:70,sh:62,pa:54,re:56,de:72,at:80,iq:68},

// 奥兰多魔术 ORL
{n:"保罗·班凯罗",t:"ORL",p:"PF",a:23,o:90,sal:12.2,ins:84,sh:78,pa:78,re:74,de:74,at:82,iq:84},
{n:"弗朗茨·瓦格纳",t:"ORL",p:"SF",a:25,o:87,sal:30.0,ins:80,sh:78,pa:74,re:68,de:78,at:80,iq:82},
{n:"杰伦·萨格斯",t:"ORL",p:"PG",a:25,o:82,sal:7.5,ins:70,sh:76,pa:72,re:54,de:86,at:80,iq:78},
{n:"尼古拉·武切维奇",t:"ORL",p:"C",a:36,o:82,sal:3.9,ins:80,sh:78,pa:74,re:74,de:66,at:62,iq:84},
{n:"温德尔·卡特",t:"ORL",p:"C",a:27,o:78,sal:10.0,ins:78,sh:60,pa:60,re:76,de:74,at:74,iq:74},
{n:"乔纳森·艾萨克",t:"ORL",p:"PF",a:28,o:78,sal:15.0,ins:72,sh:66,pa:54,re:62,de:88,at:78,iq:74},
{n:"科尔·安东尼",t:"ORL",p:"PG",a:26,o:77,sal:13.5,ins:74,sh:76,pa:72,re:50,de:62,at:80,iq:76},
{n:"安东尼·布莱克",t:"ORL",p:"PG",a:21,o:76,sal:8.0,ins:70,sh:66,pa:74,re:56,de:80,at:80,iq:78},
{n:"特里斯坦·达·席尔瓦",t:"ORL",p:"SF",a:23,o:73,sal:3.2,ins:68,sh:74,pa:62,re:54,de:70,at:74,iq:72},
{n:"凯莱布·休斯坦",t:"ORL",p:"SF",a:23,o:70,sal:2.2,ins:62,sh:74,pa:54,re:48,de:68,at:70,iq:70},

// 华盛顿奇才 WAS
{n:"特雷·杨",t:"WAS",p:"PG",a:28,o:88,sal:43.0,ins:68,sh:91,pa:93,re:33,de:34,at:78,iq:89},
{n:"AJ·迪班萨",t:"WAS",p:"SF",a:19,o:79,sal:12.0,ins:74,sh:78,pa:66,re:60,de:74,at:84,iq:74},
{n:"德安德烈·艾顿",t:"WAS",p:"C",a:27,o:84,sal:35.5,ins:86,sh:62,pa:54,re:82,de:74,at:74,iq:72},
{n:"克里斯·米德尔顿",t:"WAS",p:"SF",a:34,o:82,sal:17.6,ins:76,sh:82,pa:76,re:60,de:70,at:66,iq:86},
{n:"比拉尔·库利巴利",t:"WAS",p:"SF",a:22,o:80,sal:6.4,ins:74,sh:70,pa:66,re:58,de:84,at:84,iq:76},
{n:"亚历克斯·萨尔",t:"WAS",p:"C",a:21,o:79,sal:12.0,ins:76,sh:64,pa:60,re:74,de:80,at:80,iq:74},
{n:"巴布·卡林顿",t:"WAS",p:"PG",a:21,o:76,sal:4.0,ins:66,sh:74,pa:76,re:48,de:64,at:78,iq:76},
{n:"基肖恩·乔治",t:"WAS",p:"SF",a:21,o:76,sal:3.4,ins:68,sh:74,pa:70,re:54,de:70,at:78,iq:76},
{n:"特里斯坦·武克切维奇",t:"WAS",p:"C",a:22,o:71,sal:2.2,ins:72,sh:62,pa:54,re:62,de:64,at:72,iq:70},
{n:"科尔比·琼斯",t:"WAS",p:"SG",a:23,o:70,sal:2.0,ins:66,sh:68,pa:64,re:52,de:68,at:74,iq:70},

// ===== 西部 西北赛区 =====
// 丹佛掘金 DEN
{n:"尼古拉·约基奇",t:"DEN",p:"C",a:31,o:98,sal:55.2,ins:88,sh:80,pa:96,re:88,de:78,at:70,iq:96},
{n:"贾马尔·穆雷",t:"DEN",p:"PG",a:29,o:88,sal:46.4,ins:78,sh:86,pa:84,re:50,de:70,at:78,iq:86},
{n:"小迈克尔·波特",t:"DEN",p:"SF",a:28,o:85,sal:38.3,ins:80,sh:86,pa:60,re:62,de:70,at:80,iq:80},
{n:"阿隆·戈登",t:"DEN",p:"PF",a:30,o:83,sal:22.4,ins:82,sh:66,pa:62,re:72,de:80,at:84,iq:78},
{n:"克里斯蒂安·布劳恩",t:"DEN",p:"SG",a:24,o:80,sal:4.2,ins:74,sh:76,pa:66,re:58,de:78,at:82,iq:78},
{n:"拉塞尔·威斯布鲁克",t:"DEN",p:"PG",a:37,o:74,sal:3.5,ins:74,sh:62,pa:74,re:62,de:62,at:74,iq:74},
{n:"佩顿·沃森",t:"DEN",p:"SF",a:23,o:74,sal:2.4,ins:68,sh:66,pa:54,re:54,de:80,at:82,iq:70},
{n:"朱利安·斯特劳瑟",t:"DEN",p:"SG",a:23,o:73,sal:2.5,ins:64,sh:78,pa:62,re:44,de:62,at:76,iq:72},
{n:"达里奥·沙里奇",t:"DEN",p:"PF",a:31,o:72,sal:2.2,ins:72,sh:72,pa:70,re:56,de:62,at:66,iq:76},
{n:"特雷·亚历山大",t:"DEN",p:"PG",a:22,o:70,sal:1.9,ins:64,sh:70,pa:72,re:44,de:64,at:74,iq:72},

// 明尼苏达森林狼 MIN
{n:"安东尼·爱德华兹",t:"MIN",p:"SG",a:25,o:94,sal:42.0,ins:80,sh:86,pa:78,re:62,de:76,at:92,iq:84},
{n:"鲁迪·戈贝尔",t:"MIN",p:"C",a:34,o:87,sal:35.0,ins:80,sh:30,pa:50,re:90,de:90,at:74,iq:72},
{n:"拉梅洛·鲍尔",t:"MIN",p:"PG",a:25,o:88,sal:36.0,ins:70,sh:84,pa:90,re:56,de:60,at:84,iq:88},
{n:"贾登·麦克丹尼尔斯",t:"MIN",p:"SF",a:24,o:83,sal:22.5,ins:74,sh:74,pa:60,re:58,de:86,at:84,iq:78},
{n:"丹特·迪文琴佐",t:"MIN",p:"SG",a:28,o:80,sal:11.5,ins:68,sh:82,pa:70,re:50,de:74,at:78,iq:80},
{n:"尼基尔·亚历山大-沃克",t:"MIN",p:"SG",a:27,o:77,sal:4.2,ins:68,sh:74,pa:70,re:48,de:78,at:78,iq:76},
{n:"约什·格林",t:"MIN",p:"SG",a:25,o:76,sal:12.0,ins:70,sh:72,pa:66,re:54,de:78,at:80,iq:74},
{n:"阿约·多孙穆",t:"MIN",p:"SG",a:26,o:78,sal:8.0,ins:72,sh:74,pa:74,re:54,de:74,at:80,iq:76},
{n:"罗布·迪林厄姆",t:"MIN",p:"PG",a:21,o:76,sal:5.0,ins:62,sh:78,pa:78,re:42,de:60,at:82,iq:78},
{n:"特伦斯·香农",t:"MIN",p:"SG",a:25,o:74,sal:2.4,ins:74,sh:70,pa:62,re:50,de:68,at:86,iq:72},

// 俄克拉荷马城雷霆 OKC
{n:"谢伊·吉尔杰斯-亚历山大",t:"OKC",p:"PG",a:28,o:97,sal:38.3,ins:80,sh:88,pa:84,re:58,de:78,at:88,iq:92},
{n:"切特·霍姆格伦",t:"OKC",p:"C",a:24,o:90,sal:13.6,ins:78,sh:78,pa:62,re:78,de:88,at:84,iq:84},
{n:"杰伦·威廉姆斯",t:"OKC",p:"SF",a:25,o:88,sal:5.2,ins:78,sh:80,pa:74,re:62,de:82,at:82,iq:84},
{n:"亚历克斯·卡鲁索",t:"OKC",p:"SG",a:31,o:77,sal:10.0,ins:66,sh:72,pa:70,re:48,de:88,at:78,iq:80},
{n:"以赛亚·哈尔滕施泰因",t:"OKC",p:"C",a:27,o:81,sal:30.0,ins:80,sh:30,pa:62,re:82,de:78,at:72,iq:74},
{n:"阿杰·米切尔",t:"OKC",p:"PG",a:23,o:73,sal:2.2,ins:66,sh:76,pa:74,re:44,de:68,at:78,iq:76},
{n:"杰林·威廉姆斯",t:"OKC",p:"C",a:23,o:75,sal:2.4,ins:74,sh:60,pa:70,re:64,de:74,at:72,iq:78},
{n:"亚历克斯·杜卡斯",t:"OKC",p:"SG",a:23,o:70,sal:2.0,ins:62,sh:74,pa:60,re:46,de:68,at:72,iq:70},
{n:"阿代·马拉",t:"OKC",p:"C",a:20,o:72,sal:7.0,ins:74,sh:50,pa:58,re:68,de:70,at:70,iq:70},
{n:"迪隆·琼斯",t:"OKC",p:"SF",a:24,o:71,sal:2.5,ins:70,sh:66,pa:64,re:54,de:68,at:74,iq:72},

// 波特兰开拓者 POR
{n:"贾·莫兰特",t:"POR",p:"PG",a:27,o:90,sal:36.9,ins:80,sh:80,pa:84,re:54,de:64,at:92,iq:84},
{n:"达米安·利拉德",t:"POR",p:"SG",a:36,o:86,sal:38.0,ins:70,sh:88,pa:84,re:46,de:60,at:70,iq:88},
{n:"斯科特·亨德森",t:"POR",p:"PG",a:22,o:79,sal:9.8,ins:72,sh:74,pa:78,re:48,de:64,at:86,iq:74},
{n:"德尼·阿夫迪亚",t:"POR",p:"SF",a:25,o:82,sal:14.0,ins:78,sh:76,pa:74,re:66,de:74,at:80,iq:80},
{n:"图马尼·卡马拉",t:"POR",p:"SF",a:25,o:78,sal:2.4,ins:72,sh:68,pa:60,re:58,de:84,at:80,iq:74},
{n:"多诺万·克林根",t:"POR",p:"C",a:22,o:80,sal:7.4,ins:76,sh:30,pa:50,re:84,de:84,at:74,iq:70},
{n:"谢登·夏普",t:"POR",p:"SG",a:23,o:81,sal:6.4,ins:74,sh:78,pa:64,re:52,de:62,at:88,iq:74},
{n:"罗伯特·威廉姆斯",t:"POR",p:"C",a:28,o:77,sal:12.4,ins:76,sh:20,pa:46,re:80,de:84,at:80,iq:68},
{n:"克里斯·穆雷",t:"POR",p:"PF",a:24,o:73,sal:3.2,ins:70,sh:70,pa:60,re:58,de:70,at:74,iq:72},
{n:"瑞安·鲁珀特",t:"POR",p:"SG",a:21,o:71,sal:2.4,ins:64,sh:68,pa:62,re:48,de:74,at:78,iq:70},

// 犹他爵士 UTA
{n:"劳里·马尔卡宁",t:"UTA",p:"PF",a:29,o:87,sal:42.0,ins:80,sh:86,pa:66,re:72,de:70,at:78,iq:80},
{n:"达林·彼得森",t:"UTA",p:"SG",a:18,o:77,sal:11.0,ins:70,sh:78,pa:74,re:50,de:68,at:80,iq:76},
{n:"基恩特·乔治",t:"UTA",p:"PG",a:23,o:79,sal:7.0,ins:68,sh:78,pa:78,re:48,de:64,at:78,iq:78},
{n:"泰勒·亨德里克斯",t:"UTA",p:"SF",a:23,o:76,sal:4.2,ins:72,sh:70,pa:58,re:58,de:76,at:82,iq:72},
{n:"科迪·威廉姆斯",t:"UTA",p:"SF",a:21,o:74,sal:3.8,ins:70,sh:70,pa:62,re:52,de:72,at:78,iq:74},
{n:"以赛亚·科利尔",t:"UTA",p:"PG",a:21,o:74,sal:3.0,ins:70,sh:62,pa:78,re:50,de:66,at:80,iq:76},
{n:"凯尔·菲利波夫斯基",t:"UTA",p:"C",a:22,o:76,sal:2.4,ins:76,sh:74,pa:62,re:68,de:68,at:74,iq:76},
{n:"约什·奥科吉",t:"UTA",p:"SG",a:27,o:73,sal:6.0,ins:68,sh:62,pa:54,re:50,de:84,at:84,iq:70},
{n:"莫·班巴",t:"UTA",p:"C",a:27,o:72,sal:4.0,ins:74,sh:50,pa:46,re:68,de:70,at:74,iq:64},
{n:"布莱斯·森萨博",t:"UTA",p:"SG",a:22,o:72,sal:2.4,ins:66,sh:76,pa:64,re:46,de:60,at:74,iq:72},

// ===== 西部 太平洋赛区 =====
// 金州勇士 GSW
{n:"斯蒂芬·库里",t:"GSW",p:"PG",a:38,o:92,sal:59.6,ins:70,sh:94,pa:84,re:50,de:66,at:78,iq:94},
{n:"吉米·巴特勒",t:"GSW",p:"SF",a:36,o:86,sal:54.0,ins:82,sh:78,pa:76,re:64,de:82,at:78,iq:88},
{n:"德雷蒙德·格林",t:"GSW",p:"PF",a:36,o:82,sal:24.1,ins:76,sh:62,pa:84,re:70,de:84,at:74,iq:90},
{n:"布兰丁·波杰姆斯基",t:"GSW",p:"SG",a:22,o:80,sal:3.9,ins:72,sh:78,pa:74,re:58,de:72,at:78,iq:80},
{n:"乔纳森·库明加",t:"GSW",p:"PF",a:23,o:82,sal:24.0,ins:80,sh:72,pa:62,re:62,de:72,at:86,iq:74},
{n:"巴迪·希尔德",t:"GSW",p:"SG",a:33,o:76,sal:9.0,ins:62,sh:86,pa:62,re:48,de:60,at:74,iq:74},
{n:"摩西·穆迪",t:"GSW",p:"SG",a:23,o:76,sal:8.7,ins:70,sh:76,pa:60,re:50,de:74,at:78,iq:74},
{n:"特雷斯·杰克逊-戴维斯",t:"GSW",p:"C",a:23,o:75,sal:2.2,ins:78,sh:48,pa:56,re:74,de:72,at:76,iq:72},
{n:"加里·佩顿二世",t:"GSW",p:"SG",a:33,o:73,sal:9.1,ins:70,sh:62,pa:62,re:50,de:84,at:82,iq:76},
{n:"亚克塞尔·伦德博格",t:"GSW",p:"PF",a:23,o:73,sal:6.5,ins:76,sh:62,pa:54,re:64,de:72,at:78,iq:72},

// 洛杉矶快船 LAC
{n:"詹姆斯·哈登",t:"LAC",p:"PG",a:36,o:85,sal:34.0,ins:74,sh:80,pa:88,re:50,de:60,at:70,iq:88},
{n:"布兰登·英格拉姆",t:"LAC",p:"SF",a:29,o:85,sal:36.0,ins:80,sh:80,pa:74,re:54,de:68,at:78,iq:80},
{n:"伊维察·祖巴茨",t:"LAC",p:"C",a:28,o:83,sal:11.7,ins:84,sh:30,pa:54,re:84,de:76,at:72,iq:74},
{n:"八村塁",t:"LAC",p:"PF",a:28,o:80,sal:14.0,ins:80,sh:76,pa:60,re:58,de:68,at:78,iq:74},
{n:"克里斯·邓恩",t:"LAC",p:"PG",a:32,o:76,sal:5.0,ins:68,sh:64,pa:70,re:54,de:84,at:76,iq:76},
{n:"德里克·琼斯",t:"LAC",p:"SF",a:28,o:76,sal:10.0,ins:72,sh:66,pa:54,re:54,de:78,at:86,iq:72},
{n:"阿米尔·科菲",t:"LAC",p:"SF",a:28,o:74,sal:4.0,ins:70,sh:72,pa:60,re:48,de:72,at:76,iq:74},
{n:"格雷迪·迪克",t:"LAC",p:"SG",a:22,o:74,sal:3.0,ins:64,sh:80,pa:58,re:46,de:62,at:74,iq:72},
{n:"乔丹·米勒",t:"LAC",p:"SG",a:24,o:73,sal:5.1,ins:70,sh:74,pa:62,re:48,de:66,at:78,iq:72},
{n:"基顿·瓦格勒",t:"LAC",p:"PG",a:19,o:73,sal:7.0,ins:66,sh:74,pa:76,re:46,de:66,at:80,iq:74},

// 洛杉矶湖人 LAL
{n:"卢卡·东契奇",t:"LAL",p:"PG",a:27,o:96,sal:45.0,ins:80,sh:84,pa:92,re:74,de:66,at:80,iq:94},
{n:"奥斯汀·里夫斯",t:"LAL",p:"SG",a:28,o:85,sal:46.3,ins:74,sh:84,pa:80,re:54,de:68,at:74,iq:84},
{n:"沃克·凯斯勒",t:"LAL",p:"C",a:25,o:83,sal:32.5,ins:78,sh:30,pa:48,re:86,de:88,at:80,iq:72},
{n:"科林·塞克斯顿",t:"LAL",p:"PG",a:26,o:80,sal:9.5,ins:80,sh:80,pa:70,re:44,de:62,at:86,iq:74},
{n:"昆汀·格兰姆斯",t:"LAL",p:"SG",a:25,o:78,sal:15.0,ins:72,sh:80,pa:62,re:52,de:74,at:82,iq:76},
{n:"凯文·卢尼",t:"LAL",p:"C",a:30,o:75,sal:3.9,ins:74,sh:30,pa:58,re:78,de:76,at:68,iq:78},
{n:"马蒂斯·赛布尔",t:"LAL",p:"SF",a:28,o:75,sal:3.3,ins:64,sh:62,pa:58,re:50,de:92,at:82,iq:74},
{n:"扎伊尔·威廉姆斯",t:"LAL",p:"SF",a:24,o:74,sal:3.0,ins:70,sh:70,pa:60,re:54,de:72,at:80,iq:72},
{n:"桑德罗·马穆凯拉什维利",t:"LAL",p:"PF",a:26,o:74,sal:13.0,ins:74,sh:74,pa:66,re:58,de:62,at:74,iq:76},
{n:"达尔顿·克内克特",t:"LAL",p:"SG",a:24,o:74,sal:3.4,ins:68,sh:80,pa:60,re:48,de:62,at:74,iq:74},

// 菲尼克斯太阳 PHX
{n:"凯文·杜兰特",t:"PHX",p:"SF",a:38,o:90,sal:54.7,ins:80,sh:90,pa:74,re:64,de:74,at:80,iq:90},
{n:"德文·布克",t:"PHX",p:"SG",a:29,o:91,sal:44.1,ins:80,sh:88,pa:80,re:54,de:70,at:80,iq:88},
{n:"布拉德利·比尔",t:"PHX",p:"SG",a:33,o:84,sal:53.7,ins:78,sh:84,pa:78,re:50,de:66,at:78,iq:80},
{n:"迈尔斯·布里奇斯",t:"PHX",p:"PF",a:28,o:82,sal:23.0,ins:80,sh:78,pa:66,re:64,de:70,at:84,iq:76},
{n:"尤素夫·努尔基奇",t:"PHX",p:"C",a:31,o:78,sal:18.1,ins:80,sh:30,pa:62,re:80,de:70,at:66,iq:74},
{n:"泰厄斯·琼斯",t:"PHX",p:"PG",a:30,o:78,sal:8.0,ins:62,sh:78,pa:82,re:42,de:64,at:70,iq:84},
{n:"瑞安·邓恩",t:"PHX",p:"SF",a:22,o:75,sal:2.6,ins:68,sh:62,pa:54,re:52,de:84,at:80,iq:72},
{n:"卢克·肯纳德",t:"PHX",p:"SG",a:30,o:78,sal:6.5,ins:62,sh:88,pa:66,re:46,de:58,at:68,iq:78},
{n:"梅森·普拉姆利",t:"PHX",p:"C",a:35,o:72,sal:3.3,ins:72,sh:30,pa:54,re:68,de:66,at:62,iq:72},
{n:"奥索·伊戈达罗",t:"PHX",p:"C",a:23,o:71,sal:1.9,ins:70,sh:40,pa:50,re:64,de:68,at:74,iq:68},

// 萨克拉门托国王 SAC
{n:"多曼塔斯·萨博尼斯",t:"SAC",p:"C",a:30,o:88,sal:40.5,ins:82,sh:72,pa:84,re:84,de:70,at:70,iq:88},
{n:"马利克·蒙克",t:"SAC",p:"SG",a:27,o:83,sal:25.0,ins:72,sh:82,pa:78,re:44,de:62,at:82,iq:82},
{n:"基根·穆雷",t:"SAC",p:"SF",a:25,o:81,sal:8.8,ins:74,sh:80,pa:60,re:58,de:78,at:80,iq:78},
{n:"特雷·莱尔斯",t:"SAC",p:"PF",a:30,o:73,sal:8.0,ins:72,sh:76,pa:54,re:58,de:66,at:70,iq:74},
{n:"亚历克斯·莱恩",t:"SAC",p:"C",a:32,o:72,sal:3.3,ins:74,sh:20,pa:48,re:70,de:68,at:62,iq:68},
{n:"达里厄斯·阿卡夫",t:"SAC",p:"PG",a:19,o:73,sal:7.0,ins:66,sh:74,pa:80,re:44,de:64,at:82,iq:76},
{n:"亚历克斯·卡拉班",t:"SAC",p:"PF",a:22,o:72,sal:2.5,ins:70,sh:78,pa:62,re:54,de:66,at:74,iq:76},
{n:"达克温·普劳登",t:"SAC",p:"SF",a:24,o:70,sal:2.5,ins:66,sh:72,pa:58,re:50,de:70,at:78,iq:70},
{n:"尼克·马蒂内利",t:"SAC",p:"SF",a:22,o:69,sal:1.9,ins:66,sh:68,pa:56,re:50,de:64,at:74,iq:70},
{n:"以赛亚·琼斯",t:"SAC",p:"SF",a:23,o:69,sal:1.9,ins:66,sh:68,pa:54,re:48,de:64,at:74,iq:68},

// ===== 西部 西南赛区 =====
// 达拉斯独行侠 DAL
{n:"安东尼·戴维斯",t:"DAL",p:"PF",a:33,o:92,sal:54.3,ins:88,sh:74,pa:62,re:84,de:90,at:84,iq:84},
{n:"凯里·欧文",t:"DAL",p:"PG",a:34,o:88,sal:41.0,ins:78,sh:88,pa:86,re:46,de:66,at:84,iq:88},
{n:"库珀·弗拉格",t:"DAL",p:"SF",a:19,o:87,sal:12.6,ins:80,sh:78,pa:74,re:68,de:82,at:86,iq:84},
{n:"克莱·汤普森",t:"DAL",p:"SG",a:36,o:80,sal:15.8,ins:66,sh:86,pa:62,re:48,de:64,at:64,iq:80},
{n:"扎卡里·里萨谢",t:"DAL",p:"SF",a:21,o:78,sal:12.5,ins:70,sh:76,pa:62,re:54,de:72,at:78,iq:72},
{n:"丹尼尔·加福德",t:"DAL",p:"C",a:30,o:80,sal:14.4,ins:80,sh:30,pa:50,re:74,de:80,at:80,iq:70},
{n:"桑蒂·阿尔达马",t:"DAL",p:"PF",a:24,o:76,sal:6.0,ins:74,sh:78,pa:62,re:58,de:66,at:78,iq:76},
{n:"PJ·华盛顿",t:"DAL",p:"PF",a:27,o:78,sal:16.0,ins:76,sh:72,pa:62,re:62,de:74,at:80,iq:74},
{n:"德里克·莱夫利",t:"DAL",p:"C",a:22,o:80,sal:5.0,ins:78,sh:30,pa:50,re:78,de:80,at:82,iq:70},
{n:"纳吉·马绍尔",t:"DAL",p:"SF",a:27,o:76,sal:9.0,ins:74,sh:70,pa:60,re:54,de:76,at:78,iq:74},
{n:"马库斯·萨瑟",t:"DAL",p:"PG",a:24,o:72,sal:5.0,ins:64,sh:74,pa:74,re:42,de:68,at:76,iq:74},

// 休斯顿火箭 HOU
{n:"阿尔佩伦·申京",t:"HOU",p:"C",a:23,o:89,sal:33.5,ins:84,sh:60,pa:84,re:78,de:74,at:74,iq:86},
{n:"杰伦·格林",t:"HOU",p:"SG",a:24,o:85,sal:33.0,ins:74,sh:82,pa:70,re:50,de:64,at:90,iq:78},
{n:"阿门·汤普森",t:"HOU",p:"SF",a:23,o:84,sal:9.5,ins:76,sh:64,pa:70,re:66,de:84,at:90,iq:78},
{n:"弗雷德·范弗利特",t:"HOU",p:"PG",a:31,o:83,sal:44.9,ins:70,sh:80,pa:82,re:48,de:78,at:76,iq:86},
{n:"狄龙·布鲁克斯",t:"HOU",p:"SF",a:30,o:79,sal:22.6,ins:74,sh:74,pa:60,re:54,de:82,at:78,iq:76},
{n:"贾巴里·史密斯",t:"HOU",p:"PF",a:23,o:81,sal:9.8,ins:76,sh:76,pa:58,re:66,de:78,at:82,iq:74},
{n:"塔里·伊森",t:"HOU",p:"PF",a:25,o:80,sal:6.7,ins:74,sh:62,pa:54,re:62,de:86,at:86,iq:74},
{n:"马库斯·斯马特",t:"HOU",p:"PG",a:32,o:78,sal:6.5,ins:70,sh:64,pa:74,re:54,de:92,at:78,iq:82},
{n:"史蒂文·亚当斯",t:"HOU",p:"C",a:32,o:76,sal:12.6,ins:78,sh:20,pa:54,re:80,de:74,at:66,iq:72},
{n:"里德·谢泼德",t:"HOU",p:"PG",a:21,o:76,sal:10.6,ins:64,sh:80,pa:78,re:48,de:68,at:78,iq:82},

// 孟菲斯灰熊 MEM
{n:"贾伦·杰克逊",t:"MEM",p:"PF",a:26,o:87,sal:24.1,ins:78,sh:76,pa:62,re:66,de:90,at:84,iq:80},
{n:"德斯蒙德·贝恩",t:"MEM",p:"SG",a:28,o:86,sal:36.0,ins:76,sh:86,pa:74,re:58,de:74,at:78,iq:84},
{n:"丹吉洛·拉塞尔",t:"MEM",p:"PG",a:30,o:80,sal:18.7,ins:70,sh:82,pa:82,re:42,de:58,at:70,iq:80},
{n:"昆汀·波斯特",t:"MEM",p:"C",a:25,o:76,sal:10.0,ins:74,sh:78,pa:54,re:62,de:66,at:70,iq:74},
{n:"以赛亚·斯图尔特",t:"MEM",p:"C",a:24,o:79,sal:15.0,ins:78,sh:60,pa:50,re:74,de:80,at:78,iq:72},
{n:"卡梅隆·布泽尔",t:"MEM",p:"PF",a:19,o:78,sal:10.5,ins:78,sh:70,pa:60,re:66,de:70,at:78,iq:74},
{n:"扎克·伊迪",t:"MEM",p:"C",a:23,o:78,sal:5.5,ins:80,sh:30,pa:46,re:82,de:72,at:68,iq:66},
{n:"布兰登·克拉克",t:"MEM",p:"PF",a:29,o:74,sal:12.5,ins:74,sh:60,pa:54,re:60,de:72,at:78,iq:72},
{n:"小文斯·威廉姆斯",t:"MEM",p:"SG",a:25,o:75,sal:3.0,ins:68,sh:74,pa:70,re:54,de:74,at:76,iq:76},
{n:"GG·杰克逊",t:"MEM",p:"PF",a:21,o:73,sal:2.4,ins:72,sh:70,pa:56,re:54,de:66,at:80,iq:70},
{n:"杰·赫夫",t:"MEM",p:"C",a:27,o:72,sal:2.5,ins:72,sh:74,pa:46,re:50,de:64,at:74,iq:68},

// 新奥尔良鹈鹕 NOP
{n:"锡安·威廉森",t:"NOP",p:"PF",a:26,o:90,sal:38.5,ins:90,sh:60,pa:70,re:72,de:64,at:90,iq:78},
{n:"特雷·墨菲",t:"NOP",p:"SF",a:26,o:83,sal:24.0,ins:74,sh:86,pa:62,re:54,de:72,at:82,iq:78},
{n:"德章泰·穆雷",t:"NOP",p:"PG",a:29,o:85,sal:25.2,ins:78,sh:78,pa:82,re:58,de:80,at:80,iq:84},
{n:"赫伯特·琼斯",t:"NOP",p:"SF",a:26,o:82,sal:12.0,ins:70,sh:70,pa:60,re:54,de:92,at:80,iq:78},
{n:"伊夫·米西",t:"NOP",p:"C",a:22,o:78,sal:3.4,ins:76,sh:30,pa:50,re:78,de:78,at:80,iq:68},
{n:"乔丹·霍金斯",t:"NOP",p:"SG",a:23,o:77,sal:4.0,ins:66,sh:82,pa:60,re:48,de:66,at:78,iq:74},
{n:"凯利·奥利尼克",t:"NOP",p:"C",a:35,o:72,sal:13.4,ins:74,sh:74,pa:70,re:60,de:62,at:62,iq:78},
{n:"卡洛·马特科维奇",t:"NOP",p:"C",a:23,o:71,sal:2.2,ins:72,sh:50,pa:48,re:62,de:68,at:72,iq:68},
{n:"杰里迈亚·罗宾逊-厄尔",t:"NOP",p:"PF",a:25,o:71,sal:2.5,ins:70,sh:60,pa:54,re:58,de:70,at:74,iq:72},
{n:"贾隆·皮埃尔",t:"NOP",p:"SG",a:21,o:69,sal:1.9,ins:64,sh:72,pa:58,re:46,de:64,at:76,iq:68},

// 圣安东尼奥马刺 SAS
{n:"维克托·文班亚马",t:"SAS",p:"C",a:22,o:96,sal:50.4,ins:82,sh:80,pa:74,re:80,de:92,at:86,iq:88},
{n:"德阿龙·福克斯",t:"SAS",p:"PG",a:28,o:89,sal:34.9,ins:80,sh:80,pa:84,re:50,de:72,at:90,iq:86},
{n:"德文·瓦塞尔",t:"SAS",p:"SG",a:25,o:84,sal:24.1,ins:74,sh:84,pa:62,re:54,de:78,at:82,iq:78},
{n:"斯蒂芬·卡斯尔",t:"SAS",p:"PG",a:21,o:82,sal:11.0,ins:78,sh:70,pa:74,re:58,de:78,at:80,iq:80},
{n:"托拜亚斯·哈里斯",t:"SAS",p:"PF",a:34,o:78,sal:15.5,ins:78,sh:74,pa:64,re:62,de:70,at:70,iq:78},
{n:"杰里米·索汉",t:"SAS",p:"PF",a:22,o:80,sal:7.0,ins:76,sh:60,pa:64,re:64,de:78,at:84,iq:76},
{n:"克里斯·保罗",t:"SAS",p:"PG",a:41,o:78,sal:3.9,ins:62,sh:74,pa:84,re:48,de:72,at:58,iq:92},
{n:"凯尔登·约翰逊",t:"SAS",p:"SF",a:26,o:78,sal:9.0,ins:78,sh:74,pa:60,re:58,de:70,at:80,iq:74},
{n:"马拉基·布拉纳姆",t:"SAS",p:"SG",a:23,o:73,sal:4.0,ins:68,sh:74,pa:66,re:44,de:62,at:76,iq:72},
{n:"布莱克·韦斯利",t:"SAS",p:"PG",a:23,o:72,sal:2.5,ins:66,sh:64,pa:66,re:46,de:72,at:82,iq:70},
];

window.PLAYERS_DATA = PLAYERS_DATA;
