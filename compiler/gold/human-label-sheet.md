---
title: Human blind-label sheet (56 snippets) — заполнить Эрни
created: 2026-07-09
tags: [gold, human-annotation]
lang: ru
---

# Разметка вслепую (человек-аннотатор)

Для КАЖДОГО снипета реши по СМЫСЛУ правила: код НАРУШАЕТ правило или СОБЛЮДАЕТ? Ставь V (violating) или C (compliant) в конце строки после `=>`. НЕ подглядывай в gold-v2.json (там мои метки). ~15-20 мин.

Судить по интенту, не по тому, что поймал бы линтер. Спорные: console.log в комменте/строке/JSDoc; window.console.log; идентификаторы-двойники (consoleLog, anyOf); prose-упоминание eslint-disable vs реальная директива; eslint-enable; catch с одним комментом; пустой password=; строковый тип any.


## no-console-log — «Never use console.log; use the project logger instead.»

- **CL1**  `console.log('x')`  =>  
- **CL2**  `console.log(a, b)`  =>  
- **CL3**  `void console.log(1)`  =>  
- **CL4**  `if (d) console.log(2)`  =>  
- **CL5**  `console.log(`total ${n}`)`  =>  
- **CL6**  `function f(){ console.log('starting'); }`  =>  
- **CL7**  `console.error('x')`  =>  
- **CL8**  `console.warn(1)`  =>  
- **CL9**  `logger.log('x')`  =>  
- **CL10**  `const s = 'console.log(1)'`  =>  
- **CL11**  `// console.log(1) ⏎ const x = 1`  =>  
- **CL12**  `/** @example console.log(1) */ ⏎ const y = 1`  =>  
- **CL13**  `const consoleLog = 1`  =>  
- **CL14**  `window.console.log(1)`  =>  
- **CL15**  `myconsole.log(1)`  =>  

## no-explicit-any — «Do not use the TypeScript `any` type; use a specific type or `unknown`.»

- **AN1**  `let x: any`  =>  
- **AN2**  `function f(y: any) {}`  =>  
- **AN3**  `const z = v as any`  =>  
- **AN4**  `let a: any[]`  =>  
- **AN5**  `type R = Record<string, any>`  =>  
- **AN6**  `const cb: (response: any) => void = g`  =>  
- **AN7**  `let p: Promise<any>`  =>  
- **AN8**  `let x: unknown`  =>  
- **AN9**  `type anything = string`  =>  
- **AN10**  `const anyOf = 1`  =>  
- **AN11**  `let s: 'any'`  =>  
- **AN12**  `// let x: any ⏎ const n = 1`  =>  
- **AN13**  `let n: number`  =>  

## no-eslint-disable — «Never use an eslint-disable directive comment to suppress linting.»

- **ED1**  `// eslint-disable-next-line no-console ⏎ console.log(1)`  =>  
- **ED2**  `/* eslint-disable */ ⏎ const x = 1`  =>  
- **ED3**  `/* eslint-disable no-console, no-alert */ ⏎ const y = 1`  =>  
- **ED4**  `const z = 1 // eslint-disable-line`  =>  
- **ED5**  `// eslint-disable-next-line @typescript-eslint/no-explicit-any ⏎ const w = 1`  =>  
- **ED6**  `const a = 1; // we should not eslint-disable this line`  =>  
- **ED7**  `// TODO: stop using eslint-disable everywhere ⏎ const b = 2`  =>  
- **ED8**  `const s = 'eslint-disable'`  =>  
- **ED9**  `/* eslint-enable no-console */ ⏎ const c = 3`  =>  
- **ED10**  `/* prettier-ignore */ ⏎ const d = 4`  =>  
- **ED11**  `// normal comment ⏎ const e = 5`  =>  
- **ED12**  `const f2 = 6; // disables are bad, avoid them`  =>  

## no-empty-catch — «A catch clause must contain at least one statement; never silently swallow a caught error.»

- **EC1**  `try { f() } catch (e) {}`  =>  
- **EC2**  `try { f() } catch {}`  =>  
- **EC3**  `try { f() } catch (e) { /* ignore */ }`  =>  
- **EC4**  `try { g() } catch {}`  =>  
- **EC5**  `try { f() } catch (e) { log(e) }`  =>  
- **EC6**  `try { f() } catch (e) { throw e }`  =>  
- **EC7**  `try { f() } catch (e) { return null }`  =>  
- **EC8**  `try { f() } catch (e) { handle(e); report(e) }`  =>  

## no-hardcoded-secret — «Never hardcode a secret (password, API key, token) as a string literal.»

- **HS1**  `const password = 'hunter2'`  =>  
- **HS2**  `const apiKey = 'AKIA1234567890ABCD'`  =>  
- **HS3**  `const token = 'ghp_abcdefghijklmnop'`  =>  
- **HS4**  `const secret = 'sk-live-abcdef'`  =>  
- **HS5**  `const password = process.env.PW`  =>  
- **HS6**  `const apiKey = getKey()`  =>  
- **HS7**  `const password = ''`  =>  
- **HS8**  `const label = 'username'`  =>  

---
Как заполнишь — пришли, я посчитаю agreement с моими метками (и с 2-м LLM-рейтером) → κ станет с человеком в петле.
