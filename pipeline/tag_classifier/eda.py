"""Báo cáo dữ liệu (EDA) sau bước 1: reports/01-data/report.md + figures/*.png.

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.eda

Đọc snapshot, data/courses.jsonl, logs/preprocess.csv, data/preprocess_summary.json. Mỗi biểu đồ
có bảng số đi kèm trong report.md (màu không phải cách duy nhất để đọc số).
"""

from __future__ import annotations

import csv
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt

from tag_classifier import charts
from tag_classifier.charts import AQUA, BLUE, ORANGE, SURFACE, TEXT_2, md_table, pct, style
from tag_classifier.common import TOPIC_SECTIONS, load_config, read_json, read_jsonl, resolve, utf8_stdout
from tag_classifier.structure import elective_codes

OUT = resolve("reports/01-data")


def save(fig: plt.Figure, name: str) -> str:
    return charts.save(fig, OUT, name)


# ---------------------------------------------------------------------------------------------

def load() -> dict[str, Any]:
    cfg = load_config()
    p = cfg["paths"]
    snap = resolve(p["snapshot_dir"])
    with open(resolve(p["preprocess_log"]), encoding="utf-8-sig") as f:
        log = list(csv.DictReader(f))
    return {
        "cfg": cfg,
        "curricula": read_json(snap / "curricula.json"),
        "manifest": read_json(snap / "manifest.json"),
        "records": list(read_jsonl(resolve(p["courses_file"]))),
        "log": log,
        "summary": read_json(resolve(p["preprocess_summary"])),
    }


def fig_faculty(summary: dict[str, Any]) -> tuple[str, str]:
    fac = sorted(summary["per_faculty"].items(), key=lambda kv: kv[1]["courses"])
    names = [k for k, _ in fac]
    clean = [v.get("usable", 0) - v.get("usable_flagged", 0) for _, v in fac]
    flagged = [v.get("usable_flagged", 0) for _, v in fac]
    none = [v.get("no_syllabus", 0) + v.get("unusable", 0) for _, v in fac]
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    y = range(len(names))
    kw = dict(height=0.62, edgecolor=SURFACE, linewidth=2)
    ax.barh(y, clean, color=BLUE, label="Có đề cương dùng được", **kw)
    ax.barh(y, flagged, left=clean, color=AQUA, label="Dùng được, có cờ trùng lặp", **kw)
    left = [a + b for a, b in zip(clean, flagged)]
    ax.barh(y, none, left=left, color=ORANGE, label="Không có đề cương", **kw)
    for i, v in enumerate(fac):
        tot = v[1]["courses"]
        ax.text(tot + 3, i, f"{pct(v[1].get('usable', 0), tot)} dùng được", va="center", color=TEXT_2, fontsize=8)
    ax.set_yticks(list(y), names)
    ax.set_xlabel("Số môn (một môn thuộc nhiều khoa thì tính ở mỗi khoa)")
    ax.set_title("Đề cương theo khoa")
    ax.grid(axis="y", visible=False)
    ax.set_xlim(0, max(v["courses"] for _, v in fac) * 1.22)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.02), ncol=3, fontsize=8)
    ax.set_title("Đề cương theo khoa", pad=24)
    rows = [[k, v["courses"], v.get("usable", 0), v.get("usable_flagged", 0), v.get("no_syllabus", 0),
             pct(v.get("usable", 0), v["courses"])] for k, v in reversed(fac)]
    table = md_table(["Khoa", "Môn", "Dùng được", "…có cờ trùng", "Không đề cương", "Tỉ lệ dùng được"], rows)
    return save(fig, "01-faculty.png"), table


def curriculum_coverage(curricula: list[dict[str, Any]], usable: set[str]) -> list[dict[str, Any]]:
    out = []
    for c in curricula:
        electives = elective_codes(c)
        out.append({
            "code": c["code"], "faculty": c["faculty"], "courses": len(c["courses"]),
            "usable": sum(x in usable for x in c["courses"]),
            "electives": len(electives), "electives_usable": sum(x in usable for x in electives),
        })
    return out


