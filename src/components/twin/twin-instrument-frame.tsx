"use client";

import { useId, useState } from 'react';
import { BarChart3, SlidersHorizontal, Settings, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CanvasDrawer } from '@/components/viewer/canvas-drawer';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';

/** Bottom sheets on mobile; right-side drawers on desktop. One open at a time. */
export function TwinInstrumentFrame({ top, bottom, className, workspaceControls = false }: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
  workspaceControls?: boolean;
  /** Retained for callers; all canvas drawers now start closed on every device. */
  collapsePanelsOnMobile?: boolean;
}) {
  const { t } = useT();
  const [localActive, setLocalActive] = useState<'top' | 'bottom' | null>(null);
  const instrumentPanel = useWorkspaceStore(s => s.instrumentPanel);
  const setInstrumentPanel = useWorkspaceStore(s => s.setInstrumentPanel);
  const configOpen = useWorkspaceStore(s => s.configPanelOpen);
  const layerOpen = useWorkspaceStore(s => s.layerPanelOpen);
  const toggleConfig = useWorkspaceStore(s => s.toggleConfigPanel);
  const toggleLayers = useWorkspaceStore(s => s.toggleLayerPanel);
  const active = workspaceControls ? instrumentPanel : localActive;
  const setActive = workspaceControls ? setInstrumentPanel : setLocalActive;
  const frameId = useId();
  const panels = [
    { key: 'top' as const, content: top, title: t('투자·공사', 'Investment & work'), Icon: SlidersHorizontal },
    { key: 'bottom' as const, content: bottom, title: t('에너지', 'Energy'), Icon: BarChart3 },
  ].filter(panel => panel.content != null);

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', className)} data-twin-instrument-frame>
      <nav className="canvas-drawer-launchers" aria-label={t('모델 정보 패널', 'Model information panels')}>
        {panels.map(({ key, title, Icon }) => (
          <Button key={key} type="button" variant="outline" size="sm"
            className="pointer-events-auto gap-1.5 bg-card/95 text-xs shadow-sm backdrop-blur-md"
            aria-label={active === key ? t(`${title} 패널 닫기`, `Close ${title} panel`) : t(`${title} 패널 열기`, `Open ${title} panel`)}
            aria-expanded={active === key} aria-controls={`${frameId}-${key}`}
            data-testid={`twin-panel-${key}-toggle`}
            onClick={() => setActive(active === key ? null : key)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /><span>{title}</span>
          </Button>
        ))}
        {workspaceControls && <>
          <Button variant="outline" size="sm" aria-expanded={configOpen} aria-controls="canvas-config-panel" onClick={toggleConfig} data-testid="canvas-config-toggle">
            <Settings className="h-3.5 w-3.5" aria-hidden="true" /><span>{t('설정', 'Settings')}</span>
          </Button>
          <Button variant="outline" size="sm" aria-expanded={layerOpen} aria-controls="canvas-layer-panel" onClick={toggleLayers} data-testid="canvas-layer-toggle">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" /><span>{t('레이어', 'Layers')}</span>
          </Button>
        </>}
      </nav>
      {panels.map(({ key, content, title }) => (
        <CanvasDrawer key={key} open={active === key} onClose={() => setActive(null)} title={title}
          id={`${frameId}-${key}`} testId={`twin-panel-${key}-content`}>
          {content}
        </CanvasDrawer>
      ))}
    </div>
  );
}
