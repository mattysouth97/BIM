"use client";

// src/components/campus/portfolio-dashboard.tsx
// Portfolio energy dashboard for campus / multi-building complexes.
// Shows aggregate metrics, worst performers, and a sortable/filterable building table.

import { useState, useMemo } from "react";
import { ArrowUpDown, TrendingUp, TrendingDown, Building2, Zap, Leaf } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aggregatePortfolio,
  sortBuildings,
  type BuildingMetrics,
  type SortKey,
} from "@/lib/campus/portfolio-aggregator";

interface PortfolioDashboardProps {
  buildings: BuildingMetrics[];
  title?: string;
}

/** Grade color — mirrors the energy-grade palette */
const GRADE_COLORS: Record<string, string> = {
  "1+++": "#006400",
  "1++": "#228B22",
  "1+": "#32CD32",
  "1": "#7CFC00",
  "2": "#ADFF2F",
  "3": "#FFD700",
  "4": "#FFA500",
  "5": "#FF6347",
  "6": "#DC143C",
  "7": "#8B0000",
};

function GradeBadge({ grade }: { grade: string }) {
  const bg = GRADE_COLORS[grade] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center justify-center rounded-md text-white font-bold text-xs px-2 py-0.5 min-w-[2.5rem]"
      style={{ backgroundColor: bg }}
    >
      {grade}
    </span>
  );
}

/** Summary metric card */
function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {sub && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      )}
    </Card>
  );
}

const ALL_GRADES = ["1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7"];

export function PortfolioDashboard({
  buildings,
  title = "Campus Energy Portfolio",
}: PortfolioDashboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("energyPerArea");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterGrade, setFilterGrade] = useState<string>("all");
  const [filterUseType, setFilterUseType] = useState<string>("all");

  const summary = useMemo(() => aggregatePortfolio(buildings), [buildings]);

  const useTypes = useMemo(
    () => Array.from(new Set(buildings.map((b) => b.useType))).sort(),
    [buildings]
  );

  const filteredBuildings = useMemo(() => {
    let result = buildings;
    if (filterGrade !== "all") {
      result = result.filter((b) => b.energyGrade === filterGrade);
    }
    if (filterUseType !== "all") {
      result = result.filter((b) => b.useType === filterUseType);
    }
    return sortBuildings(result, sortKey, sortDir);
  }, [buildings, filterGrade, filterUseType, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return (
      <span className="inline ml-1 text-[10px] font-bold">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  // Average grade: pick the median grade from sorted buildings by energyPerArea
  const avgGradeDisplay = useMemo(() => {
    if (buildings.length === 0) return "–";
    const sorted = sortBuildings(buildings, "energyPerArea", "asc");
    return sorted[Math.floor(sorted.length / 2)]?.energyGrade ?? "–";
  }, [buildings]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary.buildingCount} buildings &middot;{" "}
            {summary.totalArea.toLocaleString("en-US", { maximumFractionDigits: 0 })} m²
            total floor area &middot; Average grade{" "}
            <GradeBadge grade={avgGradeDisplay} />
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Total Energy Demand"
          value={`${(summary.totalEnergyDemand / 1000).toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} MWh/yr`}
          sub={`Avg ${summary.avgEnergyPerArea.toFixed(1)} kWh/m²·yr`}
        />
        <MetricCard
          icon={<Leaf className="h-3.5 w-3.5" />}
          label="Total CO₂ Emissions"
          value={`${summary.totalCO2.toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} tCO₂/yr`}
          sub={`Avg ${(summary.avgCO2PerArea * 1000).toFixed(1)} kgCO₂/m²·yr`}
        />
        <MetricCard
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Grade Distribution"
          value={`${summary.buildingCount} buildings`}
          sub={Object.entries(summary.gradeDistribution)
            .sort(([a], [b]) => ALL_GRADES.indexOf(a) - ALL_GRADES.indexOf(b))
            .map(([g, n]) => `${g}: ${n}`)
            .join(" · ")}
        />
      </div>

      {/* Worst Performers */}
      {summary.worstPerformers.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Worst Performers
            </CardTitle>
            <CardDescription>Highest energy demand per m²</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {summary.worstPerformers.map((b) => (
                <div
                  key={b.buildingId}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <GradeBadge grade={b.energyGrade} />
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.useType} · {b.era}
                      </p>
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-semibold text-destructive">
                      {b.energyPerArea.toFixed(1)} kWh/m²·yr
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.co2PerArea.toFixed(2)} tCO₂/m²·yr
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Best Performers */}
      {summary.bestPerformers.length > 0 && (
        <Card className="border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Best Performers
            </CardTitle>
            <CardDescription>Lowest energy demand per m²</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {summary.bestPerformers.map((b) => (
                <div
                  key={b.buildingId}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <GradeBadge grade={b.energyGrade} />
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.useType} · {b.era}
                      </p>
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-semibold text-green-600">
                      {b.energyPerArea.toFixed(1)} kWh/m²·yr
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.co2PerArea.toFixed(2)} tCO₂/m²·yr
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Building Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">All Buildings</CardTitle>
              <CardDescription>
                {filteredBuildings.length} of {buildings.length} shown
              </CardDescription>
            </div>
            {/* Filter / Sort Controls */}
            <div className="flex flex-wrap gap-2">
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="All grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All grades</SelectItem>
                  {ALL_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      Grade {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {useTypes.length > 1 && (
                <Select value={filterUseType} onValueChange={setFilterUseType}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue placeholder="All use types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All use types</SelectItem>
                    {useTypes.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("grade")}
                >
                  Grade
                  <SortIcon col="grade" />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("area")}
                >
                  Area (m²)
                  <SortIcon col="area" />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("energyPerArea")}
                >
                  kWh/m²·yr
                  <SortIcon col="energyPerArea" />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right pr-6"
                  onClick={() => toggleSort("co2PerArea")}
                >
                  tCO₂/m²·yr
                  <SortIcon col="co2PerArea" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBuildings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8 pl-6"
                  >
                    No buildings match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredBuildings.map((b) => (
                  <TableRow key={b.buildingId}>
                    <TableCell className="pl-6">
                      <p className="font-medium text-sm">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.useType} · {b.era}
                      </p>
                    </TableCell>
                    <TableCell>
                      <GradeBadge grade={b.energyGrade} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.area.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.energyPerArea.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums pr-6">
                      {b.co2PerArea.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
