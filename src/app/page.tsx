"use client"

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { ModeToggle } from "@/components/ui/mode-toggle"
import { Select } from "@/components/ui/select"
import type { ColumnDef } from "@tanstack/react-table"

type TradeType = "buy" | "sell"

interface Trade {
  id: string
  date: string
  type: TradeType
  amount: number
  price: number
  amountInput: string
  priceInput: string
}

const BASIC_DEDUCTION = 2_500_000
const TAX_RATE = 0.22
const numberFormatter = new Intl.NumberFormat("ko-KR")

const formatCurrency = (value: number) => numberFormatter.format(Math.round(value))

const createEmptyTrade = (): Trade => ({
  id: crypto.randomUUID(),
  date: new Date().toISOString().slice(0, 10),
  type: "buy",
  amount: 0,
  price: 0,
  amountInput: "",
  priceInput: "",
})

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([createEmptyTrade()])
  const deferredTrades = useDeferredValue(trades) // totals는 지연 계산, 테이블은 즉시 반영
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tradeCount = trades.length

  const handleDownloadTemplate = useCallback(() => {
    const csv =
      "date,type,amount,price\\n" +
      "2025-01-01,buy,1,500000\\n" +
      "2025-01-02,sell,0.5,600000\\n"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "cointax-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const totals = useMemo(() => {
    const totals = deferredTrades.reduce(
      (acc, trade) => {
        const gross = trade.amount * trade.price

        if (trade.type === "buy") {
          acc.totalBuy += gross
        } else {
          acc.totalSell += gross
        }

        return acc
      },
      { totalBuy: 0, totalSell: 0 }
    )

    const profit = totals.totalSell - totals.totalBuy
    const taxable = Math.max(0, profit - BASIC_DEDUCTION)
    const tax = taxable * TAX_RATE

    return { ...totals, profit, taxable, tax }
  }, [deferredTrades])

  const handleTradeChange = useCallback(
    <K extends keyof Trade>(id: string, key: K, value: Trade[K]) => {
      setTrades((prev) =>
        prev.map((trade) => (trade.id === id ? { ...trade, [key]: value } : trade))
      )
    },
    []
  )

  const handleAmountChange = useCallback((id: string, value: string) => {
    setTrades((prev) =>
      prev.map((trade) => {
        if (trade.id !== id) return trade
        const parsed = Number.parseFloat(value)
        return {
          ...trade,
          amountInput: value,
          amount: Number.isFinite(parsed) ? parsed : 0,
        }
      })
    )
  }, [])

  const handlePriceChange = useCallback((id: string, value: string) => {
    setTrades((prev) =>
      prev.map((trade) => {
        if (trade.id !== id) return trade
        const parsed = Number.parseFloat(value)
        return {
          ...trade,
          priceInput: value,
          price: Number.isFinite(parsed) ? parsed : 0,
        }
      })
    )
  }, [])

  const handleAddTrade = useCallback(() => {
    setTrades((prev) => [...prev, createEmptyTrade()])
  }, [])

  const handleDeleteTrade = useCallback((id: string) => {
    setTrades((prev) => (prev.length === 1 ? prev : prev.filter((trade) => trade.id !== id)))
  }, [])

  const parseCsvLine = (line: string) => {
    const result: string[] = []
    let current = ""
    let insideQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const next = line[i + 1]

      if (char === '"' && next === '"') {
        current += '"'
        i++
        continue
      }

      if (char === '"') {
        insideQuotes = !insideQuotes
        continue
      }

      if (char === "," && !insideQuotes) {
        result.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  const normalizeNumber = (value: string | undefined) => {
    if (!value) return NaN
    const cleaned = value.replace(/,/g, "").trim()
    return cleaned ? Number.parseFloat(cleaned) : NaN
  }

  const normalizeDate = (value: string | undefined) => {
    if (!value) return new Date().toISOString().slice(0, 10)
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return value.slice(0, 10)
  }

  const toTradeType = (raw: string | undefined): TradeType => {
    const value = (raw || "").toLowerCase()
    if (["매수", "bid", "buy", "입금", "deposit"].some((word) => value.includes(word))) {
      return "buy"
    }
    return "sell"
  }

  const parseCsvToTrades = (text: string): Trade[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length < 2) return []

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
    const getColumnIndex = (candidates: string[]) =>
      header.findIndex((col) => candidates.some((candidate) => col.includes(candidate)))

    const dateIdx = getColumnIndex(["date", "time", "timestamp", "일시", "거래일시"])
    const typeIdx = getColumnIndex(["side", "type", "trade", "구분", "거래유형"])
    const amountIdx = getColumnIndex(["amount", "qty", "quantity", "volume", "수량"])
    const priceIdx = getColumnIndex(["price", "가격", "단가"])
    const totalIdx = getColumnIndex(["total", "amount(krw)", "krw", "fill total", "거래금액"])

    const parsedTrades: Trade[] = []

    const getCell = (cells: string[], idx: number) =>
      idx >= 0 && idx < cells.length ? cells[idx] : undefined

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      if (!cells.length) continue

      const amount = normalizeNumber(getCell(cells, amountIdx))
      const price = normalizeNumber(getCell(cells, priceIdx))
      const total = normalizeNumber(getCell(cells, totalIdx))

      const resolvedAmount = Number.isFinite(amount) ? amount : NaN
      const resolvedPrice =
        Number.isFinite(price) && price > 0
          ? price
          : Number.isFinite(total) && Number.isFinite(amount) && amount > 0
            ? total / amount
            : NaN

      if (!Number.isFinite(resolvedAmount) || !Number.isFinite(resolvedPrice)) {
        continue
      }

      parsedTrades.push({
        id: crypto.randomUUID(),
        date: normalizeDate(getCell(cells, dateIdx)),
        type: toTradeType(getCell(cells, typeIdx)),
        amount: resolvedAmount,
        price: resolvedPrice,
        amountInput: Number.isFinite(resolvedAmount) ? String(resolvedAmount) : "",
        priceInput: Number.isFinite(resolvedPrice) ? String(resolvedPrice) : "",
      })
    }

    return parsedTrades
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    const content = String(reader.result || "")
    const importedTrades = parseCsvToTrades(content)
    if (importedTrades.length === 0) {
      setImportMessage("CSV에서 읽을 수 있는 행이 없습니다. 헤더를 확인해주세요.")
      return
    }
    setTrades((prev) => [...prev, ...importedTrades])
    setImportMessage(`CSV에서 ${importedTrades.length}건을 추가했습니다.`)
  }
  reader.readAsText(file, "utf-8")

  event.target.value = ""
}
const resultLine =
  totals.profit <= 0
    ? "현재 기준 예상 세금은 0원입니다."
    : `지금 팔면 예상 세금은 약 ${formatCurrency(totals.tax)}원입니다.`
