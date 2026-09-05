#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成历史赛季数据 js/data/history/history_seasons.json

数据源:
  - Brescou/NBA-dataset-stats-player-team: player_trad_rs.csv (1996-97~2022-23 每场传统数据)
    + player_index.csv (全时代球员档案: 位置/身高/选秀/生涯跨度)
  - llimllib/nba_data: players_{2023..2026}.parquet (2022-23~2025-26 每场数据 + 球员档案)

输出结构 (见 js/engine/history.js):
{
  "v": 2, "first": 1996, "last": 2025,
  "players": { id: [英文名, 中文名|null, 位置, 身高in, 体重lb, 选秀年, 轮, 顺位, 首秀年, 生涯末年] },
  "seasons": { "1996": [[id, team, posIdx, age, o, sal, pot, ins, sh, pa, re, de, at, iq,
                          gp, min, pts, reb, ast, stl, blk, tov], ...] }
}

评分设计（每赛季独立校准）:
  - impact = per36 复合产出 × 出场时间权重 → 赛季内排名 → 锚点映射 o
    （#1≈96, 全明星≈85-92, 首发≈78-84, 轮换≈70-77, 替补≈60-69, 饮水机≈50-59）
  - 各技能 = 原始指标 → 赛季内百分位（de 按位置组内百分位） → 分段映射
  - pot = 该球员"当前赛季及未来"的 o 峰值（真实生涯轨迹）
  - sal = 按 o 分档映射到 2026 工资帽量级（保持游戏内工资帽玩法一致），新秀合同打折
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zh_names import ZH_HIST
from zh_names_extra import compose_zh

import pandas as pd

TRAD_CSV = "/tmp/nba_data/player_trad_rs.csv"
INDEX_CSV = "/tmp/nba_data/player_index.csv"
PARQUET_DIR = "/tmp/nba_data/data"
NAME_MAP_JSON = "/workspace/js/data/name_map.json"
OUT_JS = "/workspace/js/data/history/history_seasons.js"

FIRST_YEAR = 1996   # 1996-97 赛季（state.year 语义）
LLIM_FIRST = 2023   # llimllib parquet 对应 state.year 2023..2025 (players_Y = (Y-1)-Y 赛季)
LLIM_LAST = 2026

CAP = 140.588       # 与游戏 SALARY_CAP 对齐（百万美元）
POS_LIST = ["PG", "SG", "SF", "PF", "C"]

# 赛季预期场次（gp 加成用；缩水赛季归一化）
def season_games(year):
    if year == 1998: return 50   # 1998-99 停摆
    if year == 2011: return 66   # 2011-12 停摆
    if year == 2019: return 67   # 2019-20 新冠
    return 82

def height_to_inches(h):
    if not h or (isinstance(h, float) and math.isnan(h)): return None
    s = str(h).strip()
    if "-" in s:
        try:
            f, i = s.split("-")[:2]
            return int(f) * 12 + int(i)
        except Exception:
            return None
    try:
        return int(float(s))
    except Exception:
        return None

def num(v, default=0.0):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)): return default
        return float(v)
    except Exception:
        return default

def clean_name(v):
    """清理球员名：CSV 中缺失名会读成 'nan Nene' / 'nan' 等脏值"""
    if v is None or (isinstance(v, float) and math.isnan(v)): return ""
    s = str(v).strip()
    if s.lower() == "nan": return ""
    # 前导/尾随的 nan 片段（'nan Nene' → 'Nene'）
    while True:
        low = s.lower()
        if low.startswith("nan ") and not low == "nan ":
            s = s[4:].strip()
        elif low.endswith(" nan"):
            s = s[:-4].strip()
        else:
            break
    return s

