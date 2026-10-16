# Polly-Bot 시스템 아키텍처

## 개요

Polly-Bot은 Polymarket의 NegRisk 마켓에서 차익거래 기회를 실시간 탐지하고,
React 대시보드로 시각화하며, 선택적으로 자동 실행하는 시스템입니다.

karb 오픈소스 봇의 인프라(WebSocket, CLOB 클라이언트, 데이터 레이어)를
그대로 유지하면서 NegRisk 전략 로직과 React 프론트엔드를 추가합니다.

## 시스템 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Polymarket APIs                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Gamma API│  │ CLOB API │  │WebSocket │  │ Polygon Network  │   │
│  │(마켓 검색)│  │(주문/조회)│  │(실시간)  │  │(NegRisk 변환)    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
└───────┼──────────────┼────────────┼──────────────────┼─────────────┘
        │              │            │                  │
┌───────┼──────────────┼────────────┼──────────────────┼─────────────┐
│       ▼              ▼            ▼                  ▼             │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │              Market Sync + Scanner Layer                  │      │
│  │  ┌────────────────┐ ┌──────────────┐ ┌───────────────┐  │      │
│  │  │RealtimeScanner │ │NegRiskScanner│ │MarketSyncWorker│  │      │
│  │  │(Pure Arb, 기존)│ │(NegRisk 이벤트)│ │(Gamma→DB 동기화)│  │      │
│  │  └───────┬────────┘ └──────┬───────┘ └──────┬────────┘  │      │
│  └──────────┼─────────────────┼────────────────┼───────────┘      │
│             │                 │                │                   │
│             ▼                 ▼                ▼                   │
│  ┌──────────────────┐  ┌──────────────────────────────────┐      │
│  │    Event Bus     │  │          SQLite (karb.db)         │      │
│  │  (pub/sub, 비동기)│  │  trades │ alerts │ markets_cache  │      │
│  └──┬───┬───┬───┬───┘  └──────────────────────────────────┘      │
│     │   │   │   │                  ▲                              │
│     ▼   ▼   ▼   ▼                  │                              │
│  ┌─────┐┌──────┐┌──────┐┌─────────────┐                         │
│  │Anal.││Recom.││Logger││ Dashboard   │                         │
│  │     ││      ││      ││ (FastAPI)   │                         │
│  └──┬──┘└──┬───┘└──────┘└──────┬──────┘                         │
│     │      │                    │                                │
│     ▼      ▼                    │                                │
│  ┌──────────────────┐           │                                │
│  │    Executor      │           │                                │
│  │  (Phase 3)       │           │                                │
│  └──────────────────┘           │                                │
│                                 │                                │
│  Polly-Bot Backend (Python)     │                                │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │    Frontend (React + Vite)   │
                   │  ┌────────────────────────┐  │
                   │  │  NegRisk 차익거래 탭   │  │
                   │  │  전체 마켓 탭          │  │
                   │  │  Pure Arb 탭           │  │
                   │  │  설정 탭               │  │
                   │  │  포트폴리오 탭 (Phase 3)│  │
                   │  └────────────────────────┘  │
                   └──────────────────────────────┘
```

## 데이터 흐름

### 1. 마켓 데이터 동기화 (Background Sync)

```
MarketSyncWorker (5분 간격)
  ↓
Gamma API에서 상위 2,000개 마켓 fetch (volume 내림차순, 20페이지)
  ↓
_normalise()로 정규화 → markets_cache 테이블에 UPSERT
  ↓
24시간 이상 갱신 안 된 마켓은 active=0 처리
  ↓
/api/markets 요청 시 → DB SELECT로 즉시 응답 (0ms 수준)
```

### 2. 실시간 가격 → 기회 탐지 → UI 표시

```
1. WebSocket에서 가격 업데이트 수신
   ↓
2. Scanner가 이벤트 단위로 가격 갱신
   ↓
3. EventBus로 PRICE_UPDATE 이벤트 발행
   ↓
4. NegRiskArbAnalyzer가 두 전략 동시 검사:
   - YES_ARB: Σ p_YES < 1 - a ?
   - NO_CONVERT_ARB: Σ p_NO < (k-1) - a ?
   ↓
5. 기회 발견 시 ARB_OPPORTUNITY 이벤트 발행
   ↓
6. Dashboard API가 WebSocket으로 프론트엔드에 푸시
   ↓
