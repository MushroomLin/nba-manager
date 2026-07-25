#!/usr/bin/env python3
"""
将从 basketball-reference 获取的早期赛季数据合并到 nba_stats.json 中。
补全 2003-2009 赛季的缺失数据（数据源 llimllib/nba_data 只覆盖 2009-10 起）。
"""
import json
import os

STATS_FILE = "/workspace/nba-manager/js/data/nba_stats.json"

# 球员名 -> NBA player_id 映射
NAME_TO_PID = {
    "LeBron James": "2544",
    "Chris Paul": "101108",
    "Kyle Lowry": "200768",
    "Kevin Durant": "201142",
    "Al Horford": "201143",
    "Jeff Green": "201145",
    "Mike Conley": "201144",
    "Russell Westbrook": "201566",
    "Kevin Love": "201567",
    "Eric Gordon": "201569",
    "Brook Lopez": "201572",
    "Nicolas Batum": "201587",
    "DeAndre Jordan": "201599",
    "Garrett Temple": "202066",
}

# 所有获取到的早期赛季数据
# season 格式 "2003-04" -> year=2004
EARLY_DATA = {
    "LeBron James": [
        {"season": "2003-04", "tm": "CLE", "g": 79, "mp": 39.5, "pts": 20.9, "trb": 5.5, "ast": 5.9, "stl": 1.6, "blk": 0.7, "tov": 3.5, "fg_pct": 0.417, "fg3_pct": 0.290, "ft_pct": 0.754, "fgm": 7.9, "fga": 18.9, "fg3m": 0.8, "fg3a": 2.7, "ftm": 4.4, "fta": 5.8},
        {"season": "2004-05", "tm": "CLE", "g": 80, "mp": 42.4, "pts": 27.2, "trb": 7.4, "ast": 7.2, "stl": 2.2, "blk": 0.7, "tov": 3.3, "fg_pct": 0.472, "fg3_pct": 0.351, "ft_pct": 0.750, "fgm": 9.9, "fga": 21.1, "fg3m": 1.4, "fg3a": 3.9, "ftm": 6.0, "fta": 8.0},
        {"season": "2005-06", "tm": "CLE", "g": 79, "mp": 42.5, "pts": 31.4, "trb": 7.0, "ast": 6.6, "stl": 1.6, "blk": 0.8, "tov": 3.3, "fg_pct": 0.480, "fg3_pct": 0.335, "ft_pct": 0.738, "fgm": 11.1, "fga": 23.1, "fg3m": 1.6, "fg3a": 4.8, "ftm": 7.6, "fta": 10.3},
        {"season": "2006-07", "tm": "CLE", "g": 78, "mp": 40.9, "pts": 27.3, "trb": 6.7, "ast": 6.0, "stl": 1.6, "blk": 0.7, "tov": 3.2, "fg_pct": 0.476, "fg3_pct": 0.319, "ft_pct": 0.698, "fgm": 9.9, "fga": 20.8, "fg3m": 1.3, "fg3a": 4.0, "ftm": 6.3, "fta": 9.0},
        {"season": "2007-08", "tm": "CLE", "g": 75, "mp": 40.4, "pts": 30.0, "trb": 7.9, "ast": 7.2, "stl": 1.8, "blk": 1.1, "tov": 3.4, "fg_pct": 0.484, "fg3_pct": 0.315, "ft_pct": 0.712, "fgm": 10.6, "fga": 21.9, "fg3m": 1.5, "fg3a": 4.8, "ftm": 7.3, "fta": 10.3},
        {"season": "2008-09", "tm": "CLE", "g": 81, "mp": 37.7, "pts": 28.4, "trb": 7.6, "ast": 7.2, "stl": 1.7, "blk": 1.1, "tov": 3.0, "fg_pct": 0.489, "fg3_pct": 0.344, "ft_pct": 0.780, "fgm": 9.7, "fga": 19.9, "fg3m": 1.6, "fg3a": 4.7, "ftm": 7.3, "fta": 9.4},
    ],
    "Chris Paul": [
        {"season": "2005-06", "tm": "NOK", "g": 78, "mp": 36.0, "pts": 16.1, "trb": 5.1, "ast": 7.8, "stl": 2.2, "blk": 0.1, "tov": 2.3, "fg_pct": 0.430, "fg3_pct": 0.282, "ft_pct": 0.847, "fgm": 5.2, "fga": 12.1, "fg3m": 0.6, "fg3a": 2.3, "ftm": 5.1, "fta": 6.0},
        {"season": "2006-07", "tm": "NOK", "g": 64, "mp": 36.8, "pts": 17.3, "trb": 4.4, "ast": 8.9, "stl": 1.8, "blk": 0.0, "tov": 2.5, "fg_pct": 0.437, "fg3_pct": 0.350, "ft_pct": 0.818, "fgm": 6.0, "fga": 13.6, "fg3m": 0.8, "fg3a": 2.2, "ftm": 4.6, "fta": 5.6},
        {"season": "2007-08", "tm": "NOH", "g": 80, "mp": 37.6, "pts": 21.1, "trb": 4.0, "ast": 11.6, "stl": 2.7, "blk": 0.1, "tov": 2.5, "fg_pct": 0.488, "fg3_pct": 0.369, "ft_pct": 0.851, "fgm": 7.9, "fga": 16.1, "fg3m": 1.2, "fg3a": 3.1, "ftm": 4.2, "fta": 4.9},
        {"season": "2008-09", "tm": "NOH", "g": 78, "mp": 38.5, "pts": 22.8, "trb": 5.5, "ast": 11.0, "stl": 2.8, "blk": 0.1, "tov": 3.0, "fg_pct": 0.503, "fg3_pct": 0.364, "ft_pct": 0.868, "fgm": 8.1, "fga": 16.1, "fg3m": 0.8, "fg3a": 2.3, "ftm": 5.8, "fta": 6.7},
    ],
    "Kyle Lowry": [
        {"season": "2006-07", "tm": "MEM", "g": 10, "mp": 17.5, "pts": 5.6, "trb": 3.1, "ast": 3.2, "stl": 1.4, "blk": 0.1, "tov": 1.2, "fg_pct": 0.368, "fg3_pct": 0.375, "ft_pct": 0.893, "fgm": 1.4, "fga": 3.8, "fg3m": 0.3, "fg3a": 0.8, "ftm": 2.5, "fta": 2.8},
        {"season": "2007-08", "tm": "MEM", "g": 82, "mp": 25.5, "pts": 9.6, "trb": 3.0, "ast": 3.6, "stl": 1.1, "blk": 0.3, "tov": 1.5, "fg_pct": 0.432, "fg3_pct": 0.257, "ft_pct": 0.698, "fgm": 3.1, "fga": 7.2, "fg3m": 0.4, "fg3a": 1.7, "ftm": 3.0, "fta": 4.2},
        {"season": "2008-09", "tm": "TOT", "g": 77, "mp": 21.8, "pts": 7.6, "trb": 2.5, "ast": 3.6, "stl": 0.9, "blk": 0.2, "tov": 1.5, "fg_pct": 0.435, "fg3_pct": 0.255, "ft_pct": 0.801, "fgm": 2.5, "fga": 5.6, "fg3m": 0.3, "fg3a": 1.3, "ftm": 2.4, "fta": 2.9},
    ],
    "Kevin Durant": [
        {"season": "2007-08", "tm": "SEA", "g": 80, "mp": 34.6, "pts": 20.3, "trb": 4.4, "ast": 2.4, "stl": 1.0, "blk": 0.9, "tov": 2.9, "fg_pct": 0.430, "fg3_pct": 0.288, "ft_pct": 0.873, "fgm": 7.3, "fga": 17.1, "fg3m": 0.7, "fg3a": 2.6, "ftm": 4.9, "fta": 5.6},
        {"season": "2008-09", "tm": "OKC", "g": 74, "mp": 39.0, "pts": 25.3, "trb": 6.5, "ast": 2.8, "stl": 1.3, "blk": 0.7, "tov": 3.0, "fg_pct": 0.476, "fg3_pct": 0.422, "ft_pct": 0.863, "fgm": 8.9, "fga": 18.8, "fg3m": 1.3, "fg3a": 3.1, "ftm": 6.1, "fta": 7.1},
    ],
    "Al Horford": [
        {"season": "2007-08", "tm": "ATL", "g": 81, "mp": 31.4, "pts": 10.1, "trb": 9.7, "ast": 1.5, "stl": 0.7, "blk": 0.9, "tov": 1.7, "fg_pct": 0.499, "fg3_pct": 0.0, "ft_pct": 0.731, "fgm": 4.1, "fga": 8.2, "fg3m": 0.0, "fg3a": 0.1, "ftm": 1.9, "fta": 2.6},
        {"season": "2008-09", "tm": "ATL", "g": 67, "mp": 33.5, "pts": 11.5, "trb": 9.3, "ast": 2.4, "stl": 0.8, "blk": 1.4, "tov": 1.5, "fg_pct": 0.525, "fg3_pct": 0.0, "ft_pct": 0.727, "fgm": 4.7, "fga": 8.9, "fg3m": 0.0, "fg3a": 0.0, "ftm": 2.2, "fta": 3.1},
    ],
    "Jeff Green": [
        {"season": "2007-08", "tm": "SEA", "g": 80, "mp": 28.2, "pts": 10.5, "trb": 4.7, "ast": 1.5, "stl": 0.6, "blk": 0.6, "tov": 2.0, "fg_pct": 0.427, "fg3_pct": 0.276, "ft_pct": 0.744, "fgm": 4.0, "fga": 9.4, "fg3m": 0.3, "fg3a": 1.0, "ftm": 2.2, "fta": 3.0},
        {"season": "2008-09", "tm": "OKC", "g": 78, "mp": 36.8, "pts": 16.5, "trb": 6.7, "ast": 2.0, "stl": 1.0, "blk": 0.4, "tov": 2.2, "fg_pct": 0.446, "fg3_pct": 0.389, "ft_pct": 0.788, "fgm": 6.1, "fga": 13.7, "fg3m": 1.2, "fg3a": 3.2, "ftm": 3.1, "fta": 3.9},
    ],
    "Mike Conley": [
        {"season": "2007-08", "tm": "MEM", "g": 53, "mp": 26.1, "pts": 9.4, "trb": 2.6, "ast": 4.2, "stl": 0.8, "blk": 0.0, "tov": 1.7, "fg_pct": 0.428, "fg3_pct": 0.330, "ft_pct": 0.732, "fgm": 3.6, "fga": 8.3, "fg3m": 0.6, "fg3a": 1.7, "ftm": 1.7, "fta": 2.3},
        {"season": "2008-09", "tm": "MEM", "g": 82, "mp": 30.6, "pts": 10.9, "trb": 3.4, "ast": 4.3, "stl": 1.1, "blk": 0.1, "tov": 1.7, "fg_pct": 0.442, "fg3_pct": 0.406, "ft_pct": 0.817, "fgm": 3.9, "fga": 8.9, "fg3m": 1.1, "fg3a": 2.6, "ftm": 2.0, "fta": 2.4},
    ],
    "Russell Westbrook": [
        {"season": "2008-09", "tm": "OKC", "g": 82, "mp": 32.5, "pts": 15.3, "trb": 4.9, "ast": 5.3, "stl": 1.3, "blk": 0.2, "tov": 3.3, "fg_pct": 0.398, "fg3_pct": 0.271, "ft_pct": 0.815, "fgm": 5.3, "fga": 13.4, "fg3m": 0.4, "fg3a": 1.6, "ftm": 4.3, "fta": 5.2},
    ],
    "Kevin Love": [
        {"season": "2008-09", "tm": "MIN", "g": 81, "mp": 25.3, "pts": 11.1, "trb": 9.1, "ast": 1.0, "stl": 0.4, "blk": 0.6, "tov": 1.5, "fg_pct": 0.459, "fg3_pct": 0.105, "ft_pct": 0.789, "fgm": 3.9, "fga": 8.5, "fg3m": 0.0, "fg3a": 0.2, "ftm": 3.3, "fta": 4.1},
    ],
    "Eric Gordon": [
        {"season": "2008-09", "tm": "LAC", "g": 78, "mp": 34.3, "pts": 16.1, "trb": 2.6, "ast": 2.8, "stl": 1.0, "blk": 0.4, "tov": 2.1, "fg_pct": 0.456, "fg3_pct": 0.389, "ft_pct": 0.854, "fgm": 5.3, "fga": 11.6, "fg3m": 1.7, "fg3a": 4.3, "ftm": 3.8, "fta": 4.5},
    ],
    "Brook Lopez": [
        {"season": "2008-09", "tm": "NJN", "g": 82, "mp": 30.5, "pts": 13.0, "trb": 8.1, "ast": 1.0, "stl": 0.5, "blk": 1.8, "tov": 1.8, "fg_pct": 0.531, "fg3_pct": 0.0, "ft_pct": 0.793, "fgm": 5.5, "fga": 10.3, "fg3m": 0.0, "fg3a": 0.0, "ftm": 2.1, "fta": 2.6},
    ],
    "Nicolas Batum": [
        {"season": "2008-09", "tm": "POR", "g": 79, "mp": 18.4, "pts": 5.4, "trb": 2.8, "ast": 0.9, "stl": 0.6, "blk": 0.5, "tov": 0.6, "fg_pct": 0.446, "fg3_pct": 0.369, "ft_pct": 0.808, "fgm": 2.0, "fga": 4.6, "fg3m": 0.8, "fg3a": 2.1, "ftm": 0.5, "fta": 0.7},
    ],
    "DeAndre Jordan": [
        {"season": "2008-09", "tm": "LAC", "g": 53, "mp": 14.5, "pts": 4.3, "trb": 4.5, "ast": 0.2, "stl": 0.2, "blk": 1.1, "tov": 0.8, "fg_pct": 0.633, "fg3_pct": 0.0, "ft_pct": 0.385, "fgm": 1.8, "fga": 2.8, "fg3m": 0.0, "fg3a": 0.0, "ftm": 0.8, "fta": 2.1},
    ],
    # Garrett Temple 2008-09 不在 NBA，无需补全
}


