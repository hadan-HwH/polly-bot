# Polly-Bot: karb 기반 NegRisk 차익거래 봇

## 핵심 원칙

- **karb 기존 코드 전부 유지** (삭제 없음) -- Pure Arb 스캐너, Executor, 대시보드 등 모두 동작
- **추가만 한다** -- NegRisk 전략 로직 + React UI
- **탭/메뉴 기반 UI** -- 나중에 전체 마켓 탭, 포트폴리오 탭 등 계속 확장 가능
- **확장성** -- 향후 다른 사용자도 쓸 수 있는 대시보드로 발전 가능

## 우리가 만드는 것 두 가지

### A. NegRisk 변환 차익거래 계산 로직 (백엔드)

기존 karb의 실시간 인프라(WebSocket 6개, Gamma API, CLOB API) 위에 새 분석 레이어를 얹습니다.

### B. React 웹 프론트엔드 (UI)

탭 구조로 확장 가능한 웹 앱. Phase 1에서 NegRisk 탭부터 구현합니다.

## 아키텍처 기반 설계

페이지 구현 전에 먼저 세팅하는 것들입니다. 이후 어떤 탭/기능을 추가하더라도 이 기반 위에서 일관되게 확장됩니다.

### A. 백엔드 이벤트 버스 (`src/karb/events/`)

스캐너, 분석기, 대시보드, 실행기 사이의 결합도를 낮추는 pub/sub 패턴:

```python
class EventBus:
    """비동기 이벤트 버스 - 새 전략 추가 시 subscriber만 등록"""
    async def publish(self, event_type: str, data: Any) -> None: ...
    def subscribe(self, event_type: str, handler: Callable) -> None: ...
    def unsubscribe(self, event_type: str, handler: Callable) -> None: ...
```

이벤트 흐름:

```
Scanner --"price_update"--> EventBus ---> NegRiskAnalyzer (기회 탐지)
                                     ---> PureArbAnalyzer (기존 유지)
                                     ---> DashboardWS (UI 실시간 푸시)
                                     ---> Logger (기록)
                                     ---> Executor (자동매수, Phase 2)
```

새 전략을 추가할 때 기존 코드를 건드리지 않고 EventBus에 새 subscriber만 등록하면 됩니다.

### B. 프론트엔드 기반 세팅

#### B-1. 컴포넌트 추상화 레이어

Domiex 직접 의존을 막기 위한 3계층 구조:

```
frontend/src/
  components/
    ui/                              # 추상화 레이어 (Domiex 래핑)
      DataTable.tsx                  # Domiex Table.jsx 래핑 -> props 표준화
      AppTabs.tsx                    # Domiex Tab.jsx 래핑
      AppModal.tsx                   # Domiex Modal 래핑
      AppDrawer.tsx                  # Domiex Drawer 래핑
      AppToast.tsx                   # Domiex Toast 래핑
      StatCard.tsx                   # 통계 카드 (숫자 + 추이)
      PriceChip.tsx                  # 가격 표시 칩 (색상 변화)
      StatusBadge.tsx                # 상태 배지
    
    charts/                          # 차트 추상화
      LineChart.tsx                  # ApexCharts line 래핑
      BarChart.tsx
      DepthChart.tsx                 # 오더북 깊이 차트
    
    negrisk/                         # 도메인 컴포넌트 (ui/ 위에 구축)
      EventCard.tsx
      OpportunityRow.tsx
      PriceTable.tsx
      ConversionSimulator.tsx
```

`pages/` -> `components/negrisk/` -> `components/ui/` -> Domiex 원본
이렇게 하면 Domiex를 교체하더라도 `ui/` 레이어만 수정하면 됩니다.

#### B-2. API 레이어

```
frontend/src/
  lib/
    api/
      client.ts                     # axios 인스턴스 (baseURL, 인터셉터, 에러 핸들링, 리트라이)
      types.ts                      # API 응답 공통 타입 (ApiResponse<T>, PaginatedResponse<T>)
      negrisk.ts                    # getNegRiskEvents(), getNegRiskArb(), getNegRiskEventDetail()
      markets.ts                    # getAllMarkets(), getMarketDetail()
      portfolio.ts                  # getPositions(), getBalance()
      bot.ts                        # getBotStatus(), startBot(), stopBot()
```