def fig_coverage(cov: list[dict[str, Any]]) -> tuple[str, str]:
    allc = [100 * c["usable"] / c["courses"] for c in cov if c["courses"]]
    elec = [100 * c["electives_usable"] / c["electives"] for c in cov if c["electives"]]
    bins = list(range(0, 105, 5))
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.2), sharey=True)
    for ax, data, color, title in ((axes[0], allc, BLUE, "Mọi môn của chương trình"),
                                   (axes[1], elec, AQUA, "Môn tự chọn của chương trình")):
        ax.hist(data, bins=bins, color=color, edgecolor=SURFACE, linewidth=2)
        med = statistics.median(data)
        ax.axvline(med, color=TEXT_2, linewidth=1, linestyle="--")
        ax.text(med - 1, ax.get_ylim()[1] * 0.92, f"trung vị {med:.0f}%", ha="right", color=TEXT_2, fontsize=8)
        ax.set_title(title)
        ax.set_xlabel("% môn có đề cương dùng được")
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("Số chương trình")
    fig.suptitle("Độ phủ đề cương trong từng chương trình", x=0.01, ha="left", fontweight="bold", fontsize=10)

    def q(xs: list[float]) -> list[str]:
        qs = statistics.quantiles(xs, n=4)
        return [f"{min(xs):.0f}%", f"{qs[0]:.0f}%", f"{statistics.median(xs):.0f}%", f"{qs[2]:.0f}%", f"{max(xs):.0f}%"]
    table = md_table(["Phạm vi", "Số chương trình", "Nhỏ nhất", "Q1", "Trung vị", "Q3", "Lớn nhất"],
                     [["Mọi môn", len(allc), *q(allc)], ["Môn tự chọn", len(elec), *q(elec)]])
    return save(fig, "02-curriculum-coverage.png"), table


def fig_length(usable: list[dict[str, Any]]) -> tuple[str, str]:
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.0), sharey=True)
    rows = []
    for ax, lang, color, title in ((axes[0], "en", BLUE, "Tiếng Anh"), (axes[1], "vi", ORANGE, "Tiếng Việt")):
        xs = [r["topic_chars"][lang] for r in usable if r["topic_chars"][lang] > 0]
        edges = [10 ** (2 + i * 0.1) for i in range(26)]  # 100 .. 31.6k ký tự, thang log
        ax.hist(xs, bins=edges, color=color, edgecolor=SURFACE, linewidth=1.5)
        ax.set_xscale("log")
        ax.axvline(200, color=TEXT_2, linewidth=1, linestyle="--")
        ax.text(215, ax.get_ylim()[1] * 0.9, "ngưỡng dùng được 200", color=TEXT_2, fontsize=8)
        ax.set_title(title)
        ax.set_xlabel("Số ký tự phần nội dung (thang log)")
        ax.grid(axis="x", visible=False)
        qs = statistics.quantiles(xs, n=4)
        rows.append([title, len(xs), min(xs), round(qs[0]), round(statistics.median(xs)), round(qs[2]), max(xs)])
    axes[0].set_ylabel("Số môn")
    fig.suptitle("Độ dài phần nội dung sau khi làm sạch", x=0.01, ha="left", fontweight="bold", fontsize=10)
    table = md_table(["Ngôn ngữ", "Môn có chữ", "Nhỏ nhất", "Q1", "Trung vị", "Q3", "Lớn nhất"], rows)
    return save(fig, "03-text-length.png"), table


def section_table(usable: list[dict[str, Any]]) -> str:
    """Bảng thay biểu đồ: mọi phần đều có ở 99-100% môn, biểu đồ không cho thêm gì."""
    n = len(usable)
    share = {lang: [sum(lang in r["available"][s] for r in usable) for s in TOPIC_SECTIONS] for lang in ("en", "vi")}
    rows = [[s, f"{share['en'][i]} ({pct(share['en'][i], n)})", f"{share['vi'][i]} ({pct(share['vi'][i], n)})"]
            for i, s in enumerate(TOPIC_SECTIONS)]
    return md_table(["Phần", "Có tiếng Anh", "Có tiếng Việt"], rows)


