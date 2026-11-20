import App from './App'
import { MenuBarPanel } from './components/menu-bar-panel'
import { renderApp } from './render-app'

const panel =
  new URLSearchParams(window.location.search).get('view') === 'menu-bar'
renderApp(panel ? <MenuBarPanel /> : <App />, { panel })
