#!/usr/bin/env python3
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]

OLD_STR_1 = "Y:\\IFC_V\\50300\\教學資料\\疫情訊息"
NEW_STR_1 = "Y:\\IFC_V\\50300\\教學資料\\院內發疫情訊息專用"

OLD_STR_2 = "Y:/IFC_V/50300/教學資料/院內發疫情訊息專用"
NEW_STR_2 = "Y:/IFC_V/50300/教學資料/院內發疫情訊息專用"

OLD_STR_3 = "Y:%5CIFC_V%5C50300%5C%E6%95%99%E5%AD%B8%E8%B3%87%E6%96%99%5C%E9%99%A2%E5%85%A5%E7%99%BC%E7%96%AB%E6%83%85%E8%A8%8A%E6%81%AF%E5%B0%88%E7%94%A8"
NEW_STR_3 = "Y:%5CIFC_V%5C50300%5C%E6%95%99%E5%AD%B8%E8%B3%87%E6%96%99%5C%E9%99%A2%E5%85%A5%E7%99%BC%E7%96%AB%E6%83%85%E8%A8%8A%E6%81%AF%E5%B0%88%E7%94%A8"

count = 0
for file in BASE_DIR.rglob("*"):
    if file.is_file() and not file.name.startswith(".git") and file.suffix in [".py", ".ps1", ".cmd", ".json", ".md", ".txt"]:
        try:
            content = file.read_text(encoding="utf-8")
            if OLD_STR_1 in content or OLD_STR_2 in content or OLD_STR_3 in content:
                content = content.replace(OLD_STR_1, NEW_STR_1).replace(OLD_STR_2, NEW_STR_2).replace(OLD_STR_3, NEW_STR_3)
                file.write_text(content, encoding="utf-8")
                print(f"Updated paths in: {file.relative_to(BASE_DIR)}")
                count += 1
        except Exception as e:
            pass

print(f"Total files updated: {count}")
