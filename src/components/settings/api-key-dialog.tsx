"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import { useT } from "@/lib/i18n";
import { ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type ValidationStatus = "idle" | "checking" | "valid" | "invalid";

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
  const apiKey = useAppStore((state) => state.apiKey);
  const setApiKey = useAppStore((state) => state.setApiKey);
  const clearApiKey = useAppStore((state) => state.clearApiKey);
  const { t } = useT();
  const [inputValue, setInputValue] = useState(apiKey);
  const [validationStatus, setValidationStatus] =
    useState<ValidationStatus>("idle");
  const [validationMessage, setValidationMessage] = useState("");

  // Sync input when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setInputValue(apiKey);
      setValidationStatus("idle");
      setValidationMessage("");
    }
    onOpenChange(nextOpen);
  };

  const handleValidate = async () => {
    if (!inputValue.trim()) return;

    setValidationStatus("checking");
    setValidationMessage("");

    try {
      const res = await fetch(
        `/api/bldrgst/title?` +
          new URLSearchParams({
            sigunguCd: "11680",
            bjdongCd: "10300",
            numOfRows: "1",
            pageNo: "1",
          }),
        {
          headers: { "x-api-key": inputValue.trim() },
        }
      );

      const json = await res.json();

      if (res.ok && !json.error) {
        setValidationStatus("valid");
        setValidationMessage(t("API 키가 유효합니다.", "API key is valid."));
      } else {
        setValidationStatus("invalid");
        setValidationMessage(
          json.error || t("API 키가 유효하지 않습니다.", "API key is not valid.")
        );
      }
    } catch {
      setValidationStatus("invalid");
      setValidationMessage(
        t("검증 중 오류가 발생했습니다.", "An error occurred during validation.")
      );
    }
  };

  const handleSave = () => {
    setApiKey(inputValue.trim());
    onOpenChange(false);
  };

  const handleClear = () => {
    setInputValue("");
    clearApiKey();
    setValidationStatus("idle");
    setValidationMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("API 키 설정", "API Key Settings")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "공공데이터포털(data.go.kr)에서 발급받은 건축물대장 API 인증키를 입력하세요.",
              "Enter your Building Ledger API key from the Korea Open Data Portal (data.go.kr).",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* API key input */}
          <div className="space-y-2">
            <Label htmlFor="api-key">
              {t("API 인증키 (Service Key)", "API Service Key")}
            </Label>
            <Input
              id="api-key"
              type="password"
              placeholder={t("인증키를 붙여넣으세요...", "Paste your service key here...")}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setValidationStatus("idle");
                setValidationMessage("");
              }}
            />
          </div>

          {/* Validation status */}
          {validationStatus !== "idle" && (
            <div className="flex items-center gap-2 text-sm">
              {validationStatus === "checking" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t("검증 중...", "Validating...")}
                  </span>
                </>
              )}
              {validationStatus === "valid" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">{validationMessage}</span>
                </>
              )}
              {validationStatus === "invalid" && (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">{validationMessage}</span>
                </>
              )}
            </div>
          )}

          {/* P2-07: explicit API-key storage policy. */}
          <p className="text-xs text-muted-foreground">
            {t(
              "API 키는 이 브라우저의 로컬 저장소(localStorage)에만 저장되며 서버로 전송·기록되지 않습니다. 공용 컴퓨터에서는 사용 후 삭제하세요.",
              "Your API key is stored only in this browser's localStorage — never sent to or logged by our server. Clear it after use on shared computers.",
            )}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={
                !inputValue.trim() || validationStatus === "checking"
              }
            >
              {t("검증", "Validate")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!inputValue.trim()}
            >
              {t("저장", "Save")}
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              {t("삭제", "Clear")}
            </Button>
          </div>

          {/* Help link */}
          <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              {t("API 키 발급 안내", "How to get an API key")}
            </p>
            <p>
              {t(
                "공공데이터포털에서 '건축물대장정보 서비스'를 검색하여 활용 신청하세요.",
                "Search for 'Building Ledger Service' on the Korea Open Data Portal and apply for access.",
              )}
            </p>
            <a
              href="https://www.data.go.kr/data/15044713/openapi.do"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:text-primary/80"
            >
              data.go.kr
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