# ============================================================
# 1. 加载球员档案（全时代）
# ============================================================
def load_registry():
    reg = {}   # id -> dict
    df = pd.read_csv(INDEX_CSV, low_memory=False)
    for _, r in df.iterrows():
        pid = int(r["PERSON_ID"])
        first = clean_name(r.get("PLAYER_FIRST_NAME", ""))
        last = clean_name(r.get("PLAYER_LAST_NAME", ""))
        name = (first + " " + last).strip()
        h_in = height_to_inches(r.get("HEIGHT"))
        reg[pid] = {
            "name": name,
            "pos_raw": str(r.get("POSITION") or "").strip() or None,
            "h_in": h_in,
            "w_lb": int(num(r.get("WEIGHT"), 0)),
            "draft_year": int(num(r.get("DRAFT_YEAR"), 0)),
            "draft_round": int(num(r.get("DRAFT_ROUND"), 0)),
            "draft_number": int(num(r.get("DRAFT_NUMBER"), 0)),
            "from_year": int(num(r.get("FROM_YEAR"), 0)) or None,
        }
    return reg

# ============================================================
# 2. 加载赛季数据 → {year: [ {id, name, team, age, gp, min, ...per-game stats} ]}
# ============================================================
def load_seasons():
    seasons = {}
    # --- Brescou (1996-97 ~ 2022-23) ---
    df = pd.read_csv(TRAD_CSV, low_memory=False)
    for _, r in df.iterrows():
        season_str = str(r["SEASON"])          # "1996-97"
        year = int(season_str[:4])
        if year < FIRST_YEAR:  # 防御
            continue
        pid = int(r["PLAYER_ID"])
        gp = num(r["GP"])
        # 数据源偶发 gp>82（如被交易球员重复计数）；单赛季硬上限 82
        if gp > 82: gp = 82
        rec = {
            "id": pid,
            "name": clean_name(r["PLAYER_NAME"]),
            "team": str(r["TEAM_ABBREVIATION"]).strip(),
            "age": num(r["AGE"]),
            "gp": gp,
            "min": num(r["MIN"]),
            "pts": num(r["PTS"]), "reb": num(r["REB"]), "oreb": num(r["OREB"]), "dreb": num(r["DREB"]),
            "ast": num(r["AST"]), "stl": num(r["STL"]), "blk": num(r["BLK"]), "tov": num(r["TOV"]),
            "fgm": num(r["FGM"]), "fga": num(r["FGA"]),
            "fg3m": num(r["FG3M"]), "fg3a": num(r["FG3A"]),
            "ftm": num(r["FTM"]), "fta": num(r["FTA"]),
        }
        seasons.setdefault(year, []).append(rec)
    # --- llimllib parquet（state.year 2023~2025；players_YYYY = (YYYY-1)-YYYY 赛季）---
    for py in range(LLIM_FIRST + 1, LLIM_LAST + 1):   # 2024..2026 → state.year 2023..2025
        year = py - 1
        f = os.path.join(PARQUET_DIR, f"players_{py}.parquet")
        if not os.path.exists(f): continue
        pq = pd.read_parquet(f)
        for _, r in pq.iterrows():
            pid = int(r["player_id"])
            gp2 = num(r.get("gp"))
            if gp2 > 82: gp2 = 82  # 单赛季硬上限（同上）
            rec = {
                "id": pid,
                "name": clean_name(r.get("player_name", "")),
                "team": str(r.get("team_abbreviation", "")).strip(),
                "age": num(r.get("age")),
                "gp": gp2,
                "min": num(r.get("min_pergame")),
                "pts": num(r.get("pts_pergame")), "reb": num(r.get("reb_pergame")),
                "oreb": num(r.get("oreb_pergame")), "dreb": num(r.get("dreb_pergame")),
                "ast": num(r.get("ast_pergame")), "stl": num(r.get("stl_pergame")),
                "blk": num(r.get("blk_pergame")), "tov": num(r.get("tov_pergame")),
                "fgm": num(r.get("fgm_pergame")), "fga": num(r.get("fga_pergame")),
                "fg3m": num(r.get("fg3m_pergame")), "fg3a": num(r.get("fg3a_pergame")),
                "ftm": num(r.get("ftm_pergame")), "fta": num(r.get("fta_pergame")),
                # llimllib 自带档案字段（补 registry 缺失的 2023+ 新秀）
                "_meta": {
                    "h": str(r.get("player_height", "") or ""),
                    "w": int(num(r.get("player_weight"), 0)),
                    "dy": int(num(r.get("draft_year"), 0)),
                    "dr": int(num(r.get("draft_round"), 0)),
                    "dn": int(num(r.get("draft_number"), 0)),
                },
            }
            seasons.setdefault(year, []).append(rec)
    return seasons