def season_str_to_year(s):
    """'2003-04' -> 2004"""
    return int(s.split("-")[1]) + 2000 if int(s.split("-")[1]) < 50 else int(s.split("-")[1]) + 1900


def convert_early_season(player_name, season_data):
    """把 basketball-reference 格式转换为 nba_stats.json 的 season 格式"""
    year = season_str_to_year(season_data["season"])
    return {
        "year": year,
        "team": season_data["tm"],
        "age": None,  # 早期数据没有 age
        "gp": season_data["g"],
        "min": round(season_data["mp"], 1),
        "pts": round(season_data["pts"], 1),
        "reb": round(season_data["trb"], 1),
        "ast": round(season_data["ast"], 1),
        "stl": round(season_data["stl"], 1),
        "blk": round(season_data["blk"], 1),
        "tov": round(season_data["tov"], 1),
        "fgm": round(season_data["fgm"], 1),
        "fga": round(season_data["fga"], 1),
        "fg_pct": round(season_data["fg_pct"], 3) if season_data["fg_pct"] is not None else 0,
        "fg3m": round(season_data["fg3m"], 1),
        "fg3a": round(season_data["fg3a"], 1),
        "fg3_pct": round(season_data["fg3_pct"], 3) if season_data["fg3_pct"] is not None else 0,
        "ftm": round(season_data["ftm"], 1),
        "fta": round(season_data["fta"], 1),
        "ft_pct": round(season_data["ft_pct"], 3) if season_data["ft_pct"] is not None else 0,
        "oreb": 0,  # 早期数据没有 oreb/dreb
        "dreb": 0,
        "pf": 0,
        "plus_minus": 0,
        "dd2": 0,
        "td3": 0,
    }