모든 API 호출이 한 곳을 통과하므로 에러 핸들링, 로딩 상태, 토스트 알림이 일관됩니다.

#### B-3. WebSocket 관리

```
frontend/src/
  lib/
    ws/
      connection.ts                 # WebSocket 싱글턴 (자동 재연결, 지수 백오프 1s->2s->4s->30s)
      channels.ts                   # 채널별 구독/해제 관리
      types.ts                      # WS 메시지 타입
  
  hooks/
    useWebSocket.ts                 # 연결 상태 + 메시지 스트림
    useRealtimeData.ts              # 특정 채널 구독 + 자동 해제 (컴포넌트 라이프사이클)
    useNegRiskStream.ts             # NegRisk 가격 + 기회 스트림
```

핵심 요구사항:

- 탭 이동해도 WebSocket 끊기지 않음 (App 레벨에서 연결 유지)
- 컴포넌트 마운트/언마운트 시 필요한 채널만 자동 구독/해제
- 메시지 디바운싱 (초당 수십 개 업데이트를 16ms 프레임에 맞춰 배치)

#### B-4. 상태 관리 전략

용도별로 분리:

| 데이터 종류              | 도구                   | 이유                           |
| ------------------- | -------------------- | ---------------------------- |
| 서버 상태 (REST API 응답) | RTK Query            | 캐싱, 재요청, 무효화 자동              |
| 실시간 상태 (WS 가격/기회)   | Context + useReducer | 빈번한 업데이트에 Redux 미들웨어 오버헤드 회피 |
| UI 상태 (모달, 필터, 정렬)  | useState (로컬)        | 컴포넌트 내부에서만 필요                |
| 글로벌 앱 상태 (테마, 설정)   | Redux Toolkit        | Domiex 기존 패턴 유지              |

#### B-5. 타입 시스템

```
frontend/src/
  types/
    api.ts                          # 공통 (ApiResponse, PaginatedResponse, ErrorResponse)
    negrisk.ts                      # NegRiskEvent, NegRiskArbOpportunity, NoCombination
    market.ts                       # Market, MarketPrices, OrderBookEntry
    ws.ts                           # WsMessage, PriceUpdate, ArbAlert
    bot.ts                          # BotStatus, BotConfig
```

백엔드 Pydantic 모델과 1:1 매핑을 유지합니다. 추후 코드 생성 자동화 가능.

#### B-6. 성능 패턴

- **가상화**: `@tanstack/react-virtual` -- 수백 개 마켓 행을 렌더링할 때 뷰포트 내 DOM만 생성
- **메모이제이션**: `React.memo` + `useMemo` + `useCallback` -- 가격 업데이트 시 관련 행만 리렌더
- **디바운싱**: WS 메시지를 `requestAnimationFrame` 주기로 배치 처리
- **코드 스플리팅**: `React.lazy()` -- 탭별 번들 분리 (Phase 2 탭은 접근 전까지 로드 안 함)
- **에러 바운더리**: 페이지 단위 `ErrorBoundary` -- 한 탭 에러가 다른 탭에 영향 안 줌

## 프로젝트 구조