def fig_sessions(usable: list[dict[str, Any]]) -> tuple[str, str]:
    counts = [max(len(r["sections"]["sessions"].get(l, [])) for l in ("en", "vi")) for r in usable]
    fig, ax = plt.subplots(figsize=(7, 2.8))
    top = max(counts)
    ax.hist(counts, bins=range(0, top + 2), color=BLUE, edgecolor=SURFACE, linewidth=1.5, align="left")
    ax.set_xlabel("Số buổi / chương còn lại sau khi bỏ placeholder")
    ax.set_ylabel("Số môn")
    ax.set_title("Số buổi học mỗi đề cương")
    ax.grid(axis="x", visible=False)
    c = Counter(counts)
    qs = statistics.quantiles(counts, n=4)
    table = md_table(["Không còn buổi nào", "Q1", "Trung vị", "Q3", "Nhiều nhất"],
                     [[c.get(0, 0), round(qs[0]), round(statistics.median(counts)), round(qs[2]), top]])
    return save(fig, "04-sessions.png"), table


RULE_LABEL = {
    "en_is_vi": "Dòng tiếng Việt trong ô en", "vi_is_en": "Dòng tiếng Anh trong ô vi",
    "placeholder": "Buổi/dòng placeholder", "boilerplate": "Dòng thủ tục", "multiple_versions": "Phiên bản cũ bỏ",
    "no_syllabus": "Môn không có đề cương", "copied_summary": "Tóm tắt chép môn khác",
    "identical_content": "Nội dung giống hệt môn khác", "unusable": "Đề cương không dùng được",
}


def fig_rules(log: list[dict[str, str]]) -> tuple[str, str]:
    rules = Counter(r["rule"] for r in log)
    courses = defaultdict(set)
    for r in log:
        courses[r["rule"]].add(r["course_code"])
    items = sorted(rules.items(), key=lambda kv: kv[1])
    fig, ax = plt.subplots(figsize=(7, 3.2))
    y = range(len(items))
    ax.barh(y, [v for _, v in items], height=0.6, color=BLUE)
    for i, (k, v) in enumerate(items):
        ax.text(v * 1.02 + 5, i, f"{v}", va="center", fontsize=8, color=TEXT_2)
    ax.set_yticks(list(y), [RULE_LABEL.get(k, k) for k, _ in items])
    ax.set_xlabel("Số dòng log")
    ax.set_title("Thay đổi của bước tiền xử lý, theo quy tắc")
    ax.grid(axis="y", visible=False)
    ax.set_xlim(0, max(rules.values()) * 1.15)
    rows = [[f"`{k}`", RULE_LABEL.get(k, ""), v, len(courses[k])] for k, v in sorted(rules.items(), key=lambda kv: -kv[1])]
    return save(fig, "05-rules.png"), md_table(["Quy tắc", "Nghĩa", "Dòng log", "Số môn"], rows)


def lang_by_section(log: list[dict[str, str]]) -> str:
    c: dict[str, Counter] = defaultdict(Counter)
    for r in log:
        if r["rule"] in ("en_is_vi", "vi_is_en"):
            c[r["section"]][r["rule"]] += 1
    rows = [[s, v.get("en_is_vi", 0), v.get("vi_is_en", 0)] for s, v in sorted(c.items(), key=lambda kv: -sum(kv[1].values()))]
    return md_table(["Phần", "`en_is_vi`", "`vi_is_en`"], rows)


