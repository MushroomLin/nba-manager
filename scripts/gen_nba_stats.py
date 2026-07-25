#!/usr/bin/env python3
"""
从 llimllib/nba_data 仓库的 parquet 文件生成精简的 NBA 球员历史数据 JSON。

输出:
  - /workspace/nba-manager/js/data/nba_stats.json
      结构: { "player_id": { name, height, weight, college, country, draft,
                            seasons: [{year, team, age, gp, min, pts, reb, ast,
                                       stl, blk, tov, fgm, fga, fg_pct, fg3m, fg3a,
                                       fg3_pct, ftm, fta, ft_pct, oreb, dreb, pf,
                                       plus_minus, dd2, td3}] } }
  - /workspace/nba-manager/js/data/nba_players_index.json
      结构: [{ id, name, team, height, weight, draft_year }, ...]  (现役球员索引)
"""
import os
import json
import pandas as pd

DATA_DIR = "/tmp/nba_data/data"
OUT_STATS = "/workspace/nba-manager/js/data/nba_stats.json"
OUT_INDEX = "/workspace/nba-manager/js/data/nba_players_index.json"

def clean(v, default=""):
    """把 pandas 的 NaN/NA 转成 None/default，避免 json.dump 输出非法的 NaN。"""
    if v is None:
        return default
    try:
        if pd.isna(v):
            return default
    except (TypeError, ValueError):
        pass
    return v

