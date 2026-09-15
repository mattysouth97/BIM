# Retrofit panel

The canvas Work and Energy drawers use full-width vertical sections in Korean and English. Existing mobile bottom-navigation and desktop side-drawer mechanics remain the shared CanvasDrawer responsibility.

## Calculation and evidence contract

- Work shows the chosen package, including an explicit empty selection. Its annual bill difference comes from `useRetrofitScenario().coreResult.bill`, which compares purchased energy before and after the package using visible assumed tariffs. It is not a quote or a calibrated utility bill.
- Energy shows `coreResult.delta` for that same selection: whole-building gross site intensity, primary energy, carbon and grade. PV can reduce purchased energy, primary energy and carbon while leaving gross site demand unchanged.
- Source geometry, assumed envelope/systems, user inputs and measured operating data are distinct. The verification section states when measured consumption is not linked and lists checks before investment.
- Local edits show their actual count and explicitly remain unsaved to the source model; browser persistence is possible.
- Corpus position is visibly unavailable until a qualified comparison exists. No percentile or stock accuracy is invented.
- The optional budget input remains reachable. The obsolete slider and unused default-budget constant are removed.

## Verification status

77 focused unit tests, TypeScript and scoped ESLint passed. Four browser cases verified Korean/English layout at 390 and 1440 px, selected-PV behavior, and no horizontal overflow. Their final Escape-close assertion exposed a shared drawer keyboard issue, assigned to the integration owner; complete runtime acceptance remains pending that correction and rerun.
