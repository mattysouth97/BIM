"use client";

import { useForm, Controller } from "react-hook-form";
import { useMemo } from "react";
import { Search } from "lucide-react";

import regionData from "@/data/region-codes.json";
import { useBjdongOptions } from "@/hooks/use-bjdong-options";
import { useT } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddressSearchValues {
  sidoCd: string;
  sigunguCd: string;
  bjdongCd: string;
  bun?: string;
  ji?: string;
}

interface AddressSearchFormProps {
  onSearch: (params: {
    sigunguCd: string;
    bjdongCd: string;
    bun?: string;
    ji?: string;
    numOfRows: number;
    pageNo: number;
  }) => void;
  isLoading?: boolean;
}

export function AddressSearchForm({ onSearch, isLoading }: AddressSearchFormProps) {
  const { t } = useT();

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AddressSearchValues>({
    defaultValues: {
      sidoCd: "",
      sigunguCd: "",
      bjdongCd: "",
      bun: "",
      ji: "",
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

  const onSubmit = (values: AddressSearchValues) => {
    onSearch({
      sigunguCd: values.sigunguCd,
      bjdongCd: values.bjdongCd,
      bun: values.bun || undefined,
      ji: values.ji || undefined,
      numOfRows: 20,
      pageNo: 1,
    });
  };

  // De-nested for the same reason as the region form: the tab above already
  // says "주소로", so a card, a heading and a description here only repeated it.
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {/* 시/도 */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t("시/도", "Province")}
          </Label>
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
                <SelectTrigger
                  size="sm"
                  className="w-full rounded-md border-border bg-background text-xs shadow-none"
                >
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
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t("시/군/구", "City / District")}
          </Label>
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
                <SelectTrigger
                  size="sm"
                  className="w-full rounded-md border-border bg-background text-xs shadow-none"
                >
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
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t("법정동", "Dong")}
          </Label>
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
                <SelectTrigger
                  size="sm"
                  className="w-full rounded-md border-border bg-background text-xs shadow-none"
                >
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

        {/* 번 */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t("번 (본번)", "Main Lot No.")}
          </Label>
          <Input
            {...register("bun")}
            placeholder={t("예: 0012", "e.g. 0012")}
            inputMode="numeric"
            className="h-8 rounded-md border-border bg-background px-2.5 text-xs shadow-none"
          />
        </div>

        {/* 지 */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t("지 (부번)", "Sub Lot No.")}
          </Label>
          <Input
            {...register("ji")}
            placeholder={t("예: 0001", "e.g. 0001")}
            inputMode="numeric"
            className="h-8 rounded-md border-border bg-background px-2.5 text-xs shadow-none"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isLoading}
          className="gap-1.5 rounded-md shadow-none"
        >
          <Search className="size-3.5" />
          {isLoading
            ? t("검색 중...", "Searching...")
            : t("검색", "Search")}
        </Button>
      </div>
    </form>
  );
}