def sources(curricula: list[dict[str, Any]]) -> str:
    n = len(curricula)
    prof = {f: {l: 0 for l in ("en", "vi")} for f in ("overview", "career_opportunities")}
    lens: dict[str, list[int]] = defaultdict(list)
    for c in curricula:
        for f in prof:
            for l in ("en", "vi"):
                t = ((c.get("profile") or {}).get(l) or {}).get(f)
                if t:
                    prof[f][l] += 1
                    lens[f"{f}-{l}"].append(len(t))
    specs = [len(c["specializations"]) for c in curricula]
    with_specs = sum(1 for s in specs if s)
    kinds = Counter(g["kind"] for c in curricula for g in c["groups"])
    rows = [
        ["Chương trình", n, ""],
        ["Có `profile.overview` (en / vi)", f"{prof['overview']['en']} / {prof['overview']['vi']}",
         f"trung vị {statistics.median(lens['overview-en']):.0f} ký tự (en)"],
        ["Có `profile.career_opportunities` (en / vi)",
         f"{prof['career_opportunities']['en']} / {prof['career_opportunities']['vi']}",
         f"trung vị {statistics.median(lens['career_opportunities-en']):.0f} ký tự (en)"],
        ["Có chuyên ngành", with_specs, f"{sum(specs)} chuyên ngành; chỉ có mã + tên tiếng Việt"],
        ["Khối môn theo loại", ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())), "tên khối chỉ có tiếng Việt"],
    ]
    return md_table(["Nguồn tag ứng viên", "Số", "Ghi chú"], rows)