```
polly-bot/
  pyproject.toml                     # karb 의존성 그대로 + React 빌드 스크립트
  .env.example

  src/karb/                          # karb 전체 유지
    api/
      gamma.py                       # [유지] Gamma API
      websocket.py                   # [유지] WebSocket 6개 병렬
      clob.py                        # [유지] CLOB REST
      models.py                      # [확장] NegRisk 모델 추가

    scanner/
      realtime_scanner.py            # [유지] Pure Arb 실시간 스캐너
      market_scanner.py              # [유지] 폴링 스캐너
      negrisk_scanner.py             # [추가] NegRisk 이벤트 단위 스캐너

    analyzer/
      arbitrage.py                   # [유지] Pure Arb 탐지
      negrisk_arb.py                 # [추가] NegRisk 변환 차익거래 탐지
      recommender.py                 # [추가] 기회 스코어링/랭킹

    executor/
      executor.py                    # [유지] 주문 실행
      async_clob.py                  # [유지] 비동기 CLOB (HTTP/2)
      signer.py                      # [유지] EIP-712 서명
      redemption.py                  # [유지] 포지션 상환
      negrisk_executor.py            # [추가] NegRisk 변환 실행 (Phase 2)

    dashboard/
      app.py                         # [확장] NegRisk API 엔드포인트 추가
      templates/dashboard.html       # [유지] 기존 HTML 대시보드 (레거시)

    bot.py                           # [확장] NegRisk 봇 모드 추가
    config.py                        # [확장] NegRisk 설정 추가
    cli.py                           # [확장] NegRisk 관련 커맨드 추가

    data/                            # [유지] SQLite
    tracking/                        # [유지] 포지션/잔고
    notifications/                   # [유지] Slack
    utils/                           # [유지] 로깅

  frontend/                          # [추가] Domiex 기반 React 앱
    package.json                     # Domiex 의존성 + 우리 추가분
    vite.config.ts
    plugins/pixeleyezui/             # Domiex 디자인 시스템 플러그인
    src/
      App.tsx
      assets/css/tailwind.css        # Domiex 테마 시스템
      layout/                        # Domiex Layout/Sidebar/Topbar (수정)
        Layout.tsx
        Sidebar.tsx
        Topbar.tsx
      routes/
        allRoutes.tsx                # 우리 라우트로 교체
      pages/
        negrisk/
          Opportunities.tsx          # Phase 1: NegRisk 차익거래 기회 목록
          EventDetail.tsx            # Phase 1: 이벤트 상세 + 변환 시뮬레이터
        markets/
          AllMarkets.tsx             # Phase 2: 전체 마켓 실시간 가격판
        arb/
          PureArbAlerts.tsx          # Phase 2: Pure Arb 알림 현황
        portfolio/
          Portfolio.tsx              # Phase 2: 포지션/잔고/PnL
      components/
        CustomComponents/            # Domiex Table, Tabs, Modal, Toast 등
        negrisk/                     # 우리 커스텀 NegRisk 컴포넌트
          EventCard.tsx
          OpportunityRow.tsx
          PriceTable.tsx
          ConversionSimulator.tsx
      hooks/
        useWebSocket.ts              # 실시간 데이터 스트림
        useNegRiskEvents.ts
        useArbitrage.ts
      slices/                        # Redux (Domiex 패턴 따라감)
        negriskSlice.ts
      lib/
        api.ts                       # 백엔드 API 호출
```

## 백엔드 상세 (추가하는 것만)

### 1. NegRisk 이벤트 스캐너 (`scanner/negrisk_scanner.py`)

기존 `realtime_scanner.py`의 WebSocket 인프라를 재사용하되, 이벤트 단위 그룹화를 추가합니다.

```python
class NegRiskEventTracker:
    """NegRisk 이벤트의 모든 아웃컴을 하나의 단위로 추적"""
    event_id: str
    title: str
    markets: list[Market]
    prices: dict[str, MarketPrices]
```

Gamma API에서 `negRisk=true`인 이벤트를 수집하고, 각 이벤트 내 모든 마켓의 토큰을 WebSocket으로 구독합니다.

### 2. 차익거래 탐지기 (`analyzer/negrisk_arb.py`)

**두 전략을 동시에 탐지**합니다. 가격 업데이트 시 즉시 실행:

**Strategy A (YES_ARB)**:

- 조건: Σ p_YES_i < 1 - a
- 수익: j × (1 - Σ p_YES_i)
- 청산: 완전 YES 세트 merge

**Strategy B (NO_CONVERT_ARB)**:

- 조건: Σ p_NO_i < (k-1) - a
- 수익: j × ((k-1) - Σ p_NO_i)
- 청산: "하나 남기기" → NO+YES merge + 완전 세트 merge (즉시)
- 유지할 NO 선택: 유동성 최적 기준

**공통 검증**:

- 오더북 깊이 기반 j_max 계산 (가장 유동성 낮은 아웃컴이 병목)
- 슬리피지 시뮬레이션 (effective_price vs best_ask)
- 동적 안전마진 (슬리피지 + 가스비 + 버퍼)
- 양쪽 전략 수익 비교 → 더 높은 ROI 전략 우선 추천

전략 로직 상세: [docs/negrisk-strategy.md](negrisk-strategy.md)

