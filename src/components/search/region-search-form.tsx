"use client";

import { useForm, Controller } from "react-hook-form";
import { useMemo } from "react";
import { Search } from "lucide-react";

import regionData from "@/data/region-codes.json";
import { useBjdongOptions } from "@/hooks/use-bjdong-options";
import { SEARCH_USE_FILTERS } from "@/lib/constants";
import { useT } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RegionSearchValues {
  sidoCd: string;
  sigunguCd: string;
  bjdongCd: string;
  mainPurpsCd?: string;
  numOfRows: number;
}

interface RegionSearchFormProps {
  onSearch: (params: {
    sigunguCd: string;
    bjdongCd: string;
    mainPurpsCd?: string;
    numOfRows: number;
    pageNo: number;
  }) => void;
  isLoading?: boolean;
}

export function RegionSearchForm({ onSearch, isLoading }: RegionSearchFormProps) {
  const { t } = useT();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegionSearchValues>({
    defaultValues: {
      sidoCd: "",
      sigunguCd: "",
      bjdongCd: "",
      mainPurpsCd: "",
      numOfRows: 20,
    },
  });

  const selectedSido = watch("sidoCd");
  const selectedSigungu = watch("sigunguCd");
  const { options: bjdongOptions, isLoading: isBjdongLoading } =
    useBjdongOptions(selectedSigungu);

  const sigunguOptions = useMemo(() => {
    if (!selectedSido) return [];
    return (regionData.sigungu as Record<string, { code: string; name: string }[]>)[selectedSido] ?? [];
  }, [selectedSido]);

  const onSubmit = (values: RegionSearchValues) => {
    onSearch({
      sigunguCd: values.sigunguCd,
      bjdongCd: values.bjdongCd,
      mainPurpsCd: values.mainPurpsCd === "all" ? undefined : values.mainPurpsCd || undefined,
      numOfRows: values.numOfRows,
      pageNo: 1,
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border bg-card shadow-sm"
    >
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold">
          {t("지역 검색 (Region Search)", "Region Search")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "시/도, 시/군/구, 법정동을 선택하여 건축물 목록을 조회합니다.",
            "Select province, city/district, and dong to browse building records.",
          )}
        </p>
      </div>

      <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 시/도 */}
        <div className="space-y-2">
          <Label>{t("시/도", "Province")}</Label>
          <Controller
            control={control}
            name="sidoCd"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val);
                  setValue("sigunguCd", "");
                  setValue("bjdongCd", "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("시/도 선택", "Select province")} />
                </SelectTrigger>
                <SelectContent>
                  {regionData.sido.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.sidoCd && (
            <p className="text-xs text-destructive">{errors.sidoCd.message}</p>
          )}
        </div>

        {/* 시/군/구 */}
        <div className="space-y-2">
          <Label>{t("시/군/구", "City / District")}</Label>
          <Controller
            control={control}
            name="sigunguCd"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val);
                  setValue("bjdongCd", "");
                }}
                disabled={!selectedSido}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      selectedSido
                        ? t("시/군/구 선택", "Select district")
                        : t("시/도를 먼저 선택", "Select province first")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sigunguOptions.map((sg) => (
                    <SelectItem key={sg.code} value={sg.code}>{sg.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.sigunguCd && (
            <p className="text-xs text-destructive">{errors.sigunguCd.message}</p>
          )}
        </div>

        {/* 법정동 */}
        <div className="space-y-2">
          <Label>{t("법정동", "Dong (Legal District)")}</Label>
          <Controller
            control={control}
            name="bjdongCd"
            rules={{ required: t("법정동을 선택하세요", "Select a dong") }}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={
                  !selectedSigungu ||
                  isBjdongLoading ||
                  bjdongOptions.length === 0
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !selectedSigungu
                        ? t("시/군/구를 먼저 선택", "Select district first")
                        : isBjdongLoading
                          ? t("법정동 데이터 불러오는 중...", "Loading dong data...")
                          : bjdongOptions.length === 0
                          ? t("동 데이터 없음", "No dong data")
                          : t("법정동 선택", "Select dong")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {bjdongOptions.map((d) => (
                    <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.bjdongCd && (
            <p className="text-xs text-destructive">{errors.bjdongCd.message}</p>
          )}
        </div>

        {/* 용도 */}
        <div className="space-y-2">
          <Label>{t("건물 용도", "Building Use")}</Label>
          <Controller
            control={control}
            name="mainPurpsCd"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("전체", "All types")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("전체 (All)", "All types")}</SelectItem>
                  {SEARCH_USE_FILTERS.map((f) => (
                    <SelectItem key={f.code} value={f.code}>
                      {t(`${f.ko} (${f.en})`, f.en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* 결과 수 */}
        <div className="space-y-2">
          <Label>{t("결과 수", "Per Page")}</Label>
          <Controller
            control={control}
            name="numOfRows"
            render={({ field }) => (
              <Select
                value={String(field.value)}
                onValueChange={(val) => field.onChange(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}{t("개", " rows")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="flex justify-end border-t px-6 py-4">
        <Button type="submit" disabled={isLoading} className="gap-2">
          <Search className="h-4 w-4" />
          {isLoading
            ? t("검색 중...", "Searching...")
            : t("검색", "Search")}
        </Button>
      </div>
    </form>
  );
}
