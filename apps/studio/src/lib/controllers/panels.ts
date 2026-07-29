import { app } from '../app-state'
import {
  panelCollapseButton,
  railThemesButton,
  railWorkbenchButton,
  themesPanel,
  workbenchPanel,
} from '../dom'

export type PanelId = 'workbench' | 'themes'

/** Panels are mutually exclusive: opening one slides the other away. */
export function setOpenPanel(panel: PanelId | null): void {
  app.openPanel = panel
  document.body.classList.toggle('has-open-panel', panel !== null)
  workbenchPanel.classList.toggle('is-closed', panel !== 'workbench')
  themesPanel.classList.toggle('is-closed', panel !== 'themes')
  railWorkbenchButton.classList.toggle('is-active', panel === 'workbench')
  railThemesButton.classList.toggle('is-active', panel === 'themes')
  panelCollapseButton.setAttribute('aria-expanded', String(panel !== null))
  panelCollapseButton.title = panel === null ? 'Expand panel' : 'Collapse panel'
  panelCollapseButton.setAttribute('aria-label', panelCollapseButton.title)
}

export function togglePanel(panel: PanelId): void {
  setOpenPanel(app.openPanel === panel ? null : panel)
}