def merge_groups(groups: list[list[str]]) -> list[tuple[str, ...]]:
    """Gộp các nhóm có chung phần tử (A~B và B~C -> A~B~C)."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for g in groups:
        for x in g[1:]:
            parent[find(x)] = find(g[0])
    out: dict[str, list[str]] = defaultdict(list)
    for x in list(parent):
        out[find(x)].append(x)
    return sorted(tuple(sorted(v)) for v in out.values())


def write_report(d: dict[str, Any]) -> Path:
    style()
    records, log, summary, curricula = d["records"], d["log"], d["summary"], d["curricula"]
    usable = [r for r in records if r["usable"]]
    usable_codes = {r["code"] for r in usable}
    cov = curriculum_coverage(curricula, usable_codes)
    m = d["manifest"]["counts"]

    f1, t1 = fig_faculty(summary)
    f2, t2 = fig_coverage(cov)
    f3, t3 = fig_length(usable)
    t4 = section_table(usable)
    f5, t5 = fig_sessions(usable)
    f6, t6 = fig_rules(log)

    flags = summary["flags"]
    lowest = sorted((c for c in cov if c["courses"]), key=lambda c: c["usable"] / c["courses"])[:8]
    identical = sorted({tuple(sorted([r["code"], *r.get("identical_with", [])])) for r in records if r.get("identical_with")})
    copied = merge_groups([[r["code"], *r.get("summary_same_as", [])] for r in records if r.get("summary_same_as")])
    placeholder = Counter(r["detail"].lower().rstrip(".") for r in log if r["rule"] == "placeholder")
    repeated = summary["repeated_lines"][:15]
    lang = summary["usable_by_language"]

    lines = [
        "# Báo cáo dữ liệu sau bước 1 (trích + tiền xử lý)",
        "",
        f"Snapshot trích lúc {d['manifest']['extracted_at']}. Sinh bằng `python -m tag_classifier.eda`; "
        "mọi số trong file này tính lại từ `data/` mỗi lần chạy.",
        "",
        "## 1. Tổng quan",
        "",
        md_table(["", "Số"], [
            ["Chương trình", m["curricula"]],
            ["Môn có trong ít nhất một chương trình", summary["courses"]],
            ["Phiên bản đề cương / môn có đề cương", f"{m['outlines']} / {m['outline_codes']}"],
            ["Môn có đề cương dùng được", f"{summary['usable']} ({pct(summary['usable'], summary['courses'])})"],
            ["… đủ hai ngôn ngữ / chỉ tiếng Anh / chỉ tiếng Việt", f"{lang['both']} / {lang['en_only']} / {lang['vi_only']}"],
            ["Môn không có đề cương", flags.get("no_syllabus", 0)],
            ["Môn có cờ `copied_summary` / `identical_content`",
             f"{flags.get('copied_summary', 0)} / {flags.get('identical_content', 0)}"],
        ]),
        "",
        "Mọi môn có đề cương đều qua ngưỡng dùng được (200 ký tự phần nội dung). Thiếu dữ liệu nằm ở "
        "**môn không có đề cương**, không ở đề cương quá ngắn.",
        "",
        "## 2. Đề cương theo khoa",
        "",
        f"![Đề cương theo khoa]({f1})",
        "",
        t1,
        "",
        "## 3. Độ phủ trong từng chương trình",
        "",
        "Tag được xét trong từng chương trình, nên điều cần biết là mỗi chương trình có bao nhiêu môn "
        "có đề cương, nhất là môn tự chọn (tag chỉ ảnh hưởng môn tự chọn trong engine ASP).",
        "",
        f"![Độ phủ đề cương trong từng chương trình]({f2})",
        "",
        t2,
        "",
        "Các chương trình có độ phủ thấp nhất:",
        "",
        md_table(["Chương trình", "Khoa", "Môn", "Dùng được", "Tự chọn dùng được"],
                 [[c["code"], c["faculty"], c["courses"], pct(c["usable"], c["courses"]),
                   f"{c['electives_usable']}/{c['electives']}"] for c in lowest]),
        "",
        "## 4. Độ dài và cấu trúc văn bản",
        "",
        f"![Độ dài phần nội dung]({f3})",
        "",
        t3,
        "",
        f"Phần nội dung có trong đề cương, theo ngôn ngữ ({len(usable)} môn dùng được):",
        "",
        t4,
        "",
        f"![Số buổi học]({f5})",
        "",
        t5,
        "",
        "Đỉnh ở 15 buổi là mẫu đề cương 15 tuần; đề cương ít buổi thường gộp theo chương.",
        "",
        "## 5. Tiền xử lý đã thay đổi gì",
        "",
        f"![Thay đổi theo quy tắc]({f6})",
        "",
        t6,
        "",
        "Dòng sai ô ngôn ngữ, theo phần. Phần lớn ở `references` (nguồn chép văn bản tiếng Việt vào cả "
        "hai ô), không thuộc phần nội dung đưa vào mô hình:",
        "",
        lang_by_section(log),
        "",
        "Các dòng placeholder bị bỏ (đủ danh sách trong `logs/preprocess.csv`):",
        "",
        md_table(["Dòng (chữ thường)", "Số lần"], [[f"`{k or '(rỗng)'}`", v] for k, v in placeholder.most_common(15)]),
        "",
        f"Dòng còn lặp lại ở ≥ {d['cfg']['preprocess']['repeated_line_min_courses']} môn sau khi làm sạch "
        "(chỉ báo cáo; phần lớn là từ chung chung như \"introduction\", không phải thủ tục):",
        "",
        md_table(["Dòng", "Số môn"], [[f"`{x['line'][:80]}`", x["courses"]] for x in repeated]),
        "",
        "## 6. Trùng lặp",
        "",
        f"Nhóm nội dung giống hệt ({len(identical)} nhóm; giữ cả, bước phân loại tính một lần): "
        + ", ".join(" = ".join(g) for g in identical),
        "",
        f"Nhóm có tóm tắt giống hệt nhưng phần còn lại khác ({len(copied)} nhóm; chỉ đánh dấu, lỗi của nguồn): "
        + ", ".join(" ~ ".join(g) for g in copied),
        "",
        "## 7. Nguồn tag ứng viên (cho bước 2)",
        "",
        sources(curricula),
        "",
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "report.md"
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return path


def main() -> None:
    utf8_stdout()
    path = write_report(load())
    print(f"báo cáo -> {path}")


if __name__ == "__main__":
    main()
