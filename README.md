<p align="center">
  <img src="assets/logo.svg" width="120" alt="Polly-Bot logo">
</p>

<h1 align="center">Polly-Bot</h1>

<p align="center">
  Polymarket 다중 선택(NegRisk) 이벤트에서 <b>N개 아웃컴을 한 세트로 묶어</b> 차익을 계산하는 탐지 엔진 + 실시간 대시보드
</p>

<p align="center">
  <a href="https://github.com/hadan-HwH/polly-bot/actions/workflows/frontend.yml"><img src="https://github.com/hadan-HwH/polly-bot/actions/workflows/frontend.yml/badge.svg" alt="frontend CI"></a>
</p>

---

## 목차

1. [프로젝트 정보](#1-프로젝트-정보)
2. [시작 가이드](#2-시작-가이드)
3. [기술 스택](#3-기술-스택)
4. [화면 구성 / API](#4-화면-구성--api)
5. [주요 기능](#5-주요-기능)
6. [아키텍처](#6-아키텍처)
7. [기타](#7-기타)

---

## 1. 프로젝트 정보

| 항목 | 내용 |
|---|---|
| 개발 기간 | 2026.03.22 ~ 03.30 |
| 형태 | 개인 프로젝트 |
| 담당 | 전략 명세, NegRisk 탐지 로직, React 대시보드 |
| 기반 | 오픈소스 봇 [karb](https://github.com/kmizzi/karb) 위에 확장 |
| 배포 | 없음 |

### 프로젝트 소개

Polymarket의 다중 선택 이벤트는 후보마다 YES/NO 마켓이 따로 거래됩니다.
오픈소스 봇 karb는 마켓 하나의 YES + NO 합만 보지만, 이벤트 전체를 한 세트로 묶으면 차익이 생기는 경우가 있습니다.
Polly-Bot은 **k개 아웃컴 전체**를 한 세트로 놓고 NegRisk 변환까지 반영해 차익을 계산하고, 탐지한 기회를 점수순으로 대시보드에 보여줍니다.

| | karb (기존) | Polly-Bot (추가) |
|---|---|---|
| 분석 단위 | 마켓 1개 | 이벤트 1개 (아웃컴 **k개**) |
| 차익 조건 | YES + NO 합 | 이벤트 전체의 YES 합 / NO 합 |
| 활용 성질 | YES + NO = 1 | 완전 세트 + **NegRisk 변환** |
| 수량 결정 | 오더북 2개 | 오더북 k개 중 가장 얕은 곳 기준 |
| 청산 | 만기 정산 | 변환 + merge로 **즉시 청산** |

---

## 2. 시작 가이드

### 요구 사항

| 대상 | 버전 |
|---|---|
| 프론트엔드 | Node.js 22, npm |
| 백엔드 (원 시스템) | Python 3.12+ |

### 설치 및 실행

프론트엔드는 이 저장소만으로 테스트·빌드됩니다.

```bash
git clone https://github.com/hadan-HwH/polly-bot.git
cd polly-bot/frontend
npm ci
npm test          # Vitest 49개
npm run build     # 타입체크 + 프로덕션 빌드
npm run dev       # 개발 서버 (/api 요청은 localhost:8000 백엔드로 프록시)
```

> 이 저장소는 포트폴리오용 **발췌본**입니다. Polly-Bot의 Python 모듈은 karb 원본 위에서 동작하므로 이 저장소만으로는 실행되지 않으며, 원 시스템에서는 아래 명령으로 실행합니다.

```bash
pollybot negrisk      # NegRisk 스캐너 (탐지 + 로그)
pollybot dashboard    # API 서버 + 대시보드
pollybot run          # 봇 실행 (기본 dry-run)
```

---

## 3. 기술 스택

**Language**

![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

**Backend**

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-E92063?style=flat-square&logo=pydantic&logoColor=white)
![asyncio](https://img.shields.io/badge/asyncio_·_WebSocket-4B5563?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

**Frontend**

![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Redux Toolkit](https://img.shields.io/badge/Redux_Toolkit-764ABC?style=flat-square&logo=redux&logoColor=white)
![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=flat-square&logo=reacttable&logoColor=white)
![ApexCharts](https://img.shields.io/badge/ApexCharts-008FFB?style=flat-square)

**Test & CI**

![pytest](https://img.shields.io/badge/pytest-0A9EDC?style=flat-square&logo=pytest&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?style=flat-square&logo=testinglibrary&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

---

## 4. 화면 구성 / API

### 화면 구성

| 화면 | 경로 | 설명 |
|---|---|---|
| Dashboard | `/dashboard` | 스캐너 · 지갑 상태와 최근 활동 |
| **Opportunities** | `/negrisk` | 탐지된 기회를 이벤트별 · 점수순으로 표시 |
| **Event Detail** | `/negrisk/:eventId` | 아웃컴별 호가 · 깊이와 **변환 시뮬레이터** |
| Markets | `/markets`, `/markets/:slug` | 전체 마켓 탐색과 실시간 오더북 |
| Pure Arb | `/arb` | 기존 2-아웃컴 전략 모니터링 |
| Portfolio | `/portfolio` | 포지션 · 손익 |
| Settings | `/settings` | 탐지 · 실행 임계값 설정 |

### API

NegRisk 관련 주요 엔드포인트입니다. 전체 목록은 [docs/architecture.md](docs/architecture.md#api-엔드포인트-전체)를 참고하세요.

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/negrisk-events` | NegRisk 이벤트 목록 + 아웃컴별 가격 |
| GET | `/api/negrisk-events/{eventId}` | 이벤트 상세 |
| GET | `/api/negrisk-arb` | 탐지된 기회와 점수 |
| GET | `/api/negrisk-near-miss` | 탈락한 기회와 사유 |
| GET | `/api/negrisk-stats` | 스캐너 · 탐지기 통계 |
| GET | `/api/negrisk-executions` | 실행 이력 |
| GET / PUT | `/api/settings` | 임계값 조회 · 변경 |

---

## 5. 주요 기능

### 5-1. N개 아웃컴 차익 계산 (핵심)

```math
\text{karb:}\quad p^{YES} + p^{NO} < 1
```

```math
\text{YES\_ARB:}\quad \sum_{i=1}^{k} p_i^{YES} < 1 - a
\qquad\qquad
\text{NO\_CONVERT\_ARB:}\quad \sum_{i=1}^{k} p_i^{NO} < (k-1) - a
```

`NO_CONVERT_ARB`가 핵심입니다. NegRisk 어댑터에서는 $NO_i \equiv \lbrace YES_j : j \ne i \rbrace$ 입니다.
그래서 k개 아웃컴의 NO를 1개씩 사서 변환하면 완전한 YES 세트가 k−1개 생기고, 이는 곧 k−1 USDC입니다.
비교 기준이 1이 아니라 **k−1**인 이유입니다.

```math
\Pi = j \left[ (k-1) - \sum_{i=1}^{k} p_i^{NO} \right] - \text{fees},
\qquad
j = \left\lfloor r \cdot \min_i d_i \right\rfloor
```

(`a`: 안전마진, `d_i`: 아웃컴 i의 목표가까지 누적 호가 물량, `r`: depth ratio, 기본 0.5)

**예시: karb에는 안 보이고 Polly-Bot에는 보이는 기회 (k = 4)**

| 아웃컴 | YES 매도호가 | NO 매도호가 | YES+NO (karb가 보는 값) |
|---|---|---|---|
| A | 0.43 | 0.58 | 1.01 |
| B | 0.32 | 0.69 | 1.01 |
| C | 0.22 | 0.79 | 1.01 |
| D | 0.14 | 0.87 | 1.01 |
| **합** | 1.11 | **2.93** | |

- **karb**: 4개 마켓 모두 YES+NO = 1.01 ≥ 1 → 기회 없음
- **Polly-Bot**: Σ NO = 2.93 < k−1 = 3 → NO 한 세트를 2.93 USDC에 사서 3 USDC로 청산, 세트당 0.07 USDC(수익률 2.39%)

청산은 NO 하나를 남기고 나머지만 변환한 뒤 merge하는 방식("하나 남기기")으로, 만기를 기다리지 않고 k−1 USDC를 바로 회수합니다.

### 5-2. 거짓 기회 걸러내기

실제 시장에서는 거짓 기회를 걸러내는 것이 핵심입니다.

- **활성 아웃컴 기준**: 사실상 결정되어 호가가 사라진 아웃컴은 제외하고 `k_active − 1`로 다시 계산합니다.
- **호가 없음 ≠ 0원**: YES 호가가 비어 있는 아웃컴이 있으면 YES_ARB를 거부합니다.
- **수량 j**: 가장 얕은 오더북 깊이의 50%만 사용합니다.
- **동적 안전마진**: `a = 예상 슬리피지 + 가스비 + 버퍼`
- **부분 체결 대응 (Retry-then-Hold)**: 기대값이 Unwind < Hold ≈ 0 < Retry이므로, 수익성을 재확인해 최대 2회 재시도하고 실패하면 보유합니다.

### 5-3. 추천 점수와 Near-miss

- ROI · 유동성 · 실행 가능성 · 마켓 규모 · 전략 선호 · 만기 근접도 6가지 요소로 점수를 매겨 순위를 정합니다.
- 조건은 만족했지만 탈락한 이벤트는 **사유와 함께 Near-miss로 기록**해 임계값 조정에 활용합니다.

### 5-4. 변환 시뮬레이터

Event Detail 화면에서 전략 · 수량 · 남길 NO를 바꾸면 비용과 순이익 · ROI를 즉시 다시 계산합니다.

---

## 6. 아키텍처

### 시스템 구조

```mermaid
flowchart LR
    G["Gamma API<br/>negRisk 이벤트 목록"] --> S["NegRiskScanner<br/>마켓 → 이벤트 단위로 묶기"]
    W["Polymarket WebSocket<br/>k개 아웃컴 실시간 호가"] --> S
    S -- PRICE_UPDATE --> B(("EventBus"))
    B --> D["NegRiskArbDetector<br/>YES_ARB / NO_CONVERT_ARB"]
    D --> R["Recommender<br/>6요소 점수"]
    D -. 탈락 사유 .-> N["Near-miss 기록"]
    R --> API["FastAPI<br/>REST API"]
    N --> API
    API --> UI["React 대시보드"]
```

기존 karb 코드는 그대로 두고 이벤트 버스(pub/sub)로 NegRisk 경로를 추가해, Pure Arb 경로와 병렬로 동작합니다.

### 프론트엔드 ↔ 백엔드 통신 흐름

```mermaid
sequenceDiagram
    participant UI as React 대시보드
    participant API as FastAPI (/api)
    participant PM as Polymarket

    PM-->>API: WebSocket 호가 스트림 (스캐너)
    loop 30초마다 (Opportunities)
        UI->>API: GET /negrisk-arb, /negrisk-events, /negrisk-near-miss ...
        API-->>UI: 점수순 기회 · 이벤트 · 탈락 사유
    end
    UI->>API: GET /negrisk-events/{eventId}
    API-->>UI: 아웃컴별 호가 · 깊이
    Note over UI: 변환 시뮬레이터는 브라우저에서 계산
    UI->>PM: Markets 상세는 CLOB WebSocket에 직접 연결 (실시간 오더북)
```

- 목록 화면은 REST 폴링, 마켓 상세는 Polymarket WebSocket 직접 연결입니다.
- UI 킷 의존은 `components/ui/` 래핑 레이어에 모았습니다.

### 디렉토리 구조

```
polly-bot/
├── docs/                          # 기획 문서
│   ├── negrisk-strategy.md        #   전략 명세: 수식 · 엣지 케이스 · 수량 결정 · 부분 체결 EV · UI 명세
│   ├── architecture.md            #   시스템 구조 · 데이터 흐름 · API 목록
│   └── phase1.md ~ phase3.md      #   단계별 구현 계획
├── src/karb/                      # NegRisk 모듈 (karb 패키지 확장)
│   ├── analyzer/
│   │   ├── negrisk_arb.py         #   YES_ARB / NO_CONVERT_ARB 탐지 · j · 안전마진 · near-miss
│   │   └── recommender.py         #   6요소 점수 · 순위
│   ├── scanner/negrisk_scanner.py #   negRisk 이벤트 수집 · 아웃컴 호가 구독
│   ├── api/negrisk_models.py      #   이벤트 · 기회 · 변환 계획 모델
│   ├── events/                    #   EventBus (pub/sub) · 이벤트 타입
│   ├── data/market_sync.py        #   마켓 백그라운드 동기화
│   └── utils/categorizer.py       #   마켓 카테고리 분류
├── tests/unit/                    # pytest 131개
└── frontend/src/
    ├── pages/                     # Dashboard · Opportunities · EventDetail · Markets · PureArb · Portfolio · Settings
    ├── components/negrisk/        # ConversionSimulator · PriceTable · StrategyBadge · TradePanel
    ├── components/ui/             # UI 킷 래핑 레이어 (DataTable · AppTabs · EventAccordion ...)
    ├── hooks/                     # 실시간 스트림 훅
    ├── lib/api/ · lib/ws/         # REST · WebSocket 클라이언트
    ├── types/                     # API 응답 타입
    └── __tests__/                 # Vitest 49개
```

---

## 7. 기타

### 어떻게 기획했나

1. **전략 문서부터 작성했습니다.** 수식 · 엣지 케이스 · UI 명세를 코드보다 먼저 확정했습니다.
2. **Phase로 나눠 구현했습니다.** 탐지 · 대시보드 → 전체 마켓 · 설정 → 실행 · 포트폴리오 순입니다.
3. **기존 코드는 그대로 두고 확장했습니다.**

### 개발 문서

| 문서 | 내용 |
|---|---|
| [negrisk-strategy.md](docs/negrisk-strategy.md) | 전략 명세 |
| [architecture.md](docs/architecture.md) | 시스템 구조와 API |
| [phase1.md](docs/phase1.md) | Phase 1: 탐지 · 대시보드 |
| [phase2.md](docs/phase2.md) | Phase 2: 전체 마켓 · 설정 |
| [phase3.md](docs/phase3.md) | Phase 3: 실행 · 포트폴리오 |

### 이 저장소에 담은 것 / 뺀 것

| 담은 것 | 경로 |
|---|---|
| NegRisk 탐지 · 스캐너 · 추천 모듈 (Python) | `src/karb/` |
| React 대시보드 | `frontend/src/` |
| 테스트 | `tests/`, `frontend/src/__tests__/` |
| 기획 문서 | `docs/` |

| 뺀 것 | 이유 |
|---|---|
| karb 원본 코드 | 업스트림 라이선스 없음 |
| 주문 실행 · 온체인 변환 | 공개 범위 제외 |
| UI 킷 스타일 | 유료 킷 라이선스 |

Python 테스트는 원 시스템에서 통과를 확인했고, 프론트엔드는 이 저장소만으로 빌드됩니다(UI 킷 스타일 제외).

### Credits

- [karb](https://github.com/kmizzi/karb): 기반 인프라 · Pure Arb 전략
- [Polymarket NegRisk CTF Adapter](https://github.com/Polymarket/neg-risk-ctf-adapter)
- Domiex: React 관리자 UI 킷
