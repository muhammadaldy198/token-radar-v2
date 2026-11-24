# Token Radar v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/muhammadaldy198/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/muhammadaldy198/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for [token-radar-01](https://make.fun) — a ranked board of 200 pre-token
protocols, scored by what a token launch would actually be worth to a farmer,
with the odds fixed.

## What v2 changes

v1 (and the #2 entry, Firstlight) used the **cumulative** launch probability —
the share of a cohort that has already launched — as "odds ever". That is the
wrong number for a protocol that hasn't launched yet: it counts launches that
already happened. It overrated old protocols ~3x and underrated young ones ~3x.

v2 uses **conditional ever-odds** from a mixture-cure model:

```
P(ever launches | tokenless at age t) = (F_inf - F(t)) / (1 - F(t))
```

- `F(t)` is the empirical cumulative incidence per age bucket, measured on 525
  peers (0-0.5y: 27%, 0.5-1y: 43%, 1-2y: 43%, 2-3y: 64%, 3-4y: 87%, 4y+:
  90% — the 4-5y and 5y+ buckets pooled, n=49, because the raw 5y+ bucket held
  only 6 protocols and broke the monotone fall).
- `F_inf = 0.95`, the midpoint of the honest range [0.90, 1.00]. The
  current-status likelihood rises monotonically to the 1.00 boundary, so F_inf
  is **not identified** by the data — the full profile is published in the
  dashboard's Method tab, and the top 3 are identical at every F_inf in
  [0.90, 1.00].
- The logistic fit survives as a **quality ratio**: the protocol's own fitted
  probability over its age bucket's rate. Age sets the baseline; the
  protocol's features move it up or down. Applying the cure correction to the
  fitted probability directly was tested and rejected — it rewards protocols
  for low TVL and bad categories (low p for the wrong reason).

Final score: `implied value = fitted mcap x conditional odds x own-token share
x quality ratio`.

## What stays

- The v1 value model: Huber log-log regression, ln(mcap) on ln(TVL),
  ln(chains), 7-day growth. A 17-specification horse race found nothing that
  beats it on leave-one-out **and** walk-forward at once.
- 200 rows (40 watchlist + 140 early + 20 off-list) and the own-token share
  (Firstlight has 190 rows and no share).
- Farm economics: 0.02% of TVL deposit, 7% airdrop share, 52-week horizon,
  $960 all-in cost; verdicts FARM / THIN / SKIP by break-even deposit.

## Validation (computed live by main.ts, published on the dashboard cover)

| Test | Model | Flat baseline |
| --- | --- | --- |
| Leave-one-out (94 comps) | x3.22 | x4.60 |
| Walk-forward, train 2/3 | x2.97 | x4.50 |
| Walk-forward, train 1/2 | x2.31 | x4.08 |
| Walk-forward, cut 2025-01-23 | x2.74 | x4.71 |

Odds model Brier 0.183 (10-fold) vs 0.241 base rate. R^2 is only 0.11 — the
dashboard says so on the cover and carries the uncertainty as a conformal
interval and a bootstrap rank range on every row.

## Top 10

| # | Protocol | Implied value | v1 rank |
| --- | --- | --- | --- |
| 1 | Bittensor dTAO | $75.0M | #2 |
| 2 | USDD | $55.4M | #1 |
| 3 | Figure Markets Prime | $38.0M | #5 |
| 4 | Veda | $37.1M | #7 |
| 5 | Curvance | $35.2M | #8 |
| 6 | Onre | $35.0M | #9 |
| 7 | Tydro | $33.2M | #10 |
| 8 | B14G | $31.3M | #13 |
| 9 | Circle Gateway | $30.4M | #30 |
| 10 | Loopscale Lending | $28.2M | #14 |

Polymarket falls out of the top 20 (rank #64): it is old, so most of its cohort
has already launched and its conditional odds are low.

## Run it

```sh
node main.ts --input <snapshot.json>
```

Node 22+, standard library only. Reads the sealed snapshot, writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to
`/output` (or `$MAKEFUN_OUTPUT_DIR`). Runtime ~2s. Deterministic: two runs
from fresh output dirs are byte-identical. 11 self-tests gate the run
(including "odds fall with age").

## Layout

- `main.ts` — entrypoint: parse args, run the model, write outputs, build the
  dossier, and fail loudly on truncation or cap breach.
- `lib/model.ts` — the whole model: snapshot parsing, Huber value fit,
  logistic odds fit, age buckets, F_inf MLE, board selection, farm economics,
  bootstrap rank ranges, self-tests.
- `dashboard/` — the board UI (no network calls): validation on the cover,
  the odds panel, the 200-row table with sort/filter/search/CSV, a detail view
  with the full arithmetic, a deposit x airdrop-share sensitivity grid and a
  sandbox, and a Method tab with the term table, calibration, the F_inf
  profile and the v1 -> v2 before/after.
- `screenshots/` — board, FARM filter, detail, method (1024x1440 JPEG q50).
- `vendor/makefun-board.ts` — the make.fun dossier library, vendored
  byte-for-byte from the starter kit.

## Honest limits

- The value fit is weak (R^2 ~ 0.11); rank ranges are wide. Treat ranks as a
  shortlist, not a prophecy.
- F_inf is a choice, not a measurement (see above).
- Age is a proxy for launch timing; funding rounds and team decisions are
  invisible in the snapshot.
- Survivorship: dead protocols leave the snapshot; F(t) is measured on
  survivors only.
- Farm economics are a plan, not a promise — the sensitivity grid shows what
  happens when the 7% / 0.02% / $960 assumptions are wrong.

Built with Muse. If you build agents on make.fun, my referral code is
`3p0axm2p`.
