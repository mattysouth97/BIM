"use client";

import { useForm, Controller } from "react-hook-form";
import { useMemo } from "react";
import { Search } from "lucide-react";

import regionData from "@/data/region-codes.json";
import bjdongData from "@/data/bjdong-codes.json";
import { useAppStore } from "@/store/app-store";

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

const bjdongMap = bjdongData as Record<string, { code: string; name: string }[]>;

export function AddressSearchForm({ onSearch, isLoading }: AddressSearchFormProps) {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";

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

  const sigunguOptions = useMemo(() => {
    if (!selectedSido) return [];
    return (regionData.sigungu as Record<string, { code: string; name: string }[]>)[selectedSido] ?? [];
  }, [selectedSido]);

  const bjdongOptions = useMemo(() => {
    if (!selectedSigungu) return [];
    return bjdongMap[selectedSigungu] ?? [];
  }, [selectedSigungu]);

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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border bg-card shadow-sm"
    >
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold">
          {isKo ? "주소 검색 (Address Search)" : "Address Search"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isKo
            ? "주소와 지번을 입력하여 건축물 정보를 검색합니다."
            : "Enter address and lot number to search building information."}
        </p>
      </div>

      <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 시/도 */}
        <div className="space-y-2">
          <Label>{isKo ? "시/도" : "Province"}</Label>
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
                  <SelectValue placeholder={isKo ? "시/도 선택" : "Select province"} />
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
          <Label>{isKo ? "시/군/구" : "City / District"}</Label>
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
                        ? isKo ? "시/군/구 선택" : "Select district"
                        : isKo ? "시/도를 먼저 선택" : "Select province first"
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
          <Label>{isKo ? "법정동" : "Dong"}</Label>
          <Controller
            control={control}
            name="bjdongCd"
            rules={{ required: isKo ? "법정동을 선택하세요" : "Select a dong" }}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={!selectedSigungu || bjdongOptions.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !selectedSigungu
                        ? isKo ? "시/군/구를 먼저 선택" : "Select district first"
                        : bjdongOptions.length === 0
                          ? isKo ? "동 데이터 없음" : "No dong data"
                          : isKo ? "법정동 선택" : "Select dong"
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
        <div className="space-y-2">
          <Label>{isKo ? "번 (본번)" : "Main Lot No."}</Label>
          <Input
            {...register("bun")}
            placeholder={isKo ? "예: 0012" : "e.g. 0012"}
            inputMode="numeric"
          />
        </div>

        {/* 지 */}
        <div className="space-y-2">
          <Label>{isKo ? "지 (부번)" : "Sub Lot No."}</Label>
          <Input
            {...register("ji")}
            placeholder={isKo ? "예: 0001" : "e.g. 0001"}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="flex justify-end border-t px-6 py-4">
        <Button type="submit" disabled={isLoading} className="gap-2">
          <Search className="h-4 w-4" />
          {isLoading
            ? isKo ? "검색 중..." : "Searching..."
            : isKo ? "검색" : "Search"}
        </Button>
      </div>
    </form>
  );
}