# ============================================================
# 3. 位置推导（index POSITION 优先 + 身高/数据启发式）
# ============================================================
def derive_position(pos_raw, h_in, ast36, reb36, blk36):
    # 先粗分为 G / F / C
    if pos_raw in ("G", "G-F", "F-G"):
        group = "G"
    elif pos_raw in ("C", "C-F", "F-C"):
        # F-C 偏向 C 的情况：身高 6-10+ 或篮板/盖帽高
        if pos_raw == "F-C":
            group = "C" if (h_in or 78) >= 81 or (reb36 or 0) >= 8 else "F"
        else:
            group = "C"
    elif pos_raw == "F":
        group = "F"
    else:
        # 无档案：纯启发式
        if (h_in or 77) >= 82: group = "C"
        elif (h_in or 77) >= 79: group = "F"
        else: group = "G"
    # 细分
    if group == "G":
        return "PG" if (ast36 or 0) >= 5.5 else "SG"
    if group == "F":
        # 高个/高板 → PF，否则 SF
        if (h_in or 78) >= 81 or (reb36 or 0) >= 8.5: return "PF"
        return "SF"
    return "C"

# ============================================================
# 4. 评分引擎
# ============================================================
def percentile_rank(sorted_vals, x):
    """x 在升序列表中的百分位 0..1"""
    import bisect
    return bisect.bisect_left(sorted_vals, x) / max(1, len(sorted_vals))

def map_pct(pct, lo, hi, curve=1.0):
    return lo + (hi - lo) * (pct ** curve)

def o_from_rank(rank, pool_size):
    """赛季内 impact 排名 → 总评锚点（rank 0 = impact 最高 = 最强）"""
    pct = rank / max(1, pool_size - 1)   # rank 0 → pct 0 → 最高锚点
    # 分段锚点（连续插值）:
    #   top1≈96.5, top2-4≈93-95.5, top5-10≈89-92.5, top11-25≈85-88.5,
    #   top26-60≈79-84.5, top61-150≈71-78.5, top151-300≈62-70.5, rest≈52-61.5
    anchors = [
        (0.000, 96.5), (0.004, 95.0), (0.010, 93.0), (0.022, 90.5),
        (0.055, 87.5), (0.120, 84.0), (0.300, 78.5), (0.600, 70.5),
        (1.000, 55.0),
    ]
    if pct <= anchors[0][0]: return anchors[0][1]
    for i in range(len(anchors) - 1):
        p0, v0 = anchors[i]; p1, v1 = anchors[i + 1]
        if pct <= p1:
            t = (pct - p0) / (p1 - p0)
            return v0 + (v1 - v0) * t
    return anchors[-1][1]