7. React UI가 기회 목록 + 계산 상세 표시
```

---

## 디렉터리 구조 (백엔드)

```
src/karb/
├── __init__.py
├── __main__.py
├── bot.py                    # 봇 오케스트레이션
├── cli.py                    # CLI 커맨드
├── config.py                 # Pydantic Settings (.env 기반)
├── exceptions.py             # 커스텀 예외 계층
│
├── api/                      # 외부 API 클라이언트
│   ├── gamma.py              # Gamma API (마켓 검색/조회)
│   ├── clob.py               # CLOB REST API
│   ├── websocket.py          # WebSocket 클라이언트 (6개 병렬)
│   ├── models.py             # Market, Token, OrderBook 등 기본 모델
│   └── negrisk_models.py     # NegRisk Pydantic 모델
│
├── scanner/                  # 마켓 스캐닝
│   ├── realtime_scanner.py   # Pure Arb 실시간 스캐너 (karb 기존)
│   ├── negrisk_scanner.py    # NegRisk 이벤트 스캐너
│   ├── market_scanner.py     # 마켓 탐색 (karb 기존)
│   └── crossplatform_scanner.py
│
├── analyzer/                 # 기회 분석
│   ├── arbitrage.py          # Pure Arb 탐지 (karb 기존)
│   ├── negrisk_arb.py        # YES_ARB + NO_CONVERT_ARB 탐지
│   └── recommender.py        # 기회 스코어링/랭킹
│
├── executor/                 # 주문 실행
│   ├── executor.py           # Pure Arb 주문 실행 (karb 기존)
│   ├── async_clob.py         # EIP-712 서명 + HMAC L2 인증
│   ├── signer.py             # EIP-712 order 서명
│   ├── redemption.py         # 만기 포지션 환수
│   └── negrisk_executor.py   # NegRisk 전략 실행 (Phase 3)
│
├── events/                   # 이벤트 버스
│   ├── bus.py                # 비동기 pub/sub (핸들러 격리)
│   └── types.py              # 이벤트 타입 정의
│
├── data/                     # 데이터 레이어
│   ├── database.py           # SQLite 연결 관리 + 스키마 정의
│   ├── repositories.py       # Repository 클래스들 (모든 DB 쿼리)
│   └── market_sync.py        # Background Sync Worker (Gamma→DB)
│
├── tracking/                 # 포지션/잔고 추적
│   ├── portfolio.py          # PortfolioTracker (USDC, PnL)
│   └── trades.py             # 거래 기록
│
├── notifications/            # 알림
│   └── slack.py              # Slack Webhook 알림
│
├── dashboard/                # FastAPI 웹 서버
│   ├── app.py                # 라우트 + 서버 로직 (~1,500줄)
│   └── templates/            # Jinja2 (레거시 HTML 대시보드)
│
└── utils/
    └── logging.py            # structlog 기반 로깅
```

---

## 데이터 레이어 상세

### SQLite 데이터베이스 (`~/.karb/karb.db`)

WAL 모드 사용, 비동기 `aiosqlite`로 접근하여 트레이딩 루프를 블로킹하지 않음.

#### 테이블 목록

| 테이블 | 용도 | 비고 |
|---|---|---|
| `trades` | 거래 기록 | platform, side, outcome, price, size |
| `portfolio_snapshots` | 잔고 스냅샷 | polymarket_usdc, total_usd, positions_value |
| `alerts` | Pure Arb 알림 | yes_ask, no_ask, combined, profit |
| `executions` | 주문 실행 내역 | yes/no 각각의 order_id, status, filled_size |
| `scanner_stats` | 스캐너 통계 (싱글톤) | markets, price_updates, ws_connected |
| `execution_stats` | 실행 통계 (싱글톤) | total_attempts, successful, total_profit |
| `closed_positions` | 청산 포지션 내역 | realized_pnl, redeemed 여부 |
| `near_miss_alerts` | 유동성 부족 경고 | 놓친 기회 추적용 |
| `stats_history` | 시간별 통계 스냅샷 | 차트 데이터 |
| `price_updates_minute` | 분별 가격 업데이트 수 | 실시간 차트 (60분 롤링) |
| **`markets_cache`** | **마켓 메타데이터 캐시** | **Background Sync Worker가 관리** |

#### markets_cache 테이블 (신규)

마켓 목록/검색을 위한 로컬 캐시. Gamma API에 매번 요청하지 않고 DB에서 즉시 응답.

```sql
CREATE TABLE IF NOT EXISTS markets_cache (
    condition_id TEXT PRIMARY KEY,
    question_id  TEXT,
    question     TEXT NOT NULL,
    slug         TEXT,
    category     TEXT DEFAULT '',
    event_id     TEXT DEFAULT '',
    volume       REAL DEFAULT 0,       -- 거래량 (USD)
    liquidity    REAL DEFAULT 0,       -- 유동성 (USD)
    yes_price    REAL DEFAULT 0,
    no_price     REAL DEFAULT 0,
    spread       REAL DEFAULT 0,
    end_date     TEXT,
    neg_risk     INTEGER DEFAULT 0,    -- NegRisk 마켓 여부
    active       INTEGER DEFAULT 1,
    closed       INTEGER DEFAULT 0,
    clob_token_ids TEXT,
    synced_at    TEXT NOT NULL          -- 마지막 동기화 시각 (ISO)
);