### 3. 추천 시스템 (`analyzer/recommender.py`)

탐지된 기회를 다음 기준으로 스코어링:

- ROI (수익률)
- 유동성 (모든 아웃컴 오더북 깊이의 최솟값)
- 실행 가능성 (슬리피지 추정, j_max 대비 실제 필요량)
- 마켓 크기 (총 거래량)
- 전략 유형 (NO_CONVERT_ARB 우선 — 즉시 청산 가능)
- 만기 임박도 (YES_ARB의 경우 만기 가까울수록 가점)

### 4. 대시보드 API 확장 (`dashboard/app.py`)

기존 엔드포인트 전부 유지 + 추가:

- `GET /api/negrisk-events` - NegRisk 이벤트 목록 + 각 아웃컴 실시간 가격
- `GET /api/negrisk-arb` - 현재 탐지된 NegRisk 차익거래 기회
- `GET /api/negrisk-events/{id}` - 특정 이벤트 상세 (모든 아웃컴 가격 테이블)
- `WS /api/ws/negrisk` - NegRisk 가격 + 기회 실시간 스트림

## React 프론트엔드 상세

### UI 킷: Domiex (Pixelio)

유료 Domiex React UI 킷(Admin)을 기반으로 프론트엔드를 구축합니다. Figma 디자인을 MCP로 참고합니다.

> 공개 저장소에는 킷 라이선스상 킷에서 가져온 파일(`plugins/`, `assets/css/` 테마)을 포함하지 않았습니다.

**Domiex 스택** (우리와 동일):

- React 19 + Vite 6 + Tailwind CSS v4
- TanStack Table (`@tanstack/react-table`)
- ApexCharts + ECharts
- react-router-dom v7
- Redux Toolkit
- react-hook-form
- lucide-react (아이콘)

**Domiex에서 가져올 것들**:

- `components/CustomComponents/Table/Table.jsx` -- TanStack Table 래퍼 (기회 목록, 가격 테이블)
- `components/CustomComponents/Tabs/Tab.jsx` -- 탭 컴포넌트
- `components/CustomComponents/Modal/`, `Drawer/`, `Toast/` -- UI 인터랙션
- `layout/Layout.jsx`, `Sidebar.jsx`, `Topbar.jsx` -- 앱 셸 (사이드바 + 탑바)
- `views/dashboards/analyticsDashboards/` -- 대시보드 레이아웃 참고
- `views/widgets/cards/` -- 카드 위젯
- `views/apexcharts/` -- 차트 패턴
- `assets/css/tailwind.css` + `plugins/pixeleyezui/` -- 디자인 시스템/테마
- `slices/` -- Redux 패턴 참고

**프론트엔드 프로젝트 초기화 방식**:
Domiex의 `Admin/` 구조를 `frontend/`로 가져온 뒤, 불필요한 데모 페이지를 제거하고 우리 페이지로 교체합니다.
이렇게 하면 레이아웃, 라우팅, 테마, 컴포넌트 시스템을 처음부터 만들 필요 없이 바로 비즈니스 로직에 집중할 수 있습니다.

### 탭 구조 (확장 가능)

```
[NegRisk 차익거래]  [전체 마켓]  [Pure Arb]  [포트폴리오]  [설정]
     Phase 1          Phase 2    Phase 2     Phase 2     Phase 2
```

### Phase 1: NegRisk 탭

**NegRisk Opportunities 페이지**:

- 실시간 차익거래 기회 목록 (TanStack Table + WebSocket 자동 업데이트)
- 각 기회에 **전략 배지** 표시: `YES_ARB` (파랑) / `NO_CONVERT_ARB` (초록) / `BOTH` (보라)
- 각 기회: 이벤트명, 전략 배지, Σ가격, 한도, **마진($+%)**, j_max, 유동성 게이지
- 정렬 (ROI순 / 유동성순 / 전략별) + 필터 (카테고리, 최소 ROI, 전략 유형)
- Domiex Card 위젯으로 요약 통계 (총 기회 수, 최고 ROI, 평균 수익, YES_ARB/NO_ARB 비율)
- **계산 상세 패널** (기회 행 클릭 시 펼침):
  - 적용된 전략 + 수익 조건 충족 여부 (✓/✗)
  - 각 아웃컴 YES/NO 가격 테이블
  - 단계별 실행 계획 (구매 → 변환 → merge → 수익)
  - 안전마진 계산 (슬리피지 + 가스비 + 버퍼)