def compute_ratings(seasons):
    """每个赛季独立校准，返回 {year: {pid: ratings dict}}"""
    all_ratings = {}
    for year in sorted(seasons.keys()):
        rows = seasons[year]
        # 过滤极小样本（出场记录存在但几乎没打）
        usable = [r for r in rows if r["min"] > 0 and r["gp"] >= 1]
        # per36 计算
        def per36(r, key):
            m = max(r["min"], 0.1)
            return r[key] * 36.0 / m
        enriched = []
        for r in usable:
            e = dict(r)
            e["min_pg"] = r["min"]
            for k in ("pts","reb","oreb","dreb","ast","stl","blk","tov","fgm","fga","fg3m","fg3a","ftm","fta"):
                e[k + "36"] = per36(r, k)
            e["fg2a36"] = e["fga36"] - e["fg3a36"]
            e["fg2m36"] = e["fgm36"] - e["fg3m36"]
            e["fg2pct"] = (e["fg2m36"] / e["fg2a36"]) if e["fg2a36"] > 1 else 0.45
            e["fg3pct"] = (e["fg3m36"] / e["fg3a36"]) if e["fg3a36"] > 0.8 else 0.0
            e["ftpct"] = (e["ftm36"] / e["fta36"]) if e["fta36"] > 0.8 else 0.0
            enriched.append(e)

        # ---- impact（→ o 排名）----
        sg = season_games(year)
        def impact(e):
            v = (e["pts36"]
                 - 0.50 * (e["fga36"] - e["fgm36"])
                 - 0.35 * (e["fta36"] - e["ftm36"])
                 + 0.75 * e["reb36"] + 1.1 * e["ast36"]
                 + 1.8 * e["stl36"] + 2.0 * e["blk36"]
                 - 0.9 * e["tov36"])
            minutes_w = 0.55 + 0.45 * min(e["min_pg"], 36.0) / 36.0
            gp_w = min(e["gp"], sg) / sg
            return v * minutes_w + 2.2 * gp_w
        for e in enriched:
            e["_impact"] = impact(e)
        enriched.sort(key=lambda e: -e["_impact"])

        # 技能池（稳定性过滤: ≥6 分钟 & ≥15 场——不足者最后压缩处理）
        pool = [e for e in enriched if e["min_pg"] >= 6 and e["gp"] >= 15] or enriched
        pool_sorted = {
            "sh":  sorted(pool, key=lambda e: (e["fg3a36"] * e["fg3pct"] * 4.5 + e["fta36"] * e["ftpct"] * 0.9 + e["fg2a36"] * e["fg2pct"] * 1.1)),
            "pa":  sorted(pool, key=lambda e: e["ast36"] * (1 + 0.22 * min(1.6, e["ast36"] / max(0.8, e["tov36"])))),
            "re":  sorted(pool, key=lambda e: e["reb36"] + 0.3 * e["oreb36"]),
            "ins": sorted(pool, key=lambda e: e["fg2a36"] * e["fg2pct"] * 1.5 + e["oreb36"] * 2.0 + e["blk36"] * 0.8),
            "at":  sorted(pool, key=lambda e: (e["fta36"] / 8.0) * 30 + e["blk36"] * 8 + e["oreb36"] * 6 + (e["fg2pct"] - 0.48) * 120 + e["fga36"] * 1.2),
            "iq":  sorted(pool, key=lambda e: ((e["ast36"] + 2) / (e["tov36"] + 2)) * 12 + e["ftpct"] * 30 + min(15, e["gp"] * 0.18)),
        }
        vals = {k: [ ( (r["fg3a36"]*r["fg3pct"]*4.5 + r["fta36"]*r["ftpct"]*0.9 + r["fg2a36"]*r["fg2pct"]*1.1) if k=="sh" else
                      (r["ast36"]*(1+0.22*min(1.6, r["ast36"]/max(0.8,r["tov36"])))) if k=="pa" else
                      (r["reb36"]+0.3*r["oreb36"]) if k=="re" else
                      (r["fg2a36"]*r["fg2pct"]*1.5 + r["oreb36"]*2.0 + r["blk36"]*0.8) if k=="ins" else
                      ((r["fta36"]/8.0)*30 + r["blk36"]*8 + r["oreb36"]*6 + (r["fg2pct"]-0.48)*120 + r["fga36"]*1.2) if k=="at" else
                      (((r["ast36"]+2)/(r["tov36"]+2))*12 + r["ftpct"]*30 + min(15, r["gp"]*0.18)) )
                    for r in pool_sorted[k]] for k in pool_sorted}
        # de: 位置组内百分位
        def de_raw(r): return r["stl36"] * 2.2 + r["blk36"] * 2.2 + r["dreb36"] * 0.35
        pos_groups = {"G": [], "F": [], "C": []}
        for r in pool:
            g = "G" if r["_pos"][0] in ("P", "S") else ("C" if r["_pos"] == "C" else "F")
            pos_groups[g].append(de_raw(r))
        for g in pos_groups: pos_groups[g].sort()

        # 主循环评分
        n = len(enriched)
        ratings = {}
        for rank, e in enumerate(enriched):
            o = o_from_rank(rank, n)
            # 低出场时间球员压缩
            if e["min_pg"] < 8:
                o = min(o, 64 + e["min_pg"])     # <8 分钟最多 64+
            elif e["min_pg"] < 12:
                o = min(o, 72)
            elif e["gp"] < 15:
                o = min(o, 76)
            o = max(50, min(97, round(o)))

            pct_sh  = percentile_rank(vals["sh"],  (e["fg3a36"]*e["fg3pct"]*4.5 + e["fta36"]*e["ftpct"]*0.9 + e["fg2a36"]*e["fg2pct"]*1.1))
            pct_pa  = percentile_rank(vals["pa"],  e["ast36"]*(1+0.22*min(1.6, e["ast36"]/max(0.8,e["tov36"]))))
            pct_re  = percentile_rank(vals["re"],  e["reb36"]+0.3*e["oreb36"])
            pct_ins = percentile_rank(vals["ins"], e["fg2a36"]*e["fg2pct"]*1.5 + e["oreb36"]*2.0 + e["blk36"]*0.8)
            pct_at  = percentile_rank(vals["at"],  (e["fta36"]/8.0)*30 + e["blk36"]*8 + e["oreb36"]*6 + (e["fg2pct"]-0.48)*120 + e["fga36"]*1.2)
            pct_iq  = percentile_rank(vals["iq"],  ((e["ast36"]+2)/(e["tov36"]+2))*12 + e["ftpct"]*30 + min(15, e["gp"]*0.18))
            pg = "G" if e["_pos"][0] in ("P", "S") else ("C" if e["_pos"] == "C" else "F")
            pct_de  = percentile_rank(pos_groups[pg], de_raw(e))

            # 年龄微调: 运动能力年轻加成/高龄衰减; iq 随年龄成熟
            age = e["age"] if e["age"] > 0 else 26
            at_age = 1.10 if age <= 22 else (1.05 if age <= 26 else (0.97 if age <= 30 else (0.92 if age <= 33 else 0.86)))
            iq_age = 1.08 if 27 <= age <= 34 else (1.0 if age >= 23 else 0.92)

            sh  = round(map_pct(pct_sh,  40, 99, 0.80))
            pa  = round(map_pct(pct_pa,  38, 99, 0.80))
            re  = round(map_pct(pct_re,  38, 99, 0.80))
            ins = round(map_pct(pct_ins, 38, 99, 0.80))
            de  = round(map_pct(pct_de,  42, 97, 0.85))
            at  = round(min(98, map_pct(pct_at, 45, 96, 0.80) * at_age))
            iq  = round(min(99, map_pct(pct_iq, 42, 96, 0.80) * iq_age))

            ratings[e["id"]] = {
                "name": e["name"], "team": e["team"], "age": age, "o": o,
                "ins": ins, "sh": sh, "pa": pa, "re": re, "de": de, "at": at, "iq": iq,
                "min_pg": e["min_pg"], "gp": e["gp"],
                # 场均数据（供游戏内 MIP 评选预填 / 生涯数据展示）
                "pts": e["pts"], "reb": e["reb"], "ast": e["ast"],
                "stl": e["stl"], "blk": e["blk"], "tov": e["tov"],
            }
        all_ratings[year] = ratings
    return all_ratings