-- 인덱스 (주요 쿼리 패턴)
CREATE INDEX idx_markets_cache_volume    ON markets_cache(volume DESC);
CREATE INDEX idx_markets_cache_liquidity ON markets_cache(liquidity DESC);
CREATE INDEX idx_markets_cache_category  ON markets_cache(category);
CREATE INDEX idx_markets_cache_slug      ON markets_cache(slug);
```

#### Repository 패턴

모든 DB 쿼리는 `data/repositories.py`의 Repository 클래스를 통해 접근:

| Repository | 주요 메서드 |
|---|---|
| `TradeRepository` | `insert()`, `get_recent()`, `get_total_count()` |
| `AlertRepository` | `insert()`, `get_recent()`, `get_total_count()`, `get_daily_counts()` |
| `ExecutionRepository` | `insert()`, `get_recent()`, `update_stats()`, `get_stats()` |
| `PortfolioRepository` | `insert_snapshot()`, `get_latest()`, `get_daily()` |
| `StatsRepository` | `update()`, `get()`, `reset_daily()` |
| `StatsHistoryRepository` | `save_snapshot()`, `get_hourly()` |
| `MinuteStatsRepository` | `upsert()`, `get_recent()` |
| `ClosedPositionRepository` | `insert()`, `get_recent()`, `get_pnl_summary()` |
| `NearMissAlertRepository` | `insert()`, `get_recent()`, `get_daily_counts()` |
| **`MarketCacheRepository`** | **`upsert_batch()`, `query()`, `get_count()`, `mark_stale()`** |

---

## Background Sync Worker

### `data/market_sync.py` — `MarketSyncWorker`

Gamma API에서 마켓 메타데이터를 주기적으로 가져와 로컬 DB에 적재하는 백그라운드 워커.

```
┌─────────────┐     5분 간격      ┌──────────┐    UPSERT    ┌──────────┐
│ Gamma API   │ ───────────────→ │ Sync     │ ──────────→ │ SQLite   │
│ /markets    │  20페이지×100건    │ Worker   │  ~2000건      │ markets  │
│ (volumeNum  │                  │          │              │ _cache   │
│  DESC)      │                  └──────────┘              └──────────┘
└─────────────┘                       │
                                      ▼
                              24시간 지난 마켓
                              active=0 처리
```

**설정:**

| 상수 | 기본값 | 설명 |
|---|---|---|
| `SYNC_INTERVAL_SECS` | 300 (5분) | 동기화 주기 |
| `PAGES_PER_SYNC` | 20 | 한 사이클에 가져올 최대 페이지 수 |
| `PAGE_SIZE` | 100 | Gamma API 페이지 크기 |

**생명주기:**

1. 서버 startup 시 `sync_once()` 먼저 실행 (첫 데이터 즉시 적재)
2. 이후 `start()` 로 백그라운드 루프 시작
3. 서버 shutdown 시 `stop()` 으로 정리

**정규화 (`_normalise`):**

Gamma API의 raw JSON을 DB 컬럼에 맞게 변환:
- `volumeNum` → `volume`, `liquidityNum` → `liquidity`
- `outcomePrices` (JSON array) → `yes_price`, `no_price`
- `negRisk` → `neg_risk` (boolean → int)
- `tags[0].label` → `category`

---

## API 엔드포인트 전체

### 마켓 (Markets)

| 메서드 | 경로 | 데이터 소스 | 설명 |
|---|---|---|---|
| GET | `/api/markets` | **DB (markets_cache)** | 마켓 목록 (검색, 필터, 정렬, 페이징) |
| GET | `/api/markets/by-slug/{slug}` | Gamma API 직접 | 개별 마켓 상세 |
| GET | `/api/markets/by-event/{event_id}` | Gamma API → DB fallback | 이벤트 소속 마켓 |

`/api/markets` 파라미터:

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `limit` | 50 | 페이지 크기 (1~200) |
| `offset` | 0 | 페이지 오프셋 |
| `sort_by` | `volume` | 정렬 기준 (`volume` / `liquidity`) |
| `category` | null | 카테고리 LIKE 필터 |
| `search` | null | 검색어 (question, slug LIKE 매칭) |
| `min_liquidity` | 0 | 최소 유동성 필터 |

**검색 동작:**
1. DB `markets_cache`에서 LIKE 검색 (2,000개 대상, 즉시)
2. 결과 0건이면 Gamma API `slug` 직접 조회로 fallback

### NegRisk

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/negrisk-events` | NegRisk 이벤트 목록 + 가격 |
| GET | `/api/negrisk-events/{id}` | 이벤트 상세 |
| GET | `/api/negrisk-arb` | 차익거래 기회 (계산 상세 포함) |
| GET | `/api/negrisk-stats` | NegRisk 통계 |

