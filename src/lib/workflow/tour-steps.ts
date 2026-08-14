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
        ? "돌려보고, 아래 예산을 움직이면 에너지와 투자 숫자가 같이 바뀝니다."
        : "Rotate the model. Move the budget and the energy and investment numbers move with it.",
    },
    {
      element: '[data-tour="left-dock"]',
      title: isKo ? "씬" : "Scene",
      description: isKo
        ? "이 건물의 구성 요소입니다. 층을 고르면 뷰포트가 따라갑니다."
        : "This building’s parts. Pick a floor and the viewport follows.",
    },
    {
      element: '[data-tour="right-dock"]',
      title: isKo ? "속성" : "Properties",
      description: isKo
        ? "선택한 요소의 물성과 에너지 가정을 봅니다. 숫자는 같은 건물에서 나옵니다."
        : "Materials and energy assumptions for the selection. The numbers belong to this building.",
    },
  ];
}
