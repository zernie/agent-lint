---
title: "Rule-compiler prototype — что доказано (ночной прогон 2026-07-09)"
created: 2026-07-09
updated: 2026-07-09
tags: [прототип, eslint, rule-compiler, результаты]
lang: ru
---

# Прототип rule-compiler — результаты

Собран автономно в ночь 2026-07-09. Цель прогона: снять главный риск проекта — **реально ли из
правила-словами получить работающее ESLint-правило, и можно ли машинно отсеять те, которым нельзя
доверять.** Ответ: да, конвейер работает end-to-end и запускается одной командой.

## Конвейер

```
prose-правило (CLAUDE.md)
   -> классификация: механизуемо / семантика
   -> [механизуемо] синтез ESLint-правила  +  синтез НЕЗАВИСИМОГО само-теста
   -> ГЕЙТ ДОВЕРИЯ: правило прогоняется против своего само-теста
        прошло  -> kept   (можно энфорсить)
        провал  -> abstain (синтез неточный, НЕ энфорсим — не даём ложной уверенности)
   -> [семантика] не берём, честно помечаем
   -> kept-правила гоняются по коду проекта (реальный энфорсмент)
```

## Что получилось (гейт, `node gate.js`)

Корпус из 7 реальных prose-правил. 5 механизуемых, 2 семантических. Из 5 механизуемых **4 прошли
гейт, 1 отбракован**:

```
  R1  no-console-log        kept              passed self-test
  R2  max-function-lines    kept              passed self-test
  R3  no-deprecated-import  kept              passed self-test
  R4  mk-prefix-exports     kept              passed self-test
  R5  no-hardcoded-secret   abstain           FAILED self-test: Should have 1 error but had 0
  R6  prefer-composition    not-mechanizable  semantic
  R7  self-documenting      not-mechanizable  semantic

  corpus=7  mechanizable=5  kept=4  abstain=1  not-mechanizable=2
  coverage (kept / total) = 57%   trust-gate rejected 1 unsound checker
```

**R5 — сердце демо.** Синтез намеренно наивный: ловит только строковый литерал в переменной с именем
ровно `password`, а `apiKey`/`token` пропускает. Независимый само-тест кодирует настоящий смысл правила
(`apiKey` — тоже секрет), наивный чекер его пропускает → гейт ловит это и отправляет правило в `abstain`.
Это в миниатюре весь тезис будущей статьи: **авто-сгенерённая проверка может давать ложную уверенность,
и это машинно детектируемо.**

## Реальный энфорсмент (демо, `node run-demo.js`)

4 kept-правила прогнаны по мини-проекту `demo-project/` — поймали все 4 нарушения:

```
  app.js:1      [no-deprecated-import]  Import from '@acme/legacy-ui' is deprecated
  app.js:3      [mk-prefix-exports]     Exported function 'renderApp' must be prefixed with 'mk'
  app.js:4      [no-console-log]        Use the project logger instead of console.log
  widgets.js:1  [max-function-lines]    Function spans 49 lines; keep functions <= 40 lines
```

В демо намеренно захардкожен `apiKey` — и он **НЕ** флагается, потому что R5 ушёл в abstain. То есть
инструмент честно отказывается энфорсить то, чему сам не доверяет.

## Что здесь ПО-НАСТОЯЩЕМУ, а что заглушка (честно)

- **Реально и запускается:** классификация→гейт→энфорсмент; ESLint-правила настоящие (ESLint 9.39,
  `RuleTester` как гейт, `Linter` для энфорсмента); гейт реально отбраковывает неточный синтез.
- **Пока author-in-the-loop:** сами 5 ESLint-правил на этом шаге написаны Claude (это и есть шаг
  «LLM синтезирует чекер»), а не дёрнуты автоматическим API-вызовом изнутри тулзы. Следующий шов —
  завести `synthesize(ruleText) -> {ruleCode, selftest}` через реальный LLM-вызов. Первый автономный
  тест этого шва — см. `synth-agent/` (правило, синтезированное отдельным агентом «вслепую»).
- **TS поддержан** (добавлено той же ночью): через `@typescript-eslint/parser` правила гоняются и на
  `.ts`. Парсер парсит и JS, и TS, поэтому один прогон покрывает оба языка. Логика правил не меняется.

## Чем это помогает статье

Гейт доверия (guarded synthesis) — не слайд, а работающий механизм с числом (coverage 57%, 1 abstain).
Именно этого замера не сделал ContextCov. Пилот на реальном корпусе (заход-1) масштабирует это до
настоящих coverage/precision-кривых.

## Обновление (та же ночь): R8 — автоматический синтез доказан

Чтобы снять сомнение «а правила ты сам написал», отдельный агент синтезировал правило **вслепую** —
получил только prose («Empty catch blocks are forbidden…») + контракт интерфейса, без доступа к
остальным правилам, и сам написал ESLint-правило + независимый само-тест (4 valid / 3 invalid).
Проверено моим гейтом независимо → **PASS**. Файлы-первоисточник — `synth-agent/`.

Плюс той же ночью добавлено TS-правило R9 (`no-explicit-any`, синтез из prose) под TS-парсером.
Итоговое состояние конвейера:

```
  corpus=9  mechanizable=7  kept=6  abstain=1  not-mechanizable=2
  coverage (kept / total) = 67%   trust-gate rejected 1 unsound checker
```

Демо теперь ловит 7 нарушений кросс-язык (JS+TS одним прогоном): пустой catch (`app.js:12`), `any` в
`model.ts:1`, `console.log` в `model.ts:2` и т.д. Вывод: **шаг «LLM синтезирует чекер» реально
автоматизируется** (R8 синтезирован агентом вслепую) и **работает на целевом TS-стеке** (R9) — значит
author-in-the-loop был лишь стартовой заглушкой, а не ограничением.

## Как запустить

```
cd idei/rule-compiler/prototype
npm install          # ставит eslint@9
node gate.js         # гейт доверия -> results.json
node run-demo.js     # энфорсмент kept-правил по demo-project/
```

## Дальше

- [ ] Автоматический шов синтеза: `synthesize()` через реальный LLM-вызов (сейчас — `synth-agent/` как первый тест).
- [ ] TS-парсер (`typescript-eslint`) — заход-1.
- [ ] Догфуд на vigiles (нужно добавить репо в сессию).
- [ ] Майнинг публичного корпуса + gold-разметка → пилот soundness.
</content>