def main():
    # 读取现有数据
    with open(STATS_FILE, "r", encoding="utf-8") as f:
        stats = json.load(f)

    print(f"现有球员数: {len(stats)}")

    # 合并早期数据
    merged_count = 0
    for player_name, seasons in EARLY_DATA.items():
        pid = NAME_TO_PID.get(player_name)
        if not pid or pid not in stats:
            print(f"  ⚠️ {player_name} (pid={pid}) 不在数据中，跳过")
            continue

        existing_years = {s["year"] for s in stats[pid]["seasons"]}
        new_seasons = []
        for sd in seasons:
            year = season_str_to_year(sd["season"])
            if year in existing_years:
                print(f"  ⏭️ {player_name} {sd['season']} 已存在，跳过")
                continue
            new_seasons.append(convert_early_season(player_name, sd))

        if new_seasons:
            stats[pid]["seasons"] = new_seasons + stats[pid]["seasons"]
            stats[pid]["seasons"].sort(key=lambda s: s["year"])
            merged_count += len(new_seasons)
            print(f"  ✅ {player_name}: 补充 {len(new_seasons)} 个赛季 (总计 {len(stats[pid]['seasons'])} 赛季)")

    # 重新保存
    with open(STATS_FILE, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(STATS_FILE) / 1024
    print(f"\n合并完成! 新增 {merged_count} 个赛季, 文件大小 {size_kb:.1f} KB")

    # 验证詹姆斯
    lb = stats.get("2544", {})
    print(f"\n=== 验证: 勒布朗·詹姆斯 ===")
    print(f"  赛季数: {len(lb.get('seasons', []))}")
    for s in lb.get("seasons", []):
        print(f"  {s['year']-1}-{str(s['year'])[-2:]} {s['team']:4s} GP={s['gp']:3d} 分={s['pts']:5.1f} 板={s['reb']:4.1f} 助={s['ast']:4.1f}")


if __name__ == "__main__":
    main()