def main():
    # 1. 读取 2026 赛季，确定现役球员集合
    df_2026 = pd.read_parquet(os.path.join(DATA_DIR, "players_2026.parquet"))
    active_ids = set(df_2026["player_id"].astype(int).tolist())
    print(f"2026 赛季现役球员: {len(active_ids)} 人")

    info_map = {}
    for _, r in df_2026.iterrows():
        pid = int(r["player_id"])
        info_map[pid] = {
            "name": clean(r.get("player_name", "")),
            "height": clean(r.get("player_height", "")),
            "weight": clean(r.get("player_weight", "")),
            "college": clean(r.get("college", "")),
            "country": clean(r.get("country", "")),
            "draft_year": clean(r.get("draft_year", "")),
            "draft_round": clean(r.get("draft_round", "")),
            "draft_number": clean(r.get("draft_number", "")),
        }

    # 2. 遍历所有赛季 parquet
    all_seasons = {}
    season_files = sorted([f for f in os.listdir(DATA_DIR)
                          if f.startswith("players_") and f.endswith(".parquet")
                          and "playoffs" not in f and "combined" not in f])
    print(f"赛季文件: {len(season_files)} 个")

    for fname in season_files:
        year = int(fname.replace("players_", "").replace(".parquet", ""))
        df = pd.read_parquet(os.path.join(DATA_DIR, fname))
        df = df[df["player_id"].astype(int).isin(active_ids)]
        for _, r in df.iterrows():
            pid = int(r["player_id"])
            season = {
                "year": year,
                "team": r.get("team_abbreviation", ""),
                "age": int(r["age"]) if pd.notna(r.get("age")) else None,
                "gp": int(r["gp"]) if pd.notna(r.get("gp")) else 0,
                "min": round(float(r["min_pergame"]), 1) if pd.notna(r.get("min_pergame")) else 0,
                "pts": round(float(r["pts_pergame"]), 1) if pd.notna(r.get("pts_pergame")) else 0,
                "reb": round(float(r["reb_pergame"]), 1) if pd.notna(r.get("reb_pergame")) else 0,
                "ast": round(float(r["ast_pergame"]), 1) if pd.notna(r.get("ast_pergame")) else 0,
                "stl": round(float(r["stl_pergame"]), 1) if pd.notna(r.get("stl_pergame")) else 0,
                "blk": round(float(r["blk_pergame"]), 1) if pd.notna(r.get("blk_pergame")) else 0,
                "tov": round(float(r["tov_pergame"]), 1) if pd.notna(r.get("tov_pergame")) else 0,
                "fgm": round(float(r["fgm_pergame"]), 1) if pd.notna(r.get("fgm_pergame")) else 0,
                "fga": round(float(r["fga_pergame"]), 1) if pd.notna(r.get("fga_pergame")) else 0,
                "fg_pct": round(float(r["fg_pct"]), 3) if pd.notna(r.get("fg_pct")) else 0,
                "fg3m": round(float(r["fg3m_pergame"]), 1) if pd.notna(r.get("fg3m_pergame")) else 0,
                "fg3a": round(float(r["fg3a_pergame"]), 1) if pd.notna(r.get("fg3a_pergame")) else 0,
                "fg3_pct": round(float(r["fg3_pct"]), 3) if pd.notna(r.get("fg3_pct")) else 0,
                "ftm": round(float(r["ftm_pergame"]), 1) if pd.notna(r.get("ftm_pergame")) else 0,
                "fta": round(float(r["fta_pergame"]), 1) if pd.notna(r.get("fta_pergame")) else 0,
                "ft_pct": round(float(r["ft_pct"]), 3) if pd.notna(r.get("ft_pct")) else 0,
                "oreb": round(float(r["oreb_pergame"]), 1) if pd.notna(r.get("oreb_pergame")) else 0,
                "dreb": round(float(r["dreb_pergame"]), 1) if pd.notna(r.get("dreb_pergame")) else 0,
                "pf": round(float(r["pf_pergame"]), 1) if pd.notna(r.get("pf_pergame")) else 0,
                "plus_minus": round(float(r["plus_minus_pergame"]), 1) if pd.notna(r.get("plus_minus_pergame")) else 0,
                "dd2": int(r["dd2"]) if pd.notna(r.get("dd2")) else 0,
                "td3": int(r["td3"]) if pd.notna(r.get("td3")) else 0,
            }
            all_seasons.setdefault(pid, []).append(season)

    # 3. 合并 + 输出
    stats_obj = {}
    for pid in active_ids:
        info = info_map.get(pid, {})
        seasons = sorted(all_seasons.get(pid, []), key=lambda s: s["year"])
        stats_obj[str(pid)] = {
            "name": info.get("name", ""),
            "height": info.get("height", ""),
            "weight": info.get("weight", ""),
            "college": info.get("college", ""),
            "country": info.get("country", ""),
            "draft_year": info.get("draft_year", ""),
            "draft_round": info.get("draft_round", ""),
            "draft_number": info.get("draft_number", ""),
            "seasons": seasons,
        }

    os.makedirs(os.path.dirname(OUT_STATS), exist_ok=True)
    with open(OUT_STATS, "w", encoding="utf-8") as f:
        json.dump(stats_obj, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_STATS) / 1024
    print(f"已生成 {OUT_STATS} ({size_kb:.1f} KB, {len(stats_obj)} 球员)")

    index = []
    for pid, data in stats_obj.items():
        index.append({
            "id": int(pid),
            "name": data["name"],
            "team": data["seasons"][-1]["team"] if data["seasons"] else "",
            "height": data["height"],
            "weight": data["weight"],
            "draft_year": data["draft_year"],
        })
    index.sort(key=lambda x: x["name"])
    with open(OUT_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"已生成 {OUT_INDEX} ({len(index)} 球员)")

    lb = stats_obj.get("2544", {})
    print(f"\n=== 验证: 勒布朗·詹姆斯 (id=2544) ===")
    print(f"  姓名: {lb.get('name')}")
    print(f"  选秀: {lb.get('draft_year')} 第{lb.get('draft_round')}轮 #{lb.get('draft_number')}")
    print(f"  赛季数: {len(lb.get('seasons', []))}")
    if lb.get("seasons"):
        s = lb["seasons"][-1]
        print(f"  最近赛季 {s['year']} {s['team']}: {s['gp']}场, {s['pts']}分 {s['reb']}板 {s['ast']}助, 命中率{s['fg_pct']*100:.1f}%")

if __name__ == "__main__":
    main()
