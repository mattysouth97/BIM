// e2e/fixtures/ledger.ts
// P2-09 — minimal recorded data.go.kr building-ledger responses for e2e.
// PUBLIC data only, no API key. Shapes match the proxy route outputs
// (`{ items, totalCount, pageNo, numOfRows }`).

export const TITLE_RESPONSE = {
  items: [
    {
      mgmBldrgstPk: "e2e-pk-1",
      bldNm: "이투이테스트빌딩",
      platPlcNm: "서울특별시 중구 세종대로 110",
      newPlatPlc: "세종대로 110",
      sigunguCd: "11110",
      bjdongCd: "10100",
      platGbCd: "0",
      bun: "0001",
      ji: "0000",
      mainPurpsCd: "14000",
      mainPurpsCdNm: "업무시설",
      etcPurps: "",
      strctCd: "11",
      strctCdNm: "철근콘크리트구조",
      etcStrct: "",
      grndFlrCnt: 5,
      ugrndFlrCnt: 1,
      totArea: 1200,
      archArea: 300,
      platArea: 400,
      bcRat: 50,
      vlRat: 240,
      useAprDay: "20050101",
      pmsDay: "20040101",
      stcnsDay: "20040601",
      roofCd: "1",
      roofCdNm: "평지붕",
      heit: 15,
      regstrGbCd: "1",
      regstrGbCdNm: "일반",
      regstrKindCd: "1",
      regstrKindCdNm: "일반건축물",
    },
  ],
  totalCount: 1,
  pageNo: 1,
  numOfRows: 20,
};

/** A generic empty ledger payload for the secondary bldrgst endpoints. */
export const EMPTY_LEDGER = { items: [], totalCount: 0, pageNo: 1, numOfRows: 20 };
