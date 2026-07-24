// 现役 NBA 球员数据库（2024-25 赛季阵容快照）
// 每位球员: n=姓名 t=球队 p=位置 a=年龄 o=总评 sal=薪资(百万)
// 能力值: ins=内线 sh=投篮 pa=传球 re=篮板 de=防守 at=运动能力 iq=球商 (均 0-99)
// 总评 o 为综合值，由位置加权计算得出

const PLAYERS_DATA = [
// ===== 东部 大西洋赛区 =====
// 亚特兰大老鹰 ATL
{n:"特雷·杨",t:"ATL",p:"PG",a:26,o:88,sal:43.0,ins:68,sh:91,pa:93,re:33,de:34,at:78,iq:89},
{n:"杰伦·约翰逊",t:"ATL",p:"SF",a:23,o:83,sal:15.0,ins:80,sh:74,pa:74,re:72,de:74,at:84,iq:75},
{n:"戴森·丹尼尔斯",t:"ATL",p:"SG",a:22,o:79,sal:5.0,ins:70,sh:68,pa:70,re:48,de:88,at:82,iq:78},
{n:"克林特·卡佩拉",t:"ATL",p:"C",a:30,o:79,sal:22.3,ins:84,sh:30,pa:30,re:88,de:78,at:80,iq:70},
{n:"扎卡里·里萨谢",t:"ATL",p:"SF",a:19,o:74,sal:12.5,ins:68,sh:74,pa:60,re:52,de:70,at:75,iq:66},
{n:"德安德烈·亨特",t:"ATL",p:"SF",a:27,o:78,sal:23.3,ins:76,sh:78,pa:60,re:54,de:76,at:78,iq:72},
{n:"奥涅卡·奥孔古",t:"ATL",p:"C",a:24,o:77,sal:9.0,ins:78,sh:54,pa:50,re:80,de:74,at:78,iq:70},
{n:"科比·布夫金",t:"ATL",p:"PG",a:21,o:73,sal:4.7,ins:68,sh:72,pa:74,re:40,de:68,at:78,iq:72},
{n:"加里森·马修斯",t:"ATL",p:"SG",a:28,o:70,sal:2.2,ins:55,sh:80,pa:50,re:42,de:62,at:68,iq:66},

// 波士顿凯尔特人 BOS
{n:"杰森·塔图姆",t:"BOS",p:"SF",a:26,o:95,sal:37.1,ins:88,sh:88,pa:78,re:75,de:84,at:86,iq:90},
{n:"杰伦·布朗",t:"BOS",p:"SG",a:28,o:91,sal:49.4,ins:88,sh:80,pa:72,re:68,de:86,at:88,iq:84},
{n:"杰伦·怀特",t:"BOS",p:"PG",a:30,o:86,sal:18.8,ins:78,sh:82,pa:74,re:54,de:84,at:80,iq:86},
{n:"朱·霍勒迪",t:"BOS",p:"PG",a:34,o:85,sal:30.0,ins:74,sh:74,pa:80,re:58,de:92,at:78,iq:88},
{n:"克里斯塔普斯·波尔津吉斯",t:"BOS",p:"C",a:29,o:86,sal:29.0,ins:82,sh:82,pa:50,re:76,de:82,at:76,iq:80},
{n:"艾尔·霍福德",t:"BOS",p:"C",a:38,o:79,sal:9.5,ins:72,sh:76,pa:68,re:68,de:76,at:60,iq:88},
{n:"佩顿·普里查德",t:"BOS",p:"PG",a:27,o:79,sal:6.7,ins:68,sh:84,pa:74,re:42,de:66,at:74,iq:80},
{n:"萨姆·豪瑟",t:"BOS",p:"SF",a:27,o:74,sal:2.0,ins:60,sh:84,pa:54,re:52,de:66,at:70,iq:70},
{n:"卢克·科内特",t:"BOS",p:"C",a:29,o:71,sal:2.8,ins:70,sh:50,pa:48,re:62,de:70,at:62,iq:72},

// 布鲁克林篮网 BKN
{n:"卡姆·托马斯",t:"BKN",p:"SG",a:23,o:81,sal:4.0,ins:80,sh:80,pa:64,re:42,de:60,at:78,iq:72},
{n:"尼古拉斯·克拉克斯顿",t:"BKN",p:"C",a:25,o:82,sal:9.7,ins:78,sh:30,pa:48,re:84,de:86,at:86,iq:74},
{n:"卡梅隆·约翰逊",t:"BKN",p:"SF",a:28,o:79,sal:22.5,ins:70,sh:82,pa:62,re:54,de:72,at:74,iq:76},
{n:"德安吉洛·拉塞尔",t:"BKN",p:"PG",a:28,o:80,sal:18.7,ins:70,sh:80,pa:80,re:40,de:58,at:70,iq:78},
{n:"诺亚·克洛尼",t:"BKN",p:"PF",a:20,o:74,sal:3.2,ins:68,sh:72,pa:54,re:58,de:70,at:76,iq:68},
{n:"特伦登·沃特福德",t:"BKN",p:"PF",a:24,o:73,sal:2.8,ins:72,sh:68,pa:66,re:56,de:66,at:72,iq:72},
{n:"杰伦·威尔逊",t:"BKN",p:"SF",a:23,o:72,sal:1.9,ins:62,sh:76,pa:58,re:54,de:68,at:70,iq:70},
{n:"戴隆·夏普",t:"BKN",p:"C",a:23,o:74,sal:2.5,ins:72,sh:40,pa:42,re:80,de:72,at:74,iq:66},

// 纽约尼克斯 NYK
{n:"杰伦·布伦森",t:"NYK",p:"PG",a:28,o:92,sal:24.9,ins:84,sh:86,pa:86,re:46,de:72,at:74,iq:92},
{n:"卡尔-安东尼·唐斯",t:"NYK",p:"C",a:29,o:89,sal:49.2,ins:84,sh:84,pa:62,re:86,de:74,at:74,iq:84},
{n:"米卡尔·布里奇斯",t:"NYK",p:"SF",a:28,o:85,sal:23.3,ins:76,sh:80,pa:66,re:52,de:86,at:84,iq:80},
{n:"OG·阿努诺比",t:"NYK",p:"SF",a:27,o:85,sal:36.3,ins:76,sh:76,pa:58,re:58,de:90,at:86,iq:78},
{n:"乔什·哈特",t:"NYK",p:"SG",a:29,o:82,sal:18.1,ins:74,sh:70,pa:72,re:74,de:78,at:80,iq:80},
{n:"米切尔·罗宾逊",t:"NYK",p:"C",a:26,o:79,sal:14.3,ins:76,sh:20,pa:36,re:88,de:84,at:78,iq:64},
{n:"迈尔斯·麦克布莱德",t:"NYK",p:"PG",a:24,o:76,sal:4.5,ins:68,sh:78,pa:70,re:44,de:74,at:74,iq:74},
{n:"普雷舍斯·阿丘瓦",t:"NYK",p:"PF",a:24,o:74,sal:6.0,ins:72,sh:50,pa:50,re:62,de:72,at:76,iq:68},

// 费城76人 PHI
{n:"乔尔·恩比德",t:"PHI",p:"C",a:30,o:93,sal:51.4,ins:92,sh:80,pa:70,re:86,de:86,at:74,iq:86},
{n:"泰瑞斯·马克西",t:"PHI",p:"PG",a:24,o:89,sal:35.1,ins:82,sh:84,pa:80,re:44,de:70,at:86,iq:84},
{n:"保罗·乔治",t:"PHI",p:"SF",a:34,o:87,sal:49.2,ins:80,sh:82,pa:74,re:60,de:86,at:82,iq:84},
{n:"凯利·乌布雷",t:"PHI",p:"SF",a:29,o:78,sal:8.0,ins:76,sh:72,pa:56,re:56,de:72,at:82,iq:70},
{n:"凯莱布·马丁",t:"PHI",p:"PF",a:29,o:77,sal:9.2,ins:70,sh:72,pa:60,re:58,de:76,at:74,iq:74},
{n:"安德烈·德拉蒙德",t:"PHI",p:"C",a:31,o:77,sal:3.3,ins:74,sh:20,pa:36,re:90,de:72,at:70,iq:64},
{n:"贾里德·麦凯恩",t:"PHI",p:"PG",a:20,o:76,sal:4.4,ins:70,sh:80,pa:74,re:42,de:64,at:72,iq:76},
{n:"埃里克·戈登",t:"PHI",p:"SG",a:36,o:72,sal:3.0,ins:62,sh:78,pa:60,re:42,de:62,at:60,iq:74},

// 多伦多猛龙 TOR
{n:"斯科蒂·巴恩斯",t:"TOR",p:"SF",a:23,o:85,sal:22.3,ins:78,sh:70,pa:78,re:74,de:80,at:84,iq:80},
{n:"RJ·巴雷特",t:"TOR",p:"SF",a:24,o:82,sal:27.7,ins:82,sh:74,pa:70,re:58,de:68,at:80,iq:74},
{n:"伊曼纽尔·奎克利",t:"TOR",p:"PG",a:25,o:81,sal:32.5,ins:74,sh:80,pa:78,re:46,de:70,at:76,iq:80},
{n:"雅各布·珀尔特尔",t:"TOR",p:"C",a:29,o:80,sal:19.5,ins:78,sh:30,pa:60,re:84,de:80,at:68,iq:78},
{n:"格雷迪·迪克",t:"TOR",p:"SG",a:21,o:75,sal:3.8,ins:66,sh:80,pa:58,re:48,de:62,at:72,iq:68},
{n:"奥查伊·阿巴吉",t:"TOR",p:"SG",a:24,o:74,sal:4.3,ins:68,sh:74,pa:54,re:54,de:74,at:78,iq:70},
{n:"凯利·奥利尼克",t:"TOR",p:"C",a:33,o:76,sal:13.4,ins:68,sh:76,pa:70,re:60,de:62,at:58,iq:78},
{n:"克里斯·布歇",t:"TOR",p:"PF",a:32,o:73,sal:10.8,ins:66,sh:72,pa:48,re:64,de:70,at:72,iq:70},

// ===== 东部 中央赛区 =====
// 芝加哥公牛 CHI
{n:"科比·怀特",t:"CHI",p:"PG",a:25,o:81,sal:12.0,ins:74,sh:80,pa:74,re:48,de:70,at:78,iq:76},
{n:"约什·吉迪",t:"CHI",p:"PG",a:22,o:80,sal:8.3,ins:74,sh:62,pa:84,re:68,de:66,at:78,iq:78},
{n:"尼古拉·武切维奇",t:"CHI",p:"C",a:34,o:80,sal:20.0,ins:78,sh:74,pa:72,re:80,de:68,at:60,iq:80},
{n:"帕特里克·威廉姆斯",t:"CHI",p:"PF",a:23,o:75,sal:18.0,ins:68,sh:72,pa:58,re:58,de:74,at:74,iq:70},
{n:"阿约·多苏穆",t:"CHI",p:"SG",a:25,o:77,sal:7.0,ins:74,sh:74,pa:70,re:50,de:74,at:78,iq:76},
{n:"朗佐·鲍尔",t:"CHI",p:"PG",a:27,o:76,sal:21.4,ins:66,sh:78,pa:80,re:56,de:78,at:74,iq:82},
{n:"马塔斯·布泽利斯",t:"CHI",p:"PF",a:20,o:73,sal:8.2,ins:68,sh:70,pa:58,re:56,de:68,at:76,iq:68},

// 克利夫兰骑士 CLE
{n:"多诺万·米切尔",t:"CLE",p:"SG",a:28,o:91,sal:35.4,ins:86,sh:86,pa:78,re:50,de:74,at:86,iq:84},
{n:"达里厄斯·加兰",t:"CLE",p:"PG",a:25,o:86,sal:33.7,ins:76,sh:82,pa:84,re:44,de:66,at:74,iq:84},
{n:"埃文·莫布利",t:"CLE",p:"PF",a:23,o:88,sal:27.3,ins:80,sh:68,pa:70,re:82,de:88,at:80,iq:82},
{n:"贾莱特·阿伦",t:"CLE",p:"C",a:27,o:85,sal:20.0,ins:84,sh:40,pa:52,re:86,de:84,at:78,iq:76},
{n:"马克斯·斯特鲁斯",t:"CLE",p:"SG",a:29,o:77,sal:14.5,ins:66,sh:78,pa:60,re:54,de:72,at:72,iq:74},
{n:"卡里斯·勒韦尔",t:"CLE",p:"SG",a:30,o:78,sal:16.6,ins:76,sh:74,pa:72,re:50,de:70,at:78,iq:74},
{n:"迪恩·韦德",t:"CLE",p:"PF",a:28,o:74,sal:6.2,ins:64,sh:74,pa:56,re:58,de:74,at:72,iq:72},
{n:"艾萨克·奥科罗",t:"CLE",p:"SF",a:24,o:74,sal:11.0,ins:66,sh:66,pa:54,re:50,de:80,at:78,iq:70},

// 底特律活塞 DET
{n:"凯德·坎宁安",t:"DET",p:"PG",a:23,o:87,sal:13.9,ins:80,sh:76,pa:88,re:64,de:72,at:76,iq:88},
{n:"贾登·艾维",t:"DET",p:"SG",a:23,o:80,sal:7.9,ins:78,sh:72,pa:70,re:52,de:70,at:86,iq:74},
{n:"杰伦·杜伦",t:"DET",p:"C",a:21,o:81,sal:5.0,ins:80,sh:30,pa:50,re:88,de:76,at:78,iq:72},
{n:"奥萨尔·汤普森",t:"DET",p:"SF",a:22,o:78,sal:7.3,ins:72,sh:54,pa:68,re:66,de:80,at:86,iq:72},
{n:"托拜厄斯·哈里斯",t:"DET",p:"PF",a:32,o:78,sal:25.0,ins:74,sh:74,pa:62,re:60,de:70,at:70,iq:76},
{n:"马利克·比斯利",t:"DET",p:"SG",a:28,o:75,sal:6.0,ins:62,sh:82,pa:54,re:46,de:62,at:72,iq:70},
{n:"蒂姆·哈达威二世",t:"DET",p:"SF",a:32,o:74,sal:16.0,ins:66,sh:78,pa:58,re:50,de:64,at:72,iq:72},
{n:"以赛亚·斯图尔特",t:"DET",p:"C",a:23,o:76,sal:15.0,ins:72,sh:60,pa:48,re:74,de:78,at:74,iq:70},

// 印第安纳步行者 IND
{n:"泰瑞斯·哈利伯顿",t:"IND",p:"PG",a:24,o:89,sal:42.2,ins:74,sh:82,pa:94,re:54,de:68,at:76,iq:90},
{n:"帕斯卡尔·西亚卡姆",t:"IND",p:"PF",a:30,o:86,sal:42.2,ins:82,sh:74,pa:74,re:66,de:76,at:80,iq:82},
{n:"迈尔斯·特纳",t:"IND",p:"C",a:29,o:82,sal:30.0,ins:74,sh:76,pa:50,re:72,de:84,at:74,iq:78},
{n:"阿隆·内史密斯",t:"IND",p:"SF",a:25,o:78,sal:11.0,ins:70,sh:78,pa:58,re:58,de:78,at:78,iq:72},
{n:"安德鲁·内姆哈德",t:"IND",p:"SG",a:25,o:77,sal:10.0,ins:72,sh:74,pa:74,re:50,de:74,at:74,iq:78},
{n:"本内迪克特·马瑟林",t:"IND",p:"SG",a:22,o:80,sal:6.7,ins:80,sh:74,pa:64,re:54,de:68,at:80,iq:72},
{n:"奥比·托平",t:"IND",p:"PF",a:26,o:76,sal:8.0,ins:74,sh:72,pa:56,re:60,de:68,at:80,iq:72},
{n:"TJ·麦康奈尔",t:"IND",p:"PG",a:32,o:76,sal:9.3,ins:72,sh:60,pa:82,re:48,de:72,at:68,iq:82},

// 密尔沃基雄鹿 MIL
{n:"扬尼斯·阿德托昆博",t:"MIL",p:"PF",a:30,o:97,sal:48.8,ins:92,sh:60,pa:80,re:86,de:88,at:92,iq:88},
{n:"达米安·利拉德",t:"MIL",p:"PG",a:34,o:88,sal:48.8,ins:78,sh:90,pa:86,re:44,de:58,at:72,iq:88},
{n:"布鲁克·洛佩斯",t:"MIL",p:"C",a:37,o:80,sal:23.0,ins:72,sh:78,pa:48,re:68,de:82,at:58,iq:80},
{n:"鲍比·波蒂斯",t:"MIL",p:"PF",a:30,o:79,sal:12.5,ins:76,sh:74,pa:60,re:72,de:70,at:74,iq:76},
{n:"加里·特伦特二世",t:"MIL",p:"SG",a:26,o:77,sal:2.6,ins:68,sh:80,pa:58,re:50,de:70,at:74,iq:72},
{n:"陶瑞恩·普林斯",t:"MIL",p:"SF",a:30,o:74,sal:2.5,ins:64,sh:74,pa:56,re:54,de:72,at:72,iq:74},
{n:"AJ·格林",t:"MIL",p:"SG",a:25,o:73,sal:2.1,ins:58,sh:82,pa:52,re:48,de:66,at:70,iq:70},
{n:"德安德烈·乔丹",t:"MIL",p:"C",a:36,o:70,sal:3.0,ins:66,sh:20,pa:40,re:76,de:68,at:54,iq:70},

// ===== 东部 东南赛区 =====
// 夏洛特黄蜂 CHA
{n:"拉梅洛·鲍尔",t:"CHA",p:"PG",a:23,o:86,sal:35.1,ins:76,sh:80,pa:88,re:58,de:62,at:82,iq:84},
{n:"布兰登·米勒",t:"CHA",p:"SF",a:22,o:82,sal:10.0,ins:74,sh:80,pa:62,re:54,de:70,at:78,iq:74},
{n:"迈尔斯·布里奇斯",t:"CHA",p:"PF",a:26,o:81,sal:7.9,ins:80,sh:74,pa:64,re:62,de:70,at:84,iq:74},
{n:"马克·威廉姆斯",t:"CHA",p:"C",a:23,o:78,sal:4.0,ins:78,sh:30,pa:42,re:86,de:78,at:76,iq:68},
{n:"乔什·格林",t:"CHA",p:"SG",a:24,o:74,sal:12.0,ins:66,sh:70,pa:60,re:52,de:78,at:78,iq:72},
{n:"特雷·曼",t:"CHA",p:"PG",a:23,o:74,sal:4.9,ins:70,sh:74,pa:72,re:44,de:62,at:74,iq:72},
{n:"尼克·史密斯二世",t:"CHA",p:"SG",a:21,o:72,sal:2.4,ins:66,sh:74,pa:62,re:42,de:62,at:74,iq:68},

// 迈阿密热火 MIA
{n:"巴姆·阿德巴约",t:"MIA",p:"C",a:27,o:88,sal:34.8,ins:80,sh:62,pa:76,re:82,de:88,at:78,iq:86},
{n:"泰勒·希罗",t:"MIA",p:"SG",a:25,o:85,sal:27.0,ins:78,sh:84,pa:76,re:56,de:66,at:74,iq:82},
{n:"安德鲁·维金斯",t:"MIA",p:"SF",a:29,o:81,sal:28.2,ins:78,sh:74,pa:62,re:58,de:78,at:82,iq:76},
{n:"邓肯·罗宾逊",t:"MIA",p:"SG",a:30,o:76,sal:19.4,ins:60,sh:84,pa:62,re:46,de:64,at:68,iq:74},
{n:"凯尔·韦尔",t:"MIA",p:"C",a:21,o:75,sal:3.4,ins:74,sh:60,pa:48,re:74,de:72,at:78,iq:68},
{n:"海伍德·海史密斯",t:"MIA",p:"PF",a:28,o:73,sal:11.0,ins:66,sh:64,pa:54,re:56,de:76,at:74,iq:72},
{n:"特里·罗齐尔",t:"MIA",p:"PG",a:30,o:78,sal:24.9,ins:74,sh:76,pa:70,re:48,de:66,at:74,iq:74},
{n:"尼古拉·约维奇",t:"MIA",p:"PF",a:21,o:73,sal:2.5,ins:68,sh:70,pa:62,re:54,de:66,at:72,iq:72},

// 奥兰多魔术 ORL
{n:"保罗·班凯罗",t:"ORL",p:"PF",a:22,o:88,sal:12.2,ins:84,sh:72,pa:76,re:70,de:74,at:82,iq:80},
{n:"弗朗茨·瓦格纳",t:"ORL",p:"SF",a:23,o:86,sal:30.0,ins:80,sh:74,pa:74,re:62,de:76,at:80,iq:80},
{n:"杰伦·萨格斯",t:"ORL",p:"PG",a:24,o:82,sal:6.3,ins:72,sh:76,pa:72,re:54,de:86,at:80,iq:78},
{n:"温德尔·卡特",t:"ORL",p:"C",a:26,o:78,sal:13.0,ins:74,sh:66,pa:60,re:74,de:74,at:72,iq:74},
{n:"肯塔维奥斯·考德威尔-波普",t:"ORL",p:"SG",a:31,o:77,sal:22.0,ins:62,sh:78,pa:62,re:50,de:80,at:74,iq:78},
{n:"科尔·安东尼",t:"ORL",p:"PG",a:24,o:76,sal:11.0,ins:74,sh:74,pa:72,re:52,de:66,at:78,iq:74},
{n:"乔纳森·艾萨克",t:"ORL",p:"PF",a:27,o:77,sal:25.0,ins:68,sh:68,pa:54,re:62,de:86,at:78,iq:74},
{n:"莫里茨·瓦格纳",t:"ORL",p:"C",a:28,o:75,sal:8.0,ins:74,sh:68,pa:58,re:60,de:68,at:72,iq:74},

// 华盛顿奇才 WAS
{n:"乔丹·普尔",t:"WAS",p:"SG",a:25,o:79,sal:29.6,ins:74,sh:80,pa:72,re:42,de:58,at:78,iq:72},
{n:"凯尔·库兹马",t:"WAS",p:"PF",a:29,o:79,sal:23.5,ins:76,sh:72,pa:62,re:60,de:66,at:76,iq:74},
{n:"比拉尔·库利巴利",t:"WAS",p:"SF",a:20,o:78,sal:6.5,ins:72,sh:66,pa:64,re:56,de:80,at:82,iq:72},
{n:"亚历克斯·萨尔",t:"WAS",p:"C",a:19,o:75,sal:13.0,ins:70,sh:64,pa:54,re:72,de:76,at:78,iq:68},
{n:"乔纳斯·瓦兰丘纳斯",t:"WAS",p:"C",a:32,o:78,sal:9.6,ins:76,sh:64,pa:52,re:82,de:68,at:58,iq:76},
{n:"科里·基斯珀特",t:"WAS",p:"SG",a:25,o:74,sal:5.0,ins:62,sh:80,pa:58,re:50,de:64,at:72,iq:70},
{n:"马尔科姆·布罗格登",t:"WAS",p:"PG",a:31,o:78,sal:22.5,ins:72,sh:78,pa:76,re:50,de:70,at:68,iq:82},
{n:"凯肖恩·乔治",t:"WAS",p:"SF",a:20,o:73,sal:3.4,ins:64,sh:70,pa:62,re:52,de:70,at:76,iq:68},

// ===== 西部 西北赛区 =====
// 丹佛掘金 DEN
{n:"尼古拉·约基奇",t:"DEN",p:"C",a:29,o:98,sal:51.4,ins:90,sh:82,pa:96,re:88,de:80,at:64,iq:98},
{n:"贾马尔·穆雷",t:"DEN",p:"PG",a:27,o:87,sal:36.0,ins:80,sh:82,pa:82,re:50,de:70,at:76,iq:86},
{n:"小迈克尔·波特",t:"DEN",p:"SF",a:26,o:84,sal:35.9,ins:78,sh:82,pa:58,re:66,de:70,at:78,iq:76},
{n:"阿隆·戈登",t:"DEN",p:"PF",a:29,o:83,sal:22.4,ins:82,sh:60,pa:62,re:64,de:80,at:86,iq:76},
{n:"克里斯蒂安·布劳恩",t:"DEN",p:"SG",a:24,o:78,sal:4.9,ins:74,sh:74,pa:60,re:58,de:76,at:80,iq:74},
{n:"拉塞尔·威斯布鲁克",t:"DEN",p:"PG",a:36,o:76,sal:3.3,ins:78,sh:50,pa:74,re:66,de:64,at:74,iq:74},
{n:"佩顿·沃特森",t:"DEN",p:"SF",a:23,o:74,sal:2.4,ins:66,sh:64,pa:54,re:56,de:80,at:84,iq:70},
{n:"德安德烈·乔丹",t:"DEN",p:"C",a:36,o:70,sal:2.1,ins:66,sh:20,pa:40,re:76,de:66,at:54,iq:70},

// 明尼苏达森林狼 MIN
{n:"安东尼·爱德华兹",t:"MIN",p:"SG",a:23,o:93,sal:42.2,ins:86,sh:82,pa:76,re:60,de:78,at:92,iq:84},
{n:"鲁迪·戈贝尔",t:"MIN",p:"C",a:32,o:86,sal:41.0,ins:74,sh:30,pa:42,re:90,de:92,at:70,iq:74},
{n:"朱利叶斯·兰德尔",t:"MIN",p:"PF",a:30,o:84,sal:28.9,ins:82,sh:72,pa:74,re:68,de:68,at:74,iq:78},
{n:"贾登·麦克丹尼尔斯",t:"MIN",p:"SF",a:24,o:82,sal:22.5,ins:72,sh:72,pa:58,re:58,de:86,at:82,iq:76},
{n:"迈克·康利",t:"MIN",p:"PG",a:37,o:79,sal:9.9,ins:68,sh:76,pa:80,re:46,de:72,at:62,iq:86},
{n:"唐特·迪温琴佐",t:"MIN",p:"SG",a:28,o:79,sal:11.5,ins:68,sh:80,pa:68,re:54,de:74,at:74,iq:78},
{n:"纳兹·里德",t:"MIN",p:"C",a:25,o:80,sal:14.0,ins:74,sh:78,pa:54,re:64,de:72,at:76,iq:76},
{n:"尼基尔·亚历山大-沃克",t:"MIN",p:"SG",a:26,o:76,sal:4.3,ins:66,sh:74,pa:64,re:48,de:78,at:76,iq:74},

// 俄克拉荷马城雷霆 OKC
{n:"谢伊·吉尔杰斯-亚历山大",t:"OKC",p:"PG",a:26,o:96,sal:35.9,ins:88,sh:80,pa:82,re:54,de:84,at:84,iq:92},
{n:"杰伦·威廉姆斯",t:"OKC",p:"SF",a:23,o:88,sal:5.2,ins:80,sh:76,pa:74,re:58,de:82,at:80,iq:84},
{n:"切特·霍姆格伦",t:"OKC",p:"C",a:22,o:88,sal:10.9,ins:78,sh:74,pa:60,re:78,de:88,at:80,iq:82},
{n:"吕冈茨·多尔特",t:"OKC",p:"SF",a:25,o:81,sal:16.5,ins:72,sh:72,pa:56,re:54,de:90,at:80,iq:74},
{n:"亚历克斯·卡鲁索",t:"OKC",p:"SG",a:30,o:80,sal:9.5,ins:64,sh:70,pa:72,re:50,de:88,at:76,iq:82},
{n:"以赛亚·哈尔滕施泰因",t:"OKC",p:"C",a:27,o:80,sal:30.0,ins:74,sh:30,pa:60,re:80,de:78,at:72,iq:76},
{n:"阿隆·威金斯",t:"OKC",p:"SG",a:23,o:76,sal:6.5,ins:70,sh:74,pa:60,re:52,de:72,at:80,iq:72},
{n:"卡森·华莱士",t:"OKC",p:"PG",a:21,o:75,sal:5.1,ins:64,sh:74,pa:66,re:46,de:80,at:78,iq:74},

// 波特兰开拓者 POR
{n:"安芬尼·西蒙斯",t:"POR",p:"PG",a:25,o:82,sal:25.0,ins:74,sh:84,pa:74,re:44,de:62,at:78,iq:78},
{n:"杰拉米·格兰特",t:"POR",p:"PF",a:30,o:81,sal:32.0,ins:76,sh:76,pa:60,re:58,de:76,at:78,iq:76},
{n:"德尼·阿夫迪亚",t:"POR",p:"SF",a:24,o:79,sal:16.0,ins:74,sh:72,pa:70,re:62,de:72,at:76,iq:76},
{n:"多诺万·克林根",t:"POR",p:"C",a:20,o:75,sal:8.1,ins:68,sh:30,pa:48,re:84,de:80,at:70,iq:70},
{n:"斯库特·亨德森",t:"POR",p:"PG",a:21,o:78,sal:9.8,ins:76,sh:66,pa:76,re:50,de:64,at:84,iq:74},
{n:"图马尼·卡马拉",t:"POR",p:"SF",a:24,o:74,sal:2.1,ins:66,sh:64,pa:54,re:56,de:80,at:78,iq:70},
{n:"谢登·夏普",t:"POR",p:"SG",a:21,o:76,sal:6.3,ins:74,sh:72,pa:60,re:50,de:62,at:86,iq:70},
{n:"德安德烈·艾顿",t:"POR",p:"C",a:26,o:81,sal:34.0,ins:82,sh:50,pa:50,re:82,de:74,at:74,iq:72},

// 犹他爵士 UTA
{n:"劳里·马尔卡宁",t:"UTA",p:"PF",a:27,o:85,sal:18.0,ins:78,sh:84,pa:62,re:66,de:68,at:76,iq:80},
{n:"约翰·科林斯",t:"UTA",p:"PF",a:27,o:78,sal:26.6,ins:78,sh:66,pa:54,re:70,de:68,at:76,iq:72},
{n:"沃克·凯斯勒",t:"UTA",p:"C",a:23,o:79,sal:2.8,ins:70,sh:30,pa:42,re:86,de:84,at:74,iq:70},
{n:"科林·塞克斯顿",t:"UTA",p:"PG",a:26,o:79,sal:18.2,ins:82,sh:74,pa:66,re:42,de:64,at:80,iq:74},
{n:"凯昂特·乔治",t:"UTA",p:"PG",a:21,o:76,sal:4.2,ins:70,sh:74,pa:72,re:46,de:62,at:76,iq:72},
{n:"泰勒·亨德里克斯",t:"UTA",p:"SF",a:21,o:73,sal:4.4,ins:64,sh:70,pa:54,re:58,de:72,at:78,iq:68},
{n:"乔丹·克拉克森",t:"UTA",p:"SG",a:32,o:76,sal:14.1,ins:76,sh:74,pa:64,re:44,de:60,at:72,iq:74},
{n:"科迪·威廉姆斯",t:"UTA",p:"SF",a:20,o:72,sal:4.0,ins:62,sh:68,pa:56,re:54,de:70,at:74,iq:68},

// ===== 西部 太平洋赛区 =====
// 金州勇士 GSW
{n:"斯蒂芬·库里",t:"GSW",p:"PG",a:36,o:93,sal:55.8,ins:78,sh:96,pa:84,re:48,de:66,at:74,iq:96},
{n:"德雷蒙德·格林",t:"GSW",p:"PF",a:34,o:82,sal:24.1,ins:66,sh:62,pa:82,re:68,de:84,at:70,iq:90},
{n:"安德鲁·维金斯",t:"GSW",p:"SF",a:29,o:80,sal:26.3,ins:78,sh:72,pa:54,re:56,de:78,at:82,iq:74},
{n:"乔纳森·库明加",t:"GSW",p:"PF",a:22,o:80,sal:7.6,ins:82,sh:62,pa:58,re:58,de:68,at:86,iq:72},
{n:"巴迪·希尔德",t:"GSW",p:"SG",a:32,o:78,sal:8.8,ins:66,sh:86,pa:58,re:48,de:62,at:74,iq:74},
{n:"丹尼斯·施罗德",t:"GSW",p:"PG",a:31,o:77,sal:13.0,ins:74,sh:70,pa:76,re:44,de:70,at:78,iq:76},
{n:"凯文·卢尼",t:"GSW",p:"C",a:28,o:75,sal:8.0,ins:70,sh:30,pa:54,re:80,de:72,at:66,iq:78},
{n:"布兰丁·波杰姆斯基",t:"GSW",p:"SG",a:22,o:75,sal:3.5,ins:68,sh:72,pa:70,re:56,de:68,at:74,iq:78},

// 洛杉矶快船 LAC
{n:"科怀·伦纳德",t:"LAC",p:"SF",a:33,o:92,sal:50.0,ins:86,sh:80,pa:70,re:62,de:92,at:80,iq:90},
{n:"詹姆斯·哈登",t:"LAC",p:"PG",a:35,o:87,sal:33.7,ins:78,sh:82,pa:88,re:52,de:62,at:66,iq:88},
{n:"诺曼·鲍威尔",t:"LAC",p:"SG",a:31,o:82,sal:19.2,ins:78,sh:80,pa:62,re:48,de:72,at:78,iq:78},
{n:"伊维察·祖巴茨",t:"LAC",p:"C",a:27,o:81,sal:11.7,ins:80,sh:30,pa:50,re:82,de:76,at:70,iq:74},
{n:"克里斯·邓恩",t:"LAC",p:"PG",a:30,o:75,sal:5.2,ins:62,sh:64,pa:70,re:50,de:82,at:74,iq:76},
{n:"尼古拉斯·巴图姆",t:"LAC",p:"PF",a:35,o:74,sal:4.0,ins:60,sh:74,pa:66,re:54,de:72,at:64,iq:80},
{n:"德里克·琼斯二世",t:"LAC",p:"SF",a:27,o:75,sal:9.5,ins:70,sh:62,pa:52,re:54,de:78,at:86,iq:70},
{n:"阿米尔·科菲",t:"LAC",p:"SG",a:27,o:73,sal:3.5,ins:66,sh:72,pa:54,re:48,de:70,at:74,iq:72},

// 洛杉矶湖人 LAL
{n:"勒布朗·詹姆斯",t:"LAL",p:"SF",a:40,o:91,sal:48.7,ins:84,sh:76,pa:88,re:66,de:72,at:74,iq:96},
{n:"卢卡·东契奇",t:"LAL",p:"PG",a:26,o:95,sal:46.0,ins:86,sh:80,pa:92,re:66,de:66,at:74,iq:94},
{n:"奥斯汀·里夫斯",t:"LAL",p:"SG",a:26,o:83,sal:12.9,ins:76,sh:80,pa:76,re:50,de:68,at:74,iq:82},
{n:"八村塁",t:"LAL",p:"PF",a:27,o:79,sal:17.0,ins:78,sh:74,pa:56,re:58,de:70,at:76,iq:74},
{n:"贾里德·范德比尔特",t:"LAL",p:"PF",a:26,o:75,sal:10.7,ins:62,sh:50,pa:54,re:66,de:84,at:80,iq:70},
{n:"加布·文森特",t:"LAL",p:"PG",a:28,o:73,sal:11.0,ins:64,sh:72,pa:66,re:44,de:72,at:72,iq:74},
{n:"贾克森·海斯",t:"LAL",p:"C",a:25,o:74,sal:2.5,ins:76,sh:30,pa:42,re:66,de:68,at:82,iq:66},
{n:"道尔顿·克内克特",t:"LAL",p:"SG",a:23,o:75,sal:3.8,ins:68,sh:80,pa:58,re:48,de:64,at:74,iq:72},

// 菲尼克斯太阳 PHX
{n:"凯文·杜兰特",t:"PHX",p:"SF",a:36,o:93,sal:51.2,ins:86,sh:88,pa:76,re:60,de:78,at:78,iq:92},
{n:"德文·布克",t:"PHX",p:"SG",a:28,o:90,sal:49.2,ins:84,sh:84,pa:78,re:52,de:70,at:76,iq:88},
{n:"布拉德利·比尔",t:"PHX",p:"SG",a:31,o:84,sal:50.2,ins:80,sh:78,pa:72,re:50,de:68,at:76,iq:80},
{n:"尤素福·努尔基奇",t:"PHX",p:"C",a:30,o:78,sal:18.1,ins:72,sh:50,pa:66,re:80,de:70,at:60,iq:74},
{n:"格雷森·阿伦",t:"PHX",p:"SG",a:29,o:78,sal:15.6,ins:66,sh:84,pa:62,re:48,de:74,at:74,iq:76},
{n:"罗伊斯·奥尼尔",t:"PHX",p:"PF",a:31,o:75,sal:9.4,ins:60,sh:76,pa:58,re:58,de:72,at:68,iq:76},
{n:"泰厄斯·琼斯",t:"PHX",p:"PG",a:28,o:78,sal:3.3,ins:66,sh:78,pa:80,re:42,de:66,at:70,iq:82},
{n:"梅森·普拉姆利",t:"PHX",p:"C",a:35,o:72,sal:3.3,ins:66,sh:30,pa:56,re:70,de:66,at:62,iq:74},

// 萨克拉门托国王 SAC
{n:"德阿龙·福克斯",t:"SAC",p:"PG",a:27,o:89,sal:34.8,ins:84,sh:78,pa:82,re:46,de:74,at:90,iq:86},
{n:"多曼塔斯·萨博尼斯",t:"SAC",p:"C",a:28,o:87,sal:40.5,ins:80,sh:64,pa:84,re:86,de:72,at:66,iq:88},
{n:"德马尔·德罗赞",t:"SAC",p:"SF",a:35,o:85,sal:23.4,ins:86,sh:66,pa:70,re:50,de:68,at:70,iq:86},
{n:"基根·穆雷",t:"SAC",p:"PF",a:24,o:80,sal:8.6,ins:70,sh:78,pa:54,re:58,de:74,at:78,iq:74},
{n:"马利克·蒙克",t:"SAC",p:"SG",a:27,o:81,sal:17.4,ins:76,sh:78,pa:74,re:44,de:66,at:80,iq:78},
{n:"扎克·拉文",t:"SAC",p:"SG",a:30,o:84,sal:43.0,ins:82,sh:80,pa:68,re:50,de:64,at:84,iq:78},
{n:"基翁·埃利斯",t:"SAC",p:"SG",a:24,o:74,sal:2.1,ins:62,sh:74,pa:54,re:48,de:80,at:78,iq:72},
{n:"特雷·莱尔斯",t:"SAC",p:"PF",a:29,o:73,sal:8.0,ins:62,sh:76,pa:50,re:56,de:66,at:72,iq:72},

// ===== 西部 西南赛区 =====
// 达拉斯独行侠 DAL
{n:"安东尼·戴维斯",t:"DAL",p:"PF",a:31,o:93,sal:54.3,ins:86,sh:74,pa:66,re:84,de:92,at:80,iq:86},
{n:"凯里·欧文",t:"DAL",p:"PG",a:32,o:90,sal:41.0,ins:88,sh:84,pa:82,re:48,de:70,at:80,iq:90},
{n:"克莱·汤普森",t:"DAL",p:"SG",a:35,o:80,sal:15.9,ins:70,sh:84,pa:54,re:48,de:66,at:66,iq:80},
{n:"PJ·华盛顿",t:"DAL",p:"PF",a:26,o:79,sal:16.0,ins:72,sh:74,pa:58,re:62,de:76,at:76,iq:74},
{n:"纳吉·马绍尔",t:"DAL",p:"SF",a:27,o:75,sal:9.0,ins:70,sh:68,pa:62,re:54,de:74,at:74,iq:72},
{n:"丹尼尔·加福德",t:"DAL",p:"C",a:26,o:80,sal:13.4,ins:80,sh:30,pa:48,re:74,de:80,at:80,iq:72},
{n:"德雷克·莱夫利二世",t:"DAL",p:"C",a:21,o:80,sal:5.0,ins:76,sh:30,pa:50,re:80,de:80,at:84,iq:72},
{n:"斯宾塞·丁威迪",t:"DAL",p:"PG",a:31,o:76,sal:3.3,ins:70,sh:74,pa:74,re:44,de:64,at:74,iq:78},

// 休斯顿火箭 HOU
{n:"阿尔佩伦·申京",t:"HOU",p:"C",a:22,o:86,sal:33.9,ins:84,sh:50,pa:80,re:80,de:70,at:70,iq:84},
{n:"杰伦·格林",t:"HOU",p:"SG",a:22,o:83,sal:33.9,ins:80,sh:76,pa:68,re:50,de:64,at:88,iq:74},
{n:"弗雷德·范弗利特",t:"HOU",p:"PG",a:30,o:83,sal:42.8,ins:70,sh:78,pa:82,re:48,de:74,at:72,iq:86},
{n:"狄龙·布鲁克斯",t:"HOU",p:"SF",a:28,o:79,sal:22.2,ins:72,sh:74,pa:56,re:54,de:80,at:78,iq:74},
{n:"阿门·汤普森",t:"HOU",p:"SG",a:22,o:80,sal:8.5,ins:76,sh:54,pa:66,re:66,de:78,at:88,iq:74},
{n:"贾巴里·史密斯二世",t:"HOU",p:"PF",a:21,o:78,sal:9.8,ins:70,sh:74,pa:54,re:64,de:74,at:78,iq:74},
{n:"塔里·伊森",t:"HOU",p:"SF",a:23,o:78,sal:3.7,ins:72,sh:62,pa:54,re:64,de:82,at:84,iq:72},
{n:"史蒂文·亚当斯",t:"HOU",p:"C",a:31,o:75,sal:12.6,ins:66,sh:20,pa:54,re:80,de:74,at:62,iq:74},

// 孟菲斯灰熊 MEM
{n:"贾·莫兰特",t:"MEM",p:"PG",a:25,o:90,sal:36.7,ins:88,sh:74,pa:82,re:54,de:70,at:92,iq:84},
{n:"小贾伦·杰克逊",t:"MEM",p:"PF",a:25,o:87,sal:24.0,ins:78,sh:74,pa:60,re:66,de:90,at:80,iq:80},
{n:"德斯蒙德·贝恩",t:"MEM",p:"SG",a:26,o:85,sal:36.0,ins:78,sh:84,pa:72,re:56,de:74,at:78,iq:80},
{n:"马库斯·斯马特",t:"MEM",p:"PG",a:30,o:78,sal:21.6,ins:66,sh:66,pa:74,re:52,de:88,at:76,iq:80},
{n:"扎克·伊迪",t:"MEM",p:"C",a:22,o:76,sal:5.5,ins:78,sh:50,pa:42,re:82,de:72,at:62,iq:68},
{n:"桑蒂·阿尔达马",t:"MEM",p:"PF",a:24,o:76,sal:5.9,ins:70,sh:74,pa:62,re:58,de:66,at:76,iq:74},
{n:"布兰登·克拉克",t:"MEM",p:"PF",a:28,o:74,sal:12.5,ins:72,sh:40,pa:50,re:64,de:72,at:80,iq:70},
{n:"杰伊·赫夫",t:"MEM",p:"C",a:26,o:71,sal:2.1,ins:68,sh:60,pa:40,re:62,de:68,at:74,iq:66},

// 新奥尔良鹈鹕 NOP
{n:"锡安·威廉森",t:"NOP",p:"PF",a:24,o:89,sal:36.7,ins:92,sh:50,pa:66,re:66,de:70,at:88,iq:76},
{n:"CJ·麦科勒姆",t:"NOP",p:"SG",a:33,o:83,sal:33.3,ins:78,sh:82,pa:74,re:46,de:66,at:70,iq:82},
{n:"特雷·墨菲",t:"NOP",p:"SF",a:24,o:81,sal:6.1,ins:72,sh:84,pa:58,re:54,de:72,at:80,iq:74},
{n:"赫伯特·琼斯",t:"NOP",p:"SF",a:26,o:82,sal:13.9,ins:68,sh:66,pa:60,re:56,de:92,at:80,iq:78},
{n:"德章泰·穆雷",t:"NOP",p:"PG",a:28,o:84,sal:25.2,ins:76,sh:72,pa:80,re:58,de:80,at:76,iq:82},
{n:"伊夫·米西",t:"NOP",p:"C",a:20,o:75,sal:2.5,ins:72,sh:30,pa:44,re:78,de:74,at:80,iq:66},
{n:"乔丹·霍金斯",t:"NOP",p:"SG",a:22,o:74,sal:4.0,ins:64,sh:80,pa:54,re:44,de:62,at:76,iq:70},
{n:"丹尼尔·泰斯",t:"NOP",p:"C",a:32,o:72,sal:2.8,ins:64,sh:60,pa:54,re:56,de:68,at:62,iq:74},

// 圣安东尼奥马刺 SAS
{n:"维克托·文班亚马",t:"SAS",p:"C",a:21,o:95,sal:12.6,ins:82,sh:76,pa:70,re:84,de:96,at:84,iq:86},
{n:"克里斯·保罗",t:"SAS",p:"PG",a:39,o:83,sal:10.5,ins:68,sh:78,pa:86,re:46,de:74,at:58,iq:94},
{n:"德文·瓦塞尔",t:"SAS",p:"SG",a:24,o:83,sal:29.0,ins:76,sh:80,pa:62,re:54,de:74,at:78,iq:78},
{n:"哈里森·巴恩斯",t:"SAS",p:"PF",a:32,o:78,sal:18.0,ins:72,sh:76,pa:54,re:56,de:70,at:72,iq:78},
{n:"凯尔登·约翰逊",t:"SAS",p:"SF",a:25,o:79,sal:17.5,ins:78,sh:72,pa:58,re:58,de:68,at:80,iq:74},
{n:"斯蒂芬·卡斯尔",t:"SAS",p:"PG",a:20,o:76,sal:9.1,ins:72,sh:66,pa:70,re:52,de:74,at:78,iq:74},
{n:"杰里米·索汉",t:"SAS",p:"PF",a:21,o:78,sal:5.2,ins:74,sh:54,pa:62,re:62,de:78,at:82,iq:74},
{n:"特雷·琼斯",t:"SAS",p:"PG",a:25,o:74,sal:9.1,ins:66,sh:66,pa:78,re:46,de:70,at:70,iq:78},
];

window.PLAYERS_DATA = PLAYERS_DATA;
