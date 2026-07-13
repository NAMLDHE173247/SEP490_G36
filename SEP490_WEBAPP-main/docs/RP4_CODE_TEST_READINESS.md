# RP4 — Code readiness and evidence checklist

## Implemented experimental pipeline

`Verified subject label -> subject-stratified Split Guard -> subject ZIP -> AutoTrain with locked validation -> Model Evaluation -> quality/latency/token log`

The deterministic routing baseline is:

`MATH -> Math SLM`, `PHYSICAL -> Physics SLM`, otherwise `GENERAL -> General fallback`.

This is an **oracle/verified-subject router** for the component-level experiment. It must not be reported as a semantic subject classifier.

## Split algorithm

For every verified subject subset `D_s`:

1. Split `D_s` into `Development_s` and locked `Test_s` using the GPU semantic leakage guard.
2. Split `Development_s` into `Train_s` and `Validation_s` using the same guard.
3. Reject export when either split still contains conflicts above the configured threshold.

If the requested global ratios are `p_test` and `p_val`, the second-stage percentage is:

`p_val_within_development = p_val / (100 - p_test) * 100`.

This preserves the requested overall ratio while checking both Development-Test and Train-Validation leakage.

## Export contract

The master research archive exposes the subject partitions explicitly:

- `math.train.json`, `math.validation.json`, `math.test.json`
- `physical.train.json`, `physical.validation.json`, `physical.test.json`
- the same naming convention for additional subjects
- `_metadata.json`

For direct AutoTrain upload, each subject-specific ZIP contains:

- `train_dataset.json`
- `validation_dataset.json`
- `test_dataset.json`
- `_metadata.json`

Metadata records subject, seed, semantic threshold, split strategy, counts, dataset version and export time.

AutoTrain uses the locked validation file. It only performs an internal split for legacy uploads that do not contain validation data. Model Evaluation always selects `test_dataset.json` rather than the first JSON file in the ZIP.

## Metrics now logged

Per conversation and per turn:

- subject;
- selected model and routing strategy;
- latency in milliseconds;
- input tokens;
- output tokens;
- total tokens;
- Socratic rubric scores and factual-accuracy score.

## Fixed external model catalog

To keep all experiment runs comparable, the selected UI modes are pinned and routed through OpenRouter:

- DeepSeek mode: `deepseek/deepseek-chat`
- Gemini mode: `google/gemini-2.5-flash-001`
- OpenAI mode: `openai/gpt-4o-mini`
- AI Judge: `google/gemini-2.5-flash-001` with temperature `0`

The model identifiers and judge temperature must remain unchanged within one benchmark campaign.

## Evidence to capture for RP4

1. Stage 6 Split Guard showing Train/Validation/Test counts, zero conflicts and subject distribution.
2. The Math and Physics ZIP contents, including `_metadata.json`.
3. AutoTrain log line showing that the locked validation partition was loaded.
4. Evaluation detail showing model, subject, latency and token counts.

## Remaining work for RP5

- Train and benchmark candidate models using the same locked test cases.
- Repeat inference runs to compute stability.
- Replace or compare the verified-subject router with a semantic router.
- Report confidence intervals and hypothesis-test results.