**Event Detail 페이지** (기회 클릭 시):

- 이벤트 내 모든 아웃컴의 YES/NO 가격 실시간 테이블 (TanStack Table)
- **두 전략 동시 표시**: YES_ARB 조건과 NO_CONVERT_ARB 조건 각각의 충족 여부 + 수익 비교
- **변환 시뮬레이터**: j 슬라이더, "유지할 NO" 선택 드롭다운 → 실시간 수익/비용 재계산
- 오더북 깊이 시각화 (ApexCharts)
- 가격 추이 차트 (ECharts line chart)
- 전략 문서 링크 (docs/negrisk-strategy.md 연결)

### Phase 2 (이후 추가):

- 전체 마켓 탭: 모든 활성 마켓 실시간 가격판
- Pure Arb 탭: 기존 karb 대시보드 기능을 React로 이관
- 포트폴리오 탭: 포지션, 잔고, PnL 차트
- 설정 탭: .env 설정 UI화

## 개발자 관점 분석

### 구현 복잡도

| 모듈              | 난이도    | 예상 규모     | 핵심 리스크             |
| --------------- | ------ | --------- | ------------------ |
| 이벤트 버스          | Low    | ~150 LOC  | 메모리 누수 (구독 해제 누락)  |
| NegRisk 스캐너     | Medium | ~300 LOC  | Gamma API 응답 형식 변경 |
| NegRisk 차익거래 탐지 | High   | ~400 LOC  | 수학 로직 오류 -> 잘못된 매수 |
| 추천 시스템          | Medium | ~200 LOC  | 스코어링 가중치 튜닝        |
| 대시보드 API 확장     | Low    | ~200 LOC  | 기존 API와의 라우트 충돌    |
| 프론트엔드 기반        | Medium | ~1500 LOC | Domiex 호환성 이슈      |
| NegRisk UI 페이지  | Medium | ~1000 LOC | 실시간 렌더링 성능         |

### 테스트 전략

karb에는 pytest 설정만 있고 실제 테스트가 없습니다 (`tests/` 디렉토리 부재, `scripts/`에 수동 통합 테스트만 존재).
우리는 처음부터 테스트를 같이 작성합니다.

**백엔드 테스트 구조:**

```
tests/
  unit/
    test_negrisk_arb.py             # 차익거래 계산 로직 (가장 중요)
    test_recommender.py             # 스코어링 로직
    test_eventbus.py                # 이벤트 발행/구독
    test_negrisk_models.py          # 모델 유효성 검증
  integration/
    test_negrisk_scanner.py         # Gamma API mock -> 이벤트 수집
    test_dashboard_api.py           # FastAPI TestClient로 엔드포인트 검증
    test_ws_stream.py               # WebSocket 스트림 통합 테스트
  fixtures/
    negrisk_events.json             # 테스트용 NegRisk 이벤트 데이터
    market_prices.json              # 가격 스냅샷
    orderbook_depth.json            # 오더북 데이터
```

**핵심 테스트 케이스 (차익거래 로직):**

- 수익 기회가 있는 경우 올바르게 탐지하는지
- 수수료 차감 후 수익이 음수면 기회로 판정하지 않는지
- 유동성 부족 시 (오더북 깊이 < 최소 주문) 필터링하는지
- N개 아웃컴 이벤트에서 모든 타겟 조합을 정확히 생성하는지
- 가격이 동시에 변경될 때 race condition 없는지
- 소수점 정밀도 (Decimal) 오류 없는지
- 빈 오더북, 단일 아웃컴, 극단적 가격 등 엣지 케이스

**프론트엔드 테스트:**

```
frontend/
  src/__tests__/
    components/
      DataTable.test.tsx            # 공통 컴포넌트 렌더링
      PriceTable.test.tsx           # 가격 테이블 업데이트
    hooks/
      useWebSocket.test.ts          # WS 연결/재연결/구독 해제
    lib/
      api.test.ts                   # API 레이어 에러 핸들링
      ws/connection.test.ts         # WS 싱글턴, 백오프 로직
    pages/
      Opportunities.test.tsx        # 기회 목록 렌더링 + 정렬/필터
  vitest.config.ts
```