### Pure Arb

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/alerts` | Pure Arb 알림 (페이징) |
| GET | `/api/near-miss-alerts` | 유동성 부족 알림 |
| GET | `/api/orders` | 주문 실행 내역 |
| GET | `/api/arb-window-stats` | 기회 지속시간 통계 |

### 포트폴리오/잔고

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/balance` | USDC 잔고 |
| GET | `/api/positions` | 보유 포지션 |
| GET | `/api/closed-positions` | 청산 내역 |
| GET | `/api/pnl` | 손익 요약 |
| GET | `/api/redeemable` | 환수 가능 포지션 |
| POST | `/api/redeem` | 환수 실행 |

### 설정/상태

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/status` | 봇 상태 + 스캐너 통계 |
| GET | `/api/settings` | 현재 설정 조회 |
| PUT | `/api/settings` | 설정 수정 |
| GET | `/api/trades` | 거래 내역 |

### 지갑 (Phase 3)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/wallet/validate` | 프라이빗 키 검증 + 연결 |
| GET | `/api/wallet/status` | 연결 상태 |
| POST | `/api/wallet/disconnect` | 연결 해제 |

### 실행 (Phase 3)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/execute/negrisk` | NegRisk 기회 수동 실행 |
| POST | `/api/execute/pure-arb` | Pure Arb 수동 실행 |
| GET | `/api/executions` | 전체 실행 내역 |

