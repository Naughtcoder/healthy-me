#!/bin/sh
# Builds src/data/world-foods.json from pinned open food tables:
#   USDA FoodData Central (public domain): Foundation 2026-04-30, SR Legacy 2018-04, FNDDS survey 2024-10-31
#   UK CoFID 2021 (McCance and Widdowson, Open Government Licence v3.0)
# Usage: scripts/build-world-foods.sh <folder with the unzipped USDA csv folders and cofid.xlsx>
# Per 100 g edible portion: kcal, protein, carbohydrate, fat, fibre. Missing stays null.
set -e
D="$1"
OUT="$(cd "$(dirname "$0")/.." && pwd)/src/data/world-foods.json"
duckdb -c "
INSTALL excel; LOAD excel;
CREATE TABLE usda AS
WITH f AS (
  SELECT fdc_id, description AS name, 'usda-foundation' AS source, 1 AS rank FROM read_csv_auto('$D/FoodData_Central_foundation_food_csv_2026-04-30/*/food.csv') WHERE data_type = 'foundation_food'
  UNION ALL SELECT fdc_id, description, 'usda-sr', 2 FROM read_csv_auto('$D/FoodData_Central_sr_legacy_food_csv_2018-04/*/food.csv')
  UNION ALL SELECT fdc_id, description, 'usda-fndds', 3 FROM read_csv_auto('$D/FoodData_Central_survey_food_csv_2024-10-31/*/food.csv') WHERE data_type = 'survey_fndds_food'
), n AS (
  SELECT fdc_id, nutrient_id, amount FROM read_csv_auto('$D/FoodData_Central_foundation_food_csv_2026-04-30/*/food_nutrient.csv')
  UNION ALL SELECT fdc_id, nutrient_id, amount FROM read_csv_auto('$D/FoodData_Central_sr_legacy_food_csv_2018-04/*/food_nutrient.csv')
  -- The survey file uses the old nutrient numbers (208 kcal, 203 protein, 205 carb, 204 fat, 291 fibre).
  UNION ALL SELECT fdc_id, CASE nutrient_id WHEN 208 THEN 1008 WHEN 203 THEN 1003 WHEN 205 THEN 1005 WHEN 204 THEN 1004 WHEN 291 THEN 1079 END, amount
    FROM read_csv_auto('$D/FoodData_Central_survey_food_csv_2024-10-31/*/food_nutrient.csv') WHERE nutrient_id IN (208, 203, 205, 204, 291)
)
SELECT f.name, f.source, f.rank, CAST(f.fdc_id AS VARCHAR) AS id,
  COALESCE(MAX(amount) FILTER (nutrient_id = 1008), MAX(amount) FILTER (nutrient_id = 2048), MAX(amount) FILTER (nutrient_id = 2047)) AS kcal,
  MAX(amount) FILTER (nutrient_id = 1003) AS p,
  MAX(amount) FILTER (nutrient_id = 1005) AS carb,
  MAX(amount) FILTER (nutrient_id = 1004) AS fat,
  MAX(amount) FILTER (nutrient_id = 1079) AS fibre
FROM f JOIN n USING (fdc_id) GROUP BY ALL;

CREATE TABLE cofid_raw AS SELECT * FROM read_xlsx('$D/cofid.xlsx', sheet = '1.3 Proximates', header = false) OFFSET 3;
CREATE TABLE cofid AS
SELECT B1 AS name, 'cofid' AS source, 4 AS rank, A1 AS id,
  TRY_CAST(CASE WHEN M1 = 'Tr' THEN '0' ELSE M1 END AS DOUBLE) AS kcal,
  TRY_CAST(CASE WHEN J1 = 'Tr' THEN '0' ELSE J1 END AS DOUBLE) AS p,
  TRY_CAST(CASE WHEN L1 = 'Tr' THEN '0' ELSE L1 END AS DOUBLE) AS carb,
  TRY_CAST(CASE WHEN K1 = 'Tr' THEN '0' ELSE K1 END AS DOUBLE) AS fat,
  NULL::DOUBLE AS fibre
FROM cofid_raw WHERE A1 IS NOT NULL AND B1 IS NOT NULL;

CREATE TABLE allf AS
SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY lower(trim(name)) ORDER BY rank) AS k FROM (SELECT * FROM usda UNION ALL SELECT * FROM cofid))
WHERE k = 1 AND kcal IS NOT NULL AND p IS NOT NULL AND kcal BETWEEN 0 AND 950 AND p BETWEEN 0 AND 100;

COPY (SELECT name, source, id, round(kcal)::INT AS kcal, round(p, 1) AS p, round(carb, 1) AS carb, round(fat, 1) AS fat, round(fibre, 1) AS fibre FROM allf ORDER BY rank, name)
  TO '$D/world-foods.csv' (HEADER);
"
python3 - "$D/world-foods.csv" "$OUT" <<'PY'
import csv, json, sys
num = lambda v: None if v in ('', None) else (int(float(v)) if float(v).is_integer() else float(v))
rows = [[r['name'], r['source'], r['id'], num(r['kcal']), num(r['p']), num(r['carb']), num(r['fat']), num(r['fibre'])] for r in csv.DictReader(open(sys.argv[1]))]
json.dump({'note': 'Per 100 g: [name, source, id, kcal, protein, carb, fat, fibre]. USDA FoodData Central is public domain. CoFID 2021 contains public sector information licensed under the Open Government Licence v3.0.', 'rows': rows}, open(sys.argv[2], 'w'), separators=(',', ':'))
print(len(rows), 'foods')
PY
ls -la "$OUT"