도구: pytest + pytest-asyncio (백엔드), Vitest + React Testing Library (프론트엔드)

**커버리지 목표:**

- 차익거래 계산 로직: 95%+ (돈이 걸려있음)
- API 레이어: 80%+
- UI 컴포넌트: 70%+
- 전체: 75%+

### 에러 핸들링 & 복원력

karb의 에러 핸들링은 bare try/except 기반입니다. 커스텀 예외 체계를 추가합니다.

**백엔드 예외 계층:**

```python
# src/karb/exceptions.py
class PollyBotError(Exception):
    """기본 예외"""

class ApiError(PollyBotError):
    """외부 API 호출 실패"""
    status_code: int
    api_name: str  # "gamma", "clob", "polymarket_ws"

class WebSocketError(PollyBotError):
    """WebSocket 연결/메시지 오류"""

class ArbitrageError(PollyBotError):
    """차익거래 계산/실행 오류"""

class InsufficientLiquidityError(ArbitrageError):
    """유동성 부족"""

class ExecutionError(PollyBotError):
    """주문 실행 실패"""
```

**복원력 패턴:**

| 장애 상황            | 대응                                 |
| ---------------- | ---------------------------------- |
| WebSocket 끊김     | 지수 백오프 재연결 (1s->2s->4s->30s) + 재구독 |
| Gamma API 500 에러 | 3회 리트라이 + 캐시된 이벤트 목록 사용            |
| CLOB API 타임아웃    | 주문 취소 + 재시도 (멱등성 보장)               |
| 가격 데이터 지연 (>5s)  | UI에 "stale data" 경고 표시 + 기회 판정 중지  |
| 계산 예외            | 해당 이벤트만 스킵 + 에러 로그 + 알림            |
| DB 쓰기 실패         | 메모리 버퍼 유지 + 백그라운드 리트라이             |

### CI/CD

GitHub Actions 기반으로 구성합니다.

```
.github/
  workflows/
    ci.yml                          # PR/push 시 자동 실행
    deploy.yml                      # main 머지 시 (향후)
```

**ci.yml 파이프라인:**

```yaml
# 트리거: push to main, PR
jobs:
  backend:
    - Python 3.12 설치
    - pip install -e ".[dev]"
    - ruff check + ruff format --check (린팅)
    - mypy --strict (타입 체크)
    - pytest --cov=karb --cov-report=xml (테스트 + 커버리지)

  frontend:
    - Node 20 설치
    - npm ci
    - npm run lint (ESLint)
    - npm run type-check (tsc --noEmit)
    - npm run test (Vitest)
    - npm run build (빌드 성공 확인)
```

**pre-commit hooks:**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ruff-check
      - id: ruff-format
      - id: mypy
      - id: eslint
      - id: tsc-check
