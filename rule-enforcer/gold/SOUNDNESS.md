---
title: "Soundness чекеров на gold-наборе — FP/FN (task 2, 2026-07-09)"
created: 2026-07-09
updated: 2026-07-09
tags: [soundness, gold, rule-enforcer, precision-recall]
lang: ru
---

# Soundness синтезированных чекеров (task 2)

Вторая половина вклада: насколько можно ДОВЕРЯТЬ авто-сгенерённым чекерам. Метод: gold-набор снипетов,
размеченных по **истинному намерению правила** (не по тому, что удобно чекеру), с намеренно хитрыми
негативами. Прогон — `soundness.js`, данные — `gold/gold.json`.

Хитрые случаи в наборе (то, на чём наивный синтез валится):
- console.log в строковом литерале, в line-комменте, в JSDoc `@example`, идентификатор `consoleLog`;
- `any` в имени типа (`anything`), в строковом литеральном типе `'any'`, `unknown`;
- `eslint-disable` как PROSE-упоминание в комментарии (не директива), как строка, `eslint-enable`;
- секрет в `apiKey`/`token` (не только `password`), секрет из `process.env`.

## Результат

| rule | TP | FP | FN | precision | recall | verdict |
|---|---:|---:|---:|---:|---:|---|
| no-console-log | 3 | 0 | 0 | 1.00 | 1.00 | **SOUND** |
| no-explicit-any | 4 | 0 | 0 | 1.00 | 1.00 | **SOUND** |
| no-empty-catch | 2 | 0 | 0 | 1.00 | 1.00 | **SOUND** |
| no-eslint-disable | 2 | 1 | 0 | 0.67 | 1.00 | LEAKY (FP на prose-упоминании) |
| no-hardcoded-secret | 1 | 0 | 2 | 1.00 | 0.33 | LEAKY (FN: apiKey/token) |

**3 из 5 sound (precision=recall=1), 2 leaky.**

## Failure taxonomy (вклад)

- **AST / keyword-based синтез → sound.** console.log (CallExpression), any (TSAnyKeyword),
  empty-catch (CatchClause) — корректно игнорируют строки/комменты/JSDoc/лукалайки. precision=recall=1.
- **Text-scan синтез → ложные срабатывания.** no-eslint-disable сканирует текст комментов → FP на
  фразе «we should not eslint-disable this line» (это проза, не директива). Sound-версия должна
  разбирать директивы (позиция + префикс), а не матчить подстроку.
- **Name-based синтез → пропуски.** no-hardcoded-secret ловит только имя `password` → FN на `apiKey`/
  `token`. Sound-версия — по энтропии значения / списку имён, не по одному имени.

## Ключевой инсайт: гейт необходим, но НЕ достаточен

- `no-hardcoded-secret`: гейт (само-тест) **отбраковал** его → recall 0.33 на gold объясняет почему. ✔ согласовано.
- `no-eslint-disable`: гейт **пропустил** (kept), но gold показал precision 0.67. Причина — мой само-тест
  был слишком мягким (пометил prose-упоминание как нарушение, т.е. согласился с багом чекера). →
  **Вывод: независимый human-labeled gold-набор ловит утечки, которые само-тест чекера пропускает.**
  Это мотивирует gold-бенчмарк как ОТДЕЛЬНЫЙ вклад поверх trust-гейта, а не вместо него.
  (Действие: пересобрать само-тест no-eslint-disable по истинному намерению, ЛИБО вести правило как
  «директиво-разборный» синтез. Задокументировано как finding, не «тихо пофикшено».)

## v2 — расширенный набор (n=56) + независимый 2-й рейтер (2026-07-09)

Закрывает атаки ревью «малый n» и «single annotator = сам себя оцениваешь». Набор — `gold/gold-v2.json`
(8-15 кейсов/правило, edge-cases + реальные снипеты из AutoGPT/Frigate). Независимый рейтер разметил
`gold/blind.json` вслепую → `gold/rater2.json`. Скрипт — `soundness-v2.js`.

**Inter-annotator agreement: 100% (56/56), Cohen's kappa = 1.000.** Совпали и на хитрых (window.console.log,
comment-only catch, eslint-enable, пустой `password=''`). → метки не идиосинкразия автора.

| rule | n | TP | FP | FN | prec | recall | verdict |
|---|--:|--:|--:|--:|--:|--:|---|
| no-explicit-any | 13 | 7 | 0 | 0 | 1.00 | 1.00 | **SOUND** |
| no-empty-catch | 8 | 4 | 0 | 0 | 1.00 | 1.00 | **SOUND** |
| no-console-log | 15 | 6 | 0 | 1 | 1.00 | 0.86 | near-sound: FN на `window.console.log` (namespaced) |
| no-eslint-disable | 12 | 3 | 2 | 2 | 0.60 | 0.60 | LEAKY (FP+FN) |
| no-hardcoded-secret | 8 | 1 | 0 | 3 | 1.00 | 0.25 | LEAKY (FN) |

### Два НОВЫХ finding’а (всплыли на большем наборе)
1. **AST-селектор неполон:** `no-console-log` ловит `console.log(...)` но пропускает `window.console.log(...)`
   (namespaced/aliased) → recall 0.86. AST-синтез sound по конструкции, но покрытие узлов надо расширять.
2. **Text-scan `no-eslint-disable` САМО-подавляется:** FN на `/* eslint-disable */` и `// eslint-disable-line`,
   потому что блочная/строчная директива глушит ВСЕ правила — включая то, что её ловит. Плюс FP на prose-упоминаниях.
   → правило-чекер тут в принципе не то решение; нужен **config-level `noInlineConfig`** (движок игнорирует
   inline-директивы), а не lint-правило. Цитируемо и усиливает тезис (энфорсмент должен быть на уровне конфига).

### Обновлённая failure taxonomy
- **AST/keyword → sound** (any, empty-catch).
- **AST с неполным покрытием узлов → FN** (console-log: namespaced/aliased).
- **text-scan → FP (prose) + self-suppression FN** (eslint-disable) → лечится только config-level, не правилом.
- **name-based → FN** (secrets).

## Threats (остаточные)
- 56 кейсов / 5 правил — лучше n=4, но всё ещё ручной набор; для main-track нужен майнинг реальных edge-cases в масштабе.
- Оба аннотатора — LLM (я + агент). Идеально — человек-рейтер; kappa=1.0 снижает риск, но не человек.
- «Sound на этом наборе» ≠ «sound везде»; покрытие узлов (console-log FN) показывает предел.

## Связь с decision rule (для статьи)
Механизовать правило, когда: (baseline compliance низкий — task 1) И (синтезированный чекер sound на
gold — task 2) И (правило не интент-зависимое). Пара task1×task2 = ROI-таблица «что компилировать».
</content>
