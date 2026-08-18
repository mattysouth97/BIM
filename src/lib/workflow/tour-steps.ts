import { STAGE_LABELS, STAGE_ORDER } from "./stages";

export interface TwinTourStep {
  element: string;
  title: string;
  description: string;
}

/** First-visit copy for the Twin surface. Names the four real stages. */
export function twinTourSteps(isKo: boolean): TwinTourStep[] {
  const lang = isKo ? "ko" : "en";
  const pipeline = STAGE_ORDER.map((stage) => STAGE_LABELS[stage][lang]).join(
    " → ",
  );
  const count = STAGE_ORDER.length;

  return [
    {
      element: '[data-tour="stepper"]',
      title: isKo ? "작업 흐름" : "Workflow",
      description: isKo
        ? `${count}단계입니다: ${pipeline}. 지금은 이 건물의 트윈입니다.`
        : `${count} stages: ${pipeline}. You are on this building’s twin.`,
    },
    {
      element: '[data-tour="viewport"]',
      title: isKo ? "이 건물의 트윈" : "This building’s twin",
      description: isKo
        ? "10층 업무시설입니다. 1층 로비·휴게음식점, 기준층 오픈오피스와 회의실이 들어 있습니다. 돌려보고 아래 예산을 움직이면 에너지와 투자 숫자가 같이 바뀝니다."
        : "A 10-storey office. Lobby and café on the ground floor, open office and meeting rooms above. Rotate the model. Move the budget and the energy and investment numbers move with it.",
    },
    {
      element: '[data-tour="left-dock"]',
      title: isKo ? "씬" : "Scene",
      description: isKo
        ? "왼쪽 서랍입니다. 고른 개보수와 건물의 구성이 여기 있습니다."
        : "A left drawer. Selected measures and the building’s parts live here.",
    },
    {
      element: '[data-tour="right-dock"]',
      title: isKo ? "속성" : "Properties",
      description: isKo
        ? "오른쪽 서랍입니다. 물성과 에너지 가정은 여기, 트윈 위가 아닙니다."
        : "A right drawer. Materials and energy assumptions stay here, not on the twin.",
    },
  ];
}