```

**빌드 시간 예상:** 백엔드 ~30s + 프론트엔드 ~45s = 전체 ~75s (병렬 실행)

### 문서화

**즉시 작성 (Step 0):**

- `README.md` -- 프로젝트 개요, 로컬 설정 방법, 실행 방법
- `.env.example` -- 필요한 환경변수 + 설명 주석
- `CONTRIBUTING.md` -- 코드 스타일, 브랜치 전략, PR 규칙

**기반 세팅 시 작성 (Step 1):**

- `docs/architecture.md` -- 시스템 아키텍처 다이어그램 + 데이터 흐름
- `docs/api.md` -- 백엔드 API 엔드포인트 명세 (자동 생성: FastAPI OpenAPI)
- `docs/negrisk-strategy.md` -- NegRisk 차익거래 전략 설명 (비개발자도 이해 가능하게)

**기능 구현 시 (Step 2-3):**

- 각 모듈 docstring (Python) + JSDoc (TypeScript)
- ADR (Architecture Decision Record) 필요 시 작성:
  - ADR-001: 이벤트 버스 vs 직접 호출
  - ADR-002: RTK Query vs React Query
  - ADR-003: Domiex 컴포넌트 추상화 전략

### 리스크 & 의존성

**기술적 리스크:**

| 리스크                  | 확률  | 영향  | 대응                             |
| -------------------- | --- | --- | ------------------------------ |
| Polymarket API 변경/중단 | 중   | 높음  | API 응답을 인터페이스로 추상화, 변경 감지 모니터링 |
| NegRisk 계산 로직 오류     | 중   | 높음  | 단위 테스트 95%+, 시뮬레이션 모드 우선       |
| WebSocket 연결 불안정     | 높   | 중   | 자동 재연결 + 상태 복구 + 재구독           |
| Domiex 업데이트 호환성      | 낮   | 중   | 추상화 레이어로 격리, 버전 고정             |
| 실시간 UI 성능 저하         | 중   | 중   | 가상화 + 디바운싱 + 프로파일링             |

**외부 의존성:**

- Polymarket CLOB API (주문)
- Polymarket Gamma API (마켓 데이터)
- Polymarket WebSocket (실시간 가격)
- Polygon 네트워크 (NegRisk 변환, Phase 2)

**블로커:**

- Polymarket API 키 발급 필요 (CLOB 인증)
- Polygon 지갑 + USDC 잔고 필요 (실제 거래 시)

### 보안 고려사항

- `.env`에 개인키/API 키 저장 -> `.gitignore`에 반드시 포함
- 프론트엔드에 민감 정보 노출 금지 (개인키는 백엔드에서만 처리)
- 향후 다중 사용자 시: 인증/인가 레이어 추가 필요 (JWT + 역할 기반)
- 입력 검증: 모든 API 엔드포인트에 Pydantic 모델 사용
- Rate limiting: API/WS 호출 빈도 제한 (Polymarket 제한 준수)

## 구현 순서

### Step 0: 프로젝트 셋업

1. karb 복사 (전체 유지)
2. git 초기화 + .gitignore + README.md + .env.example
3. pre-commit hooks 설정
4. GitHub repo 생성 + CI 파이프라인

### Step 1: 기반 세팅 (페이지 구현 전)

1. 백엔드: 예외 체계 (`exceptions.py`) + 이벤트 버스 (`events/`)
2. 백엔드: NegRisk 데이터 모델 (Pydantic) + 테스트 fixtures
3. 프론트엔드 기반 세팅:
   - Domiex Admin 가져오기 + 데모 페이지 정리
   - 컴포넌트 추상화 레이어 (`components/ui/`)
   - API 레이어 (`lib/api/`)
   - WebSocket 관리 (`lib/ws/`)
   - 타입 정의 (`types/`) -- 백엔드 Pydantic과 동기화
   - 상태 관리 구조 (RTK Query + Context)
   - 앱 셸 (Sidebar 메뉴 우리 탭으로 교체)
   - Vitest + React Testing Library 설정
4. 문서: `docs/architecture.md`, `docs/negrisk-strategy.md`

### Step 2: 백엔드 NegRisk 로직 (테스트 동반)

1. NegRisk 이벤트 스캐너 구현 + `test_negrisk_scanner.py`
2. NegRisk 차익거래 탐지기 구현 + `test_negrisk_arb.py` (커버리지 95%+)
3. 추천 시스템 구현 + `test_recommender.py`
4. bot.py에 NegRisk 모드 통합
5. 대시보드 API 확장 + `test_dashboard_api.py`

### Step 3: 프론트엔드 Phase 1

1. NegRisk Opportunities 페이지 + 테스트
2. NegRisk Event Detail 페이지 + 테스트

### Phase 2 (이후)

1. 전체 마켓, Pure Arb, 포트폴리오 탭
2. NegRisk 자동 매수/매도 Executor
3. 다중 사용자 인증/인가 (확장 시)

## 참고

- [karb](https://github.com/kmizzi/karb) - 기존 인프라 전체 재사용
- Domiex React UI 킷 (ThemeForest) - 프론트엔드 UI 기반
- [NegRisk Adapter 문서](https://docs.polymarket.com/advanced/neg-risk)
- [NegRisk Adapter 소스코드](https://github.com/Polymarket/neg-risk-ctf-adapter)
- [Polymarket WebSocket 문서](https://docs.polymarket.com/market-data/websocket/overview)