# ============================================================
# 5. 薪资（2026 工资帽量级）
# ============================================================
def salary_from_o(o):
    if o >= 93:  return 52 + (o - 93) * 4
    if o >= 90:  return 42 + (o - 90) * 3.3
    if o >= 87:  return 33 + (o - 87) * 3.0
    if o >= 84:  return 26 + (o - 84) * 2.3
    if o >= 81:  return 20 + (o - 81) * 2.0
    if o >= 78:  return 15 + (o - 78) * 1.7
    if o >= 75:  return 11 + (o - 75) * 1.3
    if o >= 72:  return 8 + (o - 72) * 1.0
    if o >= 69:  return 6 + (o - 69) * 0.7
    if o >= 66:  return 4 + (o - 66) * 0.7
    return max(1.2, 2 + o * 0.02)

# ============================================================
# 6. 主流程
# ============================================================
def main():
    reg = load_registry()
    seasons = load_seasons()

    # 位置推导需要 ast36/reb36 → 在评分前先算 per36 并挂 _pos
    for year, rows in seasons.items():
        for r in rows:
            m = max(r["min"], 0.1)
            ast36 = r["ast"] * 36 / m
            reb36 = r["reb"] * 36 / m
            blk36 = r["blk"] * 36 / m
            info = reg.get(r["id"])
            h_in = info["h_in"] if info and info.get("h_in") else None
            pos_raw = info.get("pos_raw") if info else None
            r["_pos"] = derive_position(pos_raw, h_in, ast36, reb36, blk36)
            # llimllib 档案回填（2023+ 新秀不在 index）
            if not info and r.get("_meta"):
                mt = r["_meta"]
                reg[r["id"]] = {
                    "name": r["name"], "pos_raw": None,
                    "h_in": height_to_inches(mt["h"]), "w_lb": mt["w"],
                    "draft_year": mt["dy"], "draft_round": mt["dr"], "draft_number": mt["dn"],
                    "from_year": None,
                }
            elif info and not info.get("h_in") and r.get("_meta"):
                info["h_in"] = height_to_inches(r["_meta"]["h"]) or info.get("h_in")

    ratings = compute_ratings(seasons)

    # 中文名: name_map(id→zh) 优先，其次 ZH_HIST(英文名)
    id2zh = {}
    with open(NAME_MAP_JSON) as f:
        for zh, pid in json.load(f).items():
            if pid is None: continue
            id2zh[int(pid)] = zh

    # from_year / last_year 从数据推导（index TO_YEAR 快照过旧不可靠）
    from_year, last_year = {}, {}
    name_by_id = {}
    for year in sorted(seasons):
        for r in seasons[year]:
            pid = r["id"]
            name_by_id[pid] = r["name"]
            if pid not in from_year or year < from_year[pid]: from_year[pid] = year
            if pid not in last_year or year > last_year[pid]: last_year[pid] = year

    # 每球员生涯 o 轨迹 → pot（当前及未来峰值）
    career_o = {}
    for year, rt in ratings.items():
        for pid, d in rt.items():
            career_o.setdefault(pid, []).append((year, d["o"]))

    # 构建 registry 输出
    players_out = {}
    for pid, fy in from_year.items():
        info = reg.get(pid, {})
        name = info.get("name") or name_by_id.get(pid, "")
        # 中文名: name_map(id→zh) → ZH_HIST(英文名) → compose_zh(名/姓组件组合)
        zh = id2zh.get(pid) or ZH_HIST.get(name) or compose_zh(name)
        fy_final = info.get("from_year") or fy
        # index 的 from_year 可能比数据早（生涯早于1996），取 info 优先
        ly = last_year[pid]
        dr = info.get("draft_round", 0) or 0
        dn = info.get("draft_number", 0) or 0
        dy = info.get("draft_year", 0) or 0
        # 落选/未选秀清理：dy=0 或 dr/dn 无效 → 0
        if not dy or dy < 1946 or not dr or not dn: dy, dr, dn = 0, 0, 0
        players_out[str(pid)] = [
            name, zh, info.get("pos_raw") or "", info.get("h_in") or 0, info.get("w_lb") or 0,
            dy, dr, dn, fy_final, ly,
        ]

    # 构建 seasons 输出（含薪资 + pot）
    seasons_out = {}
    for year in sorted(ratings):
        rows = []
        rt = ratings[year]
        # 团队薪资归一：目标 0.86~1.04 × cap
        team_groups = {}
        for pid, d in rt.items():
            team_groups.setdefault(d["team"], []).append((pid, d))
        team_scale = {}
        for team, members in team_groups.items():
            total = 0.0
            for pid, d in members:
                fy = from_year[pid]
                yrs = year - fy
                s = salary_from_o(d["o"])
                if yrs <= 3: s *= 0.42 + 0.13 * yrs    # 新秀合同 42%-81%
                elif yrs == 4: s *= 0.85
                total += s
            # 目标 payroll 按团队实力（强队花得多）：用平均 o 排名
            avg_o = sum(d["o"] for _, d in members) / len(members)
            team_scale[team] = (avg_o, total)
        sorted_teams = sorted(team_scale.items(), key=lambda kv: -kv[1][0])
        scale_map = {}
        for i, (team, (avg_o, total)) in enumerate(sorted_teams):
            pct = i / max(1, len(sorted_teams) - 1)      # 0=最强
            target = CAP * (1.045 - 0.13 * pct)          # 1.045 ~ 0.915
            scale_map[team] = min(1.35, max(0.55, target / total)) if total > 0 else 1.0

        for pid, d in rt.items():
            fy = from_year[pid]
            yrs = year - fy
            s = salary_from_o(d["o"])
            if yrs <= 3: s *= 0.42 + 0.13 * yrs
            elif yrs == 4: s *= 0.85
            s *= scale_map.get(d["team"], 1.0)
            s = round(max(0.8, min(68, s)), 1)
            # pot = 未来（含当前）峰值
            fut = [o for (y, o) in career_o.get(pid, []) if y >= year]
            pot = max(fut) if fut else d["o"]
            pot = max(pot, d["o"])
            # 老将衰退期 pot 不虚高：若球员已过 31 岁且历史峰值远高于当前，取当前+2 封顶
            if d["age"] >= 32 and pot > d["o"] + 3:
                pot = d["o"] + 2
            info = reg.get(pid, {})
            pos = None
            # 位置用当季推导
            for r in seasons[year]:
                if r["id"] == pid: pos = r["_pos"]; break
            pos_idx = POS_LIST.index(pos) if pos in POS_LIST else 2
            r1 = lambda v: round(float(v), 1)
            rows.append([
                pid, d["team"], pos_idx, int(d["age"]), d["o"], s, int(pot),
                d["ins"], d["sh"], d["pa"], d["re"], d["de"], d["at"], d["iq"],
                int(d["gp"]), r1(d["min_pg"]), r1(d["pts"]), r1(d["reb"]), r1(d["ast"]),
                r1(d["stl"]), r1(d["blk"]), r1(d["tov"]),
            ])
        seasons_out[str(year)] = rows

    out = {
        "v": 2,
        "first": FIRST_YEAR,
        "last": max(int(y) for y in seasons_out),
        "players": players_out,
        "seasons": seasons_out,
    }
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 历史赛季数据（1996-97 ~ 2025-26 真实球员名单/评分/场均数据）\n")
        f.write("// 由 scripts/gen_history.py 生成，请勿手改。结构见 js/engine/history.js\n")
        f.write("window.HISTORY_DATA = " + payload + ";\n")
    size_mb = os.path.getsize(OUT_JS) / 1024 / 1024
    total_rows = sum(len(v) for v in seasons_out.values())
    zh_count = sum(1 for v in players_out.values() if v[1])
    print(f"生成 {OUT_JS}: {size_mb:.2f} MB, {len(players_out)} 球员, {len(seasons_out)} 赛季, {total_rows} 行, {zh_count} 中文名")

    # ===== 校验输出 =====
    print("\n===== 校验：传奇球员总评 =====")
    checks = [
        (2544, 2015, "勒布朗 2015-16"), (201939, 2015, "库里 2015-16"),
        (2544, 2009, "勒布朗 2009-10"), (893, 1996, "乔丹 1996-97"),
        (1495, 1997, "邓肯 1997-98"),
        (977, 2005, "科比 2005-06"), (2544, 2012, "勒布朗 2012-13"),
        (1628983, 2024, "SGA 2024-25"), (1641705, 2023, "文班 2023-24"),
        (203999, 2024, "约基奇 2024-25"), (406, 1996, "奥尼尔 1996-97"),
    ]
    for pid, year, label in checks:
        r = ratings.get(year, {}).get(pid)
        if r:
            print(f"  {label}: o={r['o']} ({r['name']}, {r['team']}, {r['age']}岁)")
        else:
            # 从 players_out 找名字
            nm = players_out.get(str(pid), ["?"])[0]
            print(f"  {label}: 未找到 (id={pid}, name={nm})")

    # 顶部球员分布
    print("\n===== 2015-16 Top 12 =====")
    top = sorted(ratings[2015].items(), key=lambda kv: -kv[1]["o"])[:12]
    for pid, d in top:
        zh = id2zh.get(pid) or ZH_HIST.get(d["name"]) or ""
        print(f"  {d['o']} {zh or d['name']} ({d['team']})")

if __name__ == "__main__":
    main()