const netAfterTax =
    totals.profit > 0 ? Math.max(0, totals.profit - totals.tax) : totals.profit

  const chartItems = [
    { label: "예상 이득", value: totals.profit, colorClass: "bg-primary", colorVar: "var(--primary)" },
    {
      label: "과세 소득",
      value: totals.taxable,
      colorClass: "bg-blue-500 dark:bg-blue-400",
      colorVar: "rgb(59, 130, 246)",
    },
    {
      label: "예상 납부액",
      value: totals.tax,
      colorClass: "bg-amber-500 dark:bg-amber-400",
      colorVar: "rgb(245, 158, 11)",
    },
    {
      label: "세금 공제 후 소득",
      value: netAfterTax,
      colorClass: "bg-emerald-500 dark:bg-emerald-400",
      colorVar: "rgb(16, 185, 129)",
    },
  ]

  const maxChartValue = Math.max(...chartItems.map((item) => Math.abs(item.value)), 1)
  const totalPositive = chartItems.reduce((acc, item) => acc + Math.max(0, item.value), 0) || 1

  const columns: ColumnDef<Trade>[] = useMemo(
    () => [
      {
        accessorKey: "date",
        header: "날짜",
        enableSorting: true,
        meta: { headerClassName: "w-[140px]", className: "pr-4" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <Input
              type="date"
              value={trade.date}
              onChange={(event) => handleTradeChange(trade.id, "date", event.target.value)}
            />
          )
        },
      },
      {
        accessorKey: "type",
        header: "구분",
        enableSorting: true,
        meta: { headerClassName: "w-[120px]", className: "pr-4" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <Select
              value={trade.type}
              onChange={(event) =>
                handleTradeChange(trade.id, "type", event.target.value as TradeType)
              }
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </Select>
          )
        },
      },
      {
        accessorKey: "amount",
        header: "수량",
        enableSorting: true,
        meta: { headerClassName: "w-[150px]", className: "pr-4" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={trade.amountInput}
              onChange={(event) => handleAmountChange(trade.id, event.target.value)}
              placeholder="0.00"
            />
          )
        },
      },
      {
        accessorKey: "price",
        header: "단가 (KRW)",
        enableSorting: true,
        meta: { headerClassName: "w-[160px]", className: "pr-4" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={trade.priceInput}
              onChange={(event) => handlePriceChange(trade.id, event.target.value)}
              placeholder="0"
            />
          )
        },
      },
      {
        id: "total",
        header: "합계 (KRW)",
        enableSorting: true,
        accessorFn: (row) => row.amount * row.price,
        meta: { headerClassName: "w-[160px]", className: "pr-4 text-right" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <span className="font-medium text-foreground/90">
              {formatCurrency(trade.amount * trade.price)} 원
            </span>
          )
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { headerClassName: "w-[60px]", className: "text-right" },
        cell: ({ row }) => {
          const trade = row.original
          return (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete trade"
              onClick={() => handleDeleteTrade(trade.id)}
              disabled={tradeCount === 1}
            >
              <Trash2 className="size-4" />
            </Button>
          )
        },
      },
    ],
    [handleAmountChange, handleDeleteTrade, handlePriceChange, handleTradeChange, tradeCount]
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/60 text-foreground">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <h1 className="text-xl font-bold leading-tight">크립토 세금 계산</h1>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              CSV 양식 다운로드
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              CSV 업로드
            </Button>
            <ModeToggle />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>
      </header>

                  <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-0">
        <section className="space-y-2">
          <h2 className="text-2xl font-bold leading-tight">거래 입력</h2>
          <p className="text-sm text-muted-foreground">
            양식을 다운로드해 채운 뒤 업로드하거나, 아래 테이블에 직접 입력하세요. 날짜 · 구분(매수/매도) · 수량 · 단가가 필요합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>필수 열: date(YYYY-MM-DD), type(buy/sell), amount, price(KRW).</li>
            <li>가격이 없고 총액만 있다면 총액 ÷ 수량으로 단가를 계산합니다.</li>
            <li>템플릿을 내려받아 그대로 채우면 가장 안전합니다.</li>
          </ul>
          {importMessage && (
            <p className="text-sm font-medium text-primary">{importMessage}</p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">거래 목록</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleAddTrade}>
                <Plus className="size-4" />
                거래 추가
              </Button>
            </div>
          </div>

          <DataTable
            data={trades}
            columns={columns}
            getRowId={(row) => row.id}
            emptyMessage="거래가 없습니다."
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm sm:p-6">
          <h3 className="text-xl font-semibold">요약</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">총 매수</p>
              <p className="text-lg font-semibold">{formatCurrency(totals.totalBuy)} 원</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">총 매도</p>
              <p className="text-lg font-semibold">{formatCurrency(totals.totalSell)} 원</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">실현 손익</p>
              <p className="text-lg font-semibold">{formatCurrency(totals.profit)} 원</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">과세표준</p>
              <p className="text-lg font-semibold">{formatCurrency(totals.taxable)} 원</p>
            </div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
            {resultLine}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">그래프로 보기</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>막대 그래프</span>
                </div>
                <div className="space-y-2">
                  {chartItems.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.label}</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.value)} 원
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${item.colorClass}`}
                          style={{ width: `${Math.min(100, Math.abs(item.value) / maxChartValue * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>원형 그래프</span>
                </div>
                <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
                  <svg viewBox="0 0 42 42" className="h-full w-full rotate-[-90deg]">
                    <circle
                      r="16"
                      cx="21"
                      cy="21"
                      fill="transparent"
                      stroke="var(--color-border)"
                      strokeWidth="6"
                      className="opacity-30"
                    />
                    {chartItems.reduce(
                      (acc, item) => {
                        const portion = Math.max(0, item.value) / totalPositive
                        const dash = portion * 100
                        const circle = (
                          <circle
                            key={item.label}
                            r="16"
                            cx="21"
                            cy="21"
                            fill="transparent"
                            stroke={item.colorVar}
                            strokeWidth="6"
                            strokeDasharray={`${dash} ${100 - dash}`}
                            strokeDashoffset={-acc.offset}
                          />
                        )
                        const nextOffset = acc.offset + dash
                        return { circles: [...acc.circles, circle], offset: nextOffset }
                      },
                      { circles: [] as React.ReactNode[], offset: 0 }
                    ).circles}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-xs font-semibold leading-tight">
                      합계<br />
                      {formatCurrency(totalPositive)} 원
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  {chartItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span
                        className={`inline-block h-3 w-3 rounded-sm ${item.colorClass}`}
                        style={{ backgroundColor: item.colorVar }}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm sm:p-6">
          <h3 className="text-xl font-semibold">FAQ</h3>
          <details className="group rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              CSV는 어떻게 사용하나요? <span className="text-primary">자세히 보기</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>상단의 CSV 양식을 다운로드한 뒤, date/type/amount/price 열에 맞춰 채우고 업로드하세요.</p>
              <p>type은 buy/sell(또는 매수/매도)으로 표기하세요. 가격은 KRW 기준입니다.</p>
              <p>단가가 없고 총액만 있으면 총액 ÷ 수량으로 단가를 계산합니다.</p>
              <p>업비트·바이낸스·바이빗·빗썸 CSV도 동일한 열 이름이 있으면 자동 매핑됩니다.</p>
            </div>
          </details>
          <details className="group rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              과세 기준과 공제는 어떻게 되나요? <span className="text-primary">자세히 보기</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>단순 모델: 기본공제 2,500,000원, 세율 22%(지방세 포함) 적용.</p>
              <p>과세소득 = max(0, 실현이익 - 기본공제), 예상세액 = 과세소득 × 0.22</p>
            </div>
          </details>
          <details className="group rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              실제 신고 시기는 언제인가요? <span className="text-primary">자세히 보기</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>현행 가상자산 과세안 기준, 연간 소득을 다음해 5월 종합소득세 신고 기간에 신고합니다.</p>
              <p>법령 변경 가능성이 있으니 최신 국세청 안내를 확인하세요.</p>
            </div>
          </details>
          <details className="group rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              수수료나 기타 비용은 반영되나요? <span className="text-primary">자세히 보기</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>현재 계산기는 수수료, 기타 공제 항목을 반영하지 않은 단순 모델입니다.</p>
              <p>정확한 신고를 위해서는 거래소 수수료, 원화 환산 시점 등을 별도 반영해야 합니다.</p>
            </div>
          </details>
          <details className="group rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              손실 이월이나 다른 공제는 적용되나요? <span className="text-primary">자세히 보기</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>이 도구는 손실 이월, 기타 세법상 특별공제를 지원하지 않습니다.</p>
              <p>실제 신고 시에는 세무 전문가 상담을 권장합니다.</p>
            </div>
          </details>
        </section>
      </main><footer className="border-t border-border/70 bg-background/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground sm:px-6 lg:px-0">
          <span></span>
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/dilrong_"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              <span className="font-medium text-foreground">Copyright 2025. dilrong_ All rights reserved.</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}