### 차트 데이터

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/charts/hourly` | 시간별 통계 |
| GET | `/api/charts/daily-executions` | 일별 실행 |
| GET | `/api/charts/daily-alerts` | 일별 알림 |
| GET | `/api/charts/daily-near-miss` | 일별 Near Miss |
| GET | `/api/charts/daily-balance` | 일별 잔고 |
| GET | `/api/charts/price-updates-minute` | 분별 가격 업데이트 |

### WebSocket

| 경로 | 채널 | 설명 |
|---|---|---|
| `/api/ws/stream` | markets, arb, negrisk | 실시간 가격 + 알림 브로드캐스트 |

---

## 모듈 분류

### karb에서 유지 (수정 금지, 확장만)

| 모듈 | 역할 |
|---|---|
| `api/websocket.py` | Polymarket WebSocket 클라이언트 (6개 병렬) |
| `api/gamma.py` | Gamma API 클라이언트 (마켓 검색) — `order` 파라미터 추가됨 |
| `api/clob.py` | CLOB REST API 클라이언트 |
| `api/models.py` | 기본 데이터 모델 (Market, Token, OrderBook, Order) |
| `scanner/realtime_scanner.py` | Pure Arb 실시간 스캐너 |
| `analyzer/arbitrage.py` | Pure Arb 탐지 |
| `executor/executor.py` | Pure Arb 주문 실행 (YES+NO 동시, FOK) |
| `executor/async_clob.py` | 비동기 CLOB 클라이언트 (EIP-712 + HMAC) |
| `executor/signer.py` | EIP-712 주문 서명 |
| `executor/redemption.py` | 만기 포지션 환수 |
| `tracking/portfolio.py` | 잔고/PnL 추적 |
| `data/database.py` | SQLite 관리 + 스키마 — `markets_cache` 테이블 추가됨 |
| `config.py` | Pydantic Settings (환경변수) |
| `bot.py` | 봇 오케스트레이션 |
| `cli.py` | CLI 커맨드 |
| `notifications/slack.py` | Slack 알림 |

### Polly-Bot 추가 모듈

| 모듈 | 역할 | 상태 |
|---|---|---|
| `exceptions.py` | 예외 계층 (PollyBotError → ApiError, ArbitrageError, ...) | 완료 |
| `events/bus.py` | 비동기 이벤트 버스 (pub/sub, 핸들러 격리) | 완료 |
| `events/types.py` | 이벤트 타입 정의 | 완료 |
| `api/negrisk_models.py` | NegRisk Pydantic 모델 | 완료 |
| `scanner/negrisk_scanner.py` | NegRisk 이벤트 스캐너 | 완료 |
| `analyzer/negrisk_arb.py` | YES_ARB + NO_CONVERT_ARB 탐지 | 완료 |
| `analyzer/recommender.py` | 기회 스코어링/랭킹 | 완료 |
| `data/repositories.py` | `MarketCacheRepository` 추가 | 완료 |
| `data/market_sync.py` | Background Sync Worker (Gamma→DB) | 완료 |
| `executor/negrisk_executor.py` | NegRisk 전략 실행 | Phase 3 |

---

## 이벤트 버스

### 이벤트 타입

| 이벤트 | 발행자 | 구독자 |
|---|---|---|
| `PRICE_UPDATE` | Scanner | Analyzer, Dashboard |
| `ARB_OPPORTUNITY` | Analyzer | Dashboard, Executor, Logger |
| `ARB_EXPIRED` | Analyzer | Dashboard |
| `ORDER_PLACED` | Executor | Dashboard, Logger |
| `ORDER_FILLED` | Executor | Dashboard, Tracker |
| `NEGRISK_EVENT_DISCOVERED` | Scanner | Dashboard |
| `BOT_STATUS` | Bot | Dashboard |
| `ERROR` | Any | Logger, Dashboard |

### 설계 원칙

- 핸들러는 비동기(`async`)
- 핸들러 실패가 다른 핸들러에 영향 없음 (격리)
- 새 전략/기능 추가 시 EventBus에 subscriber만 등록

---

## 서버 시작 순서 (startup)

```
1. init_async_db()           → DB 스키마 초기화 + 마이그레이션
2. MarketSyncWorker          → sync_once() 즉시 실행 (첫 데이터 적재)
                             → start() 백그라운드 루프 (5분 간격)
3. _start_scanners()         → PureArb + NegRisk 스캐너 (설정에 따라)
```

## 서버 종료 순서 (shutdown)

```
1. MarketSyncWorker.stop()   → 동기화 루프 중지 + Gamma 세션 닫기
2. _stop_scanners()          → 스캐너 태스크 cancel + 정리
```

---

## 프론트엔드 아키텍처

별도 문서 참조 (frontend/ 디렉터리).

### 핵심 결정

- **컴포넌트 추상화**: Domiex 직접 의존 방지 → `components/ui/` 래핑 레이어
- **상태 관리**: RTK Query (서버 상태) + Context (실시간) + useState (UI)
- **WebSocket**: App 레벨 싱글턴, 컴포넌트별 채널 구독/해제
- **라우팅**: react-router-dom, 사이드바 기반 탭 네비게이션

### 주요 페이지

| 경로 | 페이지 | 상태 |
|---|---|---|
| `/negrisk` | NegRisk 차익거래 대시보드 | Phase 1 |
| `/markets` | 전체 마켓 목록 | Phase 2 (완료) |
| `/markets/:slug` | 마켓 상세 | Phase 2 |
| `/arb` | Pure Arb 대시보드 | Phase 2 |
| `/settings` | 설정 | Phase 2 |
| `/portfolio` | 포트폴리오 | Phase 3 |

---

## 개발 Phase 요약

| Phase | 범위 | 상태 |
|---|---|---|
| Phase 1 | NegRisk 차익거래 (스캐너, 분석기, React UI) | 진행 중 |
| Phase 2 | 전체 마켓 + Pure Arb + 설정 | 진행 중 |
| Phase 3 | 지갑 연결 + 자동매수/매도 + 포트폴리오 | 설계 완료 |
| Phase 4 | 다중 사용자 + 앱 배포 | 미정 |

---

## 관련 문서

- [NegRisk 차익거래 전략](negrisk-strategy.md) — 전략 수식, 예시, karb Pure Arb 비교표
- [Phase 2 계획](phase2.md) — 전체 마켓 + Pure Arb + 설정
- [Phase 3 계획](phase3.md) — 지갑 연결 + 실행 + 포트폴리오
- [README](../README.md) — 설치 및 실행 방법
